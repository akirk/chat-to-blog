<?php
/**
 * Plugin Name: Chat to Blog
 * Description: Import media from Beeper group chats and create blog posts
 * Version: 1.0.0
 * Author: Alex
 * License: GPL v2 or later
 * Text Domain: chat-to-blog
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CHAT_TO_BLOG_VERSION', '1.0.0' );
define( 'CHAT_TO_BLOG_PATH', plugin_dir_path( __FILE__ ) );
define( 'CHAT_TO_BLOG_URL', plugin_dir_url( __FILE__ ) );

require_once CHAT_TO_BLOG_PATH . 'includes/class-beeper-api.php';
require_once CHAT_TO_BLOG_PATH . 'includes/class-media-importer.php';
require_once CHAT_TO_BLOG_PATH . 'includes/class-admin.php';

function chat_to_blog_init() {
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
