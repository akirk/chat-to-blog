/**
 * Chat to Blog Admin JavaScript
 */

(function($) {
	'use strict';

	var { __, _n, sprintf } = wp.i18n;
	var config = window.ctbConfig || {};
	var beeper = new BeeperClient(config.beeperToken);
	var selectedMedia = [];
	var currentChatId = null;
	var currentCursor = null;
	var imageCache = {};
	var importedUrls = new Set(config.importedUrls || []);

	var DEMO_SEEN_KEY = 'ctb_demo_seen_images';
	var DEMO_WHITELIST_KEY = 'ctb_demo_whitelist';

	function demoGetSeen() {
		try { return JSON.parse(localStorage.getItem(DEMO_SEEN_KEY) || '[]'); } catch(e) { return []; }
	}

	function demoGetWhitelist() {
		try { return JSON.parse(localStorage.getItem(DEMO_WHITELIST_KEY) || '[]'); } catch(e) { return []; }
	}

	function demoIsWhitelisted(mxcUrl) {
		return demoGetWhitelist().indexOf(mxcUrl) !== -1;
	}

	function demoRecordSeen(item) {
		if (!config.demoMode || !item.mxcUrl) return;
		var seen = demoGetSeen();
		var exists = seen.some(function(s) { return s.mxcUrl === item.mxcUrl; });
		if (!exists) {
			seen.push({
				mxcUrl:    item.mxcUrl,
				sender:    item.sender || '',
				timestamp: item.timestamp || '',
				type:      item.type || 'img',
			});
			localStorage.setItem(DEMO_SEEN_KEY, JSON.stringify(seen));
		}
	}

	var cumulativeStats = { totalMessages: 0, mediaRendered: 0, skippedTypes: {} };

	// WordPress AJAX helper
	function wpAjax(action, data) {
		return $.ajax({
			url: config.ajaxUrl,
			type: 'POST',
			data: Object.assign({ action: action, nonce: config.nonce }, data)
		});
	}

	var fetchQueue = [];
	var activeFetches = 0;
	var MAX_CONCURRENT_FETCHES = 2;
	var queuePausedUntil = 0;
	var consecutive502s = 0;
	var viewAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;

	// When Beeper's proxy starts returning 502 it usually keeps doing so
	// for a short window. Back off exponentially on consecutive 502s so we
	// don't keep hammering the queue into the ground.
	function notifyFetchOutcome(status) {
		if (status === 502 || status === 503 || status === 504) {
			consecutive502s = Math.min(consecutive502s + 1, 5);
			var backoffMs = Math.min(3000, 400 * Math.pow(2, consecutive502s - 1)); // 400, 800, 1600, 3000, 3000
			queuePausedUntil = Math.max(queuePausedUntil, Date.now() + backoffMs);
		} else if (status >= 200 && status < 300) {
			consecutive502s = 0;
		}
	}

	function abortPendingViewFetches() {
		if (viewAbortController) {
			try { viewAbortController.abort(); } catch (e) {}
			viewAbortController = new AbortController();
		}
		// Drop queued (not-yet-fired) fetches so we don't spend API budget on the old view
		while (fetchQueue.length > 0) {
			var item = fetchQueue.shift();
			try { item.reject(new DOMException('Aborted', 'AbortError')); } catch (e) {}
		}
	}

	function isAbortError(err) {
		if (!err) return false;
		if (err.isTimeout) return false;
		return err.name === 'AbortError' || /aborted/i.test(err.message || '');
	}

	function processFetchQueue() {
		var now = Date.now();
		if (now < queuePausedUntil) {
			setTimeout(processFetchQueue, queuePausedUntil - now);
			return;
		}
		while (activeFetches < MAX_CONCURRENT_FETCHES && fetchQueue.length > 0) {
			var next = fetchQueue.shift();
			activeFetches++;
			Promise.resolve(next.run()).finally(function() {
				activeFetches--;
				processFetchQueue();
			});
		}
	}

	function throttledFetch(url, options) {
		var viewSignal = viewAbortController ? viewAbortController.signal : null;
		var onStart = options && options.onStart;
		var timeoutMs = options && options.timeoutMs;
		var mergedOptions = Object.assign({}, options || {});
		delete mergedOptions.onStart;
		delete mergedOptions.timeoutMs;

		return new Promise(function(resolve, reject) {
			if (viewSignal && viewSignal.aborted) {
				reject(new DOMException('Aborted', 'AbortError'));
				return;
			}

			var perFetchController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
			var timedOut = false;
			var viewAborted = false;
			var timeoutId = null;

			var onViewAbort = function() {
				viewAborted = true;
				if (perFetchController) perFetchController.abort();
			};
			if (viewSignal) viewSignal.addEventListener('abort', onViewAbort);

			var cleanup = function() {
				if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
				if (viewSignal) viewSignal.removeEventListener('abort', onViewAbort);
			};

			var item = {
				reject: function(err) { cleanup(); reject(err); },
				run: function() {
					if (perFetchController && perFetchController.signal.aborted) {
						cleanup();
						reject(new DOMException('Aborted', 'AbortError'));
						return Promise.resolve();
					}
					if (typeof onStart === 'function') {
						try { onStart(); } catch (e) {}
					}

					if (timeoutMs && perFetchController) {
						timeoutId = setTimeout(function() {
							timedOut = true;
							perFetchController.abort();
						}, timeoutMs);
					}

					var fetchOpts = Object.assign({}, mergedOptions);
					if (perFetchController) fetchOpts.signal = perFetchController.signal;

					return fetch(url, fetchOpts)
						.then(function(response) { cleanup(); resolve(response); })
						.catch(function(err) {
							cleanup();
							if (timedOut && !viewAborted) {
								var timeoutErr = new Error('Request timed out after ' + timeoutMs + 'ms');
								timeoutErr.isTimeout = true;
								reject(timeoutErr);
							} else {
								reject(err);
							}
						});
				}
			};

			fetchQueue.push(item);
			processFetchQueue();
		});
	}

	// Parse Beeper error body and turn it into a structured Error whose
	// `.permanent` flag distinguishes "attachment not found" (no point
	// retrying) from transient failures (502 from overload, etc).
	function parseFetchError(response) {
		return response.text().then(function(body) {
			var err = new Error('Media fetch error: ' + response.status);
			err.status = response.status;
			try {
				var parsed = JSON.parse(body);
				err.code = parsed.code;
				err.detail = parsed.message;
				err.permanent = parsed.code === 'SERVE_ASSET_ERROR' &&
					/not found|no longer available/i.test(parsed.message || '');
			} catch (e) {}
			return err;
		}).catch(function() {
			var err = new Error('Media fetch error: ' + response.status);
			err.status = response.status;
			return err;
		}).then(function(err) { throw err; });
	}

	var MEDIA_FETCH_TIMEOUT_MS = 5000;

	function fetchBlob(mediaUrl, onStart) {
		var url = 'http://localhost:23373/v1/assets/serve?url=' + encodeURIComponent(mediaUrl);
		return throttledFetch(url, {
			headers: { 'Authorization': 'Bearer ' + config.beeperToken },
			onStart: onStart,
			timeoutMs: MEDIA_FETCH_TIMEOUT_MS
		}).then(function(response) {
			notifyFetchOutcome(response.status);
			if (!response.ok) return parseFetchError(response);
			return response.blob();
		}).catch(function(err) {
			if (err && err.isTimeout) {
				// Treat a timeout as the same stress signal as a 502 so the
				// queue backs off instead of piling more slow requests on.
				notifyFetchOutcome(502);
			}
			throw err;
		});
	}

	function fetchBlobWithRetry(mediaUrl, retriesLeft, onStart) {
		return fetchBlob(mediaUrl, onStart).catch(function(err) {
			if (retriesLeft > 0 && !err.permanent) {
				return new Promise(function(resolve, reject) {
					setTimeout(function() {
						fetchBlobWithRetry(mediaUrl, retriesLeft - 1, onStart).then(resolve, reject);
					}, 600);
				});
			}
			throw err;
		});
	}

	// Fetch media via Beeper and return as data URL (cached on success).
	// onStart fires when the fetch actually hits the network (past the
	// throttle queue), so callers can show a loading indicator only for
	// images that are really in flight.
	function fetchImageAsDataUrl(mediaUrl, onStart) {
		if (config.demoMode && config.placeholderImage && !demoIsWhitelisted(mediaUrl)) {
			return Promise.resolve(config.placeholderImage);
		}

		if (imageCache[mediaUrl]) {
			return Promise.resolve(imageCache[mediaUrl]);
		}

		return fetchBlobWithRetry(mediaUrl, 1, onStart).then(function(blob) {
			return new Promise(function(resolve) {
				var reader = new FileReader();
				reader.onloadend = function() {
					imageCache[mediaUrl] = reader.result;
					resolve(reader.result);
				};
				reader.readAsDataURL(blob);
			});
		});
	}

	function clearMediaErrorState($item) {
		$item.removeClass('ctb-media-unavailable ctb-media-failed');
		$item.find('.ctb-retry-btn, .ctb-unavailable-overlay').remove();
	}

	function attachMediaErrorState($item, err, onRetry) {
		clearMediaErrorState($item);
		$item.addClass('ctb-media-failed');

		if (err.permanent) {
			$item.addClass('ctb-media-unavailable');
			var title = err.detail || __('Media no longer available on server', 'chat-to-blog');
			$item.append($('<div class="ctb-unavailable-overlay">').attr('title', title).text('🚫'));
		}

		// Always expose a retry button, even on "permanent" errors — the
		// server sometimes reports the asset as gone transiently, so let
		// the user force another attempt rather than giving up silently.
		var $retry = $('<button type="button" class="ctb-retry-btn">')
			.attr('title', err.permanent ? __('Retry anyway', 'chat-to-blog') : __('Retry', 'chat-to-blog'))
			.text('↻');
		$retry.on('click', function(e) {
			e.stopPropagation();
			onRetry();
		});
		$item.append($retry);
	}

	function loadImage($img, mxcUrl) {
		$img.attr('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'); // 1px placeholder
		$img.removeClass('ctb-loading ctb-error');
		var $item = $img.closest('.ctb-media-item, .ctb-selected-thumb');
		clearMediaErrorState($item);

		fetchImageAsDataUrl(mxcUrl, function() {
			$img.addClass('ctb-loading');
		})
			.then(function(dataUrl) {
				$img.attr('src', dataUrl);
				$img.removeClass('ctb-loading');
			})
			.catch(function(err) {
				$img.removeClass('ctb-loading');
				if (isAbortError(err)) return;
				console.warn('Failed to load image:', err);
				$img.addClass('ctb-error');
				attachMediaErrorState($item, err, function() {
					loadImage($img, mxcUrl);
				});
			});
	}

	function loadVideo($video, mxcUrl) {
		if (config.demoMode && config.placeholderImage && !demoIsWhitelisted(mxcUrl)) {
			$video.replaceWith($('<img>').attr({ src: config.placeholderImage, alt: '' }).addClass('ctb-demo-placeholder'));
			return;
		}

		$video.removeClass('ctb-loading ctb-error');
		var $item = $video.closest('.ctb-media-item, .ctb-selected-thumb');
		clearMediaErrorState($item);

		fetchBlobWithRetry(mxcUrl, 1, function() {
			$video.addClass('ctb-loading');
		})
			.then(function(blob) {
				$video.attr('src', URL.createObjectURL(blob));
				$video.removeClass('ctb-loading');
			})
			.catch(function(err) {
				$video.removeClass('ctb-loading');
				if (isAbortError(err)) return;
				console.warn('Failed to load video:', err);
				$video.addClass('ctb-error');
				attachMediaErrorState($item, err, function() {
					loadVideo($video, mxcUrl);
				});
			});
	}

	function showStatus(container, message, isError) {
		var $status = $('<div class="ctb-status">').text(message);
		$status.addClass(isError ? 'ctb-status-error' : 'ctb-status-success');
		$(container).html($status);

		if (!isError) {
			setTimeout(function() { $status.fadeOut(); }, 3000);
		}
	}

	// Settings Page
	$('#ctb-token-form').on('submit', function(e) {
		e.preventDefault();
		var token = $('#ctb-token').val();

		wpAjax('ctb_save_token', { token: token })
			.done(function(response) {
				if (response.success) {
					if (response.data.connected) {
						var message = sprintf(
							/* translators: %d: number of accounts */
							__('Connected! Found %d accounts.', 'chat-to-blog'),
							response.data.accounts
						);
						config.beeperToken = token;

						if (response.data.warning) {
							showStatus('#ctb-token-status', message + ' ' + response.data.warning, true);
						} else if (response.data.serveEndpoint) {
							showStatus('#ctb-token-status', message + ' ' + __('Media streaming supported.', 'chat-to-blog'), false);
						} else {
							showStatus('#ctb-token-status', message, false);
						}
					} else {
						showStatus('#ctb-token-status', __('Token cleared.', 'chat-to-blog'), false);
					}
				} else {
					showStatus('#ctb-token-status', response.data || __('Error saving token', 'chat-to-blog'), true);
				}
			})
			.fail(function() {
				showStatus('#ctb-token-status', __('Request failed', 'chat-to-blog'), true);
			});
	});

	$('#ctb-test-btn').on('click', function() {
		wpAjax('ctb_test_connection', {})
			.done(function(response) {
				if (response.success) {
					var message = sprintf(
						/* translators: 1: number of accounts, 2: network names */
						__('Connected! Found %1$d accounts: %2$s.', 'chat-to-blog'),
						response.data.accounts,
						response.data.networks.join(', ')
					);

					if (response.data.warning) {
						showStatus('#ctb-token-status', message + ' ' + response.data.warning, true);
					} else if (response.data.serveEndpoint) {
						showStatus('#ctb-token-status', message + ' ' + __('Media streaming supported.', 'chat-to-blog'), false);
					} else {
						showStatus('#ctb-token-status', message, false);
					}
				} else {
					showStatus('#ctb-token-status', sprintf(
						/* translators: %s: error message */
						__('Connection failed: %s', 'chat-to-blog'),
						response.data
					), true);
				}
			})
			.fail(function() {
				showStatus('#ctb-token-status', __('Request failed', 'chat-to-blog'), true);
			});
	});

	function probeConnectionBadge() {
		var $badge = $('#ctb-connection-badge');
		if (!$badge.length || !config.beeperToken) return;

		beeper.getAccounts().then(function(result) {
			$badge.removeClass('ctb-badge-success ctb-badge-warning ctb-badge-error');
			if (result.success) {
				$badge.addClass('ctb-badge-success').text(__('Connected', 'chat-to-blog'));
			} else if (result.isConnectionError) {
				$badge.addClass('ctb-badge-error').text(__('Not reachable from this device', 'chat-to-blog'));
			} else {
				$badge.addClass('ctb-badge-warning').text(__('Connection failed', 'chat-to-blog'));
			}
		});
	}

	// Media Browser

	$(document).ready(function() {
		if ($('#ctb-chat-list').length) {
			loadChatList();
			restoreFormatPreference();
		}
		probeConnectionBadge();
	});

	function restoreFormatPreference() {
		var saved = localStorage.getItem('ctb-format');
		if (saved) {
			$('input[name="ctb-format"][value="' + saved + '"]').prop('checked', true);
		}
	}

	$(document).on('change', 'input[name="ctb-format"]', function() {
		localStorage.setItem('ctb-format', $(this).val());
	});

	function loadChatList() {
		$('#ctb-connection-error').hide();
		$('#ctb-main-ui').show();
		$('#ctb-chat-list').html('<span class="spinner is-active"></span> ' + __('Loading chats...', 'chat-to-blog'));

		beeper.getAllChats()
			.then(function(result) {
				if (result.success) {
					renderChatList(result.data.items || []);
				} else if (result.isConnectionError) {
					$('#ctb-main-ui').hide();
					$('#ctb-connection-error').show();
				} else {
					$('#ctb-chat-list').html('<span class="ctb-error">' + sprintf(
						/* translators: %s: error message */
						__('Failed to load chats: %s', 'chat-to-blog'),
						result.error
					) + '</span>');
				}
			});
	}

	$(document).on('click', '#ctb-retry-connection', function() {
		loadChatList();
	});

	function renderChatList(chats) {
		var $list = $('#ctb-chat-list');
		$list.empty();

		if (chats.length === 0) {
			$list.html('<span class="ctb-empty">' + __('No chats found', 'chat-to-blog') + '</span>');
			return;
		}

		chats.forEach(function(chat) {
			var $item = $('<button type="button" class="ctb-chat-pill">')
				.data('chat', chat);

			$item.addClass('no-avatar');
			$item.append($('<span class="ctb-chat-title">').text(chat.title || chat.name || __('Unknown', 'chat-to-blog')));
			$list.append($item);
		});
	}

	$(document).on('click', '.ctb-chat-pill', function() {
		var $item = $(this);
		var chat = $item.data('chat');

		$('.ctb-chat-pill').removeClass('active');
		$item.addClass('active');

		currentChatId = chat.id;
		currentCursor = null;
		selectedMonth = null;
		abortPendingViewFetches();
		$('#ctb-timeline-reset').hide();
		initTimeline(chat.id);
		loadMedia(false);
	});

	$(document).on('click', '.ctb-load-more-tile', function(e) {
		e.preventDefault();
		if ($(this).hasClass('ctb-load-more-tile-loading')) return;
		$(this).addClass('ctb-load-more-tile-loading');
		loadMedia(true);
	});

	var timelineScan = null;
	var monthNames = null;
	var selectedMonth = null;

	function getMonthNames() {
		if (!monthNames) {
			monthNames = [
				__('Jan', 'chat-to-blog'), __('Feb', 'chat-to-blog'), __('Mar', 'chat-to-blog'),
				__('Apr', 'chat-to-blog'), __('May', 'chat-to-blog'), __('Jun', 'chat-to-blog'),
				__('Jul', 'chat-to-blog'), __('Aug', 'chat-to-blog'), __('Sep', 'chat-to-blog'),
				__('Oct', 'chat-to-blog'), __('Nov', 'chat-to-blog'), __('Dec', 'chat-to-blog')
			];
		}
		return monthNames;
	}

	function monthKey(year, month) {
		return year + '-' + (month < 10 ? '0' + month : '' + month);
	}

	function isValidMessageTimestamp(msg) {
		if (!msg || !msg.timestamp) return false;
		var t = new Date(msg.timestamp).getTime();
		if (isNaN(t)) return false;
		// Ignore bogus 0001-01-01-ish timestamps (some chats have outliers
		// from corrupted rows or system events). Matrix/Beeper history
		// doesn't pre-date ~2014, so anything before 2000 is wrong.
		if (new Date(msg.timestamp).getFullYear() < 2000) return false;
		return true;
	}

	var timelineScanController = null;
	var monthLoadController = null;
	var monthLoadToken = 0;

	function initTimeline(chatId) {
		if (timelineScanController) {
			try { timelineScanController.abort(); } catch (e) {}
		}
		timelineScanController = (typeof AbortController !== 'undefined') ? new AbortController() : null;

		timelineScan = {
			chatId: chatId,
			counts: {},
			boundaryCursors: {},
			lastSeenMonth: null,
			lastSortKey: null,
			scannedMessages: 0,
			complete: false
		};

		$('#ctb-timeline').show();
		$('#ctb-timeline-bars').empty();
		renderTimeline(timelineScan);

		startTimelineCountScan(chatId);
	}

	// Fast counts-only scan — walks every message once to fill in the bar
	// chart. Does NOT fetch media; that happens on demand when a month is
	// clicked. This is the only long-running background activity, and its
	// progress is visible in the timeline header.
	async function startTimelineCountScan(chatId) {
		var controller = timelineScanController;
		var signal = controller ? controller.signal : null;
		var scan = timelineScan;
		var cursor = null;
		var maxBatches = 20000;

		$('.ctb-timeline-status').text(__('Scanning history…', 'chat-to-blog'));

		try {
			for (var i = 0; i < maxBatches; i++) {
				if (scan.chatId !== chatId || (signal && signal.aborted)) return;
				var result = await beeper.getChatMessages(chatId, cursor, 'before', 500, signal);
				if (result.aborted || scan.chatId !== chatId) return;
				if (!result.success) {
					$('.ctb-timeline-status').text(result.error);
					return;
				}
				var items = result.data.items || [];
				if (items.length === 0) break;

				var encounteredNewMonth = false;
				for (var j = 0; j < items.length; j++) {
					var msg = items[j];
					scan.scannedMessages++;
					if (!isValidMessageTimestamp(msg)) {
						if (msg.sortKey) scan.lastSortKey = msg.sortKey;
						continue;
					}
					var d = new Date(msg.timestamp);
					var key = monthKey(d.getFullYear(), d.getMonth() + 1);
					if (!(key in scan.counts)) {
						scan.counts[key] = 0;
						encounteredNewMonth = true;
					}
					scan.counts[key]++;
					if (!(key in scan.boundaryCursors)) {
						scan.boundaryCursors[key] = scan.lastSortKey;
					}
					scan.lastSeenMonth = key;
					scan.lastSortKey = msg.sortKey;
				}

				// Only redraw the bar chart when the set of months changes.
				// Count-only updates within existing months are skipped so the
				// main thread stays free for click handlers while the scan runs.
				if (encounteredNewMonth) {
					renderTimeline(scan);
				}
				$('.ctb-timeline-status').text(sprintf(
					/* translators: %d: number of messages scanned so far */
					__('Scanning… %d messages', 'chat-to-blog'),
					scan.scannedMessages
				));

				if (!result.data.hasMore) break;
				var next = items[items.length - 1].sortKey;
				if (next === cursor) break;
				cursor = next;
			}

			if (scan.chatId !== chatId) return;
			scan.complete = true;
			renderTimeline(scan);
			$('.ctb-timeline-status').text(sprintf(
				/* translators: %d: total messages scanned */
				__('Scanned %d messages', 'chat-to-blog'),
				scan.scannedMessages
			));
		} catch (err) {
			if (isAbortError(err)) return;
			$('.ctb-timeline-status').text(err.message || String(err));
		}
	}

	function renderTimeline(scan) {
		const keys = Object.keys(scan.counts).sort();
		if (keys.length === 0) return;

		const firstParts = keys[0].split('-').map(Number);
		const lastParts = keys[keys.length - 1].split('-').map(Number);
		const firstYear = firstParts[0], firstMonth = firstParts[1];
		const lastYear = lastParts[0], lastMonth = lastParts[1];

		const allMonths = [];
		let y = lastYear, m = lastMonth;
		while (y > firstYear || (y === firstYear && m >= firstMonth)) {
			const key = monthKey(y, m);
			allMonths.push({ key: key, year: y, month: m, count: scan.counts[key] || 0 });
			m--;
			if (m < 1) { m = 12; y--; }
		}

		let maxCount = 1;
		allMonths.forEach(function(mo) { if (mo.count > maxCount) maxCount = mo.count; });

		const names = getMonthNames();
		const $bars = $('#ctb-timeline-bars');
		$bars.empty();

		let prevYear = null;
		allMonths.forEach(function(mo) {
			const pct = mo.count > 0 ? Math.max(2, (mo.count / maxCount) * 100) : 0;
			const tooltip = names[mo.month - 1] + ' ' + mo.year + ' · ' + sprintf(
				/* translators: %d: number of messages in a given month */
				_n('%d message', '%d messages', mo.count, 'chat-to-blog'),
				mo.count
			);
			const $bar = $('<button type="button" class="ctb-timeline-bar">')
				.attr('data-year', mo.year)
				.attr('data-month', mo.month)
				.attr('title', tooltip);
			if (selectedMonth && selectedMonth.year === mo.year && selectedMonth.month === mo.month) {
				$bar.addClass('active');
			}
			$bar.append($('<span class="ctb-timeline-bar-fill">').css('height', pct + '%'));
			$bar.append($('<span class="ctb-timeline-bar-month">').text(names[mo.month - 1]));
			if (mo.year !== prevYear) {
				$bar.append($('<span class="ctb-timeline-bar-year">').text(mo.year));
				prevYear = mo.year;
			}
			$bars.append($bar);
		});
	}

	$(document).on('click', '.ctb-timeline-bar', function() {
		if (!currentChatId) return;
		const year = parseInt($(this).attr('data-year'), 10);
		const month = parseInt($(this).attr('data-month'), 10);

		abortPendingViewFetches();
		selectedMonth = { year: year, month: month };
		$('.ctb-timeline-bar').removeClass('active');
		$(this).addClass('active');
		$('#ctb-timeline-reset').show();

		showMonth(year, month);
	});

	$('#ctb-timeline-reset').on('click', function() {
		if (!currentChatId) return;
		abortPendingViewFetches();
		if (monthLoadController) {
			try { monthLoadController.abort(); } catch (e) {}
			monthLoadController = null;
		}
		monthLoadToken++;
		currentCursor = null;
		selectedMonth = null;
		$('.ctb-timeline-bar').removeClass('active');
		$(this).hide();
		loadMedia(false);
	});

	async function showMonth(year, month) {
		if (!currentChatId) return;

		// Cancel any in-flight thumbnail fetches and prior month load.
		abortPendingViewFetches();
		if (monthLoadController) {
			try { monthLoadController.abort(); } catch (e) {}
		}
		monthLoadController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
		var signal = monthLoadController ? monthLoadController.signal : null;
		var myToken = ++monthLoadToken;

		var key = monthKey(year, month);
		var $grid = $('#ctb-media-grid');
		$('#ctb-load-more-wrap').hide();

		var names = getMonthNames();
		$grid.html('<div class="ctb-loading"><span class="spinner is-active"></span> ' +
			sprintf(
				/* translators: 1: month name, 2: year */
				__('Loading %1$s %2$d…', 'chat-to-blog'),
				names[month - 1], year
			) + '</div>');

		var monthStartMs = new Date(year, month - 1, 1).getTime();
		var monthEndMs = new Date(year, month, 0, 23, 59, 59, 999).getTime();
		var cursor = timelineScan && (key in timelineScan.boundaryCursors) ? timelineScan.boundaryCursors[key] : null;
		var totalRendered = 0;
		var maxBatches = 200;

		try {
			for (var i = 0; i < maxBatches; i++) {
				if (myToken !== monthLoadToken) return;
				var result = await beeper.getChatMessages(currentChatId, cursor, 'before', 500, signal);
				if (myToken !== monthLoadToken || result.aborted) return;
				if (!result.success) {
					if (totalRendered === 0) {
						$grid.html('<p class="ctb-empty">' + sprintf(
							/* translators: %s: error message */
							__('Error loading month: %s', 'chat-to-blog'),
							result.error
						) + '</p>');
					}
					return;
				}

				var items = result.data.items || [];
				var reachedOlder = false;
				var newItems = [];
				for (var j = 0; j < items.length; j++) {
					var msg = items[j];
					if (!isValidMessageTimestamp(msg)) continue;
					var ts = new Date(msg.timestamp).getTime();
					if (ts < monthStartMs) { reachedOlder = true; break; }
					if (ts > monthEndMs) continue;
					var attachments = msg.attachments || [];
					for (var k = 0; k < attachments.length; k++) {
						var att = attachments[k];
						if (att.type !== 'img' && att.type !== 'video') continue;
						newItems.push({
							id: att.id,
							mxcUrl: att.id,
							timestamp: msg.timestamp,
							text: msg.text || '',
							sender: msg.senderName || (msg.isSender ? 'You' : 'Unknown'),
							mimeType: att.mimeType,
							fileName: att.fileName,
							sortKey: msg.sortKey,
							type: att.type
						});
					}
				}

				// Append only the new items — don't re-render the whole grid.
				// Re-rendering would detach still-in-flight thumbnails and
				// strand their fetches on orphaned elements.
				if (newItems.length > 0) {
					if (totalRendered === 0) $grid.empty();
					renderMedia(newItems, $grid);
					totalRendered += newItems.length;
				}

				if (reachedOlder) break;
				if (items.length === 0 || !result.data.hasMore) break;
				var next = items[items.length - 1].sortKey;
				if (next === cursor) break;
				cursor = next;
			}

			if (myToken !== monthLoadToken) return;

			if (totalRendered === 0) {
				$grid.html('<p class="ctb-empty">' + __('No media in this month', 'chat-to-blog') + '</p>');
			}
		} catch (err) {
			if (isAbortError(err)) return;
			console.error(err);
			$grid.html('<p class="ctb-empty">' + sprintf(
				/* translators: %s: error message */
				__('Error loading month: %s', 'chat-to-blog'),
				err.message || String(err)
			) + '</p>');
		}
	}

	var loadMediaToken = 0;

	function appendLoadMoreTile($grid) {
		$grid.find('.ctb-load-more-tile').remove();
		$grid.append(
			'<button type="button" class="ctb-load-more-tile">' +
				'<span class="ctb-load-more-tile-icon">+</span>' +
				'<span class="ctb-load-more-tile-label">' + __('Load more', 'chat-to-blog') + '</span>' +
				'<span class="spinner"></span>' +
			'</button>'
		);
	}

	async function loadMedia(append) {
		if (!currentChatId) return;

		var myToken = ++loadMediaToken;
		var $grid = $('#ctb-media-grid');
		var $loadMoreWrap = $('#ctb-load-more-wrap');
		var $stats = $('#ctb-load-stats');

		if (!append) {
			$grid.html('<div class="ctb-loading"><span class="spinner is-active"></span> ' + __('Loading media...', 'chat-to-blog') + '</div>');
			$stats.empty();
			cumulativeStats = { totalMessages: 0, mediaRendered: 0, skippedTypes: {} };
		} else {
			$grid.find('.ctb-load-more-tile').addClass('ctb-load-more-tile-loading');
		}

		try {
			var result = await beeper.getMediaMessages(currentChatId, currentCursor);
			if (myToken !== loadMediaToken) return;
			if (!result.success) {
				if (!append) {
					$grid.html('<p class="ctb-empty">' + sprintf(
						/* translators: %s: error message */
						__('Error loading media: %s', 'chat-to-blog'),
						result.error
					) + '</p>');
				} else {
					$grid.find('.ctb-load-more-tile').removeClass('ctb-load-more-tile-loading');
				}
				return;
			}

			if (!append) {
				$grid.empty();
			} else {
				$grid.find('.ctb-load-more-tile').remove();
			}

			var renderStats = renderMedia(result.data.items, $grid);
			currentCursor = result.data.nextCursor;

			if (result.data.hasMore) {
				appendLoadMoreTile($grid);
			}
			$loadMoreWrap.show();

			if (result.data.stats) {
				cumulativeStats.totalMessages += result.data.stats.totalMessages;
				for (var type in result.data.stats.skippedTypes) {
					cumulativeStats.skippedTypes[type] = (cumulativeStats.skippedTypes[type] || 0) + result.data.stats.skippedTypes[type];
				}
			}
			cumulativeStats.mediaRendered += renderStats.mediaRendered;
			if (renderStats.skippedFileUrls > 0) {
				cumulativeStats.skippedTypes['media unavailable'] = (cumulativeStats.skippedTypes['media unavailable'] || 0) + renderStats.skippedFileUrls;
			}
			renderLoadStats(cumulativeStats, $stats);
		} catch (err) {
			if (isAbortError(err)) return;
			console.error(err);
			if (!append) {
				$grid.html('<p class="ctb-empty">' + sprintf(
					/* translators: %s: error message */
					__('Error loading media: %s', 'chat-to-blog'),
					err.message || String(err)
				) + '</p>');
			} else {
				$grid.find('.ctb-load-more-tile').removeClass('ctb-load-more-tile-loading');
			}
		}
	}

	function renderLoadStats(stats, $container) {
		var $bar = $('#ctb-load-stats-bar');
		$container.empty();
		$bar.empty();

		if (stats.totalMessages === 0) return;

		var textCount = stats.skippedTypes['text'] || 0;
		var unavailableCount = stats.skippedTypes['media unavailable'] || 0;
		var otherCount = 0;
		for (var type in stats.skippedTypes) {
			if (type !== 'text' && type !== 'media unavailable') {
				otherCount += stats.skippedTypes[type];
			}
		}

		var mediaCount = stats.mediaRendered;
		var total = mediaCount + textCount + unavailableCount + otherCount;

		if (total === 0) return;

		var segments = [
			{ count: mediaCount, cls: 'ctb-bar-media', label: __('media', 'chat-to-blog'), color: '#2271b1' },
			{ count: textCount, cls: 'ctb-bar-text', label: __('text', 'chat-to-blog'), color: '#b0b0b0' },
			{ count: unavailableCount, cls: 'ctb-bar-unavailable', label: __('unavailable', 'chat-to-blog'), color: '#d63638' },
			{ count: otherCount, cls: 'ctb-bar-other', label: __('other', 'chat-to-blog'), color: '#dba617' }
		];

		segments.forEach(function(seg) {
			if (seg.count > 0) {
				var pct = (seg.count / total * 100).toFixed(1);
				$bar.append($('<span>').addClass(seg.cls).css('width', pct + '%'));

				$container.append(
					$('<span class="ctb-stat-item">').append(
						$('<span class="ctb-stat-dot">').css('background', seg.color),
						$('<span>').text(seg.count + ' ' + seg.label)
					)
				);
			}
		});
	}

	function renderMedia(items, $container) {
		$container.find('.ctb-empty').remove();

		var stats = { skippedFileUrls: 0, mediaRendered: 0 };

		if (items.length === 0 && $container.children().length === 0) {
			$container.html('<p class="ctb-empty">' + __('No media found in this chat', 'chat-to-blog') + '</p>');
			return stats;
		}

		items.forEach(function(item) {
			var mxcUrl = item.mxcUrl;
			if (!mxcUrl) {
				return;
			}
			if (mxcUrl.indexOf('localmxc://') !== 0 && mxcUrl.indexOf('mxc://') !== 0 && mxcUrl.indexOf('file://') !== 0) {
				stats.skippedFileUrls++;
				return;
			}

			stats.mediaRendered++;

			demoRecordSeen(item);

			var isVideo = item.type === 'video' || (item.mimeType && item.mimeType.indexOf('video/') === 0);
			var $item = $('<div class="ctb-media-item">').data('media', item);

			if (isVideo) {
				$item.addClass('ctb-media-video');
			}

			var useVideoTag = isVideo && !item.thumbnailUrl;

			if (useVideoTag) {
				var $video = $('<video muted preload="metadata">').attr('alt', '');
				$item.append($video);
				loadVideo($video, mxcUrl);
			} else {
				var $img = $('<img>').attr('alt', '');
				$item.append($img);
				var thumbnailUrl = isVideo && item.thumbnailUrl ? item.thumbnailUrl : mxcUrl;
				loadImage($img, thumbnailUrl);
			}

			$item.append('<button type="button" class="ctb-preview-btn" title="' + __('Preview', 'chat-to-blog') + '">&#9974;</button>');

			if (isVideo) {
				$item.append('<div class="ctb-video-badge">VIDEO</div>');
			}

			var isSelected = selectedMedia.some(function(m) { return m.id === item.id; });
			if (isSelected) {
				$item.addClass('selected');
			}

			if (importedUrls.has(mxcUrl)) {
				$item.addClass('imported');
			}

			if (item.timestamp) {
				var date = new Date(item.timestamp);
				$item.append('<div class="ctb-media-date">' + date.toLocaleDateString() + '</div>');
			}

			$container.append($item);
		});

		return stats;
	}

	// Click on media item to add to selection
	$(document).on('click', '.ctb-media-item', function() {
		var $item = $(this);
		if ($item.hasClass('ctb-media-failed')) return;
		var media = $item.data('media');

		var existingIndex = -1;
		selectedMedia.forEach(function(m, i) {
			if (m.id === media.id) existingIndex = i;
		});

		if (existingIndex >= 0) {
			selectedMedia.splice(existingIndex, 1);
			$item.removeClass('selected');

			if (media.text && media.text.trim()) {
				var text = media.text.trim();
				if ($('#ctb-post-title').val().trim() === text) {
					$('#ctb-post-title').val('');
				}
				if ($('#ctb-post-content').val().trim() === text) {
					$('#ctb-post-content').val('');
				}
			}
		} else {
			selectedMedia.push(media);
			$item.addClass('selected');

			// Auto-fill title or content from media text
			if (media.text && media.text.trim()) {
				var text = media.text.trim();
				var $title = $('#ctb-post-title');
				var $content = $('#ctb-post-content');

				if (text.length <= 60 && !$title.val().trim()) {
					$title.val(text);
					updateButtonState();
				} else if (text.length > 60 && !$content.val().trim()) {
					$content.val(text);
				}
			}
		}

		updateSelectedPanel();
	});

	function updateSelectedPanel() {
		var $container = $('#ctb-selected-images');
		$container.empty();

		if (selectedMedia.length === 0) {
			$container.html('<p class="ctb-hint">' + __('Select images from the left to add them here', 'chat-to-blog') + '</p>');
			$('#ctb-save-draft, #ctb-publish').prop('disabled', true);
			$('#ctb-post-date').val('');
			return;
		}

		var $grid = $('<div class="ctb-selected-grid">');
		var earliestDate = null;

		selectedMedia.forEach(function(item) {
			var isVideo = item.type === 'video' || (item.mimeType && item.mimeType.indexOf('video/') === 0);
			var $thumb = $('<div class="ctb-selected-thumb">').data('media', item);

			if (isVideo) {
				$thumb.addClass('ctb-selected-video');
			}

			var useVideoTag = isVideo && !item.thumbnailUrl;

			if (useVideoTag) {
				var $video = $('<video muted preload="metadata">');
				$thumb.append($video);
				loadVideo($video, item.mxcUrl);
			} else {
				var $img = $('<img>');
				$thumb.append($img);
				var thumbnailUrl = isVideo && item.thumbnailUrl ? item.thumbnailUrl : item.mxcUrl;
				loadImage($img, thumbnailUrl);
			}

			if (isVideo) {
				$thumb.append('<div class="ctb-video-badge">VIDEO</div>');
			}

			$thumb.append('<button type="button" class="ctb-preview-btn" title="' + __('Preview', 'chat-to-blog') + '">&#9974;</button>');
			$thumb.append('<button type="button" class="ctb-remove-selected">&times;</button>');
			$grid.append($thumb);

			if (item.timestamp) {
				var itemDate = new Date(item.timestamp);
				if (!earliestDate || itemDate < earliestDate) {
					earliestDate = itemDate;
				}
			}
		});
		$container.append($grid);

		new Sortable($grid[0], {
			animation: 150,
			ghostClass: 'ctb-sortable-ghost',
			onEnd: function(evt) {
				var item = selectedMedia.splice(evt.oldIndex, 1)[0];
				selectedMedia.splice(evt.newIndex, 0, item);
			}
		});

		if (earliestDate) {
			var localDate = new Date(earliestDate.getTime() - earliestDate.getTimezoneOffset() * 60000);
			$('#ctb-post-date').val(localDate.toISOString().slice(0, 16));
		}

		updateButtonState();
	}

	$(document).on('click', '.ctb-remove-selected', function(e) {
		e.stopPropagation();
		var $thumb = $(this).closest('.ctb-selected-thumb');
		var index = $thumb.index();
		var removed = selectedMedia.splice(index, 1)[0];

		if (removed.text && removed.text.trim()) {
			var text = removed.text.trim();
			if ($('#ctb-post-title').val().trim() === text) {
				$('#ctb-post-title').val('');
			}
			if ($('#ctb-post-content').val().trim() === text) {
				$('#ctb-post-content').val('');
			}
		}

		$('.ctb-media-item').each(function() {
			if ($(this).data('media').id === removed.id) {
				$(this).removeClass('selected');
			}
		});

		updateSelectedPanel();
	});

	$('#ctb-post-title').on('input', updateButtonState);

	$('#ctb-post-title').on('keypress', function(e) {
		if (e.which === 13) {
			e.preventDefault();
			if (!$('#ctb-publish').prop('disabled')) {
				$('#ctb-publish').click();
			}
		}
	});

	$('#ctb-date-now').on('click', function(e) {
		e.preventDefault();
		var now = new Date();
		var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
		$('#ctb-post-date').val(local.toISOString().slice(0, 16));
	});

	function updateButtonState() {
		var hasTitle = $('#ctb-post-title').val().trim().length > 0;
		var hasImages = selectedMedia.length > 0;
		$('#ctb-save-draft, #ctb-publish').prop('disabled', !(hasTitle && hasImages));
	}

	function resetPostPanel() {
		selectedMedia = [];
		$('#ctb-panel-title').text(__('New Post', 'chat-to-blog'));
		$('#ctb-post-title').val('');
		$('#ctb-post-content').val('');
		$('#ctb-post-date').val('');
		$('#ctb-post-category').val('');
		$('#ctb-post-status').empty();
		$('#ctb-save-draft').prop('disabled', true);
		$('#ctb-publish').prop('disabled', true);
		updateSelectedPanel();
		$('.ctb-media-item').removeClass('selected');
	}

	$('#ctb-save-draft').on('click', function() { createPost('draft'); });
	$('#ctb-publish').on('click', function() { createPost('publish'); });

	// Lightbox functionality
	var $lightbox = null;
	var lightboxItems = [];
	var lightboxIndex = 0;

	function createLightbox() {
		if ($lightbox) return;

		$lightbox = $('<div class="ctb-lightbox">' +
			'<button class="ctb-lightbox-close" type="button">&times;</button>' +
			'<button class="ctb-lightbox-nav ctb-lightbox-prev" type="button">&#8249;</button>' +
			'<div class="ctb-lightbox-content"></div>' +
			'<button class="ctb-lightbox-nav ctb-lightbox-next" type="button">&#8250;</button>' +
			'<div class="ctb-lightbox-info"></div>' +
			'<div class="ctb-lightbox-hint">' + __('Click to select · Arrow keys to navigate · Esc to close', 'chat-to-blog') + '</div>' +
			'</div>');

		$('body').append($lightbox);

		$lightbox.on('click', function(e) {
			if ($(e.target).hasClass('ctb-lightbox')) {
				closeLightbox();
			}
		});

		$lightbox.find('.ctb-lightbox-close').on('click', closeLightbox);
		$lightbox.find('.ctb-lightbox-prev').on('click', function() { navigateLightbox(-1); });
		$lightbox.find('.ctb-lightbox-next').on('click', function() { navigateLightbox(1); });

		$lightbox.find('.ctb-lightbox-content').on('click', function() {
			if (lightboxItems[lightboxIndex]) {
				var media = lightboxItems[lightboxIndex];
				var $mediaItem = $('.ctb-media-item').filter(function() {
					return $(this).data('media').id === media.id;
				});
				if ($mediaItem.length) {
					$mediaItem.trigger('click');
					updateLightboxInfo();
				}
			}
		});
	}

	function openLightbox(mediaItem) {
		createLightbox();

		lightboxItems = [];
		$('.ctb-media-item').each(function() {
			lightboxItems.push($(this).data('media'));
		});

		lightboxIndex = lightboxItems.findIndex(function(item) {
			return item.id === mediaItem.id;
		});

		if (lightboxIndex === -1) lightboxIndex = 0;

		showLightboxMedia();
		$lightbox.addClass('active');
		$(document).on('keydown.lightbox', handleLightboxKeydown);
	}

	function closeLightbox() {
		if (!$lightbox) return;
		$lightbox.removeClass('active');
		$lightbox.find('.ctb-lightbox-content').empty();
		$(document).off('keydown.lightbox');
	}

	function navigateLightbox(direction) {
		var newIndex = lightboxIndex + direction;
		if (newIndex >= 0 && newIndex < lightboxItems.length) {
			lightboxIndex = newIndex;
			showLightboxMedia();
		}
	}

	function showLightboxMedia() {
		if (!lightboxItems[lightboxIndex]) return;

		var item = lightboxItems[lightboxIndex];
		var $content = $lightbox.find('.ctb-lightbox-content');
		$content.empty();

		var isVideo = item.type === 'video' || (item.mimeType && item.mimeType.indexOf('video/') === 0);

		if (isVideo) {
			var $video = $('<video controls autoplay>');
			$content.append($video);

			fetchImageAsDataUrl(item.mxcUrl).then(function(dataUrl) {
				$video.attr('src', dataUrl);
			});
		} else {
			var $img = $('<img>').attr('alt', '');
			$content.append($img);

			var mxcUrl = item.mxcUrl;
			if (imageCache[mxcUrl]) {
				$img.attr('src', imageCache[mxcUrl]);
			} else {
				$img.attr('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
				fetchImageAsDataUrl(mxcUrl).then(function(dataUrl) {
					$img.attr('src', dataUrl);
				});
			}
		}

		$lightbox.find('.ctb-lightbox-prev').prop('disabled', lightboxIndex === 0);
		$lightbox.find('.ctb-lightbox-next').prop('disabled', lightboxIndex === lightboxItems.length - 1);

		updateLightboxInfo();
	}

	function updateLightboxInfo() {
		var item = lightboxItems[lightboxIndex];
		var info = (lightboxIndex + 1) + ' / ' + lightboxItems.length;

		var isSelected = selectedMedia.some(function(m) { return m.id === item.id; });
		if (isSelected) {
			info += ' · ' + __('Selected', 'chat-to-blog');
		}

		if (item.timestamp) {
			var date = new Date(item.timestamp);
			info += ' · ' + date.toLocaleDateString();
		}

		$lightbox.find('.ctb-lightbox-info').text(info);
	}

	function handleLightboxKeydown(e) {
		if (e.key === 'Escape') {
			closeLightbox();
		} else if (e.key === 'ArrowLeft') {
			navigateLightbox(-1);
		} else if (e.key === 'ArrowRight') {
			navigateLightbox(1);
		} else if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			if (lightboxItems[lightboxIndex]) {
				var media = lightboxItems[lightboxIndex];
				var $mediaItem = $('.ctb-media-item').filter(function() {
					return $(this).data('media').id === media.id;
				});
				if ($mediaItem.length) {
					$mediaItem.trigger('click');
					updateLightboxInfo();
				}
			}
		}
	}

	$(document).on('dblclick', '.ctb-media-item', function(e) {
		e.preventDefault();
		e.stopPropagation();
		var media = $(this).data('media');
		openLightbox(media);
	});

	$(document).on('click', '.ctb-preview-btn', function(e) {
		e.preventDefault();
		e.stopPropagation();
		var $mediaItem = $(this).closest('.ctb-media-item');
		var $selectedThumb = $(this).closest('.ctb-selected-thumb');

		if ($mediaItem.length) {
			openLightbox($mediaItem.data('media'));
		} else if ($selectedThumb.length) {
			openLightboxForSelected($selectedThumb.data('media'));
		}
	});

	$(document).on('dblclick', '.ctb-selected-thumb', function(e) {
		e.preventDefault();
		e.stopPropagation();
		var media = $(this).data('media');
		if (media) {
			openLightboxForSelected(media);
		}
	});

	function openLightboxForSelected(mediaItem) {
		createLightbox();

		lightboxItems = selectedMedia.slice();
		lightboxIndex = lightboxItems.findIndex(function(item) {
			return item.id === mediaItem.id;
		});

		if (lightboxIndex === -1) lightboxIndex = 0;

		showLightboxMedia();
		$lightbox.addClass('active');
		$(document).on('keydown.lightbox', handleLightboxKeydown);
	}

	function renderCollapsedEditPanels(panels) {
		$('.ctb-edit-panel-collapsed').remove();
		panels.forEach(function(panel) {
			var $el = $('<div class="ctb-panel ctb-edit-panel-collapsed">' +
				'<div class="ctb-panel-header">' +
				'<h3>' + $('<div>').text(panel.title).html() + '</h3>' +
				'<span class="ctb-collapsed-links">' +
				'<a href="' + panel.editUrl + '" target="_blank">' + __('Edit', 'chat-to-blog') + '</a> · ' +
				'<a href="' + panel.viewUrl + '" target="_blank">' + __('View', 'chat-to-blog') + '</a>' +
				'</span>' +
				'</div></div>');
			$('.ctb-column-right').append($el);
		});
	}

	function createPost(status) {
		var title = $('#ctb-post-title').val().trim();
		var content = $('#ctb-post-content').val().trim();
		var format = $('input[name="ctb-format"]:checked').val();
		var postDate = $('#ctb-post-date').val();
		var category = $('#ctb-post-category').val() || '';

		if (!title || selectedMedia.length === 0) return;

		$('#ctb-save-draft, #ctb-publish').prop('disabled', true);
		$('#ctb-post-status').html('<div class="ctb-importing">' + __('Fetching media...', 'chat-to-blog') + '</div>');

		var imagePromises = selectedMedia.map(function(item) {
			if (imageCache[item.mxcUrl]) {
				return Promise.resolve({
					mxcUrl: item.mxcUrl,
					dataUrl: imageCache[item.mxcUrl],
					mimeType: item.mimeType,
					fileName: item.fileName
				});
			}
			return fetchImageAsDataUrl(item.mxcUrl).then(function(dataUrl) {
				return {
					mxcUrl: item.mxcUrl,
					dataUrl: dataUrl,
					mimeType: item.mimeType,
					fileName: item.fileName
				};
			});
		});

		var submitPromise = Promise.all(imagePromises).then(function(images) {
			$('#ctb-post-status').html('<div class="ctb-importing">' + __('Creating post...', 'chat-to-blog') + '</div>');

			return wpAjax('ctb_create_post', {
				title: title,
				content: content,
				format: format,
				status: status,
				post_date: postDate,
				category: category,
				images: JSON.stringify(images),
				chat_id: currentChatId
			});
		});

		submitPromise
			.then(function(response) {
				if (response.success) {
					var postTitle = $('#ctb-post-title').val().trim();
					var imageCount = selectedMedia.length;
					var statusText = status === 'publish' ? __('Published', 'chat-to-blog') : __('Saved as draft', 'chat-to-blog');
					if (imageCount > 0) {
						statusText += ' ' + sprintf(
							/* translators: %d: number of images */
							_n('with %d image.', 'with %d images.', imageCount, 'chat-to-blog'),
							imageCount
						);
					}

					if (response.data.images) {
						response.data.images.forEach(function(img) {
							importedUrls.add(img.mxcUrl);
							$('.ctb-media-item').each(function() {
								if ($(this).data('media').mxcUrl === img.mxcUrl) {
									$(this).addClass('imported');
								}
							});
						});
					}

					var editPanels = $('.ctb-column-right').data('editPanels') || [];
					editPanels.unshift({
						postId: response.data.post_id,
						title: postTitle,
						editUrl: response.data.edit_url,
						viewUrl: response.data.view_url
					});
					$('.ctb-column-right').data('editPanels', editPanels);

					resetPostPanel();
					restoreFormatPreference();
					renderCollapsedEditPanels(editPanels);

					$('#ctb-post-status').html(
						'<div class="ctb-status ctb-status-success">' +
						statusText + ' ' +
						'<a href="' + response.data.edit_url + '" target="_blank">' + __('Edit', 'chat-to-blog') + '</a> · ' +
						'<a href="' + response.data.view_url + '" target="_blank">' + __('View', 'chat-to-blog') + '</a>' +
						'</div>'
					);
				} else {
					throw new Error(response.data);
				}
			})
			.catch(function(err) {
				$('#ctb-post-status').html('<div class="ctb-status ctb-status-error">' + sprintf(
					/* translators: %s: error message */
					__('Error: %s', 'chat-to-blog'),
					err.message
				) + '</div>');
				updateButtonState();
			});
	}

})(jQuery);
