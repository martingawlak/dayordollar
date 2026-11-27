<?php
/**
 * Plugin Name: GFF Drive Backup
 * Description: Once a day at 12:01 AM, exports the GFF customer list to a Google Sheet (first tab) and mirrors every paid invoice to a "Paid Invoices" archive tab. Standalone and isolated from the main registration plugin — if Google fails, nothing here can affect registration, invoicing, or the live site.
 * Version: 1.1.0
 * Author: Martin Gawlak Company LLC
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

/* ============================================================
 * GFF DRIVE BACKUP
 * Design notes:
 *  - Reuses the main plugin's gff_reg_collect_clients() if present.
 *    If that function is missing (main plugin deactivated), this
 *    plugin no-ops safely instead of fatally erroring.
 *  - Authenticates with a Google service-account JSON the owner
 *    pastes into settings (stored in wp_options, never in code).
 *  - Signs a JWT with openssl (core PHP), exchanges it for an
 *    access token, then uploads/overwrites ONE file in the target
 *    Drive folder via the Drive REST API over wp_remote_request.
 *  - Every Google call is wrapped; failure logs quietly and never
 *    throws. This plugin can never block anything on the site.
 * ============================================================ */

define( 'GFF_DBK_OPT_JSON',   'gff_dbk_sa_json' );      // service-account JSON (string)
define( 'GFF_DBK_OPT_FOLDER', 'gff_dbk_folder_id' );    // Drive folder ID (only used if creating)
define( 'GFF_DBK_OPT_TARGET', 'gff_dbk_target_file_id' ); // the Google Sheet ID we write to
define( 'GFF_DBK_OPT_LOG',    'gff_dbk_last_log' );      // last run status string
define( 'GFF_DBK_FILENAME',   'gff_customers.csv' );     // the single file we overwrite
define( 'GFF_DBK_CRON_HOOK',  'gff_dbk_daily_event' );

/* ---------- Activation / deactivation: schedule the 12:01 AM job ---------- */
register_activation_hook( __FILE__, 'gff_dbk_activate' );
function gff_dbk_activate() {
	gff_dbk_schedule();
}
register_deactivation_hook( __FILE__, 'gff_dbk_deactivate' );
function gff_dbk_deactivate() {
	$ts = wp_next_scheduled( GFF_DBK_CRON_HOOK );
	if ( $ts ) { wp_unschedule_event( $ts, GFF_DBK_CRON_HOOK ); }
}

/* Schedule daily at 12:01 AM in the site's timezone. */
function gff_dbk_schedule() {
	if ( wp_next_scheduled( GFF_DBK_CRON_HOOK ) ) { return; }
	$tz   = wp_timezone();
	$now  = new DateTime( 'now', $tz );
	$next = new DateTime( 'today 00:01', $tz );
	if ( $now >= $next ) { $next->modify( '+1 day' ); }
	wp_schedule_event( $next->getTimestamp(), 'daily', GFF_DBK_CRON_HOOK );
}
// Self-heal: ensure the event exists on every load (cheap; wp_next_scheduled is cached).
add_action( 'init', 'gff_dbk_schedule' );

/* ---------- The daily job ---------- */
add_action( GFF_DBK_CRON_HOOK, 'gff_dbk_run_backup' );
function gff_dbk_run_backup() {
	$result = gff_dbk_do_backup();
	update_option( GFF_DBK_OPT_LOG, current_time( 'mysql' ) . ' — ' . $result );
}

/* Build the CSV and push it to Drive. Returns a human status string.
 * Never throws — all failure paths return a message instead. */
function gff_dbk_do_backup() {
	if ( ! function_exists( 'gff_reg_collect_clients' ) ) {
		return 'SKIPPED: main GFF plugin not active (gff_reg_collect_clients missing).';
	}
	$json   = trim( (string) get_option( GFF_DBK_OPT_JSON, '' ) );
	$target = trim( (string) get_option( GFF_DBK_OPT_TARGET, '' ) );
	if ( '' === $json || '' === $target ) {
		return 'SKIPPED: service-account JSON or target Sheet ID not configured.';
	}

	$rows = gff_dbk_build_rows();
	if ( null === $rows ) { return 'ERROR: could not build rows from customer data.'; }

	$token = gff_dbk_get_access_token( $json );
	if ( is_wp_error( $token ) ) { return 'ERROR (auth): ' . $token->get_error_message(); }

	$write = gff_dbk_write_sheet( $token, $target, $rows );
	if ( is_wp_error( $write ) ) { return 'ERROR (write): ' . $write->get_error_message(); }

	// Paid-invoice archive → its own "Paid Invoices" tab, so the nightly clear
	// of the first tab can never wipe it. Idempotent: rebuilt each run from the
	// invoice logs (source of truth), so nothing is ever lost or duplicated.
	$archive_note = '';
	$inv_rows = gff_dbk_build_invoice_rows();
	if ( is_array( $inv_rows ) ) {
		$ensured = gff_dbk_ensure_tab( $token, $target, 'Paid Invoices' );
		if ( is_wp_error( $ensured ) ) {
			$archive_note = ' Paid-invoice archive skipped: ' . $ensured->get_error_message();
		} else {
			$aw = gff_dbk_write_named_tab( $token, $target, 'Paid Invoices', $inv_rows );
			$archive_note = is_wp_error( $aw )
				? ' Paid-invoice archive error: ' . $aw->get_error_message()
				: ' + ' . max( 0, count( $inv_rows ) - 1 ) . ' paid invoice(s) archived.';
		}
	}

	$data_rows = max( 0, count( $rows ) - 1 );
	return 'OK: wrote ' . $data_rows . ' customer row(s) + header to the Google Sheet.' . $archive_note;
}

/* Build the customer data as a 2D array of strings (header row first),
 * ready to send to the Sheets API. Same 26 columns as the CSV export. */
function gff_dbk_build_rows() {
	$rows = gff_reg_collect_clients();
	if ( ! is_array( $rows ) ) { return null; }
	$out = array();
	$out[] = array( 'Role','Name','Email','Phone','Service Address','City','ZIP','Start size','Start Date','Rate Lock','Reservation','Paid','Txn ID','Paid At','Credited','Add-ons','Add-ons Total','Add-ons Invoiced','Crops Wanted','Farm Layout','Moringa Fruit Upgrade','Workshop Interest','Agreement Version','Accepted At','Accept IP','Joined','Tier','Paid Plan','Sown','Open Invoices','Outstanding','Last Invoice','Last Paid' );
	foreach ( $rows as $r ) {
		$uid = isset( $r['id'] ) ? (int) $r['id'] : 0;
		$inv = gff_dbk_inv_summary( $uid );
		$out[] = array(
			gff_dbk_g( $r, 'role' ), gff_dbk_g( $r, 'name' ), gff_dbk_g( $r, 'email' ), gff_dbk_g( $r, 'phone' ),
			gff_dbk_g( $r, 'address' ), gff_dbk_g( $r, 'city' ), gff_dbk_g( $r, 'zip' ), gff_dbk_g( $r, 'sqft' ),
			gff_dbk_g( $r, 'start_date' ), gff_dbk_g( $r, 'ratelock' ), gff_dbk_g( $r, 'reservation' ), gff_dbk_g( $r, 'reservation_paid' ),
			gff_dbk_g( $r, 'reservation_txn' ), gff_dbk_g( $r, 'reservation_paid_at' ), gff_dbk_g( $r, 'reservation_credited' ),
			is_array( gff_dbk_gr( $r, 'addons' ) ) ? implode( '; ', $r['addons'] ) : gff_dbk_g( $r, 'addons' ),
			gff_dbk_g( $r, 'addons_total' ), gff_dbk_g( $r, 'addons_invoiced' ),
			is_array( gff_dbk_gr( $r, 'crops' ) ) ? implode( '; ', $r['crops'] ) : gff_dbk_g( $r, 'crops' ),
			gff_dbk_g( $r, 'farm_layout' ), gff_dbk_g( $r, 'moringa_upgrade' ), gff_dbk_g( $r, 'workshop' ),
			gff_dbk_g( $r, 'agr_ver' ), gff_dbk_g( $r, 'agr_when' ), gff_dbk_g( $r, 'agr_ip' ), gff_dbk_g( $r, 'joined' ),
			gff_dbk_tier( $uid ), gff_dbk_plan( $uid ), gff_dbk_sown_summary( $uid ),
			(string) $inv['open'],
			$inv['out'] > 0 ? number_format( $inv['out'], 2, '.', '' ) : '',
			$inv['last_sent'], $inv['last_paid'],
		);
	}
	return $out;
}
function gff_dbk_g( $r, $k )  { return isset( $r[ $k ] ) && ! is_array( $r[ $k ] ) ? (string) $r[ $k ] : ''; }
function gff_dbk_gr( $r, $k ) { return isset( $r[ $k ] ) ? $r[ $k ] : null; }

/* ---- Derived columns (read straight from user meta; main-plugin helpers
 * are called only when present so this stays safe if it's deactivated). ---- */
function gff_dbk_inv_summary( $uid ) {
	$log = get_user_meta( $uid, 'gff_inv_log', true );
	if ( ! is_array( $log ) ) { $log = array(); }
	$open = 0; $out = 0.0; $last_sent = ''; $last_sent_t = ''; $last_paid = ''; $last_paid_t = '';
	foreach ( $log as $e ) {
		$paid   = isset( $e['status'] ) && 'paid' === $e['status'];
		$amount = isset( $e['amount'] ) ? (string) $e['amount'] : '';
		$num    = isset( $e['num'] ) ? (string) $e['num'] : '';
		if ( ! $paid ) { $open++; $out += (float) $amount; }
		$sent_at = isset( $e['sent_at'] ) ? (string) $e['sent_at'] : '';
		if ( '' !== $sent_at && $sent_at > $last_sent_t ) { $last_sent_t = $sent_at; $last_sent = $num . ' $' . $amount . ' ' . $sent_at; }
		if ( $paid ) {
			$paid_at = isset( $e['paid_at'] ) ? (string) $e['paid_at'] : '';
			if ( '' !== $paid_at && $paid_at > $last_paid_t ) { $last_paid_t = $paid_at; $last_paid = $num . ' $' . $amount . ' ' . $paid_at; }
		}
	}
	return array( 'open' => $open, 'out' => $out, 'last_sent' => $last_sent, 'last_paid' => $last_paid );
}
function gff_dbk_sown_summary( $uid ) {
	$crops = get_user_meta( $uid, 'gff_crops_wanted', true );
	if ( ! is_array( $crops ) ) { $crops = array(); }
	$planted = get_user_meta( $uid, 'gff_crops_planted', true );
	if ( ! is_array( $planted ) ) { $planted = array(); }
	$done = 0;
	foreach ( $crops as $c ) { if ( ! empty( $planted[ (string) $c ] ) ) { $done++; } }
	return $done . '/' . count( $crops );
}
function gff_dbk_tier( $uid ) {
	if ( ! function_exists( 'gff_class_of' ) ) { return ''; }
	$k   = gff_class_of( $uid );
	$map = array( 'lead' => 'Lead', 'seed' => 'Free Seeds', 'customer' => 'Paid' );
	return isset( $map[ $k ] ) ? $map[ $k ] : (string) $k;
}
function gff_dbk_plan( $uid ) {
	if ( ! function_exists( 'gff_paid_plan_of' ) ) { return ''; }
	$p = (string) gff_paid_plan_of( $uid );
	return '' === $p ? '' : ucfirst( $p );
}

/* Build the paid-invoice archive: one row per PAID invoice across all clients,
 * sourced from each user's gff_inv_log. Returns header + rows, or null. */
function gff_dbk_build_invoice_rows() {
	$clients = gff_reg_collect_clients();
	if ( ! is_array( $clients ) ) { return null; }
	$out   = array();
	$out[] = array( 'Customer','Email','Invoice #','Amount','Sent','Paid','Paid By','Overview' );
	foreach ( $clients as $c ) {
		$uid = isset( $c['id'] ) ? (int) $c['id'] : 0;
		$log = get_user_meta( $uid, 'gff_inv_log', true );
		if ( ! is_array( $log ) ) { continue; }
		foreach ( $log as $e ) {
			if ( ! isset( $e['status'] ) || 'paid' !== $e['status'] ) { continue; }
			$by = '';
			if ( ! empty( $e['paid_by'] ) ) { $u = get_userdata( (int) $e['paid_by'] ); if ( $u ) { $by = $u->display_name; } }
			$out[] = array(
				isset( $c['name'] ) ? (string) $c['name'] : '',
				isset( $c['email'] ) ? (string) $c['email'] : '',
				isset( $e['num'] ) ? (string) $e['num'] : '',
				isset( $e['amount'] ) ? (string) $e['amount'] : '',
				isset( $e['sent_at'] ) ? (string) $e['sent_at'] : '',
				isset( $e['paid_at'] ) ? (string) $e['paid_at'] : '',
				$by,
				isset( $e['overview'] ) ? (string) $e['overview'] : '',
			);
		}
	}
	return $out;
}

/* Make sure a named tab exists (create it once if missing). Returns true or WP_Error. */
function gff_dbk_ensure_tab( $token, $sheet_id, $title ) {
	$base = 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode( $sheet_id );
	$get  = wp_remote_get( $base . '?fields=sheets.properties.title', array(
		'timeout' => 20,
		'headers' => array( 'Authorization' => 'Bearer ' . $token ),
	) );
	if ( ! is_wp_error( $get ) && 200 === wp_remote_retrieve_response_code( $get ) ) {
		$body = json_decode( wp_remote_retrieve_body( $get ), true );
		if ( isset( $body['sheets'] ) && is_array( $body['sheets'] ) ) {
			foreach ( $body['sheets'] as $s ) {
				if ( isset( $s['properties']['title'] ) && $s['properties']['title'] === $title ) { return true; }
			}
		}
	}
	$payload = wp_json_encode( array( 'requests' => array( array( 'addSheet' => array( 'properties' => array( 'title' => $title ) ) ) ) ) );
	$add = wp_remote_post( $base . ':batchUpdate', array(
		'timeout' => 30,
		'headers' => array( 'Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json' ),
		'body'    => $payload,
	) );
	if ( is_wp_error( $add ) ) { return $add; }
	// 200 = created; 400 usually = it already exists (race). Either way it's there now.
	return true;
}

/* Clear + rewrite a named tab (used for the Paid Invoices archive). */
function gff_dbk_write_named_tab( $token, $sheet_id, $tab, $rows ) {
	$base   = 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode( $sheet_id );
	$quoted = "'" . str_replace( "'", "''", $tab ) . "'";
	$clear  = wp_remote_post( $base . '/values/' . rawurlencode( $quoted . '!A:Z' ) . ':clear', array(
		'timeout' => 30,
		'headers' => array( 'Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json' ),
		'body'    => '{}',
	) );
	if ( is_wp_error( $clear ) ) { return $clear; }
	$write = wp_remote_request( $base . '/values/' . rawurlencode( $quoted . '!A1' ) . '?valueInputOption=USER_ENTERED', array(
		'method'  => 'PUT',
		'timeout' => 30,
		'headers' => array( 'Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json' ),
		'body'    => wp_json_encode( array( 'values' => $rows ) ),
	) );
	if ( is_wp_error( $write ) ) { return $write; }
	$wcode = wp_remote_retrieve_response_code( $write );
	if ( 200 !== $wcode ) {
		$wb  = json_decode( wp_remote_retrieve_body( $write ), true );
		$msg = is_array( $wb ) && isset( $wb['error']['message'] ) ? $wb['error']['message'] : ( 'HTTP ' . $wcode );
		return new WP_Error( 'write_failed', 'Could not write the "' . $tab . '" tab (HTTP ' . $wcode . '): ' . $msg );
	}
	return true;
}

/* Write rows to the target Google Sheet: clear the sheet first (so removed
 * customers don't linger), then write the full set starting at A1. Uses the
 * Sheets API, which is the correct API for a native Google Sheet. */
function gff_dbk_write_sheet( $token, $sheet_id, $rows ) {
	$base = 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode( $sheet_id );

	// 1) Clear existing values on the first tab (range 'A:Z' covers our 26 cols).
	$clear = wp_remote_post( $base . '/values/A:Z:clear', array(
		'timeout' => 30,
		'headers' => array(
			'Authorization' => 'Bearer ' . $token,
			'Content-Type'  => 'application/json',
		),
		'body' => '{}',
	) );
	if ( is_wp_error( $clear ) ) { return $clear; }
	$ccode = wp_remote_retrieve_response_code( $clear );
	if ( 200 !== $ccode ) {
		$cb  = json_decode( wp_remote_retrieve_body( $clear ), true );
		$msg = is_array( $cb ) && isset( $cb['error']['message'] ) ? $cb['error']['message'] : ( 'HTTP ' . $ccode );
		return new WP_Error( 'clear_failed', 'Could not clear the sheet (HTTP ' . $ccode . '): ' . $msg
			. ' — confirm the Sheet is shared with the service account as Editor and the ID is correct.' );
	}

	// 2) Write all rows starting at A1 (USER_ENTERED so numbers/dates parse).
	$payload = wp_json_encode( array( 'values' => $rows ) );
	$write = wp_remote_request( $base . '/values/A1?valueInputOption=USER_ENTERED', array(
		'method'  => 'PUT',
		'timeout' => 30,
		'headers' => array(
			'Authorization' => 'Bearer ' . $token,
			'Content-Type'  => 'application/json',
		),
		'body' => $payload,
	) );
	if ( is_wp_error( $write ) ) { return $write; }
	$wcode = wp_remote_retrieve_response_code( $write );
	if ( 200 !== $wcode ) {
		$wb  = json_decode( wp_remote_retrieve_body( $write ), true );
		$msg = is_array( $wb ) && isset( $wb['error']['message'] ) ? $wb['error']['message'] : ( 'HTTP ' . $wcode );
		return new WP_Error( 'write_failed', 'Could not write to the sheet (HTTP ' . $wcode . '): ' . $msg );
	}
	return true;
}

/* ---------- Google auth: sign a JWT, exchange for an access token ---------- */
function gff_dbk_get_access_token( $json_string ) {
	$creds = json_decode( $json_string, true );
	if ( ! is_array( $creds ) || empty( $creds['client_email'] ) || empty( $creds['private_key'] ) ) {
		return new WP_Error( 'bad_json', 'Service-account JSON is missing client_email or private_key.' );
	}
	if ( ! function_exists( 'openssl_sign' ) ) {
		return new WP_Error( 'no_openssl', 'PHP openssl extension is required but not available.' );
	}

	$now    = time();
	$header = array( 'alg' => 'RS256', 'typ' => 'JWT' );
	$claim  = array(
		'iss'   => $creds['client_email'],
		'scope' => 'https://www.googleapis.com/auth/spreadsheets',
		'aud'   => 'https://oauth2.googleapis.com/token',
		'iat'   => $now,
		'exp'   => $now + 3600,
	);
	$segments = array(
		gff_dbk_b64url( wp_json_encode( $header ) ),
		gff_dbk_b64url( wp_json_encode( $claim ) ),
	);
	$signing_input = implode( '.', $segments );
	$signature = '';
	$ok = openssl_sign( $signing_input, $signature, $creds['private_key'], 'sha256WithRSAEncryption' );
	if ( ! $ok ) {
		return new WP_Error( 'sign_failed', 'Could not sign the JWT (check the private_key in the JSON).' );
	}
	$jwt = $signing_input . '.' . gff_dbk_b64url( $signature );

	$resp = wp_remote_post( 'https://oauth2.googleapis.com/token', array(
		'timeout' => 20,
		'body'    => array(
			'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			'assertion'  => $jwt,
		),
	) );
	if ( is_wp_error( $resp ) ) { return $resp; }
	$code = wp_remote_retrieve_response_code( $resp );
	$body = json_decode( wp_remote_retrieve_body( $resp ), true );
	if ( 200 !== $code || empty( $body['access_token'] ) ) {
		$msg = is_array( $body ) && isset( $body['error_description'] ) ? $body['error_description'] : ( 'HTTP ' . $code );
		return new WP_Error( 'token_failed', 'Token exchange failed: ' . $msg );
	}
	return $body['access_token'];
}

function gff_dbk_b64url( $data ) {
	return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' );
}

/* ---------- Settings page (Tools → GFF Drive Backup) ---------- */
add_action( 'admin_menu', 'gff_dbk_menu' );
function gff_dbk_menu() {
	add_management_page( 'GFF Drive Backup', 'GFF Drive Backup', 'manage_options', 'gff-drive-backup', 'gff_dbk_settings_page' );
}

add_action( 'admin_init', 'gff_dbk_register_settings' );
function gff_dbk_register_settings() {
	register_setting( 'gff_dbk_group', GFF_DBK_OPT_JSON,   array( 'sanitize_callback' => 'gff_dbk_sanitize_json' ) );
	register_setting( 'gff_dbk_group', GFF_DBK_OPT_FOLDER, array( 'sanitize_callback' => 'sanitize_text_field' ) );
	register_setting( 'gff_dbk_group', GFF_DBK_OPT_TARGET, array( 'sanitize_callback' => 'sanitize_text_field' ) );
}
function gff_dbk_sanitize_json( $val ) {
	$val = trim( (string) $val );
	if ( '' === $val ) { return ''; }
	$decoded = json_decode( $val, true );
	if ( ! is_array( $decoded ) || empty( $decoded['client_email'] ) ) {
		add_settings_error( 'gff_dbk', 'bad_json', 'That does not look like a valid service-account JSON (no client_email found). Not saved.' );
		return get_option( GFF_DBK_OPT_JSON, '' ); // keep previous
	}
	return $val;
}

function gff_dbk_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) { return; }

	// Manual "run now" for testing.
	if ( isset( $_POST['gff_dbk_run_now'] ) && check_admin_referer( 'gff_dbk_run_now' ) ) {
		$msg = gff_dbk_do_backup();
		update_option( GFF_DBK_OPT_LOG, current_time( 'mysql' ) . ' — ' . $msg );
		echo '<div class="notice notice-info is-dismissible"><p>Backup run: ' . esc_html( $msg ) . '</p></div>';
	}

	$json   = (string) get_option( GFF_DBK_OPT_JSON, '' );
	$folder = (string) get_option( GFF_DBK_OPT_FOLDER, '' );
	$target = (string) get_option( GFF_DBK_OPT_TARGET, '' );
	$log    = (string) get_option( GFF_DBK_OPT_LOG, '' );
	$next   = wp_next_scheduled( GFF_DBK_CRON_HOOK );
	$sa_email = '';
	if ( '' !== $json ) {
		$d = json_decode( $json, true );
		if ( is_array( $d ) && ! empty( $d['client_email'] ) ) { $sa_email = $d['client_email']; }
	}
	?>
	<div class="wrap">
		<h1>GFF Drive Backup</h1>
		<p>Writes the current customer list to your Google Sheet once a day at 12:01&nbsp;AM &mdash; the first tab is cleared and rewritten (header + one row per customer).</p>

		<?php if ( $next ) : ?>
			<p><strong>Next run:</strong> <?php echo esc_html( wp_date( 'M j, Y g:i A', $next ) ); ?></p>
		<?php else : ?>
			<p style="color:#a00;"><strong>Not scheduled.</strong> Deactivate and reactivate the plugin to schedule it.</p>
		<?php endif; ?>

		<?php if ( $log ) : ?>
			<p><strong>Last run:</strong> <code style="white-space:normal;"><?php echo esc_html( $log ); ?></code></p>
		<?php endif; ?>

		<?php if ( $sa_email ) : ?>
			<div class="notice notice-success inline"><p>Service account loaded: <code><?php echo esc_html( $sa_email ); ?></code><br>
			Make sure your Drive folder is shared with this email as <strong>Editor</strong>.</p></div>
		<?php endif; ?>

		<form method="post" action="options.php">
			<?php settings_fields( 'gff_dbk_group' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="<?php echo esc_attr( GFF_DBK_OPT_TARGET ); ?>">Google Sheet ID</label></th>
					<td><input type="text" class="regular-text" id="<?php echo esc_attr( GFF_DBK_OPT_TARGET ); ?>" name="<?php echo esc_attr( GFF_DBK_OPT_TARGET ); ?>" value="<?php echo esc_attr( $target ); ?>">
					<p class="description">The ID of the Google Sheet to write to &mdash; the part after <code>/spreadsheets/d/</code> in the Sheet&rsquo;s URL. Share that Sheet with the service account (shown above) as <strong>Editor</strong> first. Each night the first tab is cleared and rewritten with the current customer list (header + one row per customer).</p></td>
				</tr>
				<tr>
					<th scope="row"><label for="<?php echo esc_attr( GFF_DBK_OPT_JSON ); ?>">Service-account JSON</label></th>
					<td><textarea id="<?php echo esc_attr( GFF_DBK_OPT_JSON ); ?>" name="<?php echo esc_attr( GFF_DBK_OPT_JSON ); ?>" rows="8" class="large-text code" placeholder="Paste the entire contents of the downloaded .json key file here."><?php echo esc_textarea( $json ); ?></textarea>
					<p class="description">Stored in your site's database, not in any file. Paste the whole JSON key you downloaded from Google Cloud.</p></td>
				</tr>
			</table>
			<?php submit_button( 'Save settings' ); ?>
		</form>

		<hr>
		<form method="post">
			<?php wp_nonce_field( 'gff_dbk_run_now' ); ?>
			<p><button type="submit" name="gff_dbk_run_now" value="1" class="button button-secondary">Run backup now (test)</button>
			<span class="description">Runs immediately so you can confirm the file appears in Drive.</span></p>
		</form>
	</div>
	<?php
}
