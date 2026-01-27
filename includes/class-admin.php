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
		add_action( 'wp_ajax_ctb_get_chats', [ $this, 'ajax_get_chats' ] );
		add_action( 'wp_ajax_ctb_get_media', [ $this, 'ajax_get_media' ] );
		add_action( 'wp_ajax_ctb_serve_media', [ $this, 'ajax_serve_media' ] );
		add_action( 'wp_ajax_ctb_create_post', [ $this, 'ajax_create_post' ] );
	}

	public function register_menus() {
		add_submenu_page(
			'edit.php',
			__( 'Chat to Blog', 'chat-to-blog' ),
			__( 'Chat to Blog', 'chat-to-blog' ),
			'edit_posts',
			'chat-to-blog',
			[ $this, 'render_media_browser' ]
		);

		add_options_page(
			__( 'Chat to Blog', 'chat-to-blog' ),
			__( 'Chat to Blog', 'chat-to-blog' ),
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
			[ 'jquery', 'sortablejs', 'chat-to-blog-beeper-client', 'wp-i18n' ],
			CHAT_TO_BLOG_VERSION,
			true
		);

		wp_localize_script( 'chat-to-blog-admin', 'ctbConfig', [
			'ajaxUrl'         => admin_url( 'admin-ajax.php' ),
			'nonce'           => wp_create_nonce( 'chat_to_blog' ),
			'beeperToken'     => $this->beeper->get_token(),
			'importedUrls'    => array_keys( $this->importer->get_all_imported_urls() ),
		] );

		wp_set_script_translations( 'chat-to-blog-admin', 'chat-to-blog', CHAT_TO_BLOG_PATH . 'languages' );
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
			wp_send_json_error( __( 'Permission denied', 'chat-to-blog' ) );
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
			wp_send_json_error( __( 'Permission denied', 'chat-to-blog' ) );
		}

		$token = sanitize_text_field( $_POST['token'] ?? '' );
		$this->beeper->set_token( $token );

		if ( ! empty( $token ) ) {
			$test = $this->beeper->test_connection();
			if ( is_wp_error( $test ) ) {
				/* translators: %s: error message */
				wp_send_json_error( sprintf( __( 'Token saved but connection failed: %s', 'chat-to-blog' ), $test->get_error_message() ) );
			}
			wp_send_json_success( [ 'connected' => true, 'accounts' => $test['accounts'] ] );
		}

		wp_send_json_success( [ 'cleared' => true ] );
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
			wp_send_json_error( __( 'Chat ID required', 'chat-to-blog' ) );
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

			// Skip items without a valid media URL
			if ( empty( $url ) ) {
				continue;
			}
			if ( strpos( $url, 'localmxc://' ) !== 0 && strpos( $url, 'mxc://' ) !== 0 && strpos( $url, 'file://' ) !== 0 ) {
				continue;
			}

			$filename = $item['fileName'];
			if ( empty( $filename ) ) {
				$ext = $this->get_extension_from_mime( $item['mimeType'] ) ?: 'jpg';
				$filename = 'media.' . $ext;
			}

			$media[] = [
				'id'           => $beeper_id,
				'url'          => $url,
				'thumbnailUrl' => $thumbnail_url,
				'fileName'     => $filename,
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
			wp_die( esc_html__( 'No id specified', 'chat-to-blog' ), 400 );
		}

		if ( strpos( $id, 'localmxc://' ) === 0 || strpos( $id, 'mxc://' ) === 0 || strpos( $id, 'file://' ) === 0 ) {
			$this->serve_mxc_media( $id );
			return;
		}

		wp_die( esc_html__( 'Invalid media id', 'chat-to-blog' ), 400 );
	}

	private function serve_mxc_media( $media_url ) {
		// Handle file:// URLs by reading directly from disk
		if ( strpos( $media_url, 'file://' ) === 0 ) {
			$file_path = urldecode( substr( $media_url, 7 ) );
			if ( ! file_exists( $file_path ) ) {
				/* translators: %s: file path */
				wp_die( esc_html( sprintf( __( 'File not found: %s', 'chat-to-blog' ), $file_path ) ), 404 );
			}

			$mime_type = mime_content_type( $file_path );
			header( 'Content-Type: ' . $mime_type );
			header( 'Content-Length: ' . filesize( $file_path ) );
			header( 'Cache-Control: public, max-age=86400' );
			readfile( $file_path );
			exit;
		}

		// Handle mxc:// and localmxc:// URLs via Beeper API
		$url = 'http://localhost:23373/v1/assets/serve?' . http_build_query( [ 'url' => $media_url ] );

		$response = wp_remote_get( $url, [
			'headers' => [
				'Authorization' => 'Bearer ' . $this->beeper->get_token(),
			],
			'timeout' => 30,
		] );

		if ( is_wp_error( $response ) ) {
			/* translators: %s: error message */
			wp_die( esc_html( sprintf( __( 'Failed to download: %s', 'chat-to-blog' ), $response->get_error_message() ) ), 500 );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code !== 200 ) {
			/* translators: %d: HTTP error code */
			wp_die( esc_html( sprintf( __( 'Beeper API error: %d', 'chat-to-blog' ), $code ) ), $code );
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
			wp_send_json_error( __( 'Permission denied', 'chat-to-blog' ) );
		}

		$post_id = intval( $_POST['post_id'] ?? 0 );
		$title = sanitize_text_field( $_POST['title'] ?? '' );
		$content = wp_kses_post( $_POST['content'] ?? '' );
		$format = sanitize_text_field( $_POST['format'] ?? 'gallery' );
		$status = sanitize_text_field( $_POST['status'] ?? 'draft' );
		$post_date = sanitize_text_field( $_POST['post_date'] ?? '' );
		$category = intval( $_POST['category'] ?? 0 );
		$images_json = stripslashes( $_POST['images'] ?? '[]' );
		$images = json_decode( $images_json, true );
		$chat_id = sanitize_text_field( $_POST['chat_id'] ?? '' );

		if ( empty( $title ) ) {
			wp_send_json_error( __( 'Title is required', 'chat-to-blog' ) );
		}

		if ( empty( $images ) && ! $post_id ) {
			wp_send_json_error( __( 'No media selected', 'chat-to-blog' ) );
		}

		// If updating existing post (without new images)
		if ( $post_id && empty( $images ) ) {
			$post = get_post( $post_id );
			if ( ! $post || ! current_user_can( 'edit_post', $post_id ) ) {
				wp_send_json_error( __( 'Cannot edit this post', 'chat-to-blog' ) );
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

			if ( $category > 0 ) {
				wp_set_post_categories( $post_id, [ $category ] );
			}

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
				wp_send_json_error( __( 'Cannot edit this post', 'chat-to-blog' ) );
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

			if ( ! preg_match( '/^data:([^;]+);base64,(.+)$/', $data_url, $matches ) ) {
				$import_errors[] = __( 'Invalid data URL format', 'chat-to-blog' );
				continue;
			}

			$mime_type = $matches[1];
			$base64_data = $matches[2];
			$binary_data = base64_decode( $base64_data );

			if ( $binary_data === false ) {
				$import_errors[] = __( 'Failed to decode base64 data', 'chat-to-blog' );
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
			/* translators: %s: comma-separated list of error messages */
			wp_send_json_error( sprintf( __( 'Failed to import media: %s', 'chat-to-blog' ), implode( ', ', $import_errors ) ) );
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
			$text_block = '';
			if ( $content ) {
				$text_block = sprintf(
					"<!-- wp:paragraph -->\n<p>%s</p>\n<!-- /wp:paragraph -->\n\n",
					esc_html( $content )
				);
			}

			if ( $format === 'gallery' ) {
				$post_content = $text_block . $this->build_mixed_gallery_content( $attachment_ids );
			} else {
				$post_content = $text_block . $new_image_blocks;
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

		if ( $category > 0 ) {
			wp_set_post_categories( $post_id, [ $category ] );
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
			'image/jpeg'       => 'jpg',
			'image/png'        => 'png',
			'image/gif'        => 'gif',
			'image/webp'       => 'webp',
			'image/heic'       => 'heic',
			'image/heif'       => 'heif',
			'image/avif'       => 'avif',
			'image/svg+xml'    => 'svg',
			'image/bmp'        => 'bmp',
			'image/tiff'       => 'tiff',
			'video/mp4'        => 'mp4',
			'video/quicktime'  => 'mov',
			'video/webm'       => 'webm',
			'video/x-msvideo'  => 'avi',
			'video/x-matroska' => 'mkv',
			'video/3gpp'       => '3gp',
		];
		return $map[ $mime_type ] ?? null;
	}

	private function build_mixed_gallery_content( $attachment_ids ) {
		$image_ids = [];
		$video_ids = [];

		foreach ( $attachment_ids as $id ) {
			$mime_type = get_post_mime_type( $id );
			if ( strpos( $mime_type, 'video/' ) === 0 ) {
				$video_ids[] = $id;
			} else {
				$image_ids[] = $id;
			}
		}

		$content = '';

		if ( ! empty( $image_ids ) ) {
			$content .= $this->build_gallery_block( $image_ids );
		}

		foreach ( $video_ids as $video_id ) {
			$content .= "\n\n" . trim( $this->build_video_block( $video_id ) );
		}

		return trim( $content );
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
			$mime_type = get_post_mime_type( $id );

			if ( ! $url ) {
				continue;
			}

			if ( strpos( $mime_type, 'video/' ) === 0 ) {
				$blocks .= $this->build_video_block( $id, $url );
			} else {
				$alt = get_post_meta( $id, '_wp_attachment_image_alt', true );
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

	private function build_video_block( $id, $url = null ) {
		if ( ! $url ) {
			$url = wp_get_attachment_url( $id );
		}

		if ( ! $url ) {
			return '';
		}

		return sprintf(
			'<!-- wp:video {"id":%d} -->' .
			'<figure class="wp-block-video"><video controls src="%s"></video></figure>' .
			'<!-- /wp:video -->' . "\n\n",
			$id,
			esc_url( $url )
		);
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
