<?php
/**
 * Must-use plugin for the LOCAL copy of fppm.us (real WordPress + the real
 * plugins, test/wp-real.sh). Never on a live site. Lets the tests and
 * scripts/gen-shell.py ask for a page:
 *   X-Test-User: <id>   render as that user (0 = signed out)
 *   X-Test-Shell: 1     the plugin's shortcodes, head and footer output become
 *                       markers, so the theme frame can be cut around them
 *   X-Test-NoAdminBar: 1  no admin bar (the Worker has no wp-admin to link to)
 */
if ( isset( $_SERVER['HTTP_X_TEST_USER'] ) ) {
	$GLOBALS['fppm_test_uid'] = (int) $_SERVER['HTTP_X_TEST_USER'];
	add_filter( 'determine_current_user', function () { return $GLOBALS['fppm_test_uid']; }, 99 );
}
if ( ! empty( $_SERVER['HTTP_X_TEST_NOADMINBAR'] ) ) {
	add_filter( 'show_admin_bar', '__return_false', 99 );
}
if ( ! empty( $_SERVER['HTTP_X_TEST_SHELL'] ) ) {
	add_filter( 'show_admin_bar', '__return_false', 99 );
	// After do_blocks/shortcode_unautop (10), before do_shortcode (11).
	add_filter( 'the_content', function ( $c ) { return preg_replace( '/\[(fppm_[a-z_]+)([^\]]*)\]/', '<!--FPPM_SC:$1$2-->', $c ); }, 10 );
	// The plugin's own head and footer output, at the same place in the hook order.
	add_action( 'plugins_loaded', function () {
		global $wp_filter;
		foreach ( array( 'wp_head' => array( 5, 'fppm_pwa_head', 'FPPM_HEAD' ), 'wp_footer' => array( 10, 'fppm_pwa_footer', 'FPPM_FOOTER' ) ) as $hook => $x ) {
			if ( isset( $wp_filter[ $hook ]->callbacks[ $x[0] ][ $x[1] ] ) ) {
				$m = $x[2];
				$wp_filter[ $hook ]->callbacks[ $x[0] ][ $x[1] ]['function'] = function () use ( $m ) { echo '<!--' . $m . '-->'; };
			}
		}
	}, 99 );
}
