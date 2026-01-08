<?php
/**
 * Media Importer
 *
 * Downloads media from Beeper and imports to WordPress Media Library.
 */

namespace ChatToBlog;

class MediaImporter {
	private $beeper;

	public function __construct( BeeperAPI $beeper ) {
		$this->beeper = $beeper;
	}

	private $imported_cache = null;

	public function get_all_imported_urls() {
		if ( $this->imported_cache === null ) {
			global $wpdb;
			$results = $wpdb->get_results(
				"SELECT post_id, meta_value FROM {$wpdb->postmeta} WHERE meta_key = '_chat_to_blog_mxc_url'",
				OBJECT
			);
			$this->imported_cache = [];
			foreach ( $results as $row ) {
				$this->imported_cache[ $row->meta_value ] = (int) $row->post_id;
			}
		}
		return $this->imported_cache;
	}

	public function is_imported( $mxc_url ) {
		$imported = $this->get_all_imported_urls();
		return isset( $imported[ $mxc_url ] );
	}

	public function get_attachment_id( $mxc_url ) {
		$imported = $this->get_all_imported_urls();
		return $imported[ $mxc_url ] ?? null;
	}

	public function import_media( $media_url, $filename, $beeper_media_id = null, $metadata = [] ) {
		// Check if already imported by mxc URL
		$existing = $this->get_attachment_id( $media_url );
		if ( $existing ) {
			return $existing;
		}

		$download = $this->beeper->download_media( $media_url );

		if ( is_wp_error( $download ) ) {
			return $download;
		}

		$upload = wp_upload_bits( $filename, null, $download['body'] );

		if ( ! empty( $upload['error'] ) ) {
			return new \WP_Error( 'upload_failed', $upload['error'] );
		}

		$file_type = wp_check_filetype( $upload['file'] );
		$attachment_data = [
			'post_mime_type' => $file_type['type'] ?: $download['content_type'],
			'post_title'     => sanitize_file_name( pathinfo( $filename, PATHINFO_FILENAME ) ),
			'post_content'   => '',
			'post_status'    => 'inherit',
		];

		if ( ! empty( $metadata['caption'] ) ) {
			$attachment_data['post_excerpt'] = $metadata['caption'];
		}

		$attachment_id = wp_insert_attachment( $attachment_data, $upload['file'] );

		if ( is_wp_error( $attachment_id ) ) {
			return $attachment_id;
		}

		require_once ABSPATH . 'wp-admin/includes/image.php';
		$attach_data = wp_generate_attachment_metadata( $attachment_id, $upload['file'] );
		wp_update_attachment_metadata( $attachment_id, $attach_data );

		// Store the mxc URL for duplicate detection
		update_post_meta( $attachment_id, '_chat_to_blog_mxc_url', $media_url );

		// Update cache
		if ( $this->imported_cache !== null ) {
			$this->imported_cache[ $media_url ] = $attachment_id;
		}

		if ( ! empty( $metadata['timestamp'] ) ) {
			update_post_meta( $attachment_id, '_chat_to_blog_timestamp', $metadata['timestamp'] );
		}
		if ( ! empty( $metadata['sender'] ) ) {
			update_post_meta( $attachment_id, '_chat_to_blog_sender', $metadata['sender'] );
		}
		if ( ! empty( $metadata['chat_id'] ) ) {
			update_post_meta( $attachment_id, '_chat_to_blog_chat_id', $metadata['chat_id'] );
		}
		if ( $beeper_media_id ) {
			update_post_meta( $attachment_id, '_chat_to_blog_beeper_id', $beeper_media_id );
		}

		return $attachment_id;
	}

	public function import_multiple( $media_items, $chat_id = '' ) {
		$results = [];

		foreach ( $media_items as $item ) {
			$media_url = $item['url'] ?? '';
			$filename = $item['fileName'] ?? $item['filename'] ?? 'image.jpg';
			$beeper_id = $item['id'] ?? $item['mediaId'] ?? null;

			$metadata = [
				'timestamp' => $item['timestamp'] ?? '',
				'sender'    => $item['sender'] ?? '',
				'caption'   => $item['text'] ?? '',
				'chat_id'   => $chat_id,
			];

			$result = $this->import_media( $media_url, $filename, $beeper_id, $metadata );

			$results[] = [
				'beeper_id'     => $beeper_id,
				'attachment_id' => is_wp_error( $result ) ? null : $result,
				'error'         => is_wp_error( $result ) ? $result->get_error_message() : null,
			];
		}

		return $results;
	}
}
