<?php
/**
 * NAIP (USDA National Agriculture Imagery Program) via Microsoft Planetary
 * Computer. Public domain, ~0.3-1m resolution, US-wide, flown every 1-3
 * years, archive back to ~2010 on this mirror. No API key required.
 *
 * - STAC search:  POST https://planetarycomputer.microsoft.com/api/stac/v1/search
 * - Crop render:  GET  .../api/data/v1/item/bbox/{minx},{miny},{maxx},{maxy}/{W}x{H}.png
 *   (verified working 2026-07: returns a centered RGB PNG for any NAIP item)
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AT_NAIP_Source implements AT_Imagery_Source {

	const STAC_SEARCH = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
	const DATA_API    = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox';

	public function search_frames( float $lat, float $lng ) {
		$body = array(
			'collections' => array( 'naip' ),
			'intersects'  => array(
				'type'        => 'Point',
				'coordinates' => array( $lng, $lat ),
			),
			'limit'       => 100,
		);
		$res  = wp_remote_post(
			self::STAC_SEARCH,
			array(
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode( $body ),
				'timeout' => 30,
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		if ( 200 !== wp_remote_retrieve_response_code( $res ) ) {
			return new WP_Error( 'at_stac_http', 'NAIP catalog search failed (HTTP ' . wp_remote_retrieve_response_code( $res ) . ')' );
		}
		$data = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( empty( $data['features'] ) ) {
			return array();
		}

		$frames = array();
		foreach ( $data['features'] as $feature ) {
			if ( empty( $feature['id'] ) || empty( $feature['properties']['datetime'] ) ) {
				continue;
			}
			$frames[] = array(
				'item_id' => $feature['id'],
				'date'    => substr( $feature['properties']['datetime'], 0, 10 ),
			);
		}
		usort( $frames, fn( $a, $b ) => strcmp( $a['date'], $b['date'] ) );

		// NAIP quads overlap; occasionally two items cover the point in the
		// same program year. Keep one frame per year (the latest capture).
		$by_year = array();
		foreach ( $frames as $frame ) {
			$by_year[ substr( $frame['date'], 0, 4 ) ] = $frame;
		}
		return array_values( $by_year );
	}

	public function frame_image_url( string $item_id, float $lat, float $lng, int $bbox_meters, int $px ): string {
		$half_lat = ( $bbox_meters / 2 ) / 111320;
		$half_lng = ( $bbox_meters / 2 ) / ( 111320 * cos( deg2rad( $lat ) ) );
		$bbox     = sprintf(
			'%.6F,%.6F,%.6F,%.6F',
			$lng - $half_lng,
			$lat - $half_lat,
			$lng + $half_lng,
			$lat + $half_lat
		);
		$args     = array(
			'collection' => 'naip',
			'item'       => $item_id,
			'assets'     => 'image',
			'asset_bidx' => 'image|1,2,3', // RGB from the 4-band (RGBIR) COG.
		);
		return add_query_arg( array_map( 'rawurlencode', $args ), self::DATA_API . "/{$bbox}/{$px}x{$px}.png" );
	}
}
