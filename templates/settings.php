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
		<a href="<?php echo esc_url( $create_post_url ); ?>" class="page-title-action"><?php esc_html_e( 'Create Post', 'chat-to-blog' ); ?></a>
	</h1>

	<?php if ( ! $is_configured ) : ?>
	<div class="ctb-welcome">
		<h2><?php esc_html_e( 'Save chat memories in WordPress', 'chat-to-blog' ); ?></h2>
		<p><?php esc_html_e( 'Photos and videos often arrive in Signal, WhatsApp, and other group chats. Chat to Blog helps you pick those moments and turn them into WordPress posts, with the media saved to your own Media Library.', 'chat-to-blog' ); ?></p>
		<p><?php esc_html_e( 'To access those chats privately, this plugin uses Beeper Desktop as a local bridge. Beeper connects to your chat apps on this computer, and Chat to Blog reads from Beeper only after you approve the local API connection.', 'chat-to-blog' ); ?></p>
	</div>
	<?php endif; ?>

	<div class="ctb-card">
		<h2>
			<?php esc_html_e( 'Connect Beeper Desktop', 'chat-to-blog' ); ?>
			<?php if ( $is_configured ) : ?>
				<span id="ctb-connection-badge" class="ctb-badge ctb-badge-warning"><?php esc_html_e( 'Checking…', 'chat-to-blog' ); ?></span>
			<?php else : ?>
				<span id="ctb-connection-badge" class="ctb-badge ctb-badge-warning"><?php esc_html_e( 'Not configured', 'chat-to-blog' ); ?></span>
			<?php endif; ?>
		</h2>

		<p><?php esc_html_e( 'Chat to Blog uses Beeper Desktop to access photos and videos from Signal, WhatsApp, and other chat apps. Beeper provides a local API for accessing this media, even when the chat app doesn’t offer one.', 'chat-to-blog' ); ?></p>

		<div class="ctb-instructions">
			<h3><?php esc_html_e( 'Install and set up Beeper', 'chat-to-blog' ); ?></h3>
			<ol>
				<li>
					<?php
					echo wp_kses(
						sprintf(
							/* translators: %s: link to Beeper download page */
							__( '%s on this computer.', 'chat-to-blog' ),
							'<a href="https://www.beeper.com/download" target="_blank" rel="noopener">' . esc_html__( 'Install Beeper Desktop', 'chat-to-blog' ) . '</a>'
						),
						[ 'a' => [ 'href' => [], 'target' => [], 'rel' => [] ] ]
					);
					?>
				</li>
				<li><?php echo wp_kses( __( 'In Beeper, connect the chat networks you want to import from, such as <strong>Signal</strong> or <strong>WhatsApp</strong>.', 'chat-to-blog' ), [ 'strong' => [] ] ); ?></li>
				<li><?php echo wp_kses( __( 'Keep <strong>Beeper Desktop</strong> running while you browse chat media in WordPress.', 'chat-to-blog' ), [ 'strong' => [] ] ); ?></li>
			</ol>

			<h3><?php esc_html_e( 'Enable the local Beeper API', 'chat-to-blog' ); ?></h3>
			<ol>
				<li><?php echo wp_kses( __( 'Open Beeper Desktop and go to <strong>Settings</strong> (gear icon).', 'chat-to-blog' ), [ 'strong' => [] ] ); ?></li>
				<li><?php echo wp_kses( __( 'Click <strong>Developers</strong> in the sidebar', 'chat-to-blog' ), [ 'strong' => [] ] ); ?></li>
				<li><?php echo wp_kses( __( 'Turn on the <strong>Beeper Desktop API</strong> toggle (the API starts on <code>localhost:23373</code>)', 'chat-to-blog' ), [ 'strong' => [], 'code' => [] ] ); ?></li>
				<li><?php echo wp_kses( __( 'Scroll to <strong>Approved connections</strong> and click the <strong>+</strong> button to generate a token', 'chat-to-blog' ), [ 'strong' => [] ] ); ?></li>
				<li><?php esc_html_e( 'Paste the token below and click Save Token, then Test Connection.', 'chat-to-blog' ); ?></li>
			</ol>
			<p>
				<?php
				echo wp_kses(
					sprintf(
						/* translators: %s: link to Beeper Desktop API docs */
						__( 'More details in the %s.', 'chat-to-blog' ),
						'<a href="https://developers.beeper.com/desktop-api/" target="_blank" rel="noopener">' . esc_html__( 'Beeper Desktop API docs', 'chat-to-blog' ) . '</a>'
					),
					[ 'a' => [ 'href' => [], 'target' => [], 'rel' => [] ] ]
				);
				?>
			</p>
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
		<h2><?php esc_html_e( 'Post Types', 'chat-to-blog' ); ?></h2>
		<p><?php esc_html_e( 'Choose which post type menus should show Chat to Blog and which post types can receive imported media.', 'chat-to-blog' ); ?></p>

		<form id="ctb-post-types-form">
			<table class="form-table">
				<tr>
					<th scope="row"><?php esc_html_e( 'Enabled post types', 'chat-to-blog' ); ?></th>
					<td>
						<div class="ctb-post-type-options">
							<?php foreach ( $available_post_types as $post_type_name => $post_type_object ) : ?>
								<label class="ctb-post-type-option">
									<input
										type="checkbox"
										name="ctb-post-types[]"
										value="<?php echo esc_attr( $post_type_name ); ?>"
										<?php checked( in_array( $post_type_name, $enabled_post_types, true ) ); ?>
									/>
									<span><?php echo esc_html( $post_type_object->labels->singular_name ); ?></span>
									<code><?php echo esc_html( $post_type_name ); ?></code>
								</label>
							<?php endforeach; ?>
						</div>
						<p class="description"><?php esc_html_e( 'At least one post type must stay enabled. If none are selected, Posts will be used.', 'chat-to-blog' ); ?></p>
					</td>
				</tr>
			</table>

			<p class="submit">
				<button type="submit" class="button button-primary"><?php esc_html_e( 'Save Post Types', 'chat-to-blog' ); ?></button>
			</p>

			<div id="ctb-post-types-status"></div>
		</form>
	</div>

</div>
