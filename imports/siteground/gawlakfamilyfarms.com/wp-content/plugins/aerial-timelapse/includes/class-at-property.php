<?php
/**
 * Per-user property record, stored in user meta under a single key.
 *
 * Shape:
 *   address, lat, lng,
 *   frames: [ { item_id, date (Y-m-d), file (relative to uploads), url } ]  — chronological
 *   latest_item_id, last_checked_at, last_updated_at,
 *   is_new_update (bool), new_update_expiry (ISO datetime|null)
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AT_Property {

	const META_KEY        = 'at_property';
	const GLOW_DAYS       = 30;

	public static function get( int $user_id ): ?array {
		$property = get_user_meta( $user_id, self::META_KEY, true );
		if ( ! is_array( $property ) || empty( $property['lat'] ) ) {
			return null;
		}
		// Feature 4 auto-expiration: lazily clear the glow once expired.
		if ( ! empty( $property['is_new_update'] ) && ! empty( $property['new_update_expiry'] )
			&& strtotime( $property['new_update_expiry'] ) < time() ) {
			$property['is_new_update']     = false;
			$property['new_update_expiry'] = null;
			self::save( $user_id, $property );
		}
		return $property;
	}

	public static function save( int $user_id, array $property ): void {
		update_user_meta( $user_id, self::META_KEY, $property );
	}

	public static function delete( int $user_id ): void {
		$property = self::get( $user_id );
		if ( $property && ! empty( $property['frames'] ) ) {
			$uploads = wp_get_upload_dir();
			foreach ( $property['frames'] as $frame ) {
				if ( ! empty( $frame['file'] ) ) {
					@unlink( trailingslashit( $uploads['basedir'] ) . $frame['file'] );
				}
			}
		}
		delete_user_meta( $user_id, self::META_KEY );
	}

	/** Arms the 30-day "new imagery" glow (Feature 4 trigger). */
	public static function arm_glow( array &$property ): void {
		$property['is_new_update']     = true;
		$property['new_update_expiry'] = gmdate( 'c', time() + self::GLOW_DAYS * DAY_IN_SECONDS );
	}

	public static function is_glowing( array $property ): bool {
		return ! empty( $property['is_new_update'] )
			&& ! empty( $property['new_update_expiry'] )
			&& strtotime( $property['new_update_expiry'] ) > time();
	}

	/** IDs of every user that has a saved property (for the daily cron sweep). */
	public static function all_user_ids(): array {
		return get_users(
			array(
				'meta_key' => self::META_KEY,
				'fields'   => 'ID',
				'number'   => -1,
			)
		);
	}
}
