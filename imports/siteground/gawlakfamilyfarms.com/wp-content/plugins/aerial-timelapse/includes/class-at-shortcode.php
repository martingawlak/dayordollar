<?php
/**
 * [aerial_timelapse] — renders a thin container; the player JS fetches the
 * timelapse from GET /wp-json/aerial-timelapse/v1/property and builds the
 * UI client-side. The same REST endpoint serves a future native shell
 * (Capacitor-wrapped PWA), so web and app render from one API.
 *
 * Attributes:
 *   user_id  — view a specific customer's timelapse (staff only)
 *   editable — "yes" (default) shows the address form when no property is
 *              saved; "no" renders nothing until staff set the address.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AT_Shortcode {

	public static function init(): void {
		add_shortcode( 'aerial_timelapse', array( __CLASS__, 'render' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'register_assets' ) );
	}

	public static function register_assets(): void {
		wp_register_style( 'at-player', AT_PLUGIN_URL . 'assets/player.css', array(), AT_VERSION );
		wp_register_script( 'at-player', AT_PLUGIN_URL . 'assets/player.js', array(), AT_VERSION, true );
	}

	public static function render( $atts ): string {
		$atts = shortcode_atts(
			array(
				'user_id'  => 0,
				'editable' => 'yes',
			),
			$atts,
			'aerial_timelapse'
		);

		if ( ! is_user_logged_in() ) {
			return '<p class="at-notice">Please log in to see your property timelapse.</p>';
		}

		$user_id = (int) $atts['user_id'];
		if ( $user_id && ! current_user_can( 'edit_users' ) ) {
			$user_id = 0;
		}

		wp_enqueue_style( 'at-player' );
		wp_enqueue_script( 'at-player' );
		wp_localize_script(
			'at-player',
			'atConfig',
			array(
				'restUrl' => esc_url_raw( rest_url( 'aerial-timelapse/v1/property' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
			)
		);

		return '<div class="at-root" data-at-root'
			. ( $user_id ? ' data-at-user="' . esc_attr( (string) $user_id ) . '"' : '' )
			. ' data-at-editable="' . ( 'yes' === $atts['editable'] ? 'yes' : 'no' ) . '">'
			. '<p class="at-loading">Loading aerial timelapse…</p>'
			. '</div>';
	}
}
