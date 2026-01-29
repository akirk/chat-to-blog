<?php
/**
 * Plugin Name: Chat to Blog
 * Description: Import media from Beeper chats and create blog posts
 * Version: 0.9.3
 * Author: Alex Kirk
 * License: GPL v2 or later
 * Text Domain: chat-to-blog
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CHAT_TO_BLOG_VERSION', '0.9.3' );
define( 'CHAT_TO_BLOG_PATH', plugin_dir_path( __FILE__ ) );
define( 'CHAT_TO_BLOG_URL', plugin_dir_url( __FILE__ ) );

require_once CHAT_TO_BLOG_PATH . 'includes/class-beeper-api.php';
require_once CHAT_TO_BLOG_PATH . 'includes/class-media-importer.php';
require_once CHAT_TO_BLOG_PATH . 'includes/class-admin.php';

function chat_to_blog_init() {
	load_plugin_textdomain( 'chat-to-blog', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );

	$admin = new ChatToBlog\Admin();
	$admin->init();
}
add_action( 'plugins_loaded', 'chat_to_blog_init' );

function chat_to_blog_activate() {
	add_option( 'chat_to_blog_do_activation_redirect', true );
}
register_activation_hook( __FILE__, 'chat_to_blog_activate' );

function chat_to_blog_redirect_after_activation() {
	if ( get_option( 'chat_to_blog_do_activation_redirect', false ) ) {
		delete_option( 'chat_to_blog_do_activation_redirect' );
		if ( ! isset( $_GET['activate-multi'] ) ) {
			wp_redirect( admin_url( 'admin.php?page=chat-to-blog-settings' ) );
			exit;
		}
	}
}
add_action( 'admin_init', 'chat_to_blog_redirect_after_activation' );

add_filter( 'my_apps_plugins', function( $apps ) {
	$apps['chat-to-blog'] = array(
		'name'     => 'Chat to Blog',
		'url'      => admin_url( 'edit.php?page=chat-to-blog' ),
		'icon_url' => 'data:image/svg+xml,' . rawurlencode( '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2271b1"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>' ),
	);
	return $apps;
} );
