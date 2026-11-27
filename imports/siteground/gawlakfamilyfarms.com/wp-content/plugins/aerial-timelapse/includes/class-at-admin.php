<?php
/**
 * Staff tools: an "Aerial Timelapse" section on every user's profile screen
 * so staff can set (or rebuild) a customer's property address, plus a
 * "check now" bulk action equivalent via the profile save.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AT_Admin {

	public static function init(): void {
		add_action( 'show_user_profile', array( __CLASS__, 'profile_fields' ) );
		add_action( 'edit_user_profile', array( __CLASS__, 'profile_fields' ) );
		add_action( 'personal_options_update', array( __CLASS__, 'save_profile' ) );
		add_action( 'edit_user_profile_update', array( __CLASS__, 'save_profile' ) );
		add_action( 'admin_notices', array( __CLASS__, 'notices' ) );
		add_action( 'admin_menu', array( __CLASS__, 'settings_menu' ) );
	}

	public static function settings_menu(): void {
		add_options_page(
			'Aerial Timelapse',
			'Aerial Timelapse',
			'manage_options',
			'aerial-timelapse',
			array( __CLASS__, 'settings_page' )
		);
	}

	/** Update-check status + manual/bulk trigger options. */
	public static function settings_page(): void {
		$token    = AT_Checker::token();
		$endpoint = rest_url( 'aerial-timelapse/v1/check-updates' );
		$last     = AT_Checker::last_run();
		?>
		<div class="wrap">
			<h1>Aerial Timelapse — update checks</h1>
			<p><strong>Checks run automatically:</strong> when a customer logs in, their property is
				checked for new imagery — at most once per week per customer, and each customer's
				weekly cycle is staggered by signup date. No cron setup required.</p>
			<p>For manual or bulk use (e.g. sweeping customers who rarely log in), a full check of
				all properties can also be triggered:</p>
			<h2>Option A — REST endpoint (usable from a host cron)</h2>
			<pre><code>curl -s "<?php echo esc_html( add_query_arg( 'token', $token, $endpoint ) ); ?>"</code></pre>
			<h2>Option B — WP-CLI</h2>
			<pre><code>cd <?php echo esc_html( ABSPATH ); ?> && wp aerial-timelapse check</code></pre>
			<h2>Last run</h2>
			<?php if ( $last ) : ?>
				<p><?php echo esc_html( $last['time'] ); ?> — checked <?php echo (int) $last['checked']; ?> properties,
					<?php echo (int) $last['updated']; ?> updated<?php echo $last['errors'] ? ', errors: ' . esc_html( implode( '; ', $last['errors'] ) ) : ', no errors'; ?>.</p>
			<?php else : ?>
				<p>Never run yet.</p>
			<?php endif; ?>
			<p><a href="<?php echo esc_url( wp_nonce_url( add_query_arg( 'at_run_check', 1 ), 'at_run_check' ) ); ?>" class="button">Run check now</a></p>
			<?php
			if ( isset( $_GET['at_run_check'] ) && check_admin_referer( 'at_run_check' ) ) {
				$result = AT_Checker::run();
				echo '<div class="notice notice-success"><p>Checked ' . (int) $result['checked'] . ' properties; '
					. count( $result['updated'] ) . ' updated.</p></div>';
			}
			?>
		</div>
		<?php
	}

	public static function profile_fields( WP_User $user ): void {
		if ( ! current_user_can( 'edit_users' ) && get_current_user_id() !== $user->ID ) {
			return;
		}
		$property = AT_Property::get( $user->ID );
		?>
		<h2>Aerial Timelapse</h2>
		<table class="form-table">
			<tr>
				<th><label for="at_address">Property address</label></th>
				<td>
					<input type="text" id="at_address" name="at_address" class="regular-text"
						value="<?php echo esc_attr( $property['address'] ?? '' ); ?>"
						placeholder="123 Main St, City, ST 12345" />
					<p class="description">
						<?php if ( $property ) : ?>
							<?php echo count( $property['frames'] ); ?> frames saved
							(<?php echo esc_html( $property['frames'][0]['date'] ); ?> →
							<?php echo esc_html( end( $property['frames'] )['date'] ); ?>).
							Changing the address rebuilds the timelapse; clearing it removes it.
						<?php else : ?>
							Saving an address geocodes it and downloads all historical NAIP aerial frames.
						<?php endif; ?>
					</p>
				</td>
			</tr>
		</table>
		<?php
	}

	public static function save_profile( int $user_id ): void {
		if ( ! isset( $_POST['at_address'] ) || ! current_user_can( 'edit_user', $user_id ) ) { // phpcs:ignore WordPress.Security.NonceVerification
			return;
		}
		$address  = sanitize_text_field( wp_unslash( $_POST['at_address'] ) ); // phpcs:ignore WordPress.Security.NonceVerification
		$property = AT_Property::get( $user_id );

		if ( '' === $address ) {
			if ( $property ) {
				AT_Property::delete( $user_id );
			}
			return;
		}
		if ( $property && strcasecmp( $property['address'], $address ) === 0 ) {
			return; // Unchanged.
		}
		$result = AT_Fetcher::build_property( $user_id, $address );
		if ( is_wp_error( $result ) ) {
			set_transient( 'at_admin_error_' . get_current_user_id(), $result->get_error_message(), 60 );
		}
	}

	public static function notices(): void {
		$error = get_transient( 'at_admin_error_' . get_current_user_id() );
		if ( $error ) {
			delete_transient( 'at_admin_error_' . get_current_user_id() );
			echo '<div class="notice notice-error"><p>Aerial Timelapse: ' . esc_html( $error ) . '</p></div>';
		}
	}
}
