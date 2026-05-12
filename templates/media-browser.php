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
$categories = $post_type_supports_categories ? get_categories( [ 'hide_empty' => false ] ) : [];
?>

<div class="wrap ctb-media-browser">
	<div class="ctb-page-header">
		<h1>
			<?php esc_html_e( 'Chat to Blog', 'chat-to-blog' ); ?>
			<span class="ctb-post-type-heading"><?php echo esc_html( $current_post_type_label ); ?></span>
			<a href="<?php echo esc_url( admin_url( 'options-general.php?page=chat-to-blog-settings' ) ); ?>" class="page-title-action"><?php esc_html_e( 'Settings' ); ?></a>
		</h1>
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
		<div id="ctb-connection-error" class="ctb-setup-needed" style="display:none;">
			<div class="ctb-setup-icon">🔌</div>
			<h2><?php esc_html_e( 'Can’t reach Beeper Desktop', 'chat-to-blog' ); ?></h2>
			<p><?php esc_html_e( 'The Beeper Desktop API only listens on localhost, so this page needs to be open on the same machine where Beeper Desktop is running. Make sure Beeper Desktop is running, then try again.', 'chat-to-blog' ); ?></p>
			<p>
				<button type="button" id="ctb-retry-connection" class="button button-primary"><?php esc_html_e( 'Retry' ); ?></button>
				<a href="<?php echo esc_url( admin_url( 'options-general.php?page=chat-to-blog-settings' ) ); ?>" class="button"><?php esc_html_e( 'View setup guide', 'chat-to-blog' ); ?></a>
			</p>
		</div>

		<div id="ctb-main-ui">
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
					<div id="ctb-timeline" class="ctb-timeline" style="display:none;">
						<div class="ctb-timeline-header">
							<span class="ctb-timeline-label"><?php esc_html_e( 'Jump to month', 'chat-to-blog' ); ?></span>
							<span class="ctb-timeline-status"></span>
							<button type="button" id="ctb-timeline-reset" class="button-link" style="display:none;"><?php esc_html_e( 'Back to latest', 'chat-to-blog' ); ?></button>
						</div>
						<div id="ctb-timeline-bars" class="ctb-timeline-bars"></div>
					</div>
					<div id="ctb-media-grid" class="ctb-media-grid">
						<p class="ctb-hint"><?php esc_html_e( 'Select a chat above to browse media', 'chat-to-blog' ); ?></p>
					</div>

					<div id="ctb-load-more-wrap" class="ctb-load-more-wrap" style="display:none;">
						<div class="ctb-load-stats-bar-wrap">
							<div id="ctb-load-stats-bar" class="ctb-load-stats-bar"></div>
						</div>
						<div class="ctb-load-stats-row">
							<span id="ctb-load-stats" class="ctb-load-stats"></span>
						</div>
					</div>
				</div>
			</div>

			<div class="ctb-column-right">
				<div class="ctb-panel ctb-post-panel">
					<div class="ctb-panel-header">
						<h3 id="ctb-panel-title"><?php echo esc_html( $current_post_type_new_item_label ); ?></h3>
					</div>

					<div class="ctb-post-form">
						<div id="ctb-selected-images" class="ctb-selected-images">
							<p class="ctb-hint"><?php esc_html_e( 'Select media from the left. Saving or publishing imports it to the Media Library automatically.', 'chat-to-blog' ); ?></p>
						</div>

						<div class="ctb-media-actions">
							<button type="button" id="ctb-import-media" class="button" disabled><?php esc_html_e( 'Import Without Posting', 'chat-to-blog' ); ?></button>
							<div id="ctb-media-import-status"></div>
						</div>

						<div class="ctb-form-group">
							<label for="ctb-post-title"><?php esc_html_e( 'Title' ); ?></label>
							<input type="text" id="ctb-post-title" placeholder="<?php esc_attr_e( 'Enter post title...', 'chat-to-blog' ); ?>" />
						</div>

						<div class="ctb-form-group">
							<label for="ctb-post-content"><?php esc_html_e( 'Text' ); ?></label>
							<textarea id="ctb-post-content" rows="4" placeholder="<?php esc_attr_e( 'Add some text (optional)...', 'chat-to-blog' ); ?>"></textarea>
						</div>

						<div class="ctb-form-group ctb-date-group">
							<label for="ctb-post-date"><?php esc_html_e( 'Date' ); ?></label>
							<input type="datetime-local" id="ctb-post-date" />
							<a href="#" id="ctb-date-now"><?php esc_html_e( 'Now' ); ?></a>
						</div>

						<?php if ( ! empty( $categories ) ) : ?>
						<div class="ctb-form-group" id="ctb-post-category-group">
							<label for="ctb-post-category"><?php esc_html_e( 'Category' ); ?></label>
							<select id="ctb-post-category">
								<option value=""><?php esc_html_e( 'None' ); ?></option>
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
									<?php esc_html_e( 'Gallery' ); ?>
								</label>
								<label class="ctb-radio">
									<input type="radio" name="ctb-format" value="blocks" checked />
									<?php esc_html_e( 'Individual images', 'chat-to-blog' ); ?>
								</label>
							</div>
						</div>

						<div class="ctb-post-actions">
							<button type="button" id="ctb-save-draft" class="button" disabled><?php esc_html_e( 'Save Draft' ); ?></button>
							<button type="button" id="ctb-publish" class="button button-primary" disabled><?php esc_html_e( 'Publish' ); ?></button>
						</div>

						<div id="ctb-post-status"></div>
					</div>
				</div>
			</div>
		</div>
		</div>
	<?php endif; ?>
</div>
