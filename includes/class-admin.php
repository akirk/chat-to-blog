<?php
/**
 * Admin Class
 *
 * Handles admin pages, menus, and AJAX handlers.
 */

namespace ChatToBlog;

class Admin {
	private $beeper;
	private $importer;

	public function init() {
		$this->beeper = new BeeperAPI();
		$this->importer = new MediaImporter( $this->beeper );

		add_action( 'admin_menu', [ $this, 'register_menus' ] );
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );

		add_action( 'wp_ajax_ctb_test_connection', [ $this, 'ajax_test_connection' ] );
		add_action( 'wp_ajax_ctb_save_token', [ $this, 'ajax_save_token' ] );
		add_action( 'wp_ajax_ctb_save_server_settings', [ $this, 'ajax_save_server_settings' ] );
		add_action( 'wp_ajax_ctb_get_chats', [ $this, 'ajax_get_chats' ] );
		add_action( 'wp_ajax_ctb_get_media', [ $this, 'ajax_get_media' ] );
		add_action( 'wp_ajax_ctb_serve_media', [ $this, 'ajax_serve_media' ] );
		add_action( 'wp_ajax_ctb_create_post', [ $this, 'ajax_create_post' ] );
	}

	public function register_menus() {
		// Add "Chat to Blog" under Posts menu
		add_submenu_page(
			'edit.php',
			'Chat to Blog',
			'Chat to Blog',
			'edit_posts',
			'chat-to-blog',
			[ $this, 'render_media_browser' ]
		);

		// Add settings under Settings menu
		add_options_page(
			'Chat to Blog',
			'Chat to Blog',
			'manage_options',
			'chat-to-blog-settings',
			[ $this, 'render_settings' ]
		);
	}

	public function enqueue_assets( $hook ) {
		if ( strpos( $hook, 'chat-to-blog' ) === false ) {
			return;
		}

		wp_enqueue_style(
			'chat-to-blog-admin',
			CHAT_TO_BLOG_URL . 'assets/admin.css',
			[],
			CHAT_TO_BLOG_VERSION
		);

		wp_enqueue_script(
			'chat-to-blog-beeper-client',
			CHAT_TO_BLOG_URL . 'assets/beeper-client.js',
			[],
			CHAT_TO_BLOG_VERSION,
			true
		);

		wp_enqueue_script(
			'sortablejs',
			CHAT_TO_BLOG_URL . 'assets/sortable.min.js',
			[],
			'1.15.6',
			true
		);

		wp_enqueue_script(
			'chat-to-blog-admin',
			CHAT_TO_BLOG_URL . 'assets/admin.js',
			[ 'jquery', 'sortablejs', 'chat-to-blog-beeper-client' ],
			CHAT_TO_BLOG_VERSION,
			true
		);

		wp_localize_script( 'chat-to-blog-admin', 'ctbConfig', [
			'ajaxUrl'         => admin_url( 'admin-ajax.php' ),
			'nonce'           => wp_create_nonce( 'chat_to_blog' ),
			'beeperToken'     => $this->beeper->get_token(),
			'mediaServerUrl'  => get_option( 'chat_to_blog_local_server', 'http://localhost:8787' ),
			'importedUrls'    => array_keys( $this->importer->get_all_imported_urls() ),
		] );
	}

	public function render_settings() {
		include CHAT_TO_BLOG_PATH . 'templates/settings.php';
	}

	public function render_media_browser() {
		include CHAT_TO_BLOG_PATH . 'templates/media-browser.php';
	}

	public function ajax_test_connection() {
		check_ajax_referer( 'chat_to_blog', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Permission denied' );
		}

		$result = $this->beeper->test_connection();

		if ( is_wp_error( $result ) ) {
			wp_send_json_error( $result->get_error_message() );
		}

		wp_send_json_success( $result );
	}

	public function ajax_save_token() {
		check_ajax_referer( 'chat_to_blog', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Permission denied' );
		}

		$token = sanitize_text_field( $_POST['token'] ?? '' );
		$this->beeper->set_token( $token );

		if ( ! empty( $token ) ) {
			$test = $this->beeper->test_connection();
			if ( is_wp_error( $test ) ) {
				wp_send_json_error( 'Token saved but connection failed: ' . $test->get_error_message() );
			}
			wp_send_json_success( [ 'connected' => true, 'accounts' => $test['accounts'] ] );
		}

		wp_send_json_success( [ 'cleared' => true ] );
	}

	public function ajax_save_server_settings() {
		check_ajax_referer( 'chat_to_blog', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Permission denied' );
		}

		$local_server_url = esc_url_raw( $_POST['local_server_url'] ?? 'http://localhost:8787' );
		update_option( 'chat_to_blog_local_server', $local_server_url );

		wp_send_json_success( [ 'saved' => true ] );
	}

	public function ajax_get_chats() {
		check_ajax_referer( 'chat_to_blog', 'nonce' );

		$type = sanitize_text_field( $_POST['type'] ?? 'all' );

		if ( $type === 'group' ) {
			$result = $this->beeper->get_group_chats();
		} else {
			$result = $this->beeper->get_all_chats();
		}

		if ( is_wp_error( $result ) ) {
			wp_send_json_error( $result->get_error_message() );
		}

		$chats = [];
		foreach ( $result['items'] as $chat ) {
			$chats[] = [
				'id'           => $chat['id'],
				'title'        => $chat['title'] ?? $chat['name'] ?? 'Unknown',
				'type'         => $chat['type'] ?? 'unknown',
				'network'      => $chat['network'] ?? '',
				'lastActivity' => $chat['lastActivity'] ?? '',
				'avatar'       => $chat['avatar'] ?? $chat['avatarUrl'] ?? $chat['profileImg'] ?? '',
			];
		}

		wp_send_json_success( [ 'chats' => $chats ] );
	}

	public function ajax_get_media() {
		check_ajax_referer( 'chat_to_blog', 'nonce' );

		$chat_id = sanitize_text_field( $_POST['chat_id'] ?? '' );
		$cursor = sanitize_text_field( $_POST['cursor'] ?? '' );
		$limit = intval( $_POST['limit'] ?? 50 );

		if ( empty( $chat_id ) ) {
			wp_send_json_error( 'Chat ID required' );
		}

		$result = $this->beeper->get_media_messages( $chat_id, $limit, $cursor ?: null );

		if ( is_wp_error( $result ) ) {
			wp_send_json_error( $result->get_error_message() );
		}

		$media = [];
		foreach ( $result['items'] as $item ) {
			$beeper_id = $item['message_id'] . '_' . $item['attachment_index'];

			$url = $item['mxcUrl'] ?? '';
			$thumbnail_url = $item['posterImg'] ?? $url;

			// Skip items without a valid mxc URL
			if ( empty( $url ) || strpos( $url, 'localmxc://' ) !== 0 ) {
				continue;
			}

			$media[] = [
				'id'           => $beeper_id,
				'url'          => $url,
				'thumbnailUrl' => $thumbnail_url,
				'fileName'     => $item['fileName'] ?: 'image.jpg',
				'mimeType'     => $item['mimeType'],
				'fileSize'     => $item['fileSize'],
				'type'         => $item['type'],
				'width'        => $item['width'],
				'height'       => $item['height'],
				'isGif'        => $item['isGif'],
				'timestamp'    => $item['timestamp'],
				'sender'       => $item['sender'],
				'text'         => $item['text'],
				'imported'     => $this->importer->is_imported( $url ),
			];
		}

		wp_send_json_success( [
			'media'      => $media,
			'hasMore'    => $result['hasMore'],
			'nextCursor' => $result['next_cursor'],
		] );
	}

	public function ajax_serve_media() {
		check_ajax_referer( 'chat_to_blog', 'nonce' );

		$id = isset( $_GET['id'] ) ? urldecode( $_GET['id'] ) : '';

		if ( empty( $id ) ) {
			wp_die( 'No id specified', 400 );
		}

		// Handle localmxc:// and mxc:// URLs via Beeper API
		if ( strpos( $id, 'localmxc://' ) === 0 || strpos( $id, 'mxc://' ) === 0 ) {
			$this->serve_mxc_media( $id );
			return;
		}

		wp_die( 'Invalid media id', 400 );
	}

	private function serve_mxc_media( $mxc_url ) {
		$response = wp_remote_post( 'http://localhost:23373/v1/assets/download', [
			'headers' => [
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $this->beeper->get_token(),
			],
			'body'    => wp_json_encode( [ 'url' => $mxc_url ] ),
			'timeout' => 30,
		] );

		if ( is_wp_error( $response ) ) {
			wp_die( 'Failed to download: ' . $response->get_error_message(), 500 );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code !== 200 ) {
			wp_die( 'Beeper API error: ' . $code, $code );
		}

		$body = wp_remote_retrieve_body( $response );
		$content_type = wp_remote_retrieve_header( $response, 'content-type' );

		// If Beeper returns JSON with a local file path
		if ( strpos( $content_type, 'application/json' ) !== false ) {
			$data = json_decode( $body, true );
			if ( ! empty( $data['srcURL'] ) ) {
				$use_local_server = get_option( 'chat_to_blog_use_local_server', false );
				if ( $use_local_server ) {
					$this->proxy_local_file( $mxc_url );
				} else {
					$this->serve_local_file( $data['srcURL'] );
				}
				return;
			}
			wp_die( 'Could not resolve media', 404 );
		}

		header( 'Content-Type: ' . ( $content_type ?: 'image/jpeg' ) );
		header( 'Content-Length: ' . strlen( $body ) );
		header( 'Cache-Control: public, max-age=86400' );

		echo $body;
		exit;
	}

	private function serve_local_file( $file_url ) {
		$file_path = $file_url;
		if ( strpos( $file_path, 'file://' ) === 0 ) {
			$file_path = substr( $file_path, 7 );
		}
		$file_path = urldecode( $file_path );

		if ( ! file_exists( $file_path ) ) {
			wp_die( 'File not found: ' . $file_path, 404 );
		}

		$mime_type = mime_content_type( $file_path );
		header( 'Content-Type: ' . $mime_type );
		header( 'Content-Length: ' . filesize( $file_path ) );
		header( 'Cache-Control: public, max-age=86400' );
		readfile( $file_path );
		exit;
	}

	private function proxy_local_file( $mxc_url ) {
		$local_server = get_option( 'chat_to_blog_local_server', 'http://localhost:8787' );
		$proxy_url = $local_server . '?id=' . urlencode( $mxc_url ) . '&token=' . urlencode( $this->beeper->get_token() );

		$response = wp_remote_get( $proxy_url, [ 'timeout' => 30 ] );

		if ( is_wp_error( $response ) ) {
			wp_die( 'Local media server error: ' . $response->get_error_message() . '. Is local-media-server.php running?', 500 );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code !== 200 ) {
			$body = wp_remote_retrieve_body( $response );
			wp_die( 'Local media server returned ' . $code . ': ' . $body, $code );
		}

		$body = wp_remote_retrieve_body( $response );
		$content_type = wp_remote_retrieve_header( $response, 'content-type' );

		header( 'Content-Type: ' . ( $content_type ?: 'image/jpeg' ) );
		header( 'Content-Length: ' . strlen( $body ) );
		header( 'Cache-Control: public, max-age=86400' );

		echo $body;
		exit;
	}

	public function ajax_create_post() {
		check_ajax_referer( 'chat_to_blog', 'nonce' );

		if ( ! current_user_can( 'edit_posts' ) || ! current_user_can( 'upload_files' ) ) {
			wp_send_json_error( 'Permission denied' );
		}

		$post_id = intval( $_POST['post_id'] ?? 0 );
		$title = sanitize_text_field( $_POST['title'] ?? '' );
		$content = wp_kses_post( $_POST['content'] ?? '' );
		$format = sanitize_text_field( $_POST['format'] ?? 'gallery' );
		$status = sanitize_text_field( $_POST['status'] ?? 'draft' );
		$post_date = sanitize_text_field( $_POST['post_date'] ?? '' );
		$images_json = stripslashes( $_POST['images'] ?? '[]' );
		$images = json_decode( $images_json, true );
		$chat_id = sanitize_text_field( $_POST['chat_id'] ?? '' );

		if ( empty( $title ) ) {
			wp_send_json_error( 'Title is required' );
		}

		if ( empty( $images ) && ! $post_id ) {
			wp_send_json_error( 'No images selected' );
		}

		// If updating existing post (without new images)
		if ( $post_id && empty( $images ) ) {
			$post = get_post( $post_id );
			if ( ! $post || ! current_user_can( 'edit_post', $post_id ) ) {
				wp_send_json_error( 'Cannot edit this post' );
			}

			$post_args = [
				'ID'           => $post_id,
				'post_title'   => $title,
				'post_status'  => $status,
			];

			if ( ! empty( $post_date ) ) {
				$date = new \DateTime( $post_date );
				$post_args['post_date'] = $date->format( 'Y-m-d H:i:s' );
				$post_args['post_date_gmt'] = get_gmt_from_date( $post_args['post_date'] );
			}

			wp_update_post( $post_args );

			wp_send_json_success( [
				'post_id'  => $post_id,
				'edit_url' => get_edit_post_link( $post_id, 'raw' ),
				'view_url' => get_permalink( $post_id ),
				'imported' => 0,
				'images'   => [],
			] );
			return;
		}

		// Validate existing post if updating
		if ( $post_id ) {
			$post = get_post( $post_id );
			if ( ! $post || ! current_user_can( 'edit_post', $post_id ) ) {
				wp_send_json_error( 'Cannot edit this post' );
			}
		}

		// Import images from base64 data
		$imported_images = []; // {mxcUrl, attachmentId}
		$base_filename = sanitize_file_name( $title );
		$import_errors = [];

		foreach ( $images as $index => $image ) {
			$mxc_url = $image['mxcUrl'] ?? null;
			$data_url = $image['dataUrl'] ?? null;

			if ( ! $mxc_url || ! $data_url ) {
				continue;
			}

			// Check if already imported
			if ( $this->importer->is_imported( $mxc_url ) ) {
				$imported_images[] = [
					'mxcUrl'       => $mxc_url,
					'attachmentId' => $this->importer->get_attachment_id( $mxc_url ),
				];
				continue;
			}

			// Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
			if ( ! preg_match( '/^data:([^;]+);base64,(.+)$/', $data_url, $matches ) ) {
				$import_errors[] = 'Invalid data URL format';
				continue;
			}

			$mime_type = $matches[1];
			$base64_data = $matches[2];
			$binary_data = base64_decode( $base64_data );

			if ( $binary_data === false ) {
				$import_errors[] = 'Failed to decode base64 data';
				continue;
			}

			// Build filename
			$ext = $this->get_extension_from_mime( $mime_type ) ?: 'jpg';
			$filename = count( $images ) > 1
				? $base_filename . '-' . ( $index + 1 ) . '.' . $ext
				: $base_filename . '.' . $ext;

			// Save to WordPress media library
			$result = $this->save_to_media_library( $binary_data, $filename, $mime_type, $mxc_url );

			if ( is_wp_error( $result ) ) {
				$import_errors[] = $result->get_error_message();
			} else {
				$imported_images[] = [
					'mxcUrl'       => $mxc_url,
					'attachmentId' => $result,
				];
			}
		}

		$attachment_ids = array_column( $imported_images, 'attachmentId' );

		if ( empty( $attachment_ids ) ) {
			wp_send_json_error( 'Failed to import images: ' . implode( ', ', $import_errors ) );
		}

		// Build image blocks for new images
		$new_image_blocks = $this->build_image_blocks( $attachment_ids );

		if ( $post_id ) {
			// Updating existing post - append new images to content
			$existing_post = get_post( $post_id );
			$existing_content = $existing_post->post_content;

			// Insert new images before any text content (after existing images)
			// Find the last image/gallery block and insert after it
			$post_content = $existing_content . "\n\n" . $new_image_blocks;

			$post_args = [
				'ID'           => $post_id,
				'post_title'   => $title,
				'post_content' => $post_content,
				'post_status'  => $status,
			];

			if ( ! empty( $post_date ) ) {
				$date = new \DateTime( $post_date );
				$post_args['post_date'] = $date->format( 'Y-m-d H:i:s' );
				$post_args['post_date_gmt'] = get_gmt_from_date( $post_args['post_date'] );
			}

			wp_update_post( $post_args );
		} else {
			// Creating new post
			if ( $format === 'gallery' ) {
				$gallery_block = $this->build_gallery_block( $attachment_ids );
				$post_content = $gallery_block . ( $content ? "\n\n" . $content : '' );
			} else {
				$post_content = $new_image_blocks . ( $content ? "\n\n" . $content : '' );
			}

			$post_args = [
				'post_title'   => $title,
				'post_content' => $post_content,
				'post_status'  => $status,
				'post_type'    => 'post',
			];

			if ( ! empty( $post_date ) ) {
				$date = new \DateTime( $post_date );
				$post_args['post_date'] = $date->format( 'Y-m-d H:i:s' );
				$post_args['post_date_gmt'] = get_gmt_from_date( $post_args['post_date'] );
				$post_args['post_status'] = 'publish';
			}

			$post_id = wp_insert_post( $post_args );

			if ( is_wp_error( $post_id ) ) {
				wp_send_json_error( $post_id->get_error_message() );
			}
		}

		// Attach all images to this post
		foreach ( $attachment_ids as $attachment_id ) {
			wp_update_post( [
				'ID'          => $attachment_id,
				'post_parent' => $post_id,
			] );
		}

		wp_send_json_success( [
			'post_id'  => $post_id,
			'edit_url' => get_edit_post_link( $post_id, 'raw' ),
			'view_url' => get_permalink( $post_id ),
			'imported' => count( $attachment_ids ),
			'images'   => $imported_images,
			'errors'   => $import_errors,
		] );
	}

	private function get_extension_from_mime( $mime_type ) {
		$map = [
			'image/jpeg' => 'jpg',
			'image/png'  => 'png',
			'image/gif'  => 'gif',
			'image/webp' => 'webp',
			'image/heic' => 'heic',
			'video/mp4'  => 'mp4',
			'video/quicktime' => 'mov',
		];
		return $map[ $mime_type ] ?? null;
	}

	private function build_gallery_block( $attachment_ids ) {
		$images = [];
		foreach ( $attachment_ids as $id ) {
			$url = wp_get_attachment_url( $id );
			$alt = get_post_meta( $id, '_wp_attachment_image_alt', true );
			if ( $url ) {
				$images[] = [
					'id'  => $id,
					'url' => $url,
					'alt' => $alt ?: '',
				];
			}
		}

		$inner_blocks = '';
		foreach ( $images as $img ) {
			$inner_blocks .= sprintf(
				'<!-- wp:image {"id":%d,"sizeSlug":"large","linkDestination":"none"} -->' .
				'<figure class="wp-block-image size-large"><img src="%s" alt="%s" class="wp-image-%d"/></figure>' .
				'<!-- /wp:image -->',
				$img['id'],
				esc_url( $img['url'] ),
				esc_attr( $img['alt'] ),
				$img['id']
			);
		}

		return sprintf(
			'<!-- wp:gallery {"linkTo":"none"} -->' .
			'<figure class="wp-block-gallery has-nested-images columns-default is-cropped">%s</figure>' .
			'<!-- /wp:gallery -->',
			$inner_blocks
		);
	}

	private function build_image_blocks( $attachment_ids ) {
		$blocks = '';
		foreach ( $attachment_ids as $id ) {
			$url = wp_get_attachment_url( $id );
			$alt = get_post_meta( $id, '_wp_attachment_image_alt', true );
			if ( $url ) {
				$blocks .= sprintf(
					'<!-- wp:image {"id":%d,"sizeSlug":"large","linkDestination":"none"} -->' .
					'<figure class="wp-block-image size-large"><img src="%s" alt="%s" class="wp-image-%d"/></figure>' .
					'<!-- /wp:image -->' . "\n\n",
					$id,
					esc_url( $url ),
					esc_attr( $alt ?: '' ),
					$id
				);
			}
		}
		return trim( $blocks );
	}

	private function save_to_media_library( $binary_data, $filename, $mime_type, $mxc_url = null ) {
		$upload = wp_upload_bits( $filename, null, $binary_data );

		if ( $upload['error'] ) {
			return new \WP_Error( 'upload_error', $upload['error'] );
		}

		$attachment = [
			'post_mime_type' => $mime_type,
			'post_title'     => pathinfo( $filename, PATHINFO_FILENAME ),
			'post_content'   => '',
			'post_status'    => 'inherit',
		];

		$attachment_id = wp_insert_attachment( $attachment, $upload['file'] );

		if ( is_wp_error( $attachment_id ) ) {
			return $attachment_id;
		}

		require_once ABSPATH . 'wp-admin/includes/image.php';
		$metadata = wp_generate_attachment_metadata( $attachment_id, $upload['file'] );
		wp_update_attachment_metadata( $attachment_id, $metadata );

		// Track the mxc URL for deduplication
		if ( $mxc_url ) {
			update_post_meta( $attachment_id, '_chat_to_blog_mxc_url', $mxc_url );
		}

		return $attachment_id;
	}
}
