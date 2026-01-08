/**
 * Chat to Blog Admin JavaScript
 */

(function($) {
	'use strict';

	var config = window.ctbConfig || {};
	var selectedMedia = [];
	var currentCursor = null;
	var currentChatId = null;
	var currentPostId = null; // Track if we have a post already

	function ajax(action, data) {
		return $.ajax({
			url: config.ajaxUrl,
			type: 'POST',
			data: Object.assign({
				action: action,
				nonce: config.nonce
			}, data)
		});
	}

	function showStatus(container, message, isError) {
		var $status = $('<div class="ctb-status">').text(message);
		$status.addClass(isError ? 'ctb-status-error' : 'ctb-status-success');
		$(container).html($status);

		if (!isError) {
			setTimeout(function() {
				$status.fadeOut();
			}, 3000);
		}
	}

	// Settings Page
	$('#ctb-token-form').on('submit', function(e) {
		e.preventDefault();
		var token = $('#ctb-token').val();

		ajax('ctb_save_token', { token: token })
			.done(function(response) {
				if (response.success) {
					if (response.data.connected) {
						showStatus('#ctb-token-status', 'Connected! Found ' + response.data.accounts + ' account(s).', false);
						$('#ctb-chats-section').show();
					} else {
						showStatus('#ctb-token-status', 'Token cleared.', false);
						$('#ctb-chats-section').hide();
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
		ajax('ctb_test_connection', {})
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
	$('#ctb-use-local-server').on('change', function() {
		$('.ctb-local-server-row').toggle(this.checked);
	});

	function testLocalServer(serverUrl) {
		return fetch(serverUrl + '?health', { mode: 'cors' })
			.then(function(response) {
				if (!response.ok) throw new Error('Server returned ' + response.status);
				return response.json();
			})
			.then(function(data) {
				return data.status === 'ok';
			})
			.catch(function() {
				return false;
			});
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
		var useLocalServer = $('#ctb-use-local-server').is(':checked');
		var localServerUrl = $('#ctb-local-server-url').val();

		ajax('ctb_save_server_settings', {
			use_local_server: useLocalServer ? '1' : '',
			local_server_url: localServerUrl
		})
			.done(function(response) {
				if (response.success) {
					config.useLocalServer = useLocalServer;
					config.localServerUrl = localServerUrl;
					showStatus('#ctb-server-status', 'Settings saved.', false);
				} else {
					showStatus('#ctb-server-status', response.data || 'Error saving settings', true);
				}
			})
			.fail(function() {
				showStatus('#ctb-server-status', 'Request failed', true);
			});
	});

	// Media Browser - Two Column Layout

	// Load chat list on page load
	$(document).ready(function() {
		if ($('#ctb-chat-list').length) {
			loadChatList();
		}

		// Check local server status on media browser page
		var $serverStatus = $('#ctb-local-server-status');
		if ($serverStatus.length && config.useLocalServer && config.localServerUrl) {
			testLocalServer(config.localServerUrl).then(function(ok) {
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
	});

	function loadChatList() {
		ajax('ctb_get_chats', { type: 'all' })
			.done(function(response) {
				if (response.success) {
					renderChatList(response.data.chats);
				} else {
					$('#ctb-chat-list').html('<span class="ctb-error">Failed to load chats</span>');
				}
			})
			.fail(function() {
				$('#ctb-chat-list').html('<span class="ctb-error">Failed to load chats</span>');
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

			if (chat.avatar) {
				var avatarUrl = proxyUrl(chat.avatar);
				$item.append($('<img class="ctb-chat-avatar">').attr('src', avatarUrl));
			} else {
				$item.addClass('no-avatar');
			}

			$item.append($('<span class="ctb-chat-title">').text(chat.title));
			$list.append($item);
		});
	}

	// Click on chat to select and load media
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

		ajax('ctb_get_media', {
			chat_id: currentChatId,
			cursor: currentCursor || ''
		})
		.done(function(response) {
			if (response.success) {
				if (!append) {
					$grid.empty();
				}
				renderMedia(response.data.media, $grid);
				currentCursor = response.data.nextCursor;
				$loadMore.toggle(response.data.hasMore);
			} else {
				if (!append) {
					$grid.html('<p class="ctb-empty">Error loading media: ' + response.data + '</p>');
				}
			}
		})
		.fail(function() {
			if (!append) {
				$grid.html('<p class="ctb-empty">Failed to load media</p>');
			}
		})
		.always(function() {
			$spinner.removeClass('is-active');
		});
	}

	function proxyUrl(url) {
		if (!url) return url;
		if (url.indexOf('localmxc://') === 0 || url.indexOf('mxc://') === 0) {
			return config.ajaxUrl + '?action=ctb_serve_media&nonce=' + config.nonce + '&id=' + encodeURIComponent(url);
		}
		return url;
	}

	function renderMedia(items, $container) {
		if (items.length === 0 && $container.children().length === 0) {
			$container.html('<p class="ctb-empty">No media found in this chat</p>');
			return;
		}

		items.forEach(function(item) {
			var $item = $('<div class="ctb-media-item">').data('media', item);

			var thumbnailUrl = proxyUrl(item.thumbnailUrl || item.url);

			var $img = $('<img>').attr('src', thumbnailUrl).attr('alt', '');
			$item.append($img);

			// Check if already selected
			var isSelected = selectedMedia.some(function(m) { return m.id === item.id; });
			if (isSelected) {
				$item.addClass('selected');
			}

			// Mark as imported
			if (item.imported) {
				$item.addClass('imported');
				$item.append('<div class="ctb-imported-badge">Imported</div>');
			}

			if (item.timestamp) {
				var date = new Date(item.timestamp);
				var dateStr = date.toLocaleDateString();
				$item.append('<div class="ctb-media-date">' + dateStr + '</div>');
			}

			$container.append($item);
		});
	}

	// Click on media item to add to selection
	$(document).on('click', '.ctb-media-item', function() {
		var $item = $(this);
		var media = $item.data('media');

		// If we have a posted post already, start fresh for new selection
		if (currentPostId && selectedMedia.length === 0) {
			resetPostPanel();
		}

		// Check if already selected
		var existingIndex = -1;
		selectedMedia.forEach(function(m, i) {
			if (m.id === media.id) existingIndex = i;
		});

		if (existingIndex >= 0) {
			// Remove from selection
			selectedMedia.splice(existingIndex, 1);
			$item.removeClass('selected');
		} else {
			// Add to selection
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
			var thumbnailUrl = proxyUrl(item.thumbnailUrl || item.url);

			var $thumb = $('<div class="ctb-selected-thumb">').data('index', index);
			$thumb.append($('<img>').attr('src', thumbnailUrl));
			$thumb.append('<button type="button" class="ctb-remove-selected">&times;</button>');
			$grid.append($thumb);

			// Track earliest date
			if (item.timestamp) {
				var itemDate = new Date(item.timestamp);
				if (!earliestDate || itemDate < earliestDate) {
					earliestDate = itemDate;
				}
			}
		});
		$container.append($grid);

		// Update date field with earliest photo date
		if (earliestDate) {
			var localDate = new Date(earliestDate.getTime() - earliestDate.getTimezoneOffset() * 60000);
			$('#ctb-post-date').val(localDate.toISOString().slice(0, 16));
		}

		// Enable buttons if we have images and title
		updateButtonState();
	}

	// Remove from selected
	$(document).on('click', '.ctb-remove-selected', function(e) {
		e.stopPropagation();
		var index = $(this).closest('.ctb-selected-thumb').data('index');
		var removed = selectedMedia.splice(index, 1)[0];

		// Clear title/content if they came from this media
		if (removed.text && removed.text.trim()) {
			var text = removed.text.trim();
			if ($('#ctb-post-title').val().trim() === text) {
				$('#ctb-post-title').val('');
			}
			if ($('#ctb-post-content').val().trim() === text) {
				$('#ctb-post-content').val('');
			}
		}

		// Unselect in grid
		$('.ctb-media-item').each(function() {
			if ($(this).data('media').id === removed.id) {
				$(this).removeClass('selected');
			}
		});

		updateSelectedPanel();
	});

	// Update button state based on title and images
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

		// Clear selection in grid
		$('.ctb-media-item').removeClass('selected');
	}

	// Post creation
	$('#ctb-save-draft').on('click', function() {
		createPost('draft');
	});

	$('#ctb-publish').on('click', function() {
		createPost('publish');
	});

	function createPost(status) {
		var title = $('#ctb-post-title').val().trim();
		var content = $('#ctb-post-content').val().trim();
		var format = $('input[name="ctb-format"]:checked').val();
		var usePhotoDate = $('#ctb-use-photo-date').is(':checked');
		var postDate = usePhotoDate ? $('#ctb-post-date').val() : '';

		if (!title || selectedMedia.length === 0) return;

		$('#ctb-save-draft, #ctb-publish').prop('disabled', true);
		$('#ctb-post-status').html('<div class="ctb-importing">Importing images and creating post...</div>');

		ajax('ctb_create_post', {
			title: title,
			content: content,
			format: format,
			status: status,
			post_date: postDate,
			media: JSON.stringify(selectedMedia),
			chat_id: currentChatId
		})
		.done(function(response) {
			if (response.success) {
				currentPostId = response.data.post_id;

				// Update panel to show created post
				$('#ctb-panel-title').html('Post Created <a href="' + response.data.edit_url + '" target="_blank" class="ctb-edit-link">Edit</a>');
				$('#ctb-post-title').prop('disabled', true);
				$('#ctb-post-content').prop('disabled', true);
				$('#ctb-post-date').prop('disabled', true);
				$('#ctb-use-photo-date').prop('disabled', true);
				$('input[name="ctb-format"]').prop('disabled', true);

				var statusText = status === 'publish' ? 'Published' : 'Saved as draft';
				$('#ctb-post-status').html(
					'<div class="ctb-status ctb-status-success">' +
					statusText + ' with ' + response.data.imported + ' image(s). ' +
					'<a href="' + response.data.view_url + '" target="_blank">View post</a>' +
					'</div>'
				);

				$('#ctb-save-draft').text('Update Draft');
				$('#ctb-publish').text(status === 'publish' ? 'Published' : 'Publish');

				// Clear selection but keep images shown
				selectedMedia = [];
				$('.ctb-media-item').removeClass('selected');

				// Mark items as used
				// Refresh to show imported status
				loadMedia(false);
			} else {
				$('#ctb-post-status').html('<div class="ctb-status ctb-status-error">Error: ' + response.data + '</div>');
				$('#ctb-save-draft, #ctb-publish').prop('disabled', false);
			}
		})
		.fail(function() {
			$('#ctb-post-status').html('<div class="ctb-status ctb-status-error">Request failed</div>');
			$('#ctb-save-draft, #ctb-publish').prop('disabled', false);
		});
	}

})(jQuery);
