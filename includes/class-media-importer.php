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

}
