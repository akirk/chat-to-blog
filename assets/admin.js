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
	var cumulativeStats = { totalMessages: 0, mediaRendered: 0, skippedTypes: {} };

	// WordPress AJAX helper
	function wpAjax(action, data) {
		return $.ajax({
			url: config.ajaxUrl,
			type: 'POST',
			data: Object.assign({ action: action, nonce: config.nonce }, data)
		});
	}

	// Fetch image bytes from local media server and return as data URL
	function fetchImageAsDataUrl(mxcUrl) {
		if (imageCache[mxcUrl]) {
			return Promise.resolve(imageCache[mxcUrl]);
		}

		var url = config.mediaServerUrl + '?id=' + encodeURIComponent(mxcUrl) + '&token=' + encodeURIComponent(config.beeperToken);

		return fetch(url)
			.then(function(response) {
				if (!response.ok) throw new Error('Media server error: ' + response.status);
				return response.blob();
			})
			.then(function(blob) {
				return new Promise(function(resolve) {
					var reader = new FileReader();
					reader.onloadend = function() {
						imageCache[mxcUrl] = reader.result;
						resolve(reader.result);
					};
					reader.readAsDataURL(blob);
				});
			});
	}

	// Load image into an img element
	function loadImage($img, mxcUrl) {
		$img.attr('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'); // 1px placeholder
		$img.addClass('ctb-loading');

		fetchImageAsDataUrl(mxcUrl)
			.then(function(dataUrl) {
				$img.attr('src', dataUrl);
				$img.removeClass('ctb-loading');
			})
			.catch(function(err) {
				console.error('Failed to load image:', err);
				$img.addClass('ctb-error');
				$img.removeClass('ctb-loading');
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
						showStatus('#ctb-token-status', sprintf(
							/* translators: %d: number of accounts */
							__('Connected! Found %d account(s).', 'chat-to-blog'),
							response.data.accounts
						), false);
						config.beeperToken = token;
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
					showStatus('#ctb-token-status', sprintf(
						/* translators: 1: number of accounts, 2: network names */
						__('Connected! Found %1$d account(s) (%2$s)', 'chat-to-blog'),
						response.data.accounts,
						response.data.networks.join(', ')
					), false);
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

	// Server Settings
	function testLocalServer(serverUrl) {
		return fetch(serverUrl + '?health', { mode: 'cors' })
			.then(function(response) {
				if (!response.ok) throw new Error('Server returned ' + response.status);
				return response.json();
			})
			.then(function(data) { return data.status === 'ok'; })
			.catch(function() { return false; });
	}

	$('#ctb-test-local-server').on('click', function() {
		var serverUrl = $('#ctb-local-server-url').val() || 'http://localhost:8787';
		showStatus('#ctb-server-status', __('Testing connection...', 'chat-to-blog'), false);

		testLocalServer(serverUrl).then(function(ok) {
			if (ok) {
				showStatus('#ctb-server-status', __('Local server is reachable!', 'chat-to-blog'), false);
			} else {
				showStatus('#ctb-server-status', __('Cannot reach local server. Is it running?', 'chat-to-blog'), true);
			}
		});
	});

	$('#ctb-server-form').on('submit', function(e) {
		e.preventDefault();
		var localServerUrl = $('#ctb-local-server-url').val() || 'http://localhost:8787';

		wpAjax('ctb_save_server_settings', {
			local_server_url: localServerUrl
		})
			.done(function(response) {
				if (response.success) {
					config.mediaServerUrl = localServerUrl;
					showStatus('#ctb-server-status', __('Settings saved.', 'chat-to-blog'), false);
				} else {
					showStatus('#ctb-server-status', response.data || __('Error saving settings', 'chat-to-blog'), true);
				}
			})
			.fail(function() {
				showStatus('#ctb-server-status', __('Request failed', 'chat-to-blog'), true);
			});
	});

	// Media Browser

	$(document).ready(function() {
		if ($('#ctb-chat-list').length) {
			loadChatList();
			checkMediaServer();
			restoreFormatPreference();
		}
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

	function checkMediaServer() {
		var $serverStatus = $('#ctb-local-server-status');
		if ($serverStatus.length && config.mediaServerUrl) {
			testLocalServer(config.mediaServerUrl).then(function(ok) {
				$serverStatus
					.removeClass('ctb-status-checking')
					.addClass(ok ? 'ctb-status-ok' : 'ctb-status-error');
				$serverStatus.find('.ctb-server-status-text').text(
					ok ? __('Local server connected', 'chat-to-blog') : __('Local server offline', 'chat-to-blog')
				);
				if (!ok) {
					$serverStatus.attr('title', 'Start with: php -S localhost:8787 local-media-server.php');
				}
			});
		}
	}

	function loadChatList() {
		beeper.getAllChats()
			.then(function(result) {
				if (result.success) {
					renderChatList(result.data.items || []);
				} else {
					$('#ctb-chat-list').html('<span class="ctb-error">' + sprintf(
						/* translators: %s: error message */
						__('Failed to load chats: %s', 'chat-to-blog'),
						result.error
					) + '</span>');
				}
			});
	}

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
		loadMedia(false);
	});

	$('#ctb-load-more').on('click', function() {
		loadMedia(true);
	});

	function loadMedia(append) {
		if (!currentChatId) return;

		var $grid = $('#ctb-media-grid');
		var $loadMore = $('#ctb-load-more-wrap');
		var $spinner = $loadMore.find('.spinner');
		var $stats = $('#ctb-load-stats');

		if (!append) {
			$grid.html('<div class="ctb-loading"><span class="spinner is-active"></span> ' + __('Loading media...', 'chat-to-blog') + '</div>');
			$stats.empty();
			cumulativeStats = { totalMessages: 0, mediaRendered: 0, skippedTypes: {} };
		}
		$spinner.addClass('is-active');

		beeper.getMediaMessages(currentChatId, currentCursor)
			.then(function(result) {
				if (!result.success) {
					if (!append) {
						$grid.html('<p class="ctb-empty">' + sprintf(
							/* translators: %s: error message */
							__('Error loading media: %s', 'chat-to-blog'),
							result.error
						) + '</p>');
					}
					return;
				}

				if (!append) {
					$grid.empty();
				}

				var renderStats = renderMedia(result.data.items, $grid);
				currentCursor = result.data.nextCursor;
				$loadMore.toggle(result.data.hasMore);

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
			})
			.finally(function() {
				$spinner.removeClass('is-active');
			});
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
			if (mxcUrl.indexOf('localmxc://') !== 0 && mxcUrl.indexOf('mxc://') !== 0) {
				stats.skippedFileUrls++;
				return;
			}

			stats.mediaRendered++;

			var isVideo = item.type === 'video' || (item.mimeType && item.mimeType.indexOf('video/') === 0);
			var $item = $('<div class="ctb-media-item">').data('media', item);

			if (isVideo) {
				$item.addClass('ctb-media-video');
			}

			var $img = $('<img>').attr('alt', '');
			$item.append($img);
			$item.append('<button type="button" class="ctb-preview-btn" title="' + __('Preview', 'chat-to-blog') + '">&#9974;</button>');

			if (isVideo) {
				$item.append('<div class="ctb-video-badge">VIDEO</div>');
			}

			var thumbnailUrl = isVideo && item.thumbnailUrl ? item.thumbnailUrl : mxcUrl;
			loadImage($img, thumbnailUrl);

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

			var $img = $('<img>');
			$thumb.append($img);

			if (isVideo) {
				$thumb.append('<div class="ctb-video-badge">VIDEO</div>');
			}

			$thumb.append('<button type="button" class="ctb-remove-selected">&times;</button>');
			$grid.append($thumb);

			var thumbnailUrl = isVideo && item.thumbnailUrl ? item.thumbnailUrl : item.mxcUrl;
			loadImage($img, thumbnailUrl);

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
		var media = $(this).closest('.ctb-media-item').data('media');
		openLightbox(media);
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
					dataUrl: imageCache[item.mxcUrl]
				});
			}
			return fetchImageAsDataUrl(item.mxcUrl).then(function(dataUrl) {
				return { mxcUrl: item.mxcUrl, dataUrl: dataUrl };
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
