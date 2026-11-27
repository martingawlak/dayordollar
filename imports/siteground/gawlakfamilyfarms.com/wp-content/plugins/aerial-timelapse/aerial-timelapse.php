<?php
/**
 * Plugin Name: Aerial Timelapse
 * Description: Per-customer overhead property timelapse from free public-domain NAIP aerial imagery. Drop the [aerial_timelapse] shortcode into the MyFarm / MyEstate account page. Daily update check; new imagery triggers a 30-day yellow glow.
 * Version: 1.1.0
 * Author: Gawlak Family Farms / Bowser Gawlak Homes
 * License: GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AT_VERSION', '1.1.0' );
define( 'AT_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'AT_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once AT_PLUGIN_DIR . 'includes/class-at-imagery-source.php';
require_once AT_PLUGIN_DIR . 'includes/class-at-naip-source.php';
require_once AT_PLUGIN_DIR . 'includes/class-at-property.php';
require_once AT_PLUGIN_DIR . 'includes/class-at-fetcher.php';
require_once AT_PLUGIN_DIR . 'includes/class-at-checker.php';
require_once AT_PLUGIN_DIR . 'includes/class-at-shortcode.php';
require_once AT_PLUGIN_DIR . 'includes/class-at-rest.php';
require_once AT_PLUGIN_DIR . 'includes/class-at-admin.php';
require_once AT_PLUGIN_DIR . 'includes/class-at-cli.php';

/** The active imagery source. Swap via the 'at_imagery_source' filter (e.g. Nearmap later). */
function at_imagery_source(): AT_Imagery_Source {
	static $source = null;
	if ( null === $source ) {
		$source = apply_filters( 'at_imagery_source', new AT_NAIP_Source() );
	}
	return $source;
}

AT_Checker::init();
AT_Shortcode::init();
AT_Rest::init();
AT_Admin::init();

register_activation_hook( __FILE__, array( 'AT_Checker', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'AT_Checker', 'deactivate' ) );
