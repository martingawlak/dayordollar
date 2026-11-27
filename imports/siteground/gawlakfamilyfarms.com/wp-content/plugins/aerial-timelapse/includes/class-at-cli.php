<?php
/**
 * WP-CLI: `wp aerial-timelapse check` / `wp aerial-timelapse token`
 * — the preferred way to drive the daily check from a host cron when
 * WP-CLI is available (SiteGround has it).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( defined( 'WP_CLI' ) && WP_CLI ) {

	class AT_CLI {

		/**
		 * Runs the daily imagery delta check for all saved properties.
		 *
		 * ## EXAMPLES
		 *     wp aerial-timelapse check
		 */
		public function check(): void {
			$result = AT_Checker::run();
			if ( $result['errors'] ) {
				foreach ( $result['errors'] as $error ) {
					WP_CLI::warning( $error );
				}
			}
			WP_CLI::success(
				sprintf(
					'Checked %d properties; %d received new imagery.',
					$result['checked'],
					count( $result['updated'] )
				)
			);
		}

		/**
		 * Prints the token for the /check-updates REST endpoint.
		 */
		public function token(): void {
			WP_CLI::line( AT_Checker::token() );
		}
	}

	WP_CLI::add_command( 'aerial-timelapse', 'AT_CLI' );
}
