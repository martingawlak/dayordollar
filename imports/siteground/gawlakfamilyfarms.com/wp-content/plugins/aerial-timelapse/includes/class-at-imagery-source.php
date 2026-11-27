<?php
/**
 * Imagery-source adapter seam. NAIP implements this today; a Nearmap (or
 * other paid high-res) adapter can be swapped in later via the
 * 'at_imagery_source' filter without touching the rest of the plugin.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

interface AT_Imagery_Source {

	/**
	 * All historical frames available at a coordinate, oldest first.
	 *
	 * @return array[] Each: array{ item_id: string, date: string (Y-m-d) }
	 *                 or WP_Error on failure.
	 */
	public function search_frames( float $lat, float $lng );

	/**
	 * URL of a rendered image for one frame, cropped to a fixed bbox
	 * (meters square, centered on the coordinate).
	 */
	public function frame_image_url( string $item_id, float $lat, float $lng, int $bbox_meters, int $px ): string;
}
