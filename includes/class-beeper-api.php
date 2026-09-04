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

	public static function anonymize_name( $name ) {
		if ( empty( $name ) ) {
			return $name;
		}

		$names       = apply_filters( 'beeper_demo_names', [ 'first' => [], 'last' => [] ] );
		$first_names = $names['first'] ?? [];
		$last_names  = $names['last'] ?? [];

		if ( empty( $first_names ) ) {
			return $name;
		}

		$sum = 0;
		foreach ( mb_str_split( $name ) as $char ) {
			$sum += mb_ord( $char );
		}

		$first = $first_names[ $sum % count( $first_names ) ];

		if ( ! empty( $last_names ) && strpos( trim( $name ), ' ' ) !== false ) {
			return $first . ' ' . $last_names[ ( $sum * 7 + 3 ) % count( $last_names ) ];
		}

		return $first;
	}
}
