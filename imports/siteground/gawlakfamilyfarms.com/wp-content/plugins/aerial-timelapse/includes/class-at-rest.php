<?php
/**
 * REST API — the frontend consumes these same endpoints a future native
 * shell (Capacitor-wrapped PWA) will call directly.
 *
 *   GET  /wp-json/aerial-timelapse/v1/property            — own timelapse (cookie or application-password auth)
 *   GET  /wp-json/aerial-timelapse/v1/property?user_id=N  — a customer's timelapse (staff only)
 *   POST /wp-json/aerial-timelapse/v1/property {address}  — build own timelapse
 *   GET|POST /wp-json/aerial-timelapse/v1/check-updates   — daily delta check; token-protected,
 *                                                           driven by a real host cron (not WP-Cron)
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AT_Rest {

	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	public static function routes(): void {
		register_rest_route(
			'aerial-timelapse/v1',
			'/property',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_property' ),
					'permission_callback' => fn() => is_user_logged_in(),
					'args'                => array(
						'user_id' => array(
							'type'              => 'integer',
							'required'          => false,
							'sanitize_callback' => 'absint',
						),
					),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'create' ),
					'permission_callback' => fn() => is_user_logged_in(),
					'args'                => array(
						'address' => array(
							'required'          => true,
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						),
					),
				),
			)
		);

		register_rest_route(
			'aerial-timelapse/v1',
			'/check-updates',
			array(
				'methods'             => array( 'GET', 'POST' ),
				'callback'            => array( __CLASS__, 'check_updates' ),
				'permission_callback' => array( __CLASS__, 'can_check' ),
			)
		);
	}

	private static function property_payload( ?array $property ): array {
		if ( ! $property ) {
			return array( 'has_property' => false );
		}
		return array(
			'has_property'      => true,
			'address'           => $property['address'],
			'frames'            => array_map(
				fn( $frame ) => array(
					'url'  => $frame['url'],
					'date' => $frame['date'],
				),
				$property['frames']
			),
			'is_new_update'     => AT_Property::is_glowing( $property ),
			'new_update_expiry' => $property['new_update_expiry'],
			'last_updated_at'   => $property['last_updated_at'],
			'source'            => 'USDA NAIP (public domain)',
		);
	}

	public static function get_property( WP_REST_Request $request ) {
		$user_id = (int) ( $request['user_id'] ?: get_current_user_id() );
		if ( get_current_user_id() !== $user_id && ! current_user_can( 'edit_users' ) ) {
			return new WP_REST_Response( array( 'error' => 'Not allowed.' ), 403 );
		}
		$payload = self::property_payload( AT_Property::get( $user_id ) );
		if ( ! $payload['has_property'] ) {
			$payload['suggested_address'] = self::billing_address( $user_id );
		}
		return new WP_REST_Response( $payload, 200 );
	}

	/**
	 * WooCommerce billing address from user meta (WC stores billing_* keys
	 * there, so this works without calling WC directly). Used to prefill the
	 * setup form; empty string when there's nothing usable.
	 */
	private static function billing_address( int $user_id ): string {
		$street = trim( (string) get_user_meta( $user_id, 'billing_address_1', true ) );
		$city   = trim( (string) get_user_meta( $user_id, 'billing_city', true ) );
		if ( '' === $street || '' === $city ) {
			return '';
		}
		$state = trim( (string) get_user_meta( $user_id, 'billing_state', true ) );
		$zip   = trim( (string) get_user_meta( $user_id, 'billing_postcode', true ) );
		return trim( "{$street}, {$city}, {$state} {$zip}", ', ' );
	}

	public static function create( WP_REST_Request $request ) {
		$property = AT_Fetcher::build_property( get_current_user_id(), $request['address'] );
		if ( is_wp_error( $property ) ) {
			return new WP_REST_Response( array( 'error' => $property->get_error_message() ), 400 );
		}
		return new WP_REST_Response( self::property_payload( $property ), 201 );
	}

	/** Host-cron token (header X-AT-Token or ?token=) or an admin session. */
	public static function can_check( WP_REST_Request $request ): bool {
		$token = $request->get_header( 'X-AT-Token' );
		if ( ! $token ) {
			$token = (string) $request->get_param( 'token' );
		}
		if ( $token && AT_Checker::verify_token( $token ) ) {
			return true;
		}
		return current_user_can( 'manage_options' );
	}

	public static function check_updates() {
		$result = AT_Checker::run();
		return new WP_REST_Response(
			array(
				'checked' => $result['checked'],
				'updated' => $result['updated'],
				'errors'  => $result['errors'],
			),
			200
		);
	}
}
