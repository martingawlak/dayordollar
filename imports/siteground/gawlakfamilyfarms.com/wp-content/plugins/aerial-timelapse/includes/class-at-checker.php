<?php
/**
 * Feature 3, traffic-driven: the new-imagery check runs when a customer
 * logs in — at most once per week per customer, with each customer's weekly
 * cycle staggered by signup date so cohorts never check on the same day.
 * No host cron required (WP-Cron is not used either).
 *
 * A full sweep of all customers is still available for manual/bulk use:
 *   - REST:   curl -s "https://SITE/wp-json/aerial-timelapse/v1/check-updates?token=TOKEN"
 *   - WP-CLI: wp aerial-timelapse check
 *
 * The check itself is one catalog query per property (no image downloads —
 * frames are hotlinked from the provider), so running it inline on login is
 * cheap. When a new NAIP flight covers the property, the frame is appended
 * and the 30-day glow armed.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AT_Checker {

	const TOKEN_OPTION    = 'at_check_token';
	const LAST_RUN_OPTION = 'at_last_check';

	public static function init(): void {
		add_action( 'wp_login', array( __CLASS__, 'on_login' ), 10, 2 );
	}

	public static function activate(): void {
		if ( ! get_option( self::TOKEN_OPTION ) ) {
			add_option( self::TOKEN_OPTION, wp_generate_password( 40, false, false ), '', false );
		}
		// Clean up the WP-Cron event from pre-1.0 builds, if present.
		wp_clear_scheduled_hook( 'at_daily_update_check' );
	}

	public static function deactivate(): void {
		wp_clear_scheduled_hook( 'at_daily_update_check' );
	}

	public static function token(): string {
		return (string) get_option( self::TOKEN_OPTION, '' );
	}

	public static function verify_token( string $token ): bool {
		$expected = self::token();
		return '' !== $expected && hash_equals( $expected, $token );
	}

	public static function last_run(): ?array {
		$last = get_option( self::LAST_RUN_OPTION );
		return is_array( $last ) ? $last : null;
	}

	/** Login hook: run this customer's check if their weekly window is due. */
	public static function on_login( string $user_login, WP_User $user ): void {
		$property = AT_Property::get( $user->ID );
		if ( ! $property ) {
			return;
		}

		if ( empty( $property['next_check_due'] ) ) {
			// First cycle: stagger 0-6 days by signup date, so customers who
			// signed up together don't all hit the catalog the same day.
			$offset                     = absint( crc32( (string) $user->user_registered ) ) % 7;
			$property['next_check_due'] = time() + $offset * DAY_IN_SECONDS;
			AT_Property::save( $user->ID, $property );
			return;
		}

		if ( time() < (int) $property['next_check_due'] ) {
			return;
		}
		self::check_user( $user->ID );
	}

	/**
	 * Checks one customer's property for new imagery. Appends any new frame,
	 * arms the 30-day glow, and schedules the next weekly window.
	 *
	 * @return array{ updated: bool, errors: string[] }
	 */
	public static function check_user( int $user_id ): array {
		$result   = array(
			'updated' => false,
			'errors'  => array(),
		);
		$property = AT_Property::get( $user_id );
		if ( ! $property ) {
			return $result;
		}

		// Schedule the next window up front so a failing catalog can't cause
		// a retry storm on every login.
		$property['next_check_due'] = time() + WEEK_IN_SECONDS;

		$frames = at_imagery_source()->search_frames( $property['lat'], $property['lng'] );
		if ( is_wp_error( $frames ) ) {
			$result['errors'][] = "user {$user_id}: " . $frames->get_error_message();
			AT_Property::save( $user_id, $property );
			return $result;
		}
		$property['last_checked_at'] = gmdate( 'c' );

		$known = wp_list_pluck( $property['frames'], 'item_id' );
		foreach ( $frames as $frame ) {
			if ( in_array( $frame['item_id'], $known, true ) ) {
				continue;
			}
			$entry = AT_Fetcher::frame_entry( $user_id, $frame, $property['lat'], $property['lng'] );
			if ( is_wp_error( $entry ) ) {
				$result['errors'][] = "user {$user_id} / {$frame['item_id']}: " . $entry->get_error_message();
				continue;
			}
			$property['frames'][] = $entry;
			$result['updated']    = true;
		}

		if ( $result['updated'] ) {
			usort( $property['frames'], fn( $a, $b ) => strcmp( $a['date'], $b['date'] ) );
			$property['latest_item_id']  = end( $property['frames'] )['item_id'];
			$property['last_updated_at'] = gmdate( 'c' );
			AT_Property::arm_glow( $property );
		}

		AT_Property::save( $user_id, $property );
		return $result;
	}

	/** Full sweep over every saved property (manual REST/CLI use). */
	public static function run(): array {
		$results = array(
			'checked' => 0,
			'updated' => array(),
			'errors'  => array(),
		);

		foreach ( AT_Property::all_user_ids() as $user_id ) {
			$results['checked']++;
			$check             = self::check_user( $user_id );
			$results['errors'] = array_merge( $results['errors'], $check['errors'] );
			if ( $check['updated'] ) {
				$results['updated'][] = $user_id;
			}
		}

		update_option(
			self::LAST_RUN_OPTION,
			array(
				'time'    => gmdate( 'c' ),
				'checked' => $results['checked'],
				'updated' => count( $results['updated'] ),
				'errors'  => $results['errors'],
			),
			false
		);

		return $results;
	}
}
