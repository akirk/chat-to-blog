<?php
/**
 * Settings Page Template
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$user_id = get_current_user_id();
$beeper = new \ChatToBlog\BeeperAPI( $user_id );
$is_configured = $beeper->is_configured();
$token = $beeper->get_token();
?>

<div class="wrap ctb-settings">
	<h1>
		<?php esc_html_e( 'Chat to Blog Settings', 'chat-to-blog' ); ?>
		<a href="<?php echo esc_url( admin_url( 'edit.php?page=chat-to-blog' ) ); ?>" class="page-title-action"><?php esc_html_e( 'Create Post', 'chat-to-blog' ); ?></a>
	</h1>

	<?php if ( ! $is_configured ) : ?>
	<div class="ctb-welcome">
		<h2><?php esc_html_e( 'Welcome to Chat to Blog!', 'chat-to-blog' ); ?></h2>
		<p><?php esc_html_e( 'This plugin lets you create blog posts from images shared in your Beeper group chats.', 'chat-to-blog' ); ?></p>
	</div>
	<?php endif; ?>

	<div class="ctb-card">
		<h2>
			<?php esc_html_e( 'Beeper Connection', 'chat-to-blog' ); ?>
			<?php if ( $is_configured ) : ?>
				<span class="ctb-badge ctb-badge-success"><?php esc_html_e( 'Connected', 'chat-to-blog' ); ?></span>
			<?php else : ?>
				<span class="ctb-badge ctb-badge-warning"><?php esc_html_e( 'Not configured', 'chat-to-blog' ); ?></span>
			<?php endif; ?>
		</h2>

		<p><?php esc_html_e( 'Connect to Beeper Desktop to access your group chat media.', 'chat-to-blog' ); ?></p>

		<div class="ctb-instructions">
			<strong><?php esc_html_e( 'To get your API token:', 'chat-to-blog' ); ?></strong>
			<ol>
				<li><?php echo wp_kses( __( 'Make sure <strong>Beeper Desktop</strong> is running on this computer', 'chat-to-blog' ), [ 'strong' => [] ] ); ?></li>
				<li><?php echo wp_kses( __( 'Open Beeper Desktop and go to <strong>Settings</strong> (gear icon)', 'chat-to-blog' ), [ 'strong' => [] ] ); ?></li>
				<li><?php echo wp_kses( __( 'Click <strong>Developers</strong> in the sidebar', 'chat-to-blog' ), [ 'strong' => [] ] ); ?></li>
				<li><?php echo wp_kses( __( 'Scroll to <strong>Approved connections</strong> and click the <strong>+</strong> button', 'chat-to-blog' ), [ 'strong' => [] ] ); ?></li>
			</ol>
		</div>

		<form id="ctb-token-form">
			<table class="form-table">
				<tr>
					<th scope="row"><label for="ctb-token"><?php esc_html_e( 'API Token', 'chat-to-blog' ); ?></label></th>
					<td>
						<input type="password" id="ctb-token" class="regular-text" value="<?php echo esc_attr( $token ); ?>" placeholder="<?php esc_attr_e( 'Paste your Beeper API token here', 'chat-to-blog' ); ?>" />
					</td>
				</tr>
			</table>

			<p class="submit">
				<button type="submit" class="button button-primary"><?php esc_html_e( 'Save Token', 'chat-to-blog' ); ?></button>
				<button type="button" id="ctb-test-btn" class="button"><?php esc_html_e( 'Test Connection', 'chat-to-blog' ); ?></button>
			</p>

			<div id="ctb-token-status"></div>
		</form>
	</div>
</div>
