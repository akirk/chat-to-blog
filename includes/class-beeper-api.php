<?php
/**
 * Beeper API Client
 *
 * Connects to Beeper Desktop local API to fetch chats and messages.
 * API documentation: https://developers.beeper.com/desktop-api
 */

namespace ChatToBlog;

class BeeperAPI {
	private $api_base = 'http://localhost:23373/v1';
	private $token;
	private $user_id;

	public function __construct( $user_id = null ) {
		$this->user_id = $user_id ?: get_current_user_id();
		$this->token = $this->user_id ? get_user_meta( $this->user_id, 'chat_to_blog_beeper_token', true ) : '';
	}

	public function is_configured() {
		return ! empty( $this->token );
	}

	public function set_token( $token ) {
		if ( ! $this->user_id ) {
			return false;
		}
		$this->token = $token;
		if ( empty( $token ) ) {
			delete_user_meta( $this->user_id, 'chat_to_blog_beeper_token' );
		} else {
			update_user_meta( $this->user_id, 'chat_to_blog_beeper_token', $token );
		}
		return true;
	}

	public function get_token() {
		return $this->token;
	}

	private function request( $endpoint, $params = [] ) {
		if ( ! $this->is_configured() ) {
			return new \WP_Error( 'no_token', __( 'Beeper API token not configured', 'chat-to-blog' ) );
		}

		$url = $this->api_base . $endpoint;
		if ( ! empty( $params ) ) {
			$url .= '?' . http_build_query( $params );
		}

		$response = wp_remote_get( $url, [
			'headers'   => [
				'Authorization' => 'Bearer ' . $this->token,
				'Content-Type'  => 'application/json',
			],
			'timeout'   => 30,
			'sslverify' => false,
		] );

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );

		if ( $code >= 400 ) {
			return new \WP_Error(
				'beeper_api_error',
				$data['message'] ?? __( 'Beeper API error', 'chat-to-blog' ),
				[ 'status' => $code, 'response' => $data ]
			);
		}

		return $data;
	}

	public function get_accounts() {
		return $this->request( '/accounts' );
	}

	public function test_connection() {
		$accounts = $this->get_accounts();

		if ( is_wp_error( $accounts ) ) {
			return $accounts;
		}

		$serve_endpoint = $this->check_serve_endpoint();

		$result = [
			'success'       => true,
			'accounts'      => count( $accounts ),
			'networks'      => array_unique( array_column( $accounts, 'network' ) ),
			'serveEndpoint' => $serve_endpoint,
		];

		if ( ! $serve_endpoint ) {
			$result['warning'] = __( 'Your Beeper version does not support media streaming. Please update to the latest Beeper Nightly.', 'chat-to-blog' );
		}

		return $result;
	}

	/**
	 * Check if the /assets/serve endpoint is available.
	 * Returns true if available, false if not (old Beeper version).
	 */
	private function check_serve_endpoint() {
		$response = wp_remote_get( $this->api_base . '/assets/serve', [
			'headers'   => [
				'Authorization' => 'Bearer ' . $this->token,
			],
			'timeout'   => 5,
			'sslverify' => false,
		] );

		if ( is_wp_error( $response ) ) {
			return false;
		}

		$code = wp_remote_retrieve_response_code( $response );

		// 400 = endpoint exists but missing url param, 404 = endpoint doesn't exist
		return $code !== 404;
	}

	public function get_all_chats( $limit = 200 ) {
		$result = $this->request( '/chats', [ 'limit' => $limit ] );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$items = $result['items'] ?? $result;

		if ( ! is_array( $items ) ) {
			return [ 'items' => [], 'hasMore' => false ];
		}

		usort( $items, function( $a, $b ) {
			$a_time = $a['lastActivity'] ?? '';
			$b_time = $b['lastActivity'] ?? '';
			return strcmp( $b_time, $a_time );
		} );

		return [
			'items'   => $items,
			'hasMore' => $result['hasMore'] ?? false,
		];
	}

	public function get_group_chats( $limit = 200 ) {
		$result = $this->get_all_chats( $limit );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$groups = array_filter( $result['items'], function( $chat ) {
			return ( $chat['type'] ?? '' ) === 'group';
		} );

		return [
			'items'   => array_values( $groups ),
			'hasMore' => $result['hasMore'],
		];
	}

	public function get_chat( $chat_id ) {
		return $this->request( '/chats/' . urlencode( $chat_id ) );
	}

	public function get_chat_messages( $chat_id, $limit = 50, $cursor = null, $direction = 'before' ) {
		$params = [ 'limit' => $limit ];

		if ( $cursor ) {
			$params['cursor'] = $cursor;
			$params['direction'] = $direction;
		}

		return $this->request( '/chats/' . urlencode( $chat_id ) . '/messages', $params );
	}

	public function get_media_messages( $chat_id, $limit = 50, $cursor = null ) {
		$result = $this->get_chat_messages( $chat_id, $limit, $cursor );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$media_messages = [];
		$items = $result['items'] ?? [];

		foreach ( $items as $msg ) {
			$attachments = $msg['attachments'] ?? [];
			foreach ( $attachments as $index => $attachment ) {
				$type = $attachment['type'] ?? 'unknown';

				if ( $type === 'img' || $type === 'video' ) {
					$media_messages[] = [
						'message_id'  => $msg['id'] ?? '',
						'attachment_index' => $index,
						'timestamp'   => $msg['timestamp'] ?? '',
						'sender'      => $msg['senderName'] ?? ( ( $msg['isSender'] ?? false ) ? 'You' : 'Unknown' ),
						'is_sender'   => $msg['isSender'] ?? false,
						'text'        => $msg['text'] ?? '',
						'type'        => $type,
						'mxcUrl'      => $attachment['id'] ?? '',
						'posterImg'   => $attachment['posterImg'] ?? '',
						'fileName'    => $attachment['fileName'] ?? '',
						'fileSize'    => $attachment['fileSize'] ?? 0,
						'mimeType'    => $attachment['mimeType'] ?? '',
						'width'       => $attachment['size']['width'] ?? 0,
						'height'      => $attachment['size']['height'] ?? 0,
						'isGif'       => $attachment['isGif'] ?? false,
						'sort_key'    => $msg['sortKey'] ?? null,
					];
				}
			}
		}

		return [
			'items'       => $media_messages,
			'hasMore'     => $result['hasMore'] ?? false,
			'next_cursor' => ! empty( $items ) ? ( end( $items )['sortKey'] ?? null ) : null,
		];
	}

	/**
	 * Download media from a URL.
	 *
	 * For mxc:// URLs, uses the /assets/serve endpoint.
	 * For file:// URLs (local paths from Beeper), reads directly.
	 * For http(s):// URLs, fetches with auth header.
	 */
	public function download_media( $media_url ) {
		if ( ! $this->is_configured() ) {
			return new \WP_Error( 'no_token', __( 'Beeper API token not configured', 'chat-to-blog' ) );
		}

		if ( empty( $media_url ) ) {
			return new \WP_Error( 'no_url', __( 'No media URL provided', 'chat-to-blog' ) );
		}

		// Handle mxc:// URLs via the assets/serve endpoint
		if ( strpos( $media_url, 'mxc://' ) === 0 || strpos( $media_url, 'localmxc://' ) === 0 ) {
			return $this->download_asset( $media_url );
		}

		// Handle file:// URLs (local paths)
		if ( strpos( $media_url, 'file://' ) === 0 ) {
			$local_path = substr( $media_url, 7 );
			return $this->read_local_file( $local_path );
		}

		// Handle direct local paths
		if ( strpos( $media_url, '/' ) === 0 && file_exists( $media_url ) ) {
			return $this->read_local_file( $media_url );
		}

		// Handle http(s):// URLs
		if ( strpos( $media_url, 'http' ) !== 0 ) {
			$media_url = $this->api_base . $media_url;
		}

		$response = wp_remote_get( $media_url, [
			'headers'   => [
				'Authorization' => 'Bearer ' . $this->token,
			],
			'timeout'   => 60,
			'sslverify' => false,
		] );

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code >= 400 ) {
			return new \WP_Error( 'download_failed', __( 'Failed to download media', 'chat-to-blog' ), [ 'status' => $code ] );
		}

		return [
			'body'         => wp_remote_retrieve_body( $response ),
			'content_type' => wp_remote_retrieve_header( $response, 'content-type' ),
		];
	}

	/**
	 * Download an asset via the Beeper assets/serve endpoint.
	 * Used for mxc:// and localmxc:// URLs.
	 */
	private function download_asset( $mxc_url ) {
		$url = $this->api_base . '/assets/serve?' . http_build_query( [ 'url' => $mxc_url ] );

		$response = wp_remote_get( $url, [
			'headers'   => [
				'Authorization' => 'Bearer ' . $this->token,
			],
			'timeout'   => 60,
			'sslverify' => false,
		] );

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code >= 400 ) {
			return new \WP_Error(
				'asset_download_failed',
				__( 'Failed to download asset', 'chat-to-blog' ),
				[ 'status' => $code ]
			);
		}

		return [
			'body'         => wp_remote_retrieve_body( $response ),
			'content_type' => wp_remote_retrieve_header( $response, 'content-type' ) ?: 'image/jpeg',
		];
	}

	/**
	 * Read a local file (from Beeper's cache).
	 */
	private function read_local_file( $path ) {
		// Handle file:// prefix
		if ( strpos( $path, 'file://' ) === 0 ) {
			$path = substr( $path, 7 );
		}

		// URL decode the path (handles %20 for spaces, etc.)
		$path = urldecode( $path );

		if ( ! file_exists( $path ) ) {
			/* translators: %s: file path */
			return new \WP_Error( 'file_not_found', sprintf( __( 'Local file not found: %s', 'chat-to-blog' ), $path ) );
		}

		$content = file_get_contents( $path );
		if ( $content === false ) {
			return new \WP_Error( 'read_failed', __( 'Failed to read local file', 'chat-to-blog' ) );
		}

		$finfo = finfo_open( FILEINFO_MIME_TYPE );
		$mime_type = finfo_file( $finfo, $path );
		finfo_close( $finfo );

		return [
			'body'         => $content,
			'content_type' => $mime_type ?: 'application/octet-stream',
		];
	}

}
