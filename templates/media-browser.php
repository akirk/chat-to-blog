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
$categories = get_categories( [ 'hide_empty' => false ] );
?>

<div class="wrap ctb-media-browser">
	<div class="ctb-page-header">
		<h1>
			<?php esc_html_e( 'Chat to Blog', 'chat-to-blog' ); ?>
			<a href="<?php echo esc_url( admin_url( 'options-general.php?page=chat-to-blog-settings' ) ); ?>" class="page-title-action"><?php esc_html_e( 'Settings', 'chat-to-blog' ); ?></a>
		</h1>
		<div id="ctb-local-server-status" class="ctb-server-status-badge ctb-status-checking">
			<span class="ctb-server-status-icon"></span>
			<span class="ctb-server-status-text"><?php esc_html_e( 'Checking...', 'chat-to-blog' ); ?></span>
		</div>
	</div>

	<?php if ( ! $is_configured ) : ?>
		<div class="ctb-setup-needed">
			<div class="ctb-setup-icon">🔗</div>
			<h2><?php esc_html_e( 'Connect to Beeper', 'chat-to-blog' ); ?></h2>
			<p><?php esc_html_e( 'To browse media from your group chats, you need to connect your Beeper account first.', 'chat-to-blog' ); ?></p>
			<a href="<?php echo esc_url( admin_url( 'options-general.php?page=chat-to-blog-settings' ) ); ?>" class="button button-primary button-hero">
				<?php esc_html_e( 'Set Up Beeper Connection', 'chat-to-blog' ); ?>
			</a>
		</div>
	<?php else : ?>
		<div class="ctb-chat-bar">
			<div class="ctb-chat-bar-inner">
				<div id="ctb-chat-list" class="ctb-chat-list-horizontal">
					<span class="spinner is-active"></span> <?php esc_html_e( 'Loading chats...', 'chat-to-blog' ); ?>
				</div>
			</div>
		</div>

		<div class="ctb-two-column">
			<div class="ctb-column-left">
				<div class="ctb-panel">
					<div id="ctb-media-grid" class="ctb-media-grid">
						<p class="ctb-hint"><?php esc_html_e( 'Select a chat above to browse media', 'chat-to-blog' ); ?></p>
					</div>

					<div id="ctb-load-more-wrap" class="ctb-load-more-wrap" style="display:none;">
						<button type="button" id="ctb-load-more" class="button"><?php esc_html_e( 'Load More', 'chat-to-blog' ); ?></button>
						<span class="spinner"></span>
					</div>
				</div>
			</div>

			<div class="ctb-column-right">
				<div class="ctb-panel ctb-post-panel">
					<div class="ctb-panel-header">
						<h3 id="ctb-panel-title"><?php esc_html_e( 'New Post', 'chat-to-blog' ); ?></h3>
					</div>

					<div class="ctb-post-form">
						<div id="ctb-selected-images" class="ctb-selected-images">
							<p class="ctb-hint"><?php esc_html_e( 'Select images from the left to add them here', 'chat-to-blog' ); ?></p>
						</div>

						<div class="ctb-form-group">
							<label for="ctb-post-title"><?php esc_html_e( 'Title', 'chat-to-blog' ); ?></label>
							<input type="text" id="ctb-post-title" placeholder="<?php esc_attr_e( 'Enter post title...', 'chat-to-blog' ); ?>" />
						</div>

						<div class="ctb-form-group">
							<label for="ctb-post-content"><?php esc_html_e( 'Text', 'chat-to-blog' ); ?></label>
							<textarea id="ctb-post-content" rows="4" placeholder="<?php esc_attr_e( 'Add some text (optional)...', 'chat-to-blog' ); ?>"></textarea>
						</div>

						<div class="ctb-form-group ctb-date-group">
							<label for="ctb-post-date"><?php esc_html_e( 'Date', 'chat-to-blog' ); ?></label>
							<input type="datetime-local" id="ctb-post-date" />
							<a href="#" id="ctb-date-now"><?php esc_html_e( 'Now', 'chat-to-blog' ); ?></a>
						</div>

						<?php if ( ! empty( $categories ) ) : ?>
						<div class="ctb-form-group">
							<label for="ctb-post-category"><?php esc_html_e( 'Category', 'chat-to-blog' ); ?></label>
							<select id="ctb-post-category">
								<option value=""><?php esc_html_e( 'None', 'chat-to-blog' ); ?></option>
								<?php foreach ( $categories as $category ) : ?>
									<option value="<?php echo esc_attr( $category->term_id ); ?>">
										<?php echo esc_html( $category->name ); ?>
									</option>
								<?php endforeach; ?>
							</select>
						</div>
						<?php endif; ?>

						<div class="ctb-form-group">
							<label><?php esc_html_e( 'Format', 'chat-to-blog' ); ?></label>
							<div class="ctb-format-options">
								<label class="ctb-radio">
									<input type="radio" name="ctb-format" value="gallery" />
									<?php esc_html_e( 'Gallery', 'chat-to-blog' ); ?>
								</label>
								<label class="ctb-radio">
									<input type="radio" name="ctb-format" value="blocks" checked />
									<?php esc_html_e( 'Individual images', 'chat-to-blog' ); ?>
								</label>
							</div>
						</div>

						<div class="ctb-post-actions">
							<button type="button" id="ctb-save-draft" class="button" disabled><?php esc_html_e( 'Save Draft', 'chat-to-blog' ); ?></button>
							<button type="button" id="ctb-publish" class="button button-primary" disabled><?php esc_html_e( 'Publish', 'chat-to-blog' ); ?></button>
						</div>

						<div id="ctb-post-status"></div>
					</div>
				</div>
			</div>
		</div>
	<?php endif; ?>
</div>
