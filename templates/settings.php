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
$use_local_server = get_option( 'chat_to_blog_use_local_server', false );
$local_server_url = get_option( 'chat_to_blog_local_server', 'http://localhost:8787' );
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
				<li><?php echo wp_kses( __( 'Click <strong>Developer</strong> in the sidebar', 'chat-to-blog' ), [ 'strong' => [] ] ); ?></li>
				<li><?php echo wp_kses( __( 'Click <strong>Create API Token</strong> and copy the token', 'chat-to-blog' ), [ 'strong' => [] ] ); ?></li>
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

	<div class="ctb-card">
		<h2><?php esc_html_e( 'Local Media Server', 'chat-to-blog' ); ?></h2>

		<p><?php esc_html_e( 'A local server is needed to serve image files until the Beeper API supports returning image contents directly.', 'chat-to-blog' ); ?></p>

		<div class="ctb-instructions">
			<strong><?php esc_html_e( 'To start the local media server:', 'chat-to-blog' ); ?></strong>
			<ol>
				<li><?php esc_html_e( 'Open a terminal in the plugin directory', 'chat-to-blog' ); ?></li>
				<li><?php
					/* translators: %s: command to run */
					printf( esc_html__( 'Run: %s', 'chat-to-blog' ), '<code>php -S localhost:8787 local-media-server.php</code>' );
				?></li>
				<li><?php esc_html_e( 'Keep the terminal open while using Chat to Blog', 'chat-to-blog' ); ?></li>
			</ol>
		</div>

		<form id="ctb-server-form">
			<table class="form-table">
				<tr>
					<th scope="row"><label for="ctb-local-server-url"><?php esc_html_e( 'Server URL', 'chat-to-blog' ); ?></label></th>
					<td>
						<input type="url" id="ctb-local-server-url" class="regular-text" value="<?php echo esc_attr( $local_server_url ); ?>" placeholder="http://localhost:8787" />
						<p class="description"><?php esc_html_e( 'Default: http://localhost:8787', 'chat-to-blog' ); ?></p>
					</td>
				</tr>
			</table>

			<p class="submit">
				<button type="submit" class="button button-primary"><?php esc_html_e( 'Save Settings', 'chat-to-blog' ); ?></button>
				<button type="button" id="ctb-test-local-server" class="button"><?php esc_html_e( 'Test Connection', 'chat-to-blog' ); ?></button>
			</p>

			<div id="ctb-server-status"></div>
		</form>
	</div>
</div>
