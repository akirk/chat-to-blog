<?php
/**
 * Plugin Name: Chat to Blog
 * Description: Import media from Beeper chats and create blog posts
 * Version: 0.9.4
 * Author: Alex Kirk
 * Author URI: https://alex.kirk.at/
 * License: GPL v2 or later
 * Text Domain: chat-to-blog
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CHAT_TO_BLOG_VERSION', '0.9.4' );
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

function chat_to_blog_get_media_browser_url() {
	$post_types = get_option( 'chat_to_blog_enabled_post_types', [ 'post' ] );
	if ( ! is_array( $post_types ) ) {
		$post_types = [ $post_types ];
	}

	$post_type = 'post';
	foreach ( $post_types as $candidate ) {
		$candidate = sanitize_key( $candidate );
		$post_type_object = get_post_type_object( $candidate );
		if ( $post_type_object && $post_type_object->show_ui ) {
			$post_type = $candidate;
			break;
		}
	}

	if ( $post_type === 'post' ) {
		return admin_url( 'edit.php?page=chat-to-blog' );
	}

	return admin_url( 'edit.php?post_type=' . $post_type . '&page=chat-to-blog' );
}

add_filter( 'my_apps_plugins', function( $apps ) {
	$apps['chat-to-blog'] = array(
		'name'     => 'Chat to Blog',
		'url'      => chat_to_blog_get_media_browser_url(),
		'dashicon' => 'dashicons-format-chat',
	);
	return $apps;
} );
