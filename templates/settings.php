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
		Chat to Blog Settings
		<a href="<?php echo esc_url( admin_url( 'edit.php?page=chat-to-blog' ) ); ?>" class="page-title-action">Create Post</a>
	</h1>

	<?php if ( ! $is_configured ) : ?>
	<div class="ctb-welcome">
		<h2>Welcome to Chat to Blog!</h2>
		<p>This plugin lets you create blog posts from images shared in your Beeper group chats.</p>
	</div>
	<?php endif; ?>

	<div class="ctb-card">
		<h2>
			Beeper Connection
			<?php if ( $is_configured ) : ?>
				<span class="ctb-badge ctb-badge-success">Connected</span>
			<?php else : ?>
				<span class="ctb-badge ctb-badge-warning">Not configured</span>
			<?php endif; ?>
		</h2>

		<p>Connect to Beeper Desktop to access your group chat media.</p>

		<div class="ctb-instructions">
			<strong>To get your API token:</strong>
			<ol>
				<li>Make sure <strong>Beeper Desktop</strong> is running on this computer</li>
				<li>Open Beeper Desktop and go to <strong>Settings</strong> (gear icon)</li>
				<li>Click <strong>Developer</strong> in the sidebar</li>
				<li>Click <strong>Create API Token</strong> and copy the token</li>
			</ol>
		</div>

		<form id="ctb-token-form">
			<table class="form-table">
				<tr>
					<th scope="row"><label for="ctb-token">API Token</label></th>
					<td>
						<input type="password" id="ctb-token" class="regular-text" value="<?php echo esc_attr( $token ); ?>" placeholder="Paste your Beeper API token here" />
					</td>
				</tr>
			</table>

			<p class="submit">
				<button type="submit" class="button button-primary">Save Token</button>
				<button type="button" id="ctb-test-btn" class="button">Test Connection</button>
			</p>

			<div id="ctb-token-status"></div>
		</form>
	</div>

	<div class="ctb-card">
		<h2>Local Media Server</h2>

		<p>A local server is needed to serve image files until the Beeper API supports returning image contents directly.</p>

		<div class="ctb-instructions">
			<strong>To start the local media server:</strong>
			<ol>
				<li>Open a terminal in the plugin directory</li>
				<li>Run: <code>php -S localhost:8787 local-media-server.php</code></li>
				<li>Keep the terminal open while using Chat to Blog</li>
			</ol>
		</div>

		<form id="ctb-server-form">
			<table class="form-table">
				<tr>
					<th scope="row"><label for="ctb-local-server-url">Server URL</label></th>
					<td>
						<input type="url" id="ctb-local-server-url" class="regular-text" value="<?php echo esc_attr( $local_server_url ); ?>" placeholder="http://localhost:8787" />
						<p class="description">Default: http://localhost:8787</p>
					</td>
				</tr>
			</table>

			<p class="submit">
				<button type="submit" class="button button-primary">Save Settings</button>
				<button type="button" id="ctb-test-local-server" class="button">Test Connection</button>
			</p>

			<div id="ctb-server-status"></div>
		</form>
	</div>
</div>
