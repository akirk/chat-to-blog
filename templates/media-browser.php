<?php
/**
 * Media Browser Page Template
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$user_id = get_current_user_id();
$beeper = new \ChatToBlog\BeeperAPI( $user_id );
$is_configured = $beeper->is_configured();
?>

<?php
$use_local_server = get_option( 'chat_to_blog_use_local_server', false );
?>
<div class="wrap ctb-media-browser">
	<div class="ctb-page-header">
		<h1>
			Chat to Blog
			<a href="<?php echo esc_url( admin_url( 'options-general.php?page=chat-to-blog-settings' ) ); ?>" class="page-title-action">Settings</a>
		</h1>
		<?php if ( $use_local_server ) : ?>
		<div id="ctb-local-server-status" class="ctb-server-status-badge ctb-status-checking">
			<span class="ctb-server-status-icon"></span>
			<span class="ctb-server-status-text">Checking...</span>
		</div>
		<?php endif; ?>
	</div>

	<?php if ( ! $is_configured ) : ?>
		<div class="ctb-setup-needed">
			<div class="ctb-setup-icon">🔗</div>
			<h2>Connect to Beeper</h2>
			<p>To browse media from your group chats, you need to connect your Beeper account first.</p>
			<a href="<?php echo esc_url( admin_url( 'options-general.php?page=chat-to-blog-settings' ) ); ?>" class="button button-primary button-hero">
				Set Up Beeper Connection
			</a>
		</div>
	<?php else : ?>
		<!-- Chat List -->
		<div class="ctb-chat-bar">
			<div class="ctb-chat-bar-inner">
				<div id="ctb-chat-list" class="ctb-chat-list-horizontal">
					<span class="spinner is-active"></span> Loading chats...
				</div>
			</div>
		</div>

		<div class="ctb-two-column">
			<!-- Left Column: Media Browser -->
			<div class="ctb-column-left">
				<div class="ctb-panel">
					<div id="ctb-media-grid" class="ctb-media-grid">
						<p class="ctb-hint">Select a chat above to browse media</p>
					</div>

					<div id="ctb-load-more-wrap" class="ctb-load-more-wrap" style="display:none;">
						<button type="button" id="ctb-load-more" class="button">Load More</button>
						<span class="spinner"></span>
					</div>
				</div>
			</div>

			<!-- Right Column: Post Editor -->
			<div class="ctb-column-right">
				<div class="ctb-panel ctb-post-panel">
					<div class="ctb-panel-header">
						<h3 id="ctb-panel-title">New Post</h3>
					</div>

					<div class="ctb-post-form">
						<div id="ctb-selected-images" class="ctb-selected-images">
							<p class="ctb-hint">Select images from the left to add them here</p>
						</div>

						<div class="ctb-form-group">
							<label for="ctb-post-title">Title</label>
							<input type="text" id="ctb-post-title" placeholder="Enter post title..." />
						</div>

						<div class="ctb-form-group">
							<label for="ctb-post-content">Text</label>
							<textarea id="ctb-post-content" rows="4" placeholder="Add some text (optional)..."></textarea>
						</div>

						<div class="ctb-form-group ctb-date-group">
							<label>
								<input type="checkbox" id="ctb-use-photo-date" checked />
								Use photo date
							</label>
							<input type="datetime-local" id="ctb-post-date" />
						</div>

						<div class="ctb-form-group">
							<label>Format</label>
							<div class="ctb-format-options">
								<label class="ctb-radio">
									<input type="radio" name="ctb-format" value="gallery" checked />
									Gallery
								</label>
								<label class="ctb-radio">
									<input type="radio" name="ctb-format" value="blocks" />
									Individual images
								</label>
							</div>
						</div>

						<div class="ctb-post-actions">
							<button type="button" id="ctb-save-draft" class="button" disabled>Save Draft</button>
							<button type="button" id="ctb-publish" class="button button-primary" disabled>Publish</button>
						</div>

						<div id="ctb-post-status"></div>
					</div>
				</div>
			</div>
		</div>
	<?php endif; ?>
</div>
