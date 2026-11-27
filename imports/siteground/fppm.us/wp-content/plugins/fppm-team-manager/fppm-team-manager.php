<?php
/**
 * Plugin Name:       Fort Pierce Purple Martins — Team Manager
 * Plugin URI:        https://martingawlakcompany.com/fppm
 * Description:        Roster, dues, apparel and communications for the Fort Pierce Purple Martins (adult UPSL team). Members self-register as Fan, Player, or Supporter via [fppm_register]; the member/staff dashboard lives at [fppm_account]; recruit landing at [fppm_invite]. Player dues, supporter contributions and apparel are paid via PayPal payment links; staff mark payments paid on the dashboard. (An optional WooCommerce + Printful path exists for automated checkout/fulfillment, but PayPal is the default.) The account page shows a live ticker of total members and shirts sold. Every signup creates a permanent WordPress account capturing name, email, phone and full mailing address; members can delete their own account and admins can delete any member. Installable as a PWA (manifest + service worker + crest icons). A required liability waiver is captured at signup (versioned, with IP/timestamp) and mirrored off-server to a Google Sheet for legal records. Every member also takes a required club oath. The whole site is members-only: logged-out visitors are funneled to join/sign in. Supporters ($25+) get a tee, and every player/supporter gets a personal 10%-off merch promo code; merch also available via [fppm_merch]. Cloned from the Gawlak Family Farms registration engine.
 * Version:           0.10.17
 * Author:            Martin Gawlak Company
 * License:           GPL-2.0-or-later
 * Text Domain:       fppm
 *
 * SECURITY / DESIGN NOTES:
 *  - Account creation uses WordPress's own wp_insert_user(); passwords are typed by the
 *    member and hashed natively by WP. The plugin never sees or stores plaintext passwords.
 *  - Nonce-protected, all input sanitized, all output escaped, honeypot spam trap included.
 *  - New users get the 'fppm_member' role. Coaches/managers get 'fppm_staff' (front-end
 *    management only — they never touch wp-admin). Site admins retain everything.
 *  - No data leaves your site. PayPal links are plain buttons you paste in as options;
 *    there is no PayPal API/webhook, so a staff member marks each payment paid by hand.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'FPPM_VER', '0.10.17' );

/* ============================================================
 * 1. ACTIVATION — roles
 * ============================================================ */
register_activation_hook( __FILE__, 'fppm_activate' );
function fppm_activate() {
	// Every self-registered person is an fppm_member; the fppm_type meta says
	// whether they are a fan / player / supporter.
	add_role( 'fppm_member', 'FPPM Member', array( 'read' => true ) );
	// Coaches/managers: front-end roster + dues management, no wp-admin.
	add_role(
		'fppm_staff',
		'FPPM Staff',
		array( 'read' => true, 'fppm_manage' => true )
	);
	// Make sure existing admins can manage too.
	$admin = get_role( 'administrator' );
	if ( $admin && ! $admin->has_cap( 'fppm_manage' ) ) {
		$admin->add_cap( 'fppm_manage' );
	}
}

/* ============================================================
 * 2. CONFIG — team info, pricing, PayPal, option-driven lists
 * ============================================================ */
function fppm_team_name() { return get_option( 'fppm_team_name', 'Fort Pierce Purple Martins' ); }
function fppm_team_city() { return get_option( 'fppm_team_city', 'Fort Pierce, FL' ); }

/* Landing/mission blurb shown atop the [fppm_register] page (the /go landing). */
function fppm_join_intro() {
	$t = get_option( 'fppm_join_intro', '' );
	if ( is_string( $t ) && '' !== trim( $t ) ) { return $t; }
	return "We're building Fort Pierce's team on a culture of abundance — and there's a place here for everyone. Back the club as a fan, chase the game as a player, or power it forward as a supporter. Free to start; takes a minute.";
}

/* Where staff notifications go. Defaults to the site admin email. */
function fppm_notify_email() {
	$opt = get_option( 'fppm_notify_email', '' );
	return $opt ? sanitize_email( $opt ) : get_option( 'admin_email' );
}

/* Prices (dollars). Editable via wp_options without code changes. */
function fppm_price_player_dues() { return (float) get_option( 'fppm_price_player_dues', 10 ); }
function fppm_price_supporter_min() { return (float) get_option( 'fppm_price_supporter_min', 25 ); }
function fppm_price_tshirt() { return (float) get_option( 'fppm_price_tshirt', 25 ); }
/* Upcharge to swap the printed tee for the embroidered version. */
function fppm_price_embroidery() { return (float) get_option( 'fppm_price_embroidery', 5 ); }
function fppm_price_tshirt_emb() { return fppm_price_tshirt() + fppm_price_embroidery(); }

/* ---- Litty Committee: collective name for all members ---- */
function fppm_collective() {
	$c = trim( (string) get_option( 'fppm_collective', '' ) );
	return $c ? $c : 'Litty Committee';
}

/* ---- Supporter perk: a unique 10%-off promo code for the merch store ----
 * The code must exist in Printful to actually apply. Preferred flow: paste a
 * batch of unique codes generated in Printful (Discounts) into the pool option;
 * each new supporter is handed the next unused one. Falls back to a single
 * shared code, then to a generated placeholder. */
function fppm_coupon_percent() { return (float) get_option( 'fppm_coupon_percent', 10 ); }
function fppm_coupon_amount() { return (float) get_option( 'fppm_coupon_amount', 10 ); } // legacy
function fppm_coupon_issued() {
	$list = get_option( 'fppm_coupon_codes', array() );
	return is_array( $list ) ? $list : array();
}
/* Codes pasted from Printful (one per line / comma / space separated). */
function fppm_supporter_pool() {
	$raw = (string) get_option( 'fppm_supporter_code_pool', '' );
	$parts = preg_split( '/[\s,]+/', $raw );
	return array_values( array_filter( array_map( 'trim', is_array( $parts ) ? $parts : array() ) ) );
}
function fppm_shared_promo() { return trim( (string) get_option( 'fppm_shared_promo', '' ) ); }
/* Member code format: FPPM + first-initial + last-initial + member number + 10. */
function fppm_make_member_code( $first, $last, $number ) {
	$fi = strtoupper( preg_replace( '/[^A-Za-z]/', '', (string) $first ) );
	$li = strtoupper( preg_replace( '/[^A-Za-z]/', '', (string) $last ) );
	$fi = '' !== $fi ? $fi[0] : 'X';
	$li = '' !== $li ? $li[0] : 'X';
	return 'FPPM' . $fi . $li . (int) $number . '10';
}
/* Assign (once) a unique promo code to a member. Priority: a Printful code pool,
 * else a shared code, else the generated FPPM member code. */
function fppm_assign_member_code( $uid, $first = '', $last = '' ) {
	$ex = get_user_meta( $uid, 'fppm_coupon', true );
	if ( $ex ) { return $ex; }
	$avail = array_values( array_diff( fppm_supporter_pool(), fppm_coupon_issued() ) );
	if ( $avail ) {
		$code = $avail[0];
	} elseif ( fppm_shared_promo() ) {
		$code = fppm_shared_promo();
	} else {
		$code = fppm_make_member_code( $first, $last, fppm_member_count() );
		$base = $code; $i = 0;
		while ( fppm_coupon_code_taken( $code ) ) { $i++; $code = $base . chr( 64 + $i ); } // ..A, ..B on collision
	}
	update_user_meta( $uid, 'fppm_coupon', $code );
	$list = fppm_coupon_issued();
	if ( ! in_array( $code, $list, true ) ) { $list[] = $code; update_option( 'fppm_coupon_codes', $list, false ); }
	return $code;
}
function fppm_coupon_code_taken( $code ) {
	if ( in_array( $code, fppm_coupon_issued(), true ) ) { return true; }
	if ( function_exists( 'wc_get_coupon_id_by_code' ) && wc_get_coupon_id_by_code( $code ) ) { return true; }
	return false;
}
function fppm_generate_coupon( $first, $last ) {
	$fi = strtoupper( preg_replace( '/[^A-Za-z]/', '', $first ) );
	$li = strtoupper( preg_replace( '/[^A-Za-z]/', '', $last ) );
	$fi = $fi !== '' ? $fi[0] : 'X';
	$li = $li !== '' ? $li[0] : 'X';
	$prefix = $fi . $li . 'FP10';
	$code   = '';
	for ( $i = 0; $i < 60; $i++ ) {
		$try = $prefix . str_pad( (string) wp_rand( 0, 9999 ), 4, '0', STR_PAD_LEFT );
		if ( ! fppm_coupon_code_taken( $try ) ) { $code = $try; break; }
	}
	if ( '' === $code ) { $code = $prefix . substr( (string) time(), -4 ); } // extreme fallback
	$list   = fppm_coupon_issued();
	$list[] = $code;
	update_option( 'fppm_coupon_codes', $list, false );
	return $code;
}
/* Create the matching WooCommerce coupon ($10 fixed-cart, no expiry). No-op if
 * WooCommerce isn't active (the code is still stored + honored manually). */
function fppm_create_wc_coupon( $code, $amount ) {
	if ( ! class_exists( 'WC_Coupon' ) ) { return false; }
	if ( function_exists( 'wc_get_coupon_id_by_code' ) && wc_get_coupon_id_by_code( $code ) ) { return true; }
	try {
		$c = new WC_Coupon();
		$c->set_code( $code );
		$c->set_discount_type( 'fixed_cart' );
		$c->set_amount( $amount );
		$c->set_individual_use( true );
		$c->set_description( 'Fort Pierce Purple Martins supporter — permanent $' . $amount . ' off.' );
		$c->save();
		return true;
	} catch ( Exception $e ) {
		return false;
	}
}

/* PayPal links. All option-driven so the real buttons can be pasted in later
 * from PayPal without editing code. Empty = "not wired up yet" (button shows a
 * disabled placeholder instead of a broken link). */
function fppm_pp_link( $key, $default = '' ) {
	$val = get_option( $key, $default );
	$val = is_string( $val ) ? trim( $val ) : '';
	return $val ? esc_url_raw( $val ) : '';
}
function fppm_pp_dues_link()      { return fppm_pp_link( 'fppm_pp_dues' ); }       // player dues $10
function fppm_pp_supporter_link() { return fppm_pp_link( 'fppm_pp_supporter' ); }  // supporter $10+

/* Apparel catalog. Each item: key, label, price, PayPal option key.
 * Add hats/scarves/etc. here later; each just needs its own PayPal option. */
function fppm_apparel_items() {
	$items = array(
		array(
			'key'     => 'tshirt',
			'label'   => 'Purple Martins T-Shirt',
			'desc'    => 'Official team tee — purple with the martin crest.',
			'price'   => fppm_price_tshirt(),
			'url'     => fppm_tshirt_url(), // Printful product link (primary; defaults to the FPPM tee)
			'wc_id'   => (int) get_option( 'fppm_wc_tshirt_id', 0 ),           // optional WooCommerce product
			'pp_key'  => 'fppm_pp_tshirt',                                     // PayPal link (fallback)
		),
	);
	/* Allow extra items via an option (array of the same shape) without a code change. */
	$extra = get_option( 'fppm_apparel_extra', array() );
	if ( is_array( $extra ) ) {
		foreach ( $extra as $e ) {
			if ( is_array( $e ) && ! empty( $e['key'] ) && ! empty( $e['label'] ) ) {
				$items[] = array(
					'key'    => sanitize_key( $e['key'] ),
					'label'  => sanitize_text_field( $e['label'] ),
					'desc'   => isset( $e['desc'] ) ? sanitize_text_field( $e['desc'] ) : '',
					'price'  => isset( $e['price'] ) ? (float) $e['price'] : 0,
					'url'    => isset( $e['url'] ) ? esc_url_raw( $e['url'] ) : '',
					'wc_id'  => isset( $e['wc_id'] ) ? (int) $e['wc_id'] : 0,
					'pp_key' => isset( $e['pp_key'] ) ? sanitize_key( $e['pp_key'] ) : '',
				);
			}
		}
	}
	return $items;
}

/* Is WooCommerce active? (Store/Printful path.) */
function fppm_wc_active() { return class_exists( 'WooCommerce' ); }

/* Printful storefront defaults (overridable in Settings). */
function fppm_default_store_url()  { return 'https://fppm.printful.me/'; }
function fppm_default_tshirt_url() { return 'https://fppm.printful.me/product/fppm-official-tee'; }

/* The team store landing URL: explicit option, else the Printful store. */
function fppm_shop_url() {
	$u = trim( (string) get_option( 'fppm_shop_url', '' ) );
	if ( $u ) { return esc_url_raw( $u ); }
	if ( fppm_wc_active() && function_exists( 'wc_get_page_permalink' ) ) {
		$p = wc_get_page_permalink( 'shop' );
		if ( $p ) { return $p; }
	}
	return fppm_default_store_url();
}

/* The tee product link: explicit option, else the Printful product. */
function fppm_tshirt_url() {
	$u = trim( (string) get_option( 'fppm_tshirt_url', '' ) );
	return $u ? esc_url_raw( $u ) : fppm_default_tshirt_url();
}

/* Soccer reference data. */
function fppm_positions() {
	return array(
		'GK'  => 'Goalkeeper',
		'RB'  => 'Right Back',
		'CB'  => 'Center Back',
		'LB'  => 'Left Back',
		'CDM' => 'Defensive Mid',
		'CM'  => 'Central Mid',
		'CAM' => 'Attacking Mid',
		'RW'  => 'Right Wing',
		'LW'  => 'Left Wing',
		'ST'  => 'Striker',
		'UTL' => 'Utility / Any',
	);
}
function fppm_shirt_sizes() {
	return array( 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL' );
}

/* ---- Liability waiver (required at signup) ----
 * TEMPLATE ONLY — have an attorney review before going live. Editable in
 * Purple Martins → Settings. Bump the version whenever you change the text so
 * each acceptance records which wording the member agreed to. */
function fppm_waiver_version() {
	$v = trim( (string) get_option( 'fppm_waiver_version', '' ) );
	return $v ? $v : '1.0';
}
function fppm_waiver_text() {
	$t = get_option( 'fppm_waiver_text', '' );
	if ( is_string( $t ) && '' !== trim( $t ) ) { return $t; }
	$team = fppm_team_name();
	return "WAIVER, RELEASE OF LIABILITY, AND ASSUMPTION OF RISK — {$team}\n\n"
		. "In consideration of being permitted to participate in any way in {$team} activities — including tryouts, practices, conditioning and training sessions, matches, scrimmages, events, and travel to and from them (the \"Activities\") — I acknowledge, agree, and represent that:\n\n"
		. "1. ASSUMPTION OF RISK. Soccer and physical conditioning involve inherent risks of serious injury, permanent disability, and death, and of loss of or damage to property. I knowingly and freely assume all such risks, both known and unknown, and assume full responsibility for my participation.\n\n"
		. "2. RELEASE AND WAIVER. I release, waive, discharge, and covenant not to sue {$team}, its organizers, coaches, staff, volunteers, sponsors, and hosts (the \"Released Parties\") from any and all liability, claims, demands, or causes of action arising out of or related to any loss, damage, or injury, including death, that may be sustained by me while participating in the Activities, whether caused by the negligence of the Released Parties or otherwise, to the fullest extent permitted by law.\n\n"
		. "3. MEDICAL. I certify that I am physically fit and have not been advised otherwise. I authorize the Released Parties to obtain or provide emergency medical treatment on my behalf, and I am responsible for any resulting costs.\n\n"
		. "4. INDEMNIFICATION. I agree to indemnify and hold harmless the Released Parties from any loss or liability incurred as a result of my participation.\n\n"
		. "5. MEDIA. I grant permission for photos and video taken during the Activities to be used for team and promotional purposes without compensation.\n\n"
		. "I HAVE READ THIS WAIVER AND RELEASE, FULLY UNDERSTAND ITS TERMS, AND SIGN IT FREELY AND VOLUNTARILY. This agreement is electronically signed by checking the box and submitting my registration.";
}
function fppm_waiver_hash() { return md5( fppm_waiver_version() . '|' . fppm_waiver_text() ); }

/* ---- Club oath (required at signup) ---- */
function fppm_oath_text() {
	$t = get_option( 'fppm_oath_text', '' );
	if ( is_string( $t ) && '' !== trim( $t ) ) { return $t; }
	return 'I take the Purple Martins oath: to spread the culture of abundance whenever I represent this organization.';
}

/* ---- Off-server recording (Google Sheet, service account) ---- */
function fppm_gs_json()     { return (string) get_option( 'fppm_gs_json', '' ); }
function fppm_gs_sheet_id() { return trim( (string) get_option( 'fppm_gs_sheet_id', '' ) ); }
function fppm_gs_tab()      { $t = trim( (string) get_option( 'fppm_gs_tab', '' ) ); return $t ? $t : 'Waivers'; }
function fppm_gs_configured() { return fppm_gs_json() && fppm_gs_sheet_id(); }
/* Convenience: the service-account email to share the Sheet with. */
function fppm_gs_client_email() {
	$c = json_decode( fppm_gs_json(), true );
	return ( is_array( $c ) && ! empty( $c['client_email'] ) ) ? $c['client_email'] : '';
}

/* ============================================================
 * 3. TYPE / STATUS / CAPABILITY HELPERS
 * ============================================================ */
function fppm_types() {
	return array(
		'fan'       => 'Fan',
		'player'    => 'Player',
		'supporter' => 'Supporter',
	);
}
function fppm_type_of( $uid ) {
	$t = get_user_meta( (int) $uid, 'fppm_type', true );
	return array_key_exists( $t, fppm_types() ) ? $t : 'fan';
}
function fppm_type_label( $t ) {
	$m = fppm_types();
	return isset( $m[ $t ] ) ? $m[ $t ] : ucfirst( (string) $t );
}

/* Player lifecycle — only meaningful for fppm_type=player. */
function fppm_player_statuses() {
	return array(
		'trialist' => 'Trialist',
		'rostered' => 'Rostered',
		'reserve'  => 'Reserve / Alumni',
	);
}
function fppm_player_status_of( $uid ) {
	$s = get_user_meta( (int) $uid, 'fppm_player_status', true );
	return array_key_exists( $s, fppm_player_statuses() ) ? $s : 'trialist';
}
function fppm_status_label( $s ) {
	$m = fppm_player_statuses();
	return isset( $m[ $s ] ) ? $m[ $s ] : ucfirst( (string) $s );
}

/* Can the current (or given) user manage the team? */
function fppm_can_manage( $uid = null ) {
	if ( null === $uid ) {
		return current_user_can( 'fppm_manage' ) || current_user_can( 'manage_options' );
	}
	return user_can( (int) $uid, 'fppm_manage' ) || user_can( (int) $uid, 'manage_options' );
}

/* ============================================================
 * 4. DUES LOG (mirrors the proven GFF invoice-log pattern)
 * ============================================================ */
function fppm_dues_get( $uid ) {
	$log = get_user_meta( (int) $uid, 'fppm_dues_log', true );
	return is_array( $log ) ? $log : array();
}
function fppm_dues_add( $uid, $amount, $overview, $status = 'open' ) {
	$log   = fppm_dues_get( $uid );
	$num   = count( $log ) + 1; // simple per-user sequence
	$log[] = array(
		'num'      => (int) $num,
		'amount'   => number_format( (float) $amount, 2, '.', '' ),
		'overview' => (string) $overview,
		'created'  => current_time( 'mysql' ),
		'status'   => ( 'paid' === $status ) ? 'paid' : 'open',
		'paid_at'  => '',
		'paid_by'  => 0,
	);
	update_user_meta( (int) $uid, 'fppm_dues_log', $log );
	return $num;
}
function fppm_dues_open( $uid ) {
	return array_values( array_filter( fppm_dues_get( $uid ), function ( $e ) {
		return empty( $e['status'] ) || 'paid' !== $e['status'];
	} ) );
}
function fppm_dues_paid( $uid ) {
	return array_values( array_filter( fppm_dues_get( $uid ), function ( $e ) {
		return isset( $e['status'] ) && 'paid' === $e['status'];
	} ) );
}
function fppm_dues_outstanding( $uid ) {
	$t = 0.0;
	foreach ( fppm_dues_open( $uid ) as $e ) { $t += (float) $e['amount']; }
	return $t;
}
function fppm_dues_mark( $uid, $num, $paid, $by ) {
	$log = fppm_dues_get( $uid );
	$hit = false;
	foreach ( $log as &$e ) {
		if ( (string) $e['num'] === (string) $num ) {
			$e['status']  = $paid ? 'paid' : 'open';
			$e['paid_at'] = $paid ? current_time( 'mysql' ) : '';
			$e['paid_by'] = $paid ? (int) $by : 0;
			$hit = true;
		}
	}
	unset( $e );
	if ( $hit ) { update_user_meta( (int) $uid, 'fppm_dues_log', $log ); }
	return $hit;
}

/* ============================================================
 * 5. SMALL UTILITIES
 * ============================================================ */
function fppm_display_name( $uid ) {
	$u = get_userdata( (int) $uid );
	if ( ! $u ) { return '(unknown)'; }
	$name = trim( get_user_meta( $uid, 'first_name', true ) . ' ' . get_user_meta( $uid, 'last_name', true ) );
	return $name ? $name : $u->display_name;
}

/* One-line "Street, City ST ZIP" for a member (empty parts collapse cleanly). */
function fppm_address_line( $uid ) {
	$street = get_user_meta( $uid, 'fppm_address', true );
	$city   = get_user_meta( $uid, 'fppm_city', true );
	$state  = get_user_meta( $uid, 'fppm_state', true );
	$zip    = get_user_meta( $uid, 'fppm_zip', true );
	$tail   = trim( trim( $city . ', ' . $state ) . ' ' . $zip, ', ' );
	return trim( trim( $street . ', ' . $tail, ', ' ) );
}

/* Flash-notice helper: read a ?fppm_note=code param and render a banner. */
function fppm_flash_html() {
	if ( empty( $_GET['fppm_note'] ) ) { return ''; }
	$code = sanitize_key( wp_unslash( $_GET['fppm_note'] ) );
	$map  = array(
		'registered' => array( 'ok',  'Welcome to the ' . fppm_collective() . '! Your account is ready.' ),
		'duespaid'   => array( 'ok',  'Marked paid.' ),
		'duesopen'   => array( 'ok',  'Marked unpaid.' ),
		'statusset'  => array( 'ok',  'Player status updated.' ),
		'noted'      => array( 'ok',  'Note saved.' ),
		'announced'  => array( 'ok',  'Announcement posted.' ),
		'deleted'    => array( 'ok',  'Member deleted.' ),
		'eventadded' => array( 'ok',  'Event added.' ),
		'eventdeleted' => array( 'ok', 'Event deleted.' ),
		'rsvpset'    => array( 'ok',  'RSVP saved.' ),
		'invited'    => array( 'ok',  'Player invite emailed.' ),
		'playeractive' => array( 'ok', 'Welcome to the roster — your player account is active!' ),
		'err'        => array( 'err', 'That action could not be completed.' ),
	);
	if ( ! isset( $map[ $code ] ) ) { return ''; }
	list( $kind, $msg ) = $map[ $code ];
	return '<div class="fppm-flash fppm-flash--' . esc_attr( $kind ) . '">' . esc_html( $msg ) . '</div>';
}

/* One redirect helper used by all admin-post handlers. */
function fppm_redirect_note( $code ) {
	$back = wp_get_referer();
	if ( ! $back ) { $back = home_url( '/account/' ); }
	wp_safe_redirect( add_query_arg( 'fppm_note', $code, remove_query_arg( 'fppm_note', $back ) ) );
	exit;
}

/* ============================================================
 * 6. STYLES (printed once, only on pages using our shortcodes)
 * ============================================================ */
function fppm_styles() {
	static $done = false;
	if ( $done ) { return ''; }
	$done = true;
	ob_start(); ?>
<style>
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Roboto:wght@400;500;700&display=swap');
.fppm-wrap{--fppm-violet:#5E17EB;--fppm-violet-d:#4711b8;--fppm-gold:#FFDE59;--fppm-gold-d:#8a6a10;--fppm-gold-l:#FFF6D6;--fppm-ink:#111;--fppm-muted:#666;--fppm-line:#e5e5e5;--fppm-purple:var(--fppm-violet);--fppm-purple-d:var(--fppm-ink);--fppm-purple-l:var(--fppm-gold-l);font-family:'Roboto',system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:var(--fppm-ink);max-width:820px;margin:0 auto;line-height:1.45;accent-color:var(--fppm-violet);}
.fppm-wrap *{box-sizing:border-box;}
.fppm-wrap a{color:var(--fppm-violet);text-decoration:underline;}
.fppm-wrap :focus-visible{outline:2px solid var(--fppm-violet);outline-offset:2px;}
.fppm-wrap input[type=checkbox],.fppm-wrap input[type=radio]{accent-color:var(--fppm-violet);}
.fppm-h{display:flex;align-items:center;justify-content:center;text-align:center;gap:.5em;font-family:'Oswald',sans-serif;font-size:1.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--fppm-ink);margin:.1em 0 .1em;}
.fppm-stat-n{font-family:'Oswald',sans-serif;}
.fppm-h .fppm-crest{font-size:1.3em;}
.fppm-crest-img{width:1.3em;height:1.3em;border-radius:4px;vertical-align:middle;flex:0 0 auto;}
.fppm-sub{color:var(--fppm-muted);margin:.1em 0 1rem;font-size:.9rem;text-align:center;}
.fppm-ticker{display:flex;gap:.5rem;margin:0 0 1rem;}
.fppm-stat{flex:1 1 0;background:var(--fppm-ink);color:#fff;border-radius:8px;padding:.7rem .8rem;text-align:center;}
.fppm-stat-n{display:block;font-size:1.7rem;font-weight:700;line-height:1;}
.fppm-stat-l{display:block;font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;color:var(--fppm-gold);font-weight:600;margin-top:.25em;}
.fppm-card{background:#fff;border:1px solid var(--fppm-line);border-radius:8px;padding:.9rem 1rem;margin:0 0 .8rem;}
.fppm-card h3{font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:.02em;margin:0 0 .6em;color:var(--fppm-ink);font-size:1.05rem;}
.fppm-flash{border-radius:8px;padding:.6em .9em;margin:0 0 .8rem;font-weight:500;border-left:4px solid var(--fppm-line);}
.fppm-flash--ok{background:var(--fppm-gold-l);border-left-color:var(--fppm-gold);color:var(--fppm-ink);}
.fppm-flash--err{background:#f4f4f4;border-left-color:var(--fppm-ink);color:var(--fppm-ink);font-weight:700;}
.fppm-field{margin:0 0 .7rem;}
.fppm-field label{display:block;font-weight:500;margin:0 0 .2em;font-size:.85rem;}
.fppm-field input[type=text],.fppm-field input[type=email],.fppm-field input[type=tel],.fppm-field input[type=password],.fppm-field input[type=number],.fppm-field input[type=date],.fppm-field select,.fppm-field textarea{width:100%;padding:.55em .65em;border:1px solid var(--fppm-line);border-radius:6px;font-size:1rem;background:#fff;font-family:inherit;}
.fppm-field input:focus,.fppm-field select:focus,.fppm-field textarea:focus{outline:none;border-color:var(--fppm-violet);}
.fppm-row{display:flex;gap:.7rem;flex-wrap:wrap;}
.fppm-row>.fppm-field{flex:1 1 200px;}
.fppm-hp{position:absolute;left:-9999px;top:-9999px;height:0;width:0;overflow:hidden;}
.fppm-types{display:flex;gap:.5rem;flex-wrap:wrap;margin:0 0 .9rem;}
.fppm-type-btn{flex:1 1 160px;cursor:pointer;border:1px solid var(--fppm-line);border-radius:8px;padding:.7rem .8rem;background:#fff;text-align:left;transition:.12s;}
.fppm-type-btn:hover{border-color:var(--fppm-violet);}
.fppm-type-btn.is-on{border-color:var(--fppm-violet);background:var(--fppm-gold-l);}
.fppm-type-btn b{font-family:'Oswald',sans-serif;display:block;color:var(--fppm-ink);font-size:1rem;}
.fppm-type-btn .fppm-price{font-weight:700;color:var(--fppm-gold-d);}
.fppm-type-btn small{color:var(--fppm-muted);}
.fppm-only{display:none;}
.fppm-btn{display:inline-block;background:var(--fppm-violet);color:#fff;border:0;border-radius:6px;padding:.55em 1.1em;font-size:.95rem;font-weight:600;cursor:pointer;text-decoration:none;font-family:'Roboto',sans-serif;}
.fppm-btn:hover{background:var(--fppm-violet-d);color:#fff;}
.fppm-btn--ghost{background:#fff;color:var(--fppm-violet);border:1px solid var(--fppm-violet);}
.fppm-btn--ghost:hover{background:var(--fppm-violet);color:#fff;}
.fppm-btn--gold{background:var(--fppm-violet);color:#fff;}
.fppm-btn--gold:hover{background:var(--fppm-violet-d);color:#fff;}
.fppm-btn[disabled],.fppm-btn.is-disabled{opacity:.45;cursor:not-allowed;pointer-events:none;}
.fppm-badge{display:inline-block;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:.15em .6em;border-radius:4px;background:var(--fppm-gold-l);color:var(--fppm-gold-d);}
.fppm-badge--owe{background:#f4f4f4;color:var(--fppm-ink);}
.fppm-badge--paid{background:var(--fppm-ink);color:#fff;}
.fppm-badge--gold{background:var(--fppm-gold);color:var(--fppm-ink);}
.fppm-table{width:100%;border-collapse:collapse;font-size:.9rem;}
.fppm-table th,.fppm-table td{text-align:left;padding:.45em .55em;border-bottom:1px solid var(--fppm-line);vertical-align:top;}
.fppm-table th{font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:var(--fppm-muted);font-family:'Oswald',sans-serif;font-weight:600;}
.fppm-apparel{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:.7rem;}
.fppm-appcard{border:1px solid var(--fppm-line);border-radius:8px;padding:.8rem;background:#fff;}
.fppm-appcard b{font-family:'Oswald',sans-serif;display:block;color:var(--fppm-ink);font-size:1rem;}
.fppm-appcard .fppm-price{font-family:'Oswald',sans-serif;font-size:1.25rem;font-weight:700;color:var(--fppm-ink);margin:.15em 0 .4em;}
.fppm-muted{color:var(--fppm-muted);font-size:.85rem;}
.fppm-inline{display:inline;}
.fppm-actions{display:flex;gap:.35rem;flex-wrap:wrap;align-items:center;}
details.fppm-det{margin:.3em 0;}
details.fppm-det summary{cursor:pointer;color:var(--fppm-violet);font-weight:500;font-size:.85rem;}
#fppm-app-card .fppm-btn img{width:22px!important;height:22px!important;display:inline-block;}
</style>
<?php
	return ob_get_clean();
}

/* PayPal button (or disabled placeholder if the link isn't set yet). */
function fppm_paypal_button( $url, $label, $classes = 'fppm-btn fppm-btn--gold' ) {
	if ( $url ) {
		return '<a class="' . esc_attr( $classes ) . '" href="' . esc_url( $url ) . '" target="_blank" rel="noopener">' . esc_html( $label ) . '</a>';
	}
	return '<span class="' . esc_attr( $classes ) . ' is-disabled" title="PayPal link not set yet — add it in FPPM options">' . esc_html( $label ) . ' <em style="font-weight:400;">(PayPal link coming soon)</em></span>';
}

/* A small, non-interactive merch teaser (tee mockup + price) for the
 * logged-out registration page. Prefers a tee/shirt product; empty if the
 * catalog has no mockup image yet (i.e. Fetch hasn't pulled images). */
function fppm_merch_teaser_html() {
	$cat = fppm_store_catalog();
	if ( ! $cat ) { return ''; }
	$pick = null;
	foreach ( $cat as $p ) {
		if ( empty( $p['img'] ) ) { continue; }
		if ( null === $pick ) { $pick = $p; }
		if ( preg_match( '/tee|shirt/i', $p['name'] ) ) { $pick = $p; break; }
	}
	if ( ! $pick ) { return ''; }
	$price = null;
	foreach ( $pick['variants'] as $v ) { if ( null === $price || $v['price'] < $price ) { $price = $v['price']; } }
	ob_start();
	echo '<div class="fppm-card" style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;">';
	echo '<img src="' . esc_url( $pick['img'] ) . '" alt="' . esc_attr( $pick['name'] ) . '" loading="lazy" style="width:88px;height:88px;object-fit:contain;flex:0 0 auto;">';
	echo '<div style="flex:1 1 200px;min-width:0;">';
	echo '<b style="font-family:\'Oswald\',sans-serif;font-size:1.1rem;text-transform:uppercase;">' . esc_html( $pick['name'] ) . '</b>';
	if ( null !== $price ) { echo '<div style="font-family:\'Oswald\',sans-serif;font-size:1.25rem;font-weight:700;margin:.1em 0 .3em;">$' . esc_html( number_format( $price, 2 ) ) . '</div>'; }
	echo '<div class="fppm-muted">Supporters get the official tee + a ' . esc_html( number_format( fppm_coupon_percent(), 0 ) ) . '% off merch code. Join below to shop the full store.</div>';
	echo '</div></div>';
	return ob_get_clean();
}

/* ============================================================
 * 7. REGISTRATION — [fppm_register] and [fppm_invite]
 * ============================================================ */
add_shortcode( 'fppm_register', 'fppm_sc_register' );
function fppm_sc_register( $atts = array() ) {
	$atts = shortcode_atts( array( 'default' => 'fan' ), $atts, 'fppm_register' );

	if ( is_user_logged_in() ) {
		$acct = esc_url( home_url( '/account/' ) );
		return fppm_styles() . '<div class="fppm-wrap"><div class="fppm-card">You are already signed in. Head to your <a href="' . $acct . '">dashboard</a>.</div></div>';
	}

	$default = array_key_exists( $atts['default'], fppm_types() ) ? $atts['default'] : 'fan';
	$old     = isset( $GLOBALS['fppm_reg_old'] ) ? $GLOBALS['fppm_reg_old'] : array();
	$err     = isset( $GLOBALS['fppm_reg_err'] ) ? $GLOBALS['fppm_reg_err'] : '';
	$type    = ! empty( $old['fppm_type'] ) && array_key_exists( $old['fppm_type'], fppm_types() ) ? $old['fppm_type'] : $default;
	$v       = function ( $k ) use ( $old ) { return isset( $old[ $k ] ) ? esc_attr( $old[ $k ] ) : ''; };

	ob_start();
	echo fppm_styles();
	?>
	<div class="fppm-wrap">
		<h2 class="fppm-h"><img class="fppm-crest-img" src="<?php echo esc_url( fppm_asset_url( 'icon-192.png' ) ); ?>" alt=""> Join the <?php echo esc_html( fppm_team_name() ); ?></h2>
		<p class="fppm-sub"><?php echo esc_html( fppm_team_city() ); ?> · United Premier Soccer League</p>

		<div class="fppm-card" style="background:var(--fppm-ink);border:0;color:#fff;">
			<p style="margin:0 0 .9rem;font-size:1.05rem;line-height:1.55;"><?php echo esc_html( fppm_join_intro() ); ?></p>
			<div style="display:flex;gap:.6rem;flex-wrap:wrap;">
				<span style="flex:1 1 150px;background:rgba(255,255,255,.12);border-radius:10px;padding:.6rem .8rem;"><strong style="display:block;font-family:'Oswald',sans-serif;">Fan</strong><span style="color:var(--fppm-gold);font-weight:700;">Free</span> · updates</span>
				<span style="flex:1 1 150px;background:rgba(255,255,255,.12);border-radius:10px;padding:.6rem .8rem;"><strong style="display:block;font-family:'Oswald',sans-serif;">Player</strong><span style="color:var(--fppm-gold);font-weight:700;">$<?php echo esc_html( number_format( fppm_price_player_dues(), 0 ) ); ?></span> · try out &amp; compete</span>
				<span style="flex:1 1 150px;background:rgba(255,255,255,.12);border-radius:10px;padding:.6rem .8rem;"><strong style="display:block;font-family:'Oswald',sans-serif;">Supporter</strong><span style="color:var(--fppm-gold);font-weight:700;">$<?php echo esc_html( number_format( fppm_price_supporter_min(), 0 ) ); ?>+</span> · tee + <?php echo esc_html( number_format( fppm_coupon_percent(), 0 ) ); ?>% off code</span>
			</div>
			<p style="margin:.8rem 0 0;font-size:.85rem;color:var(--fppm-gold);font-weight:700;font-family:'Oswald',sans-serif;letter-spacing:.02em;">Every member — fan, player, or supporter — is the <?php echo esc_html( fppm_collective() ); ?>.</p>
			<?php echo fppm_next_event_public_html(); ?>
		</div>

		<?php echo fppm_ticker_html(); ?>

		<?php echo fppm_merch_teaser_html(); ?>

		<?php if ( $err ) : ?><div class="fppm-flash fppm-flash--err"><?php echo esc_html( $err ); ?></div><?php endif; ?>

		<form method="post" class="fppm-card" novalidate>
			<?php wp_nonce_field( 'fppm_register', 'fppm_register_nonce' ); ?>
			<input type="hidden" name="fppm_action" value="register">
			<input type="hidden" name="fppm_type" id="fppm_type" value="<?php echo esc_attr( $type ); ?>">
			<!-- honeypot -->
			<div class="fppm-hp"><label>Leave blank<input type="text" name="fppm_website" tabindex="-1" autocomplete="off"></label></div>

			<?php $g = fppm_google_button(); if ( $g ) : ?>
			<div style="text-align:center;margin:0 0 1.2rem;"><?php echo $g; ?><div class="fppm-muted" style="margin-top:.6rem;font-size:.85rem;">— or sign up with your email below —</div></div>
			<?php endif; ?>

			<h3>How do you want to join?</h3>
			<div class="fppm-types" role="radiogroup" aria-label="Membership type">
				<button type="button" class="fppm-type-btn" data-type="fan" role="radio">
					<b>Fan</b><span class="fppm-price">Free</span>
					<small>Get updates &amp; team news.</small>
				</button>
				<button type="button" class="fppm-type-btn" data-type="player" role="radio">
					<b>Player</b><span class="fppm-price">$<?php echo esc_html( number_format( fppm_price_player_dues(), 0 ) ); ?> dues</span>
					<small>Try out &amp; compete.</small>
				</button>
				<button type="button" class="fppm-type-btn" data-type="supporter" role="radio">
					<b>Supporter</b><span class="fppm-price">$<?php echo esc_html( number_format( fppm_price_supporter_min(), 0 ) ); ?>+ &amp; a tee</span>
					<small>Back the club, get a shirt.</small>
				</button>
			</div>

			<div class="fppm-row">
				<div class="fppm-field"><label>First name *</label><input type="text" name="fppm_first" value="<?php echo $v( 'fppm_first' ); ?>" required></div>
				<div class="fppm-field"><label>Last name *</label><input type="text" name="fppm_last" value="<?php echo $v( 'fppm_last' ); ?>" required></div>
			</div>
			<div class="fppm-row">
				<div class="fppm-field"><label>Email *</label><input type="email" name="fppm_email" value="<?php echo $v( 'fppm_email' ); ?>" required></div>
				<div class="fppm-field"><label>Phone *</label><input type="tel" name="fppm_phone" value="<?php echo $v( 'fppm_phone' ); ?>" required></div>
			</div>
			<div class="fppm-field"><label>Choose a password *</label><input type="password" name="fppm_pass" autocomplete="new-password" minlength="8" required><small class="fppm-muted">At least 8 characters. You'll use your email + this password to sign in.</small></div>

			<h3>Mailing address</h3>
			<div class="fppm-field"><label>Street address *</label><input type="text" name="fppm_address" value="<?php echo $v( 'fppm_address' ); ?>" autocomplete="street-address" required></div>
			<div class="fppm-row">
				<div class="fppm-field"><label>City *</label><input type="text" name="fppm_city" value="<?php echo $v( 'fppm_city' ) ? $v( 'fppm_city' ) : 'Fort Pierce'; ?>" autocomplete="address-level2" required></div>
				<div class="fppm-field" style="flex:0 1 90px;"><label>State *</label><input type="text" name="fppm_state" value="<?php echo $v( 'fppm_state' ) ? $v( 'fppm_state' ) : 'FL'; ?>" maxlength="2" autocomplete="address-level1" required></div>
				<div class="fppm-field" style="flex:0 1 130px;"><label>ZIP *</label><input type="text" name="fppm_zip" value="<?php echo $v( 'fppm_zip' ); ?>" inputmode="numeric" autocomplete="postal-code" required></div>
			</div>

			<!-- PLAYER-ONLY -->
			<div class="fppm-only" data-only="player">
				<h3>Player details</h3>
				<div class="fppm-row">
					<div class="fppm-field"><label>Date of birth</label><input type="date" name="fppm_dob" value="<?php echo $v( 'fppm_dob' ); ?>"></div>
					<div class="fppm-field"><label>Preferred position</label>
						<select name="fppm_position">
							<option value="">— select —</option>
							<?php foreach ( fppm_positions() as $abbr => $full ) : ?>
								<option value="<?php echo esc_attr( $abbr ); ?>" <?php selected( isset( $old['fppm_position'] ) ? $old['fppm_position'] : '', $abbr ); ?>><?php echo esc_html( $abbr . ' — ' . $full ); ?></option>
							<?php endforeach; ?>
						</select>
					</div>
					<div class="fppm-field" style="flex:0 1 130px;"><label>Jersey #</label><input type="number" name="fppm_jersey" min="1" max="99" value="<?php echo $v( 'fppm_jersey' ); ?>"></div>
				</div>
				<div class="fppm-row">
					<div class="fppm-field"><label>Emergency contact name</label><input type="text" name="fppm_ec_name" value="<?php echo $v( 'fppm_ec_name' ); ?>"></div>
					<div class="fppm-field"><label>Emergency contact phone</label><input type="tel" name="fppm_ec_phone" value="<?php echo $v( 'fppm_ec_phone' ); ?>"></div>
				</div>
				<p class="fppm-muted">Player dues are <strong>$<?php echo esc_html( number_format( fppm_price_player_dues(), 2 ) ); ?></strong>. After you register you'll get a PayPal button to pay.</p>
			</div>

			<!-- SUPPORTER-ONLY -->
			<div class="fppm-only" data-only="supporter">
				<h3>Supporter details</h3>
				<div class="fppm-row">
					<div class="fppm-field" style="flex:0 1 130px;"><label>Shirt size</label>
						<select name="fppm_shirt">
							<option value="">—</option>
							<?php foreach ( fppm_shirt_sizes() as $sz ) : ?>
								<option value="<?php echo esc_attr( $sz ); ?>" <?php selected( isset( $old['fppm_shirt'] ) ? $old['fppm_shirt'] : '', $sz ); ?>><?php echo esc_html( $sz ); ?></option>
							<?php endforeach; ?>
						</select>
					</div>
					<div class="fppm-field" style="flex:0 1 170px;"><label>Contribution ($<?php echo esc_html( number_format( fppm_price_supporter_min(), 0 ) ); ?> min)</label><input type="number" name="fppm_contribution" min="<?php echo esc_attr( fppm_price_supporter_min() ); ?>" step="1" value="<?php echo $v( 'fppm_contribution' ) ? $v( 'fppm_contribution' ) : esc_attr( fppm_price_supporter_min() ); ?>"></div>
				</div>
				<p class="fppm-muted">Your contribution (min $<?php echo esc_html( number_format( fppm_price_supporter_min(), 2 ) ); ?>) includes a team tee in your size (shipped to the address above) <strong>plus your own <?php echo esc_html( number_format( fppm_coupon_percent(), 0 ) ); ?>% off promo code</strong> for the whole merch store.</p>
			</div>

			<h3>Liability waiver &amp; release <span class="fppm-muted" style="font-weight:400;font-size:.75rem;">v<?php echo esc_html( fppm_waiver_version() ); ?></span></h3>
			<p class="fppm-muted">Required for everyone attending our events, practices, conditioning and matches.</p>
			<div style="max-height:180px;overflow:auto;border:1px solid var(--fppm-line);border-radius:9px;padding:.7em .8em;background:#fafafa;font-size:.82rem;white-space:pre-wrap;line-height:1.45;"><?php echo esc_html( fppm_waiver_text() ); ?></div>
			<label style="display:flex;gap:.5em;align-items:flex-start;margin:.7em 0 1rem;font-size:.92rem;font-weight:600;">
				<input type="checkbox" name="fppm_waiver_accept" value="1" required style="margin-top:.25em;" <?php checked( ! empty( $old['fppm_waiver_accept'] ) ); ?>>
				<span>I have read and agree to the Liability Waiver &amp; Release above, and I electronically sign it. *</span>
			</label>

			<h3>The Purple Martins oath</h3>
			<div style="border:1px solid var(--fppm-gold);background:var(--fppm-gold-l);border-radius:8px;padding:.8em 1em;font-size:.95rem;font-style:italic;color:var(--fppm-ink);"><?php echo esc_html( fppm_oath_text() ); ?></div>
			<label style="display:flex;gap:.5em;align-items:flex-start;margin:.7em 0 1rem;font-size:.92rem;font-weight:600;">
				<input type="checkbox" name="fppm_oath_accept" value="1" required style="margin-top:.25em;" <?php checked( ! empty( $old['fppm_oath_accept'] ) ); ?>>
				<span>I take this oath. *</span>
			</label>

			<label style="display:flex;gap:.5em;align-items:flex-start;margin:.6em 0 1rem;font-size:.9rem;">
				<input type="checkbox" name="fppm_optin" value="1" checked style="margin-top:.25em;">
				<span>Send me team communications &amp; updates.</span>
			</label>

			<button type="submit" class="fppm-btn">Create my account</button>
			<p class="fppm-muted" style="margin-top:.7em;">Already registered? <a href="<?php echo esc_url( wp_login_url( home_url( '/account/' ) ) ); ?>">Sign in</a>.</p>
		</form>
	</div>

	<script>
	(function(){
		var wrap = document.currentScript.previousElementSibling;
		if(!wrap) return;
		var hidden = wrap.querySelector('#fppm_type');
		var btns = wrap.querySelectorAll('.fppm-type-btn');
		var onlys = wrap.querySelectorAll('.fppm-only');
		function apply(t){
			hidden.value = t;
			btns.forEach(function(b){ b.classList.toggle('is-on', b.getAttribute('data-type')===t); b.setAttribute('aria-checked', b.getAttribute('data-type')===t?'true':'false'); });
			onlys.forEach(function(o){ o.style.display = (o.getAttribute('data-only')===t)?'block':'none'; });
		}
		btns.forEach(function(b){ b.addEventListener('click', function(){ apply(b.getAttribute('data-type')); }); });
		apply(hidden.value || 'fan');
	})();
	</script>
	<?php
	return ob_get_clean();
}

/* Recruit landing — the full all-types join form (fan / player / supporter). */
add_shortcode( 'fppm_invite', 'fppm_sc_invite' );
function fppm_sc_invite( $atts = array() ) {
	return fppm_sc_register( array( 'default' => 'fan' ) );
}

/* ---- Registration handler (runs early so it can redirect) ---- */
add_action( 'template_redirect', 'fppm_maybe_handle_register' );
function fppm_maybe_handle_register() {
	if ( empty( $_POST['fppm_action'] ) || 'register' !== $_POST['fppm_action'] ) { return; }
	if ( is_user_logged_in() ) { return; }

	$fail = function ( $msg ) {
		$GLOBALS['fppm_reg_err'] = $msg;
		$GLOBALS['fppm_reg_old'] = array_map( function ( $x ) {
			return is_string( $x ) ? sanitize_text_field( wp_unslash( $x ) ) : '';
		}, $_POST );
	};

	if ( ! isset( $_POST['fppm_register_nonce'] ) || ! wp_verify_nonce( wp_unslash( $_POST['fppm_register_nonce'] ), 'fppm_register' ) ) {
		return $fail( 'Security check failed — please try again.' );
	}
	// Honeypot: real users leave it blank.
	if ( ! empty( $_POST['fppm_website'] ) ) { return $fail( 'Registration blocked.' ); }

	$type  = isset( $_POST['fppm_type'] ) ? sanitize_key( wp_unslash( $_POST['fppm_type'] ) ) : 'fan';
	if ( ! array_key_exists( $type, fppm_types() ) ) { $type = 'fan'; }
	$first = isset( $_POST['fppm_first'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_first'] ) ) : '';
	$last  = isset( $_POST['fppm_last'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_last'] ) ) : '';
	$email = isset( $_POST['fppm_email'] ) ? sanitize_email( wp_unslash( $_POST['fppm_email'] ) ) : '';
	$phone = isset( $_POST['fppm_phone'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_phone'] ) ) : '';
	$pass  = isset( $_POST['fppm_pass'] ) ? (string) wp_unslash( $_POST['fppm_pass'] ) : '';
	$addr  = isset( $_POST['fppm_address'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_address'] ) ) : '';
	$city  = isset( $_POST['fppm_city'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_city'] ) ) : '';
	$state = isset( $_POST['fppm_state'] ) ? strtoupper( sanitize_text_field( wp_unslash( $_POST['fppm_state'] ) ) ) : '';
	$zip   = isset( $_POST['fppm_zip'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_zip'] ) ) : '';

	// Every member must have a full contact record (name + email + phone + address).
	if ( '' === $first || '' === $last ) { return $fail( 'Please enter your first and last name.' ); }
	if ( ! is_email( $email ) ) { return $fail( 'Please enter a valid email address.' ); }
	if ( '' === $phone ) { return $fail( 'Please enter a phone number.' ); }
	if ( '' === $addr || '' === $city || '' === $state || '' === $zip ) { return $fail( 'Please enter your full mailing address (street, city, state and ZIP).' ); }
	if ( empty( $_POST['fppm_waiver_accept'] ) ) { return $fail( 'You must read and accept the liability waiver to register.' ); }
	if ( empty( $_POST['fppm_oath_accept'] ) ) { return $fail( 'You must take the Purple Martins oath to join.' ); }
	if ( strlen( $pass ) < 8 ) { return $fail( 'Password must be at least 8 characters.' ); }
	if ( email_exists( $email ) ) { return $fail( 'An account with that email already exists — please sign in instead.' ); }

	// Build a unique username from the email local part.
	$base = sanitize_user( current( explode( '@', $email ) ), true );
	if ( '' === $base ) { $base = 'martin'; }
	$username = $base;
	$i = 1;
	while ( username_exists( $username ) ) { $username = $base . $i; $i++; }

	$uid = wp_insert_user( array(
		'user_login'   => $username,
		'user_email'   => $email,
		'user_pass'    => $pass,
		'first_name'   => $first,
		'last_name'    => $last,
		'display_name' => trim( $first . ' ' . $last ),
		'role'         => 'fppm_member',
	) );
	if ( is_wp_error( $uid ) ) { return $fail( 'Could not create your account: ' . $uid->get_error_message() ); }

	// Common meta — captured for every member regardless of type.
	update_user_meta( $uid, 'fppm_type', $type );
	update_user_meta( $uid, 'fppm_phone', $phone );
	update_user_meta( $uid, 'fppm_address', $addr );
	update_user_meta( $uid, 'fppm_city', $city );
	update_user_meta( $uid, 'fppm_state', $state );
	update_user_meta( $uid, 'fppm_zip', $zip );
	update_user_meta( $uid, 'fppm_optin', empty( $_POST['fppm_optin'] ) ? 0 : 1 );
	update_user_meta( $uid, 'fppm_joined', current_time( 'mysql' ) );

	// Unique member promo code for EVERY member (shown to players/supporters, hidden from fans).
	fppm_assign_member_code( $uid, $first, $last );

	// Immutable liability-waiver acceptance record (the legal signature).
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	$ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? substr( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ), 0, 300 ) : '';
	update_user_meta( $uid, 'fppm_waiver', array(
		'accepted' => 1,
		'version'  => fppm_waiver_version(),
		'hash'     => fppm_waiver_hash(),
		'at'       => current_time( 'mysql' ),
		'ip'       => $ip,
		'ua'       => $ua,
		'name'     => trim( $first . ' ' . $last ),
		'email'    => $email,
	) );
	// Club oath acceptance.
	update_user_meta( $uid, 'fppm_oath', array(
		'accepted' => 1,
		'at'       => current_time( 'mysql' ),
		'text'     => fppm_oath_text(),
	) );

	if ( 'player' === $type ) {
		update_user_meta( $uid, 'fppm_player_status', 'trialist' );
		update_user_meta( $uid, 'fppm_dob', isset( $_POST['fppm_dob'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_dob'] ) ) : '' );
		$pos = isset( $_POST['fppm_position'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_position'] ) ) : '';
		if ( array_key_exists( $pos, fppm_positions() ) ) { update_user_meta( $uid, 'fppm_position', $pos ); }
		update_user_meta( $uid, 'fppm_jersey', isset( $_POST['fppm_jersey'] ) ? preg_replace( '/[^0-9]/', '', wp_unslash( $_POST['fppm_jersey'] ) ) : '' );
		update_user_meta( $uid, 'fppm_ec_name', isset( $_POST['fppm_ec_name'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_ec_name'] ) ) : '' );
		update_user_meta( $uid, 'fppm_ec_phone', isset( $_POST['fppm_ec_phone'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_ec_phone'] ) ) : '' );
		fppm_dues_add( $uid, fppm_price_player_dues(), 'Player dues' );
	} elseif ( 'supporter' === $type ) {
		$shirt = isset( $_POST['fppm_shirt'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_shirt'] ) ) : '';
		if ( in_array( $shirt, fppm_shirt_sizes(), true ) ) { update_user_meta( $uid, 'fppm_shirt', $shirt ); }
		$contrib = isset( $_POST['fppm_contribution'] ) ? (float) $_POST['fppm_contribution'] : fppm_price_supporter_min();
		if ( $contrib < fppm_price_supporter_min() ) { $contrib = fppm_price_supporter_min(); }
		update_user_meta( $uid, 'fppm_contribution', number_format( $contrib, 2, '.', '' ) );
		fppm_dues_add( $uid, $contrib, 'Supporter contribution (incl. tee + ' . number_format( fppm_coupon_percent(), 0 ) . '% merch code)' );
	}

	// Notify staff.
	$to = fppm_notify_email();
	if ( $to ) {
		$subj = '[FPPM] New ' . fppm_type_label( $type ) . ' — ' . trim( $first . ' ' . $last );
		$body = "New registration:\n\nName: $first $last\nType: " . fppm_type_label( $type ) . "\nEmail: $email\nPhone: $phone\nAddress: $addr, $city, $state $zip\n";
		$body .= 'Waiver: accepted v' . fppm_waiver_version() . " ($ip)\n";
		wp_mail( $to, $subj, $body );
	}

	// Off-server legal record: push the waiver row to Google Sheets (soft-fail).
	fppm_waiver_record_offsite( $uid );

	// Log them in and send to the dashboard.
	wp_set_current_user( $uid );
	wp_set_auth_cookie( $uid, true );
	wp_safe_redirect( add_query_arg( 'fppm_note', 'registered', home_url( '/account/' ) ) );
	exit;
}

/* ============================================================
 * 8. ACCOUNT — [fppm_account] (member OR staff by role)
 * ============================================================ */
add_shortcode( 'fppm_account', 'fppm_sc_account' );
function fppm_sc_account( $atts = array() ) {
	if ( ! is_user_logged_in() ) {
		return fppm_logged_out_account();
	}
	$uid = get_current_user_id();
	if ( fppm_can_manage() ) {
		return fppm_staff_dashboard();
	}
	if ( ! fppm_member_complete( $uid ) ) {
		return fppm_complete_form();
	}
	return fppm_member_dashboard();
}

/* Has this user finished the FPPM membership (type + address + waiver + oath)?
 * Google/social sign-ins create a bare WP user, so they land here until complete. */
function fppm_member_complete( $uid ) {
	if ( ! get_user_meta( $uid, 'fppm_type', true ) ) { return false; }
	$w = get_user_meta( $uid, 'fppm_waiver', true );
	if ( ! is_array( $w ) || empty( $w['accepted'] ) ) { return false; }
	$o = get_user_meta( $uid, 'fppm_oath', true );
	if ( ! is_array( $o ) || empty( $o['accepted'] ) ) { return false; }
	if ( ! get_user_meta( $uid, 'fppm_zip', true ) ) { return false; }
	return true;
}

/* Google button via Nextend Social Login, if that plugin is active. */
function fppm_google_button() {
	if ( shortcode_exists( 'nextend_social_login' ) ) {
		return do_shortcode( '[nextend_social_login provider="google"]' );
	}
	return '';
}

/* Logged-out /account: a sign-in bar (Google + password) above the full signup. */
function fppm_logged_out_account() {
	$g = fppm_google_button();
	ob_start();
	echo fppm_styles() . '<div class="fppm-wrap"><div class="fppm-card" style="text-align:center;">';
	echo '<p style="margin:0 0 .6rem;font-weight:600;">Already a member? Sign in</p>';
	if ( $g ) { echo '<div style="margin:0 0 .6rem;">' . $g . '</div>'; }
	echo '<a class="fppm-btn fppm-btn--ghost" href="' . esc_url( wp_login_url( home_url( '/account/' ) ) ) . '">Sign in with email</a>';
	echo '</div></div>';
	return ob_get_clean() . fppm_sc_register();
}

/* "Finish your membership" — for logged-in users who signed up via Google/social
 * and are missing the FPPM fields (type, address, waiver, oath). Updates the
 * existing account (no new user is created). */
function fppm_complete_form() {
	$uid   = get_current_user_id();
	$u     = wp_get_current_user();
	$first = get_user_meta( $uid, 'first_name', true );
	$last  = get_user_meta( $uid, 'last_name', true );
	$err   = isset( $GLOBALS['fppm_reg_err'] ) ? $GLOBALS['fppm_reg_err'] : ( isset( $_GET['fppm_err'] ) ? sanitize_text_field( wp_unslash( $_GET['fppm_err'] ) ) : '' );
	ob_start();
	echo fppm_styles();
	?>
	<div class="fppm-wrap">
		<h2 class="fppm-h"><img class="fppm-crest-img" src="<?php echo esc_url( fppm_asset_url( 'icon-192.png' ) ); ?>" alt=""> Finish joining the <?php echo esc_html( fppm_collective() ); ?></h2>
		<p class="fppm-sub">You're signed in as <?php echo esc_html( $u->user_email ); ?> — just a few details to complete your membership.</p>
		<?php if ( $err ) : ?><div class="fppm-flash fppm-flash--err"><?php echo esc_html( $err ); ?></div><?php endif; ?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="fppm-card" novalidate>
			<input type="hidden" name="action" value="fppm_complete">
			<?php wp_nonce_field( 'fppm_complete' ); ?>
			<input type="hidden" name="fppm_type" id="fppm_type" value="fan">
			<h3>How do you want to join?</h3>
			<div class="fppm-types" role="radiogroup">
				<button type="button" class="fppm-type-btn" data-type="fan"><b>Fan</b><span class="fppm-price">Free</span></button>
				<button type="button" class="fppm-type-btn" data-type="player"><b>Player</b><span class="fppm-price">$<?php echo esc_html( number_format( fppm_price_player_dues(), 0 ) ); ?> dues</span></button>
				<button type="button" class="fppm-type-btn" data-type="supporter"><b>Supporter</b><span class="fppm-price">$<?php echo esc_html( number_format( fppm_price_supporter_min(), 0 ) ); ?>+ &amp; a tee</span></button>
			</div>
			<div class="fppm-row">
				<div class="fppm-field"><label>First name *</label><input type="text" name="fppm_first" value="<?php echo esc_attr( $first ); ?>" required></div>
				<div class="fppm-field"><label>Last name *</label><input type="text" name="fppm_last" value="<?php echo esc_attr( $last ); ?>" required></div>
			</div>
			<div class="fppm-field"><label>Phone *</label><input type="tel" name="fppm_phone" value="<?php echo esc_attr( get_user_meta( $uid, 'fppm_phone', true ) ); ?>" required></div>
			<h3>Mailing address</h3>
			<div class="fppm-field"><label>Street address *</label><input type="text" name="fppm_address" required></div>
			<div class="fppm-row">
				<div class="fppm-field"><label>City *</label><input type="text" name="fppm_city" value="Fort Pierce" required></div>
				<div class="fppm-field" style="flex:0 1 90px;"><label>State *</label><input type="text" name="fppm_state" value="FL" maxlength="2" required></div>
				<div class="fppm-field" style="flex:0 1 130px;"><label>ZIP *</label><input type="text" name="fppm_zip" inputmode="numeric" required></div>
			</div>
			<div class="fppm-only" data-only="player">
				<div class="fppm-row">
					<div class="fppm-field"><label>Date of birth</label><input type="date" name="fppm_dob"></div>
					<div class="fppm-field"><label>Position</label><select name="fppm_position"><option value="">—</option><?php foreach ( fppm_positions() as $ab => $fu ) { echo '<option value="' . esc_attr( $ab ) . '">' . esc_html( $ab . ' — ' . $fu ) . '</option>'; } ?></select></div>
					<div class="fppm-field" style="flex:0 1 110px;"><label>Jersey #</label><input type="number" name="fppm_jersey" min="1" max="99"></div>
				</div>
				<div class="fppm-row"><div class="fppm-field"><label>Emergency contact name</label><input type="text" name="fppm_ec_name"></div><div class="fppm-field"><label>Emergency phone</label><input type="tel" name="fppm_ec_phone"></div></div>
			</div>
			<div class="fppm-only" data-only="supporter">
				<div class="fppm-row">
					<div class="fppm-field" style="flex:0 1 130px;"><label>Shirt size</label><select name="fppm_shirt"><option value="">—</option><?php foreach ( fppm_shirt_sizes() as $sz ) { echo '<option>' . esc_html( $sz ) . '</option>'; } ?></select></div>
					<div class="fppm-field" style="flex:0 1 170px;"><label>Contribution ($<?php echo esc_html( number_format( fppm_price_supporter_min(), 0 ) ); ?> min)</label><input type="number" name="fppm_contribution" min="<?php echo esc_attr( fppm_price_supporter_min() ); ?>" value="<?php echo esc_attr( fppm_price_supporter_min() ); ?>"></div>
				</div>
			</div>
			<h3>Liability waiver &amp; release <span class="fppm-muted" style="font-weight:400;font-size:.75rem;">v<?php echo esc_html( fppm_waiver_version() ); ?></span></h3>
			<div style="max-height:150px;overflow:auto;border:1px solid var(--fppm-line);border-radius:9px;padding:.7em;background:#fafafa;font-size:.8rem;white-space:pre-wrap;"><?php echo esc_html( fppm_waiver_text() ); ?></div>
			<label style="display:flex;gap:.5em;margin:.7em 0;font-weight:600;font-size:.92rem;"><input type="checkbox" name="fppm_waiver_accept" value="1" required> <span>I have read and agree to the waiver. *</span></label>
			<h3>The Purple Martins oath</h3>
			<div style="border:1px solid var(--fppm-gold);background:var(--fppm-gold-l);border-radius:8px;padding:.7em;font-style:italic;color:var(--fppm-ink);"><?php echo esc_html( fppm_oath_text() ); ?></div>
			<label style="display:flex;gap:.5em;margin:.7em 0 1rem;font-weight:600;font-size:.92rem;"><input type="checkbox" name="fppm_oath_accept" value="1" required> <span>I take this oath. *</span></label>
			<button type="submit" class="fppm-btn">Complete membership</button>
		</form>
	</div>
	<script>
	(function(){var w=document.currentScript.previousElementSibling;if(!w)return;var h=w.querySelector('#fppm_type'),bs=w.querySelectorAll('.fppm-type-btn'),os=w.querySelectorAll('.fppm-only');function ap(t){h.value=t;bs.forEach(function(b){b.classList.toggle('is-on',b.getAttribute('data-type')===t);});os.forEach(function(o){o.style.display=(o.getAttribute('data-only')===t)?'block':'none';});}bs.forEach(function(b){b.addEventListener('click',function(){ap(b.getAttribute('data-type'));});});ap('fan');})();
	</script>
	<?php
	return ob_get_clean();
}

add_action( 'admin_post_fppm_complete', 'fppm_h_complete' );
function fppm_h_complete() {
	$uid = get_current_user_id();
	if ( ! $uid ) { wp_die( 'Please sign in.' ); }
	check_admin_referer( 'fppm_complete' );
	$fail = function ( $msg ) {
		$GLOBALS['fppm_reg_err'] = $msg; // shown on redisplay
		wp_safe_redirect( add_query_arg( 'fppm_err', rawurlencode( $msg ), home_url( '/account/' ) ) );
		exit;
	};
	$type  = isset( $_POST['fppm_type'] ) ? sanitize_key( wp_unslash( $_POST['fppm_type'] ) ) : 'fan';
	if ( ! array_key_exists( $type, fppm_types() ) ) { $type = 'fan'; }
	$first = isset( $_POST['fppm_first'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_first'] ) ) : '';
	$last  = isset( $_POST['fppm_last'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_last'] ) ) : '';
	$phone = isset( $_POST['fppm_phone'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_phone'] ) ) : '';
	$addr  = isset( $_POST['fppm_address'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_address'] ) ) : '';
	$city  = isset( $_POST['fppm_city'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_city'] ) ) : '';
	$state = isset( $_POST['fppm_state'] ) ? strtoupper( sanitize_text_field( wp_unslash( $_POST['fppm_state'] ) ) ) : '';
	$zip   = isset( $_POST['fppm_zip'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_zip'] ) ) : '';
	if ( '' === $first || '' === $last || '' === $phone || '' === $addr || '' === $city || '' === $state || '' === $zip ) { $fail( 'Please fill in your name, phone and full address.' ); }
	if ( empty( $_POST['fppm_waiver_accept'] ) ) { $fail( 'You must accept the liability waiver.' ); }
	if ( empty( $_POST['fppm_oath_accept'] ) ) { $fail( 'You must take the Purple Martins oath.' ); }

	wp_update_user( array( 'ID' => $uid, 'first_name' => $first, 'last_name' => $last, 'display_name' => trim( $first . ' ' . $last ) ) );
	update_user_meta( $uid, 'fppm_type', $type );
	update_user_meta( $uid, 'fppm_phone', $phone );
	update_user_meta( $uid, 'fppm_address', $addr );
	update_user_meta( $uid, 'fppm_city', $city );
	update_user_meta( $uid, 'fppm_state', $state );
	update_user_meta( $uid, 'fppm_zip', $zip );
	if ( ! get_user_meta( $uid, 'fppm_joined', true ) ) { update_user_meta( $uid, 'fppm_joined', current_time( 'mysql' ) ); }
	$u = wp_get_current_user();
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	$ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? substr( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ), 0, 300 ) : '';
	update_user_meta( $uid, 'fppm_waiver', array( 'accepted' => 1, 'version' => fppm_waiver_version(), 'hash' => fppm_waiver_hash(), 'at' => current_time( 'mysql' ), 'ip' => $ip, 'ua' => $ua, 'name' => trim( $first . ' ' . $last ), 'email' => $u->user_email ) );
	update_user_meta( $uid, 'fppm_oath', array( 'accepted' => 1, 'at' => current_time( 'mysql' ), 'text' => fppm_oath_text() ) );
	if ( 'player' === $type ) {
		if ( ! get_user_meta( $uid, 'fppm_player_status', true ) ) { update_user_meta( $uid, 'fppm_player_status', 'trialist' ); }
		update_user_meta( $uid, 'fppm_dob', isset( $_POST['fppm_dob'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_dob'] ) ) : '' );
		$pos = isset( $_POST['fppm_position'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_position'] ) ) : '';
		if ( array_key_exists( $pos, fppm_positions() ) ) { update_user_meta( $uid, 'fppm_position', $pos ); }
		update_user_meta( $uid, 'fppm_jersey', isset( $_POST['fppm_jersey'] ) ? preg_replace( '/[^0-9]/', '', wp_unslash( $_POST['fppm_jersey'] ) ) : '' );
		update_user_meta( $uid, 'fppm_ec_name', isset( $_POST['fppm_ec_name'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_ec_name'] ) ) : '' );
		update_user_meta( $uid, 'fppm_ec_phone', isset( $_POST['fppm_ec_phone'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_ec_phone'] ) ) : '' );
		if ( ! fppm_dues_get( $uid ) ) { fppm_dues_add( $uid, fppm_price_player_dues(), 'Player dues' ); }
	} elseif ( 'supporter' === $type ) {
		$shirt = isset( $_POST['fppm_shirt'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_shirt'] ) ) : '';
		if ( in_array( $shirt, fppm_shirt_sizes(), true ) ) { update_user_meta( $uid, 'fppm_shirt', $shirt ); }
		$contrib = isset( $_POST['fppm_contribution'] ) ? (float) $_POST['fppm_contribution'] : fppm_price_supporter_min();
		if ( $contrib < fppm_price_supporter_min() ) { $contrib = fppm_price_supporter_min(); }
		update_user_meta( $uid, 'fppm_contribution', number_format( $contrib, 2, '.', '' ) );
		if ( ! fppm_dues_get( $uid ) ) { fppm_dues_add( $uid, $contrib, 'Supporter contribution (incl. tee + ' . number_format( fppm_coupon_percent(), 0 ) . '% merch code)' ); }
	}
	fppm_assign_member_code( $uid, $first, $last );
	// Ensure they carry the member role.
	$user = new WP_User( $uid );
	if ( ! in_array( 'fppm_member', (array) $user->roles, true ) && ! fppm_can_manage( $uid ) ) { $user->add_role( 'fppm_member' ); }
	fppm_waiver_record_offsite( $uid );
	wp_safe_redirect( add_query_arg( 'fppm_note', 'registered', home_url( '/account/' ) ) );
	exit;
}

/* ---------- Member dashboard ---------- */
function fppm_member_dashboard() {
	$uid   = get_current_user_id();
	$type  = fppm_type_of( $uid );
	$name  = fppm_display_name( $uid );
	$owe   = fppm_dues_outstanding( $uid );

	ob_start();
	echo fppm_styles();
	echo '<div class="fppm-wrap">';
	echo '<h2 class="fppm-h"><img class="fppm-crest-img" src="' . esc_url( fppm_asset_url( 'icon-192.png' ) ) . '" alt=""> ' . esc_html( $name ) . '</h2>';
	echo '<p class="fppm-sub"><span class="fppm-badge fppm-badge--gold">' . esc_html( fppm_collective() ) . '</span> <span class="fppm-badge">' . esc_html( fppm_type_label( $type ) ) . '</span>';
	if ( 'player' === $type ) {
		echo ' <span class="fppm-badge">' . esc_html( fppm_status_label( fppm_player_status_of( $uid ) ) ) . '</span>';
	}
	echo '</p>';
	echo fppm_ticker_html();
	echo fppm_flash_html();

	/* Install the app — prominent, toward the top (device-aware; self-hides once installed) */
	echo fppm_install_card();

	/* Player invite → accept to activate */
	echo fppm_player_accept_card( $uid );

	/* Dues / contribution card */
	if ( 'fan' !== $type ) {
		echo '<div class="fppm-card"><h3>' . ( 'player' === $type ? 'Dues' : 'Contribution' ) . '</h3>';
		if ( $owe > 0 ) {
			echo '<p>You have <strong class="fppm-badge fppm-badge--owe">$' . esc_html( number_format( $owe, 2 ) ) . ' outstanding</strong>.</p>';
			echo '<p>' . fppm_pay_button( $type ) . '</p>';
			if ( fppm_pay_is_wc( $type ) ) {
				echo '<p class="fppm-muted">Paid securely through the team store — your dues are marked paid automatically once the order completes.</p>';
			} else {
				echo '<p class="fppm-muted">After you pay, a staff member marks it received (usually same day).</p>';
			}
		} else {
			echo '<p><span class="fppm-badge fppm-badge--paid">All paid up</span> — thank you!</p>';
		}
		echo '</div>';
	}

	/* Member promo code — shown to players + supporters, hidden from free fans */
	$coupon = get_user_meta( $uid, 'fppm_coupon', true );
	if ( $coupon && 'fan' !== $type ) {
		echo '<div class="fppm-card" style="background:var(--fppm-gold-l);border-color:var(--fppm-gold);">';
		echo '<h3>Your member promo code</h3>';
		echo '<p>Your personal <strong>' . esc_html( number_format( fppm_coupon_percent(), 0 ) ) . '% off</strong> code for the whole merch store:</p>';
		echo '<p style="font-family:\'Oswald\',monospace;font-size:1.6rem;font-weight:700;letter-spacing:2px;color:var(--fppm-purple-d);background:#fff;border:2px dashed var(--fppm-gold);border-radius:10px;padding:.4em .6em;display:inline-block;">' . esc_html( $coupon ) . '</p>';
		echo '<p class="fppm-muted">Enter it at checkout in the ' . esc_html( fppm_shop_url() ? 'store' : 'merch store' ) . '. Thanks for backing the ' . esc_html( fppm_collective() ) . '!</p>';
		echo '</div>';
	}

	/* Invite others — join as any type */
	echo fppm_invite_card();

	/* Apparel block */
	echo fppm_apparel_block();

	/* Announcements */
	echo fppm_schedule_member_html( $uid );

	echo fppm_announcements_html();

	/* Profile summary */
	echo '<div class="fppm-card"><h3>Your info</h3><table class="fppm-table"><tbody>';
	$rows = array(
		'Email'   => wp_get_current_user()->user_email,
		'Phone'   => get_user_meta( $uid, 'fppm_phone', true ),
		'Address' => fppm_address_line( $uid ),
	);
	if ( 'player' === $type ) {
		$pos = get_user_meta( $uid, 'fppm_position', true );
		$rows['Position']  = $pos ? $pos . ' — ' . ( fppm_positions()[ $pos ] ?? '' ) : '—';
		$rows['Jersey #']  = get_user_meta( $uid, 'fppm_jersey', true );
		$rows['Emergency'] = trim( get_user_meta( $uid, 'fppm_ec_name', true ) . ' ' . get_user_meta( $uid, 'fppm_ec_phone', true ) );
	}
	if ( 'supporter' === $type ) {
		$rows['Shirt size'] = get_user_meta( $uid, 'fppm_shirt', true );
	}
	$wv = get_user_meta( $uid, 'fppm_waiver', true );
	if ( is_array( $wv ) && ! empty( $wv['accepted'] ) ) {
		$rows['Waiver'] = 'Accepted v' . ( isset( $wv['version'] ) ? $wv['version'] : '' ) . ( isset( $wv['at'] ) ? ' · ' . mysql2date( 'M j, Y', $wv['at'] ) : '' );
	}
	$ov = get_user_meta( $uid, 'fppm_oath', true );
	if ( is_array( $ov ) && ! empty( $ov['accepted'] ) ) {
		$rows['Oath'] = 'Taken' . ( isset( $ov['at'] ) ? ' · ' . mysql2date( 'M j, Y', $ov['at'] ) : '' );
	}
	foreach ( $rows as $k => $val ) {
		echo '<tr><th style="width:35%;">' . esc_html( $k ) . '</th><td>' . esc_html( $val ? $val : '—' ) . '</td></tr>';
	}
	echo '</tbody></table>';
	echo '<p class="fppm-muted" style="margin-top:.8em;"><a href="' . esc_url( wp_logout_url( home_url() ) ) . '">Sign out</a></p>';
	echo '</div>';

	/* Danger zone — the member can permanently delete their own account. */
	echo '<details class="fppm-card" style="border-color:var(--fppm-ink);"><summary style="cursor:pointer;font-weight:700;color:var(--fppm-ink);">Delete my account</summary>';
	echo '<p class="fppm-muted" style="margin:.6em 0;">This permanently removes your account and all your info. It can\'t be undone. Any unpaid dues records are removed too.</p>';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" onsubmit="return confirm(\'Permanently delete your Purple Martins account? This cannot be undone.\');">';
	echo '<input type="hidden" name="action" value="fppm_self_delete">';
	wp_nonce_field( 'fppm_self_delete_' . $uid );
	echo '<button class="fppm-btn" style="background:var(--fppm-ink);" type="submit">Yes, delete my account</button>';
	echo '</form></details>';

	echo '</div>';
	return ob_get_clean();
}

/* Apparel block — one card per catalog item. Each buy button prefers the
 * WooCommerce/Printful product (which captures size + shipping address and
 * fulfills on-demand); falls back to a PayPal link, then a placeholder. */
function fppm_apparel_block() {
	// In-plugin store (unique discounts via PayPal + Printful) when configured.
	if ( fppm_store_ready() && is_user_logged_in() ) { return fppm_store_html(); }
	$shop = fppm_shop_url();
	ob_start();
	echo '<div class="fppm-card"><h3>Team apparel</h3>';
	if ( $shop ) {
		echo '<p><a class="fppm-btn fppm-btn--ghost" href="' . esc_url( $shop ) . '" target="_blank" rel="noopener">🛍️ Shop all apparel</a></p>';
	}
	echo '<div class="fppm-apparel">';
	foreach ( fppm_apparel_items() as $item ) {
		echo '<div class="fppm-appcard">';
		echo '<b>' . esc_html( $item['label'] ) . '</b>';
		if ( ! empty( $item['desc'] ) ) { echo '<div class="fppm-muted">' . esc_html( $item['desc'] ) . '</div>'; }
		if ( isset( $item['emb'] ) ) {
			echo '<div class="fppm-price">$' . esc_html( number_format( $item['price'], 0 ) ) . ' <span style="font-size:.6em;font-weight:500;color:var(--fppm-muted);">printed</span> · $' . esc_html( number_format( $item['emb'], 0 ) ) . ' <span style="font-size:.6em;font-weight:500;color:var(--fppm-muted);">embroidered</span></div>';
		} else {
			echo '<div class="fppm-price">$' . esc_html( number_format( $item['price'], 2 ) ) . '</div>';
		}
		echo fppm_apparel_buy_button( $item );
		echo '</div>';
	}
	echo '</div><p class="fppm-muted" style="margin-top:.7em;">Apparel ships on-demand via Printful. More gear coming soon.</p></div>';
	return ob_get_clean();
}

/* One WooCommerce product-link button, or '' if that product isn't published. */
function fppm_wc_link_button( $pid, $label, $classes = 'fppm-btn fppm-btn--gold' ) {
	$pid = (int) $pid;
	if ( $pid && fppm_wc_active() && 'publish' === get_post_status( $pid ) ) {
		return '<a class="' . esc_attr( $classes ) . '" href="' . esc_url( get_permalink( $pid ) ) . '">' . $label . '</a>';
	}
	return '';
}

/* Pick the right buy button(s) for one apparel item. Tees offer a Printed vs
 * Embroidered choice (+$5); other items get a single button. */
function fppm_apparel_buy_button( $item ) {
	if ( isset( $item['emb'] ) ) {
		$printed_id = ! empty( $item['wc_id'] ) ? (int) $item['wc_id'] : 0;
		$emb_id     = ! empty( $item['emb_id'] ) ? (int) $item['emb_id'] : $printed_id; // fall back to the same product's variation
		$p = fppm_wc_link_button( $printed_id, 'Printed — $' . number_format( $item['price'], 0 ) . ' →' );
		$e = fppm_wc_link_button( $emb_id, 'Embroidered — $' . number_format( $item['emb'], 0 ) . ' →', 'fppm-btn fppm-btn--ghost' );
		if ( $p || $e ) { return '<div class="fppm-actions">' . $p . $e . '</div>'; }
		// else fall through to the generic fallback below (store not wired yet)
	}
	$wc_id = ! empty( $item['wc_id'] ) ? (int) $item['wc_id'] : 0;
	$b = fppm_wc_link_button( $wc_id, 'Choose size &amp; buy →' );
	if ( $b ) { return $b; }
	// Direct product link (e.g. a Printful storefront product).
	if ( ! empty( $item['url'] ) ) {
		$label = 'Buy' . ( ! empty( $item['price'] ) ? ' — $' . number_format( $item['price'], 0 ) : '' ) . ' →';
		return '<a class="fppm-btn fppm-btn--gold" href="' . esc_url( $item['url'] ) . '" target="_blank" rel="noopener">' . esc_html( $label ) . '</a>';
	}
	$pp = ! empty( $item['pp_key'] ) ? fppm_pp_link( $item['pp_key'] ) : '';
	if ( $pp ) { return fppm_paypal_button( $pp, 'Buy with PayPal' ); }
	return fppm_paypal_button( '', 'Buy' );
}

/* [fppm_merch] — the apparel block as a standalone (public) shortcode. */
add_shortcode( 'fppm_merch', 'fppm_sc_merch' );
function fppm_sc_merch( $atts = array() ) {
	return fppm_styles() . '<div class="fppm-wrap">' . fppm_apparel_block() . '</div>';
}

/* ---- Dues / contribution payment routing (WooCommerce first) ---- */
/* Which WooCommerce product represents each paid membership type.
 * Supporter falls back to the tee product (buying the tee = supporting). */
function fppm_wc_dues_id()      { return (int) get_option( 'fppm_wc_dues_id', 0 ); }
function fppm_wc_supporter_id() {
	$id = (int) get_option( 'fppm_wc_supporter_id', 0 );
	return $id ? $id : (int) get_option( 'fppm_wc_tshirt_id', 0 );
}
function fppm_pay_wc_id( $type ) {
	return ( 'supporter' === $type ) ? fppm_wc_supporter_id() : fppm_wc_dues_id();
}
/* Is this type's payment going to route through the WooCommerce store? */
function fppm_pay_is_wc( $type ) {
	$id = fppm_pay_wc_id( $type );
	return $id && fppm_wc_active() && 'publish' === get_post_status( $id );
}
/* The pay button for a member's dues/contribution. */
function fppm_pay_button( $type ) {
	if ( fppm_pay_is_wc( $type ) ) {
		$label = ( 'supporter' === $type ) ? 'Contribute &amp; get your tee →' : 'Pay dues →';
		return '<a class="fppm-btn fppm-btn--gold" href="' . esc_url( get_permalink( fppm_pay_wc_id( $type ) ) ) . '">' . $label . '</a>';
	}
	// Fallback to the PayPal link while the store isn't wired up yet.
	$link  = ( 'supporter' === $type ) ? fppm_pp_supporter_link() : fppm_pp_dues_link();
	$label = ( 'supporter' === $type ) ? 'Contribute with PayPal' : 'Pay dues with PayPal';
	return fppm_paypal_button( $link, $label );
}

/* ---- Top-of-page ticker: total members + shirts sold ---- */
function fppm_member_count() {
	$counts = count_users();
	return isset( $counts['avail_roles']['fppm_member'] ) ? (int) $counts['avail_roles']['fppm_member'] : 0;
}
/* Shirts sold = WooCommerce total_sales across the tee + supporter products,
 * plus an optional manual starting count (fppm_shirts_sold_manual). */
function fppm_shirts_sold() {
	$manual = (int) get_option( 'fppm_shirts_sold_manual', 0 );
	$store  = (int) get_option( 'fppm_store_shirts_sold', 0 ); // real in-plugin tee/shirt orders
	$sold   = 0;
	if ( fppm_wc_active() && function_exists( 'wc_get_product' ) ) {
		$ids = array_unique( array_filter( array(
			(int) get_option( 'fppm_wc_tshirt_id', 0 ),
			(int) get_option( 'fppm_wc_supporter_id', 0 ),
		) ) );
		foreach ( $ids as $pid ) {
			$p = wc_get_product( $pid );
			if ( $p ) { $sold += (int) $p->get_total_sales(); }
		}
	}
	return $manual + $store + $sold;
}
/* Social-proof gate: the members/shirts-sold ticker stays hidden from everyone
 * until the club reaches BOTH milestones (so small early numbers aren't shown).
 * Thresholds overridable via filter. */
function fppm_ticker_visible() {
	$min_members = (int) apply_filters( 'fppm_ticker_min_members', 89 );
	$min_shirts  = (int) apply_filters( 'fppm_ticker_min_shirts', 12 );
	return fppm_member_count() >= $min_members && fppm_shirts_sold() >= $min_shirts;
}
function fppm_ticker_html() {
	if ( ! fppm_ticker_visible() ) { return ''; }
	$m = fppm_member_count();
	$s = fppm_shirts_sold();
	ob_start();
	echo '<div class="fppm-ticker">';
	echo '<div class="fppm-stat"><span class="fppm-stat-n">' . esc_html( number_format_i18n( $m ) ) . '</span><span class="fppm-stat-l">Members</span></div>';
	echo '<div class="fppm-stat"><span class="fppm-stat-n">' . esc_html( number_format_i18n( $s ) ) . '</span><span class="fppm-stat-l">Shirts sold</span></div>';
	echo '</div>';
	return ob_get_clean();
}

/* ---- Auto-reconcile: a completed WooCommerce order clears that member's dues ---- */
add_action( 'woocommerce_order_status_completed', 'fppm_wc_reconcile_dues' );
add_action( 'woocommerce_payment_complete', 'fppm_wc_reconcile_dues' );
function fppm_wc_reconcile_dues( $order_id ) {
	if ( ! function_exists( 'wc_get_order' ) ) { return; }
	$order = wc_get_order( $order_id );
	if ( ! $order ) { return; }
	$uid = $order->get_user_id();
	if ( ! $uid ) { return; } // guest checkout — staff reconciles by hand
	$ids = array_filter( array( fppm_wc_dues_id(), (int) get_option( 'fppm_wc_supporter_id', 0 ), (int) get_option( 'fppm_wc_tshirt_id', 0 ) ) );
	if ( ! $ids ) { return; }
	$match = false;
	foreach ( $order->get_items() as $item ) {
		if ( in_array( (int) $item->get_product_id(), $ids, true ) ) { $match = true; break; }
	}
	if ( ! $match ) { return; }
	$hit = false;
	foreach ( fppm_dues_open( $uid ) as $e ) {
		if ( fppm_dues_mark( $uid, $e['num'], true, 0 ) ) { $hit = true; }
	}
	if ( $hit ) { update_user_meta( $uid, 'fppm_last_wc_order', (int) $order_id ); }
}

/* Invite/recruit card — any member can send others to join as any type. */
function fppm_invite_card() {
	$url   = fppm_join_url();
	$share = 'Join the ' . fppm_team_name() . ' — ' . $url;
	ob_start();
	echo '<div class="fppm-card" style="border-color:var(--fppm-gold);background:var(--fppm-gold-l);">';
	echo '<h3>Grow the ' . esc_html( fppm_collective() ) . '</h3>';
	echo '<p>Know someone who\'d back the Martins? Send them the join link — anyone can sign up as a <strong>fan</strong> (free), <strong>player</strong>, or <strong>supporter</strong>.</p>';
	echo '<div class="fppm-actions" style="align-items:center;gap:.5rem;">';
	echo '<input type="text" readonly value="' . esc_attr( $url ) . '" onclick="this.select()" id="fppm-inv-url" style="flex:1 1 200px;min-width:0;padding:.5em .7em;border:1px solid var(--fppm-line);border-radius:9px;font-size:.9rem;">';
	echo '<button type="button" class="fppm-btn fppm-btn--ghost" onclick="var i=document.getElementById(\'fppm-inv-url\');i.select();navigator.clipboard&&navigator.clipboard.writeText(i.value);this.textContent=\'Copied!\';">Copy link</button>';
	echo '</div><div class="fppm-actions" style="margin-top:.6rem;">';
	echo '<a class="fppm-btn" id="fppm-inv-sms" href="sms:?&body=' . rawurlencode( $share ) . '">Text it</a>';
	echo '<a class="fppm-btn fppm-btn--ghost" href="mailto:?subject=' . rawurlencode( 'Join the Fort Pierce Purple Martins' ) . '&body=' . rawurlencode( $share ) . '">Email it</a>';
	echo '<button type="button" class="fppm-btn fppm-btn--ghost" onclick="navigator.share?navigator.share({title:\'' . esc_js( fppm_team_name() ) . '\',url:\'' . esc_js( $url ) . '\'}):document.getElementById(\'fppm-inv-url\').select()">Share…</button>';
	echo '</div></div>';
	/* iOS and Android want different sms: syntax for a prefilled body — fix the href per device. */
	echo '<script>(function(){var a=document.getElementById("fppm-inv-sms");if(!a){return;}var ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);a.href="sms:"+(ios?"&":"?")+"body="+' . wp_json_encode( rawurlencode( $share ) ) . ';})();</script>';
	return ob_get_clean();
}

/* "Get the app" card — device-aware add-to-home-screen, shown inside [fppm_account]. */
function fppm_install_card() {
	$icon = esc_url( fppm_asset_url( 'icon-192.png' ) );
	$host = wp_parse_url( home_url(), PHP_URL_HOST );
	ob_start();
	?>
<div class="fppm-card" id="fppm-app-card" style="display:none;">
	<h3>📲 Get the app on your phone</h3>
	<div id="fppm-app-android" style="display:none;">
		<p>One tap puts the <?php echo esc_html( fppm_team_name() ); ?> app on your home screen — schedule, RSVPs and your member code always a tap away.</p>
		<p><button type="button" class="fppm-btn" id="fppm-app-btn"><img src="<?php echo $icon; ?>" alt="" style="width:22px;height:22px;border-radius:6px;vertical-align:-5px;margin-right:.45em;">Add to home screen</button></p>
	</div>
	<div id="fppm-app-ios" style="display:none;">
		<p>On your iPhone or iPad, in <strong>Safari</strong>: tap <strong>Share</strong> <span aria-hidden="true" style="display:inline-block;border:1.5px solid currentColor;border-radius:5px;padding:0 .35em;font-weight:700;">&#8679;</span> at the bottom, then <strong>Add to Home Screen</strong> — the crest shows up like a regular app.</p>
	</div>
	<div id="fppm-app-other" style="display:none;">
		<p class="fppm-muted">On your phone, open <strong><?php echo esc_html( $host ); ?></strong> in the browser and choose <strong>Add to Home Screen</strong> to install the app.</p>
	</div>
</div>
<script>
(function(){
	var card=document.getElementById('fppm-app-card'); if(!card){return;}
	if(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true){return;}
	// Phone-only card ("Get the app on your phone"). Desktop users get the corner install pill instead, so leave it hidden on desktop.
	var isPhone=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||(('ontouchstart' in window)&&Math.min(screen.width||9999,screen.height||9999)<820);
	if(!isPhone){return;}
	var ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
	function show(id){['fppm-app-android','fppm-app-ios','fppm-app-other'].forEach(function(x){var el=document.getElementById(x);if(el){el.style.display=(x===id)?'block':'none';}});}
	card.style.display='block';
	if(ios){show('fppm-app-ios');return;}
	show('fppm-app-other');
	if(window.fppmA2HS){show('fppm-app-android');}
	window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.fppmA2HS=e;show('fppm-app-android');});
	var btn=document.getElementById('fppm-app-btn');
	if(btn){btn.addEventListener('click',function(){var p=window.fppmA2HS;if(!p){return;}window.fppmA2HS=null;p.prompt();p.userChoice.finally(function(){card.style.display='none';});});}
	window.addEventListener('appinstalled',function(){card.style.display='none';});
})();
</script>
	<?php
	return ob_get_clean();
}

/* Announcements list (read-only, for members). */
function fppm_announcements_html( $limit = 5 ) {
	$list = get_option( 'fppm_announcements', array() );
	if ( ! is_array( $list ) || ! $list ) { return ''; }
	$list = array_slice( array_reverse( $list ), 0, $limit );
	ob_start();
	echo '<div class="fppm-card"><h3>Team updates</h3>';
	foreach ( $list as $a ) {
		echo '<div style="border-bottom:1px solid var(--fppm-line);padding:.5em 0;">';
		echo '<strong>' . esc_html( $a['title'] ) . '</strong> <span class="fppm-muted">· ' . esc_html( mysql2date( 'M j, Y', $a['at'] ) ) . '</span>';
		echo '<div>' . nl2br( esc_html( $a['body'] ) ) . '</div>';
		echo '</div>';
	}
	echo '</div>';
	return ob_get_clean();
}

/* ---------- Staff dashboard ---------- */
function fppm_collect_members() {
	$users = get_users( array(
		'role__in' => array( 'fppm_member' ),
		'orderby'  => 'registered',
		'order'    => 'DESC',
		'number'   => 2000,
	) );
	$rows = array();
	foreach ( $users as $u ) {
		$uid    = $u->ID;
		$type   = fppm_type_of( $uid );
		$rows[] = array(
			'id'      => $uid,
			'name'    => fppm_display_name( $uid ),
			'email'   => $u->user_email,
			'phone'   => get_user_meta( $uid, 'fppm_phone', true ),
			'address' => fppm_address_line( $uid ),
			'type'    => $type,
			'status'  => fppm_player_status_of( $uid ),
			'pos'     => get_user_meta( $uid, 'fppm_position', true ),
			'jersey'  => get_user_meta( $uid, 'fppm_jersey', true ),
			'shirt'   => get_user_meta( $uid, 'fppm_shirt', true ),
			'owe'     => fppm_dues_outstanding( $uid ),
		);
	}
	return $rows;
}

function fppm_staff_dashboard() {
	$rows    = fppm_collect_members();
	$players = array_values( array_filter( $rows, function ( $r ) { return 'player' === $r['type']; } ) );
	$sups    = array_values( array_filter( $rows, function ( $r ) { return 'supporter' === $r['type']; } ) );
	$fans    = array_values( array_filter( $rows, function ( $r ) { return 'fan' === $r['type']; } ) );
	$owed    = 0.0;
	foreach ( $rows as $r ) { $owed += $r['owe']; }

	$csv_url = wp_nonce_url( admin_url( 'admin-post.php?action=fppm_export_roster' ), 'fppm_export_roster' );

	ob_start();
	echo fppm_styles();
	echo '<div class="fppm-wrap">';
	echo '<h2 class="fppm-h"><img class="fppm-crest-img" src="' . esc_url( fppm_asset_url( 'icon-192.png' ) ) . '" alt=""> ' . esc_html( fppm_team_name() ) . ' — Staff</h2>';
	echo '<p class="fppm-sub">' . count( $rows ) . ' members · ' . count( $players ) . ' players · ' . count( $sups ) . ' supporters · ' . count( $fans ) . ' fans · <strong>$' . esc_html( number_format( $owed, 2 ) ) . '</strong> outstanding</p>';
	echo fppm_ticker_html();
	echo fppm_flash_html();

	/* Install the app — prominent, toward the top (device-aware; self-hides once installed) */
	echo fppm_install_card();

	/* Quick actions */
	echo '<div class="fppm-card"><div class="fppm-actions">';
	echo '<a class="fppm-btn fppm-btn--ghost" href="' . esc_url( $csv_url ) . '">⬇️ Export roster CSV</a>';
	echo '<a class="fppm-btn fppm-btn--ghost" href="' . esc_url( fppm_join_url() ) . '" target="_blank" rel="noopener">Open recruit link</a>';
	echo '</div><p class="fppm-muted" style="margin-top:.6em;">Share the join link with anyone — they can sign up as a fan, player, or supporter.</p></div>';
	echo fppm_invite_card();

	/* Announcement composer */
	echo '<div class="fppm-card"><h3>Post a team update</h3>';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
	echo '<input type="hidden" name="action" value="fppm_announce">';
	wp_nonce_field( 'fppm_announce' );
	echo '<div class="fppm-field"><label>Title</label><input type="text" name="fppm_a_title" required></div>';
	echo '<div class="fppm-field"><label>Message</label><textarea name="fppm_a_body" rows="3" required></textarea></div>';
	echo '<button class="fppm-btn" type="submit">Post update</button>';
	echo '</form></div>';

	/* Schedule + RSVP management */
	echo fppm_schedule_staff_html();

	/* Team store — so staff/admin can see the merch + Printful mockups too. */
	echo fppm_apparel_block();

	/* Roster sections */
	echo fppm_roster_section( 'Players', $players, true );
	echo fppm_roster_section( 'Supporters', $sups, false );
	echo fppm_roster_section( 'Fans', $fans, false );

	// Invite share/send helper (used by the per-row "Invite as player" buttons).
	echo '<script>var fppmAdminPost="' . esc_js( admin_url( 'admin-post.php' ) ) . '",fppmHome="' . esc_js( home_url( '/' ) ) . '";'
		. 'function fppmInvite(b){var u=b.dataset.uid,n=b.dataset.nonce,nm=b.dataset.name||"";'
		. 'var m=(nm?("Hey "+nm+"! "):"")+"You\'re invited to join the ' . esc_js( fppm_team_name() ) . '. Sign up and accept your player invite at "+fppmHome;'
		. 'if(navigator.share){navigator.share({title:"' . esc_js( fppm_team_name() ) . '",text:m,url:fppmHome}).catch(function(){});}'
		. 'else{try{navigator.clipboard.writeText(m);}catch(e){}alert("Invite text (copied to clipboard):\n\n"+m);}'
		. 'var d=new URLSearchParams({action:"fppm_player_invite",uid:u,_wpnonce:n});'
		. 'fetch(fppmAdminPost,{method:"POST",credentials:"same-origin",body:d}).then(function(){b.textContent="Invite sent ✓";b.disabled=true;}).catch(function(){});}</script>';

	echo '<p class="fppm-muted"><a href="' . esc_url( wp_logout_url( home_url() ) ) . '">Sign out</a></p>';
	echo '</div>';
	return ob_get_clean();
}

function fppm_roster_section( $title, $rows, $is_player ) {
	ob_start();
	echo '<div class="fppm-card"><h3>' . esc_html( $title ) . ' <span class="fppm-badge">' . count( $rows ) . '</span></h3>';
	if ( ! $rows ) { echo '<p class="fppm-muted">None yet.</p></div>'; return ob_get_clean(); }
	echo '<table class="fppm-table"><thead><tr><th>Name</th><th>Contact</th>';
	if ( $is_player ) { echo '<th>Pos / #</th><th>Status</th>'; } elseif ( 'Supporters' === $title ) { echo '<th>Shirt</th>'; }
	echo '<th>Dues</th><th>Notes</th></tr></thead><tbody>';
	foreach ( $rows as $r ) {
		$uid = $r['id'];
		echo '<tr>';
		echo '<td><strong>' . esc_html( $r['name'] ) . '</strong></td>';
		echo '<td><a href="mailto:' . esc_attr( $r['email'] ) . '">' . esc_html( $r['email'] ) . '</a>' . ( $r['phone'] ? '<br>' . esc_html( $r['phone'] ) : '' ) . ( $r['address'] ? '<br><span class="fppm-muted">' . esc_html( $r['address'] ) . '</span>' : '' ) . '</td>';
		if ( $is_player ) {
			echo '<td>' . esc_html( ( $r['pos'] ? $r['pos'] : '—' ) . ( $r['jersey'] ? ' · #' . $r['jersey'] : '' ) ) . '</td>';
			echo '<td>' . fppm_status_control( $uid, $r['status'] ) . '</td>';
		} elseif ( 'Supporters' === $title ) {
			echo '<td>' . esc_html( $r['shirt'] ? $r['shirt'] : '—' ) . '</td>';
		}
		/* Dues cell */
		echo '<td>';
		if ( $r['owe'] > 0 ) {
			echo '<span class="fppm-badge fppm-badge--owe">$' . esc_html( number_format( $r['owe'], 2 ) ) . '</span>';
			foreach ( fppm_dues_open( $uid ) as $e ) {
				echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="fppm-inline" style="display:block;margin-top:.3em;">';
				echo '<input type="hidden" name="action" value="fppm_dues_mark">';
				echo '<input type="hidden" name="uid" value="' . esc_attr( $uid ) . '">';
				echo '<input type="hidden" name="num" value="' . esc_attr( $e['num'] ) . '">';
				echo '<input type="hidden" name="paid" value="1">';
				wp_nonce_field( 'fppm_dues_' . $uid . '_' . $e['num'] );
				echo '<button class="fppm-btn fppm-btn--ghost" style="padding:.25em .7em;font-size:.8rem;" type="submit">Mark $' . esc_html( $e['amount'] ) . ' paid</button>';
				echo '</form>';
			}
		} else {
			echo '<span class="fppm-badge fppm-badge--paid">Paid</span>';
		}
		echo '</td>';
		/* Notes */
		echo '<td>' . fppm_notes_control( $uid ) . fppm_player_invite_control( $uid ) . fppm_admin_delete_control( $uid ) . '</td>';
		echo '</tr>';
	}
	echo '</tbody></table></div>';
	return ob_get_clean();
}

/* Player status selector (trialist/rostered/reserve). */
function fppm_status_control( $uid, $current ) {
	ob_start();
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
	echo '<input type="hidden" name="action" value="fppm_set_status">';
	echo '<input type="hidden" name="uid" value="' . esc_attr( $uid ) . '">';
	wp_nonce_field( 'fppm_status_' . $uid );
	echo '<select name="status" onchange="this.form.submit()" style="padding:.3em;border-radius:8px;border:1px solid var(--fppm-line);">';
	foreach ( fppm_player_statuses() as $k => $lab ) {
		echo '<option value="' . esc_attr( $k ) . '" ' . selected( $current, $k, false ) . '>' . esc_html( $lab ) . '</option>';
	}
	echo '</select></form>';
	return ob_get_clean();
}

/* Collapsible internal notes editor (staff-only, never shown to member). */
function fppm_notes_control( $uid ) {
	$notes = get_user_meta( $uid, 'fppm_notes', true );
	ob_start();
	echo '<details class="fppm-det"><summary>' . ( $notes ? '📝 notes' : '+ note' ) . '</summary>';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="margin-top:.4em;">';
	echo '<input type="hidden" name="action" value="fppm_save_notes">';
	echo '<input type="hidden" name="uid" value="' . esc_attr( $uid ) . '">';
	wp_nonce_field( 'fppm_notes_' . $uid );
	echo '<textarea name="notes" rows="3" style="width:220px;">' . esc_textarea( $notes ) . '</textarea><br>';
	echo '<button class="fppm-btn fppm-btn--ghost" style="padding:.25em .7em;font-size:.8rem;margin-top:.3em;" type="submit">Save note</button>';
	echo '</form></details>';
	return ob_get_clean();
}

/* ---- Player invite → email → accept (invite-only activation) ---- */
function fppm_player_invite_pending( $uid ) { $i = get_user_meta( $uid, 'fppm_player_invite', true ); return is_array( $i ) && ! empty( $i['pending'] ); }
function fppm_player_active( $uid ) { return '1' === (string) get_user_meta( $uid, 'fppm_player_active', true ); }
/* Staff control in each roster row. */
function fppm_player_invite_control( $uid ) {
	if ( ! fppm_can_manage() ) { return ''; }
	if ( fppm_player_active( $uid ) ) { return '<div class="fppm-muted" style="font-size:.75rem;margin-top:.3em;">✓ active player</div>'; }
	if ( fppm_player_invite_pending( $uid ) ) { return '<div class="fppm-muted" style="font-size:.75rem;margin-top:.3em;">⏳ invite sent</div>'; }
	$nonce = wp_create_nonce( 'fppm_pinvite_' . $uid );
	// One click: opens a native share (prefilled fppm.us text) AND emails the invite.
	return '<button type="button" class="fppm-btn fppm-btn--ghost" style="padding:.2em .6em;font-size:.75rem;margin-top:.3em;" onclick="fppmInvite(this)" data-uid="' . (int) $uid . '" data-nonce="' . esc_attr( $nonce ) . '" data-name="' . esc_attr( fppm_display_name( $uid ) ) . '">Invite as player</button>';
}
add_action( 'admin_post_fppm_player_invite', 'fppm_h_player_invite' );
function fppm_h_player_invite() {
	if ( ! fppm_can_manage() ) { wp_die( 'Not allowed.' ); }
	$uid = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	check_admin_referer( 'fppm_pinvite_' . $uid );
	if ( $uid ) {
		update_user_meta( $uid, 'fppm_player_invite', array( 'pending' => 1, 'by' => get_current_user_id(), 'at' => current_time( 'mysql' ) ) );
		$u = get_userdata( $uid );
		if ( $u ) {
			wp_mail( $u->user_email, "[FPPM] You're invited to join as a player",
				"You've been invited to join the " . fppm_team_name() . " as a player.\n\nLog in to your account and click \"Accept player invite\" to activate your player account:\n" . home_url( '/account/' ) . "\n\nGo Purple Martins!" );
		}
		fppm_redirect_note( 'invited' );
	}
	fppm_redirect_note( 'err' );
}
add_action( 'admin_post_fppm_accept_invite', 'fppm_h_accept_invite' );
function fppm_h_accept_invite() {
	$uid = get_current_user_id();
	if ( ! $uid ) { wp_die( 'Please sign in.' ); }
	check_admin_referer( 'fppm_accept_invite_' . $uid );
	if ( fppm_player_invite_pending( $uid ) ) {
		update_user_meta( $uid, 'fppm_type', 'player' );
		update_user_meta( $uid, 'fppm_player_status', 'rostered' );
		update_user_meta( $uid, 'fppm_player_active', '1' );
		update_user_meta( $uid, 'fppm_player_activated', current_time( 'mysql' ) );
		delete_user_meta( $uid, 'fppm_player_invite' );
		fppm_redirect_note( 'playeractive' );
	}
	fppm_redirect_note( 'err' );
}

/* Member-facing accept card (shown when a player invite is pending). */
function fppm_player_accept_card( $uid ) {
	if ( ! fppm_player_invite_pending( $uid ) ) { return ''; }
	ob_start();
	echo '<div class="fppm-card" style="border-color:var(--fppm-gold);background:var(--fppm-gold-l);">';
	echo '<h3>You\'re invited to the roster</h3>';
	echo '<p>An admin invited you to join the ' . esc_html( fppm_team_name() ) . ' as a <strong>player</strong>. Accept to activate your player account.</p>';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
	echo '<input type="hidden" name="action" value="fppm_accept_invite">';
	wp_nonce_field( 'fppm_accept_invite_' . $uid );
	echo '<button class="fppm-btn" type="submit">Accept player invite</button></form></div>';
	return ob_get_clean();
}

/* Admin-only hard delete of a member (site admins only, never staff/self). */
function fppm_admin_delete_control( $uid ) {
	if ( ! current_user_can( 'delete_users' ) ) { return ''; }
	if ( (int) $uid === get_current_user_id() || user_can( (int) $uid, 'manage_options' ) ) { return ''; }
	$name = esc_js( fppm_display_name( $uid ) );
	ob_start();
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="margin-top:.4em;" onsubmit="return confirm(\'Permanently delete ' . $name . '? This cannot be undone.\');">';
	echo '<input type="hidden" name="action" value="fppm_admin_delete">';
	echo '<input type="hidden" name="uid" value="' . esc_attr( $uid ) . '">';
	wp_nonce_field( 'fppm_admin_delete_' . $uid );
	echo '<button class="fppm-btn" style="background:var(--fppm-ink);padding:.2em .6em;font-size:.75rem;" type="submit">Delete</button>';
	echo '</form>';
	return ob_get_clean();
}

/* ============================================================
 * 9. STAFF ACTION HANDLERS (admin-post, all nonce + cap guarded)
 * ============================================================ */
/* Member deletes their OWN account (permanent). */
add_action( 'admin_post_fppm_self_delete', 'fppm_h_self_delete' );
function fppm_h_self_delete() {
	$uid = get_current_user_id();
	if ( ! $uid ) { wp_die( 'Not signed in.' ); }
	check_admin_referer( 'fppm_self_delete_' . $uid );
	// Safety: never let this path delete an administrator account.
	if ( user_can( $uid, 'manage_options' ) ) { wp_die( 'Admin accounts cannot be self-deleted here.' ); }
	require_once ABSPATH . 'wp-admin/includes/user.php';
	wp_logout();
	wp_delete_user( $uid );
	wp_safe_redirect( add_query_arg( 'fppm_bye', '1', home_url( '/' ) ) );
	exit;
}

/* Admin hard-deletes a member (site admins only). */
add_action( 'admin_post_fppm_admin_delete', 'fppm_h_admin_delete' );
function fppm_h_admin_delete() {
	if ( ! current_user_can( 'delete_users' ) ) { wp_die( 'Not allowed.' ); }
	$uid = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	check_admin_referer( 'fppm_admin_delete_' . $uid );
	if ( $uid && $uid !== get_current_user_id() && ! user_can( $uid, 'manage_options' ) ) {
		require_once ABSPATH . 'wp-admin/includes/user.php';
		wp_delete_user( $uid );
		fppm_redirect_note( 'deleted' );
	}
	fppm_redirect_note( 'err' );
}

add_action( 'admin_post_fppm_dues_mark', 'fppm_h_dues_mark' );
function fppm_h_dues_mark() {
	if ( ! fppm_can_manage() ) { wp_die( 'Not allowed.' ); }
	$uid  = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	$num  = isset( $_POST['num'] ) ? sanitize_text_field( wp_unslash( $_POST['num'] ) ) : '';
	$paid = isset( $_POST['paid'] ) && '1' === (string) $_POST['paid'];
	check_admin_referer( 'fppm_dues_' . $uid . '_' . $num );
	fppm_dues_mark( $uid, $num, $paid, get_current_user_id() );
	fppm_redirect_note( $paid ? 'duespaid' : 'duesopen' );
}

add_action( 'admin_post_fppm_set_status', 'fppm_h_set_status' );
function fppm_h_set_status() {
	if ( ! fppm_can_manage() ) { wp_die( 'Not allowed.' ); }
	$uid = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	check_admin_referer( 'fppm_status_' . $uid );
	$status = isset( $_POST['status'] ) ? sanitize_key( wp_unslash( $_POST['status'] ) ) : '';
	if ( $uid && array_key_exists( $status, fppm_player_statuses() ) ) {
		update_user_meta( $uid, 'fppm_player_status', $status );
		fppm_redirect_note( 'statusset' );
	}
	fppm_redirect_note( 'err' );
}

add_action( 'admin_post_fppm_save_notes', 'fppm_h_save_notes' );
function fppm_h_save_notes() {
	if ( ! fppm_can_manage() ) { wp_die( 'Not allowed.' ); }
	$uid = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	check_admin_referer( 'fppm_notes_' . $uid );
	$notes = isset( $_POST['notes'] ) ? sanitize_textarea_field( wp_unslash( $_POST['notes'] ) ) : '';
	if ( $uid ) { update_user_meta( $uid, 'fppm_notes', $notes ); }
	fppm_redirect_note( 'noted' );
}

add_action( 'admin_post_fppm_announce', 'fppm_h_announce' );
function fppm_h_announce() {
	if ( ! fppm_can_manage() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'fppm_announce' );
	$title = isset( $_POST['fppm_a_title'] ) ? sanitize_text_field( wp_unslash( $_POST['fppm_a_title'] ) ) : '';
	$body  = isset( $_POST['fppm_a_body'] ) ? sanitize_textarea_field( wp_unslash( $_POST['fppm_a_body'] ) ) : '';
	if ( '' === $title || '' === $body ) { fppm_redirect_note( 'err' ); }
	$list   = get_option( 'fppm_announcements', array() );
	if ( ! is_array( $list ) ) { $list = array(); }
	$list[] = array(
		'title' => $title,
		'body'  => $body,
		'at'    => current_time( 'mysql' ),
		'by'    => get_current_user_id(),
	);
	// Keep the last 50.
	if ( count( $list ) > 50 ) { $list = array_slice( $list, -50 ); }
	update_option( 'fppm_announcements', $list );
	fppm_redirect_note( 'announced' );
}

add_action( 'admin_post_fppm_export_roster', 'fppm_h_export_roster' );
function fppm_h_export_roster() {
	if ( ! fppm_can_manage() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'fppm_export_roster' );
	$rows = fppm_collect_members();
	nocache_headers();
	header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename=fppm-roster-' . gmdate( 'Y-m-d' ) . '.csv' );
	$out = fopen( 'php://output', 'w' );
	fputcsv( $out, array( 'name', 'type', 'status', 'email', 'phone', 'address', 'city', 'state', 'zip', 'position', 'jersey', 'shirt', 'dues_outstanding' ) );
	foreach ( $rows as $r ) {
		fputcsv( $out, array(
			$r['name'],
			fppm_type_label( $r['type'] ),
			'player' === $r['type'] ? fppm_status_label( $r['status'] ) : '',
			$r['email'],
			$r['phone'],
			get_user_meta( $r['id'], 'fppm_address', true ),
			get_user_meta( $r['id'], 'fppm_city', true ),
			get_user_meta( $r['id'], 'fppm_state', true ),
			get_user_meta( $r['id'], 'fppm_zip', true ),
			$r['pos'],
			$r['jersey'],
			$r['shirt'],
			number_format( $r['owe'], 2, '.', '' ),
		) );
	}
	fclose( $out );
	exit;
}

/* ============================================================
 * 10. SETTINGS PAGE — team info, prices, PayPal links, notify email
 * ============================================================ */
add_action( 'admin_menu', 'fppm_admin_menu' );
function fppm_admin_menu() {
	add_menu_page(
		'Purple Martins',
		'Purple Martins',
		'manage_options',
		'fppm-settings',
		'fppm_settings_page',
		'dashicons-groups',
		58
	);
	add_submenu_page( 'fppm-settings', 'FPPM Settings', 'Settings', 'manage_options', 'fppm-settings', 'fppm_settings_page' );
	add_submenu_page( 'fppm-settings', 'FPPM Waivers', 'Waivers', 'manage_options', 'fppm-waivers', 'fppm_waivers_page' );
}
add_action( 'admin_init', 'fppm_register_settings' );
function fppm_register_settings() {
	$opts = array(
		'fppm_team_name', 'fppm_team_city', 'fppm_notify_email',
		'fppm_price_player_dues', 'fppm_price_supporter_min', 'fppm_price_tshirt',
		'fppm_pp_dues', 'fppm_pp_supporter', 'fppm_pp_tshirt',
		'fppm_price_embroidery', 'fppm_coupon_amount', 'fppm_coupon_percent',
		'fppm_supporter_code_pool', 'fppm_shared_promo', 'fppm_collective',
		'fppm_shop_url', 'fppm_tshirt_url', 'fppm_wc_tshirt_id', 'fppm_wc_tshirt_emb_id', 'fppm_wc_dues_id', 'fppm_wc_supporter_id',
		'fppm_pp_env', 'fppm_pp_client_id', 'fppm_pp_secret', 'fppm_printful_token', 'fppm_printful_store_id', 'fppm_tee_variants', 'fppm_store_catalog', 'fppm_printful_confirm',
		'fppm_shirts_sold_manual',
		'fppm_waiver_version', 'fppm_waiver_text', 'fppm_oath_text',
		'fppm_gs_json', 'fppm_gs_sheet_id', 'fppm_gs_tab',
		'fppm_login_gate', 'fppm_join_url', 'fppm_public_slugs', 'fppm_join_intro',
	);
	foreach ( $opts as $o ) {
		register_setting( 'fppm_settings', $o );
	}
}
function fppm_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) { return; }
	?>
	<div class="wrap">
		<h1>Fort Pierce Purple Martins — Settings</h1>
		<?php if ( isset( $_GET['fppm_catalog'] ) && 'ok' === $_GET['fppm_catalog'] ) : ?>
			<div class="notice notice-success is-dismissible"><p><strong>Printful catalog fetched:</strong> <?php echo (int) ( isset( $_GET['p'] ) ? $_GET['p'] : 0 ); ?> product(s), <?php echo (int) ( isset( $_GET['v'] ) ? $_GET['v'] : 0 ); ?> variant(s) saved to the store catalog below. <?php $ni = (int) ( isset( $_GET['img'] ) ? $_GET['img'] : 0 ); echo '<strong>' . $ni . '</strong> with mockup images.'; echo 0 === $ni ? ' <em>(Printful returned no mockups for this store — the store shows names/prices only. Open each product in Printful and make sure it has a generated mockup, then Fetch again.)</em>' : ''; ?></p></div>
		<?php elseif ( isset( $_GET['fppm_catalog'] ) ) : ?>
			<div class="notice notice-error"><p><strong>Printful catalog fetch failed:</strong> <?php echo esc_html( sanitize_text_field( wp_unslash( isset( $_GET['fppm_catalog_msg'] ) ? $_GET['fppm_catalog_msg'] : 'unknown error' ) ) ); ?></p></div>
		<?php endif; ?>
		<p>Shortcodes: <code>[fppm_register]</code> (signup) · <code>[fppm_account]</code> (dashboard) · <code>[fppm_invite]</code> (recruit landing). Recommended pages: <code>/join</code> → register, <code>/account</code> → dashboard.</p>
		<form method="post" action="options.php">
			<?php settings_fields( 'fppm_settings' ); ?>
			<table class="form-table" role="presentation">
				<tr><th scope="row">Team name</th><td><input type="text" name="fppm_team_name" value="<?php echo esc_attr( fppm_team_name() ); ?>" class="regular-text"></td></tr>
				<tr><th scope="row">City / region</th><td><input type="text" name="fppm_team_city" value="<?php echo esc_attr( fppm_team_city() ); ?>" class="regular-text"></td></tr>
				<tr><th scope="row">Members collective name</th><td><input type="text" name="fppm_collective" value="<?php echo esc_attr( get_option( 'fppm_collective', '' ) ); ?>" class="regular-text" placeholder="Litty Committee"><p class="description">What every member is called (fans, players, supporters). Default: Litty Committee.</p></td></tr>
				<tr><th scope="row">Staff notify email</th><td><input type="email" name="fppm_notify_email" value="<?php echo esc_attr( get_option( 'fppm_notify_email', '' ) ); ?>" class="regular-text" placeholder="<?php echo esc_attr( get_option( 'admin_email' ) ); ?>"></td></tr>
				<tr><th colspan="2"><h2>Pricing</h2></th></tr>
				<tr><th scope="row">Player dues ($)</th><td><input type="number" step="1" name="fppm_price_player_dues" value="<?php echo esc_attr( fppm_price_player_dues() ); ?>"></td></tr>
				<tr><th scope="row">Supporter min ($)</th><td><input type="number" step="1" name="fppm_price_supporter_min" value="<?php echo esc_attr( fppm_price_supporter_min() ); ?>"></td></tr>
				<tr><th scope="row">T-shirt — printed ($)</th><td><input type="number" step="1" name="fppm_price_tshirt" value="<?php echo esc_attr( fppm_price_tshirt() ); ?>"></td></tr>
				<tr><th scope="row">Embroidery upcharge ($)</th><td><input type="number" step="1" name="fppm_price_embroidery" value="<?php echo esc_attr( fppm_price_embroidery() ); ?>"><p class="description">Added to the printed price for the embroidered version (currently embroidered = $<?php echo esc_html( number_format( fppm_price_tshirt_emb(), 0 ) ); ?>).</p></td></tr>
				<tr><th colspan="2"><h2>Supporter merch promo</h2><p style="font-weight:400;">Each supporter gets a personal <strong>% off</strong> code for the Printful merch store. <strong>The code must exist in Printful to work</strong> — in Printful go to your store → Discounts → create a "% off" discount and <strong>generate a batch of unique codes</strong>, then paste them below. Each new supporter is handed the next unused one. No pool? It falls back to the shared code, then a placeholder.<?php $pool = fppm_supporter_pool(); $used = count( array_intersect( $pool, fppm_coupon_issued() ) ); echo ' <strong>Pool:</strong> ' . count( $pool ) . ' codes, ' . $used . ' assigned, ' . ( count( $pool ) - $used ) . ' available.'; ?></p></th></tr>
				<tr><th scope="row">Discount (% off)</th><td><input type="number" step="1" name="fppm_coupon_percent" value="<?php echo esc_attr( fppm_coupon_percent() ); ?>"></td></tr>
				<tr><th scope="row">Unique code pool</th><td><textarea name="fppm_supporter_code_pool" rows="5" class="large-text" placeholder="Paste the unique codes from Printful, one per line"><?php echo esc_textarea( get_option( 'fppm_supporter_code_pool', '' ) ); ?></textarea></td></tr>
				<tr><th scope="row">Shared code (fallback)</th><td><input type="text" name="fppm_shared_promo" value="<?php echo esc_attr( get_option( 'fppm_shared_promo', '' ) ); ?>" class="regular-text" placeholder="e.g. LITTY10"><p class="description">Used when the pool is empty/exhausted — one code everyone shares (create it in Printful too).</p></td></tr>
				<tr><th colspan="2"><h2>PayPal links (primary payment method)</h2><p style="font-weight:400;">This is how members pay — paste a PayPal payment link/button for each. Create them at paypal.com → <em>Pay &amp; Get Paid → Payment links &amp; buttons</em>. Members pay via PayPal, then a staff member clicks <strong>Mark paid</strong> on the dashboard. Leave blank to show a "coming soon" placeholder.</p></th></tr>
				<tr><th scope="row">Player dues link ($<?php echo esc_html( number_format( fppm_price_player_dues(), 0 ) ); ?>)</th><td><input type="url" name="fppm_pp_dues" value="<?php echo esc_attr( get_option( 'fppm_pp_dues', '' ) ); ?>" class="regular-text" placeholder="https://www.paypal.com/ncp/payment/..."></td></tr>
				<tr><th scope="row">Supporter link ($<?php echo esc_html( number_format( fppm_price_supporter_min(), 0 ) ); ?>+)</th><td><input type="url" name="fppm_pp_supporter" value="<?php echo esc_attr( get_option( 'fppm_pp_supporter', '' ) ); ?>" class="regular-text"></td></tr>
				<tr><th scope="row">T-shirt link ($<?php echo esc_html( number_format( fppm_price_tshirt(), 0 ) ); ?>)</th><td><input type="url" name="fppm_pp_tshirt" value="<?php echo esc_attr( get_option( 'fppm_pp_tshirt', '' ) ); ?>" class="regular-text"></td></tr>
				<tr><th colspan="2"><h2>Printful store (apparel)</h2><p style="font-weight:400;">Paste your Printful storefront links. Printful handles size, checkout, payment and on-demand shipping — no WooCommerce needed. Get the links from your Printful store (the store URL, and each product's page URL).</p></th></tr>
				<tr><th scope="row">Printful store URL</th><td><input type="url" name="fppm_shop_url" value="<?php echo esc_attr( get_option( 'fppm_shop_url', '' ) ); ?>" class="regular-text" placeholder="<?php echo esc_attr( fppm_default_store_url() ); ?>"><p class="description">Shows a "Shop all apparel" button on the member dashboard. Leave blank to use the default: <code><?php echo esc_html( fppm_default_store_url() ); ?></code></p></td></tr>
				<tr><th scope="row">T-shirt product URL</th><td><input type="url" name="fppm_tshirt_url" value="<?php echo esc_attr( get_option( 'fppm_tshirt_url', '' ) ); ?>" class="regular-text" placeholder="<?php echo esc_attr( fppm_default_tshirt_url() ); ?>"><p class="description">The apparel "Buy — $<?php echo esc_html( number_format( fppm_price_tshirt(), 0 ) ); ?>" button links here (used when the in-plugin store below is OFF). Default: <code><?php echo esc_html( fppm_default_tshirt_url() ); ?></code></p></td></tr>

				<tr><th colspan="2"><h2>In-plugin store — unique member discount codes (advanced)</h2><p style="font-weight:400;"><strong>Only fill this in if you want each member's unique code to actually apply the discount.</strong> When configured, the tee's Buy button becomes an in-plugin checkout: it charges the <strong>discounted</strong> price via the PayPal Orders API, then auto-creates a Printful order. Leave blank to keep linking to the Printful store (simple mode). <strong>Test in sandbox first — this takes real payments when set to Live.</strong> Store ready: <?php echo fppm_store_ready() ? '✅ yes (' . esc_html( fppm_pp_env() ) . ')' : '❌ not configured'; ?></p></th></tr>
				<tr><th scope="row">PayPal environment</th><td><select name="fppm_pp_env"><option value="sandbox" <?php selected( fppm_pp_env(), 'sandbox' ); ?>>Sandbox (testing)</option><option value="live" <?php selected( fppm_pp_env(), 'live' ); ?>>Live (real money)</option></select></td></tr>
				<tr><th scope="row">PayPal Client ID</th><td><input type="text" name="fppm_pp_client_id" value="<?php echo esc_attr( get_option( 'fppm_pp_client_id', '' ) ); ?>" class="large-text" autocomplete="off"><p class="description">From developer.paypal.com → Apps &amp; Credentials → your REST app (match the environment above).</p></td></tr>
				<tr><th scope="row">PayPal Secret</th><td><input type="password" name="fppm_pp_secret" value="<?php echo esc_attr( get_option( 'fppm_pp_secret', '' ) ); ?>" class="large-text" autocomplete="off"></td></tr>
				<tr><th scope="row">Printful API token</th><td><input type="password" name="fppm_printful_token" value="<?php echo esc_attr( get_option( 'fppm_printful_token', '' ) ); ?>" class="large-text" autocomplete="off"><p class="description">Printful → Settings → Stores → API → private token (for auto-fulfillment).</p></td></tr>
				<tr><th scope="row">Printful store ID</th><td><input type="text" name="fppm_printful_store_id" value="<?php echo esc_attr( fppm_printful_store_id() ); ?>" class="regular-text" placeholder="auto-detected"><p class="description">Only needed for account-level tokens that can see several stores. Usually <strong>leave blank</strong> — the Fetch button detects it automatically when the token has exactly one store. (It's the number in the store's URL in the Printful dashboard.)</p></td></tr>
				<tr><th scope="row">Store catalog (JSON)</th><td><textarea name="fppm_store_catalog" rows="8" class="large-text code" placeholder='[{"name":"Purple Martins Tee","variants":[{"label":"S","id":1234567,"price":25.00},{"label":"M","id":1234568,"price":25.00}]}]'><?php echo esc_textarea( get_option( 'fppm_store_catalog', '' ) ); ?></textarea><p class="description">Every product offered in the in-plugin store, with each variant's Printful <code>sync_variant_id</code> + retail price. <?php $cat = fppm_store_catalog(); $n = 0; foreach ( $cat as $cp ) { $n += count( $cp['variants'] ); } echo 'Loaded: ' . count( $cat ) . ' product(s), ' . $n . ' variant(s).'; ?></p><p><a href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=fppm_fetch_catalog' ), 'fppm_fetch_catalog' ) ); ?>" class="button button-secondary">⟳ Fetch catalog from Printful</a></p><p class="description">Fills this field automatically from your Printful store using the saved API token above — no pasting needed. <strong>If you just entered the token, Save Changes first</strong>, then click. Re-click any time you add merch or change prices in Printful (it overwrites this field).</p></td></tr>
				<tr><th scope="row">Tee sizes → variant IDs (legacy)</th><td><textarea name="fppm_tee_variants" rows="3" class="large-text" placeholder="S:1234567&#10;M:1234568"><?php echo esc_textarea( get_option( 'fppm_tee_variants', '' ) ); ?></textarea><p class="description">Optional shortcut for a tee-only store. Ignored if the catalog above is filled.</p></td></tr>
				<tr><th scope="row">Auto-confirm Printful order</th><td><input type="hidden" name="fppm_printful_confirm" value="0"><label><input type="checkbox" name="fppm_printful_confirm" value="1" <?php checked( '1', get_option( 'fppm_printful_confirm', '0' ) ); ?>> Confirm (charge + fulfill) automatically</label><p class="description">Off = create a <strong>draft</strong> in Printful for you to review/confirm (safer while testing). On = fully hands-off.</p></td></tr>
				<tr><th colspan="2"><h2>Store (WooCommerce + Printful) — optional / advanced</h2><p style="font-weight:400;">Only needed if you want automated checkout + on-demand fulfillment instead of PayPal links. Leave the product IDs at 0 to use PayPal (the default). <strong>WooCommerce detected:</strong> <?php echo fppm_wc_active() ? '✅ yes' : '❌ no (PayPal mode)'; ?></p></th></tr>
				<tr><th scope="row">T-shirt product ID</th><td><input type="number" name="fppm_wc_tshirt_id" value="<?php echo esc_attr( (int) get_option( 'fppm_wc_tshirt_id', 0 ) ); ?>"><p class="description">Optional WooCommerce product ID for the tee. 0 = use the PayPal T-shirt link above.</p></td></tr>
				<tr><th scope="row">Player dues product ID</th><td><input type="number" name="fppm_wc_dues_id" value="<?php echo esc_attr( (int) get_option( 'fppm_wc_dues_id', 0 ) ); ?>"><p class="description">WooCommerce product for the $<?php echo esc_html( number_format( fppm_price_player_dues(), 0 ) ); ?> player dues (make it a <strong>virtual</strong> product — no shipping). When set, the dashboard "Pay dues" button checks out here and marks dues paid automatically on completion. 0 = fall back to the PayPal dues link.</p></td></tr>
				<tr><th scope="row">Supporter product ID</th><td><input type="number" name="fppm_wc_supporter_id" value="<?php echo esc_attr( (int) get_option( 'fppm_wc_supporter_id', 0 ) ); ?>"><p class="description">WooCommerce product for the supporter contribution (incl. tee, Printful-fulfilled). Leave 0 to reuse the T-shirt product above.</p></td></tr>
				<tr><th scope="row">Shirts-sold starting count</th><td><input type="number" name="fppm_shirts_sold_manual" value="<?php echo esc_attr( (int) get_option( 'fppm_shirts_sold_manual', 0 ) ); ?>"><p class="description">Optional. Added to the WooCommerce sales count in the account-page ticker (e.g. shirts you sold in person before the store went live).</p></td></tr>

				<tr><th colspan="2"><h2>Membership &amp; access</h2><p style="font-weight:400;">Lock the whole site to logged-in members. Logged-out visitors are sent to the join/sign-in page. The <code>join</code>/<code>invite</code> pages (and any page holding <code>[fppm_register]</code>/<code>[fppm_invite]</code>) stay public so people can sign up.</p></th></tr>
				<tr><th scope="row">Members-only site</th><td><input type="hidden" name="fppm_login_gate" value="0"><label><input type="checkbox" name="fppm_login_gate" value="1" <?php checked( fppm_gate_enabled() ); ?>> Require an account + login to view the site</label></td></tr>
				<tr><th scope="row">Join / sign-in URL</th><td><input type="url" name="fppm_join_url" value="<?php echo esc_attr( get_option( 'fppm_join_url', '' ) ); ?>" class="regular-text" placeholder="<?php echo esc_attr( home_url( '/go/' ) ); ?>"><p class="description">Where logged-out visitors land. Defaults to <code>/go/</code> — create a page with slug <code>go</code> holding <code>[fppm_register]</code>.</p></td></tr>
				<tr><th scope="row">Extra public pages</th><td><input type="text" name="fppm_public_slugs" value="<?php echo esc_attr( get_option( 'fppm_public_slugs', '' ) ); ?>" class="regular-text" placeholder="privacy-policy, terms"><p class="description">Comma-separated page slugs that stay viewable while logged out.</p></td></tr>
				<tr><th scope="row">Join-page intro</th><td><textarea name="fppm_join_intro" rows="3" class="large-text" placeholder="Leave blank for the default mission blurb."><?php echo esc_textarea( get_option( 'fppm_join_intro', '' ) ); ?></textarea><p class="description">The welcome/mission blurb atop the <code>/go</code> landing page (above the signup form).</p></td></tr>

				<tr><th colspan="2"><h2>Club oath</h2><p style="font-weight:400;">A required pledge taken at signup by every member.</p></th></tr>
				<tr><th scope="row">Oath text</th><td><textarea name="fppm_oath_text" rows="3" class="large-text" placeholder="Leave blank for the default."><?php echo esc_textarea( get_option( 'fppm_oath_text', '' ) ); ?></textarea><p class="description">Default: “<?php echo esc_html( fppm_oath_text() ); ?>”</p></td></tr>

				<tr><th colspan="2"><h2>Liability waiver</h2><p style="font-weight:400;">Required at signup for everyone. <strong>This is a template — have an attorney review it.</strong> Bump the version whenever you edit the text so each acceptance records which wording was agreed to. Accepted waivers are listed under <a href="<?php echo esc_url( admin_url( 'admin.php?page=fppm-waivers' ) ); ?>">Waivers</a>.</p></th></tr>
				<tr><th scope="row">Waiver version</th><td><input type="text" name="fppm_waiver_version" value="<?php echo esc_attr( fppm_waiver_version() ); ?>" class="small-text"></td></tr>
				<tr><th scope="row">Waiver text</th><td><textarea name="fppm_waiver_text" rows="10" class="large-text" placeholder="Leave blank to use the built-in template."><?php echo esc_textarea( get_option( 'fppm_waiver_text', '' ) ); ?></textarea><p class="description">Leave blank to use the built-in default template.</p></td></tr>

				<tr><th colspan="2"><h2>Off-server waiver record (Google Sheets)</h2><p style="font-weight:400;">Each accepted waiver is appended to a Google Sheet for your legal records. Create a Google Cloud <strong>service account</strong>, download its JSON key, paste it below, create a Sheet and paste its ID, then <strong>share the Sheet with the service-account email as Editor</strong>. Without this, waivers are still recorded on-server and exportable as CSV from the Waivers page.</p><?php if ( fppm_gs_client_email() ) : ?><p style="font-weight:400;"><strong>Service account:</strong> <code><?php echo esc_html( fppm_gs_client_email() ); ?></code> — share your Sheet with this address as Editor.</p><?php endif; ?></th></tr>
				<tr><th scope="row">Service-account JSON</th><td><textarea name="fppm_gs_json" rows="6" class="large-text" placeholder='{ "type": "service_account", "client_email": "...", "private_key": "..." }'><?php echo esc_textarea( get_option( 'fppm_gs_json', '' ) ); ?></textarea></td></tr>
				<tr><th scope="row">Sheet ID</th><td><input type="text" name="fppm_gs_sheet_id" value="<?php echo esc_attr( get_option( 'fppm_gs_sheet_id', '' ) ); ?>" class="regular-text" placeholder="the part after /spreadsheets/d/ in the URL"></td></tr>
				<tr><th scope="row">Tab name</th><td><input type="text" name="fppm_gs_tab" value="<?php echo esc_attr( fppm_gs_tab() ); ?>" class="regular-text"><p class="description">Created automatically if it doesn't exist. Default: Waivers.</p></td></tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/* ============================================================
 * 10a-2. FETCH STORE CATALOG FROM PRINTFUL
 *        One click in Settings builds the fppm_store_catalog JSON from the
 *        live Printful store, using the saved API token. Overwrites the field.
 * ============================================================ */
add_action( 'admin_post_fppm_fetch_catalog', 'fppm_fetch_catalog_handler' );
function fppm_fetch_catalog_handler() {
	if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'fppm_fetch_catalog' );
	$back = admin_url( 'admin.php?page=fppm-settings' );

	$tok = fppm_printful_token();
	if ( ! $tok ) { fppm_catalog_bounce( $back, 'No Printful API token saved — paste it in the In-plugin store section, Save Changes, then click Fetch again.' ); }

	// Account-level tokens need a store id. If none is saved, ask Printful for
	// the stores this token can see; exactly one → use it (and remember it).
	if ( ! fppm_printful_store_id() ) {
		$r = wp_remote_get( 'https://api.printful.com/stores', array( 'timeout' => 30, 'headers' => array( 'Authorization' => 'Bearer ' . $tok ) ) );
		if ( is_wp_error( $r ) ) { fppm_catalog_bounce( $back, $r->get_error_message() ); }
		$b = json_decode( wp_remote_retrieve_body( $r ), true );
		$stores = ( isset( $b['result'] ) && is_array( $b['result'] ) ) ? $b['result'] : array();
		if ( 1 === count( $stores ) && ! empty( $stores[0]['id'] ) ) {
			update_option( 'fppm_printful_store_id', (string) (int) $stores[0]['id'] );
		} elseif ( count( $stores ) > 1 ) {
			$names = array();
			foreach ( $stores as $s ) { $names[] = ( isset( $s['name'] ) ? $s['name'] : '?' ) . ' (ID ' . ( isset( $s['id'] ) ? $s['id'] : '?' ) . ')'; }
			fppm_catalog_bounce( $back, 'This token can see several stores: ' . implode( ', ', $names ) . '. Paste the Martins store\'s ID into the "Printful store ID" field, Save Changes, then click Fetch again.' );
		} else {
			fppm_catalog_bounce( $back, 'Printful did not list any store for this token — check the token, or paste the store ID (Printful → Stores → the number in the store URL) into the "Printful store ID" field.' );
		}
	}
	$headers = fppm_printful_headers();

	// List every product in the store (paged, 100 at a time).
	$list = array(); $offset = 0;
	do {
		$r = wp_remote_get( 'https://api.printful.com/store/products?limit=100&offset=' . $offset, array( 'timeout' => 30, 'headers' => $headers ) );
		if ( is_wp_error( $r ) ) { fppm_catalog_bounce( $back, $r->get_error_message() ); }
		$code = wp_remote_retrieve_response_code( $r );
		$b    = json_decode( wp_remote_retrieve_body( $r ), true );
		if ( $code < 200 || $code >= 300 ) { fppm_catalog_bounce( $back, isset( $b['error']['message'] ) ? $b['error']['message'] : ( 'Printful HTTP ' . $code . ' — the token may be wrong or for a different store.' ) ); }
		$batch = ( isset( $b['result'] ) && is_array( $b['result'] ) ) ? $b['result'] : array();
		$list  = array_merge( $list, $batch );
		$offset += 100;
	} while ( 100 === count( $batch ) );
	if ( ! $list ) { fppm_catalog_bounce( $back, 'The token works, but the Printful store has no products yet — add merch in Printful first.' ); }

	// Pull each product's sync variants (id + retail price).
	$catalog = array(); $nv = 0; $nimg = 0;
	foreach ( $list as $p ) {
		if ( empty( $p['id'] ) ) { continue; }
		$r = wp_remote_get( 'https://api.printful.com/store/products/' . (int) $p['id'], array( 'timeout' => 30, 'headers' => $headers ) );
		if ( is_wp_error( $r ) ) { fppm_catalog_bounce( $back, $r->get_error_message() ); }
		$b = json_decode( wp_remote_retrieve_body( $r ), true );
		if ( empty( $b['result']['sync_variants'] ) || ! is_array( $b['result']['sync_variants'] ) ) { continue; }
		$pname = isset( $b['result']['sync_product']['name'] ) ? $b['result']['sync_product']['name'] : ( isset( $p['name'] ) ? $p['name'] : 'Product' );
		// Product mockup image (falls back to the list thumbnail).
		$pimg = isset( $b['result']['sync_product']['thumbnail_url'] ) ? $b['result']['sync_product']['thumbnail_url'] : ( isset( $p['thumbnail_url'] ) ? $p['thumbnail_url'] : '' );
		$vs = array();
		foreach ( $b['result']['sync_variants'] as $v ) {
			if ( empty( $v['id'] ) || ! isset( $v['retail_price'] ) ) { continue; }
			// Variant label = the size/color part after the product name, e.g. "FPPM Tee - M" -> "M".
			$label = isset( $v['name'] ) ? $v['name'] : '';
			if ( $pname && 0 === stripos( $label, $pname ) ) { $label = trim( substr( $label, strlen( $pname ) ), " -/,\t" ); }
			if ( '' === $label ) { $label = 'One size'; }
			// Per-variant mockup: the 'preview' file Printful renders for this variant.
			$vimg = '';
			if ( ! empty( $v['files'] ) && is_array( $v['files'] ) ) {
				foreach ( $v['files'] as $f ) {
					if ( isset( $f['type'] ) && 'preview' === $f['type'] && ! empty( $f['preview_url'] ) ) { $vimg = $f['preview_url']; break; }
				}
			}
			if ( '' === $vimg && ! empty( $v['product']['image'] ) ) { $vimg = $v['product']['image']; }
			if ( '' === $vimg ) { $vimg = $pimg; }
			if ( '' === $pimg && '' !== $vimg ) { $pimg = $vimg; }
			$vs[] = array( 'label' => $label, 'id' => (int) $v['id'], 'price' => round( (float) $v['retail_price'], 2 ), 'img' => $vimg );
			$nv++;
			if ( '' !== $vimg ) { $nimg++; }
		}
		if ( $vs ) { $catalog[] = array( 'name' => $pname, 'img' => $pimg, 'variants' => $vs ); }
	}
	if ( ! $catalog ) { fppm_catalog_bounce( $back, 'No sellable variants found — make sure the products are synced in Printful with retail prices set.' ); }

	update_option( 'fppm_store_catalog', wp_json_encode( $catalog, JSON_PRETTY_PRINT ) );
	wp_safe_redirect( add_query_arg( array( 'fppm_catalog' => 'ok', 'p' => count( $catalog ), 'v' => $nv, 'img' => $nimg ), $back ) );
	exit;
}
/* Redirect back to Settings with an error notice. */
function fppm_catalog_bounce( $back, $msg ) {
	wp_safe_redirect( add_query_arg( array( 'fppm_catalog' => 'err', 'fppm_catalog_msg' => rawurlencode( $msg ) ), $back ) );
	exit;
}

/* ============================================================
 * 10b. WAIVER OFF-SERVER RECORDING (Google Sheet via service account)
 *      Auth/Sheets pattern adapted from the GFF Drive Backup plugin.
 * ============================================================ */

/* The columns written to the Sheet (and CSV) for one member's waiver. */
function fppm_waiver_header() {
	return array( 'accepted_at', 'name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'type', 'waiver_version', 'waiver_hash', 'ip', 'user_agent', 'user_id' );
}
function fppm_waiver_row( $uid ) {
	$w = get_user_meta( $uid, 'fppm_waiver', true );
	if ( ! is_array( $w ) ) { return null; }
	$u = get_userdata( $uid );
	return array(
		isset( $w['at'] ) ? $w['at'] : '',
		isset( $w['name'] ) ? $w['name'] : fppm_display_name( $uid ),
		isset( $w['email'] ) ? $w['email'] : ( $u ? $u->user_email : '' ),
		get_user_meta( $uid, 'fppm_phone', true ),
		get_user_meta( $uid, 'fppm_address', true ),
		get_user_meta( $uid, 'fppm_city', true ),
		get_user_meta( $uid, 'fppm_state', true ),
		get_user_meta( $uid, 'fppm_zip', true ),
		fppm_type_label( fppm_type_of( $uid ) ),
		isset( $w['version'] ) ? $w['version'] : '',
		isset( $w['hash'] ) ? $w['hash'] : '',
		isset( $w['ip'] ) ? $w['ip'] : '',
		isset( $w['ua'] ) ? $w['ua'] : '',
		(string) $uid,
	);
}

/* Append one member's waiver to the Google Sheet. Soft-fails: sets
 * fppm_waiver_synced 0/1 and returns true or WP_Error (never throws). */
function fppm_waiver_record_offsite( $uid ) {
	$row = fppm_waiver_row( $uid );
	if ( null === $row ) { return new WP_Error( 'no_waiver', 'No waiver on file for this user.' ); }
	if ( ! fppm_gs_configured() ) {
		update_user_meta( $uid, 'fppm_waiver_synced', 0 ); // recorded on-server; Drive not set up
		return new WP_Error( 'not_configured', 'Google Sheet not configured.' );
	}
	$token = fppm_g_token( fppm_gs_json() );
	if ( is_wp_error( $token ) ) { update_user_meta( $uid, 'fppm_waiver_synced', 0 ); return $token; }
	$sid = fppm_gs_sheet_id();
	$tab = fppm_gs_tab();
	$ens = fppm_g_ensure_tab( $token, $sid, $tab );
	if ( is_wp_error( $ens ) ) { update_user_meta( $uid, 'fppm_waiver_synced', 0 ); return $ens; }
	if ( true === $ens ) { fppm_g_append( $token, $sid, $tab, array( fppm_waiver_header() ) ); } // header on first create
	$res = fppm_g_append( $token, $sid, $tab, array( $row ) );
	if ( is_wp_error( $res ) ) { update_user_meta( $uid, 'fppm_waiver_synced', 0 ); return $res; }
	update_user_meta( $uid, 'fppm_waiver_synced', 1 );
	return true;
}

/* ---- Google auth + Sheets (adapted from GFF Drive Backup) ---- */
function fppm_g_b64url( $data ) { return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' ); }
function fppm_g_token( $json_string ) {
	$creds = json_decode( $json_string, true );
	if ( ! is_array( $creds ) || empty( $creds['client_email'] ) || empty( $creds['private_key'] ) ) {
		return new WP_Error( 'bad_json', 'Service-account JSON is missing client_email or private_key.' );
	}
	if ( ! function_exists( 'openssl_sign' ) ) { return new WP_Error( 'no_openssl', 'PHP openssl extension is required.' ); }
	$now   = time();
	$seg   = array(
		fppm_g_b64url( wp_json_encode( array( 'alg' => 'RS256', 'typ' => 'JWT' ) ) ),
		fppm_g_b64url( wp_json_encode( array(
			'iss'   => $creds['client_email'],
			'scope' => 'https://www.googleapis.com/auth/spreadsheets',
			'aud'   => 'https://oauth2.googleapis.com/token',
			'iat'   => $now,
			'exp'   => $now + 3600,
		) ) ),
	);
	$signing_input = implode( '.', $seg );
	$sig = '';
	if ( ! openssl_sign( $signing_input, $sig, $creds['private_key'], 'sha256WithRSAEncryption' ) ) {
		return new WP_Error( 'sign_failed', 'Could not sign the JWT (check private_key).' );
	}
	$jwt  = $signing_input . '.' . fppm_g_b64url( $sig );
	$resp = wp_remote_post( 'https://oauth2.googleapis.com/token', array(
		'timeout' => 20,
		'body'    => array( 'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt ),
	) );
	if ( is_wp_error( $resp ) ) { return $resp; }
	$body = json_decode( wp_remote_retrieve_body( $resp ), true );
	if ( 200 !== wp_remote_retrieve_response_code( $resp ) || empty( $body['access_token'] ) ) {
		$msg = is_array( $body ) && isset( $body['error_description'] ) ? $body['error_description'] : 'token exchange failed';
		return new WP_Error( 'token_failed', 'Google token exchange failed: ' . $msg );
	}
	return $body['access_token'];
}
/* Ensure a tab exists. Returns true if it was just created, 'exists', or WP_Error. */
function fppm_g_ensure_tab( $token, $sheet_id, $title ) {
	$base = 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode( $sheet_id );
	$get  = wp_remote_get( $base . '?fields=sheets.properties.title', array(
		'timeout' => 20, 'headers' => array( 'Authorization' => 'Bearer ' . $token ),
	) );
	if ( ! is_wp_error( $get ) && 200 === wp_remote_retrieve_response_code( $get ) ) {
		$b = json_decode( wp_remote_retrieve_body( $get ), true );
		if ( isset( $b['sheets'] ) && is_array( $b['sheets'] ) ) {
			foreach ( $b['sheets'] as $s ) {
				if ( isset( $s['properties']['title'] ) && $s['properties']['title'] === $title ) { return 'exists'; }
			}
		}
	} elseif ( is_wp_error( $get ) ) {
		return $get;
	}
	$add = wp_remote_post( $base . ':batchUpdate', array(
		'timeout' => 30,
		'headers' => array( 'Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json' ),
		'body'    => wp_json_encode( array( 'requests' => array( array( 'addSheet' => array( 'properties' => array( 'title' => $title ) ) ) ) ) ),
	) );
	if ( is_wp_error( $add ) ) { return $add; }
	$code = wp_remote_retrieve_response_code( $add );
	if ( 200 === $code ) { return true; }      // freshly created → caller writes header
	return 'exists';                             // 400 usually = already there (race)
}
/* Append rows to a tab. */
function fppm_g_append( $token, $sheet_id, $tab, $rows ) {
	$base   = 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode( $sheet_id );
	$quoted = "'" . str_replace( "'", "''", $tab ) . "'";
	$url    = $base . '/values/' . rawurlencode( $quoted . '!A1' ) . ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
	$resp   = wp_remote_post( $url, array(
		'timeout' => 30,
		'headers' => array( 'Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json' ),
		'body'    => wp_json_encode( array( 'values' => $rows ) ),
	) );
	if ( is_wp_error( $resp ) ) { return $resp; }
	$code = wp_remote_retrieve_response_code( $resp );
	if ( 200 !== $code ) {
		$b   = json_decode( wp_remote_retrieve_body( $resp ), true );
		$msg = is_array( $b ) && isset( $b['error']['message'] ) ? $b['error']['message'] : ( 'HTTP ' . $code );
		return new WP_Error( 'append_failed', 'Could not append to the Sheet (HTTP ' . $code . '): ' . $msg
			. ' — confirm the Sheet is shared with ' . fppm_gs_client_email() . ' as Editor.' );
	}
	return true;
}

/* All members who have a waiver on file. */
function fppm_all_waivers() {
	$users = get_users( array( 'role__in' => array( 'fppm_member' ), 'number' => 5000, 'orderby' => 'registered', 'order' => 'DESC' ) );
	$out   = array();
	foreach ( $users as $u ) {
		$w = get_user_meta( $u->ID, 'fppm_waiver', true );
		if ( is_array( $w ) && ! empty( $w['accepted'] ) ) {
			$out[] = array( 'id' => $u->ID, 'w' => $w, 'synced' => (int) get_user_meta( $u->ID, 'fppm_waiver_synced', true ) );
		}
	}
	return $out;
}

/* Admin: Waivers list, CSV export, and re-sync to Google. */
function fppm_waivers_page() {
	if ( ! current_user_can( 'manage_options' ) ) { return; }
	$waivers = fppm_all_waivers();
	$pending = array_filter( $waivers, function ( $r ) { return 1 !== $r['synced']; } );
	if ( isset( $_GET['fppm_synced'] ) ) {
		$n = (int) $_GET['fppm_synced']; $f = isset( $_GET['fppm_failed'] ) ? (int) $_GET['fppm_failed'] : 0;
		echo '<div class="notice notice-' . ( $f ? 'warning' : 'success' ) . ' is-dismissible"><p>Synced ' . esc_html( $n ) . ' waiver(s) to Google Sheets' . ( $f ? ', ' . esc_html( $f ) . ' failed (see the service-account sharing).' : '.' ) . '</p></div>';
	}
	$csv  = wp_nonce_url( admin_url( 'admin-post.php?action=fppm_export_waivers' ), 'fppm_export_waivers' );
	$sync = wp_nonce_url( admin_url( 'admin-post.php?action=fppm_sync_waivers' ), 'fppm_sync_waivers' );
	?>
	<div class="wrap">
		<h1>Waivers <span style="font-size:13px;font-weight:400;background:#5E17EB;color:#fff;padding:2px 10px;border-radius:12px;"><?php echo count( $waivers ); ?> on file</span></h1>
		<p>Off-server recording: <?php echo fppm_gs_configured() ? '✅ Google Sheet configured' . ( fppm_gs_client_email() ? ' (share it with <code>' . esc_html( fppm_gs_client_email() ) . '</code> as Editor)' : '' ) : '⚠️ not configured — set the service-account JSON + Sheet ID in Settings. Waivers are still recorded on-server and exportable below.'; ?></p>
		<p>
			<a href="<?php echo esc_url( $csv ); ?>" class="button button-primary">Export all waivers to CSV</a>
			<?php if ( fppm_gs_configured() ) : ?><a href="<?php echo esc_url( $sync ); ?>" class="button">Sync <?php echo count( $pending ); ?> pending to Google Sheet</a><?php endif; ?>
		</p>
		<table class="widefat striped">
			<thead><tr><th>Accepted</th><th>Name</th><th>Email</th><th>Version</th><th>IP</th><th>Drive</th></tr></thead>
			<tbody>
			<?php if ( ! $waivers ) : ?>
				<tr><td colspan="6">No waivers yet.</td></tr>
			<?php else : foreach ( $waivers as $r ) : $w = $r['w']; ?>
				<tr>
					<td><?php echo esc_html( isset( $w['at'] ) ? $w['at'] : '' ); ?></td>
					<td><?php echo esc_html( isset( $w['name'] ) ? $w['name'] : fppm_display_name( $r['id'] ) ); ?></td>
					<td><?php echo esc_html( isset( $w['email'] ) ? $w['email'] : '' ); ?></td>
					<td>v<?php echo esc_html( isset( $w['version'] ) ? $w['version'] : '' ); ?></td>
					<td><?php echo esc_html( isset( $w['ip'] ) ? $w['ip'] : '' ); ?></td>
					<td><?php echo 1 === $r['synced'] ? '✅' : '—'; ?></td>
				</tr>
			<?php endforeach; endif; ?>
			</tbody>
		</table>
	</div>
	<?php
}

add_action( 'admin_post_fppm_export_waivers', 'fppm_h_export_waivers' );
function fppm_h_export_waivers() {
	if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'fppm_export_waivers' );
	nocache_headers();
	header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename=fppm-waivers-' . gmdate( 'Y-m-d' ) . '.csv' );
	$out = fopen( 'php://output', 'w' );
	fputcsv( $out, fppm_waiver_header() );
	foreach ( fppm_all_waivers() as $r ) {
		$row = fppm_waiver_row( $r['id'] );
		if ( $row ) { fputcsv( $out, $row ); }
	}
	fclose( $out );
	exit;
}

add_action( 'admin_post_fppm_sync_waivers', 'fppm_h_sync_waivers' );
function fppm_h_sync_waivers() {
	if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'fppm_sync_waivers' );
	$ok = 0; $fail = 0;
	foreach ( fppm_all_waivers() as $r ) {
		if ( 1 === $r['synced'] ) { continue; }
		$res = fppm_waiver_record_offsite( $r['id'] );
		if ( is_wp_error( $res ) ) { $fail++; } else { $ok++; }
	}
	wp_safe_redirect( add_query_arg( array( 'fppm_synced' => $ok, 'fppm_failed' => $fail ), admin_url( 'admin.php?page=fppm-waivers' ) ) );
	exit;
}

/* ============================================================
 * 10c. LOGIN GATE — the whole site is members-only (must be logged in)
 * ============================================================ */
function fppm_gate_enabled() { return '1' === (string) get_option( 'fppm_login_gate', '1' ); }

/* Where logged-out visitors are sent to join / sign in. */
function fppm_join_url() {
	$u = trim( (string) get_option( 'fppm_join_url', '' ) );
	return $u ? esc_url_raw( $u ) : home_url( '/go/' ); // default landing = /go
}

/* Page slugs reachable while logged out (plus any page holding the signup/recruit
 * shortcode is auto-detected). Extend via the fppm_public_slugs option. */
function fppm_public_page_slugs() {
	$slugs = array( 'go', 'join', 'register', 'invite', 'login' );
	$extra = get_option( 'fppm_public_slugs', '' );
	if ( is_string( $extra ) && '' !== trim( $extra ) ) {
		foreach ( explode( ',', $extra ) as $s ) {
			$s = sanitize_title( trim( $s ) );
			if ( $s ) { $slugs[] = $s; }
		}
	}
	return apply_filters( 'fppm_public_page_slugs', array_values( array_unique( $slugs ) ) );
}

function fppm_is_public_request() {
	if ( isset( $_GET['fppm_pwa'] ) ) { return true; }              // manifest / service worker
	$q = get_queried_object();
	if ( $q instanceof WP_Post ) {
		if ( in_array( $q->post_name, fppm_public_page_slugs(), true ) ) { return true; }
		if ( has_shortcode( (string) $q->post_content, 'fppm_register' ) ) { return true; }
		if ( has_shortcode( (string) $q->post_content, 'fppm_invite' ) ) { return true; }
	}
	return false;
}

add_action( 'template_redirect', 'fppm_login_gate', 1 );
function fppm_login_gate() {
	if ( ! fppm_gate_enabled() || is_user_logged_in() ) { return; }
	if ( is_admin() ) { return; }
	if ( ( defined( 'DOING_AJAX' ) && DOING_AJAX ) || ( defined( 'DOING_CRON' ) && DOING_CRON ) || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) { return; }
	if ( is_feed() || is_robots() || ( function_exists( 'is_favicon' ) && is_favicon() ) ) { return; }
	global $pagenow;
	if ( in_array( $pagenow, array( 'wp-login.php', 'wp-register.php' ), true ) ) { return; }
	if ( fppm_is_public_request() ) { return; }
	// Everything else → funnel to the join/sign-in page.
	wp_safe_redirect( add_query_arg( 'fppm_gate', '1', fppm_join_url() ) );
	exit;
}

/* A logged-in member who hasn't finished the FPPM profile (e.g. a Google sign-in)
 * is funneled to /account to complete it (waiver + oath are required). */
add_action( 'template_redirect', 'fppm_completion_gate', 2 );
function fppm_completion_gate() {
	if ( ! is_user_logged_in() || is_admin() ) { return; }
	if ( ( defined( 'DOING_AJAX' ) && DOING_AJAX ) || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) { return; }
	if ( is_feed() || is_robots() || ( function_exists( 'is_favicon' ) && is_favicon() ) ) { return; }
	$uid = get_current_user_id();
	if ( fppm_can_manage( $uid ) || fppm_member_complete( $uid ) ) { return; }
	$q = get_queried_object();
	if ( $q instanceof WP_Post && has_shortcode( (string) $q->post_content, 'fppm_account' ) ) { return; }
	wp_safe_redirect( home_url( '/account/' ) );
	exit;
}

/* ============================================================
 * 10d. SCHEDULE / FIXTURES + RSVP
 *      Players RSVP to everything; supporters RSVP to matches; fans view.
 * ============================================================ */
function fppm_event_types() {
	return array( 'match' => 'Match', 'practice' => 'Practice', 'conditioning' => 'Conditioning', 'event' => 'Team event' );
}
function fppm_events_get() {
	$e = get_option( 'fppm_events', array() );
	return is_array( $e ) ? $e : array();
}
function fppm_events_save( $events ) { update_option( 'fppm_events', array_values( $events ), false ); }
function fppm_weekdays() { return array( 0 => 'Sunday', 1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday' ); }
function fppm_is_weekly( $e ) { return isset( $e['recur'] ) && 'weekly' === $e['recur']; }
/* Next occurrence START timestamp (handles weekly recurrence + one-time). */
function fppm_event_ts( $e ) {
	$time = ! empty( $e['time'] ) ? $e['time'] : '00:00';
	if ( fppm_is_weekly( $e ) ) {
		$wd    = isset( $e['weekday'] ) ? (int) $e['weekday'] : 6;
		$now   = time();
		$ahead = ( $wd - (int) date( 'w', $now ) + 7 ) % 7;
		$start = strtotime( date( 'Y-m-d', $now + $ahead * DAY_IN_SECONDS ) . ' ' . $time );
		if ( 0 === $ahead && $start ) {
			$end = ! empty( $e['end'] ) ? strtotime( date( 'Y-m-d', $now ) . ' ' . $e['end'] ) : $start + HOUR_IN_SECONDS;
			if ( $now > $end ) { $start += WEEK_IN_SECONDS; }
		}
		return $start ? $start : 0;
	}
	$ts = strtotime( ( isset( $e['date'] ) ? $e['date'] : '' ) . ' ' . $time );
	return $ts ? $ts : 0;
}
function fppm_event_end_ts( $e ) {
	$start = fppm_event_ts( $e );
	if ( ! $start ) { return 0; }
	if ( ! empty( $e['end'] ) ) {
		$end = strtotime( date( 'Y-m-d', $start ) . ' ' . $e['end'] );
		if ( $end && $end > $start ) { return $end; }
	}
	return $start + HOUR_IN_SECONDS;
}
function fppm_events_upcoming() {
	$today = strtotime( 'today' );
	$up = array_values( array_filter( fppm_events_get(), function ( $e ) use ( $today ) { return fppm_is_weekly( $e ) || fppm_event_ts( $e ) >= $today; } ) );
	usort( $up, function ( $a, $b ) { return fppm_event_ts( $a ) - fppm_event_ts( $b ); } );
	return $up;
}
function fppm_event_next() { $u = fppm_events_upcoming(); return $u ? $u[0] : null; }
function fppm_event_label( $e ) {
	$types = fppm_event_types();
	$type  = isset( $types[ $e['type'] ] ) ? $types[ $e['type'] ] : 'Event';
	$title = isset( $e['title'] ) ? $e['title'] : '';
	if ( 'match' === $e['type'] ) { return $title ? 'Match vs ' . $title : 'Match'; }
	return $title ? $type . ' — ' . $title : $type;
}
function fppm_event_when( $e ) {
	$ts = fppm_event_ts( $e );
	if ( ! $ts ) { return ''; }
	$tp = '';
	if ( ! empty( $e['time'] ) ) {
		$tp = date_i18n( 'g:i', $ts );
		$tp .= ! empty( $e['end'] ) ? '–' . date_i18n( 'g:i A', fppm_event_end_ts( $e ) ) : ' ' . date_i18n( 'A', $ts );
	}
	if ( fppm_is_weekly( $e ) ) {
		$wds = fppm_weekdays();
		$wd  = isset( $e['weekday'] ) ? (int) $e['weekday'] : 6;
		return 'Every ' . ( isset( $wds[ $wd ] ) ? $wds[ $wd ] : '' ) . ( $tp ? ' · ' . $tp : '' ) . ' · next ' . date_i18n( 'M j', $ts );
	}
	return date_i18n( 'D, M j', $ts ) . ( $tp ? ' · ' . $tp : '' );
}
/* ---- location + calendar helpers ---- */
function fppm_tz() { $t = function_exists( 'wp_timezone_string' ) ? wp_timezone_string() : ''; return $t ? $t : 'America/New_York'; }
function fppm_event_has_geo( $e ) { return isset( $e['lat'], $e['lng'] ) && '' !== $e['lat'] && '' !== $e['lng']; }
function fppm_event_location_label( $e ) { return isset( $e['location'] ) ? $e['location'] : ''; }
function fppm_event_map_url( $e ) {
	if ( fppm_event_has_geo( $e ) ) { return 'https://www.google.com/maps/search/?api=1&query=' . rawurlencode( $e['lat'] . ',' . $e['lng'] ); }
	if ( ! empty( $e['location'] ) ) { return 'https://www.google.com/maps/search/?api=1&query=' . rawurlencode( $e['location'] ); }
	return '';
}
function fppm_ics_byday( $wd ) { $m = array( 'SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA' ); $wd = (int) $wd; return isset( $m[ $wd ] ) ? $m[ $wd ] : 'SA'; }
function fppm_cal_loc( $e ) { return trim( fppm_event_location_label( $e ) . ( fppm_event_has_geo( $e ) ? ' (' . $e['lat'] . ', ' . $e['lng'] . ')' : '' ) ); }
function fppm_cal_details( $e ) { return trim( ( isset( $e['notes'] ) ? $e['notes'] : '' ) . ( fppm_event_map_url( $e ) ? "\nMap: " . fppm_event_map_url( $e ) : '' ) ); }
function fppm_event_gcal_url( $e ) {
	$args = array(
		'action'   => 'TEMPLATE',
		'text'     => fppm_event_label( $e ),
		'dates'    => date( 'Ymd\THis', fppm_event_ts( $e ) ) . '/' . date( 'Ymd\THis', fppm_event_end_ts( $e ) ),
		'ctz'      => fppm_tz(),
		'location' => fppm_cal_loc( $e ),
		'details'  => fppm_cal_details( $e ),
	);
	if ( fppm_is_weekly( $e ) ) { $args['recur'] = 'RRULE:FREQ=WEEKLY;BYDAY=' . fppm_ics_byday( isset( $e['weekday'] ) ? $e['weekday'] : 6 ); }
	return 'https://calendar.google.com/calendar/render?' . http_build_query( $args );
}
function fppm_event_outlook_url( $e ) {
	$args = array(
		'path'    => '/calendar/action/compose',
		'rru'     => 'addevent',
		'subject' => fppm_event_label( $e ),
		'startdt' => date( 'c', fppm_event_ts( $e ) ),
		'enddt'   => date( 'c', fppm_event_end_ts( $e ) ),
		'location'=> fppm_cal_loc( $e ),
		'body'    => fppm_cal_details( $e ),
	);
	return 'https://outlook.live.com/calendar/0/deeplink/compose?' . http_build_query( $args );
}
function fppm_ics_url( $e ) { return home_url( '/?fppm_ics=' . (int) ( isset( $e['id'] ) ? $e['id'] : 0 ) ); }
function fppm_ics_esc( $s ) { return str_replace( array( "\\", ',', ';', "\n" ), array( '\\\\', '\\,', '\\;', '\\n' ), (string) $s ); }
function fppm_event_ics( $e ) {
	$host = wp_parse_url( home_url(), PHP_URL_HOST );
	$lines = array(
		'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FPPM//Team Manager//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		'UID:fppm-' . (int) ( isset( $e['id'] ) ? $e['id'] : 0 ) . '@' . $host,
		'DTSTAMP:' . gmdate( 'Ymd\THis\Z' ),
		'DTSTART:' . date( 'Ymd\THis', fppm_event_ts( $e ) ),   // floating local time
		'DTEND:' . date( 'Ymd\THis', fppm_event_end_ts( $e ) ),
		'SUMMARY:' . fppm_ics_esc( fppm_event_label( $e ) ),
	);
	if ( fppm_cal_loc( $e ) ) { $lines[] = 'LOCATION:' . fppm_ics_esc( fppm_cal_loc( $e ) ); }
	if ( fppm_cal_details( $e ) ) { $lines[] = 'DESCRIPTION:' . fppm_ics_esc( fppm_cal_details( $e ) ); }
	if ( fppm_event_has_geo( $e ) ) { $lines[] = 'GEO:' . floatval( $e['lat'] ) . ';' . floatval( $e['lng'] ); }
	if ( fppm_is_weekly( $e ) ) { $lines[] = 'RRULE:FREQ=WEEKLY;BYDAY=' . fppm_ics_byday( isset( $e['weekday'] ) ? $e['weekday'] : 6 ); }
	$lines[] = 'END:VEVENT';
	$lines[] = 'END:VCALENDAR';
	return implode( "\r\n", $lines ) . "\r\n";
}
add_action( 'init', 'fppm_ics_serve' );
function fppm_ics_serve() {
	if ( empty( $_GET['fppm_ics'] ) ) { return; }
	$id = (int) $_GET['fppm_ics'];
	$ev = null;
	foreach ( fppm_events_get() as $e ) { if ( (int) ( isset( $e['id'] ) ? $e['id'] : 0 ) === $id ) { $ev = $e; break; } }
	if ( ! $ev ) { status_header( 404 ); exit; }
	nocache_headers();
	header( 'Content-Type: text/calendar; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename="fppm-event-' . $id . '.ics"' );
	echo fppm_event_ics( $ev );
	exit;
}
/* Add-to-calendar button row for one event. */
function fppm_event_calendar_html( $e ) {
	return '<div class="fppm-actions" style="margin-top:.4em;">'
		. '<a class="fppm-btn fppm-btn--ghost" style="padding:.25em .7em;font-size:.8rem;" href="' . esc_url( fppm_event_gcal_url( $e ) ) . '" target="_blank" rel="noopener">+ Google</a>'
		. '<a class="fppm-btn fppm-btn--ghost" style="padding:.25em .7em;font-size:.8rem;" href="' . esc_url( fppm_ics_url( $e ) ) . '">+ Apple / Outlook</a>'
		. '<a class="fppm-btn fppm-btn--ghost" style="padding:.25em .7em;font-size:.8rem;" href="' . esc_url( fppm_event_outlook_url( $e ) ) . '" target="_blank" rel="noopener">+ Outlook.com</a>'
		. ( fppm_event_map_url( $e ) ? '<a class="fppm-btn fppm-btn--ghost" style="padding:.25em .7em;font-size:.8rem;" href="' . esc_url( fppm_event_map_url( $e ) ) . '" target="_blank" rel="noopener">📍 Map</a>' : '' )
		. '</div>';
}
function fppm_can_rsvp( $event_type, $member_type ) {
	if ( 'player' === $member_type ) { return true; }
	if ( 'supporter' === $member_type ) { return 'match' === $event_type; }
	return false;
}
function fppm_rsvp_counts( $e ) {
	$c = array( 'in' => 0, 'maybe' => 0, 'out' => 0 );
	if ( ! empty( $e['rsvps'] ) && is_array( $e['rsvps'] ) ) {
		foreach ( $e['rsvps'] as $s ) { if ( isset( $c[ $s ] ) ) { $c[ $s ]++; } }
	}
	return $c;
}

/* Seed the standing Saturday conditioning session once. */
add_action( 'init', 'fppm_seed_events' );
function fppm_seed_events() {
	if ( get_option( 'fppm_seed_conditioning' ) ) { return; }
	$events = fppm_events_get();
	$maxid  = 0;
	foreach ( $events as $e ) { if ( ! empty( $e['id'] ) && $e['id'] > $maxid ) { $maxid = (int) $e['id']; } }
	$events[] = array(
		'id'       => $maxid + 1,
		'type'     => 'conditioning',
		'recur'    => 'weekly',
		'weekday'  => 6, // Saturday
		'title'    => '',
		'date'     => '',
		'time'     => '08:00',
		'end'      => '09:00',
		'location' => 'Dan McCarty Track',
		'lat'      => '27.431200215726122',
		'lng'      => '-80.33686374487264',
		'notes'    => 'Players meet at the Dan McCarty Track parking lot for conditioning.',
		'rsvps'    => array(),
	);
	fppm_events_save( $events );
	update_option( 'fppm_seed_conditioning', '1' );
}

/* ---- handlers ---- */
add_action( 'admin_post_fppm_add_event', 'fppm_h_add_event' );
function fppm_h_add_event() {
	if ( ! fppm_can_manage() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'fppm_add_event' );
	$type = isset( $_POST['etype'] ) ? sanitize_key( wp_unslash( $_POST['etype'] ) ) : 'match';
	if ( ! array_key_exists( $type, fppm_event_types() ) ) { $type = 'event'; }
	$recur   = ( isset( $_POST['erecur'] ) && 'weekly' === $_POST['erecur'] ) ? 'weekly' : 'none';
	$date    = isset( $_POST['edate'] ) ? sanitize_text_field( wp_unslash( $_POST['edate'] ) ) : '';
	$weekday = isset( $_POST['eweekday'] ) ? (int) $_POST['eweekday'] : 6;
	// One-time needs a date; weekly needs a weekday.
	if ( 'weekly' !== $recur && '' === $date ) { fppm_redirect_note( 'err' ); }
	$coords = isset( $_POST['ecoords'] ) ? sanitize_text_field( wp_unslash( $_POST['ecoords'] ) ) : '';
	$lat = ''; $lng = '';
	if ( $coords && preg_match( '/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/', $coords, $m ) ) { $lat = $m[1]; $lng = $m[2]; }
	$events = fppm_events_get();
	$maxid  = 0;
	foreach ( $events as $e ) { if ( ! empty( $e['id'] ) && $e['id'] > $maxid ) { $maxid = (int) $e['id']; } }
	$events[] = array(
		'id'       => $maxid + 1,
		'type'     => $type,
		'recur'    => $recur,
		'weekday'  => $weekday,
		'title'    => isset( $_POST['etitle'] ) ? sanitize_text_field( wp_unslash( $_POST['etitle'] ) ) : '',
		'date'     => $date,
		'time'     => isset( $_POST['etime'] ) ? sanitize_text_field( wp_unslash( $_POST['etime'] ) ) : '',
		'end'      => isset( $_POST['eend'] ) ? sanitize_text_field( wp_unslash( $_POST['eend'] ) ) : '',
		'location' => isset( $_POST['eloc'] ) ? sanitize_text_field( wp_unslash( $_POST['eloc'] ) ) : '',
		'lat'      => $lat,
		'lng'      => $lng,
		'notes'    => isset( $_POST['enotes'] ) ? sanitize_text_field( wp_unslash( $_POST['enotes'] ) ) : '',
		'rsvps'    => array(),
	);
	fppm_events_save( $events );
	fppm_redirect_note( 'eventadded' );
}
add_action( 'admin_post_fppm_delete_event', 'fppm_h_delete_event' );
function fppm_h_delete_event() {
	if ( ! fppm_can_manage() ) { wp_die( 'Not allowed.' ); }
	$id = isset( $_POST['id'] ) ? (int) $_POST['id'] : 0;
	check_admin_referer( 'fppm_delevent_' . $id );
	$events = array_filter( fppm_events_get(), function ( $e ) use ( $id ) { return (int) ( isset( $e['id'] ) ? $e['id'] : 0 ) !== $id; } );
	fppm_events_save( $events );
	fppm_redirect_note( 'eventdeleted' );
}
add_action( 'admin_post_fppm_rsvp', 'fppm_h_rsvp' );
function fppm_h_rsvp() {
	$uid = get_current_user_id();
	if ( ! $uid ) { wp_die( 'Sign in.' ); }
	$id = isset( $_POST['id'] ) ? (int) $_POST['id'] : 0;
	check_admin_referer( 'fppm_rsvp_' . $id );
	$status = isset( $_POST['status'] ) ? sanitize_key( wp_unslash( $_POST['status'] ) ) : '';
	if ( ! in_array( $status, array( 'in', 'maybe', 'out' ), true ) ) { fppm_redirect_note( 'err' ); }
	$events = fppm_events_get();
	$mtype  = fppm_type_of( $uid );
	foreach ( $events as &$e ) {
		if ( (int) ( isset( $e['id'] ) ? $e['id'] : 0 ) === $id ) {
			if ( ! fppm_can_rsvp( $e['type'], $mtype ) ) { wp_die( 'Not eligible to RSVP for this event.' ); }
			if ( empty( $e['rsvps'] ) || ! is_array( $e['rsvps'] ) ) { $e['rsvps'] = array(); }
			$e['rsvps'][ $uid ] = $status;
		}
	}
	unset( $e );
	fppm_events_save( $events );
	fppm_redirect_note( 'rsvpset' );
}

/* ---- renderers ---- */
function fppm_schedule_member_html( $uid ) {
	$up = fppm_events_upcoming();
	if ( ! $up ) { return ''; }
	$mtype  = fppm_type_of( $uid );
	$types  = fppm_event_types();
	ob_start();
	echo '<div class="fppm-card"><h3>Upcoming schedule</h3>';
	foreach ( $up as $e ) {
		$eid  = (int) ( isset( $e['id'] ) ? $e['id'] : 0 );
		$mine = isset( $e['rsvps'][ $uid ] ) ? $e['rsvps'][ $uid ] : '';
		echo '<div style="border-bottom:1px solid var(--fppm-line);padding:.6em 0;">';
		echo '<strong>' . esc_html( fppm_event_label( $e ) ) . '</strong> <span class="fppm-badge">' . esc_html( isset( $types[ $e['type'] ] ) ? $types[ $e['type'] ] : '' ) . '</span>';
		echo '<div class="fppm-muted">' . esc_html( fppm_event_when( $e ) ) . ( ! empty( $e['location'] ) ? ' · ' . esc_html( $e['location'] ) : '' ) . '</div>';
		echo fppm_event_calendar_html( $e );
		if ( ! empty( $e['notes'] ) ) { echo '<div class="fppm-muted" style="font-size:.85rem;">' . esc_html( $e['notes'] ) . '</div>'; }
		if ( fppm_can_rsvp( $e['type'], $mtype ) ) {
			echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="margin-top:.4em;display:flex;gap:.4rem;flex-wrap:wrap;">';
			echo '<input type="hidden" name="action" value="fppm_rsvp"><input type="hidden" name="id" value="' . $eid . '">';
			wp_nonce_field( 'fppm_rsvp_' . $eid );
			foreach ( array( 'in' => "I'm in", 'maybe' => 'Maybe', 'out' => "Can't" ) as $st => $lab ) {
				$on = ( $mine === $st ) ? 'background:var(--fppm-purple);color:#fff;border-color:var(--fppm-purple);' : '';
				echo '<button class="fppm-btn fppm-btn--ghost" style="padding:.3em .8em;font-size:.85rem;' . $on . '" name="status" value="' . $st . '">' . esc_html( $lab ) . '</button>';
			}
			echo '</form>';
		}
		echo '</div>';
	}
	echo '</div>';
	return ob_get_clean();
}

function fppm_schedule_staff_html() {
	ob_start();
	echo '<div class="fppm-card"><h3>Schedule</h3>';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="margin-bottom:1rem;">';
	echo '<input type="hidden" name="action" value="fppm_add_event">';
	wp_nonce_field( 'fppm_add_event' );
	echo '<div class="fppm-row"><div class="fppm-field" style="flex:0 1 160px;"><label>Type</label><select name="etype">';
	foreach ( fppm_event_types() as $k => $v ) { echo '<option value="' . esc_attr( $k ) . '">' . esc_html( $v ) . '</option>'; }
	echo '</select></div><div class="fppm-field"><label>Opponent / title</label><input type="text" name="etitle" placeholder="e.g. Miami United"></div></div>';
	echo '<div class="fppm-row">';
	echo '<div class="fppm-field" style="flex:0 1 150px;"><label>Repeats</label><select name="erecur"><option value="none">One-time</option><option value="weekly">Every week</option></select></div>';
	echo '<div class="fppm-field" style="flex:0 1 150px;"><label>Weekly day</label><select name="eweekday">';
	foreach ( fppm_weekdays() as $wi => $wn ) { echo '<option value="' . $wi . '" ' . selected( $wi, 6, false ) . '>' . esc_html( $wn ) . '</option>'; }
	echo '</select></div>';
	echo '<div class="fppm-field" style="flex:0 1 160px;"><label>Date (one-time)</label><input type="date" name="edate"></div>';
	echo '</div>';
	echo '<div class="fppm-row"><div class="fppm-field" style="flex:0 1 120px;"><label>Start</label><input type="time" name="etime"></div><div class="fppm-field" style="flex:0 1 120px;"><label>End</label><input type="time" name="eend"></div><div class="fppm-field"><label>Location</label><input type="text" name="eloc" placeholder="e.g. Dan McCarty Track"></div></div>';
	echo '<div class="fppm-field"><label>Coordinates (lat, lng) — optional, drops a map pin when there is no address</label><input type="text" name="ecoords" placeholder="27.4312, -80.3369"></div>';
	echo '<div class="fppm-field"><label>Notes</label><input type="text" name="enotes"></div>';
	echo '<button class="fppm-btn" type="submit">Add event</button></form>';

	$up    = fppm_events_upcoming();
	$types = fppm_event_types();
	if ( ! $up ) { echo '<p class="fppm-muted">No upcoming events yet.</p>'; }
	foreach ( $up as $e ) {
		$eid = (int) ( isset( $e['id'] ) ? $e['id'] : 0 );
		$c   = fppm_rsvp_counts( $e );
		echo '<div style="border-bottom:1px solid var(--fppm-line);padding:.6em 0;">';
		echo '<strong>' . esc_html( fppm_event_label( $e ) ) . '</strong> <span class="fppm-muted">' . esc_html( fppm_event_when( $e ) ) . ( ! empty( $e['location'] ) ? ' · ' . esc_html( $e['location'] ) : '' ) . '</span>';
		echo '<div style="margin:.3em 0;"><span class="fppm-badge fppm-badge--paid">' . $c['in'] . ' in</span> <span class="fppm-badge fppm-badge--gold">' . $c['maybe'] . ' maybe</span> <span class="fppm-badge">' . $c['out'] . ' out</span></div>';
		if ( ! empty( $e['rsvps'] ) ) {
			echo '<details class="fppm-det"><summary>who responded</summary><div style="font-size:.85rem;margin-top:.3em;">';
			foreach ( $e['rsvps'] as $ruid => $st ) { echo esc_html( fppm_display_name( $ruid ) ) . ' — ' . esc_html( $st ) . '<br>'; }
			echo '</div></details>';
		}
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" onsubmit="return confirm(\'Delete this event?\');" style="margin-top:.3em;">';
		echo '<input type="hidden" name="action" value="fppm_delete_event"><input type="hidden" name="id" value="' . $eid . '">';
		wp_nonce_field( 'fppm_delevent_' . $eid );
		echo '<button class="fppm-btn fppm-btn--ghost" style="padding:.2em .7em;font-size:.8rem;" type="submit">Delete</button></form>';
		echo '</div>';
	}
	echo '</div>';
	return ob_get_clean();
}

function fppm_next_event_public_html() {
	$e = fppm_event_next();
	if ( ! $e ) { return ''; }
	return '<div style="margin-top:.9rem;background:rgba(255,255,255,.14);border-radius:10px;padding:.6rem .8rem;font-size:.92rem;"><strong style="color:var(--fppm-gold);font-family:\'Oswald\',sans-serif;">Next up:</strong> ' . esc_html( fppm_event_label( $e ) ) . ' · ' . esc_html( fppm_event_when( $e ) ) . ( ! empty( $e['location'] ) ? ' · ' . esc_html( $e['location'] ) : '' ) . '</div>';
}

/* ============================================================
 * 10e. IN-PLUGIN STORE — PayPal Orders API (discounted) + Printful auto-fulfill
 *      Dormant until PayPal credentials are set. Defaults to PayPal sandbox.
 * ============================================================ */
function fppm_pp_env()       { return 'live' === get_option( 'fppm_pp_env', 'sandbox' ) ? 'live' : 'sandbox'; }
function fppm_pp_api_base()  { return 'live' === fppm_pp_env() ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }
function fppm_pp_client_id() { return trim( (string) get_option( 'fppm_pp_client_id', '' ) ); }
function fppm_pp_secret()    { return trim( (string) get_option( 'fppm_pp_secret', '' ) ); }
function fppm_printful_token() { return trim( (string) get_option( 'fppm_printful_token', '' ) ); }
function fppm_printful_store_id() { return trim( (string) get_option( 'fppm_printful_store_id', '' ) ); }
/* Auth headers for the Printful API. Account-level tokens can span several
 * stores, so Printful requires an X-PF-Store-Id header with them. */
function fppm_printful_headers() {
	$h = array( 'Authorization' => 'Bearer ' . fppm_printful_token() );
	if ( fppm_printful_store_id() ) { $h['X-PF-Store-Id'] = fppm_printful_store_id(); }
	return $h;
}
function fppm_store_ready()  { return fppm_pp_client_id() && fppm_pp_secret() && count( fppm_store_catalog() ); }
/* size => Printful sync_variant_id, from lines like "M:1234" (legacy tee-only field). */
function fppm_tee_variants() {
	$map = array();
	foreach ( preg_split( '/[\r\n,]+/', (string) get_option( 'fppm_tee_variants', '' ) ) as $line ) {
		$line = trim( $line );
		if ( '' === $line || false === strpos( $line, ':' ) ) { continue; }
		list( $sz, $id ) = array_map( 'trim', explode( ':', $line, 2 ) );
		if ( '' !== $sz && is_numeric( $id ) ) { $map[ strtoupper( $sz ) ] = (int) $id; }
	}
	return $map;
}
/* Full store catalog (all products). JSON in the fppm_store_catalog option:
 * [{"name":"Tee","variants":[{"label":"M","id":123,"price":25.00}, ...]}, ...]
 * Falls back to the legacy tee-variants field if the JSON is empty. */
function fppm_store_catalog() {
	$products = array();
	$data = json_decode( (string) get_option( 'fppm_store_catalog', '' ), true );
	if ( is_array( $data ) ) {
		foreach ( $data as $p ) {
			if ( empty( $p['name'] ) || empty( $p['variants'] ) || ! is_array( $p['variants'] ) ) { continue; }
			$vs = array();
			foreach ( $p['variants'] as $v ) {
				if ( empty( $v['id'] ) || ! isset( $v['price'] ) ) { continue; }
				$vs[] = array( 'label' => sanitize_text_field( isset( $v['label'] ) ? $v['label'] : '' ), 'id' => (int) $v['id'], 'price' => round( (float) $v['price'], 2 ), 'img' => ! empty( $v['img'] ) ? esc_url_raw( $v['img'] ) : '' );
			}
			if ( $vs ) { $products[] = array( 'name' => sanitize_text_field( $p['name'] ), 'img' => ! empty( $p['img'] ) ? esc_url_raw( $p['img'] ) : '', 'variants' => $vs ); }
		}
	}
	if ( ! $products ) {
		$tv = fppm_tee_variants();
		if ( $tv ) {
			$vs = array();
			foreach ( $tv as $sz => $id ) { $vs[] = array( 'label' => $sz, 'id' => $id, 'price' => fppm_price_tshirt() ); }
			$products[] = array( 'name' => 'Purple Martins T-Shirt', 'variants' => $vs );
		}
	}
	return $products;
}
/* Retail price for a variant id (null if it isn't in the catalog). */
function fppm_variant_price( $variant_id ) {
	$variant_id = (int) $variant_id;
	foreach ( fppm_store_catalog() as $p ) {
		foreach ( $p['variants'] as $v ) { if ( $v['id'] === $variant_id ) { return $v['price']; } }
	}
	return null;
}
/* Is this variant a tee/shirt product (so it counts toward "shirts sold")? */
function fppm_variant_is_shirt( $variant_id ) {
	$variant_id = (int) $variant_id;
	foreach ( fppm_store_catalog() as $p ) {
		foreach ( $p['variants'] as $v ) {
			if ( (int) $v['id'] === $variant_id ) { return (bool) preg_match( '/tee|shirt/i', $p['name'] ); }
		}
	}
	return false;
}
function fppm_member_discount_pct( $uid ) {
	$code = get_user_meta( $uid, 'fppm_coupon', true );
	return ( $code && 'fan' !== fppm_type_of( $uid ) ) ? fppm_coupon_percent() : 0;
}

/* ---- PayPal Orders API ---- */
function fppm_pp_access_token() {
	$key = 'fppm_pp_tok_' . fppm_pp_env();
	$c   = get_transient( $key );
	if ( $c ) { return $c; }
	$r = wp_remote_post( fppm_pp_api_base() . '/v1/oauth2/token', array(
		'timeout' => 20,
		'headers' => array(
			'Authorization' => 'Basic ' . base64_encode( fppm_pp_client_id() . ':' . fppm_pp_secret() ),
			'Content-Type'  => 'application/x-www-form-urlencoded',
		),
		'body' => 'grant_type=client_credentials',
	) );
	if ( is_wp_error( $r ) ) { return $r; }
	$b = json_decode( wp_remote_retrieve_body( $r ), true );
	if ( empty( $b['access_token'] ) ) { return new WP_Error( 'pp_auth', 'PayPal authentication failed (check Client ID/Secret + environment).' ); }
	set_transient( $key, $b['access_token'], max( 60, (int) ( isset( $b['expires_in'] ) ? $b['expires_in'] : 3000 ) - 120 ) );
	return $b['access_token'];
}
function fppm_pp_create_order( $amount, $desc ) {
	$tok = fppm_pp_access_token();
	if ( is_wp_error( $tok ) ) { return $tok; }
	$r = wp_remote_post( fppm_pp_api_base() . '/v2/checkout/orders', array(
		'timeout' => 25,
		'headers' => array( 'Authorization' => 'Bearer ' . $tok, 'Content-Type' => 'application/json' ),
		'body'    => wp_json_encode( array(
			'intent'         => 'CAPTURE',
			'purchase_units' => array( array(
				'amount'      => array( 'currency_code' => 'USD', 'value' => number_format( (float) $amount, 2, '.', '' ) ),
				'description' => substr( (string) $desc, 0, 120 ),
			) ),
		) ),
	) );
	if ( is_wp_error( $r ) ) { return $r; }
	$b = json_decode( wp_remote_retrieve_body( $r ), true );
	if ( empty( $b['id'] ) ) { return new WP_Error( 'pp_create', 'Could not start PayPal checkout.' ); }
	return $b['id'];
}
function fppm_pp_capture_order( $id ) {
	$tok = fppm_pp_access_token();
	if ( is_wp_error( $tok ) ) { return $tok; }
	$r = wp_remote_post( fppm_pp_api_base() . '/v2/checkout/orders/' . rawurlencode( $id ) . '/capture', array(
		'timeout' => 25,
		'headers' => array( 'Authorization' => 'Bearer ' . $tok, 'Content-Type' => 'application/json' ),
		'body'    => '{}',
	) );
	if ( is_wp_error( $r ) ) { return $r; }
	$b = json_decode( wp_remote_retrieve_body( $r ), true );
	if ( ! isset( $b['status'] ) || 'COMPLETED' !== $b['status'] ) { return new WP_Error( 'pp_capture', 'Payment was not completed.' ); }
	return $b;
}

/* ---- Printful Orders API ---- */
function fppm_printful_create_order( $uid, $variant_id ) {
	$tok = fppm_printful_token();
	if ( ! $tok ) { return new WP_Error( 'pf', 'No Printful API token set.' ); }
	$u    = get_userdata( $uid );
	$body = array(
		'recipient' => array(
			'name'         => fppm_display_name( $uid ),
			'address1'     => get_user_meta( $uid, 'fppm_address', true ),
			'city'         => get_user_meta( $uid, 'fppm_city', true ),
			'state_code'   => strtoupper( (string) get_user_meta( $uid, 'fppm_state', true ) ),
			'country_code' => 'US',
			'zip'          => get_user_meta( $uid, 'fppm_zip', true ),
			'email'        => $u ? $u->user_email : '',
		),
		'items' => array( array( 'sync_variant_id' => (int) $variant_id, 'quantity' => 1 ) ),
	);
	$confirm = get_option( 'fppm_printful_confirm', '0' ) === '1';
	$r = wp_remote_post( 'https://api.printful.com/orders' . ( $confirm ? '?confirm=1' : '' ), array(
		'timeout' => 30,
		'headers' => array_merge( fppm_printful_headers(), array( 'Content-Type' => 'application/json' ) ),
		'body'    => wp_json_encode( $body ),
	) );
	if ( is_wp_error( $r ) ) { return $r; }
	$code = wp_remote_retrieve_response_code( $r );
	$b    = json_decode( wp_remote_retrieve_body( $r ), true );
	if ( $code < 200 || $code >= 300 ) { return new WP_Error( 'pf', isset( $b['error']['message'] ) ? $b['error']['message'] : ( 'Printful HTTP ' . $code ) ); }
	return isset( $b['result'] ) ? $b['result'] : $b;
}

/* ---- checkout AJAX (logged-in members) ---- */
add_action( 'wp_ajax_fppm_shop_create', 'fppm_ajax_shop_create' );
function fppm_ajax_shop_create() {
	if ( ! is_user_logged_in() ) { wp_send_json_error( 'Please sign in.' ); }
	check_ajax_referer( 'fppm_shop' );
	$uid = get_current_user_id();
	$vid = isset( $_POST['variant'] ) ? (int) $_POST['variant'] : 0;
	$base = fppm_variant_price( $vid );
	if ( null === $base ) { wp_send_json_error( 'That item is unavailable.' ); }
	$amount = round( $base * ( 1 - fppm_member_discount_pct( $uid ) / 100 ), 2 );
	$order  = fppm_pp_create_order( $amount, 'Purple Martins merch' );
	if ( is_wp_error( $order ) ) { wp_send_json_error( $order->get_error_message() ); }
	set_transient( 'fppm_ord_' . $order, array( 'uid' => $uid, 'variant' => $vid, 'amount' => $amount ), HOUR_IN_SECONDS );
	wp_send_json_success( array( 'id' => $order ) );
}
add_action( 'wp_ajax_fppm_shop_capture', 'fppm_ajax_shop_capture' );
function fppm_ajax_shop_capture() {
	if ( ! is_user_logged_in() ) { wp_send_json_error( 'Please sign in.' ); }
	check_ajax_referer( 'fppm_shop' );
	$uid = get_current_user_id();
	$oid = isset( $_POST['order_id'] ) ? sanitize_text_field( wp_unslash( $_POST['order_id'] ) ) : '';
	$pending = get_transient( 'fppm_ord_' . $oid );
	if ( ! is_array( $pending ) || (int) $pending['uid'] !== $uid ) { wp_send_json_error( 'Order not found — please retry.' ); }
	$cap = fppm_pp_capture_order( $oid );
	if ( is_wp_error( $cap ) ) { wp_send_json_error( $cap->get_error_message() ); }
	delete_transient( 'fppm_ord_' . $oid );
	$pf  = fppm_printful_create_order( $uid, (int) $pending['variant'] );
	$log = get_user_meta( $uid, 'fppm_orders', true );
	if ( ! is_array( $log ) ) { $log = array(); }
	$log[] = array(
		'at'       => current_time( 'mysql' ),
		'variant'  => (int) $pending['variant'],
		'amount'   => $pending['amount'],
		'paypal'   => $oid,
		'printful' => is_wp_error( $pf ) ? ( 'ERROR: ' . $pf->get_error_message() ) : ( isset( $pf['id'] ) ? $pf['id'] : 'created' ),
	);
	update_user_meta( $uid, 'fppm_orders', $log );
	// Count a real tee/shirt sale toward the ticker (payment already captured above).
	if ( fppm_variant_is_shirt( (int) $pending['variant'] ) ) {
		update_option( 'fppm_store_shirts_sold', (int) get_option( 'fppm_store_shirts_sold', 0 ) + 1 );
	}
	if ( is_wp_error( $pf ) ) {
		wp_mail( fppm_notify_email(), '[FPPM] Printful fulfillment failed', 'Member ' . fppm_display_name( $uid ) . " paid (PayPal $oid) but the Printful order failed: " . $pf->get_error_message() . '. Fulfill it manually.' );
	}
	wp_send_json_success( array( 'msg' => 'Order placed — thanks! Ships to your address on file.' ) );
}

/* ---- in-plugin store UI: full catalog, discounted, PayPal per product ---- */
function fppm_store_html() {
	$uid = get_current_user_id();
	$pct = fppm_member_discount_pct( $uid );
	$cat = fppm_store_catalog();
	$nonce = wp_create_nonce( 'fppm_shop' );
	$sdk = 'https://www.paypal.com/sdk/js?client-id=' . rawurlencode( fppm_pp_client_id() ) . '&currency=USD&intent=capture';
	ob_start();
	echo '<div class="fppm-card"><h3>Team store</h3>';
	if ( $pct > 0 ) { echo '<p class="fppm-muted">Your <strong>' . esc_html( number_format( $pct, 0 ) ) . '% ' . esc_html( fppm_collective() ) . ' discount</strong> is applied automatically at checkout.</p>'; }
	echo '<div class="fppm-apparel">';
	$i = 0;
	foreach ( $cat as $p ) {
		$i++;
		$pimg = ! empty( $p['img'] ) ? $p['img'] : '';
		echo '<div class="fppm-appcard">';
		if ( $pimg ) {
			echo '<img id="fppm-img-' . $i . '" src="' . esc_url( $pimg ) . '" alt="' . esc_attr( $p['name'] ) . '" loading="lazy" style="display:block;height:130px;width:auto;max-width:100%;object-fit:contain;margin:0 auto .5em;border-radius:6px;">';
		}
		echo '<b>' . esc_html( $p['name'] ) . '</b>';
		echo '<select id="fppm-v-' . $i . '" style="width:100%;padding:.5em;border:1px solid var(--fppm-line);border-radius:6px;margin:.5em 0;">';
		foreach ( $p['variants'] as $v ) {
			$disc = round( $v['price'] * ( 1 - $pct / 100 ), 2 );
			$lab  = ( '' !== $v['label'] ? $v['label'] : 'Option' ) . ' — $' . number_format( $disc, 2 );
			$vimg = ! empty( $v['img'] ) ? $v['img'] : '';
			echo '<option value="' . esc_attr( $v['id'] ) . '" data-img="' . esc_url( $vimg ) . '">' . esc_html( $lab ) . '</option>';
		}
		echo '</select><div id="fppm-pp-' . $i . '"></div></div>';
	}
	echo '</div><div id="fppm-pp-msg" class="fppm-muted" style="font-size:.85rem;margin-top:.5em;"></div>';
	echo '<p class="fppm-muted" style="margin-top:.4em;">Ships on-demand via Printful to your address on file.</p></div>';
	echo '<script>var fppmAjax="' . esc_js( admin_url( 'admin-ajax.php' ) ) . '",fppmShopNonce="' . esc_js( $nonce ) . '",fppmN=' . (int) $i . ';</script>';
	echo '<script src="' . esc_url( $sdk ) . '"></script>';
	?>
<script>
(function(){
  function post(a,e){var b=new URLSearchParams(Object.assign({action:a,_ajax_nonce:fppmShopNonce},e));return fetch(fppmAjax,{method:"POST",credentials:"same-origin",body:b}).then(function(r){return r.json();});}
  function wire(i){
    var sel=document.getElementById("fppm-v-"+i),cont=document.getElementById("fppm-pp-"+i),msg=document.getElementById("fppm-pp-msg"),img=document.getElementById("fppm-img-"+i);
    if(!sel||!cont)return;
    if(img){sel.addEventListener("change",function(){var o=sel.options[sel.selectedIndex],u=o&&o.getAttribute("data-img");if(u){img.src=u;}});}
    paypal.Buttons({
      style:{color:"gold",shape:"pill",label:"pay",tagline:false},
      createOrder:function(){return post("fppm_shop_create",{variant:sel.value}).then(function(d){if(!d.success)throw new Error(d.data);return d.data.id;});},
      onApprove:function(data){msg.textContent="Finishing…";return post("fppm_shop_capture",{order_id:data.orderID}).then(function(d){msg.textContent=d.success?d.data.msg:("Error: "+d.data);});},
      onError:function(){msg.textContent="Payment error — please try again.";}
    }).render(cont);
  }
  var t=setInterval(function(){if(window.paypal){clearInterval(t);for(var i=1;i<=fppmN;i++){wire(i);}}},200);
})();
</script>
	<?php
	return ob_get_clean();
}

/* ============================================================
 * 11. PWA — installable app: manifest, service worker, meta, install pill
 * ============================================================ */
function fppm_asset_url( $file ) { return plugins_url( 'assets/' . $file, __FILE__ ); }
function fppm_pwa_start_url() { return home_url( '/account/' ); }
function fppm_pwa_manifest_url() { return home_url( '/?fppm_pwa=manifest' ); }
function fppm_pwa_sw_url() { return home_url( '/?fppm_pwa=sw' ); }
function fppm_theme_color() { return '#5E17EB'; }

/* Serve the manifest + service worker from lightweight query endpoints. */
add_action( 'init', 'fppm_pwa_serve' );
function fppm_pwa_serve() {
	if ( empty( $_GET['fppm_pwa'] ) ) { return; }
	$what = sanitize_key( wp_unslash( $_GET['fppm_pwa'] ) );

	if ( 'manifest' === $what ) {
		nocache_headers();
		header( 'Content-Type: application/manifest+json; charset=utf-8' );
		$manifest = array(
			'name'             => fppm_team_name(),
			'short_name'       => 'Purple Martins',
			'description'      => 'Roster, dues, apparel and updates for the ' . fppm_team_name() . '.',
			'id'               => '/',
			'start_url'        => fppm_pwa_start_url(),
			'scope'            => home_url( '/' ),
			'display'          => 'standalone',
			'orientation'      => 'portrait',
			'background_color' => '#111111',
			'theme_color'      => fppm_theme_color(),
			'icons'            => array(
				array( 'src' => fppm_asset_url( 'icon-192.png' ), 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any' ),
				array( 'src' => fppm_asset_url( 'icon-512.png' ), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any' ),
				array( 'src' => fppm_asset_url( 'icon-maskable-512.png' ), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable' ),
			),
		);
		echo wp_json_encode( $manifest );
		exit;
	}

	if ( 'sw' === $what ) {
		nocache_headers();
		header( 'Content-Type: application/javascript; charset=utf-8' );
		header( 'Service-Worker-Allowed: /' );
		$ver   = FPPM_VER;
		$start = esc_js( fppm_pwa_start_url() );
		echo "/* FPPM service worker */\n";
		echo "const FPPM_CACHE = 'fppm-v{$ver}';\n";
		echo "const FPPM_START = '{$start}';\n";
		?>
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
	e.waitUntil(
		caches.keys().then(function (keys) {
			return Promise.all(keys.filter(function (k) { return k !== FPPM_CACHE; }).map(function (k) { return caches.delete(k); }));
		}).then(function () { return self.clients.claim(); })
	);
});
/* Stale-while-revalidate for same-origin GETs; offline falls back to cache. */
self.addEventListener('fetch', function (e) {
	var req = e.request;
	if (req.method !== 'GET') { return; }
	var url = new URL(req.url);
	if (url.origin !== self.location.origin) { return; }
	e.respondWith(
		caches.open(FPPM_CACHE).then(function (cache) {
			return cache.match(req).then(function (hit) {
				var net = fetch(req).then(function (resp) {
					if (resp && resp.status === 200 && resp.type === 'basic') { cache.put(req, resp.clone()); }
					return resp;
				}).catch(function () { return hit || cache.match(FPPM_START); });
				return hit || net;
			});
		})
	);
});
		<?php
		exit;
	}
}

/* Head: manifest link, theme colour, apple touch icon + web-app meta. */
add_action( 'wp_head', 'fppm_pwa_head', 5 );
function fppm_pwa_head() {
	echo "\n<!-- FPPM PWA -->\n";
	echo '<link rel="manifest" href="' . esc_url( fppm_pwa_manifest_url() ) . '">' . "\n";
	echo '<meta name="theme-color" content="' . esc_attr( fppm_theme_color() ) . '">' . "\n";
	echo '<meta name="apple-mobile-web-app-capable" content="yes">' . "\n";
	echo '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' . "\n";
	echo '<meta name="apple-mobile-web-app-title" content="Purple Martins">' . "\n";
	echo '<link rel="apple-touch-icon" href="' . esc_url( fppm_asset_url( 'apple-touch-180.png' ) ) . '">' . "\n";
	echo '<link rel="icon" type="image/png" sizes="32x32" href="' . esc_url( fppm_asset_url( 'favicon-32.png' ) ) . '">' . "\n";
}

/* Footer: register the service worker + a slide-in "Install app" pill. */
add_action( 'wp_footer', 'fppm_pwa_footer' );
function fppm_pwa_footer() {
	if ( is_admin() ) { return; }
	$sw   = esc_url( fppm_pwa_sw_url() );
	$icon = esc_url( fppm_asset_url( 'icon-192.png' ) );
	?>
<style>
#fppm-install{position:fixed;right:16px;bottom:16px;z-index:99999;display:none;align-items:center;gap:.55em;background:#5E17EB;color:#fff;border:0;border-radius:999px;padding:.6em 1.1em .6em .6em;font:600 15px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 6px 20px rgba(42,10,107,.4);cursor:pointer;}
#fppm-install img{width:30px;height:30px;border-radius:8px;}
#fppm-install:hover{background:#3A0E94;}
#fppm-install b{font-weight:800;}
</style>
<button id="fppm-install" type="button" aria-label="Install the Purple Martins app"><img src="<?php echo $icon; ?>" alt=""><span>Install <b>Purple Martins</b> app</span></button>
<script>
(function(){
	if('serviceWorker' in navigator){
		window.addEventListener('load',function(){ navigator.serviceWorker.register('<?php echo $sw; ?>',{scope:'/'}).catch(function(){}); });
	}
	/* The captured prompt is shared on window.fppmA2HS so the dashboard "Get the app" card can use it too. */
	var btn=document.getElementById('fppm-install');
	window.addEventListener('beforeinstallprompt',function(e){ e.preventDefault(); window.fppmA2HS=e; if(btn){btn.style.display='inline-flex';} });
	if(btn){
		btn.addEventListener('click',function(){ var p=window.fppmA2HS; if(!p)return; window.fppmA2HS=null; p.prompt(); p.userChoice.finally(function(){ btn.style.display='none'; }); });
	}
	window.addEventListener('appinstalled',function(){ if(btn){btn.style.display='none';} });
})();
</script>
	<?php
}
