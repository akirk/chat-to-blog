/**
 * Chat to Blog Admin JavaScript
 */

(function($) {
	'use strict';

	var config = window.ctbConfig || {};
	var beeper = new BeeperClient(config.beeperToken);
	var selectedMedia = [];
	var currentChatId = null;
	var currentCursor = null;
	var currentPostId = null;
	var imageCache = {}; // Cache for loaded data URLs

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
						showStatus('#ctb-token-status', 'Connected! Found ' + response.data.accounts + ' account(s).', false);
						config.beeperToken = token;
					} else {
						showStatus('#ctb-token-status', 'Token cleared.', false);
					}
				} else {
					showStatus('#ctb-token-status', response.data || 'Error saving token', true);
				}
			})
			.fail(function() {
				showStatus('#ctb-token-status', 'Request failed', true);
			});
	});

	$('#ctb-test-btn').on('click', function() {
		wpAjax('ctb_test_connection', {})
			.done(function(response) {
				if (response.success) {
					showStatus('#ctb-token-status', 'Connected! Found ' + response.data.accounts + ' account(s) (' + response.data.networks.join(', ') + ')', false);
				} else {
					showStatus('#ctb-token-status', 'Connection failed: ' + response.data, true);
				}
			})
			.fail(function() {
				showStatus('#ctb-token-status', 'Request failed', true);
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
		showStatus('#ctb-server-status', 'Testing connection...', false);

		testLocalServer(serverUrl).then(function(ok) {
			if (ok) {
				showStatus('#ctb-server-status', 'Local server is reachable!', false);
			} else {
				showStatus('#ctb-server-status', 'Cannot reach local server. Is it running?', true);
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
					showStatus('#ctb-server-status', 'Settings saved.', false);
				} else {
					showStatus('#ctb-server-status', response.data || 'Error saving settings', true);
				}
			})
			.fail(function() {
				showStatus('#ctb-server-status', 'Request failed', true);
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
					ok ? 'Local server connected' : 'Local server offline'
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
					$('#ctb-chat-list').html('<span class="ctb-error">Failed to load chats: ' + result.error + '</span>');
				}
			});
	}

	function renderChatList(chats) {
		var $list = $('#ctb-chat-list');
		$list.empty();

		if (chats.length === 0) {
			$list.html('<span class="ctb-empty">No chats found</span>');
			return;
		}

		chats.forEach(function(chat) {
			var $item = $('<button type="button" class="ctb-chat-pill">')
				.data('chat', chat);

			// Skip avatar for now - would need async loading
			$item.addClass('no-avatar');
			$item.append($('<span class="ctb-chat-title">').text(chat.title || chat.name || 'Unknown'));
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

		if (!append) {
			$grid.html('<div class="ctb-loading"><span class="spinner is-active"></span> Loading media...</div>');
		}
		$spinner.addClass('is-active');

		beeper.getMediaMessages(currentChatId, 50, currentCursor)
			.then(function(result) {
				if (!result.success) {
					if (!append) {
						$grid.html('<p class="ctb-empty">Error loading media: ' + result.error + '</p>');
					}
					return;
				}

				if (!append) {
					$grid.empty();
				}

				renderMedia(result.data.items, $grid);
				currentCursor = result.data.nextCursor;
				$loadMore.toggle(result.data.hasMore);
			})
			.finally(function() {
				$spinner.removeClass('is-active');
			});
	}

	function renderMedia(items, $container) {
		if (items.length === 0 && $container.children().length === 0) {
			$container.html('<p class="ctb-empty">No media found in this chat</p>');
			return;
		}

		items.forEach(function(item) {
			var mxcUrl = item.mxcUrl;
			if (!mxcUrl || (mxcUrl.indexOf('localmxc://') !== 0 && mxcUrl.indexOf('mxc://') !== 0)) {
				return;
			}

			var $item = $('<div class="ctb-media-item">').data('media', item);
			var $img = $('<img>').attr('alt', '');
			$item.append($img);

			loadImage($img, mxcUrl);

			var isSelected = selectedMedia.some(function(m) { return m.id === item.id; });
			if (isSelected) {
				$item.addClass('selected');
			}

			if (item.timestamp) {
				var date = new Date(item.timestamp);
				$item.append('<div class="ctb-media-date">' + date.toLocaleDateString() + '</div>');
			}

			$container.append($item);
		});
	}

	// Click on media item to add to selection
	$(document).on('click', '.ctb-media-item', function() {
		var $item = $(this);
		var media = $item.data('media');

		if (currentPostId && selectedMedia.length === 0) {
			resetPostPanel();
		}

		var existingIndex = -1;
		selectedMedia.forEach(function(m, i) {
			if (m.id === media.id) existingIndex = i;
		});

		if (existingIndex >= 0) {
			selectedMedia.splice(existingIndex, 1);
			$item.removeClass('selected');
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
			$container.html('<p class="ctb-hint">Select images from the left to add them here</p>');
			$('#ctb-save-draft, #ctb-publish').prop('disabled', true);
			$('#ctb-post-date').val('');
			return;
		}

		var $grid = $('<div class="ctb-selected-grid">');
		var earliestDate = null;

		selectedMedia.forEach(function(item, index) {
			var $thumb = $('<div class="ctb-selected-thumb">').data('index', index);
			var $img = $('<img>');
			$thumb.append($img);
			$thumb.append('<button type="button" class="ctb-remove-selected">&times;</button>');
			$grid.append($thumb);

			// Load image
			loadImage($img, item.mxcUrl);

			if (item.timestamp) {
				var itemDate = new Date(item.timestamp);
				if (!earliestDate || itemDate < earliestDate) {
					earliestDate = itemDate;
				}
			}
		});
		$container.append($grid);

		if (earliestDate) {
			var localDate = new Date(earliestDate.getTime() - earliestDate.getTimezoneOffset() * 60000);
			$('#ctb-post-date').val(localDate.toISOString().slice(0, 16));
		}

		updateButtonState();
	}

	$(document).on('click', '.ctb-remove-selected', function(e) {
		e.stopPropagation();
		var index = $(this).closest('.ctb-selected-thumb').data('index');
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

	function updateButtonState() {
		var hasTitle = $('#ctb-post-title').val().trim().length > 0;
		var hasImages = selectedMedia.length > 0;
		$('#ctb-save-draft, #ctb-publish').prop('disabled', !(hasTitle && hasImages));
	}

	function resetPostPanel() {
		currentPostId = null;
		selectedMedia = [];
		$('#ctb-panel-title').text('New Post');
		$('#ctb-post-title').val('').prop('disabled', false);
		$('#ctb-post-content').val('').prop('disabled', false);
		$('#ctb-post-date').val('').prop('disabled', false);
		$('#ctb-use-photo-date').prop('checked', true).prop('disabled', false);
		$('#ctb-post-status').empty();
		$('#ctb-save-draft').text('Save Draft').prop('disabled', true);
		$('#ctb-publish').text('Publish').prop('disabled', true);
		$('input[name="ctb-format"]').prop('disabled', false);
		updateSelectedPanel();
		$('.ctb-media-item').removeClass('selected');
	}

	$('#ctb-save-draft').on('click', function() { createPost('draft'); });
	$('#ctb-publish').on('click', function() { createPost('publish'); });

	function createPost(status) {
		var title = $('#ctb-post-title').val().trim();
		var content = $('#ctb-post-content').val().trim();
		var format = $('input[name="ctb-format"]:checked').val();
		var usePhotoDate = $('#ctb-use-photo-date').is(':checked');
		var postDate = usePhotoDate ? $('#ctb-post-date').val() : '';

		if (!title || selectedMedia.length === 0) return;

		$('#ctb-save-draft, #ctb-publish').prop('disabled', true);
		$('#ctb-post-status').html('<div class="ctb-importing">Fetching images...</div>');

		// Fetch all images as blobs, then upload to WordPress
		var imagePromises = selectedMedia.map(function(item) {
			// Return cached data URL or fetch fresh
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

		Promise.all(imagePromises)
			.then(function(images) {
				$('#ctb-post-status').html('<div class="ctb-importing">Creating post...</div>');

				// Send to WordPress with base64 image data
				return wpAjax('ctb_create_post', {
					title: title,
					content: content,
					format: format,
					status: status,
					post_date: postDate,
					images: JSON.stringify(images),
					chat_id: currentChatId
				});
			})
			.then(function(response) {
				if (response.success) {
					currentPostId = response.data.post_id;
					$('#ctb-panel-title').html('Post Created <a href="' + response.data.edit_url + '" target="_blank" class="ctb-edit-link">Edit</a>');
					$('#ctb-post-title, #ctb-post-content, #ctb-post-date, #ctb-use-photo-date').prop('disabled', true);
					$('input[name="ctb-format"]').prop('disabled', true);

					var statusText = status === 'publish' ? 'Published' : 'Saved as draft';
					$('#ctb-post-status').html(
						'<div class="ctb-status ctb-status-success">' +
						statusText + ' with ' + response.data.imported + ' image(s). ' +
						'<a href="' + response.data.view_url + '" target="_blank">View post</a>' +
						'</div>'
					);

					selectedMedia = [];
					$('.ctb-media-item').removeClass('selected');
				} else {
					throw new Error(response.data);
				}
			})
			.catch(function(err) {
				$('#ctb-post-status').html('<div class="ctb-status ctb-status-error">Error: ' + err.message + '</div>');
				$('#ctb-save-draft, #ctb-publish').prop('disabled', false);
			});
	}

})(jQuery);
