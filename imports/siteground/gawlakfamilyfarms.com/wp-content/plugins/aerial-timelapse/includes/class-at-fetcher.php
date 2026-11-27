<?php
/**
 * Geocoding + frame download. Because NAIP is public domain we download and
 * store every frame locally (uploads/aerial-timelapse/<user_id>/) so the
 * timelapse replays from our own server with no third-party dependency.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AT_Fetcher {

	const CENSUS_GEOCODER = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

	/** Default crop: ~90m square around the property; override with the 'at_bbox_meters' filter. */
	public static function bbox_meters(): int {
		return (int) apply_filters( 'at_bbox_meters', 90 );
	}

	/** Rendered frame size in pixels; override with the 'at_frame_px' filter. */
	public static function frame_px(): int {
		return (int) apply_filters( 'at_frame_px', 512 );
	}

	/**
	 * Address -> [lat, lng, matched_address] via the free US Census geocoder
	 * (both businesses are US-based; no API key needed).
	 *
	 * @return array|WP_Error array{ lat: float, lng: float, address: string }
	 */
	public static function geocode( string $address ) {
		$url = add_query_arg(
			array(
				'address'   => rawurlencode( $address ),
				'benchmark' => 'Public_AR_Current',
				'format'    => 'json',
			),
			self::CENSUS_GEOCODER
		);
		$res = wp_remote_get( $url, array( 'timeout' => 30 ) );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$data  = json_decode( wp_remote_retrieve_body( $res ), true );
		$match = $data['result']['addressMatches'][0] ?? null;
		if ( ! $match ) {
			return new WP_Error( 'at_geocode', 'Address not found. Try the full street address including city, state and ZIP.' );
		}
		return array(
			'lat'     => (float) $match['coordinates']['y'],
			'lng'     => (float) $match['coordinates']['x'],
			'address' => (string) $match['matchedAddress'],
		);
	}

	/**
	 * Storage mode. Default: metadata-only — customer devices load frame
	 * images directly from the imagery provider, so server storage never
	 * scales with customer count. Flip via `add_filter('at_store_frames',
	 * '__return_true')` to download frames into uploads instead.
	 */
	public static function store_frames(): bool {
		return (bool) apply_filters( 'at_store_frames', false );
	}

	/**
	 * One timeline entry for a frame: metadata + the provider image URL
	 * (or a locally stored copy when store_frames() is on).
	 *
	 * @param array $frame array{ item_id, date }
	 * @return array|WP_Error array{ item_id, date, url[, file] }
	 */
	public static function frame_entry( int $user_id, array $frame, float $lat, float $lng ) {
		if ( self::store_frames() ) {
			return self::download_frame( $user_id, $frame, $lat, $lng );
		}
		return array(
			'item_id' => $frame['item_id'],
			'date'    => $frame['date'],
			'url'     => at_imagery_source()->frame_image_url( $frame['item_id'], $lat, $lng, self::bbox_meters(), self::frame_px() ),
		);
	}

	/**
	 * Builds (or rebuilds) a user's full property record: geocode, list all
	 * historical NAIP frames, resolve each frame's image URL.
	 *
	 * @return array|WP_Error the saved property.
	 */
	public static function build_property( int $user_id, string $address ) {
		$geo = self::geocode( $address );
		if ( is_wp_error( $geo ) ) {
			return $geo;
		}

		$source = at_imagery_source();
		$frames = $source->search_frames( $geo['lat'], $geo['lng'] );
		if ( is_wp_error( $frames ) ) {
			return $frames;
		}
		if ( empty( $frames ) ) {
			return new WP_Error( 'at_no_imagery', 'No aerial imagery is available for this location yet.' );
		}

		// Replace any previous property (and its stored frames) for this user.
		AT_Property::delete( $user_id );

		$stored = array();
		foreach ( $frames as $frame ) {
			$saved = self::frame_entry( $user_id, $frame, $geo['lat'], $geo['lng'] );
			if ( ! is_wp_error( $saved ) ) {
				$stored[] = $saved;
			}
		}
		if ( empty( $stored ) ) {
			return new WP_Error( 'at_download', 'Failed to resolve aerial imagery — please try again later.' );
		}

		$now      = gmdate( 'c' );
		$property = array(
			'address'           => $geo['address'],
			'lat'               => $geo['lat'],
			'lng'               => $geo['lng'],
			'frames'            => $stored,
			'latest_item_id'    => end( $stored )['item_id'],
			'last_checked_at'   => $now,
			'last_updated_at'   => $now,
			'is_new_update'     => false,
			'new_update_expiry' => null,
		);
		AT_Property::save( $user_id, $property );
		return $property;
	}

	/**
	 * Downloads one frame crop to uploads/aerial-timelapse/<user_id>/.
	 *
	 * @param array $frame array{ item_id, date }
	 * @return array|WP_Error array{ item_id, date, file, url }
	 */
	public static function download_frame( int $user_id, array $frame, float $lat, float $lng ) {
		$source = at_imagery_source();
		$url    = $source->frame_image_url( $frame['item_id'], $lat, $lng, self::bbox_meters(), self::frame_px() );

		$res = wp_remote_get( $url, array( 'timeout' => 60 ) );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		if ( 200 !== wp_remote_retrieve_response_code( $res ) ) {
			return new WP_Error( 'at_frame_http', 'Frame download failed (HTTP ' . wp_remote_retrieve_response_code( $res ) . ')' );
		}
		$body = wp_remote_retrieve_body( $res );
		if ( strlen( $body ) < 100 ) {
			return new WP_Error( 'at_frame_empty', 'Frame download returned no image data.' );
		}

		$uploads  = wp_get_upload_dir();
		$rel_dir  = 'aerial-timelapse/' . $user_id;
		$abs_dir  = trailingslashit( $uploads['basedir'] ) . $rel_dir;
		wp_mkdir_p( $abs_dir );
		$filename = sanitize_file_name( $frame['date'] . '_' . $frame['item_id'] . '.png' );
		$rel_file = $rel_dir . '/' . $filename;

		if ( false === file_put_contents( $abs_dir . '/' . $filename, $body ) ) { // phpcs:ignore
			return new WP_Error( 'at_frame_write', 'Could not write frame image to uploads.' );
		}

		return array(
			'item_id' => $frame['item_id'],
			'date'    => $frame['date'],
			'file'    => $rel_file,
			'url'     => trailingslashit( $uploads['baseurl'] ) . $rel_file,
		);
	}
}
