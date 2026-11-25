<?php
/**
 * Plugin Name:       GFF Customer Registration
 * Plugin URI:        https://martingawlakcompany.com/gawlakfamilyfarms
 * Description:        Gawlak Family Farms customer signup for The Zora Sunrise Module™. v3.1.0 introduces modular shortcodes ([gff_form_start], [gff_zora_display], [gff_pitch], [gff_crops], [gff_details], [gff_address], [gff_start_date], [gff_login], [gff_agreement], [gff_consult], [gff_submit], [gff_form_end]) so pages can be built block-by-block in any order. Includes a standalone [gff_lead_capture] mode and the legacy [gff_registration] all-in-one (deprecated but functional).
 * Version:           3.37.0
 * Author:            Martin Gawlak Company
 * License:           GPL-2.0-or-later
 * Text Domain:       gff-registration
 *
 * SECURITY / DESIGN NOTES:
 *  - Account creation uses WordPress's own wp_insert_user(); passwords are typed by the
 *    customer and hashed natively by WP. The plugin never sees or stores plaintext passwords.
 *  - Nonce-protected, all input sanitized, all output escaped, honeypot spam trap included.
 *  - New users get the 'gff_customer' role (full enrollment) or 'gff_lead' role (lead capture).
 *  - No data leaves your site.
 *  - Modular shortcodes share state via a single page-level <form> wrapper. The submission
 *    handler is tolerant of missing sections — if a shortcode isn't present, that data isn't
 *    collected (but required fields still validate against $_POST after submit).
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

/* ============================================================
 * 1. ACTIVATION — customer + lead roles
 * ============================================================ */
register_activation_hook( __FILE__, 'gff_reg_activate' );
function gff_reg_activate() {
	add_role( 'gff_customer', 'GFF Customer', array( 'read' => true ) );
	add_role( 'gff_lead',     'GFF Lead',     array( 'read' => true ) );
}

/* ============================================================
 * 2. CROP CHECKLIST DATA (matches the printed flyer)
 * ============================================================ */
function gff_reg_crops() {
	return array(
		'Edibles' => array(
			'Tomatoes','Cherry tomatoes','Everglades tomato','Peppers','Hot peppers',
			'Lettuce & greens','Broccoli','Cauliflower','Cabbage','Kale','Collards',
			'Swiss chard','Mustard greens','Spinach','Longevity spinach','Bok choy',
			'Carrots','Beets','Radish','Onions','Green onions','Peas','Bush beans',
			'Pole beans','Southern peas','Pigeon pea','Squash & zucchini','Cucumbers',
			'Watermelon','Cantaloupe','Okra','Sweet potato','Seminole pumpkin','Strawberries',
		),
		'Flowers' => array(
			'Sweet pea','Snapdragon','Bachelor\'s button','Nasturtium','Pansy / viola',
			'Zinnia','Sunflower','Cosmos','Marigold','Celosia','Portulaca','Vinca',
			'Morning glory','Coreopsis',
		),
		'Herbs' => array(
			'Cilantro','Dill','Parsley','Fennel','Basil','Lemongrass','Ginger / turmeric',
			'Rosemary','Oregano','Mint','Thyme',
		),
		'Trees & Shrubs' => array(
			'Cranberry hibiscus','Moringa',
		),
	);
}

/* ============================================================
 * 3. SERVICE AGREEMENT (single source of truth)
 * ============================================================ */
function gff_reg_agreement_version() { return '6.0 (2026-07)'; }

function gff_reg_agreement_sections() {
	return array(
		array(
			'title' => '1. Services Provided',
			'body'  => 'Provider agrees to design, install, and maintain a permaculture-based food and flower garden system on the Customer\'s property (the "System"), known as The Zora Sunrise Module™. Services include site assessment, custom system design, installation, planting, soil biology, mulching, and ongoing maintenance visits as scheduled.',
		),
		array(
			'title' => '2. Pricing & Monthly Service',
			'body'  => 'Monthly service is $300 per month, flat, for either offer or both. The fee covers design, installation, planting, materials, soil biology, maintenance, seasonal replanting, and system management, including maintenance of any additional Spires added under the Propagation Program at no additional charge. For The Zora Sunrise Module™, Provider will install the largest module the property reasonably allows up to 1,500 sq ft; module size does not affect price. Gawlak Family Farms guarantees a minimum of $300 per month in food harvest value once the system reaches steady production (typically by month 3), calculated using current Treasure Coast farmers market retail prices. Harvest value is measured by what the system produces, not by what the Customer harvests; produce left unharvested counts toward the guarantee. Monthly fees are due on the 1st. THE MONTHLY FEE WILL NOT INCREASE FOR THE DURATION OF CONTINUOUS SERVICE. No rate-lock election is required; this is a term of this Agreement.',
		),
		array(
			'title' => '3. Land Access, License to Tend & Right to Harvest',
			'body'  => '(a) Grant of License. Customer, as owner or lawful possessor of the Property at the Service Address, grants Gawlak Family Farms a non-exclusive, revocable license to enter, access, and use the designated Garden Area solely to design, install, maintain, and harvest from the System. This license creates no leasehold, easement, or other real-property interest. '
				. '(b) Scope of Access. Access is limited to the Garden Area and reasonable pathways to reach it, during reasonable hours and with reasonable notice, except for emergency maintenance to protect the System or Property. '
				. '(c) No Trespass; Indemnification. Execution of this Agreement constitutes consent to the access described and waives any trespass claim arising from authorized entry. Each party indemnifies the other as set out in the full Agreement. '
				. '(d) Termination of License. The license terminates automatically upon expiration or termination of the Agreement, at which point Provider\'s access rights immediately cease.',
		),
		array(
			'title' => '4. Term & Changes',
			'body'  => 'This enrollment begins on the agreed Start Date and continues month-to-month unless a fixed term is agreed in writing. Either party may end the arrangement with 30 days written notice. This online enrollment records the Customer\'s acceptance; the full executed Service Agreement governs the relationship.',
		),
		array(
			'title' => '5. Getting Started — Design Consult & Starter Cost',
			'body'  => 'The total starter cost is $772, covering the professional consultation, custom design, build, installation, the Customer\'s first month of service, complimentary herb sections, enrollment in the Propagation Program, and one apparel item. (a) DESIGN CONSULT — $250. Payable at enrollment via PayPal. Provider attends the Property to assess light, water, drainage, and constraints; stakes or marks the footprint; photographs the site; and works with the Customer to determine planting preferences. The $250 is NON-REFUNDABLE but is CREDITED IN FULL toward the Customer\'s design, build, and install. An on-site design consult is available only with this payment. If Provider determines the Property is not suitable, or the Customer elects not to proceed, the Customer retains the design and the $250 is retained by Provider as compensation for the assessment and design work performed. (b) BALANCE — $522, due at install. (c) The starter cost includes the Customer\'s first month of service. The system requires approximately one month to reach initial production; the Customer does not pay a monthly fee for that period. Monthly billing begins in month two.',
		),
	);
}

/* ============================================================
 * 4. PAYPAL CONFIGURATION
 * ============================================================ */
function gff_reg_paypal_link() {
	if ( defined( 'GFF_PAYPAL_LINK' ) && '' !== GFF_PAYPAL_LINK ) {
		return esc_url_raw( GFF_PAYPAL_LINK );
	}
	$opt = get_option( 'gff_reg_paypal_link', '' );
	if ( $opt ) { return esc_url_raw( $opt ); }
	return 'https://www.paypal.com/ncp/payment/YBGEYKG9KCFWC';
}

function gff_reg_paypal_payment_url( $amount = '100' ) {
	$base = gff_reg_paypal_link();
	// Only PayPal.Me URLs support the /amount suffix. PayPal.biz Business Profile URLs
	// don't accept it, and PayPal NCP (No-Code Payment) URLs already have the amount baked in.
	if ( false !== stripos( $base, 'paypal.me' ) ) {
		return rtrim( $base, '/' ) . '/' . rawurlencode( $amount );
	}
	return $base;
}

function gff_reg_consult_amount() { return '250.00'; } // design consult, credited in full toward the $772 starter

/* Per-option reservation pricing + fixed PayPal NCP links. Single source of
 * truth so handlers, success pages, and invoices all agree. Each NCP link is a
 * fixed-amount button created in PayPal (amount baked in at creation):
 *   consult       → $250
 *   down_payment  → $100
 *   workshop      → $120
 *   none          → $0, no link
 * Returns array( 'amount' => '250.00', 'url' => 'https://...', 'label' => '...' ). */
function gff_reg_reservation_meta( $option ) {
	switch ( $option ) {
		case 'consult':
			return array( 'amount' => '250.00', 'url' => 'https://www.paypal.com/ncp/payment/XJYNQSNDSDE5S', 'label' => '$250 Design Consult' );
		case 'down_payment': // LEGACY (pre-v6.0). Retained so existing records still resolve; not offered to new customers.
			return array( 'amount' => '100.00', 'url' => gff_reg_paypal_link(), 'label' => '$100 Down Payment + 48hr (legacy)' );
		case 'workshop': // LEGACY (pre-v6.0). Workshop now lives on its own page.
			return array( 'amount' => '120.00', 'url' => 'https://www.paypal.com/ncp/payment/9Z672HWTB8KM4', 'label' => 'Monthly Workshop ($120) (legacy)' );
		case 'none':
		default:
			return array( 'amount' => '0.00', 'url' => '', 'label' => 'No upfront payment' );
	}
}

/* ============================================================
 * 5. ASSETS
 * ============================================================ */
add_action( 'wp_enqueue_scripts', 'gff_reg_register_assets' );
function gff_reg_register_assets() {
	wp_register_style( 'gff-reg', false );
	wp_enqueue_style( 'gff-reg' );
	wp_add_inline_style( 'gff-reg', gff_reg_css() );
	wp_enqueue_style( 'gff-fonts', 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Oswald:wght@500;600;700&display=swap', array(), null );
	wp_add_inline_style( 'gff-reg', gff_reg_font_overrides() );

	wp_register_script( 'gff-reg-validation', '', array(), '3.1.0', true );
	wp_enqueue_script( 'gff-reg-validation' );
	wp_add_inline_script( 'gff-reg-validation', gff_reg_validation_js() );
}

/* Brand type system: Oswald for titles/headings, Lato for body/paragraphs/urls. */
function gff_reg_font_overrides() {
	return "
	.gff-reg__brand,.gff-reg__banner,.gff-cl-head,.gff-price__big,.gff-price__est,
	.gff-tl__lead,.gff-tl__what,.gff-tl__steps-label,
	.gff-myfarm h1,.gff-myfarm h2,.gff-myfarm h3,.gff-myfarm h4,
	.gff-acct h1,.gff-acct h2,.gff-acct h3,.gff-acct h4,
	.gff-dash h1,.gff-dash h2,.gff-dash h3,.gff-dash h4,
	.gff-reg h1,.gff-reg h2,.gff-reg h3,.gff-reg h4,.gff-reg legend,
	.gff-spire-count__head,.gff-spire-count__lead strong,.gff-spire-readout__total,
	.gff-spire-readout__big,.gff-spire-readout__mid,.gff-spire-email__head,
	.gff-convince>summary,.gff-bounty summary{font-family:'Oswald',sans-serif !important;letter-spacing:.02em;}
	";
}

/* ---- Paid-confirmation conversion ----
 * PayPal's payment link redirects back to the homepage with ?gff_paid=1 after a
 * completed payment. Because that parameter is only ever appended by PayPal's
 * post-payment redirect, its presence indicates a real payment. We fire a Purchase
 * event (value 100) into the existing pixel, once per browser session (sessionStorage
 * guard prevents a refresh from double-counting). PixelYourSite owns pixel init; we
 * only call fbq once it's ready.
 * NOTE: This under-counts slightly (anyone who closes the PayPal tab before redirect
 * is missed) and is NOT a payment ledger — the PayPal inbox remains the source of truth.
 */
add_action( 'wp_footer', 'gff_reg_paid_conversion' );
function gff_reg_paid_conversion() {
	// Only proceed if the paid marker is present in the URL.
	if ( ! isset( $_GET['gff_paid'] ) || '1' !== $_GET['gff_paid'] ) {
		return;
	}
	$pixel_id = '408144794862479'; // MGC Pixel
	?>
	<script>(function(){
		try{
			if(sessionStorage.getItem("gffPaidFired")==="1"){return;}
		}catch(e){}
		var fired=false;
		function markFired(){if(!fired){fired=true;try{sessionStorage.setItem("gffPaidFired","1");}catch(e){}}}
		var tries=0;
		function fire(){
			if(typeof fbq!=="function"){if(tries++<40){return setTimeout(fire,150);}return;}
			try{
				fbq("track","Purchase",{value:100,currency:"USD",content_name:"Zora Sunrise Module Reservation Payment"});
				markFired();
			}catch(e){}
		}
		fire();
		// GA4 parallel (gtag is independent of fbq / PixelYourSite).
		try{
			if(typeof gtag==="function"){
				gtag("event","purchase",{value:100,currency:"USD",transaction_id:"gff-"+Date.now()});
				markFired();
			}
		}catch(e){}
	})();</script>
	<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=<?php echo esc_attr( $pixel_id ); ?>&ev=Purchase&noscript=1"/></noscript>
	<?php
}


/* ============================================================
 * 6. MODULAR SHORTCODES
 * ============================================================ */
global $gff_reg_state;
$gff_reg_state = array(
	'form_open' => false,
	'notice'    => '',
	'repop'     => false,   // true only when a submit failed and we should refill fields
	'old'       => array(), // sanitized values from the failed submit
);

/* ---- handle submission once per request, BEFORE any shortcode renders ---- */
add_action( 'wp', 'gff_reg_maybe_handle_submit' );
function gff_reg_maybe_handle_submit() {
	global $gff_reg_state;
	if ( isset( $_POST['gff_reg_submit'] ) ) {
		$gff_reg_state['notice'] = gff_reg_handle_submit( 'full' );
	} elseif ( isset( $_POST['gff_lead_submit'] ) ) {
		$gff_reg_state['notice'] = gff_reg_handle_submit( 'lead' );
	} elseif ( isset( $_POST['gff_express_submit'] ) ) {
		$gff_reg_state['notice'] = gff_reg_handle_express();
	} elseif ( isset( $_POST['gff_tower_submit'] ) ) {
		$gff_reg_state['notice'] = gff_reg_handle_tower();
	}
}

/* ---- repopulation helpers: refill the form after a failed submit (never passwords) ---- */
// Marks the form to repopulate and stashes the submitted values. Called from the submit
// handler the moment validation fails, so first-load renders stay blank.
function gff_reg_flag_repop() {
	global $gff_reg_state;
	$gff_reg_state['repop'] = true;
	$keys = array(
		'gff_first', 'gff_last', 'gff_email', 'gff_phone',
		'gff_address', 'gff_city', 'gff_zip', 'gff_start_date',
		'gff_sqft', 'gff_reservation',
	);
	foreach ( $keys as $k ) {
		$gff_reg_state['old'][ $k ] = isset( $_POST[ $k ] ) ? sanitize_text_field( wp_unslash( $_POST[ $k ] ) ) : '';
	}
	$gff_reg_state['old']['gff_crops']    = ( isset( $_POST['gff_crops'] ) && is_array( $_POST['gff_crops'] ) )
		? array_map( 'sanitize_text_field', wp_unslash( $_POST['gff_crops'] ) ) : array();
	$gff_reg_state['old']['gff_addons']   = ( isset( $_POST['gff_addons'] ) && is_array( $_POST['gff_addons'] ) )
		? array_map( 'sanitize_key', wp_unslash( $_POST['gff_addons'] ) ) : array();
	$gff_reg_state['old']['gff_ratelock'] = isset( $_POST['gff_ratelock'] ) ? 'yes' : '';
	$gff_reg_state['old']['gff_three_sisters_optin'] = isset( $_POST['gff_three_sisters_optin'] ) ? 'yes' : '';
	$gff_reg_state['old']['gff_agree']    = isset( $_POST['gff_agree'] ) ? 'yes' : '';
	$gff_reg_state['old']['gff_express_email'] = isset( $_POST['gff_email'] ) ? sanitize_text_field( wp_unslash( $_POST['gff_email'] ) ) : '';
	$gff_reg_state['old']['gff_tower_email'] = isset( $_POST['gff_email'] ) ? sanitize_text_field( wp_unslash( $_POST['gff_email'] ) ) : '';
	$gff_reg_state['old']['gff_tower_qty'] = isset( $_POST['gff_tower_qty'] ) ? (int) $_POST['gff_tower_qty'] : '';
}

// Echoes value="..." for a text-type field if we're repopulating.
function gff_reg_old_val( $key ) {
	global $gff_reg_state;
	if ( empty( $gff_reg_state['repop'] ) ) { return ''; }
	$v = isset( $gff_reg_state['old'][ $key ] ) ? $gff_reg_state['old'][ $key ] : '';
	if ( '' === $v ) { return ''; }
	return ' value="' . esc_attr( $v ) . '"';
}

// Echoes checked for a checkbox/radio if it was selected in the failed submit.
function gff_reg_old_checked( $key, $match = 'yes' ) {
	global $gff_reg_state;
	if ( empty( $gff_reg_state['repop'] ) ) { return ''; }
	$v = isset( $gff_reg_state['old'][ $key ] ) ? $gff_reg_state['old'][ $key ] : '';
	if ( is_array( $v ) ) { return in_array( $match, $v, true ) ? ' checked' : ''; }
	return ( (string) $v === (string) $match ) ? ' checked' : '';
}

/* ---- [gff_form_start] ---- */
add_shortcode( 'gff_form_start', 'gff_sc_form_start' );
function gff_sc_form_start( $atts = array() ) {
	global $gff_reg_state;
	if ( $gff_reg_state['form_open'] ) { return ''; }
	$gff_reg_state['form_open'] = true;
	ob_start();
	?>
	<div class="gff-reg">
		<form class="gff-reg__form" method="post" novalidate id="gff-reg-form">
			<?php wp_nonce_field( 'gff_reg_action', 'gff_reg_nonce' ); ?>
			<input type="hidden" name="gff_offer" id="gff_offer_field" value="">
			<div class="gff-hp" aria-hidden="true">
				<label>Company URL <input type="text" name="gff_company_url" tabindex="-1" autocomplete="off"></label>
			</div>
	<?php
	return ob_get_clean();
}

/* ---- [gff_form_end] ---- */
add_shortcode( 'gff_form_end', 'gff_sc_form_end' );
function gff_sc_form_end( $atts = array() ) {
	global $gff_reg_state;
	if ( ! $gff_reg_state['form_open'] ) { return ''; }
	$gff_reg_state['form_open'] = false;
	ob_start();
	echo $gff_reg_state['notice'];
	?>
		</form>
	</div>
	<?php
	return ob_get_clean();
}

/* ---- [gff_zora_display] ---- */
add_shortcode( 'gff_zora_display', 'gff_sc_zora_display' );
function gff_sc_zora_display( $atts = array() ) {
	ob_start(); ?>
	<section class="gff-zora-display">
		<div>
			<header class="gff-zora-display__head">
				<h2 class="gff-zora-display__title">The Zora Sunrise Module<sup>&trade;</sup></h2>
				<p class="gff-zora-display__sub">A complete food forest, installed on your property.</p>
			</header>
			<div class="gff-zora-display__viz">
				<svg viewBox="0 0 500 280" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
					<defs><filter id="zoraBlend" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur in="SourceGraphic" stdDeviation="6"/></filter></defs>
					<text x="20" y="28" class="zlbl">&#x2191; N</text>
					<text x="480" y="28" text-anchor="end" class="zlbl">44 ft &times; 22 ft</text>
					<g filter="url(#zoraBlend)">
						<path d="M 40 60 A 210 210 0 0 0 460 60 L 404 60 A 154 154 0 0 1 96 60 Z" fill="#D4B5E8"/>
						<path d="M 96 60 A 154 154 0 0 0 404 60 L 352 60 A 102 102 0 0 1 148 60 Z" fill="#F5A8A0"/>
						<path d="M 148 60 A 102 102 0 0 0 352 60 L 308 60 A 58 58 0 0 1 192 60 Z" fill="#FBE38A"/>
						<path d="M 192 60 A 58 58 0 0 0 308 60 L 280 60 A 30 30 0 0 1 220 60 Z" fill="#D4B5E8"/>
						<circle cx="250" cy="80" r="28" fill="#A8D5A0"/>
						<circle cx="198" cy="78" r="18" fill="#A8C8E8"/>
						<circle cx="302" cy="78" r="18" fill="#A8C8E8"/>
					</g>
					<path d="M 40 60 A 210 210 0 0 0 460 60 Z" fill="none" stroke="#9b9387" stroke-width="1"/>
					<line x1="40" y1="60" x2="460" y2="60" stroke="#5F5E5A" stroke-width="1.5"/>
				</svg>
			</div>
			<ul class="gff-zora-display__legend">
				<li><span class="zsw" style="background:#A8D5A0"></span>Moringa <em>&middot; canopy anchor</em></li>
				<li><span class="zsw" style="background:#A8C8E8"></span>Pigeon pea <em>&middot; nitrogen-fixers</em></li>
				<li><span class="zsw" style="background:#D4B5E8"></span>Longevity spinach <em>&middot; perennial spreader</em></li>
				<li><span class="zsw" style="background:#FBE38A"></span>Hot greens <em>&middot; year-round</em></li>
				<li><span class="zsw" style="background:#F5A8A0"></span>Seasonal block <em>&middot; rotates twice yearly</em></li>
				<li><span class="zsw" style="background:#D4B5E8"></span>Sweet potato carpet <em>&middot; ground-layer spreader</em></li>
			</ul>
		</div>
	</section>
	<?php return ob_get_clean();
}

/* ---- [gff_timeline] ----
 * "What happens next" — the post-reservation process, both offers.
 * Neutral self-contained style: sits on a soft light card so it stays
 * legible in BOTH the light Sunrise row and the dark Spire row. */
add_shortcode( 'gff_timeline', 'gff_sc_timeline' );
function gff_sc_timeline( $atts = array() ) {
	$a = shortcode_atts( array(
		'heading' => 'A living food farm at your home &mdash; dig in yourself, or leave all the dirty work to us.',
		'steps_label' => 'How it works',
	), $atts, 'gff_timeline' );
	$steps = array(
		array( 'when' => 'Step 1', 'what' => 'Reserve your spot', 'body' => 'Free, or $100 to lock a site visit or jump the line. The $100 isn&rsquo;t a deposit &mdash; it goes straight toward your farm.' ),
		array( 'when' => 'Step 2', 'what' => 'Your farm goes in', 'body' => 'We handle the install, the planting, the soil science. You&rsquo;re as involved as you want to be.' ),
		array( 'when' => 'Step 3', 'what' => 'We tend it for you', 'body' => 'Pruning, feeding, replanting, all on schedule. Or grab the shears yourself &mdash; it&rsquo;s your farm.' ),
		array( 'when' => 'Step 4', 'what' => 'Then it just feeds you', 'body' => 'Around month three it&rsquo;s at full strength &mdash; you&rsquo;re picking fresh food at home instead of buying it.' ),
	);
	ob_start(); ?>
	<style>
		.gff-tl{max-width:680px;margin:1.25rem auto;background:#fafaf7;border:1px solid #e4e2da;border-radius:16px;padding:1.4rem 1.5rem;box-shadow:0 2px 14px rgba(22,20,26,.08);}
		.gff-tl__lead{margin:0 0 1.25rem;font-family:"Lato",sans-serif;font-size:1.4rem;line-height:1.35;font-weight:700;color:#1c1c1a;text-align:center;letter-spacing:.01em;}
		.gff-tl__steps-label{margin:0 0 .75rem;font-family:"Lato",sans-serif;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#1c1c1a;text-align:center;}
		.gff-tl__list{list-style:none;margin:0;padding:0;position:relative;}
		.gff-tl__list::before{content:"";position:absolute;left:18px;top:8px;bottom:8px;width:2px;background:linear-gradient(#c9a227,#e0cf9a);opacity:.5;}
		.gff-tl__item{position:relative;display:flex;gap:.9rem;padding:.55rem 0;align-items:flex-start;}
		.gff-tl__dot{flex:0 0 38px;width:38px;height:38px;border-radius:50%;background:#1c1c1a;color:#fff;display:flex;align-items:center;justify-content:center;font-family:"Lato",sans-serif;font-weight:700;font-size:1rem;z-index:1;box-shadow:0 0 0 4px #fafaf7;}
		.gff-tl__c{flex:1;}
		.gff-tl__when{display:inline-block;font-family:"Lato",sans-serif;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#1c1c1a;}
		.gff-tl__what{font-family:"Lato",sans-serif;font-size:1.05rem;font-weight:700;color:#1c1c1a;margin:.05rem 0 .15rem;}
		.gff-tl__body{font-size:.95rem;line-height:1.45;color:#5a5a54;margin:0;}
		@media(max-width:480px){.gff-tl{padding:1.1rem 1rem;}.gff-tl__lead{font-size:1.2rem;}.gff-tl__what{font-size:1rem;}.gff-tl__body{font-size:.9rem;}}
	</style>
	<section class="gff-tl">
		<p class="gff-tl__lead"><?php echo $a['heading']; // phpcs:ignore — trusted hardcoded literal with entities ?></p>
		<p class="gff-tl__steps-label"><?php echo esc_html( $a['steps_label'] ); ?></p>
		<ul class="gff-tl__list">
			<?php foreach ( $steps as $i => $s ) : ?>
				<li class="gff-tl__item">
					<span class="gff-tl__dot"><?php echo (int) ( $i + 1 ); ?></span>
					<div class="gff-tl__c">
						<span class="gff-tl__when"><?php echo $s['when']; // phpcs:ignore — trusted hardcoded literal with entities ?></span>
						<div class="gff-tl__what"><?php echo $s['what']; // phpcs:ignore — trusted hardcoded literal ?></div>
						<p class="gff-tl__body"><?php echo $s['body']; // phpcs:ignore — trusted hardcoded literal ?></p>
					</div>
				</li>
			<?php endforeach; ?>
		</ul>
	</section>
	<?php return ob_get_clean();
}

/* ---- [gff_pitch] ---- */
add_shortcode( 'gff_pitch', 'gff_sc_pitch' );
function gff_sc_pitch( $atts = array() ) {
	$a = shortcode_atts( array(
		'headline'       => '$300',
		'headline_after' => '/month, all inclusive',
		'subtitle'       => 'A farm that comes with a farmer. In the ground, or in the air.',
		'pitch'          => '$772 to start &mdash; consultation, design, build, install, and your first month. Then $300/month, and it never goes up. Every year your farm propagates a free Spire.',
	), $atts, 'gff_pitch' );
	ob_start(); ?>
	<div class="gff-price" data-gff-section="pitch">
		<div class="gff-price__lines">
			<span class="gff-price__big"><?php echo esc_html( $a['headline'] ); ?><span><?php echo esc_html( $a['headline_after'] ); ?></span></span>
			<span class="gff-price__sub"><?php echo esc_html( $a['subtitle'] ); ?></span>
			<span class="gff-price__pitch"><?php echo wp_kses_post( $a['pitch'] ); ?></span>
		</div>
		<label class="gff-price__sqft">Starting size
			<input type="text" name="gff_sqft" id="gff_sqft" placeholder="sqft, or whole conversion">
		</label>
		<p class="gff-price__est" id="gff_est" hidden>Your Zora Sunrise Module™: <strong>$300/month</strong> &middot; <span id="gff_est_val"></span></p>
		<p class="gff-price__note" id="gff_est_text" hidden>No problem &mdash; we&rsquo;ll measure it at your design consult.</p>
	</div>
	<?php return ob_get_clean();
}

/* ---- [gff_crops show="edibles,flowers,herbs,trees"] ---- */
add_shortcode( 'gff_crops', 'gff_sc_crops' );
function gff_sc_crops( $atts = array() ) {
	$a = shortcode_atts( array(
		'show'   => 'edibles,flowers,herbs,trees',
		'legend' => 'What would you like to grow?',
	), $atts, 'gff_crops' );
	$show = array_map( 'trim', array_map( 'strtolower', explode( ',', $a['show'] ) ) );
	$map  = array( 'edibles'=>'Edibles', 'flowers'=>'Flowers', 'herbs'=>'Herbs', 'trees'=>'Trees & Shrubs' );
	$crops = gff_reg_crops();
	ob_start(); ?>
	<fieldset class="gff-reg__group" data-gff-section="crops" data-gff-required="1">
		<legend><?php echo esc_html( $a['legend'] ); ?> <span class="gff-flag" aria-hidden="true">🌸</span></legend>
		<div class="gff-checklist">
			<?php foreach ( $crops as $section => $items ) :
				$key = strtolower( array_search( $section, $map, true ) );
				if ( ! in_array( $key, $show, true ) ) { continue; } ?>
				<section class="gff-cl-sec">
					<h3 class="gff-cl-head"><?php echo esc_html( $section ); ?></h3>
					<ul class="gff-cl-items">
						<?php foreach ( $items as $crop ) : ?>
							<li>
								<label class="gff-cl-item">
									<input type="checkbox" name="gff_crops[]" value="<?php echo esc_attr( $crop ); ?>" class="gff-cl-check"<?php echo gff_reg_old_checked( 'gff_crops', $crop ); ?>>
									<span class="gff-cl-name"><?php echo esc_html( $crop ); ?></span>
								</label>
							</li>
						<?php endforeach; ?>
					</ul>
				</section>
			<?php endforeach; ?>
		</div>
	</fieldset>
	<?php return ob_get_clean();
}


/* ---- [gff_farm_builder] — interactive build-your-farm, writes hidden gff_farm_layout ---- */
add_shortcode( 'gff_farm_builder', 'gff_sc_farm_builder' );
function gff_sc_farm_builder( $atts = array() ) {
	$a = shortcode_atts( array(
		'mode' => 'both', // both | sunrise | spire
		'user' => '',   // "current" = hydrate from the logged-in customer's saved layout (account page)
	), $atts, 'gff_farm_builder' );

	// Account-page mode: preload the customer's saved farm so they edit, not restart.
	// user="current" = logged-in customer; user="<id>" = a specific customer (garden invite link).
	$init_json = '';
	$cur_uid   = 0;
	if ( 'current' === $a['user'] && is_user_logged_in() ) { $cur_uid = get_current_user_id(); }
	elseif ( is_numeric( $a['user'] ) && (int) $a['user'] > 0 ) { $cur_uid = (int) $a['user']; }
	if ( $cur_uid ) {
		$saved   = json_decode( (string) get_user_meta( $cur_uid, 'gff_farm_layout', true ), true );
		$init    = is_array( $saved ) ? $saved : array();
		if ( empty( $init['offer'] ) ) { $init['offer'] = ( 'spire' === $a['mode'] ) ? 'spire' : 'sunrise'; }
		$qty_meta = (int) get_user_meta( $cur_uid, 'gff_tower_qty', true );
		if ( $qty_meta > 0 ) { $init['qty'] = $qty_meta; }
		$init['moringa'] = ( 'yes' === get_user_meta( $cur_uid, 'gff_moringa_fruit_upgrade', true ) );
		$init_json = (string) wp_json_encode( $init );
	}

	// Plant list + per-plant true-to-food colors (single source: gff_reg_crops)
	$crops = gff_reg_crops();
	$colors = array(
		'Tomatoes'=>'#e23b2e','Cherry tomatoes'=>'#f0524a','Everglades tomato'=>'#c62f23','Peppers'=>'#e84e1b','Hot peppers'=>'#cc2a16',
		'Lettuce & greens'=>'#7fc241','Broccoli'=>'#3f7a34','Cauliflower'=>'#ede7cf','Cabbage'=>'#9bc36a','Kale'=>'#2f6b39','Collards'=>'#4a8c3f',
		'Swiss chard'=>'#c0354f','Mustard greens'=>'#8fae3a','Spinach'=>'#3c7d3c','Longevity spinach'=>'#5a9e4a','Bok choy'=>'#b7d36a',
		'Carrots'=>'#ef7a1a','Beets'=>'#9b2242','Radish'=>'#d93a55','Onions'=>'#e8d8b0','Green onions'=>'#86bf57','Peas'=>'#73b84d',
		'Bush beans'=>'#5c9e3f','Pole beans'=>'#4d8a37','Southern peas'=>'#a8936b','Pigeon pea'=>'#b6a33f','Squash & zucchini'=>'#3f8a3a',
		'Cucumbers'=>'#4f9e46','Watermelon'=>'#3f7d3a','Cantaloupe'=>'#e8a85c','Okra'=>'#5a8f3a','Sweet potato'=>'#c46a3f',
		'Seminole pumpkin'=>'#d98b35','Strawberries'=>'#e23250',
		'Sweet pea'=>'#c77fb0','Snapdragon'=>'#e85a7a',"Bachelor's button"=>'#3f6bc4','Nasturtium'=>'#ef6f1f','Pansy / viola'=>'#7d4ba8',
		'Zinnia'=>'#e6447e','Sunflower'=>'#f2b821','Cosmos'=>'#e57aa0','Marigold'=>'#f08a1c','Celosia'=>'#cc2f5a','Portulaca'=>'#ef6aa0',
		'Vinca'=>'#d987b8','Morning glory'=>'#5566c4','Coreopsis'=>'#f4c023',
		'Cilantro'=>'#5fa345','Dill'=>'#86b84a','Parsley'=>'#3f8a44','Fennel'=>'#9cc05a','Basil'=>'#3c7d40','Lemongrass'=>'#bcd17a',
		'Ginger / turmeric'=>'#e0a52e','Rosemary'=>'#4a7a5c','Oregano'=>'#6a9a4a','Mint'=>'#54b07a','Thyme'=>'#7a9e5a',
		'Cranberry hibiscus'=>'#a52f4a','Moringa'=>'#4f8c46',
	);
	// per-plant conservative annual value (year2+ steady) where known; per single spot = /4
	$pval = array(
		'Moringa'=>60,'Pigeon pea'=>24,'Longevity spinach'=>200,'Sweet potato'=>150,'Everglades tomato'=>480,
		'Cherry tomatoes'=>480,'Tomatoes'=>225,'Peppers'=>330,'Hot peppers'=>220,'Okra'=>247,'Collards'=>160,
		'Mustard greens'=>120,'Bok choy'=>325,'Lettuce & greens'=>240,'Southern peas'=>64,'Squash & zucchini'=>120,'Cucumbers'=>165,
	);

	$plants_json = wp_json_encode( $crops );
	$colors_json = wp_json_encode( $colors );
	$pval_json   = wp_json_encode( $pval );
	$mode_attr   = esc_attr( $a['mode'] );
	$uid_sfx     = 'fb' . substr( md5( uniqid( '', true ) ), 0, 6 );

	ob_start(); ?>
	<fieldset class="gff-reg__group gff-farm-builder" data-gff-section="farm-builder">
		<legend>Build your farm <span aria-hidden="true">🌱</span> <span class="gff-fb-optional">— optional</span></legend>
		<label class="gff-fb-toggle"><input type="checkbox" id="gff-fb-enable-<?php echo $uid_sfx; ?>" class="gff-fb-enable"> <span>I'd like to customize what's planted (otherwise we'll design it for you)</span></label>
		<div id="gff-fb-root-<?php echo $uid_sfx; ?>" class="gff-fb-root" data-mode="<?php echo $mode_attr; ?>"<?php echo $init_json ? ' data-init="' . esc_attr( $init_json ) . '"' : ''; ?> hidden></div>
		<input type="hidden" name="gff_farm_layout" id="gff_farm_layout-<?php echo $uid_sfx; ?>" class="gff-farm-layout-field" value="">
	</fieldset>
	<script>
	(function(){
		var PLANTS = <?php echo $plants_json; ?>;
		var PCOLOR = <?php echo $colors_json; ?>;
		var PVAL   = <?php echo $pval_json; ?>;
		// comprehensive kitchen garden — edibles only, no herbs/flowers
		var KITCHEN = ['Tomatoes','Cherry tomatoes','Everglades tomato','Peppers','Hot peppers','Lettuce & greens','Kale','Collards','Swiss chard','Carrots','Beets','Radish','Green onions','Bush beans','Cucumbers','Okra','Squash & zucchini','Sweet potato','Strawberries','Broccoli'];
		var SFX = '<?php echo $uid_sfx; ?>';
		var root = document.getElementById('gff-fb-root-'+SFX);
		var hidden = document.getElementById('gff_farm_layout-'+SFX);
		var enable = document.getElementById('gff-fb-enable-'+SFX);
		if(!root||!hidden) return;
		var dataMode = root.getAttribute('data-mode');
		var locked = (dataMode==='spire'||dataMode==='sunrise'); // locked = no internal toggle
		var mode = (dataMode==='spire')?'spire':'sun'; // sunrise & both render as 'sun' initially
		var sunSpots = new Array(20).fill(null), sunSel=0;
		var qty=2, towerSpots=[], curTower=0, spireSel=0;
		function pColor(p){ return PCOLOR[p]||'#888'; }
		function spotValue(p){ var v=PVAL[p]; return v?Math.floor(v/4):null; }
		function ensureTowers(){ while(towerSpots.length<qty) towerSpots.push(new Array(20).fill(null)); towerSpots.length=qty; if(curTower>=qty)curTower=qty-1; }

		// opt-in: builder hidden until enabled; clearing it wipes the layout so nothing submits
		if(enable){
			enable.addEventListener('change', function(){
				if(enable.checked){ root.hidden=false; render(); }
				else { root.hidden=true; hidden.value=''; }
			});
		}
		function rainbowFill(){
			if(mode==='sun'){
				for(var i=0;i<20;i++){ sunSpots[i]=KITCHEN[i%KITCHEN.length]; }
				sunSel=0; renderSun();
			} else {
				ensureTowers();
				var spots=towerSpots[curTower];
				for(var j=0;j<20;j++){ spots[j]=KITCHEN[j%KITCHEN.length]; }
				spireSel=0; renderSpire();
			}
			syncHidden();
		}
		function clearFill(){
			if(mode==='sun'){ sunSpots=new Array(20).fill(null); sunSel=0; renderSun(); }
			else { ensureTowers(); towerSpots[curTower]=new Array(20).fill(null); spireSel=0; renderSpire(); }
			syncHidden();
		}

		function syncHidden(){
			var payload;
			if(mode==='sun'){
				payload={offer:'sunrise', seasonal_spots:sunSpots.filter(Boolean),
					moringa_fruit_upgrade: !!(document.getElementById('gff-fb-moringa-'+SFX)||{}).checked };
			} else {
				ensureTowers();
				payload={offer:'spire', towers:qty,
					towers_plants: towerSpots.map(function(t,i){return {tower:i+1, plants:t.filter(Boolean)};}) };
			}
			hidden.value = JSON.stringify(payload);
		}

		function paletteHTML(){
			var h='<div class="gff-fb-pal">';
			for(var cat in PLANTS){
				h+='<div class="gff-fb-cat">'+cat+'</div><div class="gff-fb-pg">';
				PLANTS[cat].forEach(function(pl){
					var sv=spotValue(pl);
					h+='<button type="button" class="gff-fb-plant" data-pl="'+pl.replace(/"/g,'&quot;')+'">'
						+'<span class="gff-fb-dot" style="background:'+pColor(pl)+'"></span>'+pl
						+(sv!=null?' <span class="gff-fb-pv">$'+sv+'</span>':'')+'</button>';
				});
				h+='</div>';
			}
			return h+'</div>';
		}

		function render(){
			var h='';
			if(!locked){
				h+='<div class="gff-fb-modes">'
					+'<button type="button" class="gff-fb-mode'+(mode==='sun'?' on':'')+'" data-m="sun">🌅 Sunrise — seasonal bed</button>'
					+'<button type="button" class="gff-fb-mode'+(mode==='spire'?' on':'')+'" data-m="spire">⚡ Spire — towers</button></div>';
			}
			if(mode==='sun'){
				h+='<p class="gff-fb-lead">Your food forest comes fully planted. Choose what fills your <b>20 seasonal-bed spots</b>, or use the rainbow button for a ready-made kitchen garden.</p>';
				h+='<div class="gff-fb-actions"><button type="button" class="gff-fb-rainbow" data-act="rainbow">🌈 Fill with a kitchen garden</button><button type="button" class="gff-fb-clear" data-act="clear">Clear all</button></div>';
				h+='<div class="gff-fb-fill"><b id="gff-fb-sunfill-'+SFX+'">'+sunSpots.filter(Boolean).length+'</b> of 20 filled</div>';
				h+='<div class="gff-fb-spots" id="gff-fb-sunspots-'+SFX+'"></div>';
				h+='<label class="gff-fb-up"><input type="checkbox" id="gff-fb-moringa-'+SFX+'"> Upgrade Moringa to a fruit tree (+$100, billed later, not at signup)</label>';
				h+=paletteHTML();
			} else {
				ensureTowers();
				h+='<p class="gff-fb-lead">Each Spire has <b>20 spots</b> (5 stories of 4) plus a free herb base. Add towers, then fill each &mdash; or use the rainbow button.</p>';
				h+='<div class="gff-fb-step"><button type="button" class="gff-fb-sb" data-d="-1">−</button>'
					+'<span class="gff-fb-q"><b id="gff-fb-qn-'+SFX+'">'+qty+'</b> towers</span>'
					+'<button type="button" class="gff-fb-sb" data-d="1">+</button></div>';
				h+='<div class="gff-fb-actions"><button type="button" class="gff-fb-rainbow" data-act="rainbow">🌈 Fill this tower with a kitchen garden</button><button type="button" class="gff-fb-clear" data-act="clear">Clear tower</button></div>';
				h+='<div class="gff-fb-tnav" id="gff-fb-tnav-'+SFX+'"></div>';
				h+='<div class="gff-fb-spots gff-fb-stories" id="gff-fb-spirespots-'+SFX+'"></div>';
				h+=paletteHTML();
			}
			root.innerHTML=h;
			bind();
			if(mode==='sun') renderSun(); else renderSpire();
			syncHidden();
		}

		function renderSun(){
			var c=document.getElementById('gff-fb-sunspots-'+SFX); if(!c)return; c.innerHTML='';
			sunSpots.forEach(function(pl,i){
				var d=document.createElement('div'); d.className='gff-fb-spot'+(pl?' filled':'')+(i===sunSel?' sel':'');
				if(pl){ d.style.background=pColor(pl); var sv=spotValue(pl); d.innerHTML=pl+(sv!=null?'<span class="gff-fb-sv">$'+sv+'/yr</span>':''); }
				else d.textContent='+';
				d.onclick=function(){ if(pl){sunSpots[i]=null;} sunSel=i; renderSun(); syncHidden(); };
				c.appendChild(d);
			});
			var f=document.getElementById('gff-fb-sunfill-'+SFX); if(f)f.textContent=sunSpots.filter(Boolean).length;
		}
		function placeSun(pl){ sunSpots[sunSel]=pl; var n=sunSpots.findIndex(function(s,i){return i>sunSel&&!s;}); if(n===-1)n=sunSpots.findIndex(function(s){return !s;}); if(n!==-1)sunSel=n; renderSun(); syncHidden(); }

		function renderTnav(){
			ensureTowers();
			var n=document.getElementById('gff-fb-tnav-'+SFX); if(!n)return; n.innerHTML='';
			for(var t=0;t<qty;t++){ (function(t){
				var b=document.createElement('button'); b.type='button'; b.className='gff-fb-tn'+(t===curTower?' on':'');
				b.innerHTML='Tower '+(t+1)+' <small>'+towerSpots[t].filter(Boolean).length+'/20</small>';
				b.onclick=function(){curTower=t;spireSel=0;renderSpire();};
				n.appendChild(b);
			})(t); }
		}
		function renderSpire(){
			ensureTowers();
			var c=document.getElementById('gff-fb-spirespots-'+SFX); if(!c)return; c.innerHTML='';
			var spots=towerSpots[curTower];
			for(var story=4; story>=0; story--){
				var row=document.createElement('div'); row.className='gff-fb-story';
				var lab=document.createElement('span'); lab.className='gff-fb-slab'; lab.textContent='S'+(story+1); row.appendChild(lab);
				var cells=document.createElement('div'); cells.className='gff-fb-scells';
				for(var k=0;k<4;k++){ (function(i){
					var pl=spots[i];
					var d=document.createElement('div'); d.className='gff-fb-spot'+(pl?' filled':'')+(i===spireSel?' sel':'');
					if(pl){ d.style.background=pColor(pl); var sv=spotValue(pl); d.innerHTML=pl+(sv!=null?'<span class="gff-fb-sv">$'+sv+'/yr</span>':''); }
					else d.textContent='+';
					d.onclick=function(){ if(pl){spots[i]=null;} spireSel=i; renderSpire(); syncHidden(); };
					cells.appendChild(d);
				})(story*4+k); }
				row.appendChild(cells); c.appendChild(row);
			}
			var base=document.createElement('div'); base.className='gff-fb-herb'; base.textContent='🌿 Herb garden — free on every tower'; c.appendChild(base);
			renderTnav();
		}
		function placeSpire(pl){ ensureTowers(); var spots=towerSpots[curTower]; spots[spireSel]=pl; var n=spots.findIndex(function(s,i){return i>spireSel&&!s;}); if(n===-1)n=spots.findIndex(function(s){return !s;}); if(n!==-1)spireSel=n; renderSpire(); syncHidden(); }

		function bind(){
			root.querySelectorAll('.gff-fb-mode').forEach(function(b){ b.onclick=function(){ mode=b.getAttribute('data-m'); render(); }; });
			root.querySelectorAll('.gff-fb-plant').forEach(function(b){ b.onclick=function(){ var pl=b.getAttribute('data-pl'); if(mode==='sun')placeSun(pl); else placeSpire(pl); }; });
			root.querySelectorAll('.gff-fb-sb').forEach(function(b){ b.onclick=function(){ qty=Math.max(1,Math.min(20,qty+parseInt(b.getAttribute('data-d'),10))); ensureTowers(); render(); }; });
			root.querySelectorAll('[data-act]').forEach(function(b){ b.onclick=function(){ b.getAttribute('data-act')==='rainbow'?rainbowFill():clearFill(); }; });
			var mor=document.getElementById('gff-fb-moringa-'+SFX); if(mor)mor.onchange=syncHidden;
		}
		// builder stays hidden until the customer opts in (toggle above)

		// account-page prefill: hydrate from the customer's saved layout and show immediately
		var INIT=null; try{ INIT=JSON.parse(root.getAttribute('data-init')||'null'); }catch(e){}
		if(INIT){
			if(INIT.offer==='spire'){
				mode='spire';
				var tws=INIT.towers||[];
				qty=Math.max(1, Math.max(tws.length, parseInt(INIT.qty,10)||0));
				ensureTowers();
				tws.forEach(function(t,i){ if(i>=qty)return; var arr=new Array(20).fill(null); (t.plants||[]).forEach(function(p,j){ if(j<20)arr[j]=p; }); towerSpots[i]=arr; });
			} else {
				mode='sun';
				(INIT.seasonal_spots||[]).forEach(function(p,j){ if(j<20)sunSpots[j]=p; });
			}
			if(enable){ enable.checked=true; var lb=enable.parentNode; if(lb&&lb.classList&&lb.classList.contains('gff-fb-toggle'))lb.style.display='none'; }
			root.hidden=false; render();
			if(INIT.moringa){ var mor2=document.getElementById('gff-fb-moringa-'+SFX); if(mor2){ mor2.checked=true; syncHidden(); } }
		}
	})();
	</script>
	<style>
		.gff-farm-builder{max-width:440px;margin-left:auto;margin-right:auto;}
		.gff-farm-builder .gff-fb-optional{font-size:13px;color:#9a9a94;font-weight:normal;font-style:italic;}
		.gff-farm-builder .gff-fb-toggle{display:flex;align-items:center;gap:8px;font-size:14px;color:#3a3a2a;margin:.4em 0;cursor:pointer;}
		.gff-farm-builder .gff-fb-toggle input{transform:scale(1.2);}
		.gff-farm-builder .gff-fb-actions{display:flex;gap:8px;flex-wrap:wrap;margin:.5em 0;}
		.gff-farm-builder .gff-fb-rainbow{font-size:13px;font-weight:bold;border:0;border-radius:20px;padding:8px 16px;cursor:pointer;font-family:inherit;color:#fff !important;
			background:linear-gradient(90deg,#e23b2e,#ef7a1a,#f2b821,#7fc241,#3f6bc4,#7d4ba8);}
		.gff-farm-builder .gff-fb-clear{font-size:13px;border:1.5px solid #e4e2da;border-radius:20px;padding:8px 14px;cursor:pointer;font-family:inherit;background:#fff !important;color:#6f6e69;}
		.gff-farm-builder .gff-fb-modes{display:flex;gap:8px;margin-bottom:10px;}
		.gff-farm-builder .gff-fb-mode{flex:1;padding:10px;border:2px solid #e4e2da !important;border-radius:12px;background:#ffffff !important;cursor:pointer;font-family:inherit;font-size:14px;color:#1c1c1a;}
		.gff-farm-builder .gff-fb-mode.on{border-color:#1c1c1a !important;background:#eef6e6 !important;font-weight:bold;}
		.gff-farm-builder .gff-fb-lead{font-size:13px;color:#6f6e69;margin:.4em 0;}
		.gff-farm-builder .gff-fb-fill{font-size:13px;margin:.3em 0;color:#1c1c1a;}
		.gff-farm-builder .gff-fb-spots{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:.5em 0;}
		.gff-farm-builder .gff-fb-stories{display:flex;flex-direction:column;gap:6px;}
		.gff-farm-builder .gff-fb-story{display:flex;align-items:center;gap:8px;}
		.gff-farm-builder .gff-fb-slab{flex:0 0 28px;font-size:11px;color:#6f6e69;font-weight:bold;text-align:right;}
		.gff-farm-builder .gff-fb-scells{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;flex:1;min-width:0;}
		.gff-farm-builder .gff-fb-spot{height:48px;border:1.5px dashed #c7d6bb !important;border-radius:8px;background:#ffffff !important;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:9.5px;text-align:center;padding:2px;color:#6f6e69;font-weight:bold;box-sizing:border-box;overflow:hidden;word-break:break-word;line-height:1.1;}
		.gff-farm-builder .gff-fb-spot.filled{border-style:solid;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.4);}
		.gff-farm-builder .gff-fb-spot.sel{outline:3px solid #e0b341;outline-offset:1px;}
		.gff-farm-builder .gff-fb-sv{font-size:8px;font-weight:normal;opacity:.9;}
		.gff-farm-builder .gff-fb-herb{margin-top:4px;background:linear-gradient(180deg,#7a9a3a,#5a7322) !important;border:1.5px dashed #e0b341;border-radius:9px;padding:9px;text-align:center;color:#fff !important;font-size:12px;font-weight:bold;}
		.gff-farm-builder .gff-fb-up{display:block;font-size:12px;margin:.6em 0;color:#3a3a2a;}
		.gff-farm-builder .gff-fb-step{display:flex;gap:10px;align-items:center;justify-content:center;margin:.5em 0;}
		.gff-farm-builder .gff-fb-sb{width:40px;height:40px;font-size:20px;border:0;border-radius:10px;background:#e4eef8;cursor:pointer;font-family:inherit;font-weight:bold;}
		.gff-farm-builder .gff-fb-q{min-width:90px;text-align:center;font-size:15px;}
		.gff-farm-builder .gff-fb-tnav{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:.4em 0;}
		.gff-farm-builder .gff-fb-tn{font-size:12px;padding:5px 11px;border-radius:16px;border:1.5px solid #cdd;background:#fff !important;cursor:pointer;font-family:inherit;}
		.gff-farm-builder .gff-fb-tn.on{background:#e4eef8 !important;font-weight:bold;border-color:transparent;}
		.gff-farm-builder .gff-fb-pal{margin-top:.5em;max-height:180px;overflow-y:auto;border:1px solid #e4e2da;border-radius:12px;padding:8px;background:#ffffff !important;box-sizing:border-box;}
		.gff-farm-builder .gff-fb-cat{font-size:11px;font-weight:bold;color:#2f6b39;text-transform:uppercase;margin:6px 2px 4px;}
		.gff-farm-builder .gff-fb-pg{display:flex;flex-wrap:wrap;gap:5px;}
		.gff-farm-builder .gff-fb-plant{display:inline-flex;align-items:center;font-size:12px;line-height:1.2;padding:5px 9px;border-radius:18px;border:1.5px solid #e4e2da !important;background:#fafaf7 !important;cursor:pointer;font-family:inherit;white-space:nowrap;color:#1c1c1a;}
		.gff-farm-builder .gff-fb-plant:hover{border-color:#1c1c1a !important;}
		.gff-farm-builder .gff-fb-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:middle;flex:0 0 auto;}
		.gff-farm-builder .gff-fb-pv{color:#2f6b39;font-weight:bold;font-size:10px;margin-left:3px;}
		@media(max-width:600px){ .gff-farm-builder .gff-fb-slab{flex:0 0 22px;} .gff-farm-builder .gff-fb-spot{font-size:9px;} }
	</style>
	<?php return ob_get_clean();
}

/* ---- [gff_details] ---- */
add_shortcode( 'gff_details', 'gff_sc_details' );
function gff_sc_details( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => 'Your details', 'optional' => '0' ), $atts, 'gff_details' );
	$is_optional = '1' === (string) $a['optional'];
	$req = $is_optional ? '' : ' required';
	$reqflag = $is_optional ? '0' : '1';
	ob_start(); ?>
	<fieldset class="gff-reg__group" id="gff-details" data-gff-section="details" data-gff-required="<?php echo esc_attr( $reqflag ); ?>">
		<legend><?php echo esc_html( $a['legend'] ); ?> <span class="gff-flag" aria-hidden="true">🌸</span></legend>
		<div class="gff-grid">
			<label>First name<input type="text" name="gff_first"<?php echo gff_reg_old_val( 'gff_first' ); ?><?php echo $req; ?>></label>
			<label>Last name<input type="text" name="gff_last"<?php echo gff_reg_old_val( 'gff_last' ); ?><?php echo $req; ?>></label>
			<?php if ( ! $is_optional ) : // In express/optional mode the email comes from [gff_express_email]; avoid a duplicate gff_email field that would overwrite it on submit. ?>
			<label>Email<input type="email" name="gff_email"<?php echo gff_reg_old_val( 'gff_email' ); ?> required></label>
			<?php endif; ?>
			<label>Phone<input type="tel" name="gff_phone"<?php echo gff_reg_old_val( 'gff_phone' ); ?>></label>
		</div>
	</fieldset>
	<?php return ob_get_clean();
}

/* ---- [gff_address] ---- */
add_shortcode( 'gff_address', 'gff_sc_address' );
function gff_sc_address( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => 'Service address', 'optional' => '0' ), $atts, 'gff_address' );
	$req = '1' === (string) $a['optional'] ? '' : ' required';
	$reqflag = '1' === (string) $a['optional'] ? '0' : '1';
	ob_start(); ?>
	<fieldset class="gff-reg__group" data-gff-section="address" data-gff-required="<?php echo esc_attr( $reqflag ); ?>">
		<legend><?php echo esc_html( $a['legend'] ); ?> <span class="gff-flag" aria-hidden="true">🌸</span></legend>
		<div class="gff-grid">
			<label class="gff-col-2">Street address<input type="text" name="gff_address"<?php echo gff_reg_old_val( 'gff_address' ); ?><?php echo $req; ?>></label>
			<label>City<input type="text" name="gff_city"<?php echo gff_reg_old_val( 'gff_city' ); ?><?php echo $req; ?>></label>
			<label>ZIP<input type="text" name="gff_zip" inputmode="numeric"<?php echo gff_reg_old_val( 'gff_zip' ); ?><?php echo $req; ?>></label>
		</div>
	</fieldset>
	<?php return ob_get_clean();
}

/* ---- [gff_start_date] ---- */
add_shortcode( 'gff_start_date', 'gff_sc_start_date' );
function gff_sc_start_date( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => 'When would you like to start?', 'optional' => '0' ), $atts, 'gff_start_date' );
	$is_optional = '1' === (string) $a['optional'];
	$req = $is_optional ? '' : ' required';
	$reqflag = $is_optional ? '0' : '1';
	ob_start(); ?>
	<fieldset class="gff-reg__group" data-gff-section="start_date" data-gff-required="<?php echo esc_attr( $reqflag ); ?>">
		<legend><?php echo esc_html( $a['legend'] ); ?> <span class="gff-flag" aria-hidden="true">🌸</span></legend>
		<div class="gff-grid">
			<label>Preferred start date<input type="date" name="gff_start_date"<?php echo gff_reg_old_val( 'gff_start_date' ); ?><?php echo $req; ?>></label>
		</div>
		<p class="gff-hint">Pick the day you&rsquo;d like to begin. We&rsquo;ll confirm the final date with you after a quick site visit.</p>
	</fieldset>
	<?php return ob_get_clean();
}

/* ---- [gff_login] ---- */
add_shortcode( 'gff_login', 'gff_sc_login' );
function gff_sc_login( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => 'Create your login' ), $atts, 'gff_login' );
	ob_start(); ?>
	<fieldset class="gff-reg__group" data-gff-section="login" data-gff-required="1">
		<legend><?php echo esc_html( $a['legend'] ); ?> <span class="gff-flag" aria-hidden="true">🌸</span></legend>
		<div class="gff-grid">
			<label>Password<input type="password" name="gff_pass" minlength="8" required autocomplete="new-password"></label>
			<label>Confirm password<input type="password" name="gff_pass2" minlength="8" required autocomplete="new-password"></label>
		</div>
		<p class="gff-hint">At least 8 characters. You set this yourself &mdash; we never see it.</p>
	</fieldset>
	<?php return ob_get_clean();
}

/* Three Sisters opt-in field for the signup form (Spire). $spire_wrap adds the
 * .gff-mode-spire class so the sales-page toggle reveals it only in Spire mode.
 * Captured at submit as gff_three_sisters_optin. */
function gff_reg_three_sisters_field( $spire_wrap = false ) {
	ob_start(); ?>
	<div class="gff-ts-field">
		<p class="gff-ts-note">
			🌽 <strong>The Propagation Program is included.</strong> After your first year &mdash; and every year after &mdash;
			your farm propagates a free Spire tower, yours to keep, free to service. We also install a free Sunrise module
			for a family that couldn&rsquo;t afford one. No charge, no opt-in, and your monthly rate never changes.
		</p>
	</div>
	<?php return ob_get_clean();
}

/* ---- [gff_agreement] ---- */
add_shortcode( 'gff_agreement', 'gff_sc_agreement' );
function gff_sc_agreement( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => 'The Service Agreement' ), $atts, 'gff_agreement' );
	$sun   = gff_reg_agreement_sections();
	$spire = function_exists( 'gff_reg_tower_agreement_sections' ) ? gff_reg_tower_agreement_sections() : array();
	ob_start(); ?>
	<fieldset class="gff-reg__group" data-gff-section="agreement" data-gff-required="1">
		<details class="gff-acc-wrap">
			<summary class="gff-acc-wrap__summary">Service Agreement <span class="gff-acc-wrap__hint">(tap to read)</span><span class="gff-acc__chev" aria-hidden="true"></span></summary>
			<div class="gff-acc">
				<p style="font-weight:700;color:#1c1c1a;margin:12px 0 4px;">&#127749; Zora Sunrise Module</p>
				<?php foreach ( $sun as $i => $s ) : ?>
					<details class="gff-acc__item"<?php echo 0 === $i ? ' open' : ''; ?>>
						<summary><?php echo esc_html( $s['title'] ); ?><span class="gff-acc__chev" aria-hidden="true"></span></summary>
						<div class="gff-acc__body"><p><?php echo esc_html( $s['body'] ); ?></p></div>
					</details>
				<?php endforeach; ?>
				<?php if ( $spire ) : ?>
					<p style="font-weight:700;color:#1c1c1a;margin:16px 0 4px;">&#9889; Spire Towers</p>
					<?php foreach ( $spire as $s ) : ?>
						<details class="gff-acc__item">
							<summary><?php echo esc_html( $s['title'] ); ?><span class="gff-acc__chev" aria-hidden="true"></span></summary>
							<div class="gff-acc__body"><p><?php echo esc_html( $s['body'] ); ?></p></div>
						</details>
					<?php endforeach; ?>
				<?php endif; ?>
			</div>
		</details>
		<?php echo gff_reg_three_sisters_field( true ); // Spire-only via .gff-mode-spire toggle ?>
		<label class="gff-check">
			<input type="checkbox" name="gff_agree" value="yes"<?php echo gff_reg_old_checked( 'gff_agree', 'yes' ); ?> required>
			<span>I have read and accept the Gawlak Family Farms Service Agreement (v<?php echo esc_html( gff_reg_agreement_version() ); ?>) &mdash; covering both the Zora Sunrise Module and Spire Towers.</span>
		</label>
	</fieldset>
	<?php return ob_get_clean();
}

/* ---- [gff_consult] ---- */
add_shortcode( 'gff_consult', 'gff_sc_consult' );
function gff_sc_consult( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => 'Your design consult' ), $atts, 'gff_consult' );
	ob_start(); ?>
	<fieldset class="gff-reg__group gff-consult" data-gff-section="consult">
		<legend><?php echo esc_html( $a['legend'] ); ?></legend>
		<input type="hidden" name="gff_reservation" value="consult">
		<div class="gff-consult__opt gff-consult__opt--only">
			<span class="gff-consult__opt-body">
				<strong>$250 &mdash; your design consult</strong>
				<em>We come out, measure light, water, and drainage, stake the corners of your farm, photograph the site, and sit down to find out what your family actually eats. <strong>Credited in full</strong> toward your design, build, and install. Non-refundable &mdash; if we walk your property and it isn&rsquo;t a fit, you keep the design.</em>
			</span>
		</div>
		<p class="gff-consult__paylater">$772 to start &mdash; consultation, design, build, install, your first month of service, and the Propagation Program. The $250 consult is credited in full, leaving <strong>$522</strong> due at install. Then $300/month, and it never goes up.</p>
		<p class="gff-consult__paylater">After you submit, the success page shows your PayPal link for the $250 design consult.</p>
	</fieldset>
	<?php return ob_get_clean();
}

/* ---- Workshop: next "last Sunday of the month" at 3pm, computed live so
 *      it always shows the correct upcoming date with no manual updates.
 *      If this month's last Sunday already passed, rolls to next month. ---- */
function gff_reg_next_last_sunday( $fmt = 'l, F j, Y' ) {
	$tz  = wp_timezone();
	$now = new DateTime( 'now', $tz );

	$candidate = gff_reg_last_sunday_of( (int) $now->format( 'Y' ), (int) $now->format( 'n' ), $tz );
	// Workshop is at 3pm; if today is past that last Sunday's 3pm, go to next month.
	$candidate->setTime( 15, 0, 0 );
	if ( $now > $candidate ) {
		$y = (int) $now->format( 'Y' );
		$m = (int) $now->format( 'n' ) + 1;
		if ( $m > 12 ) { $m = 1; $y++; }
		$candidate = gff_reg_last_sunday_of( $y, $m, $tz );
		$candidate->setTime( 15, 0, 0 );
	}
	return $candidate->format( $fmt );
}

function gff_reg_last_sunday_of( $year, $month, $tz ) {
	$d = new DateTime( sprintf( '%04d-%02d-01', $year, $month ), $tz );
	$d->modify( 'last day of this month' );
	// Walk back to Sunday (w == 0).
	$dow = (int) $d->format( 'w' );
	if ( 0 !== $dow ) { $d->modify( '-' . $dow . ' days' ); }
	return $d;
}

/* ---- [gff_workshop] ---- DEPRECATED. The workshop is now a paid option in
 *      the reservation radio group ([gff_consult] / [gff_tower_consult]), so
 *      this standalone control is retired to avoid two competing workshop
 *      inputs. Kept registered so any page still containing the shortcode
 *      renders nothing (instead of raw "[gff_workshop]" text). ---- */
add_shortcode( 'gff_workshop', 'gff_sc_workshop' );
function gff_sc_workshop( $atts = array() ) {
	return ''; // deprecated: workshop is now value="workshop" in the reservation radios
}

/* [gff_tower_consult] — reservation radios reframed for Spire towers.
 * Uses the SAME gff_reservation field so the tower handler works unchanged,
 * but the $100 is framed as securing the tower system install. */
add_shortcode( 'gff_tower_consult', 'gff_sc_tower_consult' );
function gff_sc_tower_consult( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => 'Your design consult' ), $atts, 'gff_tower_consult' );
	ob_start(); ?>
	<fieldset class="gff-reg__group gff-consult" data-gff-section="consult">
		<legend><?php echo esc_html( $a['legend'] ); ?></legend>
		<input type="hidden" name="gff_reservation" value="consult">
		<div class="gff-consult__opt gff-consult__opt--only">
			<span class="gff-consult__opt-body">
				<strong>$250 &mdash; your design consult</strong>
				<em>We come out, measure light, water, wind, and surface, mark each Spire footprint and its herb ring, photograph the site, and sit down to find out what your family actually eats. <strong>Credited in full</strong> toward your design, build, and install. Non-refundable &mdash; if we walk your property and it isn&rsquo;t a fit, you keep the design.</em>
			</span>
		</div>
		<p class="gff-consult__paylater">$772 to start &mdash; consultation, design, build, install, your first month of service, and the Propagation Program. The $250 consult is credited in full, leaving <strong>$522</strong> due at install. Then $300/month, and it never goes up.</p>
		<p class="gff-consult__paylater">After you submit, the success page shows your PayPal link for the $250 design consult.</p>
	</fieldset>
	<?php return ob_get_clean();
}

/* ============================================================
 * SPIRE TOWER SERVICE AGREEMENT (single source of truth)
 * Tower-accurate terms. Mirrors gff_reg_agreement_sections() structure.
 * NOTE: drafted to match the Zora agreement's form; NOT lawyer-reviewed.
 * ============================================================ */
function gff_reg_tower_agreement_sections() {
	return array(
		array(
			'title' => '1. Services Provided',
			'body'  => 'Provider agrees to supply, install, and maintain one or more vertical tower growing systems (each a "Spire," collectively the "System") at the Customer\'s property, known as Spire Towers by Gawlak Family Farms. Services include site assessment, placement for sun and water, tower assembly and installation, planting, soil and nutrient management, and ongoing maintenance visits as scheduled. Each Spire includes a base herb garden section at no additional charge.',
		),
		array(
			'title' => '2. Pricing & Monthly Service',
			'body'  => 'Monthly service is $300 per month for three (3) Spire Towers. Setup and installation are included in the starter cost. Each Spire includes a complimentary herb section at its base; herb sections are excluded from any food-value calculation. Spires installed under the Propagation Program are serviced at no additional monthly charge. Monthly fees are due on the 1st, and are invoiced by Provider. THE MONTHLY FEE WILL NOT INCREASE FOR THE DURATION OF CONTINUOUS SERVICE. No rate-lock election is required; this is a term of this Agreement.',
		),
		array(
			'title' => '3. Equipment Ownership',
			'body'  => '(a) Ownership During Term. All Spire tower units, growing components, pumps, and associated equipment are and remain the sole property of Gawlak Family Farms during the term of this Agreement. The monthly fee is for the service and use of the System and does not, by itself, transfer ownership to the Customer. '
				. '(b) Ownership at Two-Year Completion. If the Customer completes a two-year (24-month) term of continuous service, ownership of the installed Spire tower units transfers to the Customer at the end of that term, at no additional charge. Until the two-year term is completed, the Spires remain the property of Gawlak Family Farms. '
				. '(c) Removal on Early Termination. If this Agreement ends for any reason before the two-year term is completed, Gawlak Family Farms retains ownership and may enter the property on reasonable notice to recover and remove its tower units and equipment. Plantings and harvestable produce present at the time of removal are the Customer\'s to keep. '
				. '(d) Care. Customer agrees not to relocate, dismantle, sell, or alter Spire tower units that remain Provider property, and to provide reasonable protection against avoidable damage, normal weather and growing conditions excepted.',
		),
		array(
			'title' => '4. The Propagation Program (Included)',
			'body'  => 'The Propagation Program is included at no charge and requires no election or additional payment. After twelve (12) months of continuous service, and on each anniversary thereafter, the following occur at no additional charge to the Customer: (a) CUSTOMER SPIRE. One free Spire Tower is installed at the Customer\'s Property. It becomes the Customer\'s property upon installation and is not subject to the equipment-ownership or removal terms of Section 3. Its maintenance is included in the existing monthly fee, which does not increase. (b) DONATED MODULE. Gawlak Family Farms installs one Zora Sunrise Module, at no cost, for a recipient household selected by Provider. Recipient households are selected by Provider at its sole discretion. The donated module is not assignable, transferable, or redeemable by the Customer for cash, credit, or any other consideration, and the Customer acquires no interest in it. (c) CONTINUITY. Propagation is contingent on continuous service. Service interrupted or terminated before an anniversary forfeits that year\'s propagation. (d) SUBSTITUTION. Provider may substitute an equivalent system where site conditions make a Spire unsuitable.',
		),
		array(
			'title' => '5. Land Access & License to Tend',
			'body'  => '(a) Grant of License. Customer, as owner or lawful possessor of the property at the Service Address, grants Gawlak Family Farms a non-exclusive, revocable license to enter, access, and use the designated tower location solely to install, maintain, harvest from, and (on termination) remove the System. This license creates no leasehold, easement, or other real-property interest. '
				. '(b) Scope of Access. Access is limited to the tower location and reasonable pathways to reach it, during reasonable hours and with reasonable notice, except for emergency maintenance to protect the System or property. '
				. '(c) Termination of License. The license terminates automatically upon expiration or termination of the Agreement, at which point Provider retains only the limited right of entry needed to remove its equipment under Section 3.',
		),
		array(
			'title' => '6. Term & Changes',
			'body'  => 'Service begins on the agreed Start Date and continues month-to-month. Either party may terminate with thirty (30) days written notice. No fixed-term election is required. Ownership of the installed Spire tower units transfers to the Customer automatically upon completion of twenty-four (24) months of continuous service, as set out in Section 3. Termination before that date forfeits Spire ownership under Section 3 and any pending propagation under Section 4. This online enrollment records the Customer\'s acceptance; the full executed Service Agreement governs the relationship.',
		),
		array(
			'title' => '7. Getting Started — Design Consult & Starter Cost',
			'body'  => 'The total starter cost is $772, covering the professional consultation, custom design, build, installation, the Customer\'s first month of service, complimentary herb sections at the base of each Spire, enrollment in the Propagation Program, and one apparel item. (a) DESIGN CONSULT — $250. Payable at enrollment via PayPal. Provider attends the Property to assess light, water, wind, surface, and constraints; marks each Spire footprint; photographs the site; and works with the Customer to determine planting preferences. The $250 is NON-REFUNDABLE but is CREDITED IN FULL toward the Customer\'s design, build, and install. An on-site design consult is available only with this payment. If Provider determines the Property is not suitable, or the Customer elects not to proceed, the Customer retains the design and the $250 is retained by Provider as compensation for the assessment and design work performed. (b) BALANCE — $522, due at install. (c) The starter cost includes the Customer\'s first month of service. Monthly billing begins in month two.',
		),
	);
}

/* ---- [gff_tower_agreement] ---- */
add_shortcode( 'gff_tower_agreement', 'gff_sc_tower_agreement' );
function gff_sc_tower_agreement( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => 'The Spire Service Agreement' ), $atts, 'gff_tower_agreement' );
	$sections = gff_reg_tower_agreement_sections();
	ob_start(); ?>
	<fieldset class="gff-reg__group" data-gff-section="agreement" data-gff-required="1">
		<details class="gff-acc-wrap">
			<summary class="gff-acc-wrap__summary">Spire Service Agreement <span class="gff-acc-wrap__hint">(tap to read)</span><span class="gff-acc__chev" aria-hidden="true"></span></summary>
			<div class="gff-acc">
				<?php foreach ( $sections as $i => $s ) : ?>
					<details class="gff-acc__item"<?php echo 0 === $i ? ' open' : ''; ?>>
						<summary><?php echo esc_html( $s['title'] ); ?><span class="gff-acc__chev" aria-hidden="true"></span></summary>
						<div class="gff-acc__body"><p><?php echo esc_html( $s['body'] ); ?></p></div>
					</details>
				<?php endforeach; ?>
			</div>
		</details>
		<?php echo gff_reg_three_sisters_field( false ); ?>
		<label class="gff-check">
			<input type="checkbox" name="gff_agree" value="yes"<?php echo gff_reg_old_checked( 'gff_agree', 'yes' ); ?> required>
			<span>I have read and accept the Gawlak Family Farms Spire Service Agreement (v<?php echo esc_html( gff_reg_agreement_version() ); ?>).</span>
		</label>
	</fieldset>
	<?php return ob_get_clean();
}

/* ---- Add-on catalog (single source of truth) ---- */
function gff_reg_addons() {
	return array(
		'workshop' => array(
			'emoji' => '🎟️',
			'power' => 'Wizard&rsquo;s Apprenticeship',
			'name'  => 'The Business of Abundance Workshop',
			'desc'  => 'A seat at our monthly Fort Pierce workshop — JADAM, lazy-gardening, and abundance principles for any business or career. Every attendee gets a free surprise plant.',
			'price' => 50,
			'value' => 120,
			'icon'  => 'wizard',
			'paypal_url' => '', // PayPal link when ready
		),
		'starfruit' => array(
			'emoji' => '🌳',
			'power' => 'Funny Comet',
			'name'  => 'Starfruit Tree',
			'desc'  => 'A grafted, fruit-bearing starfruit tree planted right in your module — yours to harvest for years.',
			'price' => 75,
			'value' => 175,
			'icon'  => 'comet',
			'paypal_url' => '', // PayPal link when ready
		),
		'strawberry' => array(
			'emoji' => '🍓',
			'power' => 'Children&rsquo;s Mead',
			'name'  => 'Strawberry Patch',
			'desc'  => '10 producing strawberry plants, installed and ready to fruit.',
			'price' => 45,
			'value' => 120,
			'icon'  => 'mead',
			'paypal_url' => '', // PayPal link when ready
		),
		'pollinator' => array(
			'emoji' => '🦋',
			'power' => 'Faerie Food',
			'name'  => 'Butterfly Pollinator Border',
			'desc'  => 'A ~30 sq ft flowering border that draws butterflies and bees — beautiful, and good for every crop around it.',
			'price' => 60,
			'value' => 150,
			'icon'  => 'faerie',
			'paypal_url' => '', // PayPal link when ready
		),
		'headstart' => array(
			'emoji' => '🌱',
			'power' => 'Time Travel Boots',
			'name'  => 'Nursery Head-Start + Microgreens Trial',
			'desc'  => 'We pre-grow your module&rsquo;s plants at our nursery so they&rsquo;re established the day your soil is ready — plus 4 weeks of weekly black-oil sunflower microgreens to harvest while you wait.',
			'price' => 50,
			'value' => 180,
			'icon'  => 'boots',
			'paypal_url' => '', // ← paste this add-on's PayPal payment link here when ready
		),

		/* ============================================================
		 * TO ADD A NEW ADD-ON LATER: copy the block below, give it a
		 * unique key, fill in the fields, and (when you've made the
		 * PayPal product) paste its payment link into 'paypal_url'.
		 * Remove the leading // on each line to activate it.
		 * ============================================================ */
		// 'your_key' => array(
		// 	'emoji' => '🌼',
		// 	'power' => '',                       // optional flavor name
		// 	'name'  => 'Add-on display name',
		// 	'desc'  => 'One-line description the customer sees.',
		// 	'price' => 0,                        // dollars, charged via PayPal later
		// 	'value' => 0,                        // est. retail value (optional)
		// 	'icon'  => '',
		// 	'paypal_url' => '',                  // PayPal payment link
		// ),
	);
}
function gff_reg_bundle() {
	return array(
		'emoji' => '🌟',
		'power' => 'The Abundance Bundle',
		'name'  => 'Every bounty, claimed at once',
		'desc'  => 'Wizard&rsquo;s Apprenticeship, Funny Comet, Children&rsquo;s Mead, Faerie Food, and Time Travel Boots — every power-up, bundled into one.',
		'price' => 175,
		'icon'  => 'bundle',
	);
}
function gff_reg_addons_value_total() {
	$t = 0;
	foreach ( gff_reg_addons() as $a ) { $t += (int) $a['value']; }
	return $t; // 745
}

/* ---- SVG icon set for add-ons (geometric/line art, currentColor) ---- */
function gff_reg_addon_svg( $key ) {
	$svgs = array(
		'wizard'  => '<path d="M16 4 L24 22 L8 22 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="11" r="1.6" fill="currentColor"/><path d="M13 16 L19 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6 26 L26 26" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 22 L16 26" stroke="currentColor" stroke-width="1.5"/>',
		'comet'   => '<path d="M20 6 L21.8 11 L27 11.5 L23 15 L24.2 20 L20 17 L15.8 20 L17 15 L13 11.5 L18.2 11 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13 19 L6 26" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 20 L10 26" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>',
		'mead'    => '<path d="M10 7 L22 7 L21 16 Q16 20 11 16 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 18 L16 24" stroke="currentColor" stroke-width="1.8"/><path d="M11 25 L21 25" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="12" r="1.4" fill="currentColor"/><path d="M13 10 L19 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>',
		'faerie'  => '<circle cx="16" cy="16" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14 14 Q7 8 6 14 Q7 19 14 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M18 14 Q25 8 26 14 Q25 19 18 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 4 L16 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="16" cy="4" r="1.1" fill="currentColor"/>',
		'boots'   => '<path d="M11 5 L11 18 L20 18 Q24 18 24 22 L24 24 L9 24 L9 5 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 24 L7 27 M13 24 L11 27 M17 24 L15 27 M21 24 L19 27" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/><path d="M5 9 L9 11 M5 13 L9 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>',
		'bundle'  => '<path d="M16 3 L19.8 11.2 L28 12 L22 18 L23.6 26 L16 22 L8.4 26 L10 18 L4 12 L12.2 11.2 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="16" cy="15" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/>',
	);
	return isset( $svgs[ $key ] ) ? $svgs[ $key ] : '';
}

/* ---- [gff_addons] ---- */
add_shortcode( 'gff_addons', 'gff_sc_addons' );
function gff_sc_addons( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => 'Claim Your Bounties' ), $atts, 'gff_addons' );
	$addons = gff_reg_addons();
	$bundle = gff_reg_bundle();
	$bundle_value = gff_reg_addons_value_total();
	global $gff_reg_state;
	$repop = ! empty( $gff_reg_state['repop'] );
	ob_start(); ?>
	<?php $prev_addons = ( $repop && ! empty( $gff_reg_state['old']['gff_addons'] ) ); // keep it open if they'd already claimed some (validation repop) ?>
	<details class="gff-reg__group gff-bounty" data-gff-section="addons"<?php echo $prev_addons ? ' open' : ''; ?>>
		<summary class="gff-bounty__summary">
			<span class="gff-bounty__summary-emoji" aria-hidden="true">&#9876;&#65039;</span>
			<span class="gff-bounty__summary-text">
				<span class="gff-bounty__legend"><?php echo esc_html( $a['legend'] ); ?> <span class="gff-bounty__opt">(optional power-ups)</span></span>
				<span class="gff-bounty__summary-hint">5 collectible power-ups &mdash; tap to open</span>
			</span>
			<span class="gff-bounty__chev" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
		</summary>
		<div class="gff-bounty__body">
		<p class="gff-bounty__lead">Level up your module with collectible bounties. Claim any below &mdash; or grab <strong>The Abundance Bundle</strong> and unlock them all for less than half. <strong>Bounties are invoiced separately after you enroll</strong> (your $100 reservation stays the same).</p>

		<!-- Bundle hero tile -->
		<label class="gff-bounty-tile gff-bounty-tile--bundle">
			<input type="checkbox" name="gff_addons[]" value="bundle" class="gff-bounty__check gff-bounty__check--bundle"<?php echo $repop ? gff_reg_old_checked( 'gff_addons', 'bundle' ) : ''; ?>>
			<span class="gff-bounty-tile__inner">
				<span class="gff-bounty-tile__check" aria-hidden="true">&#10003;</span>
				<span class="gff-bounty-tile__icon">
					<svg viewBox="0 0 32 32" width="44" height="44"><?php echo gff_reg_addon_svg( $bundle['icon'] ); // phpcs:ignore ?></svg>
				</span>
				<span class="gff-bounty-tile__power"><?php echo $bundle['emoji'] . ' ' . wp_kses_post( $bundle['power'] ); ?></span>
				<span class="gff-bounty-tile__name"><?php echo wp_kses_post( $bundle['name'] ); ?></span>
				<span class="gff-bounty-tile__price">$<?php echo esc_html( $bundle['price'] ); ?> <span class="gff-bounty-tile__was">$<?php echo esc_html( $bundle_value ); ?> value</span></span>
				<span class="gff-bounty-tile__desc"><?php echo wp_kses_post( $bundle['desc'] ); ?></span>
				<span class="gff-bounty-tile__save">★ Save $<?php echo esc_html( $bundle_value - $bundle['price'] ); ?> — all 5 bounties</span>
			</span>
		</label>

		<p class="gff-bounty__or">&mdash; or claim them one by one &mdash;</p>

		<div class="gff-bounty-grid">
		<?php foreach ( $addons as $key => $item ) : ?>
			<label class="gff-bounty-tile gff-bounty-tile--single">
				<input type="checkbox" name="gff_addons[]" value="<?php echo esc_attr( $key ); ?>" class="gff-bounty__check gff-bounty__check--single"<?php echo $repop ? gff_reg_old_checked( 'gff_addons', $key ) : ''; ?>>
				<span class="gff-bounty-tile__inner">
					<span class="gff-bounty-tile__check" aria-hidden="true">&#10003;</span>
					<span class="gff-bounty-tile__icon">
						<svg viewBox="0 0 32 32" width="40" height="40"><?php echo gff_reg_addon_svg( $item['icon'] ); // phpcs:ignore ?></svg>
					</span>
					<span class="gff-bounty-tile__power"><?php echo $item['emoji'] . ' ' . wp_kses_post( $item['power'] ); ?></span>
					<span class="gff-bounty-tile__name"><?php echo wp_kses_post( $item['name'] ); ?></span>
					<span class="gff-bounty-tile__price">+$<?php echo esc_html( $item['price'] ); ?> <span class="gff-bounty-tile__was">$<?php echo esc_html( $item['value'] ); ?> value</span></span>
					<span class="gff-bounty-tile__desc"><?php echo wp_kses_post( $item['desc'] ); ?></span>
				</span>
			</label>
		<?php endforeach; ?>
		</div>

		<div class="gff-bounty__total" id="gff-addons-total" hidden>
			<span class="gff-bounty__total-label">Bounties claimed:</span>
			<span class="gff-bounty__total-amt" id="gff-addons-total-amt">$0</span>
			<span class="gff-bounty__total-note">Invoiced separately after you enroll.</span>
		</div>
		</div>
	</details>

	<script>
	(function(){
		var wrap = document.querySelector('.gff-bounty');
		if(!wrap) return;
		var prices = <?php
			$p = array( 'bundle' => $bundle['price'] );
			foreach ( $addons as $k => $it ) { $p[ $k ] = (int) $it['price']; }
			echo wp_json_encode( $p );
		?>;
		var bundleBox = wrap.querySelector('.gff-bounty__check--bundle');
		var singleBoxes = Array.prototype.slice.call(wrap.querySelectorAll('.gff-bounty__check--single'));
		var totalWrap = wrap.querySelector('#gff-addons-total');
		var totalAmt = wrap.querySelector('#gff-addons-total-amt');

		function syncTile(box){
			var tile = box.closest('.gff-bounty-tile');
			if(tile){ tile.classList.toggle('is-claimed', box.checked); }
		}
		function recalc(){
			var sum = 0, anyChecked = false;
			if(bundleBox.checked){ sum = prices.bundle; anyChecked = true; }
			else {
				singleBoxes.forEach(function(b){
					if(b.checked){ sum += (prices[b.value] || 0); anyChecked = true; }
				});
			}
			totalAmt.textContent = '$' + sum;
			totalWrap.hidden = !anyChecked;
		}

		// Claiming the bundle clears the individuals (no double-count); claiming an individual clears the bundle.
		bundleBox.addEventListener('change', function(){
			if(bundleBox.checked){ singleBoxes.forEach(function(b){ b.checked = false; syncTile(b); }); }
			syncTile(bundleBox);
			recalc();
		});
		singleBoxes.forEach(function(b){
			b.addEventListener('change', function(){
				if(b.checked){ bundleBox.checked = false; syncTile(bundleBox); }
				syncTile(b);
				recalc();
			});
		});
		// initial state (after repop)
		syncTile(bundleBox);
		singleBoxes.forEach(syncTile);
		recalc();
	})();
	</script>
	<?php return ob_get_clean();
}

/* ---- [gff_submit] ---- */
add_shortcode( 'gff_submit', 'gff_sc_submit' );
function gff_sc_submit( $atts = array() ) {
	$a = shortcode_atts( array( 'label' => 'Create my account & enroll' ), $atts, 'gff_submit' );
	ob_start(); ?>
	<button type="submit" name="gff_reg_submit" value="1" class="gff-btn"><?php echo esc_html( $a['label'] ); ?></button>
	<p class="gff-fineprint">This online enrollment records your acceptance; the full executed Service Agreement governs the relationship.</p>
	<?php return ob_get_clean();
}

/* ---- Express-flow shortcodes (variant page) ---- */

/* [gff_express_start] — opens the form with the express nonce + submit name */
add_shortcode( 'gff_express_start', 'gff_sc_express_start' );
function gff_sc_express_start( $atts = array() ) {
	global $gff_reg_state;
	if ( $gff_reg_state['form_open'] ) { return ''; }
	$gff_reg_state['form_open'] = true;
	ob_start();
	echo $gff_reg_state['notice'];
	?>
	<div class="gff-reg gff-reg--express">
		<form class="gff-reg__form" method="post" novalidate id="gff-express-form">
			<?php wp_nonce_field( 'gff_express_action', 'gff_express_nonce' ); ?>
			<input type="hidden" name="gff_offer" id="gff_offer_field_x" value="">
			<div class="gff-hp" aria-hidden="true">
				<label>Company URL <input type="text" name="gff_company_url" tabindex="-1" autocomplete="off"></label>
			</div>
	<?php
	return ob_get_clean();
}

/* [gff_express_email] — the single required field for the express flow */
add_shortcode( 'gff_express_email', 'gff_sc_express_email' );
function gff_sc_express_email( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => 'Reserve your spot', 'label' => 'Your email' ), $atts, 'gff_express_email' );
	global $gff_reg_state;
	$val = ( ! empty( $gff_reg_state['repop'] ) && ! empty( $gff_reg_state['old']['gff_express_email'] ) )
		? ' value="' . esc_attr( $gff_reg_state['old']['gff_express_email'] ) . '"' : '';
	ob_start(); ?>
	<fieldset class="gff-reg__group gff-express-email" data-gff-section="express-email">
		<legend><?php echo esc_html( $a['legend'] ); ?></legend>
		<label class="gff-express-email__label"><?php echo esc_html( $a['label'] ); ?>
			<input type="email" name="gff_email"<?php echo $val; ?> required placeholder="you@email.com">
		</label>
		<p class="gff-express-email__note">That&rsquo;s all we need to hold your spot. You can add the rest now or after.</p>
	</fieldset>
	<?php return ob_get_clean();
}

/* [gff_express_submit] — the express submit button */
add_shortcode( 'gff_express_submit', 'gff_sc_express_submit' );
function gff_sc_express_submit( $atts = array() ) {
	$a = shortcode_atts( array( 'label' => 'Reserve my spot' ), $atts, 'gff_express_submit' );
	ob_start(); ?>
	<button type="submit" name="gff_express_submit" value="1" class="gff-btn"><?php echo esc_html( $a['label'] ); ?></button>
	<p class="gff-fineprint">Reserving records your interest; the full executed Service Agreement governs any ongoing service.</p>
	<?php return ob_get_clean();
}


/* ============================================================
 * TOWER (SPIRE) FLOW — vertical tower systems
 *   Pricing: $100 first tower, $50 each additional (cap 100).
 *   Honest food value ~$100/mo per tower: top showcase floor (fruits/roots/vines) + 4 floors of greens;
 *   herb bonus section is included but NOT counted in food value.
 *   Mirrors the express flow: own nonce, own handler, own events.
 * ============================================================ */

/* Pricing/value constants — single source of truth, shared with the JS stepper. */
function gff_reg_tower_first_price()  { return 100; }   // $/mo, tower #1
function gff_reg_tower_addl_price()   { return 50;  }   // $/mo, each additional tower
function gff_reg_tower_max()          { return 100; }   // hard cap
function gff_reg_tower_food_value()   { return 100; }   // honest est. $/mo of real food per tower: top showcase floor (fruits/roots/vines) + 4 greens floors; herb section NOT counted
function gff_reg_tower_crosssell_pct(){ return 10;  }   // % off the FIRST add-on tower only

/* total monthly for a given tower count */
function gff_reg_tower_total( $qty ) {
	$qty = max( 0, min( (int) $qty, gff_reg_tower_max() ) );
	if ( $qty <= 0 ) { return 0; }
	$total = gff_reg_tower_first_price() + ( $qty - 1 ) * gff_reg_tower_addl_price();
	if ( $qty >= 3 ) { $total -= gff_reg_tower_addl_price(); } // 3rd Spire free forever at 3+
	return $total;
}
/* what they'd pay if EVERY tower were full price — the honest reference for "savings" */
function gff_reg_tower_full_reference( $qty ) {
	$qty = max( 0, min( (int) $qty, gff_reg_tower_max() ) );
	return $qty * gff_reg_tower_first_price();
}

/* [gff_tower_start] — opens the tower form with its own nonce */
add_shortcode( 'gff_tower_start', 'gff_sc_tower_start' );
function gff_sc_tower_start( $atts = array() ) {
	global $gff_reg_state;
	if ( $gff_reg_state['form_open'] ) { return ''; }
	$gff_reg_state['form_open'] = true;
	ob_start();
	echo $gff_reg_state['notice'];
	?>
	<div class="gff-reg gff-reg--spire">
		<form class="gff-reg__form" method="post" novalidate id="gff-tower-form">
			<?php wp_nonce_field( 'gff_tower_action', 'gff_tower_nonce' ); ?>
			<div class="gff-hp" aria-hidden="true">
				<label>Company URL <input type="text" name="gff_company_url" tabindex="-1" autocomplete="off"></label>
			</div>
	<?php
	return ob_get_clean();
}

/* [gff_tower_count] — animated stepper: count + live savings + live food value + monthly total */
add_shortcode( 'gff_tower_count', 'gff_sc_tower_count' );
function gff_sc_tower_count( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => '⚡ Summon Your Spires', 'start' => '1' ), $atts, 'gff_tower_count' );
	global $gff_reg_state;
	$start = (int) $a['start']; if ( $start < 1 ) { $start = 1; }
	if ( ! empty( $gff_reg_state['repop'] ) && ! empty( $gff_reg_state['old']['gff_tower_qty'] ) ) {
		$start = (int) $gff_reg_state['old']['gff_tower_qty'];
	}
	$start = max( 1, min( $start, gff_reg_tower_max() ) );
	$first = gff_reg_tower_first_price();
	$addl  = gff_reg_tower_addl_price();
	$food  = gff_reg_tower_food_value();
	$max   = gff_reg_tower_max();
	ob_start(); ?>
	<fieldset class="gff-reg__group gff-spire-count" data-gff-section="tower-count">
		<div class="gff-spire-count__head"><?php echo esc_html( $a['legend'] ); ?></div>
		<p class="gff-spire-count__lead">Your first Spire is <strong>$<?php echo (int) $first; ?>/mo</strong>. Every Spire after <strong>unlocks at $<?php echo (int) $addl; ?>/mo</strong> &mdash; half price, forever.</p>

		<div class="gff-spire-stepper">
			<button type="button" class="gff-spire-stepper__btn" id="gff-spire-minus" aria-label="Remove a Spire">&minus;</button>
			<div class="gff-spire-stepper__count">
				<input type="number" name="gff_tower_qty" id="gff-tower-qty" value="<?php echo (int) $start; ?>" min="1" max="<?php echo (int) $max; ?>" inputmode="numeric" aria-label="Number of Spires">
				<span class="gff-spire-stepper__unit">Spires</span>
			</div>
			<button type="button" class="gff-spire-stepper__btn" id="gff-spire-plus" aria-label="Add a Spire">+</button>
		</div>

		<div class="gff-spire-readout">
			<div class="gff-spire-readout__row gff-spire-readout__row--save">
				<span class="gff-spire-readout__label">You&rsquo;re saving</span>
				<span class="gff-spire-readout__big" id="gff-spire-save">$0/yr</span>
			</div>
			<div class="gff-spire-readout__row gff-spire-readout__row--food">
				<span class="gff-spire-readout__label">Fresh food value <span class="gff-spire-readout__fine">(est. at steady production)</span></span>
				<span class="gff-spire-readout__mid" id="gff-spire-food">$<?php echo (int) $food; ?>/mo</span>
			</div>
			<div class="gff-spire-readout__row gff-spire-readout__row--total">
				<span class="gff-spire-readout__label">Your monthly total</span>
				<span class="gff-spire-readout__total" id="gff-spire-total">$<?php echo (int) $first; ?>/mo</span>
			</div>
		</div>
		<p class="gff-spire-freegift" id="gff-spire-freegift" hidden>🎁 Your 3rd Spire is <strong>FREE, forever</strong> &mdash; and stays free as long as you keep three or more.</p>
		<p class="gff-spire-count__bonus">Every Spire includes its own <strong>herb garden</strong> at the base &mdash; fresh herbs on top of your harvest, included.</p>
	</fieldset>

	<script>
	(function(){
		var FIRST=<?php echo (int) $first; ?>, ADDL=<?php echo (int) $addl; ?>, FOOD=<?php echo (int) $food; ?>, MAX=<?php echo (int) $max; ?>;
		var input=document.getElementById('gff-tower-qty');
		if(!input) return;
		var minus=document.getElementById('gff-spire-minus'), plus=document.getElementById('gff-spire-plus');
		var elSave=document.getElementById('gff-spire-save'), elFood=document.getElementById('gff-spire-food'), elTotal=document.getElementById('gff-spire-total');
		var elGift=document.getElementById('gff-spire-freegift');
		function clamp(n){ n=parseInt(n,10); if(isNaN(n)||n<1)n=1; if(n>MAX)n=MAX; return n; }
		function total(q){ if(q<=0)return 0; var t=FIRST+(q-1)*ADDL; if(q>=3)t-=ADDL; return t; }
		function fullRef(q){ return q*FIRST; }
		function pulse(el){ el.classList.remove('gff-pulse'); void el.offsetWidth; el.classList.add('gff-pulse'); }
		function render(animate){
			var q=clamp(input.value);
			var mo=total(q), save=(fullRef(q)-mo)*12, food=q*FOOD;
			elTotal.textContent='$'+mo.toLocaleString()+'/mo';
			elFood.textContent='$'+food.toLocaleString()+'/mo';
			elSave.textContent='$'+save.toLocaleString()+'/yr';
			elSave.parentNode.style.opacity = save>0 ? '1' : '0.45';
			if(elGift){ var show=q>=3; var was=!elGift.hasAttribute('hidden'); if(show){ elGift.removeAttribute('hidden'); if(animate&&!was)pulse(elGift); } else { elGift.setAttribute('hidden',''); } }
			if(animate){ pulse(elSave); pulse(elTotal); pulse(elFood); }
		}
		minus.addEventListener('click',function(){ input.value=clamp(input.value)-1; render(true); });
		plus.addEventListener('click',function(){ input.value=clamp(input.value)+1; render(true); });
		input.addEventListener('input',function(){ render(false); });
		input.addEventListener('change',function(){ input.value=clamp(input.value); render(true); });
		render(false);
	})();
	</script>
	<?php return ob_get_clean();
}

/* [gff_tower_email] — email-first capture for the tower express flow */
add_shortcode( 'gff_tower_email', 'gff_sc_tower_email' );
function gff_sc_tower_email( $atts = array() ) {
	$a = shortcode_atts( array( 'legend' => 'Claim your Spires', 'label' => 'Your email' ), $atts, 'gff_tower_email' );
	global $gff_reg_state;
	$val = ( ! empty( $gff_reg_state['repop'] ) && ! empty( $gff_reg_state['old']['gff_tower_email'] ) )
		? ' value="' . esc_attr( $gff_reg_state['old']['gff_tower_email'] ) . '"' : '';
	ob_start(); ?>
	<fieldset class="gff-reg__group gff-express-email gff-spire-email" data-gff-section="tower-email">
		<div class="gff-spire-email__head"><?php echo esc_html( $a['legend'] ); ?></div>
		<label class="gff-express-email__label"><?php echo esc_html( $a['label'] ); ?>
			<input type="email" name="gff_email"<?php echo $val; ?> required placeholder="you@email.com">
		</label>
		<p class="gff-express-email__note">That&rsquo;s all we need to reserve your Spires. You can add the rest now or after.</p>
	</fieldset>
	<?php return ob_get_clean();
}

/* [gff_tower_submit] — the tower submit button */
add_shortcode( 'gff_tower_submit', 'gff_sc_tower_submit' );
function gff_sc_tower_submit( $atts = array() ) {
	$a = shortcode_atts( array( 'label' => 'Claim my Spires' ), $atts, 'gff_tower_submit' );
	ob_start(); ?>
	<button type="submit" name="gff_tower_submit" value="1" class="gff-btn gff-btn--spire"><?php echo esc_html( $a['label'] ); ?></button>
	<p class="gff-fineprint">Reserving records your interest; the full executed Service Agreement governs any ongoing service.</p>
	<?php return ob_get_clean();
}

/* ---- [gff_lead_capture] ---- */
add_shortcode( 'gff_lead_capture', 'gff_sc_lead_capture' );
function gff_sc_lead_capture( $atts = array() ) {
	global $gff_reg_state;
	$a = shortcode_atts( array(
		'headline' => 'Get more info on The Zora Sunrise Module™',
		'pitch'    => 'A farm that comes with a farmer. $772 to start, then $300/month. Tell us a little and we&rsquo;ll be in touch.',
		'button'   => 'Send me info',
	), $atts, 'gff_lead_capture' );
	ob_start();
	echo $gff_reg_state['notice'];
	?>
	<div class="gff-reg gff-lead">
		<form class="gff-reg__form gff-lead__form" method="post" novalidate>
			<?php wp_nonce_field( 'gff_lead_action', 'gff_lead_nonce' ); ?>
			<input type="hidden" name="gff_offer" id="gff_offer_field_l" value="">
			<div class="gff-hp" aria-hidden="true">
				<label>Company URL <input type="text" name="gff_company_url" tabindex="-1" autocomplete="off"></label>
			</div>
			<header class="gff-lead__head">
				<h2 class="gff-lead__title"><?php echo esc_html( $a['headline'] ); ?></h2>
				<p class="gff-lead__pitch"><?php echo wp_kses_post( $a['pitch'] ); ?></p>
			</header>
			<div class="gff-grid">
				<label>First name<input type="text" name="gff_first" required></label>
				<label>Last name<input type="text" name="gff_last" required></label>
				<label>Email<input type="email" name="gff_email" required></label>
				<label>Phone<input type="tel" name="gff_phone" required></label>
				<label class="gff-col-2">City<input type="text" name="gff_city" required></label>
			</div>
			<button type="submit" name="gff_lead_submit" value="1" class="gff-btn"><?php echo esc_html( $a['button'] ); ?></button>
		</form>
	</div>
	<?php return ob_get_clean();
}

/* ---- [gff_registration] — DEPRECATED legacy all-in-one ---- */
add_shortcode( 'gff_registration', 'gff_sc_legacy_all_in_one' );
function gff_sc_legacy_all_in_one( $atts = array() ) {
	$out  = gff_sc_form_start();
	$out .= '<header class="gff-reg__head">';
	$out .= '<p class="gff-reg__brand">Gawlak Family Farms</p>';
	$out .= '<p class="gff-reg__zone">Zone 10a &middot; Fort Pierce, FL</p>';
	$out .= '<div class="gff-reg__banner">What would you like to grow?</div>';
	$out .= '<a class="gff-reg__phone" href="tel:17729247459">772.924.7459</a>';
	$out .= '</header>';
	$out .= gff_sc_farm_builder();
	$out .= gff_sc_pitch();
	$out .= gff_sc_details();
	$out .= gff_sc_address();
	$out .= gff_sc_start_date();
	$out .= gff_sc_login();
	$out .= gff_sc_agreement();
	$out .= gff_sc_consult();
	$out .= gff_sc_submit();
	$out .= gff_sc_form_end();
	return $out;
}

/* ---- [gff_my_farm] — front-end view of the logged-in customer's saved farm ---- */
add_shortcode( 'gff_my_farm', 'gff_sc_my_farm' );
function gff_sc_my_farm( $atts = array() ) {
	if ( ! is_user_logged_in() ) {
		return '<div class="gff-myfarm gff-myfarm--guest"><p>Please log in to view your farm.</p></div>';
	}
	$uid    = get_current_user_id();
	$crops  = get_user_meta( $uid, 'gff_crops_wanted', true );
	if ( ! is_array( $crops ) ) { $crops = array(); }
	$layout_raw = (string) get_user_meta( $uid, 'gff_farm_layout', true );
	$moringa    = 'yes' === get_user_meta( $uid, 'gff_moringa_fruit_upgrade', true );
	$first      = get_user_meta( $uid, 'first_name', true );

	// Sunrise-member Spire actions (nonce-guarded POSTs to self).
	$spire_unlocked = ( 'yes' === get_user_meta( $uid, 'gff_spire_unlocked', true ) );
	$spire_notice   = '';

	// Unlock intent — customer requested an invoice, or the PayPal click beacon fired.
	if ( ! $spire_unlocked && isset( $_POST['gff_spire_unlock_nonce'] )
		&& wp_verify_nonce( sanitize_key( wp_unslash( $_POST['gff_spire_unlock_nonce'] ) ), 'gff_spire_unlock_' . $uid ) ) {
		$channel = sanitize_key( wp_unslash( $_POST['gff_spire_unlock_action'] ?? '' ) );
		if ( in_array( $channel, array( 'invoice', 'paypal' ), true ) ) {
			update_user_meta( $uid, 'gff_spire_unlock_request', array(
				'channel' => $channel,
				'time'    => current_time( 'mysql' ),
				'status'  => 'invoice' === $channel ? 'invoice_requested' : 'paypal_clicked',
			) );
			gff_reg_send_spire_unlock_email( $uid, $channel );
			if ( 'invoice' === $channel ) {
				$spire_notice = '<div class="gff-acct__notice gff-acct__notice--ok">Invoice requested &mdash; watch your email. Your Spire designer unlocks here as soon as the $100 lands.</div>';
			}
		}
	}

	if ( $spire_unlocked && isset( $_POST['gff_spire_req_nonce'] )
		&& wp_verify_nonce( sanitize_key( wp_unslash( $_POST['gff_spire_req_nonce'] ) ), 'gff_spire_req_' . $uid ) ) {
		$req_qty     = max( 1, min( 10, (int) ( $_POST['gff_spire_req_qty'] ?? 1 ) ) );
		$req_monthly = gff_sunrise_spire_monthly( $req_qty );
		update_user_meta( $uid, 'gff_spire_addon_request', array(
			'qty'     => $req_qty,
			'monthly' => $req_monthly,
			'time'    => current_time( 'mysql' ),
			'status'  => 'requested',
		) );
		gff_reg_send_spire_request_email( $uid, $req_qty, $req_monthly );
		$spire_notice = '<div class="gff-acct__notice gff-acct__notice--ok">Spires requested! We&rsquo;ll reach out to schedule your install &mdash; nothing is billed until we confirm together.</div>';
	}

	$colors = array(
		'Tomatoes'=>'#e23b2e','Cherry tomatoes'=>'#f0524a','Everglades tomato'=>'#c62f23','Peppers'=>'#e84e1b','Hot peppers'=>'#cc2a16',
		'Lettuce & greens'=>'#7fc241','Broccoli'=>'#3f7a34','Cauliflower'=>'#ede7cf','Cabbage'=>'#9bc36a','Kale'=>'#2f6b39','Collards'=>'#4a8c3f',
		'Swiss chard'=>'#c0354f','Mustard greens'=>'#8fae3a','Spinach'=>'#3c7d3c','Longevity spinach'=>'#5a9e4a','Bok choy'=>'#b7d36a',
		'Carrots'=>'#ef7a1a','Beets'=>'#9b2242','Radish'=>'#d93a55','Onions'=>'#e8d8b0','Green onions'=>'#86bf57','Peas'=>'#73b84d',
		'Bush beans'=>'#5c9e3f','Pole beans'=>'#4d8a37','Southern peas'=>'#a8936b','Pigeon pea'=>'#b6a33f','Squash & zucchini'=>'#3f8a3a',
		'Cucumbers'=>'#4f9e46','Watermelon'=>'#3f7d3a','Cantaloupe'=>'#e8a85c','Okra'=>'#5a8f3a','Sweet potato'=>'#c46a3f',
		'Seminole pumpkin'=>'#d98b35','Strawberries'=>'#e23250',
		'Sweet pea'=>'#c77fb0','Snapdragon'=>'#e85a7a',"Bachelor's button"=>'#3f6bc4','Nasturtium'=>'#ef6f1f','Pansy / viola'=>'#7d4ba8',
		'Zinnia'=>'#e6447e','Sunflower'=>'#f2b821','Cosmos'=>'#e57aa0','Marigold'=>'#f08a1c','Celosia'=>'#cc2f5a','Portulaca'=>'#ef6aa0',
		'Vinca'=>'#d987b8','Morning glory'=>'#5566c4','Coreopsis'=>'#f4c023',
		'Cilantro'=>'#5fa345','Dill'=>'#86b84a','Parsley'=>'#3f8a44','Fennel'=>'#9cc05a','Basil'=>'#3c7d40','Lemongrass'=>'#bcd17a',
		'Ginger / turmeric'=>'#e0a52e','Rosemary'=>'#4a7a5c','Oregano'=>'#6a9a4a','Mint'=>'#54b07a','Thyme'=>'#7a9e5a',
		'Cranberry hibiscus'=>'#a52f4a','Moringa'=>'#4f8c46',
	);
	$chip = function( $name ) use ( $colors ) {
		$c = isset( $colors[ $name ] ) ? $colors[ $name ] : '#888';
		return '<span class="gff-mf-chip"><span class="gff-mf-dot" style="background:' . esc_attr( $c ) . '"></span>' . esc_html( $name ) . '</span>';
	};

	ob_start(); ?>
	<div class="gff-myfarm">
		<h2 class="gff-mf-title"><?php echo $first ? esc_html( $first ) . '&rsquo;s' : 'Your'; ?> Farm</h2>
		<?php
		$layout = $layout_raw ? json_decode( $layout_raw, true ) : null;
		if ( is_array( $layout ) && ! empty( $layout['towers'] ) ) {
			echo '<p class="gff-mf-sub">Your Spire towers</p>';
			foreach ( $layout['towers'] as $tw ) {
				echo '<div class="gff-mf-tower"><div class="gff-mf-th">Tower ' . intval( $tw['tower'] ) . '</div><div class="gff-mf-chips">';
				if ( ! empty( $tw['plants'] ) ) { foreach ( $tw['plants'] as $p ) { echo $chip( $p ); } }
				else { echo '<span class="gff-mf-empty">We&rsquo;ll plant this one for you</span>'; }
				echo '</div></div>';
			}
			echo '<p class="gff-mf-herb">🌿 Plus a free herb garden at the base of every tower.</p>';
		} elseif ( is_array( $layout ) && ! empty( $layout['seasonal_spots'] ) ) {
			echo '<p class="gff-mf-sub">Your seasonal bed</p><div class="gff-mf-chips">';
			foreach ( $layout['seasonal_spots'] as $p ) { echo $chip( $p ); }
			echo '</div><p class="gff-mf-herb">Your food-forest backbone (moringa, greens, tomatoes, peppers &amp; more) is included and planted for you.</p>';
		} elseif ( ! empty( $crops ) ) {
			echo '<p class="gff-mf-sub">Plants you chose</p><div class="gff-mf-chips">';
			foreach ( $crops as $p ) { echo $chip( $p ); }
			echo '</div>';
		} else {
			echo '<p class="gff-mf-none">You haven&rsquo;t customized your planting yet &mdash; that&rsquo;s perfectly fine. We&rsquo;ll design a thriving farm for you. Want to choose? Reply to your welcome email or give us a call.</p>';
		}
		if ( $moringa ) {
			echo '<p class="gff-mf-up">🌳 Moringa &rarr; fruit tree upgrade selected <small>(invoiced separately, not at signup)</small></p>';
		}

		// Sunrise members, Spire design NOT yet unlocked: a slim "summon" chip that
		// lives quietly in the background; tapping it reveals the $100 unlock panel
		// (PayPal link or invoice request). Rendered BEFORE the add-ons sections.
		if ( 'sunrise' === gff_reg_customer_offer( $uid ) && ! $spire_unlocked ) {
			echo $spire_notice; // already escaped markup
			$unlock_req     = get_user_meta( $uid, 'gff_spire_unlock_request', true );
			$unlock_pending = is_array( $unlock_req ) && ! empty( $unlock_req['status'] );
			?>
			<div class="gff-mf-unlock">
				<button type="button" class="gff-mf-unlock__summon" id="gff-mf-unlock-summon">⚡ <?php echo $unlock_pending ? 'Spire unlock pending&hellip;' : 'Unlock Spire design'; ?></button>
				<div class="gff-mf-unlock__panel" id="gff-mf-unlock-panel" hidden>
					<p class="gff-mf-sub">🔒⚡ Unlock Spire design</p>
					<p class="gff-mf-spires__deal"><strong>Climb to the top of the food chain.</strong> Unlock the Spire designer for <strong>$100</strong> and add vertical towers to your Sunrise farm &mdash; with your <strong>2nd Spire FREE</strong> (Sunrise exclusive) on top of the <strong>3rd free, forever</strong>, that everyone gets.</p>
					<?php if ( $unlock_pending ) : ?>
						<p class="gff-mf-spires__req"><?php echo 'invoice_requested' === $unlock_req['status'] ? 'Invoice requested' : 'Payment started'; ?> on <?php echo esc_html( mysql2date( 'M j', $unlock_req['time'] ) ); ?> &mdash; your designer unlocks as soon as the $100 lands.</p>
					<?php endif; ?>
					<div class="gff-mf-unlock__actions">
						<a class="gff-acct__btn" id="gff-mf-unlock-paypal" href="<?php echo esc_url( gff_reg_paypal_link() ); ?>" target="_blank" rel="noopener">Pay $100 with PayPal</a>
						<form method="post" class="gff-mf-unlock__invform">
							<?php wp_nonce_field( 'gff_spire_unlock_' . $uid, 'gff_spire_unlock_nonce' ); ?>
							<input type="hidden" name="gff_spire_unlock_action" value="invoice">
							<button type="submit" class="gff-mf-unlock__inv">or request an invoice</button>
						</form>
					</div>
					<p class="gff-mf-herb">Once your $100 lands, the Spire designer unlocks right here on your account.</p>
				</div>
			</div>
			<script>
			(function(){
				var s=document.getElementById('gff-mf-unlock-summon'), p=document.getElementById('gff-mf-unlock-panel');
				if(!s||!p) return;
				s.onclick=function(){ p.hidden=!p.hidden; if(!p.hidden&&typeof gtag==='function'){gtag('event','spire_unlock_open',{event_category:'gff_funnel'});} };
				var pp=document.getElementById('gff-mf-unlock-paypal');
				if(pp){ pp.addEventListener('click',function(){
					if(typeof gtag==='function'){gtag('event','spire_unlock_paypal',{event_category:'gff_funnel',value:100});}
					try{
						var fd=new FormData();
						fd.append('gff_spire_unlock_nonce','<?php echo esc_js( wp_create_nonce( 'gff_spire_unlock_' . $uid ) ); ?>');
						fd.append('gff_spire_unlock_action','paypal');
						if(navigator.sendBeacon){ navigator.sendBeacon(window.location.href, fd); }
						else{ fetch(window.location.href,{method:'POST',body:fd,keepalive:true}); }
					}catch(e){}
				}); }
				var inv=document.querySelector('.gff-mf-unlock__invform');
				if(inv&&typeof gtag==='function'){ inv.addEventListener('submit',function(){ gtag('event','spire_unlock_invoice',{event_category:'gff_funnel',value:100}); }); }
			})();
			</script>
			<?php
		}

		// Sunrise members with Spire design unlocked: the Add-Spires offer (2nd FREE —
		// Sunrise exclusive; 3rd FREE as always). Rendered BEFORE the add-ons sections.
		if ( 'sunrise' === gff_reg_customer_offer( $uid ) && $spire_unlocked ) {
			echo $spire_notice; // already escaped markup
			$existing_req = get_user_meta( $uid, 'gff_spire_addon_request', true );
			$first_p      = (int) gff_reg_tower_first_price();
			$addl_p       = (int) gff_reg_tower_addl_price();
			?>
			<div class="gff-mf-spires">
				<p class="gff-mf-sub">⚡ Add Spires to your farm</p>
				<p class="gff-mf-spires__deal">Sunrise members only: your <strong>2nd Spire is FREE</strong> &mdash; on top of the <strong>3rd free, forever</strong>, that everyone gets. Vertical towers, 20 spots each, herb garden at the base included.</p>
				<?php if ( is_array( $existing_req ) && ! empty( $existing_req['qty'] ) ) : ?>
					<p class="gff-mf-spires__req">You requested <strong><?php echo (int) $existing_req['qty']; ?> Spire<?php echo 1 === (int) $existing_req['qty'] ? '' : 's'; ?></strong> on <?php echo esc_html( mysql2date( 'M j', $existing_req['time'] ) ); ?> &mdash; we&rsquo;ll be in touch to schedule. Changed your mind on the count? Just send a new request below.</p>
				<?php endif; ?>
				<form method="post" class="gff-mf-spires__form">
					<?php wp_nonce_field( 'gff_spire_req_' . $uid, 'gff_spire_req_nonce' ); ?>
					<div class="gff-mf-spires__step">
						<button type="button" class="gff-mf-spires__sb" data-d="-1" aria-label="Fewer Spires">&minus;</button>
						<span class="gff-mf-spires__q"><b id="gff-mf-sp-qty">2</b> Spires</span>
						<button type="button" class="gff-mf-spires__sb" data-d="1" aria-label="More Spires">+</button>
					</div>
					<p class="gff-mf-spires__price"><span id="gff-mf-sp-total">$<?php echo $first_p; ?>/mo</span> <small id="gff-mf-sp-note"></small></p>
					<input type="hidden" name="gff_spire_req_qty" id="gff-mf-sp-field" value="2">
					<button type="submit" class="gff-acct__btn">Request my Spires</button>
					<p class="gff-mf-herb">No charge now &mdash; we&rsquo;ll confirm scheduling and pricing with you first.</p>
				</form>
			</div>
			<script>
			(function(){
				var q=2, FIRST=<?php echo $first_p; ?>, ADDL=<?php echo $addl_p; ?>;
				var qEl=document.getElementById('gff-mf-sp-qty'), tEl=document.getElementById('gff-mf-sp-total'),
					nEl=document.getElementById('gff-mf-sp-note'), fEl=document.getElementById('gff-mf-sp-field');
				function total(n){ return FIRST + Math.max(0,n-3)*ADDL; }
				function paint(){
					qEl.textContent=q; fEl.value=q; tEl.textContent='$'+total(q)+'/mo';
					var free=Math.min(2, Math.max(0,q-1));
					nEl.textContent = free>0 ? '— that’s '+free+' of them FREE 🎁' : '';
				}
				document.querySelectorAll('.gff-mf-spires__sb').forEach(function(b){
					b.onclick=function(){ q=Math.max(1,Math.min(10,q+parseInt(b.getAttribute('data-d'),10))); paint(); };
				});
				paint();
				var form=document.querySelector('.gff-mf-spires__form');
				if(form&&typeof gtag==='function'){ form.addEventListener('submit',function(){ gtag('event','spire_addon_request',{event_category:'gff_funnel',value:q}); }); }
			})();
			</script>
			<?php
		}

		// Three Sisters propagation offer ($300 one-time) — for Spire customers; owner-managed, no self-checkout.
		if ( 'spire' === gff_reg_customer_offer( $uid ) ) {
			$ts_req  = get_user_meta( $uid, 'gff_three_sisters_request', true );
			$ts_has  = is_array( $ts_req ) && ! empty( $ts_req['time'] );
			$ts_just = false;
			if ( ! $ts_has
				&& isset( $_POST['gff_three_sisters_nonce'] )
				&& wp_verify_nonce( sanitize_key( wp_unslash( $_POST['gff_three_sisters_nonce'] ) ), 'gff_three_sisters_' . $uid )
				&& 'request' === sanitize_key( wp_unslash( $_POST['gff_three_sisters_action'] ?? '' ) ) ) {
				$ts_req = array( 'time' => current_time( 'mysql' ), 'status' => 'requested' );
				update_user_meta( $uid, 'gff_three_sisters_request', $ts_req );
				gff_reg_send_three_sisters_email( $uid );
				$ts_has = true; $ts_just = true;
			}
			?>
			<div class="gff-mf-sisters">
				<p class="gff-mf-sub">🌽 Three Sisters &mdash; grow your Spires</p>
				<?php if ( $ts_just ) : ?><div class="gff-acct__notice gff-acct__notice--ok">Three Sisters requested! We&rsquo;ll send your $300 invoice &mdash; once it&rsquo;s paid, your first sister Spire propagates a year later.</div><?php endif; ?>
				<p class="gff-mf-spires__deal">Your Spires should multiply like a real garden. Add <strong>Three Sisters</strong> &mdash; a <strong>$300 one-time</strong> add-on &mdash; and each year we propagate <strong>one new sister Spire for every paid Spire you keep</strong>, grown from your own, <strong>free to service</strong>. Plant one, tend three, harvest for years.</p>
				<?php if ( $ts_has ) : ?>
					<p class="gff-mf-spires__req">You requested Three Sisters on <?php echo esc_html( mysql2date( 'M j', $ts_req['time'] ) ); ?> &mdash; we&rsquo;ll send your $300 invoice, and your first sister Spire propagates a year after it&rsquo;s paid.</p>
				<?php else : ?>
					<form method="post" class="gff-mf-sisters__form">
						<?php wp_nonce_field( 'gff_three_sisters_' . $uid, 'gff_three_sisters_nonce' ); ?>
						<input type="hidden" name="gff_three_sisters_action" value="request">
						<button type="submit" class="gff-acct__btn">Add Three Sisters &mdash; $300 one time</button>
					</form>
					<p class="gff-mf-herb">No charge now &mdash; we&rsquo;ll send a secure $300 invoice, then your first sister propagates a year later.</p>
				<?php endif; ?>
			</div>
			<script>
			(function(){ var f=document.querySelector('.gff-mf-sisters__form'); if(f&&typeof gtag==='function'){ f.addEventListener('submit',function(){ gtag('event','three_sisters_request',{event_category:'gff_funnel',value:300}); }); } })();
			</script>
			<?php
		}

			// Add-ons the customer selected (from the global catalog)
		$addon_keys = get_user_meta( $uid, 'gff_addons', true );
		if ( ! is_array( $addon_keys ) ) { $addon_keys = array(); }
		$catalog = gff_reg_addons();
		$has_addons = false;
		foreach ( $addon_keys as $k ) { if ( isset( $catalog[ $k ] ) ) { $has_addons = true; break; } }
		if ( $has_addons ) {
			echo '<p class="gff-mf-sub">Your add-ons</p><div class="gff-mf-addons">';
			foreach ( $addon_keys as $k ) {
				if ( ! isset( $catalog[ $k ] ) ) { continue; }
				$ad = $catalog[ $k ];
				echo '<div class="gff-mf-addon"><span class="gff-mf-ae">' . esc_html( $ad['emoji'] ) . '</span>'
					. '<span class="gff-mf-an"><b>' . esc_html( $ad['name'] ) . '</b>'
					. '<small>' . esc_html( $ad['desc'] ) . '</small></span>'
					. '<span class="gff-mf-ap">$' . esc_html( $ad['price'] ) . '</span></div>';
			}
			echo '</div><p class="gff-mf-herb">Add-ons are invoiced separately &mdash; we&rsquo;ll send a secure payment link.</p>';
		}
		// free-text additional add-ons the owner listed
		$addon_notes = (string) get_user_meta( $uid, 'gff_addons_notes', true );
		if ( '' !== trim( $addon_notes ) ) {
			echo '<p class="gff-mf-sub">Additional add-ons</p><div class="gff-mf-notes">' . nl2br( esc_html( $addon_notes ) ) . '</div>';
		}
		?>
	</div>
	<style>
		.gff-myfarm{max-width:640px;margin:0 auto;font-family:"Lato",sans-serif;color:#1c1c1a;}
		.gff-mf-title{font-size:24px;text-align:center;margin:.2em 0;}
		.gff-mf-sub{font-size:14px;font-weight:bold;color:#1c1c1a;margin:1em 0 .4em;}
		.gff-mf-tower{border:1px solid #e4e2da;border-radius:12px;padding:10px 12px;margin-bottom:8px;}
		.gff-mf-th{font-size:13px;font-weight:bold;margin-bottom:6px;}
		.gff-mf-chips{display:flex;flex-wrap:wrap;gap:6px;}
		.gff-mf-chip{display:inline-flex;align-items:center;gap:5px;font-size:13px;background:#fafaf7;border:1px solid #e4e2da;border-radius:16px;padding:4px 10px;}
		.gff-mf-dot{width:11px;height:11px;border-radius:50%;}
		.gff-mf-empty{font-size:12px;color:#9a9a94;font-style:italic;}
		.gff-mf-herb{font-size:12px;color:#6f6e69;font-style:italic;margin-top:.5em;}
		.gff-mf-up{font-size:13px;color:#c98b2a;font-weight:bold;margin-top:.8em;}
		.gff-mf-up small{font-weight:normal;color:#9a9a94;}
		.gff-mf-none{font-size:14px;color:#6f6e69;line-height:1.5;background:#f6faf2;border:1px solid #e0dccf;border-radius:12px;padding:14px;}
		.gff-mf-addons{display:flex;flex-direction:column;gap:7px;}
		.gff-mf-addon{display:flex;align-items:center;gap:10px;border:1px solid #e4e2da;border-radius:12px;padding:9px 12px;}
		.gff-mf-ae{font-size:20px;flex:0 0 auto;}
		.gff-mf-an{flex:1;font-size:13px;} .gff-mf-an small{display:block;color:#6f6e69;font-size:11.5px;}
		.gff-mf-ap{font-weight:bold;color:#1c1c1a;flex:0 0 auto;}
		.gff-mf-notes{font-size:13px;color:#3a3a2a;background:#fafaf7;border:1px solid #e4e2da;border-radius:12px;padding:12px;line-height:1.5;}
		.gff-mf-spires{border:2px solid #e0b341;border-radius:14px;padding:14px 16px;margin:1em 0;background:#fffdf4;}
		.gff-mf-sisters{border:2px solid #c9a227;border-radius:14px;padding:14px 16px;margin:1em 0;background:#f6f3ea;}
		.gff-mf-sisters .gff-mf-sub{color:#1c1c1a;}
		.gff-mf-spires__deal{font-size:13.5px;color:#3a3a2a;line-height:1.5;margin:.3em 0 .6em;}
		.gff-mf-spires__req{font-size:12.5px;color:#6f6e69;background:#f6faf2;border:1px solid #e0dccf;border-radius:10px;padding:8px 11px;}
		.gff-mf-spires__step{display:flex;gap:12px;align-items:center;justify-content:center;margin:.6em 0 .2em;}
		.gff-mf-spires__sb{width:44px;height:44px;font-size:20px;border:0;border-radius:12px;background:#e4eef8;cursor:pointer;font-family:inherit;font-weight:bold;}
		.gff-mf-spires__q{min-width:92px;text-align:center;font-size:16px;}
		.gff-mf-spires__price{text-align:center;font-size:17px;font-weight:bold;color:#1c1c1a;margin:.2em 0 .6em;}
		.gff-mf-spires__price small{display:block;font-size:12px;color:#c98b2a;font-weight:bold;}
		.gff-mf-spires__form{text-align:center;}
		.gff-mf-unlock{margin:1em 0;text-align:center;}
		.gff-mf-unlock__summon{font-family:inherit;font-size:12.5px;color:#8a7a3a;background:#fffdf4;border:1.5px dashed #e0b341;border-radius:20px;padding:8px 16px;cursor:pointer;}
		.gff-mf-unlock__summon:hover{background:#fdf6dd;}
		.gff-mf-unlock__panel{border:2px solid #e0b341;border-radius:14px;padding:14px 16px;margin-top:10px;background:#fffdf4;text-align:left;}
		.gff-mf-unlock__actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;margin:.8em 0 .4em;}
		.gff-mf-unlock__inv{font-family:inherit;font-size:13px;color:#1c1c1a;background:none;border:none;cursor:pointer;text-decoration:underline;padding:10px 6px;}
	</style>
	<?php return ob_get_clean();
}


/* ============================================================
 * ACCOUNT PLANNER + SUNRISE SPIRE ADD-ON (account page)
 * ============================================================ */

/* Which offer is this customer on? 'sunrise' | 'spire' | '' (unknown/lead). */
function gff_reg_customer_offer( $uid ) {
	$offer = get_user_meta( $uid, 'gff_offer', true );
	if ( in_array( $offer, gff_v33_offers(), true ) ) { return $offer; }
	if ( (int) get_user_meta( $uid, 'gff_tower_qty', true ) > 0 ) { return 'spire'; }
	$layout = json_decode( (string) get_user_meta( $uid, 'gff_farm_layout', true ), true );
	if ( is_array( $layout ) && ! empty( $layout['offer'] ) && in_array( $layout['offer'], gff_v33_offers(), true ) ) {
		return $layout['offer'];
	}
	$flow = get_user_meta( $uid, 'gff_signup_flow', true );
	if ( in_array( $flow, array( 'full', 'express' ), true ) ) { return 'sunrise'; }
	return '';
}

/* Sunrise-member Spire pricing: 1st $100/mo, 2nd FREE (Sunrise exclusive),
 * 3rd FREE (standard forever-free), each additional $50/mo. */
function gff_sunrise_spire_monthly( $qty ) {
	$qty   = max( 1, (int) $qty );
	$total = gff_reg_tower_first_price();
	if ( $qty > 3 ) { $total += ( $qty - 3 ) * gff_reg_tower_addl_price(); }
	return $total;
}

/* [gff_account_planner] — the customer's own farm planner, in the mode
 * matching what they signed up for: Sunrise → custom seasonal bed,
 * Spire → per-tower spot planner. Saves straight to their account. */
add_shortcode( 'gff_account_planner', 'gff_sc_account_planner' );
function gff_sc_account_planner( $atts = array() ) {
	if ( ! is_user_logged_in() ) { return ''; }
	$uid   = get_current_user_id();
	$offer = gff_reg_customer_offer( $uid );
	// No offer yet: let them pick Spire or Sunrise here (mode="both" toggle).
	$mode  = ( 'sunrise' === $offer || 'spire' === $offer ) ? $offer : 'both';

	// Save a submitted layout (nonce-guarded POST to self).
	$notice = '';
	if ( isset( $_POST['gff_planner_nonce'] )
		&& wp_verify_nonce( sanitize_key( wp_unslash( $_POST['gff_planner_nonce'] ) ), 'gff_planner_' . $uid ) ) {
		$parsed = gff_reg_parse_layout( $_POST['gff_farm_layout'] ?? '' );
		if ( $parsed && ! empty( $parsed['flat'] ) ) {
			update_user_meta( $uid, 'gff_farm_layout', wp_json_encode( $parsed['layout'] ) );
			update_user_meta( $uid, 'gff_crops_wanted', $parsed['flat'] );
			update_user_meta( $uid, 'gff_moringa_fruit_upgrade', ! empty( $parsed['moringa_upgrade'] ) ? 'yes' : 'no' );
			$chosen_offer = isset( $parsed['layout']['offer'] ) ? $parsed['layout']['offer'] : '';
			if ( in_array( $chosen_offer, gff_v33_offers(), true ) ) { update_user_meta( $uid, 'gff_offer', $chosen_offer ); }
			$notice = '<div class="gff-acct__notice gff-acct__notice--ok">Your planting plan is saved — we&rsquo;ll follow it on our next visit.</div>';
		} else {
			$notice = '<div class="gff-acct__notice gff-acct__notice--warn">Please add at least one plant to a spot, then save again.</div>';
		}
	}

	if ( 'both' === $mode ) {
		$title = '🌱 Choose your garden';
		$sub   = 'Pick your style — 🌅 Sunrise seasonal bed or ⚡ Spire towers — then fill your spots. Save any time; we plant it on our next visit.';
	} else {
		$title = 'spire' === $offer ? '⚡ Your Spire spots' : '🌅 Your seasonal bed';
		$sub   = 'spire' === $offer
			? 'Fill each tower&rsquo;s 20 spots with what you want growing. Save any time — we plant it on our next visit.'
			: 'Fill your 20 seasonal-bed spots with what you want growing. Save any time — we plant it on our next visit.';
	}

	ob_start(); ?>
	<div class="gff-acct-planner">
		<h3 class="gff-acct__h3"><?php echo $title; // static markup ?></h3>
		<p class="gff-acct__sub"><?php echo $sub; // static markup ?></p>
		<?php echo $notice; // already escaped markup ?>
		<form method="post" id="gff-planner-form">
			<?php wp_nonce_field( 'gff_planner_' . $uid, 'gff_planner_nonce' ); ?>
			<?php echo do_shortcode( '[gff_farm_builder mode="' . esc_attr( $mode ) . '" user="current"]' ); ?>
			<button type="submit" class="gff-acct__btn">Save my planting plan</button>
			<span class="gff-planner-status" aria-live="polite" style="margin-left:10px;font-size:13px;color:#1c1c1a;"></span>
		</form>
	</div>
	<script>
	/* Autosave the garden as it changes — customers never lose work, and staff
	 * see edits on their next load. Guards against wiping a saved garden: the
	 * server ignores empty/partial layouts. */
	(function(){
		var form=document.getElementById('gff-planner-form'); if(!form) return;
		var hidden=form.querySelector('input[name="gff_farm_layout"]');
		var nonceEl=form.querySelector('input[name="gff_planner_nonce"]');
		var status=form.querySelector('.gff-planner-status');
		if(!hidden||!nonceEl) return;
		var AJAX='<?php echo esc_js( admin_url( 'admin-ajax.php' ) ); ?>';
		var last=hidden.value, busy=false;
		function save(beacon){
			var val=hidden.value;
			if(val===last||busy) return;
			var fd=new FormData();
			fd.append('action','gff_planner_autosave');
			fd.append('nonce',nonceEl.value);
			fd.append('gff_farm_layout',val);
			if(beacon){ if(navigator.sendBeacon){ navigator.sendBeacon(AJAX,fd); last=val; } return; }
			busy=true;
			fetch(AJAX,{method:'POST',body:fd,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){
				busy=false;
				if(j&&j.success){ last=val; if(status){ status.textContent='Saved '+j.data.saved; } }
			}).catch(function(){ busy=false; });
		}
		setInterval(function(){ save(false); },4000);
		document.addEventListener('visibilitychange',function(){ if(document.hidden){ save(true); } });
		window.addEventListener('beforeunload',function(){ save(true); });
	})();
	</script>
	<?php return ob_get_clean();
}

/* Autosave endpoint for the customer's own garden planner. Same nonce as the
 * planner form; refuses to overwrite with an empty/partial layout. */
add_action( 'wp_ajax_gff_planner_autosave', 'gff_planner_autosave_ajax' );
function gff_planner_autosave_ajax() {
	if ( ! is_user_logged_in() ) { wp_send_json_error( array( 'msg' => 'auth' ), 403 ); }
	$uid = get_current_user_id();
	if ( ! check_ajax_referer( 'gff_planner_' . $uid, 'nonce', false ) ) { wp_send_json_error( array( 'msg' => 'bad nonce' ), 400 ); }
	$parsed = gff_reg_parse_layout( isset( $_POST['gff_farm_layout'] ) ? $_POST['gff_farm_layout'] : '' );
	if ( ! $parsed || empty( $parsed['flat'] ) ) { wp_send_json_error( array( 'msg' => 'empty' ) ); } // never wipe a saved garden
	update_user_meta( $uid, 'gff_farm_layout', wp_json_encode( $parsed['layout'] ) );
	update_user_meta( $uid, 'gff_crops_wanted', $parsed['flat'] );
	update_user_meta( $uid, 'gff_moringa_fruit_upgrade', ! empty( $parsed['moringa_upgrade'] ) ? 'yes' : 'no' );
	$chosen = isset( $parsed['layout']['offer'] ) ? $parsed['layout']['offer'] : '';
	if ( in_array( $chosen, gff_v33_offers(), true ) ) { update_user_meta( $uid, 'gff_offer', $chosen ); }
	wp_send_json_success( array( 'saved' => current_time( 'H:i' ) ) );
}

/* Owner notification for a Three Sisters propagation request ($300 one-time). */
function gff_reg_send_three_sisters_email( $uid ) {
	$user = get_user_by( 'id', $uid );
	if ( ! $user ) { return false; }
	$name  = trim( get_user_meta( $uid, 'first_name', true ) . ' ' . get_user_meta( $uid, 'last_name', true ) );
	if ( '' === $name ) { $name = $user->display_name; }
	$phone = get_user_meta( $uid, 'gff_phone', true );
	$to = get_option( 'gff_reg_msg_recipient', 'martingawlak@gmail.com' );
	if ( '' === trim( (string) $to ) || ! is_email( $to ) ) { $to = 'martingawlak@gmail.com'; }
	$subject = 'Three Sisters request ($300 one-time) — ' . $name;
	$body  = '<p><strong>' . esc_html( $name ) . '</strong> requested the <strong>Three Sisters</strong> propagation add-on from their account page.</p>';
	$body .= '<p><strong>$300 one-time.</strong> Send the $300 invoice from their profile (Users &rarr; Edit User); once it is paid, start their propagation clock: one free Spire per year, up to one per paid Spire.</p>';
	$body .= '<p><strong>Email:</strong> ' . esc_html( $user->user_email ) . '<br>';
	if ( $phone ) { $body .= '<strong>Phone:</strong> ' . esc_html( $phone ) . '<br>'; }
	$body .= '<strong>User ID:</strong> ' . (int) $uid . '</p>';
	$headers = array( 'Content-Type: text/html; charset=UTF-8' );
	if ( is_email( $user->user_email ) ) { $headers[] = 'Reply-To: ' . $name . ' <' . $user->user_email . '>'; }
	return wp_mail( $to, $subject, $body, $headers );
}

/* Owner notification for a Sunrise member requesting Spires. */
function gff_reg_send_spire_request_email( $uid, $qty, $monthly ) {
	$user  = get_user_by( 'id', $uid );
	if ( ! $user ) { return false; }
	$first = get_user_meta( $uid, 'first_name', true );
	$last  = get_user_meta( $uid, 'last_name', true );
	$phone = get_user_meta( $uid, 'gff_phone', true );
	$name  = trim( $first . ' ' . $last );
	if ( '' === $name ) { $name = $user->display_name; }

	$to = get_option( 'gff_reg_msg_recipient', 'martingawlak@gmail.com' );
	if ( '' === trim( (string) $to ) || ! is_email( $to ) ) { $to = 'martingawlak@gmail.com'; }

	$subject = 'Spire add-on request — ' . $name . ' (Sunrise member)';
	$body  = '<p><strong>' . esc_html( $name ) . '</strong> (Sunrise member) requested <strong>' . (int) $qty . ' Spire' . ( 1 === (int) $qty ? '' : 's' ) . '</strong> from their account page.</p>';
	$body .= '<p><strong>Sunrise-member pricing:</strong> $' . (int) $monthly . '/mo (1st $' . (int) gff_reg_tower_first_price() . ', 2nd FREE — Sunrise exclusive, 3rd FREE, add&rsquo;l $' . (int) gff_reg_tower_addl_price() . '/mo).</p>';
	$body .= '<p><strong>Email:</strong> ' . esc_html( $user->user_email ) . '<br>';
	if ( $phone ) { $body .= '<strong>Phone:</strong> ' . esc_html( $phone ) . '<br>'; }
	$body .= '<strong>User ID:</strong> ' . (int) $uid . '</p>';
	$body .= '<p>Confirm scheduling with them, then set their Spire count + invoice from their profile (Users &rarr; Edit User).</p>';

	$headers = array(
		'Content-Type: text/html; charset=UTF-8',
		'Reply-To: ' . $name . ' <' . $user->user_email . '>',
	);
	return wp_mail( $to, $subject, $body, $headers );
}

/* Owner notification when a Sunrise member starts the $100 Spire-design
 * unlock — either by requesting an invoice or by clicking the PayPal link. */
function gff_reg_send_spire_unlock_email( $uid, $channel ) {
	$user = get_user_by( 'id', $uid );
	if ( ! $user ) { return false; }
	$first = get_user_meta( $uid, 'first_name', true );
	$last  = get_user_meta( $uid, 'last_name', true );
	$phone = get_user_meta( $uid, 'gff_phone', true );
	$name  = trim( $first . ' ' . $last );
	if ( '' === $name ) { $name = $user->display_name; }

	$to = get_option( 'gff_reg_msg_recipient', 'martingawlak@gmail.com' );
	if ( '' === trim( (string) $to ) || ! is_email( $to ) ) { $to = 'martingawlak@gmail.com'; }

	$subject = 'Spire design unlock ($100) — ' . $name . ( 'paypal' === $channel ? ' clicked PayPal' : ' wants an invoice' );
	$body  = '<p><strong>' . esc_html( $name ) . '</strong> (Sunrise member) started the <strong>$100 Spire-design unlock</strong> from their account page.</p>';
	$body .= 'paypal' === $channel
		? '<p>They clicked the <strong>PayPal $100</strong> link &mdash; check the PayPal inbox for the payment, then tick <em>Spire design: Unlocked</em> on their profile (Users &rarr; Edit User).</p>'
		: '<p>They asked for an <strong>invoice</strong> &mdash; send the $100 invoice from their profile (Users &rarr; Edit User), and tick <em>Spire design: Unlocked</em> once it&rsquo;s paid.</p>';
	$body .= '<p><strong>Email:</strong> ' . esc_html( $user->user_email ) . '<br>';
	if ( $phone ) { $body .= '<strong>Phone:</strong> ' . esc_html( $phone ) . '<br>'; }
	$body .= '<strong>User ID:</strong> ' . (int) $uid . '</p>';

	$headers = array(
		'Content-Type: text/html; charset=UTF-8',
		'Reply-To: ' . $name . ' <' . $user->user_email . '>',
	);
	return wp_mail( $to, $subject, $body, $headers );
}


function gff_reg_handle_submit( $mode = 'full' ) {

	$nonce_field  = 'full' === $mode ? 'gff_reg_nonce'  : 'gff_lead_nonce';
	$nonce_action = 'full' === $mode ? 'gff_reg_action' : 'gff_lead_action';

	if ( ! isset( $_POST[ $nonce_field ] ) || ! wp_verify_nonce( $_POST[ $nonce_field ], $nonce_action ) ) {
		return gff_reg_alert( 'error', 'Security check failed. Please reload the page and try again.' );
	}
	if ( ! empty( $_POST['gff_company_url'] ) ) {
		return gff_reg_alert( 'error', 'Submission blocked.' );
	}

	$first   = sanitize_text_field( wp_unslash( $_POST['gff_first']   ?? '' ) );
	$last    = sanitize_text_field( wp_unslash( $_POST['gff_last']    ?? '' ) );
	$email   = sanitize_email(      wp_unslash( $_POST['gff_email']   ?? '' ) );
	$phone   = sanitize_text_field( wp_unslash( $_POST['gff_phone']   ?? '' ) );
	$city    = sanitize_text_field( wp_unslash( $_POST['gff_city']    ?? '' ) );

	if ( 'lead' === $mode ) {
		$errors = array();
		if ( '' === $first || '' === $last ) { $errors[] = 'Please enter your first and last name.'; }
		if ( ! is_email( $email ) )           { $errors[] = 'Please enter a valid email address.'; }
		if ( '' === $phone )                  { $errors[] = 'Please enter your phone number.'; }
		if ( '' === $city )                   { $errors[] = 'Please enter your city.'; }
		if ( $errors ) {
			return gff_reg_alert( 'error', implode( '<br>', array_map( 'esc_html', $errors ) ) );
		}
		$existing = get_user_by( 'email', $email );
		if ( $existing ) {
			update_user_meta( $existing->ID, 'gff_lead_first', $first );
			update_user_meta( $existing->ID, 'gff_lead_phone', $phone );
			update_user_meta( $existing->ID, 'gff_lead_city',  $city );
			update_user_meta( $existing->ID, 'gff_lead_at',    current_time( 'mysql' ) );
			return gff_reg_alert( 'success', 'Thanks, ' . esc_html( $first ) . '! Your info is updated. We&rsquo;ll be in touch shortly.' );
		}
		$username = gff_reg_unique_username( $email );
		$user_id  = wp_insert_user( array(
			'user_login' => $username, 'user_email' => $email,
			'user_pass'  => wp_generate_password( 16, true, true ),
			'first_name' => $first, 'last_name' => $last,
			'display_name' => trim( "$first $last" ), 'role' => 'gff_lead',
		) );
		if ( is_wp_error( $user_id ) ) {
			return gff_reg_alert( 'error', esc_html( $user_id->get_error_message() ) );
		}
		update_user_meta( $user_id, 'gff_phone',     $phone );
		update_user_meta( $user_id, 'gff_lead_city', $city );
		update_user_meta( $user_id, 'gff_lead_at',   current_time( 'mysql' ) );
		update_user_meta( $user_id, 'gff_lead_ip',   sanitize_text_field( $_SERVER['REMOTE_ADDR'] ?? '' ) );
		wp_new_user_notification( $user_id, null, 'admin' );
		return gff_reg_alert( 'success', 'Thanks, ' . esc_html( $first ) . '! We&rsquo;ll be in touch shortly.' );
	}

	$address = sanitize_text_field( wp_unslash( $_POST['gff_address'] ?? '' ) );
	$zip     = sanitize_text_field( wp_unslash( $_POST['gff_zip']     ?? '' ) );
	$sqft    = sanitize_text_field( wp_unslash( $_POST['gff_sqft']    ?? '' ) );
	$pass    = (string) ( $_POST['gff_pass']  ?? '' );
	$pass2   = (string) ( $_POST['gff_pass2'] ?? '' );
	$ratelock= isset( $_POST['gff_ratelock'] ) ? 'yes' : 'no';
	$start_date = sanitize_text_field( wp_unslash( $_POST['gff_start_date'] ?? '' ) );
	$offer   = sanitize_key( wp_unslash( $_POST['gff_offer'] ?? '' ) );
	$reservation = sanitize_key( wp_unslash( $_POST['gff_reservation'] ?? '' ) );
	$agree = isset( $_POST['gff_agree'] );

	// Add-on selections (optional). Bundle overrides individuals to avoid double-count.
	$addon_catalog = gff_reg_addons();
	$picked_addons = array();
	if ( ! empty( $_POST['gff_addons'] ) && is_array( $_POST['gff_addons'] ) ) {
		foreach ( wp_unslash( $_POST['gff_addons'] ) as $ad ) {
			$ad = sanitize_key( $ad );
			if ( 'bundle' === $ad || isset( $addon_catalog[ $ad ] ) ) { $picked_addons[] = $ad; }
		}
		$picked_addons = array_values( array_unique( $picked_addons ) );
		if ( in_array( 'bundle', $picked_addons, true ) ) {
			$picked_addons = array( 'bundle' ); // bundle replaces individuals
		}
	}

	$all_crops = array();
	foreach ( gff_reg_crops() as $list ) { $all_crops = array_merge( $all_crops, $list ); }
	$picked = array();
	if ( ! empty( $_POST['gff_crops'] ) && is_array( $_POST['gff_crops'] ) ) {
		foreach ( wp_unslash( $_POST['gff_crops'] ) as $c ) {
			$c = sanitize_text_field( $c );
			if ( in_array( $c, $all_crops, true ) ) { $picked[] = $c; }
		}
	}

	$errors = array();
	if ( ! in_array( $offer, gff_v33_offers(), true ) ) { $errors[] = 'Please choose Sunrise, Spire, or both above.'; }
	if ( ! is_email( $email ) )                            { $errors[] = 'Please enter a valid email address.'; }
	if ( email_exists( $email ) )                          { $errors[] = 'An account with that email already exists. Try logging in instead.'; }
	if ( '' === $address )                                 { $errors[] = 'Please enter your site address.'; }
	if ( ! in_array( $reservation, array( 'none', 'consult', 'down_payment', 'workshop' ), true ) ) { $errors[] = 'Please choose a reservation option (reserve, consult, or no payment).'; }
	// Password optional: if provided it must be valid; if blank we auto-generate one.
	if ( '' !== $pass ) {
		if ( strlen( $pass ) < 8 ) { $errors[] = 'Password must be at least 8 characters.'; }
		if ( $pass !== $pass2 )    { $errors[] = 'The two passwords do not match.'; }
	}

	if ( $errors ) {
		gff_reg_flag_repop();
		return gff_reg_alert( 'error', implode( '<br>', array_map( 'esc_html', $errors ) ) );
	}

	if ( '' === $pass ) { $pass = wp_generate_password( 16, true, true ); }

	$username = gff_reg_unique_username( $email );
	$user_id  = wp_insert_user( array(
		'user_login' => $username, 'user_email' => $email, 'user_pass' => $pass,
		'first_name' => $first, 'last_name' => $last,
		'display_name' => trim( "$first $last" ) ?: $email, 'role' => 'gff_customer',
	) );

	if ( is_wp_error( $user_id ) ) {
		return gff_reg_alert( 'error', esc_html( $user_id->get_error_message() ) );
	}

	update_user_meta( $user_id, 'gff_phone',           $phone );
	update_user_meta( $user_id, 'gff_service_address', $address );
	update_user_meta( $user_id, 'gff_service_city',    $city );
	update_user_meta( $user_id, 'gff_service_zip',     $zip );
	update_user_meta( $user_id, 'gff_start_sqft',      $sqft );
	update_user_meta( $user_id, 'gff_start_date',      $start_date );
	update_user_meta( $user_id, 'gff_crops_wanted',    $picked );
	update_user_meta( $user_id, 'gff_offer',           $offer );
	if ( isset( $_POST['gff_three_sisters_optin'] ) ) { // Three Sisters opt-in from the Spire agreement block
		update_user_meta( $user_id, 'gff_three_sisters_request', array( 'time' => current_time( 'mysql' ), 'status' => 'requested_at_signup' ) );
		if ( function_exists( 'gff_reg_send_three_sisters_email' ) ) { gff_reg_send_three_sisters_email( $user_id ); }
	}
	$gff_layout_full = gff_reg_parse_layout( $_POST['gff_farm_layout'] ?? '' );
	if ( $gff_layout_full ) {
		$merged_full = array_values( array_unique( array_merge( (array) $picked, $gff_layout_full['flat'] ) ) );
		update_user_meta( $user_id, 'gff_crops_wanted', $merged_full );
		update_user_meta( $user_id, 'gff_farm_layout', wp_json_encode( $gff_layout_full['layout'] ) );
		update_user_meta( $user_id, 'gff_moringa_fruit_upgrade', $gff_layout_full['moringa_upgrade'] ? 'yes' : 'no' );
		// Unified toggle builder: if they chose Spire, record the tower count + monthly from the layout.
		$lay = $gff_layout_full['layout'];
		if ( isset( $lay['offer'] ) && 'spire' === $lay['offer'] ) {
			$tq = 0;
			if ( isset( $lay['towers'] ) && is_array( $lay['towers'] ) ) { $tq = count( $lay['towers'] ); }
			elseif ( isset( $lay['towers'] ) ) { $tq = (int) $lay['towers']; }
			if ( $tq > 0 && function_exists( 'gff_reg_tower_total' ) ) {
				update_user_meta( $user_id, 'gff_tower_qty', $tq );
				update_user_meta( $user_id, 'gff_tower_monthly', number_format( (float) gff_reg_tower_total( $tq ), 2, '.', '' ) );
			}
		}
	}
	update_user_meta( $user_id, 'gff_rate_lock',       $ratelock );
	update_user_meta( $user_id, 'gff_reservation',     $reservation );
	$gff_workshop = ( isset( $_POST['gff_workshop_interest'] ) && 'yes' === sanitize_key( wp_unslash( $_POST['gff_workshop_interest'] ) ) ) ? 'yes' : 'no';
	update_user_meta( $user_id, 'gff_workshop_interest', $gff_workshop );
	$gff_res_meta = gff_reg_reservation_meta( $reservation );
	update_user_meta( $user_id, 'gff_reservation_amount', $gff_res_meta['amount'] );
	// Mark as paid optimistically when a paid option is selected — owner reconciles against PayPal inbox manually.
	update_user_meta( $user_id, 'gff_reservation_paid', 'none' === $reservation ? 'no' : 'yes' );
	update_user_meta( $user_id, 'gff_reservation_txn', '' );
	update_user_meta( $user_id, 'gff_reservation_paid_at', 'none' === $reservation ? '' : current_time( 'mysql' ) );
	update_user_meta( $user_id, 'gff_reservation_credited_signup', 'no' );

	// --- Add-ons (billed separately; owner invoices manually) ---
	$addon_total = 0;
	$addon_labels = array();
	if ( in_array( 'bundle', $picked_addons, true ) ) {
		$b = gff_reg_bundle();
		$addon_total = (int) $b['price'];
		$addon_labels[] = html_entity_decode( $b['power'], ENT_QUOTES ) . ' (' . $b['name'] . ', $' . (int) $b['price'] . ')';
	} else {
		foreach ( $picked_addons as $ad ) {
			if ( isset( $addon_catalog[ $ad ] ) ) {
				$addon_total += (int) $addon_catalog[ $ad ]['price'];
				$addon_labels[] = html_entity_decode( $addon_catalog[ $ad ]['power'], ENT_QUOTES ) . ' (' . $addon_catalog[ $ad ]['name'] . ', $' . (int) $addon_catalog[ $ad ]['price'] . ')';
			}
		}
	}
	update_user_meta( $user_id, 'gff_addons',          $picked_addons );
	update_user_meta( $user_id, 'gff_addons_total',    number_format( (float) $addon_total, 2, '.', '' ) );
	update_user_meta( $user_id, 'gff_addons_invoiced', 'no' ); // owner flips to 'yes' once the separate invoice is sent/paid
	update_user_meta( $user_id, 'gff_addons_labels',   implode( '; ', $addon_labels ) );

	update_user_meta( $user_id, 'gff_agreement_version', gff_reg_agreement_version() );
	update_user_meta( $user_id, 'gff_agreement_accepted_at', current_time( 'mysql' ) );
	update_user_meta( $user_id, 'gff_agreement_ip',    sanitize_text_field( $_SERVER['REMOTE_ADDR'] ?? '' ) );

	wp_new_user_notification( $user_id, null, 'admin' );

	$out = 'Welcome to Gawlak Family Farms, ' . esc_html( $first ) . '! Your account is created and your enrollment is recorded.';

	if ( is_numeric( $sqft ) && (float) $sqft > 0 ) {
		$n = (int) $sqft;
		if ( $n <= 1500 ) {
			$out .= ' Your Zora Sunrise Module™ at <strong>' . esc_html( $n ) . ' sq ft</strong> is <strong>$300/month</strong>, all-inclusive, with a guaranteed minimum <strong>$300/month in food harvest value</strong> once established. Bigger costs the same — take the space.';
		} else {
			$out .= ' Your space (' . esc_html( $n ) . ' sq ft) is larger than a single Zora Sunrise Module™ (max 1,500 sq ft at $300/month). We\'ll discuss multi-module options at your design consult.';
		}
	}

	if ( 'none' !== $reservation ) {
		$rm      = gff_reg_reservation_meta( $reservation );
		$pay_url = $rm['url'];
		$amt     = $rm['amount'];
		$amt_disp = '$' . rtrim( rtrim( $amt, '0' ), '.' );
		$label   = $rm['label'];
		if ( 'consult' === $reservation ) {
			$callout = 'Send your ' . $amt_disp . ' now to lock in your on-site consult. It credits to your first month.';
		} elseif ( 'workshop' === $reservation ) {
			$callout = 'Send your ' . $amt_disp . ' now to reserve your seat at the monthly workshop.';
		} else {
			$callout = 'Send your ' . $amt_disp . ' now — we drop inoculant and hay on your site within 48 hours of your PayPal payment.';
		}

		// Small inline reminder (visible after modal is dismissed)
		$out .= '<div class="gff-paid-callout">'
			. '<p><strong>' . esc_html( $label ) . ' selected.</strong> '
			. '<a class="gff-paid-callout__link" href="' . esc_url( $pay_url ) . '" target="_blank" rel="noopener">Send your ' . esc_html( $amt_disp ) . ' via PayPal &rarr;</a></p>'
			. '</div>';

		// Modal popup — auto-shows 400ms after page load
		$out .= '<div class="gff-modal" id="gff-pay-modal" role="dialog" aria-modal="true" aria-labelledby="gff-pay-modal-title" hidden>'
			. '<div class="gff-modal__backdrop" data-gff-modal-close></div>'
			. '<div class="gff-modal__card">'
			. '<button type="button" class="gff-modal__close" data-gff-modal-close aria-label="Close">&times;</button>'
			. '<h3 id="gff-pay-modal-title" class="gff-modal__title">' . esc_html( $label ) . '</h3>'
			. '<p class="gff-modal__body">' . esc_html( $callout ) . '</p>'
			. '<a href="' . esc_url( $pay_url ) . '" target="_blank" rel="noopener" class="gff-btn gff-btn--pp">Pay ' . esc_html( $amt_disp ) . ' via PayPal &rarr;</a>'
			. '<p class="gff-modal__hint">Opens PayPal in a new tab. You can pay with a credit/debit card &mdash; no PayPal account required.</p>'
			. '</div>'
			. '</div>';

		// Auto-trigger script — moves the modal to <body> first so it escapes the alert
		// wrapper (which would otherwise clip its fixed positioning), then auto-shows it.
		$out .= '<script>(function(){'
			. 'var m=document.getElementById("gff-pay-modal");if(!m)return;'
			. 'if(m.parentNode!==document.body){document.body.appendChild(m);}'
			. 'var open=function(){m.hidden=false;document.body.style.overflow="hidden";};'
			. 'var close=function(){m.hidden=true;document.body.style.overflow="";};'
			. 'm.querySelectorAll("[data-gff-modal-close]").forEach(function(el){el.addEventListener("click",close);});'
			. 'document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!m.hidden)close();});'
			. 'setTimeout(open,600);'
			. '})();</script>';
	}

	$out .= ' You can log in any time at <a href="' . esc_url( wp_login_url() ) . '">the member login</a>.';

	// Add-on confirmation — shows what they selected and that it's invoiced separately.
	if ( ! empty( $picked_addons ) ) {
		$out .= '<div class="gff-addon-callout">'
			. '<p><strong>Add-ons selected:</strong> ' . esc_html( implode( ', ', $addon_labels ) ) . '.</p>'
			. '<p>Total add-ons: <strong>$' . esc_html( number_format( (float) $addon_total, 2, '.', '' ) ) . '</strong> &mdash; '
			. 'we&rsquo;ll send you a separate invoice for these (your $100 reservation is unchanged).</p>'
			. '</div>';
	}

	// GA4 conversion event — fires only here, after a confirmed enrollment (wp_insert_user succeeded).
	// Guarded so it no-ops if the Google tag (gtag.js via Site Kit) isn't present on the page.
	$gff_ga_method = 'none' === $reservation ? 'enroll_no_reservation' : 'enroll_' . $reservation;
	// Parallel prepay event for GA4 (fires in addition to sign_up on paid paths), mirroring Meta.
	$gff_ga_prepay_event = '';
	$gff_ga_prepay_value = 0;
	if ( 'consult' === $reservation ) {
		$gff_ga_prepay_event = 'consult_reservation';
		$gff_ga_prepay_value = 300;
	} elseif ( 'down_payment' === $reservation ) {
		$gff_ga_prepay_event = 'down_payment_reservation';
		$gff_ga_prepay_value = 400;
	}
	$out .= '<script>(function(){'
		. 'if(typeof gtag!=="function"){return;}'
		. 'gtag("event","sign_up",{'
		. 'method:' . wp_json_encode( $gff_ga_method ) . ','
		. 'value:150,'
		. 'currency:"USD"'
		. '});'
		. ( '' !== $gff_ga_prepay_event
			? 'gtag("event",' . wp_json_encode( $gff_ga_prepay_event ) . ',{'
				. 'method:' . wp_json_encode( $gff_ga_method ) . ','
				. 'value:' . (int) $gff_ga_prepay_value . ','
				. 'currency:"USD"'
				. '});'
			: '' )
		. '})();</script>';

	// Meta Pixel conversion event — fires here only, after a confirmed enrollment.
	// The success state is a server-side reload where the partner integration's pixel may NOT
	// be present, so the plugin loads the Meta base code itself (only if fbq isn't already
	// defined, to avoid double-init), then fires CompleteRegistration once.
	$gff_meta_pixel_id = '408144794862479'; // MGC Pixel

	// Fire CompleteRegistration into the EXISTING pixel (PixelYourSite loads fbq site-wide).
	// NOTE: PixelYourSite's wrapper drops direct fbq custom events, so per-option prepay events
	// are NOT sent to Meta here — the reservation breakdown lives in the admin (gff_reservation)
	// and in GA4. Only the standard CompleteRegistration passes through reliably.
	$out .= '<script>(function(){'
		. 'var tries=0;'
		. 'function fire(){'
		. 'if(typeof fbq!=="function"){if(tries++<40){return setTimeout(fire,150);}return;}'
		. 'try{'
		. 'fbq("track","CompleteRegistration",{'
		. 'value:150,currency:"USD",'
		. 'content_name:"Zora Sunrise Module Enrollment",'
		. 'registration_type:' . wp_json_encode( $gff_ga_method )
		. '});'
		. '}catch(e){}'
		. '}'
		. 'fire();'
		. '})();</script>'
		. '<noscript><img height="1" width="1" style="display:none" '
		. 'src="https://www.facebook.com/tr?id=' . esc_attr( $gff_meta_pixel_id ) . '&ev=CompleteRegistration&noscript=1"/></noscript>';

	return gff_reg_alert( 'success', $out );
}

/* ============================================================
 * 7b. EXPRESS FLOW (variant: email-first, optional details)
 *     Self-contained so it cannot affect the strict 'full' flow.
 *     Email is the ONLY hard requirement. Name/address/crops optional.
 *     Agreement + 2yr are recorded as "indicated" (not binding enrollment).
 *     Paid reservation -> PayPal; free -> email lead. sign_up fires either way.
 * ============================================================ */
function gff_reg_handle_express() {
	if ( ! isset( $_POST['gff_express_nonce'] ) || ! wp_verify_nonce( $_POST['gff_express_nonce'], 'gff_express_action' ) ) {
		return gff_reg_alert( 'error', 'Security check failed. Please reload the page and try again.' );
	}
	if ( ! empty( $_POST['gff_company_url'] ) ) {
		return gff_reg_alert( 'error', 'Submission blocked.' );
	}

	$email = sanitize_email( wp_unslash( $_POST['gff_email'] ?? '' ) );
	$address = sanitize_text_field( wp_unslash( $_POST['gff_address'] ?? '' ) );
	$offer   = sanitize_key( wp_unslash( $_POST['gff_offer'] ?? '' ) );
	$reservation = sanitize_key( wp_unslash( $_POST['gff_reservation'] ?? '' ) );

	// Required to submit: offer choice, valid email, site address, reservation selection.
	$errors = array();
	if ( ! in_array( $offer, gff_v33_offers(), true ) ) {
		$errors[] = 'Please choose Sunrise, Spire, or both above.';
	}
	if ( ! is_email( $email ) ) {
		$errors[] = 'Please enter a valid email address.';
	}
	if ( '' === $address ) {
		$errors[] = 'Please enter your site address.';
	}
	if ( ! in_array( $reservation, array( 'none', 'consult', 'down_payment', 'workshop' ), true ) ) {
		$errors[] = 'Please choose a reservation option (reserve, consult, or no payment).';
	}
	if ( $errors ) {
		gff_reg_flag_repop();
		return gff_reg_alert( 'error', implode( '<br>', array_map( 'esc_html', $errors ) ) );
	}

	// Optional fields — captured if present, never required.
	$first   = sanitize_text_field( wp_unslash( $_POST['gff_first']   ?? '' ) );
	$last    = sanitize_text_field( wp_unslash( $_POST['gff_last']    ?? '' ) );
	$phone   = sanitize_text_field( wp_unslash( $_POST['gff_phone']   ?? '' ) );
	$city    = sanitize_text_field( wp_unslash( $_POST['gff_city']    ?? '' ) );
	$zip     = sanitize_text_field( wp_unslash( $_POST['gff_zip']     ?? '' ) );
	$start_date = sanitize_text_field( wp_unslash( $_POST['gff_start_date'] ?? '' ) );
	$sqft    = sanitize_text_field( wp_unslash( $_POST['gff_sqft']    ?? '' ) );

	$ratelock = isset( $_POST['gff_ratelock'] ) ? 'yes' : 'no';
	$indicated_agreement = isset( $_POST['gff_agree'] ) ? 'yes' : 'no';

	// Crops (optional in express)
	$all_crops = array();
	foreach ( gff_reg_crops() as $list ) { $all_crops = array_merge( $all_crops, $list ); }
	$picked = array();
	if ( ! empty( $_POST['gff_crops'] ) && is_array( $_POST['gff_crops'] ) ) {
		foreach ( wp_unslash( $_POST['gff_crops'] ) as $c ) {
			$c = sanitize_text_field( $c );
			if ( in_array( $c, $all_crops, true ) ) { $picked[] = $c; }
		}
	}

	// Add-ons (optional; bundle overrides individuals)
	$addon_catalog = gff_reg_addons();
	$picked_addons = array();
	if ( ! empty( $_POST['gff_addons'] ) && is_array( $_POST['gff_addons'] ) ) {
		foreach ( wp_unslash( $_POST['gff_addons'] ) as $ad ) {
			$ad = sanitize_key( $ad );
			if ( 'bundle' === $ad || isset( $addon_catalog[ $ad ] ) ) { $picked_addons[] = $ad; }
		}
		$picked_addons = array_values( array_unique( $picked_addons ) );
		if ( in_array( 'bundle', $picked_addons, true ) ) { $picked_addons = array( 'bundle' ); }
	}

	// Existing account? Update as an express lead rather than erroring.
	$existing = get_user_by( 'email', $email );
	if ( $existing ) {
		$user_id = $existing->ID;
		$is_new  = false;
	} else {
		$username = gff_reg_unique_username( $email );
		$user_id  = wp_insert_user( array(
			'user_login' => $username,
			'user_email' => $email,
			'user_pass'  => wp_generate_password( 16, true, true ), // auto; user can reset
			'first_name' => $first,
			'last_name'  => $last,
			'display_name' => trim( "$first $last" ) ?: $email,
			'role'       => 'none' === $reservation ? 'gff_lead' : 'gff_customer',
		) );
		if ( is_wp_error( $user_id ) ) {
			return gff_reg_alert( 'error', esc_html( $user_id->get_error_message() ) );
		}
		$is_new = true;
	}

	// Persist whatever we have (only non-empty optional fields overwrite).
	if ( '' !== $phone )   { update_user_meta( $user_id, 'gff_phone', $phone ); }
	if ( '' !== $address ) { update_user_meta( $user_id, 'gff_service_address', $address ); }
	if ( '' !== $city )    { update_user_meta( $user_id, 'gff_service_city', $city ); }
	if ( '' !== $zip )     { update_user_meta( $user_id, 'gff_service_zip', $zip ); }
	if ( '' !== $sqft )    { update_user_meta( $user_id, 'gff_start_sqft', $sqft ); }
	if ( '' !== $start_date ) { update_user_meta( $user_id, 'gff_start_date', $start_date ); }
	if ( ! empty( $picked ) ) { update_user_meta( $user_id, 'gff_crops_wanted', $picked ); }

	// Build-your-farm configurator layout (optional hidden field)
	$gff_layout = gff_reg_parse_layout( $_POST['gff_farm_layout'] ?? '' );
	if ( $gff_layout ) {
		// merge configurator's flat plant picks into crops_wanted (union)
		$merged = array_values( array_unique( array_merge( $picked, $gff_layout['flat'] ) ) );
		if ( ! empty( $merged ) ) { update_user_meta( $user_id, 'gff_crops_wanted', $merged ); }
		update_user_meta( $user_id, 'gff_farm_layout', wp_json_encode( $gff_layout['layout'] ) );
		update_user_meta( $user_id, 'gff_moringa_fruit_upgrade', $gff_layout['moringa_upgrade'] ? 'yes' : 'no' );
	}

	update_user_meta( $user_id, 'gff_signup_flow', 'express' );
	update_user_meta( $user_id, 'gff_offer', $offer );
	update_user_meta( $user_id, 'gff_rate_lock', $ratelock );
	if ( isset( $_POST['gff_three_sisters_optin'] ) ) { // Three Sisters opt-in from the Spire agreement block
		update_user_meta( $user_id, 'gff_three_sisters_request', array( 'time' => current_time( 'mysql' ), 'status' => 'requested_at_signup' ) );
		if ( function_exists( 'gff_reg_send_three_sisters_email' ) ) { gff_reg_send_three_sisters_email( $user_id ); }
	}
	// "Indicated" — NOT a binding acceptance. Distinct meta key from the strict flow.
	update_user_meta( $user_id, 'gff_indicated_agreement', $indicated_agreement );
	update_user_meta( $user_id, 'gff_indicated_agreement_version', gff_reg_agreement_version() );
	update_user_meta( $user_id, 'gff_indicated_at', current_time( 'mysql' ) );

	update_user_meta( $user_id, 'gff_reservation', $reservation );
	$gff_workshop = ( isset( $_POST['gff_workshop_interest'] ) && 'yes' === sanitize_key( wp_unslash( $_POST['gff_workshop_interest'] ) ) ) ? 'yes' : 'no';
	update_user_meta( $user_id, 'gff_workshop_interest', $gff_workshop );
	$gff_res_meta = gff_reg_reservation_meta( $reservation );
	update_user_meta( $user_id, 'gff_reservation_amount', $gff_res_meta['amount'] );
	update_user_meta( $user_id, 'gff_reservation_paid', 'none' === $reservation ? 'no' : 'yes' );
	update_user_meta( $user_id, 'gff_reservation_paid_at', 'none' === $reservation ? '' : current_time( 'mysql' ) );

	// Add-ons (billed separately, same as strict flow)
	$addon_total = 0; $addon_labels = array();
	if ( in_array( 'bundle', $picked_addons, true ) ) {
		$b = gff_reg_bundle();
		$addon_total = (int) $b['price'];
		$addon_labels[] = html_entity_decode( $b['power'], ENT_QUOTES ) . ' (' . $b['name'] . ', $' . (int) $b['price'] . ')';
	} else {
		foreach ( $picked_addons as $ad ) {
			if ( isset( $addon_catalog[ $ad ] ) ) {
				$addon_total += (int) $addon_catalog[ $ad ]['price'];
				$addon_labels[] = html_entity_decode( $addon_catalog[ $ad ]['power'], ENT_QUOTES ) . ' (' . $addon_catalog[ $ad ]['name'] . ', $' . (int) $addon_catalog[ $ad ]['price'] . ')';
			}
		}
	}
	if ( ! empty( $picked_addons ) ) {
		update_user_meta( $user_id, 'gff_addons', $picked_addons );
		update_user_meta( $user_id, 'gff_addons_total', number_format( (float) $addon_total, 2, '.', '' ) );
		update_user_meta( $user_id, 'gff_addons_invoiced', 'no' );
		update_user_meta( $user_id, 'gff_addons_labels', implode( '; ', $addon_labels ) );
	}

	if ( $is_new ) { wp_new_user_notification( $user_id, null, 'admin' ); }

	// Build success output
	$method = 'none' === $reservation ? 'express_email_lead' : 'express_' . $reservation;
	$name_for_msg = $first ? esc_html( $first ) : 'there';
	$out = 'Thanks, ' . $name_for_msg . '! ';

	if ( 'none' === $reservation ) {
		$out .= 'You&rsquo;re on the list &mdash; we&rsquo;ll email you at <strong>' . esc_html( $email ) . '</strong> with your next steps'
			. ( 'yes' === $indicated_agreement ? ', including the agreement details you reviewed' : '' ) . '.';
	} else {
		$rm      = gff_reg_reservation_meta( $reservation );
		$pay_url = $rm['url'];
		$amt     = $rm['amount'];
		$amt_disp = '$' . rtrim( rtrim( $amt, '0' ), '.' );
		$label   = $rm['label'];
		if ( 'consult' === $reservation ) {
			$callout = 'Send your ' . $amt_disp . ' now to lock in your on-site consult. It credits to your first month.';
		} elseif ( 'workshop' === $reservation ) {
			$callout = 'Send your ' . $amt_disp . ' now to reserve your seat at the monthly workshop.';
		} else {
			$callout = 'Send your ' . $amt_disp . ' now &mdash; we drop inoculant and hay on your site within 48 hours of your PayPal payment.';
		}
		$out .= 'Your spot is reserved. <strong>' . esc_html( $label ) . '</strong> &mdash; complete it below and we&rsquo;ll reach out to finish onboarding.';
		$out .= '<div class="gff-paid-callout"><p><strong>' . esc_html( $label ) . ' selected.</strong> '
			. '<a class="gff-paid-callout__link" href="' . esc_url( $pay_url ) . '" target="_blank" rel="noopener">Send your ' . esc_html( $amt_disp ) . ' via PayPal &rarr;</a></p></div>';

		// PayPal modal (same pattern as strict flow)
		$out .= '<div class="gff-modal" id="gff-pay-modal" role="dialog" aria-modal="true" hidden>'
			. '<div class="gff-modal__backdrop" data-gff-modal-close></div>'
			. '<div class="gff-modal__card">'
			. '<button type="button" class="gff-modal__close" data-gff-modal-close aria-label="Close">&times;</button>'
			. '<h3 class="gff-modal__title">' . esc_html( $label ) . '</h3>'
			. '<p class="gff-modal__body">' . esc_html( $callout ) . '</p>'
			. '<a href="' . esc_url( $pay_url ) . '" target="_blank" rel="noopener" class="gff-btn gff-btn--pp">Pay ' . esc_html( $amt_disp ) . ' via PayPal &rarr;</a>'
			. '<p class="gff-modal__hint">Opens PayPal in a new tab. Credit/debit card works &mdash; no PayPal account required.</p>'
			. '</div></div>';
		$out .= '<script>(function(){var m=document.getElementById("gff-pay-modal");if(!m)return;'
			. 'if(m.parentNode!==document.body){document.body.appendChild(m);}'
			. 'var open=function(){m.hidden=false;document.body.style.overflow="hidden";};'
			. 'var close=function(){m.hidden=true;document.body.style.overflow="";};'
			. 'm.querySelectorAll("[data-gff-modal-close]").forEach(function(el){el.addEventListener("click",close);});'
			. 'document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!m.hidden)close();});'
			. 'setTimeout(open,600);})();</script>';
	}

	if ( ! empty( $picked_addons ) ) {
		$out .= '<div class="gff-addon-callout">'
			. '<p><strong>Bounties claimed:</strong> ' . esc_html( implode( ', ', $addon_labels ) ) . '.</p>'
			. '<p>Total: <strong>$' . esc_html( number_format( (float) $addon_total, 2, '.', '' ) ) . '</strong> &mdash; invoiced separately after enrollment.</p>'
			. '</div>';
	}

	// GA4 sign_up (with method param so express leads are distinguishable from full enrollments)
	$out .= '<script>(function(){if(typeof gtag!=="function"){return;}'
		. 'gtag("event","sign_up",{method:' . wp_json_encode( $method ) . ',value:150,currency:"USD"});'
		. '})();</script>';

	// Meta CompleteRegistration (same reliable standard event)
	$out .= '<script>(function(){var tries=0;function fire(){'
		. 'if(typeof fbq!=="function"){if(tries++<40){return setTimeout(fire,150);}return;}'
		. 'try{fbq("track","CompleteRegistration",{value:150,currency:"USD",content_name:"Zora Express Enrollment",registration_type:' . wp_json_encode( $method ) . '});}catch(e){}'
		. '}fire();})();</script>';

	return gff_reg_alert( 'success', $out );
}

/* ============================================================
 * TOWER (SPIRE) HANDLER — self-contained, cannot affect Zora flows.
 *   Email required; tower qty 1-100; name/address optional.
 *   Stores tower count + computed monthly; cross-sell aware.
 * ============================================================ */
function gff_reg_handle_tower() {
	if ( ! isset( $_POST['gff_tower_nonce'] ) || ! wp_verify_nonce( $_POST['gff_tower_nonce'], 'gff_tower_action' ) ) {
		return gff_reg_alert( 'error', 'Security check failed. Please reload the page and try again.' );
	}
	if ( ! empty( $_POST['gff_company_url'] ) ) {
		return gff_reg_alert( 'error', 'Submission blocked.' );
	}

	$email = sanitize_email( wp_unslash( $_POST['gff_email'] ?? '' ) );
	if ( ! is_email( $email ) ) {
		gff_reg_flag_repop();
		return gff_reg_alert( 'error', 'Please enter a valid email address to continue.' );
	}

	$qty = (int) ( $_POST['gff_tower_qty'] ?? 1 );
	$qty = max( 1, min( $qty, gff_reg_tower_max() ) );

	// Optional fields
	$first   = sanitize_text_field( wp_unslash( $_POST['gff_first']   ?? '' ) );
	$last    = sanitize_text_field( wp_unslash( $_POST['gff_last']    ?? '' ) );
	$phone   = sanitize_text_field( wp_unslash( $_POST['gff_phone']   ?? '' ) );
	$address = sanitize_text_field( wp_unslash( $_POST['gff_address'] ?? '' ) );
	$city    = sanitize_text_field( wp_unslash( $_POST['gff_city']    ?? '' ) );
	$zip     = sanitize_text_field( wp_unslash( $_POST['gff_zip']     ?? '' ) );

	$reservation = sanitize_key( wp_unslash( $_POST['gff_reservation'] ?? 'none' ) );
	if ( ! in_array( $reservation, array( 'none', 'consult', 'down_payment', 'workshop' ), true ) ) {
		$reservation = 'none';
	}
	$indicated_agreement = isset( $_POST['gff_agree'] ) ? 'yes' : 'no';
	if ( 'yes' !== $indicated_agreement ) {
		gff_reg_flag_repop();
		return gff_reg_alert( 'error', 'Please read and accept the Spire Service Agreement to continue.' );
	}

	$monthly = gff_reg_tower_total( $qty );

	// Existing account? update; else create.
	$existing = get_user_by( 'email', $email );
	if ( $existing ) {
		$user_id = $existing->ID;
		$is_new  = false;
		// Cross-sell signal: did they already have a Zora/express enrollment?
		$prior_flow = get_user_meta( $user_id, 'gff_signup_flow', true );
		$is_crosssell = in_array( $prior_flow, array( 'full', 'express' ), true );
	} else {
		$username = gff_reg_unique_username( $email );
		$user_id  = wp_insert_user( array(
			'user_login'   => $username,
			'user_email'   => $email,
			'user_pass'    => wp_generate_password( 16, true, true ),
			'first_name'   => $first,
			'last_name'    => $last,
			'display_name' => trim( "$first $last" ) ?: $email,
			'role'         => 'none' === $reservation ? 'gff_lead' : 'gff_customer',
		) );
		if ( is_wp_error( $user_id ) ) {
			return gff_reg_alert( 'error', esc_html( $user_id->get_error_message() ) );
		}
		$is_new = true;
		$is_crosssell = false;
	}

	// Apply cross-sell: 10% off the FIRST add-on tower only (existing Zora customer adding Spires).
	if ( $is_crosssell ) {
		$discount = round( gff_reg_tower_first_price() * ( gff_reg_tower_crosssell_pct() / 100 ), 2 );
		$monthly  = max( 0, $monthly - $discount );
		update_user_meta( $user_id, 'gff_tower_crosssell', 'yes' );
	}

	if ( '' !== $phone )   { update_user_meta( $user_id, 'gff_phone', $phone ); }
	if ( '' !== $address ) { update_user_meta( $user_id, 'gff_service_address', $address ); }
	if ( '' !== $city )    { update_user_meta( $user_id, 'gff_service_city', $city ); }
	if ( '' !== $zip )     { update_user_meta( $user_id, 'gff_service_zip', $zip ); }

	update_user_meta( $user_id, 'gff_signup_flow', 'tower' );
	update_user_meta( $user_id, 'gff_tower_qty', $qty );
	update_user_meta( $user_id, 'gff_tower_monthly', number_format( (float) $monthly, 2, '.', '' ) );
	update_user_meta( $user_id, 'gff_tower_food_value', gff_reg_tower_food_value() * $qty );
	$gff_layout_tower = gff_reg_parse_layout( $_POST['gff_farm_layout'] ?? '' );
	if ( $gff_layout_tower ) {
		if ( ! empty( $gff_layout_tower['flat'] ) ) {
			update_user_meta( $user_id, 'gff_crops_wanted', $gff_layout_tower['flat'] );
		}
		update_user_meta( $user_id, 'gff_farm_layout', wp_json_encode( $gff_layout_tower['layout'] ) );
	}
	update_user_meta( $user_id, 'gff_indicated_agreement', $indicated_agreement );
	update_user_meta( $user_id, 'gff_indicated_agreement_version', gff_reg_agreement_version() );
	update_user_meta( $user_id, 'gff_indicated_at', current_time( 'mysql' ) );
	update_user_meta( $user_id, 'gff_reservation', $reservation );
	update_user_meta( $user_id, 'gff_reservation_paid', 'none' === $reservation ? 'no' : 'yes' );
	$gff_workshop = ( isset( $_POST['gff_workshop_interest'] ) && 'yes' === sanitize_key( wp_unslash( $_POST['gff_workshop_interest'] ) ) ) ? 'yes' : 'no';
	update_user_meta( $user_id, 'gff_workshop_interest', $gff_workshop );
	$gff_res_meta = gff_reg_reservation_meta( $reservation );
	update_user_meta( $user_id, 'gff_reservation_amount', $gff_res_meta['amount'] );

	if ( $is_new ) { wp_new_user_notification( $user_id, null, 'admin' ); }

	$method = 'none' === $reservation ? 'tower_email_lead' : 'tower_' . $reservation;
	if ( $is_crosssell ) { $method .= '_crosssell'; }
	$name_for_msg = $first ? esc_html( $first ) : 'there';
	$spire_word = $qty === 1 ? 'Spire' : 'Spires';

	$out  = 'Thanks, ' . $name_for_msg . '! ';
	$out .= 'You&rsquo;ve reserved <strong>' . (int) $qty . ' ' . $spire_word . '</strong> at <strong>$' . esc_html( number_format( (float) $monthly, 0 ) ) . '/mo</strong>';
	$out .= $is_crosssell ? ' <em>(includes your 10% member discount)</em>.' : '.';
	$out .= ' Each Spire includes its own herb garden, and we install and maintain everything for you.';

	if ( 'none' !== $reservation ) {
		$rm      = gff_reg_reservation_meta( $reservation );
		$pay_url = $rm['url'];
		$amt     = $rm['amount'];
		$amt_disp = '$' . rtrim( rtrim( $amt, '0' ), '.' );
		$label   = $rm['label'];
		if ( 'workshop' === $reservation ) {
			$modal_body = 'Send your ' . $amt_disp . ' now to reserve your seat at the monthly workshop.';
		} elseif ( 'consult' === $reservation ) {
			$modal_body = 'Send your ' . $amt_disp . ' now to lock in your on-site consult. It credits to your first month.';
		} else {
			$modal_body = 'Send your ' . $amt_disp . ' now to lock in your Spire install. It credits to your first month.';
		}
		$out .= '<div class="gff-paid-callout"><p><strong>' . esc_html( $label ) . ' selected.</strong> '
			. '<a class="gff-paid-callout__link" href="' . esc_url( $pay_url ) . '" target="_blank" rel="noopener">Send your ' . esc_html( $amt_disp ) . ' via PayPal &rarr;</a></p></div>';
		$out .= '<div class="gff-modal" id="gff-pay-modal" role="dialog" aria-modal="true" hidden>'
			. '<div class="gff-modal__backdrop" data-gff-modal-close></div>'
			. '<div class="gff-modal__card">'
			. '<button type="button" class="gff-modal__close" data-gff-modal-close aria-label="Close">&times;</button>'
			. '<h3 class="gff-modal__title">' . esc_html( $label ) . '</h3>'
			. '<p class="gff-modal__body">' . esc_html( $modal_body ) . '</p>'
			. '<a href="' . esc_url( $pay_url ) . '" target="_blank" rel="noopener" class="gff-btn gff-btn--pp">Pay ' . esc_html( $amt_disp ) . ' via PayPal &rarr;</a>'
			. '<p class="gff-modal__hint">Opens PayPal in a new tab. Credit/debit card works &mdash; no PayPal account required.</p>'
			. '</div></div>';
		$out .= '<script>(function(){var m=document.getElementById("gff-pay-modal");if(!m)return;'
			. 'if(m.parentNode!==document.body){document.body.appendChild(m);}'
			. 'var open=function(){m.hidden=false;document.body.style.overflow="hidden";};'
			. 'var close=function(){m.hidden=true;document.body.style.overflow="";};'
			. 'm.querySelectorAll("[data-gff-modal-close]").forEach(function(el){el.addEventListener("click",close);});'
			. 'document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!m.hidden)close();});'
			. 'setTimeout(open,600);})();</script>';
	}

	// GA4 + Meta events with tower method param
	$out .= '<script>(function(){if(typeof gtag!=="function"){return;}'
		. 'gtag("event","sign_up",{method:' . wp_json_encode( $method ) . ',value:' . (int) $monthly . ',currency:"USD"});'
		. '})();</script>';
	$out .= '<script>(function(){var tries=0;function fire(){'
		. 'if(typeof fbq!=="function"){if(tries++<40){return setTimeout(fire,150);}return;}'
		. 'try{fbq("track","CompleteRegistration",{value:' . (int) $monthly . ',currency:"USD",content_name:"Spire Tower Enrollment",registration_type:' . wp_json_encode( $method ) . '});}catch(e){}'
		. '}fire();})();</script>';

	return gff_reg_alert( 'success', $out );
}

/* ============================================================
 * 8. UTILITY HELPERS
 * ============================================================ */
function gff_reg_unique_username( $email ) {
	$base = sanitize_user( current( explode( '@', $email ) ), true );
	if ( '' === $base ) { $base = 'customer'; }
	$try = $base; $i = 1;
	while ( username_exists( $try ) ) { $try = $base . $i; $i++; }
	return $try;
}

/* Parse the build-your-farm configurator payload from a hidden field.
 * Returns array( 'flat' => [plant names], 'layout' => sanitized structure, 'moringa_upgrade' => bool )
 * or null if absent/invalid. Validates every plant name against gff_reg_crops(). */
function gff_reg_parse_layout( $raw ) {
	if ( empty( $raw ) || ! is_string( $raw ) ) { return null; }
	$data = json_decode( wp_unslash( $raw ), true );
	if ( ! is_array( $data ) ) { return null; }

	// build the master allowed-plant list once
	$all = array();
	foreach ( gff_reg_crops() as $list ) { $all = array_merge( $all, $list ); }

	$flat = array();
	$clean = array( 'offer' => '' );

	$offer = isset( $data['offer'] ) ? sanitize_key( $data['offer'] ) : '';
	if ( in_array( $offer, gff_v33_offers(), true ) ) { $clean['offer'] = $offer; }

	if ( 'spire' === $clean['offer'] && ! empty( $data['towers_plants'] ) && is_array( $data['towers_plants'] ) ) {
		$clean['towers'] = array();
		foreach ( $data['towers_plants'] as $t ) {
			$tn = isset( $t['tower'] ) ? (int) $t['tower'] : 0;
			$plants = array();
			if ( ! empty( $t['plants'] ) && is_array( $t['plants'] ) ) {
				foreach ( $t['plants'] as $p ) {
					$p = sanitize_text_field( $p );
					if ( in_array( $p, $all, true ) ) { $plants[] = $p; $flat[] = $p; }
				}
			}
			$clean['towers'][] = array( 'tower' => $tn, 'plants' => $plants );
		}
	} elseif ( 'sunrise' === $clean['offer'] && ! empty( $data['seasonal_spots'] ) && is_array( $data['seasonal_spots'] ) ) {
		$clean['seasonal_spots'] = array();
		foreach ( $data['seasonal_spots'] as $p ) {
			$p = sanitize_text_field( $p );
			if ( in_array( $p, $all, true ) ) { $clean['seasonal_spots'][] = $p; $flat[] = $p; }
		}
	}

	$moringa = ! empty( $data['moringa_fruit_upgrade'] );

	return array(
		'flat'            => array_values( array_unique( $flat ) ),
		'layout'          => $clean,
		'moringa_upgrade' => $moringa,
	);
}

function gff_reg_alert( $type, $html ) {
	$cls  = 'success' === $type ? 'gff-alert--ok' : 'gff-alert--err';
	$role = 'success' === $type ? 'status' : 'alert';
	// Heading so a buried message reads clearly the instant the user is scrolled to it.
	$lead = 'success' === $type ? '' : '<strong class="gff-alert__lead">Please fix the following before submitting:</strong>';
	$out  = '<div id="gff-alert" class="gff-alert ' . esc_attr( $cls ) . '" role="' . esc_attr( $role ) . '" tabindex="-1">'
		. $lead . $html
		. '</div>';
	// On reload after a submit, jump the user to the message (it otherwise sits below the fold,
	// near the submit button, so a failed submit looks like "nothing happened").
	$out .= '<script>(function(){'
		. 'var a=document.getElementById("gff-alert");if(!a)return;'
		. 'setTimeout(function(){'
		. 'a.scrollIntoView({behavior:"smooth",block:"center"});'
		. 'try{a.focus({preventScroll:true});}catch(e){a.focus();}'
		. '},120);'
		. '})();</script>';
	return $out;
}

/* ============================================================
 * 9. CSS
 * ============================================================ */
function gff_reg_css() {
	return '
	.gff-reg{--ink:#1c1c1a;--muted:#6f6e69;--line:#d9d3c4;--cream:#faf7f0;--g-dark:#1c1c1a;--g-mid:#1c1c1a;--g-leaf:#e6f3fb;font-family:"Lato",sans-serif;color:var(--ink);max-width:820px;margin:0 auto;padding:1rem;}
	/* Uniform ~10% readability bump for the registration UI text. */
	.gff-reg{font-size:1.1rem;}
	.gff-reg input[type="text"],.gff-reg input[type="email"],.gff-reg input[type="tel"],.gff-reg input[type="password"],.gff-reg input[type="date"],.gff-reg textarea,.gff-reg select{font-size:1.1rem;}
	.gff-reg__brand{font-size:2.64rem;}
	.gff-reg__banner{font-size:1.54rem;}
	.gff-reg label,.gff-reg legend,.gff-reg p,.gff-reg li{font-size:1.1em;}
	.gff-reg__head{text-align:center;margin-bottom:1.4rem;}
	.gff-reg__brand{font-size:2.4rem;font-weight:700;margin:0;letter-spacing:-0.01em;color:var(--ink);}
	.gff-reg__zone{font-size:1rem;color:var(--muted);margin:.2rem 0 1rem;}
	.gff-reg__banner{font-size:1.4rem;font-weight:600;color:var(--g-dark);background:var(--g-leaf);padding:.7rem 1.4rem;border-radius:11px;display:inline-block;max-width:60ch;margin:0 auto;}
	.gff-reg__phone{display:inline-block;margin-top:.7rem;color:var(--g-dark);font-weight:700;text-decoration:none;font-size:1.1rem;}
	.gff-reg__form{margin:0;}
	.gff-reg label{display:flex;flex-direction:column;font-size:.85rem;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);gap:.3rem;}
	.gff-reg input[type="text"],.gff-reg input[type="email"],.gff-reg input[type="tel"],.gff-reg input[type="password"],.gff-reg input[type="date"]{font:inherit;font-size:1rem;color:var(--ink);padding:.6rem .65rem;border:1px solid var(--line);border-radius:7px;background:#fff;width:100%;box-sizing:border-box;}
	.gff-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem 1rem;}
	.gff-col-2{grid-column:span 2;}
	.gff-checklist{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:0 0 1rem;}
	.gff-cl-sec{break-inside:avoid;}
	.gff-cl-head{font-size:1rem;font-weight:700;color:var(--g-dark);margin:0 0 .35rem;text-transform:uppercase;letter-spacing:.04em;}
	.gff-cl-items{list-style:none;margin:0;padding:0;columns:2;column-gap:1rem;}
	.gff-cl-items li{break-inside:avoid;margin:0 0 .15rem;}
	.gff-cl-item{display:flex;flex-direction:row !important;align-items:center;gap:.55rem;font-size:.95rem;color:var(--ink);text-transform:none;letter-spacing:0;cursor:pointer;line-height:1.3;}
	.gff-cl-check{appearance:none;-webkit-appearance:none;-moz-appearance:none;margin:0;flex:none;width:1.2rem;height:1.2rem;border:2.5px solid #1c1c1a;border-radius:3px;background:#fff;cursor:pointer;display:inline-block;position:relative;vertical-align:middle;box-shadow:0 1px 2px rgba(0,0,0,0.12);transition:background .12s, border-color .12s;}
	.gff-cl-check:hover{border-color:var(--g-mid);}
	.gff-cl-check:checked{background:var(--g-mid);border-color:var(--g-mid);}
	.gff-cl-check:checked::after{content:"";position:absolute;left:4px;top:0px;width:6px;height:11px;border:solid #fff;border-width:0 2.5px 2.5px 0;transform:rotate(45deg);}
	.gff-cl-check:focus-visible{outline:2px solid var(--g-mid);outline-offset:2px;}
	@media (max-width:760px){.gff-cl-items{columns:2;}.gff-checklist{grid-template-columns:1fr;}}
	@media (max-width:430px){.gff-cl-items{columns:1;}}
	.gff-price{border:1.5px solid var(--ink);border-radius:14px;padding:.9rem 1.1rem;margin:0 0 1.4rem;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.8rem 1.2rem;background:var(--cream);}
	.gff-price__lines{display:flex;flex-direction:column;}
	.gff-price__big{font-size:1.5rem;color:var(--ink);font-weight:700;line-height:1.1;}
	.gff-price__big span{font-size:1rem;font-weight:400;}
	.gff-price__sub{font-size:1rem;color:var(--ink);}
	.gff-price__sqft{display:flex;flex-direction:column;font-size:1rem;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);gap:.3rem;}
	.gff-price__sqft input{font:inherit;font-size:1rem;color:var(--ink);padding:.5rem .6rem;border:1px solid var(--line);border-radius:7px;width:130px;background:#fff;}
	.gff-price__est{flex-basis:100%;margin:.2rem 0 0;font-size:1rem;color:var(--g-mid);}
	.gff-price__note{flex-basis:100%;margin:.2rem 0 0;font-size:1rem;color:var(--muted);font-style:italic;}
	.gff-price__pitch{display:block;margin-top:.35rem;font-size:1rem;color:var(--g-mid);font-style:italic;max-width:34ch;}
	.gff-opt{font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted);font-style:italic;}
	.gff-reg textarea,.gff-reg select{font:inherit;font-size:1rem;color:var(--ink);padding:.6rem .65rem;border:1px solid var(--line);border-radius:7px;background:#fff;width:100%;box-sizing:border-box;}
	.gff-reg__group{border:1.5px solid var(--line);border-radius:10px;padding:1.05rem 1.1rem 1.2rem;margin:0 0 1.05rem;background:var(--cream);transition:border-color .2s ease, background .2s ease;}
	.gff-reg__group legend{font-size:1.05rem;font-weight:700;color:var(--ink);padding:0 .35rem;}
	.gff-reg__group[data-gff-required="1"][data-gff-complete="no"]{border-color:#c9a227;background:#f8f4ea;}
	.gff-reg__group[data-gff-required="1"][data-gff-complete="yes"]{border-color:var(--line);background:var(--cream);}
	.gff-flag{display:none;}
	.gff-reg__group[data-gff-required="1"][data-gff-complete="no"] .gff-flag{display:inline;color:#c9a227;font-size:.95em;margin-left:.3em;}
	.gff-reg__group[data-gff-required="1"][data-gff-complete="yes"] legend::after{content:" ✓";color:#1c1c1a;font-weight:700;}
	.gff-shake{animation:gff-shake .45s ease-in-out;}
	@keyframes gff-shake{0%,100%{transform:translateX(0);}25%{transform:translateX(-6px);}75%{transform:translateX(6px);}}
	.gff-hint{font-size:.92rem;color:var(--muted);margin:.35rem 0 0;}
	.gff-acc-wrap{max-width:680px;margin:0 auto;border:1.5px solid var(--line);border-radius:8px;background:#fff;}
	.gff-acc-wrap>summary{padding:.8rem 1rem;cursor:pointer;font-weight:700;font-size:1.02rem;color:var(--ink);display:flex;justify-content:space-between;align-items:center;gap:1rem;list-style:none;}
	.gff-acc-wrap>summary::-webkit-details-marker{display:none;}
	.gff-acc-wrap__hint{font-weight:400;font-size:.85rem;color:var(--muted);margin-left:.4rem;}
	.gff-acc-wrap[open]>summary{border-bottom:1px solid var(--line);margin-bottom:.6rem;}
	.gff-acc-wrap .gff-acc{border:0;max-width:none;margin:0 .5rem .5rem;}
	.gff-acc{border:1px solid var(--line);border-radius:8px;background:#fff;max-width:680px;margin:0 auto;}
	.gff-acc__item{border-bottom:1px solid var(--line);}
	.gff-acc__item:last-child{border-bottom:0;}
	.gff-acc__item summary{padding:.65rem .8rem;cursor:pointer;font-weight:600;font-size:.97rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;list-style:none;}
	.gff-acc__item summary::-webkit-details-marker{display:none;}
	.gff-acc__chev::after{content:"+";font-weight:400;color:var(--muted);font-size:1.1rem;}
	.gff-acc__item[open] .gff-acc__chev::after{content:"\2212";}
	.gff-acc-wrap[open]>summary .gff-acc__chev::after{content:"\2212";}
	.gff-acc__body{padding:0 .8rem .8rem;font-size:.94rem;line-height:1.55;color:var(--ink);}
	.gff-acc__body p{margin:0;}
	.gff-check{display:flex;flex-direction:row !important;align-items:flex-start;gap:.55rem;margin-top:1rem;font-size:1rem;color:var(--ink);line-height:1.5;text-transform:none;letter-spacing:0;max-width:680px;margin-left:auto;margin-right:auto;}
	.gff-check input{margin-top:.2rem;flex:none;width:1.05rem;height:1.05rem;accent-color:var(--g-mid);}
	.gff-reg .gff-btn,
	.gff-reg button.gff-btn,
	.gff-reg a.gff-btn,
	.gff-alert .gff-btn,
	.gff-alert a.gff-btn,
	.gff-modal .gff-btn,
	.gff-modal a.gff-btn{
		display:block !important;
		width:100% !important;
		margin-top:1.4rem !important;
		padding:.95rem 1rem !important;
		font-family:inherit !important;
		font-size:1.02rem !important;
		font-weight:700 !important;
		line-height:1.3 !important;
		color:#ffffff !important;
		background:#1c1c1a !important;
		background-color:#1c1c1a !important;
		background-image:none !important;
		border:0 !important;
		border-radius:9px !important;
		cursor:pointer !important;
		transition:background .15s, transform .05s !important;
		text-decoration:none !important;
		text-align:center !important;
		box-sizing:border-box !important;
		text-transform:none !important;
		letter-spacing:0 !important;
		text-shadow:none !important;
		box-shadow:0 1px 3px rgba(0,0,0,0.15) !important;
		appearance:none !important;
		-webkit-appearance:none !important;
	}
	.gff-reg .gff-btn:hover,
	.gff-reg button.gff-btn:hover,
	.gff-reg a.gff-btn:hover,
	.gff-alert .gff-btn:hover,
	.gff-alert a.gff-btn:hover{
		background:#1c1c1a !important;
		background-color:#1c1c1a !important;
		color:#ffffff !important;
	}
	.gff-reg .gff-btn:active,
	.gff-reg button.gff-btn:active,
	.gff-reg a.gff-btn:active{ transform:translateY(1px) !important; }
	.gff-reg .gff-btn--pp,
	.gff-alert .gff-btn--pp,
	.gff-reg a.gff-btn--pp,
	.gff-alert a.gff-btn--pp,
	.gff-modal .gff-btn--pp,
	.gff-modal a.gff-btn--pp{
		background:#FFC439 !important;
		background-color:#FFC439 !important;
		color:#003087 !important;
		border:1px solid #DDA600 !important;
	}
	.gff-reg .gff-btn--pp:hover,
	.gff-alert .gff-btn--pp:hover,
	.gff-reg a.gff-btn--pp:hover,
	.gff-alert a.gff-btn--pp:hover,
	.gff-modal .gff-btn--pp:hover,
	.gff-modal a.gff-btn--pp:hover{
		background:#F0B82A !important;
		background-color:#F0B82A !important;
		color:#003087 !important;
	}
	.gff-consult{background:#fff8e5;border:1.5px solid #d4a017;}
	.gff-consult legend{color:#7a4f00;}
	.gff-consult__lead{margin:.2rem 0 .9rem;font-size:1rem;line-height:1.55;color:var(--ink);}
	.gff-consult__opt{display:flex;flex-direction:row !important;align-items:flex-start;gap:.6rem;padding:.7rem .8rem;border:1px solid var(--line);border-radius:8px;margin:.4rem 0;background:#fff;cursor:pointer;text-transform:none;letter-spacing:0;color:var(--ink);}
	.gff-consult__opt input{margin-top:.25rem;flex:none;width:1.1rem;height:1.1rem;accent-color:#7a4f00;}
	.gff-consult__opt-body{display:flex;flex-direction:column;gap:.18rem;font-size:1rem;}
	.gff-consult__opt-body strong{font-weight:700;color:var(--ink);}
	.gff-consult__opt-body em{font-style:normal;font-size:.9rem;color:var(--muted);}
	.gff-consult__paylater{margin:1rem 0 0;font-size:.9rem;color:var(--muted);font-style:italic;line-height:1.5;}
	.gff-consult__paylater a{color:#7a4f00;font-weight:700;text-decoration:underline;word-break:break-all;}
	.gff-paid-callout{margin:1rem 0 0;padding:.85rem 1rem;background:#fff8e5;border:1.5px solid #d4a017;border-radius:8px;}
	.gff-paid-callout p{margin:0;font-size:1rem;color:#1c1c1a;}
	.gff-paid-callout__link{color:#7a4f00 !important;font-weight:700;text-decoration:underline !important;}
	.gff-paid-callout__link:hover{color:#5c3a00 !important;}
	/* ---- Bounties (gamified add-ons) ---- */
	.gff-bounty{background:#f6f3ea;border:1.5px solid #c9a227;max-width:680px;margin-left:auto;margin-right:auto;padding:0;overflow:hidden;}
	.gff-bounty__legend{color:#1c1c1a;font-weight:800;}
	.gff-bounty__summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:.75rem;padding:1rem 1.15rem;user-select:none;}
	.gff-bounty__summary::-webkit-details-marker{display:none;}
	.gff-bounty__summary-emoji{font-size:1.5rem;line-height:1;flex:0 0 auto;}
	.gff-bounty__summary-text{display:flex;flex-direction:column;gap:.12rem;flex:1;min-width:0;text-align:left;}
	.gff-bounty__summary .gff-bounty__legend{font-size:1.05rem;line-height:1.2;}
	.gff-bounty__summary-hint{font-size:.8rem;font-weight:700;color:#c9a227;text-transform:none;letter-spacing:0;}
	.gff-bounty__chev{color:#1c1c1a;flex:0 0 auto;display:flex;transition:transform .25s ease;animation:gff-bounty-invite 2.2s ease-in-out infinite;}
	.gff-bounty__summary:hover .gff-bounty__chev{color:#c9a227;}
	.gff-bounty__summary:focus-visible{outline:2px solid #1c1c1a;outline-offset:-3px;border-radius:8px;}
	.gff-bounty[open] .gff-bounty__chev{transform:rotate(180deg);animation:none;}
	.gff-bounty__body{padding:0 1.15rem 1.15rem;}
	@keyframes gff-bounty-invite{0%,100%{transform:translateY(0);}50%{transform:translateY(3px);}}
	@media (prefers-reduced-motion:reduce){.gff-bounty__chev{animation:none;}}
	.gff-ts-field{border:1.5px solid #c9a227;background:#f6f3ea;border-radius:12px;padding:10px 12px;margin:.6rem 0;}
	.gff-ts-check span{font-size:.92rem;line-height:1.5;}
	.gff-bounty__opt{font-weight:400;color:var(--muted);font-size:.82em;}
	.gff-bounty__lead{margin:.2rem 0 1rem;font-size:.96rem;line-height:1.55;color:var(--ink);text-transform:none;letter-spacing:0;}
	.gff-bounty__lead strong{color:#1c1c1a;}
	/* shared tile */
	.gff-bounty-tile{position:relative;display:block;cursor:pointer;text-transform:none;letter-spacing:0;}
	.gff-bounty-tile input{position:absolute;opacity:0;width:0;height:0;pointer-events:none;}
	.gff-bounty-tile__inner{display:flex;flex-direction:column;align-items:center;text-align:center;gap:.25rem;padding:1rem .8rem;background:#fff;border:2px solid var(--line);border-radius:16px;height:100%;transition:border-color .18s ease, box-shadow .18s ease, transform .12s ease;}
	.gff-bounty-tile__icon{color:#9a9a94;transition:color .18s ease, filter .18s ease;line-height:0;}
	.gff-bounty-tile__power{font-weight:800;font-size:1rem;color:var(--ink);line-height:1.2;}
	.gff-bounty-tile__name{font-size:.8rem;color:var(--muted);font-style:italic;line-height:1.2;}
	.gff-bounty-tile__price{font-weight:800;color:#1c1c1a;font-size:1.02rem;margin-top:.15rem;}
	.gff-bounty-tile__was{display:block;font-weight:700;font-size:.72rem;color:#8a6d00;font-style:normal;}
	.gff-bounty-tile__desc{font-size:.82rem;color:var(--muted);line-height:1.45;margin-top:.2rem;}
	.gff-bounty-tile__check{position:absolute;top:.5rem;right:.5rem;width:1.5rem;height:1.5rem;border-radius:50%;background:#e7ece2;color:#fff;display:flex;align-items:center;justify-content:center;font-size:.95rem;font-weight:800;transition:background .18s ease, transform .18s ease;z-index:2;}
	/* hover */
	.gff-bounty-tile:hover .gff-bounty-tile__inner{border-color:#d8c58a;}
	/* CLAIMED (gold glow) */
	.gff-bounty-tile.is-claimed .gff-bounty-tile__inner{border-color:#e3b008;box-shadow:0 0 0 2px rgba(227,176,8,.35), 0 0 18px 2px rgba(227,176,8,.55);transform:translateY(-2px);background:linear-gradient(160deg,#fffdf4,#fff8e0);}
	.gff-bounty-tile.is-claimed .gff-bounty-tile__check{background:#e3b008;transform:scale(1.08);box-shadow:0 0 8px rgba(227,176,8,.8);}
	.gff-bounty-tile.is-claimed .gff-bounty-tile__icon{color:#c8901a;filter:drop-shadow(0 0 6px rgba(227,176,8,.6));}
	.gff-bounty-tile.is-claimed .gff-bounty-tile__power{color:#7a4f00;}
	/* keyboard focus */
	.gff-bounty-tile input:focus-visible + .gff-bounty-tile__inner{outline:2px solid #1c1c1a;outline-offset:2px;}
	/* grid of singles */
	.gff-bounty-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.7rem;margin-top:.3rem;}
	/* bundle hero tile (wider, richer) */
	.gff-bounty-tile--bundle .gff-bounty-tile__inner{border:2.5px solid #d4a017;background:linear-gradient(150deg,#fff8e5,#f6f3ea);box-shadow:0 3px 14px rgba(212,160,23,.2);padding:1.2rem 1rem;}
	.gff-bounty-tile--bundle .gff-bounty-tile__icon{color:#c8901a;}
	.gff-bounty-tile--bundle .gff-bounty-tile__power{font-size:1.2rem;color:#7a4f00;}
	.gff-bounty-tile--bundle .gff-bounty-tile__price{font-size:1.25rem;color:#7a4f00;}
	.gff-bounty-tile--bundle.is-claimed .gff-bounty-tile__inner{border-color:#e3b008;box-shadow:0 0 0 3px rgba(227,176,8,.4), 0 0 26px 4px rgba(227,176,8,.6);}
	.gff-bounty-tile__save{display:inline-block;margin-top:.4rem;background:#1c1c1a;color:#fff;font-size:.78rem;font-weight:700;padding:.22rem .7rem;border-radius:20px;}
	.gff-bounty__or{text-align:center;margin:1rem 0 .5rem;font-size:.8rem;color:var(--muted);letter-spacing:.05em;text-transform:uppercase;}
	/* running total */
	.gff-bounty__total{margin-top:1.1rem;padding:.9rem 1rem;background:#1c1c1a;color:#fff;border-radius:12px;display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;box-shadow:0 0 14px rgba(44,74,14,.25);}
	.gff-bounty__total-label{font-weight:700;font-size:1rem;}
	.gff-bounty__total-amt{font-weight:800;font-size:1.35rem;margin-left:auto;color:#ffe9a8;}
	.gff-bounty__total-note{flex-basis:100%;font-size:.8rem;opacity:.9;font-weight:400;}
	.gff-bounty__total[hidden]{display:none !important;}
	.gff-addon-callout{margin:1rem 0 0;padding:.85rem 1rem;background:#f6f3ea;border:1.5px solid #c9a227;border-radius:8px;}
	.gff-addon-callout p{margin:0 0 .4rem;font-size:.98rem;color:#1c1c1a;line-height:1.5;}
	.gff-addon-callout p:last-child{margin-bottom:0;}
	/* ---- Express flow ---- */
	.gff-express-email{background:#eef5e6;border:1.5px solid #1c1c1a;max-width:680px;margin-left:auto;margin-right:auto;}
	.gff-express-email legend{color:#1c1c1a;font-weight:800;font-size:1.1rem;}
	.gff-express-email__label{display:flex;flex-direction:column;gap:.35rem;font-weight:700;color:var(--ink);text-transform:none;letter-spacing:0;font-size:1rem;}
	.gff-express-email__label input{font-size:1.05rem;padding:.7rem .8rem;}
	.gff-express-email__note{margin:.6rem 0 0;font-size:.88rem;color:var(--muted);text-transform:none;letter-spacing:0;}
	/* ---- Spire (tower) mode — darker, fantasy, on-brand ---- */
	.gff-reg--spire{--spire-ink:#1c1c1e;--spire-deep:#2b2b30;--spire-glow:#f0d488;--spire-gold:#e8c14a;}
	.gff-spire-count{background:linear-gradient(160deg,#2b2b30,#1c1c1e);border:1.5px solid #b9962f;color:#f2eee2;box-shadow:0 0 28px rgba(201,162,39,.16) inset;}
	.gff-spire-count__head{display:block;width:100%;margin:0 0 .6rem;padding:0;color:#ecdcae;font-weight:800;font-size:1.15rem;text-align:center;text-shadow:0 0 10px rgba(201,162,39,.28);}
	.gff-spire-count__lead{color:#ddd2b8;text-transform:none;letter-spacing:0;font-size:1rem;margin:.2rem 0 1rem;}
	.gff-spire-count__lead strong{color:#ecdcae;}
	.gff-spire-count__bonus{margin:1rem 0 0;font-size:.92rem;color:#d6ccb2;text-transform:none;letter-spacing:0;font-style:italic;}
	.gff-spire-count__bonus strong{color:#e3b008;font-style:normal;}
	/* stepper */
	.gff-spire-stepper{display:flex;align-items:stretch;justify-content:center;gap:.6rem;margin:.4rem auto 1.1rem;max-width:340px;}
	.gff-spire-stepper__btn{flex:0 0 56px;font-size:1.8rem;font-weight:800;line-height:1;color:#1c1c1a;background:linear-gradient(180deg,#ecdcae,#f0d488);border:0;border-radius:12px;cursor:pointer;box-shadow:0 0 12px rgba(150,210,130,.4);transition:transform .08s, box-shadow .15s;}
	.gff-spire-stepper__btn:hover{box-shadow:0 0 18px rgba(201,162,39,.5);}
	.gff-spire-stepper__btn:active{transform:translateY(2px);}
	.gff-spire-stepper__count{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#1e1e21;border:1.5px solid #b9962f;border-radius:12px;padding:.4rem;}
	.gff-spire-stepper__count input{width:100%;text-align:center;font-size:2.2rem;font-weight:800;color:#ecdcae;background:transparent;border:0;padding:0;-moz-appearance:textfield;}
	.gff-spire-stepper__count input::-webkit-outer-spin-button,.gff-spire-stepper__count input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
	.gff-spire-stepper__unit{font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:#cbb26a;}
	/* readout */
	.gff-spire-readout{background:#1e1e21;border:1px solid #4a4638;border-radius:12px;padding:.8rem 1rem;display:flex;flex-direction:column;gap:.55rem;}
	.gff-spire-readout__row{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;}
	.gff-spire-readout__label{font-size:.85rem;color:#cbb26a;text-transform:none;letter-spacing:0;text-align:left;}
	.gff-spire-readout__fine{display:block;font-size:.72rem;color:#b6b0a0;font-style:italic;}
	.gff-spire-readout__big{font-size:1.7rem;font-weight:800;color:#e3b008;text-shadow:0 0 12px rgba(227,176,8,.5);white-space:nowrap;}
	.gff-spire-readout__mid{font-size:1.25rem;font-weight:800;color:#ecdcae;white-space:nowrap;}
	.gff-spire-readout__total{font-size:1.4rem;font-weight:800;color:#f2eee2;white-space:nowrap;}
	.gff-spire-readout__row--total{border-top:1px solid #4a4638;padding-top:.55rem;margin-top:.1rem;}
	.gff-pulse{animation:gffSpirePulse .42s ease;}
	@keyframes gffSpirePulse{0%{transform:scale(1);}35%{transform:scale(1.18);filter:brightness(1.4);}100%{transform:scale(1);}}
	.gff-spire-email__head{display:block;width:100%;margin:0 0 .5rem;padding:0;color:#ecdcae;font-weight:800;text-align:center;}
	.gff-spire-freegift{margin:.7rem 0 0;padding:.6rem .9rem;text-align:center;font-size:.98rem;line-height:1.4;color:#1c1c1e;background:linear-gradient(180deg,#f5d77a,#e8c14a);border-radius:10px;box-shadow:0 0 16px rgba(232,193,74,.35);}
	.gff-spire-freegift[hidden]{display:none;}
	.gff-spire-freegift strong{color:#4a2f00;}
	.gff-spire-email{background:#2b2b30;border:1.5px solid #b9962f;}
	.gff-spire-email .gff-express-email__label{color:#f2eee2;}
	.gff-spire-email .gff-express-email__note{color:#cbb26a;}
	.gff-reg .gff-btn--spire,.gff-reg button.gff-btn--spire{background:linear-gradient(180deg,#1c1c1a,#232323) !important;background-color:#232323 !important;color:#f4ead0 !important;box-shadow:0 0 18px rgba(201,162,39,.28) !important;border:1px solid #3a3a34 !important;text-shadow:0 0 8px rgba(0,0,0,.4) !important;}
	.gff-reg .gff-btn--spire:hover,.gff-reg button.gff-btn--spire:hover{background:linear-gradient(180deg,#3a3a34,#333330) !important;background-color:#333330 !important;color:#ffffff !important;box-shadow:0 0 26px rgba(150,210,130,.55) !important;}
	@media (max-width:480px){.gff-spire-readout__big{font-size:1.4rem;}.gff-spire-stepper__count input{font-size:1.8rem;}}
	@media (max-width:480px){
		.gff-bounty-tile__power{font-size:.92rem;}
		.gff-bounty-grid{gap:.5rem;}
		.gff-bounty-tile__inner{padding:.85rem .55rem;}
		.gff-bounty-tile__desc{font-size:.78rem;}
	}
	.gff-modal[hidden]{display:none !important;}
	.gff-modal{position:fixed !important;inset:0 !important;z-index:99999 !important;display:flex !important;align-items:center !important;justify-content:center !important;padding:1rem !important;animation:gff-modal-fade .25s ease;}
	.gff-modal__backdrop{position:absolute !important;inset:0 !important;background:rgba(0,0,0,0.55) !important;cursor:pointer;}
	.gff-modal__card{position:relative !important;background:#ffffff !important;max-width:480px !important;width:100% !important;padding:2rem 1.6rem 1.4rem !important;border-radius:14px !important;box-shadow:0 18px 40px rgba(0,0,0,0.4) !important;z-index:1 !important;animation:gff-modal-pop .3s cubic-bezier(.2,.9,.3,1.2);box-sizing:border-box !important;font-family:"Lato",sans-serif;}
	.gff-modal__close{position:absolute !important;top:.4rem !important;right:.7rem !important;background:transparent !important;border:0 !important;font-size:1.8rem !important;color:#6f6e69 !important;cursor:pointer !important;line-height:1 !important;padding:.1em .35em !important;font-weight:400 !important;}
	.gff-modal__close:hover{color:#1c1c1a !important;background:transparent !important;}
	.gff-modal__title{margin:0 0 .6rem !important;font-size:1.3rem !important;font-weight:700 !important;color:#1c1c1a !important;line-height:1.25 !important;text-align:left !important;}
	.gff-modal__body{margin:0 0 1.2rem !important;font-size:1rem !important;color:#1c1c1a !important;line-height:1.5 !important;text-align:left !important;}
	.gff-modal__hint{margin:.8rem 0 0 !important;font-size:.85rem !important;color:#6f6e69 !important;font-style:italic !important;text-align:center !important;line-height:1.5 !important;}
	@keyframes gff-modal-fade{from{opacity:0;}to{opacity:1;}}
	@keyframes gff-modal-pop{from{transform:scale(.9);opacity:0;}to{transform:scale(1);opacity:1;}}
	.gff-fineprint{font-size:1rem;color:var(--muted);text-align:center;margin:.7rem 0 0;font-style:italic;}
	.gff-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}
	.gff-alert{max-width:820px;margin:0 auto 1.25rem;padding:.9rem 1.1rem;border-radius:9px;font-size:1rem;line-height:1.55;}
	.gff-alert--ok{background:var(--g-leaf);border:1px solid #1c1c1a;color:#1c1c1a;}
	.gff-alert--err{background:#fbeae7;border:1px solid #c0492f;color:#7a2417;}
	.gff-alert--err{border-width:2px;animation:gffAlertPulse 1s ease-in-out 1;}
	.gff-alert__lead{display:block;font-size:1.05rem;margin-bottom:.35rem;}
	.gff-alert:focus{outline:2px solid #c0492f;outline-offset:2px;}
	@keyframes gffAlertPulse{0%{box-shadow:0 0 0 0 rgba(192,73,47,.45);}70%{box-shadow:0 0 0 10px rgba(192,73,47,0);}100%{box-shadow:0 0 0 0 rgba(192,73,47,0);}}
	.gff-alert a{color:inherit;font-weight:700;}
	@media (max-width:560px){.gff-grid{grid-template-columns:1fr;}.gff-col-2{grid-column:span 1;}.gff-reg__brand{font-size:2rem;}.gff-reg__banner{max-width:90%;}}
	.gff-lead{max-width:560px;}
	.gff-lead__head{text-align:center;margin-bottom:1.2rem;}
	.gff-lead__title{font-size:1.4rem;margin:0 0 .4rem;color:var(--ink);}
	.gff-lead__pitch{font-size:1rem;color:var(--muted);margin:0;}
	.gff-zora-display{padding:1rem 0;background:transparent;display:flex;justify-content:center;width:100%;box-sizing:border-box;}
	.gff-zora-display > div{width:100%;max-width:760px;}
	.gff-zora-display__head{text-align:center;margin:0 0 1rem;}
	.gff-zora-display__title{font-size:clamp(1.5rem,3.4vw,2.4rem);font-weight:600;margin:0;letter-spacing:-0.01em;line-height:1.15;color:var(--ink);}
	.gff-zora-display__sub{margin:.4rem 0 0;color:var(--muted);font-size:clamp(.95rem,1.5vw,1.1rem);}
	.gff-zora-display__viz{width:100%;aspect-ratio:500/280;margin:.8rem 0;overflow:hidden;border-radius:8px;}
	.gff-zora-display__viz svg{width:100%;height:100%;display:block;}
	.gff-zora-display__viz .zlbl{font-family:"Lato",sans-serif;font-size:14px;font-style:italic;fill:#5F5E5A;}
	.gff-zora-display__legend{list-style:none;margin:0 auto;padding:0;max-width:760px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem 1rem;font-size:clamp(.9rem,1.2vw,1rem);line-height:1.4;}
	.gff-zora-display__legend li{display:flex;align-items:center;gap:.5rem;color:var(--ink);}
	.gff-zora-display__legend em{color:var(--muted);font-style:normal;font-size:.85em;}
	.gff-zora-display__legend .zsw{width:16px;height:16px;border-radius:3px;flex:0 0 16px;border:.5px solid rgba(0,0,0,0.08);}
	@media (max-width:760px){.gff-zora-display__legend{grid-template-columns:1fr 1fr;}}
	@media (max-width:440px){.gff-zora-display__legend{grid-template-columns:1fr;}.gff-zora-display__legend em{display:none;}}
	';
}

/* ============================================================
 * 10. CLIENT-SIDE VALIDATION
 * ============================================================ */
function gff_reg_validation_js() {
	return <<<'JS'
(function(){
	function ready(fn){ if(document.readyState!=="loading"){fn();} else {document.addEventListener("DOMContentLoaded",fn);} }
	ready(function(){
		var form = document.getElementById("gff-reg-form");
		if(!form){return;}
		function isSectionComplete(group){
			if(group.getAttribute("data-gff-section")==="crops"){
				return Array.from(group.querySelectorAll("input[name='gff_crops[]']")).some(function(c){return c.checked;});
			}
			var inputs = group.querySelectorAll("input[required]");
			if(inputs.length===0){return true;}
			for(var i=0;i<inputs.length;i++){
				var inp=inputs[i];
				if(inp.type==="checkbox"){
					if(!inp.checked){return false;}
				} else if(inp.type==="password" && inp.name==="gff_pass2"){
					var pass1=form.querySelector("input[name='gff_pass']");
					if(!pass1 || pass1.value.length<8 || inp.value!==pass1.value){return false;}
				} else if(inp.type==="password"){
					if(inp.value.length<8){return false;}
				} else if(inp.type==="email"){
					if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value)){return false;}
				} else if(!(inp.value||"").trim()){
					return false;
				}
			}
			return true;
		}
		function update(){
			var groups=form.querySelectorAll(".gff-reg__group[data-gff-required='1']");
			groups.forEach(function(g){
				g.setAttribute("data-gff-complete", isSectionComplete(g)?"yes":"no");
			});
		}
		form.querySelectorAll(".gff-reg__group[data-gff-required='1']").forEach(function(g){
			g.setAttribute("data-gff-complete","no");
		});
		form.addEventListener("input", update);
		form.addEventListener("change", update);
		form.addEventListener("submit", function(e){
			update();
			var firstIncomplete=form.querySelector(".gff-reg__group[data-gff-required='1'][data-gff-complete='no']");
			if(firstIncomplete){
				e.preventDefault();
				firstIncomplete.scrollIntoView({behavior:"smooth", block:"center"});
				firstIncomplete.classList.add("gff-shake");
				setTimeout(function(){firstIncomplete.classList.remove("gff-shake");},600);
			}
		});
		update();
		var sqft=form.querySelector("#gff_sqft");
		var est=form.querySelector("#gff_est");
		var val=form.querySelector("#gff_est_val");
		var note=form.querySelector("#gff_est_text");
		if(sqft){
			sqft.addEventListener("input",function(){
				var raw=(sqft.value||"").trim();
				var isNum=raw!=="" && /^[0-9]+(\.[0-9]+)?$/.test(raw);
				if(isNum){
					var n=parseFloat(raw);
					if(n<=0){ if(est)est.hidden=true; if(note)note.hidden=true; }
					else if(n<=1500){ if(val)val.textContent=n+" sq ft included"; if(est)est.hidden=false; if(note)note.hidden=true; }
					else { if(val)val.textContent=n+" sq ft (larger than one module — we will discuss multi-module options)"; if(est)est.hidden=false; if(note)note.hidden=true; }
				} else { if(est)est.hidden=true; if(note)note.hidden=(raw===""); }
			});
		}
	});
})();
JS;
}

/* ============================================================
 * 11. ADMIN — Settings page (PayPal link)
 * ============================================================ */
add_action( 'admin_menu', 'gff_reg_admin_menu' );
function gff_reg_admin_menu() {
	add_menu_page( 'GFF Clients', 'GFF Clients', 'list_users', 'gff-clients', 'gff_reg_admin_page', 'dashicons-carrot', 26 );
	add_submenu_page( 'gff-clients', 'GFF Settings', 'Settings', 'manage_options', 'gff-settings', 'gff_reg_settings_page' );
}

add_action( 'admin_init', 'gff_reg_register_settings' );
function gff_reg_register_settings() {
	register_setting( 'gff_reg_settings_group', 'gff_reg_paypal_link', array(
		'type' => 'string', 'sanitize_callback' => 'esc_url_raw', 'default' => '',
	) );
}

function gff_reg_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) { return; }
	$defined = defined( 'GFF_PAYPAL_LINK' ) && '' !== GFF_PAYPAL_LINK;
	?>
	<div class="wrap">
		<h1>GFF Registration — Settings</h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'gff_reg_settings_group' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="gff_reg_paypal_link">PayPal payment link</label></th>
					<td>
						<?php if ( $defined ) : ?>
							<input type="url" id="gff_reg_paypal_link" value="<?php echo esc_attr( GFF_PAYPAL_LINK ); ?>" class="regular-text" disabled>
							<p class="description"><strong>Defined in wp-config.php</strong> via <code>GFF_PAYPAL_LINK</code>. This setting is overridden by the constant.</p>
						<?php else : ?>
							<input type="url" id="gff_reg_paypal_link" name="gff_reg_paypal_link" value="<?php echo esc_attr( get_option( 'gff_reg_paypal_link', 'https://www.paypal.com/ncp/payment/YBGEYKG9KCFWC' ) ); ?>" class="regular-text" placeholder="https://www.paypal.com/ncp/payment/...">
							<p class="description">
								Your PayPal payment link. Supported formats:<br>
								<strong>PayPal NCP</strong> (recommended): <code>https://www.paypal.com/ncp/payment/...</code> &mdash; amount is baked into the link. Used as-is.<br>
								<strong>PayPal.Me</strong>: <code>https://www.paypal.me/yourhandle</code> &mdash; plugin appends <code>/100</code> to pre-fill the amount.<br>
								Other URLs (e.g. paypal.biz business profile) are used as-is, but customers will need to enter the amount themselves.
							</p>
						<?php endif; ?>
					</td>
				</tr>
				<tr><th scope="row">Reservation amounts</th><td><code>Design Consult $250</code></td></tr>
				<tr><th scope="row">Agreement version</th><td><code><?php echo esc_html( gff_reg_agreement_version() ); ?></code></td></tr>
			</table>
			<?php do_action( 'gff_reg_settings_after' ); ?>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/* ============================================================
 * 12. ADMIN — Clients dashboard + CSV export
 * ============================================================ */

/* Per-customer add-on assignment on the WP user-profile screen.
 * Lets the owner check which catalog add-ons a customer wants;
 * saves to gff_addons (same meta the my-farm page reads). */
add_action( 'edit_user_profile', 'gff_reg_admin_addon_fields' );
add_action( 'show_user_profile', 'gff_reg_admin_addon_fields' );
function gff_reg_admin_addon_fields( $user ) {
	if ( ! current_user_can( 'edit_users' ) ) { return; }
	$catalog  = gff_reg_addons();
	$selected = get_user_meta( $user->ID, 'gff_addons', true );
	if ( ! is_array( $selected ) ) { $selected = array(); }
	$notes = (string) get_user_meta( $user->ID, 'gff_addons_notes', true );
	?>
	<h2>GFF Add-ons</h2>
	<table class="form-table" role="presentation">
		<tr>
			<th scope="row">Catalog add-ons</th>
			<td>
				<?php foreach ( $catalog as $key => $ad ) : ?>
					<label style="display:block;margin-bottom:6px;">
						<input type="checkbox" name="gff_addons[]" value="<?php echo esc_attr( $key ); ?>" <?php checked( in_array( $key, $selected, true ) ); ?>>
						<?php echo esc_html( $ad['emoji'] . ' ' . $ad['name'] ); ?> &mdash; $<?php echo esc_html( $ad['price'] ); ?>
						<?php if ( ! empty( $ad['paypal_url'] ) ) : ?><a href="<?php echo esc_url( $ad['paypal_url'] ); ?>" target="_blank" style="margin-left:6px;">PayPal link</a><?php endif; ?>
					</label>
				<?php endforeach; ?>
				<p class="description">Checked add-ons appear on the customer&rsquo;s &ldquo;my farm&rdquo; page. Invoice them separately via the add-on&rsquo;s PayPal link.</p>
			</td>
		</tr>
		<tr>
			<th scope="row"><label for="gff_addons_notes">Additional add-ons to order</label></th>
			<td>
				<textarea name="gff_addons_notes" id="gff_addons_notes" rows="4" class="large-text" placeholder="Free-text space for anything not in the catalog yet — list extra add-ons this customer wants. Build the PayPal product later."><?php echo esc_textarea( $notes ); ?></textarea>
				<p class="description">Anything here also shows on the customer&rsquo;s &ldquo;my farm&rdquo; page under &ldquo;Additional add-ons.&rdquo;</p>
			</td>
		</tr>
	</table>
	<?php
}
add_action( 'edit_user_profile_update', 'gff_reg_admin_save_addons' );
add_action( 'personal_options_update', 'gff_reg_admin_save_addons' );
function gff_reg_admin_save_addons( $user_id ) {
	if ( ! current_user_can( 'edit_users' ) ) { return; }
	$catalog = gff_reg_addons();
	$picked  = array();
	if ( ! empty( $_POST['gff_addons'] ) && is_array( $_POST['gff_addons'] ) ) {
		foreach ( wp_unslash( $_POST['gff_addons'] ) as $k ) {
			$k = sanitize_key( $k );
			if ( isset( $catalog[ $k ] ) ) { $picked[] = $k; }
		}
	}
	update_user_meta( $user_id, 'gff_addons', array_values( array_unique( $picked ) ) );
	$notes = isset( $_POST['gff_addons_notes'] ) ? sanitize_textarea_field( wp_unslash( $_POST['gff_addons_notes'] ) ) : '';
	update_user_meta( $user_id, 'gff_addons_notes', $notes );
}

/* ============================================================
 * 12b. INVOICING — receiving methods, account editor, services
 *      editor, and one-amount invoice email via WP Mail SMTP.
 *      All additive; uses the same edit_user_profile pattern as
 *      the GFF Add-ons panel above. Nothing here alters the
 *      registration handlers or shortcodes.
 * ============================================================ */

/* --- Receiving methods: where money lands. Stored as plugin
 *     options, entered once in Settings → GFF Registration.
 *     NOTHING is hardcoded; blanks are simply omitted from the
 *     invoice email so no dead/empty method ever renders. --- */
function gff_reg_pay_methods() {
	// key => [ label, option_name, kind, hint ]
	// kind: 'link'  = becomes a tappable, amount-prefilled button
	//       'detail'= copy-to-pay block (no payable URL exists)
	return array(
		'paypal' => array(
			'label'  => 'PayPal',
			'option' => 'gff_pay_paypal_me',
			'kind'   => 'link',
			'hint'   => 'Your PayPal.me handle, e.g. paypal.me/yourname (an amount is appended automatically). Leave blank to fall back to your fixed PayPal link.',
		),
		'cashapp' => array(
			'label'  => 'Cash App',
			'option' => 'gff_pay_cashapp',
			'kind'   => 'link',
			'hint'   => 'Your $cashtag, e.g. $YourTag (without the URL).',
		),
		'venmo' => array(
			'label'  => 'Venmo',
			'option' => 'gff_pay_venmo',
			'kind'   => 'link',
			'hint'   => 'Your Venmo username (without the @).',
		),
		'zelle' => array(
			'label'  => 'Zelle',
			'option' => 'gff_pay_zelle',
			'kind'   => 'detail',
			'hint'   => 'The email or phone enrolled with Zelle. Customer sends from their own bank app — no link is possible.',
		),
		'ach' => array(
			'label'  => 'Bank transfer (ACH / wire)',
			'option' => 'gff_pay_ach',
			'kind'   => 'detail',
			'hint'   => 'Bank name, routing number, and account number. Customer enters these in their bank — no link is possible.',
		),
		'chime' => array(
			'label'  => 'Chime',
			'option' => 'gff_pay_chime',
			'kind'   => 'detail',
			'hint'   => 'Your $ChimeSign. Customer pays from the Chime app — no link is possible.',
		),
	);
}

/* Build a tappable, amount-prefilled URL for the link-type methods.
 * Returns '' when the method has no stored value (so it is skipped). */
function gff_reg_pay_link_url( $key, $amount ) {
	$amt = number_format( (float) $amount, 2, '.', '' );
	switch ( $key ) {
		case 'paypal':
			$me = trim( (string) get_option( 'gff_pay_paypal_me', '' ) );
			if ( '' !== $me ) {
				$me = preg_replace( '#^https?://#i', '', $me );
				$me = preg_replace( '#^(www\.)?paypal\.me/#i', '', $me );
				$me = trim( $me, '/' );
				return 'https://www.paypal.com/paypalme/' . rawurlencode( $me ) . '/' . $amt;
			}
			// fall back to the fixed NCP link (cannot carry an amount)
			$fixed = gff_reg_paypal_link();
			return $fixed ? $fixed : '';
		case 'cashapp':
			$tag = trim( (string) get_option( 'gff_pay_cashapp', '' ) );
			if ( '' === $tag ) { return ''; }
			$tag = ltrim( $tag, '$' );
			return 'https://cash.app/$' . rawurlencode( $tag ) . '/' . $amt;
		case 'venmo':
			$u = trim( (string) get_option( 'gff_pay_venmo', '' ) );
			if ( '' === $u ) { return ''; }
			$u = ltrim( $u, '@' );
			return 'https://venmo.com/?txn=pay&recipients=' . rawurlencode( $u ) . '&amount=' . rawurlencode( $amt );
		default:
			return '';
	}
}

/* Register the receiving-method options on the existing settings group. */
function gff_reg_register_pay_settings() {
	foreach ( gff_reg_pay_methods() as $m ) {
		register_setting( 'gff_reg_settings_group', $m['option'], array(
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_textarea_field',
			'default'           => '',
		) );
	}
}
add_action( 'admin_init', 'gff_reg_register_pay_settings' );

/* Append the receiving-method fields to the settings screen. */
add_action( 'gff_reg_settings_after', 'gff_reg_settings_pay_fields' );
function gff_reg_settings_pay_fields() {
	?>
	<h2 style="margin-top:28px;">Invoice receiving methods</h2>
	<p class="description" style="max-width:640px;">
		Fill in only the methods you actually use. Blank methods are skipped in the invoice email &mdash; nothing empty is ever shown to a customer.
		PayPal, Cash&nbsp;App, and Venmo become tappable buttons with the invoice amount pre-filled. Zelle, bank transfer, and Chime have no payable link
		(by their own design), so they appear as copy-to-pay blocks showing your details and the amount due.
	</p>
	<table class="form-table" role="presentation">
		<?php foreach ( gff_reg_pay_methods() as $m ) :
			$val = (string) get_option( $m['option'], '' );
			$multiline = ( 'gff_pay_ach' === $m['option'] ); // bank name + routing + account span multiple lines
			?>
			<tr>
				<th scope="row"><label for="<?php echo esc_attr( $m['option'] ); ?>"><?php echo esc_html( $m['label'] ); ?></label></th>
				<td>
					<?php if ( $multiline ) : ?>
						<textarea name="<?php echo esc_attr( $m['option'] ); ?>" id="<?php echo esc_attr( $m['option'] ); ?>" rows="3" class="large-text"><?php echo esc_textarea( $val ); ?></textarea>
					<?php else : ?>
						<input type="text" name="<?php echo esc_attr( $m['option'] ); ?>" id="<?php echo esc_attr( $m['option'] ); ?>" value="<?php echo esc_attr( $val ); ?>" class="regular-text">
					<?php endif; ?>
					<p class="description"><?php echo esc_html( $m['hint'] ); ?></p>
				</td>
			</tr>
		<?php endforeach; ?>
	</table>
	<?php
}

/* --- Account inputs (Reading A): edit what the customer submitted
 *     at registration, right on their WP user-profile screen. --- */
add_action( 'edit_user_profile', 'gff_reg_admin_account_fields' );
add_action( 'show_user_profile', 'gff_reg_admin_account_fields' );
function gff_reg_admin_account_fields( $user ) {
	if ( ! current_user_can( 'edit_users' ) ) { return; }
	$uid = $user->ID;
	$g = function( $k, $d = '' ) use ( $uid ) {
		$v = get_user_meta( $uid, $k, true );
		return ( '' === $v || null === $v ) ? $d : $v;
	};
	$offer       = $g( 'gff_offer' );
	$flow        = $g( 'gff_signup_flow' );
	$phone       = $g( 'gff_phone' );
	$address     = $g( 'gff_service_address' );
	$city        = $g( 'gff_service_city' );
	$zip         = $g( 'gff_service_zip' );
	$sqft        = $g( 'gff_start_sqft' );
	$tower_qty   = $g( 'gff_tower_qty' );
	$start_date  = $g( 'gff_start_date' );
	$reservation = $g( 'gff_reservation', 'none' );
	$res_amount  = $g( 'gff_reservation_amount', '0.00' );
	$res_paid    = $g( 'gff_reservation_paid', 'no' );
	$rate_lock   = $g( 'gff_rate_lock', 'no' );
	?>
	<h2>GFF Account Inputs</h2>
	<p class="description" style="max-width:640px;">Edit what this customer submitted at sign-up. Saving updates the same fields the registration form writes; blanks are saved as blank.</p>
	<table class="form-table" role="presentation">
		<tr>
			<th scope="row"><label for="gff_offer">Offer</label></th>
			<td>
				<select name="gff_offer" id="gff_offer">
					<option value="" <?php selected( $offer, '' ); ?>>&mdash; none &mdash;</option>
					<option value="sunrise" <?php selected( $offer, 'sunrise' ); ?>>Sunrise Garden</option>
					<option value="spire" <?php selected( $offer, 'spire' ); ?>>Spire Towers</option>
				</select>
				<span class="description" style="margin-left:8px;">Sign-up flow: <code><?php echo esc_html( $flow ? $flow : '—' ); ?></code></span>
			</td>
		</tr>
		<tr>
			<th scope="row"><label for="gff_phone">Phone</label></th>
			<td><input type="text" name="gff_phone" id="gff_phone" value="<?php echo esc_attr( $phone ); ?>" class="regular-text"></td>
		</tr>
		<tr>
			<th scope="row"><label for="gff_service_address">Service address</label></th>
			<td>
				<input type="text" name="gff_service_address" id="gff_service_address" value="<?php echo esc_attr( $address ); ?>" class="regular-text" placeholder="Street address"><br>
				<input type="text" name="gff_service_city" value="<?php echo esc_attr( $city ); ?>" class="regular-text" placeholder="City" style="margin-top:6px;max-width:200px;">
				<input type="text" name="gff_service_zip" value="<?php echo esc_attr( $zip ); ?>" placeholder="ZIP" style="margin-top:6px;max-width:120px;">
			</td>
		</tr>
		<tr>
			<th scope="row"><label for="gff_start_sqft">Sunrise sq ft</label></th>
			<td><input type="text" name="gff_start_sqft" id="gff_start_sqft" value="<?php echo esc_attr( $sqft ); ?>" inputmode="numeric" style="max-width:160px;"> <span class="description">up to 1,500</span></td>
		</tr>
		<tr>
			<th scope="row"><label for="gff_tower_qty">Spire count</label></th>
			<td><input type="number" name="gff_tower_qty" id="gff_tower_qty" value="<?php echo esc_attr( $tower_qty ); ?>" min="0" max="100" style="max-width:120px;"></td>
		</tr>
		<tr>
			<th scope="row"><label for="gff_start_date">Start date</label></th>
			<td><input type="date" name="gff_start_date" id="gff_start_date" value="<?php echo esc_attr( $start_date ); ?>"></td>
		</tr>
		<tr>
			<th scope="row"><label for="gff_reservation">Reservation</label></th>
			<td>
				<select name="gff_reservation" id="gff_reservation">
					<option value="none" <?php selected( $reservation, 'none' ); ?>>None (standard list)</option>
					<option value="consult" <?php selected( $reservation, 'consult' ); ?>>$250 Design Consult</option>
					<?php // Legacy (pre-v6.0) options — shown only if this customer already has one stored, so their history stays readable. ?>
					<?php if ( 'down_payment' === $reservation ) : ?>
						<option value="down_payment" selected>$100 Down Payment + 48hr (legacy)</option>
					<?php endif; ?>
					<?php if ( 'workshop' === $reservation ) : ?>
						<option value="workshop" selected>$120 Monthly Workshop (legacy)</option>
					<?php endif; ?>
				</select>
				&nbsp; Amount <input type="text" name="gff_reservation_amount" value="<?php echo esc_attr( $res_amount ); ?>" style="max-width:90px;">
				&nbsp; <label><input type="checkbox" name="gff_reservation_paid" value="yes" <?php checked( $res_paid, 'yes' ); ?>> Paid (money received)</label>
			</td>
		</tr>
		<tr>
			<th scope="row">Rate lock</th>
			<td><label><input type="checkbox" name="gff_rate_lock" value="yes" <?php checked( $rate_lock, 'yes' ); ?>> 24-month rate lock</label></td>
		</tr>
		<tr>
			<th scope="row">Spire design</th>
			<td>
				<label><input type="checkbox" name="gff_spire_unlocked" value="yes" <?php checked( $g( 'gff_spire_unlocked', 'no' ), 'yes' ); ?>> Unlocked ($100 received)</label>
				<?php $unlock_req = get_user_meta( $uid, 'gff_spire_unlock_request', true ); ?>
				<?php if ( is_array( $unlock_req ) && ! empty( $unlock_req['status'] ) ) : ?>
					<span class="description" style="margin-left:8px;">Customer <?php echo 'invoice_requested' === $unlock_req['status'] ? 'requested an invoice' : 'clicked the PayPal $100 link'; ?> on <?php echo esc_html( $unlock_req['time'] ); ?> — verify payment, then tick this box.</span>
				<?php endif; ?>
			</td>
		</tr>
		<tr>
			<th scope="row">Workshop interest</th>
			<td><label><input type="checkbox" name="gff_workshop_interest" value="yes" <?php checked( get_user_meta( $uid, 'gff_workshop_interest', true ), 'yes' ); ?>> Interested in the monthly workshop</label></td>
		</tr>
	</table>
	<?php
}

add_action( 'edit_user_profile_update', 'gff_reg_admin_save_account_fields' );
add_action( 'personal_options_update', 'gff_reg_admin_save_account_fields' );
function gff_reg_admin_save_account_fields( $user_id ) {
	if ( ! current_user_can( 'edit_users' ) ) { return; }
	// Only act when our panel was actually submitted (offer select is always present).
	if ( ! isset( $_POST['gff_offer'] ) && ! isset( $_POST['gff_reservation'] ) ) { return; }

	$offer = sanitize_key( wp_unslash( $_POST['gff_offer'] ?? '' ) );
	if ( ! in_array( $offer, array( '', 'sunrise', 'spire' ), true ) ) { $offer = ''; }
	update_user_meta( $user_id, 'gff_offer', $offer );

	update_user_meta( $user_id, 'gff_phone',           sanitize_text_field( wp_unslash( $_POST['gff_phone'] ?? '' ) ) );
	update_user_meta( $user_id, 'gff_service_address', sanitize_text_field( wp_unslash( $_POST['gff_service_address'] ?? '' ) ) );
	update_user_meta( $user_id, 'gff_service_city',    sanitize_text_field( wp_unslash( $_POST['gff_service_city'] ?? '' ) ) );
	update_user_meta( $user_id, 'gff_service_zip',     sanitize_text_field( wp_unslash( $_POST['gff_service_zip'] ?? '' ) ) );
	update_user_meta( $user_id, 'gff_start_sqft',      sanitize_text_field( wp_unslash( $_POST['gff_start_sqft'] ?? '' ) ) );
	update_user_meta( $user_id, 'gff_start_date',      sanitize_text_field( wp_unslash( $_POST['gff_start_date'] ?? '' ) ) );

	$qty = isset( $_POST['gff_tower_qty'] ) ? (int) $_POST['gff_tower_qty'] : 0;
	if ( $qty < 0 ) { $qty = 0; }
	update_user_meta( $user_id, 'gff_tower_qty', $qty );

	$reservation = sanitize_key( wp_unslash( $_POST['gff_reservation'] ?? 'none' ) );
	if ( ! in_array( $reservation, array( 'none', 'consult', 'down_payment', 'workshop' ), true ) ) { $reservation = 'none'; }
	update_user_meta( $user_id, 'gff_reservation', $reservation );
	$res_amount = preg_replace( '/[^0-9.]/', '', (string) wp_unslash( $_POST['gff_reservation_amount'] ?? '0.00' ) );
	update_user_meta( $user_id, 'gff_reservation_amount', number_format( (float) $res_amount, 2, '.', '' ) );
	update_user_meta( $user_id, 'gff_reservation_paid', isset( $_POST['gff_reservation_paid'] ) ? 'yes' : 'no' );

	update_user_meta( $user_id, 'gff_rate_lock', isset( $_POST['gff_rate_lock'] ) ? 'yes' : 'no' );
	update_user_meta( $user_id, 'gff_workshop_interest', isset( $_POST['gff_workshop_interest'] ) ? 'yes' : 'no' );
	update_user_meta( $user_id, 'gff_spire_unlocked', isset( $_POST['gff_spire_unlocked'] ) ? 'yes' : 'no' );
}

/* --- Services editor + Send Invoice. Line-items (Spire count x rate,
 *     Sunrise sqft x rate) auto-total in the browser; a free-text box
 *     covers anything custom; the invoice amount is overridable. The
 *     "Send Invoice" button posts back, builds the email, and sends it
 *     through wp_mail (WP Mail SMTP transports it). --- */
add_action( 'edit_user_profile', 'gff_reg_admin_invoice_fields' );
add_action( 'show_user_profile', 'gff_reg_admin_invoice_fields' );
function gff_reg_admin_invoice_fields( $user ) {
	if ( ! current_user_can( 'edit_users' ) ) { return; }
	$uid = $user->ID;
	$spire_first = (int) gff_reg_tower_first_price();
	$spire_addl  = (int) gff_reg_tower_addl_price();
	$spire_qty   = (int) get_user_meta( $uid, 'gff_tower_qty', true );
	$sqft        = (int) preg_replace( '/[^0-9]/', '', (string) get_user_meta( $uid, 'gff_start_sqft', true ) );

	$inv_spire_rate = (string) get_user_meta( $uid, 'gff_inv_spire_rate', true );
	if ( '' === $inv_spire_rate ) { $inv_spire_rate = $spire_first; }
	$inv_sqft_rate  = (string) get_user_meta( $uid, 'gff_inv_sqft_rate', true );
	if ( '' === $inv_sqft_rate ) { $inv_sqft_rate = '0.10'; }
	$inv_overview   = (string) get_user_meta( $uid, 'gff_inv_overview', true );
	$inv_amount     = (string) get_user_meta( $uid, 'gff_inv_amount', true );
	$last_sent      = (string) get_user_meta( $uid, 'gff_inv_last_sent', true );

	wp_nonce_field( 'gff_send_invoice_' . $uid, 'gff_invoice_nonce' );
	?>
	<h2>GFF Invoice &amp; Services</h2>
	<?php if ( $last_sent ) : ?>
		<p class="description">Last invoice emailed: <strong><?php echo esc_html( $last_sent ); ?></strong></p>
	<?php endif; ?>
	<table class="form-table" role="presentation">
		<tr>
			<th scope="row">Service line-items</th>
			<td>
				<div style="margin-bottom:10px;">
					<strong>Spire</strong>:
					<input type="number" id="gff_inv_spire_qty" value="<?php echo esc_attr( $spire_qty ); ?>" min="0" style="max-width:80px;"> &times; $
					<input type="text" name="gff_inv_spire_rate" id="gff_inv_spire_rate" value="<?php echo esc_attr( $inv_spire_rate ); ?>" style="max-width:90px;">/mo
					= $<span id="gff_inv_spire_line">0.00</span>
					<span class="description">(default $<?php echo esc_html( $spire_first ); ?> first / $<?php echo esc_html( $spire_addl ); ?> each add&rsquo;l &mdash; override the rate here if needed)</span>
				</div>
				<div style="margin-bottom:10px;">
					<strong>Sunrise</strong>:
					<input type="number" id="gff_inv_sqft" value="<?php echo esc_attr( $sqft ); ?>" min="0" style="max-width:100px;"> sq ft &times; $
					<input type="text" name="gff_inv_sqft_rate" id="gff_inv_sqft_rate" value="<?php echo esc_attr( $inv_sqft_rate ); ?>" style="max-width:90px;">/sq ft
					= $<span id="gff_inv_sqft_line">0.00</span>
				</div>
				<p style="margin:6px 0;"><strong>Line-item subtotal: $<span id="gff_inv_subtotal">0.00</span></strong>
					<button type="button" class="button" id="gff_inv_use_subtotal" style="margin-left:10px;">Use subtotal as amount</button></p>
			</td>
		</tr>
		<tr>
			<th scope="row"><label for="gff_inv_overview">Overview of services</label></th>
			<td>
				<textarea name="gff_inv_overview" id="gff_inv_overview" rows="5" class="large-text" placeholder="Describe what this invoice covers — e.g. 'Two Spire towers installed and maintained, herb base included' or any custom work. This text appears in the customer's invoice email."><?php echo esc_textarea( $inv_overview ); ?></textarea>
			</td>
		</tr>
		<tr>
			<th scope="row"><label for="gff_inv_amount">Invoice amount ($)</label></th>
			<td>
				<input type="text" name="gff_inv_amount" id="gff_inv_amount" value="<?php echo esc_attr( $inv_amount ); ?>" style="max-width:140px;font-size:16px;" placeholder="0.00">
				<p class="description">This exact amount is what the customer sees, pre-filled into each payment method below. Editable &mdash; it does not have to equal the line-item subtotal.</p>
			</td>
		</tr>
		<tr>
			<th scope="row">Send</th>
			<td>
				<button type="submit" name="gff_send_invoice" value="1" class="button button-primary"
					onclick="return confirm('Email this invoice to <?php echo esc_js( $user->user_email ); ?> for $'+(document.getElementById('gff_inv_amount').value||'0.00')+'?');">
					Send invoice email to <?php echo esc_html( $user->user_email ); ?>
				</button>
				<p class="description">Saves the fields above and emails the invoice (via WP Mail SMTP) with each enabled payment method pre-filled to the amount. Methods left blank in Settings are skipped.</p>
			</td>
		</tr>
	</table>
	<script>
	(function(){
		function num(v){v=parseFloat(String(v).replace(/[^0-9.]/g,''));return isNaN(v)?0:v;}
		var sq=document.getElementById('gff_inv_spire_qty'),sr=document.getElementById('gff_inv_spire_rate'),
			fq=document.getElementById('gff_inv_sqft'),fr=document.getElementById('gff_inv_sqft_rate'),
			sl=document.getElementById('gff_inv_spire_line'),fl=document.getElementById('gff_inv_sqft_line'),
			st=document.getElementById('gff_inv_subtotal'),amt=document.getElementById('gff_inv_amount'),
			use=document.getElementById('gff_inv_use_subtotal');
		function recalc(){
			var sline=num(sq.value)*num(sr.value), fline=num(fq.value)*num(fr.value), sub=sline+fline;
			sl.textContent=sline.toFixed(2); fl.textContent=fline.toFixed(2); st.textContent=sub.toFixed(2);
			return sub;
		}
		[sq,sr,fq,fr].forEach(function(el){if(el){el.addEventListener('input',recalc);}});
		if(use){use.addEventListener('click',function(){amt.value=recalc().toFixed(2);});}
		recalc();
	})();
	</script>
	<?php
}

/* Handle the Send Invoice submission. Runs on profile save, after the
 * account + services fields have been persisted by their own savers. */
add_action( 'edit_user_profile_update', 'gff_reg_admin_send_invoice' );
add_action( 'personal_options_update', 'gff_reg_admin_send_invoice' );
function gff_reg_admin_save_invoice_fields( $user_id ) {
	if ( ! current_user_can( 'edit_users' ) ) { return; }
	if ( ! isset( $_POST['gff_inv_amount'] ) && ! isset( $_POST['gff_inv_overview'] ) ) { return; }
	$amount = preg_replace( '/[^0-9.]/', '', (string) wp_unslash( $_POST['gff_inv_amount'] ?? '' ) );
	update_user_meta( $user_id, 'gff_inv_amount', '' === $amount ? '' : number_format( (float) $amount, 2, '.', '' ) );
	update_user_meta( $user_id, 'gff_inv_overview', sanitize_textarea_field( wp_unslash( $_POST['gff_inv_overview'] ?? '' ) ) );
	$sr = preg_replace( '/[^0-9.]/', '', (string) wp_unslash( $_POST['gff_inv_spire_rate'] ?? '' ) );
	$fr = preg_replace( '/[^0-9.]/', '', (string) wp_unslash( $_POST['gff_inv_sqft_rate'] ?? '' ) );
	update_user_meta( $user_id, 'gff_inv_spire_rate', $sr );
	update_user_meta( $user_id, 'gff_inv_sqft_rate', $fr );
}
add_action( 'edit_user_profile_update', 'gff_reg_admin_save_invoice_fields', 5 );
add_action( 'personal_options_update', 'gff_reg_admin_save_invoice_fields', 5 );

function gff_reg_admin_send_invoice( $user_id ) {
	if ( ! current_user_can( 'edit_users' ) ) { return; }
	if ( empty( $_POST['gff_send_invoice'] ) ) { return; }
	if ( ! isset( $_POST['gff_invoice_nonce'] ) || ! wp_verify_nonce( $_POST['gff_invoice_nonce'], 'gff_send_invoice_' . $user_id ) ) { return; }

	$user = get_userdata( $user_id );
	if ( ! $user || ! is_email( $user->user_email ) ) { return; }

	$amount   = (string) get_user_meta( $user_id, 'gff_inv_amount', true );
	$amount   = number_format( (float) preg_replace( '/[^0-9.]/', '', $amount ), 2, '.', '' );
	$overview = (string) get_user_meta( $user_id, 'gff_inv_overview', true );

	$invoice_number = gff_reg_next_invoice_number( $user_id );
	$body    = gff_reg_build_invoice_email( $user, $amount, $overview, $invoice_number );
	$subject = 'Your Gawlak Family Farms invoice — $' . $amount;
	$headers = array( 'Content-Type: text/html; charset=UTF-8' );

	$sent = wp_mail( $user->user_email, $subject, $body, $headers );
	if ( $sent ) {
		update_user_meta( $user_id, 'gff_inv_number', $invoice_number );
		update_user_meta( $user_id, 'gff_inv_last_sent', current_time( 'mysql' ) . ' — $' . $amount . ' — ' . $invoice_number );
		gff_inv_log_add( $user_id, $invoice_number, $amount, $overview );
	} else {
		gff_reg_rollback_invoice_number(); // don't burn a number on a failed send
	}
}

/* Build the invoice email HTML. Each enabled receiving method renders
 * its own block with the amount pre-filled: link methods as buttons,
 * detail methods as copy-to-pay info. Blank methods are skipped. */
/* Running invoice counter. Seeds at 213 for the first invoice and
 * increments by 1 each time. Call ONLY on a successful send so failed
 * sends don't burn a number. Returns the full human invoice number with
 * the running counter, customer ID, and date all visible. */
function gff_reg_next_invoice_number( $user_id ) {
	$current = (int) get_option( 'gff_invoice_counter', 0 );
	$next    = $current < 213 ? 213 : $current + 1; // first-ever invoice = 213
	update_option( 'gff_invoice_counter', $next );
	return sprintf( 'GFF-%06d-U%d-%s', $next, (int) $user_id, gmdate( 'Ymd' ) );
}

/* Undo the last counter bump when a send fails, so numbers stay gap-free. */
function gff_reg_rollback_invoice_number() {
	$current = (int) get_option( 'gff_invoice_counter', 0 );
	if ( $current > 213 ) { update_option( 'gff_invoice_counter', $current - 1 ); }
	// If current == 213 (the seed) a failed first send leaves it at 213 so the
	// next attempt reuses 213 — correct, no gap.
	elseif ( 213 === $current ) { update_option( 'gff_invoice_counter', 212 ); }
}

/* Business identity shown on every invoice. */
function gff_reg_business_info() {
	return array(
		'name'    => 'Gawlak Family Farms',
		'legal'   => 'Martin Gawlak Company LLC',
		'address' => '4609 Magnolia Drive, Fort Pierce, Florida 34982',
		'email'   => 'martingawlak@gmail.com',
		'phone'   => '772-924-7459',
	);
}

function gff_reg_build_invoice_email( $user, $amount, $overview, $invoice_number = '' ) {
	$name  = trim( (string) $user->first_name );
	$hello = $name ? esc_html( $name ) : 'there';
	$biz   = gff_reg_business_info();
	if ( '' === $invoice_number ) { $invoice_number = 'GFF #' . $user->ID; } // fallback if called without one
	$memo  = $invoice_number; // payment memo == invoice number so they reconcile
	$inv_date = gmdate( 'F j, Y' );
	$login_url = wp_login_url();

	$blocks = '';
	foreach ( gff_reg_pay_methods() as $key => $m ) {
		if ( 'link' === $m['kind'] ) {
			$url = gff_reg_pay_link_url( $key, $amount );
			if ( '' === $url ) { continue; }
			$blocks .= '<tr><td style="padding:10px 0;border-bottom:1px solid #e7e2d6;">'
				. '<strong style="color:#1c1c1a;">' . esc_html( $m['label'] ) . '</strong> &mdash; pre-filled to $' . esc_html( $amount ) . '<br>'
				. '<a href="' . esc_url( $url ) . '" style="display:inline-block;margin-top:6px;background:#1c1c1a;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;font-weight:bold;">Pay $' . esc_html( $amount ) . ' with ' . esc_html( $m['label'] ) . '</a>'
				. '</td></tr>';
		} else {
			$detail = trim( (string) get_option( $m['option'], '' ) );
			if ( '' === $detail ) { continue; }
			$detail_html = nl2br( esc_html( $detail ) );
			$blocks .= '<tr><td style="padding:10px 0;border-bottom:1px solid #e7e2d6;">'
				. '<strong style="color:#1c1c1a;">' . esc_html( $m['label'] ) . '</strong> &mdash; send $' . esc_html( $amount ) . '<br>'
				. '<div style="margin-top:4px;font-size:14px;color:#333;background:#f6f4ec;padding:8px 12px;border-radius:6px;">' . $detail_html . '</div>'
				. '<div style="font-size:13px;color:#555;margin-top:4px;">Amount: <strong>$' . esc_html( $amount ) . '</strong> &middot; Please put <strong>' . esc_html( $memo ) . '</strong> in the memo/note.</div>'
				. '</td></tr>';
		}
	}
	// In-person and Barter (below) are always present, so there is always at
	// least one way to pay even if no Settings-driven methods are configured.

	// In-person (cash or check) — always available, display-only block.
	$payable_to = $biz['legal']; // checks made out to the LLC
	$blocks .= '<tr><td style="padding:10px 0;border-bottom:1px solid #e7e2d6;">'
		. '<strong style="color:#1c1c1a;">In-person</strong> &mdash; pay $' . esc_html( $amount ) . ' by cash or check<br>'
		. '<div style="margin-top:4px;font-size:14px;color:#333;background:#f6f4ec;padding:8px 12px;border-radius:6px;">'
		. 'Cash or check, in person. Make checks payable to <strong>' . esc_html( $payable_to ) . '</strong>.'
		. '</div>'
		. '<div style="font-size:13px;color:#555;margin-top:4px;">Amount: <strong>$' . esc_html( $amount ) . '</strong> &middot; Reference: <strong>' . esc_html( $memo ) . '</strong>.</div>'
		. '</td></tr>';

	// Barter/Trade Offer — mailto button opening a draft addressed to the owner.
	$barter_subject = 'Barter/Trade Offer for Gawlak Family Farms';
	$barter_href    = 'mailto:' . rawurlencode( $biz['email'] ) . '?subject=' . rawurlencode( $barter_subject );
	$blocks .= '<tr><td style="padding:10px 0;border-bottom:1px solid #e7e2d6;">'
		. '<strong style="color:#1c1c1a;">Barter / Trade</strong> &mdash; propose a trade instead<br>'
		. '<a href="' . esc_url( $barter_href ) . '" style="display:inline-block;margin-top:6px;background:#7a4f00;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;font-weight:bold;">Send a Barter/Trade Offer</a>'
		. '<div style="font-size:12px;color:#888;margin-top:4px;">Opens an email to us &mdash; tell us what you&rsquo;d like to trade and we&rsquo;ll reply.</div>'
		. '</td></tr>';

	$overview_html = '' !== trim( $overview ) ? '<p style="margin:0 0 4px;"><strong>What this covers:</strong></p><div style="font-size:15px;color:#333;margin-bottom:18px;">' . nl2br( esc_html( $overview ) ) . '</div>' : '';

	$out  = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">';

	// Business header
	$out .= '<div style="border-bottom:2px solid #1c1c1a;padding-bottom:12px;margin-bottom:16px;">';
	$out .= '<h2 style="color:#1c1c1a;margin:0 0 4px;">' . esc_html( $biz['name'] ) . '</h2>';
	$out .= '<div style="font-size:12px;color:#555;line-height:1.5;">'
		. esc_html( $biz['address'] ) . '<br>'
		. esc_html( $biz['email'] ) . ' &middot; ' . esc_html( $biz['phone'] )
		. '</div>';
	$out .= '</div>';

	// Invoice metadata
	$out .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;font-size:13px;color:#333;">'
		. '<tr><td style="padding:2px 0;"><strong>Invoice #:</strong> ' . esc_html( $invoice_number ) . '</td></tr>'
		. '<tr><td style="padding:2px 0;"><strong>Date:</strong> ' . esc_html( $inv_date ) . '</td></tr>'
		. '<tr><td style="padding:2px 0;"><strong>Due:</strong> Due on receipt</td></tr>'
		. '<tr><td style="padding:2px 0;"><strong>Billed to:</strong> ' . esc_html( $hello !== 'there' ? $hello : $user->user_email ) . '</td></tr>'
		. '</table>';

	$out .= '<p style="font-size:15px;margin:0 0 16px;">Hi ' . $hello . ', here is your invoice.</p>';
	$out .= '<div style="font-size:22px;font-weight:bold;color:#1c1c1a;margin:0 0 16px;">Amount due: $' . esc_html( $amount ) . '</div>';
	$out .= $overview_html;
	$out .= '<p style="margin:0 0 6px;font-weight:bold;">Choose how to pay:</p>';
	$out .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' . $blocks . '</table>';

	// Not the one paying? Nudge them to their email client's own Forward,
	// which preserves the styled payment buttons above. No mailto button —
	// a fresh mailto draft can only carry plain text and would lose them.
	$out .= '<div style="margin-top:22px;padding-top:16px;border-top:1px solid #e7e2d6;">'
		. '<p style="font-size:14px;color:#444;margin:0;">Not the one paying? Just <strong>forward this email</strong> to whoever is &mdash; all the payment options above come along with it.</p>'
		. '</div>';

	// Add more items — links to the WP account/login page.
	$out .= '<div style="margin-top:14px;">'
		. '<p style="font-size:14px;color:#444;margin:0;">Want to add more to your garden? '
		. '<a href="' . esc_url( $login_url ) . '" style="color:#1c1c1a;font-weight:bold;">Log in to your account</a> to browse what else we offer.'
		. '<br><span style="font-size:12px;color:#888;">First time logging in? Use &ldquo;Lost your password?&rdquo; on that page to set one.</span></p>'
		. '</div>';

	// Save-as-PDF instruction (honest: email clients have native print-to-PDF;
	// there is no embeddable button that can trigger it).
	$out .= '<div style="margin-top:14px;">'
		. '<p style="font-size:13px;color:#666;margin:0;"><strong>Save this invoice as a PDF for your records:</strong> in your email app, choose <em>Print</em>, then select <em>Save as PDF</em>.</p>'
		. '</div>';

	$out .= '<p style="font-size:13px;color:#555;margin-top:18px;">Reference for payment: <strong>' . esc_html( $memo ) . '</strong>. Questions? Just reply to this email.</p>';

	$out .= '<p style="font-size:18px;color:#1c1c1a;font-weight:bold;margin-top:22px;">Thank You.</p>';

	// Smallest line, on its own, at the very bottom: legal entity.
	$out .= '<p style="font-size:10px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:10px;">' . esc_html( $biz['legal'] ) . '</p>';

	$out .= '</div>';
	return $out;
}

function gff_reg_collect_clients() {
	$users = get_users( array( 'role__in' => array( 'gff_customer', 'gff_lead' ), 'orderby' => 'registered', 'order' => 'DESC' ) );
	$rows  = array();
	foreach ( $users as $u ) {
		$crops = get_user_meta( $u->ID, 'gff_crops_wanted', true );
		if ( ! is_array( $crops ) ) { $crops = array(); }
		$rows[] = array(
			'id'        => $u->ID,
			'role'      => in_array( 'gff_customer', (array) $u->roles, true ) ? 'Customer' : 'Lead',
			'name'      => trim( get_user_meta( $u->ID, 'first_name', true ) . ' ' . get_user_meta( $u->ID, 'last_name', true ) ),
			'email'     => $u->user_email,
			'phone'     => (string) get_user_meta( $u->ID, 'gff_phone', true ),
			'address'   => (string) get_user_meta( $u->ID, 'gff_service_address', true ),
			'city'      => (string) get_user_meta( $u->ID, 'gff_service_city', true ),
			'zip'       => (string) get_user_meta( $u->ID, 'gff_service_zip', true ),
			'sqft'      => (string) get_user_meta( $u->ID, 'gff_start_sqft', true ),
			'start_date'=> (string) get_user_meta( $u->ID, 'gff_start_date', true ),
			'ratelock'  => (string) get_user_meta( $u->ID, 'gff_rate_lock', true ),
			'reservation'      => (string) get_user_meta( $u->ID, 'gff_reservation', true ),
			'reservation_paid' => (string) get_user_meta( $u->ID, 'gff_reservation_paid', true ),
			'reservation_txn'  => (string) get_user_meta( $u->ID, 'gff_reservation_txn', true ),
			'reservation_paid_at' => (string) get_user_meta( $u->ID, 'gff_reservation_paid_at', true ),
			'reservation_credited' => (string) get_user_meta( $u->ID, 'gff_reservation_credited_signup', true ),
			'addons'    => (string) get_user_meta( $u->ID, 'gff_addons_labels', true ),
			'addons_total' => (string) get_user_meta( $u->ID, 'gff_addons_total', true ),
			'addons_invoiced' => (string) get_user_meta( $u->ID, 'gff_addons_invoiced', true ),
			'lead_city' => (string) get_user_meta( $u->ID, 'gff_lead_city', true ),
			'crops'     => $crops,
			'farm_layout' => (string) get_user_meta( $u->ID, 'gff_farm_layout', true ),
			'moringa_upgrade' => (string) get_user_meta( $u->ID, 'gff_moringa_fruit_upgrade', true ),
			'workshop'  => (string) get_user_meta( $u->ID, 'gff_workshop_interest', true ),
			'agr_ver'   => (string) get_user_meta( $u->ID, 'gff_agreement_version', true ),
			'agr_when'  => (string) get_user_meta( $u->ID, 'gff_agreement_accepted_at', true ),
			'agr_ip'    => (string) get_user_meta( $u->ID, 'gff_agreement_ip', true ),
			'joined'    => $u->user_registered,
		);
	}
	return $rows;
}

/* Monthly Free-Seeds export → feeds the Deck Mailer (deck-mailer.html).
 * Columns match the mailer's auto-map (name,address,city,state,zip); only
 * Free Seeds (gff_class=seed) with a mailing address are included. */
add_action( 'admin_post_gff_export_seeds_mailer', 'gff_export_seeds_mailer' );
function gff_export_seeds_mailer() {
	if ( ! gff_can_manage_clients() ) { wp_die( 'You do not have permission to export.' ); }
	check_admin_referer( 'gff_export_seeds_mailer' );
	$rows = function_exists( 'gff_reg_collect_clients' ) ? gff_reg_collect_clients() : array();
	nocache_headers();
	header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename=gff-free-seeds-' . gmdate( 'Y-m' ) . '.csv' );
	$out = fopen( 'php://output', 'w' );
	fputcsv( $out, array( 'name', 'address', 'city', 'state', 'zip' ) );
	foreach ( $rows as $r ) {
		if ( 'seed' !== gff_class_of( $r['id'] ) ) { continue; }
		$addr = trim( (string) $r['address'] );
		if ( '' === $addr ) { continue; } // the mailer skips address-less rows anyway
		fputcsv( $out, array( $r['name'], $addr, (string) $r['city'], 'FL', (string) $r['zip'] ) );
	}
	fclose( $out );
	exit;
}

add_action( 'admin_post_gff_export_clients', 'gff_reg_export_csv' );
function gff_reg_export_csv() {
	if ( ! current_user_can( 'list_users' ) ) { wp_die( 'You do not have permission to export client data.' ); }
	check_admin_referer( 'gff_export_clients' );
	$rows = gff_reg_collect_clients();
	nocache_headers();
	header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename=gff-clients-' . gmdate( 'Y-m-d' ) . '.csv' );
	$out = fopen( 'php://output', 'w' );
	fputcsv( $out, array( 'Role','Name','Email','Phone','Service Address','City','ZIP','Start size','Start Date','Rate Lock','Reservation','Paid','Txn ID','Paid At','Credited','Add-ons','Add-ons Total','Add-ons Invoiced','Crops Wanted','Farm Layout','Moringa Fruit Upgrade','Workshop Interest','Agreement Version','Accepted At','Accept IP','Joined' ) );
	foreach ( $rows as $r ) {
		fputcsv( $out, array(
			$r['role'], $r['name'], $r['email'], $r['phone'], $r['address'], $r['city'], $r['zip'],
			$r['sqft'], $r['start_date'], $r['ratelock'],
			$r['reservation'], $r['reservation_paid'], $r['reservation_txn'], $r['reservation_paid_at'], $r['reservation_credited'],
			$r['addons'], $r['addons_total'], $r['addons_invoiced'],
			implode( '; ', $r['crops'] ),
			$r['farm_layout'], $r['moringa_upgrade'], $r['workshop'],
			$r['agr_ver'], $r['agr_when'], $r['agr_ip'], $r['joined'],
		) );
	}
	fclose( $out );
	exit;
}

/* List-view invoicing: send an invoice straight from the GFF Clients
 * table. Reuses the same email builder + pay-method config as the
 * profile-view sender, so both paths produce an identical invoice. */
add_action( 'admin_post_gff_send_invoice_row', 'gff_reg_send_invoice_row' );
function gff_reg_send_invoice_row() {
	if ( ! gff_can_manage_clients() ) { wp_die( 'You do not have permission to send invoices.' ); }
	$user_id = isset( $_POST['gff_inv_user'] ) ? (int) $_POST['gff_inv_user'] : 0;
	check_admin_referer( 'gff_send_invoice_row_' . $user_id );

	$redirect = wp_get_referer();
	if ( ! $redirect ) { $redirect = admin_url( 'users.php?page=gff-clients' ); }

	$user = get_userdata( $user_id );
	if ( ! $user || ! is_email( $user->user_email ) ) {
		wp_safe_redirect( add_query_arg( 'gff_inv', 'baduser', $redirect ) );
		exit;
	}

	$amount = preg_replace( '/[^0-9.]/', '', (string) wp_unslash( $_POST['gff_inv_amount'] ?? '' ) );
	$amount = number_format( (float) $amount, 2, '.', '' );
	$overview = sanitize_textarea_field( wp_unslash( $_POST['gff_inv_overview'] ?? '' ) );

	if ( (float) $amount <= 0 ) {
		wp_safe_redirect( add_query_arg( 'gff_inv', 'noamount', $redirect ) );
		exit;
	}

	// Persist so the profile view reflects what was sent (shared meta keys).
	update_user_meta( $user_id, 'gff_inv_amount', $amount );
	update_user_meta( $user_id, 'gff_inv_overview', $overview );

	$invoice_number = gff_reg_next_invoice_number( $user_id );
	$body    = gff_reg_build_invoice_email( $user, $amount, $overview, $invoice_number );
	$subject = 'Your Gawlak Family Farms invoice — $' . $amount;
	$headers = array( 'Content-Type: text/html; charset=UTF-8' );
	$sent    = wp_mail( $user->user_email, $subject, $body, $headers );

	if ( $sent ) {
		update_user_meta( $user_id, 'gff_inv_number', $invoice_number );
		update_user_meta( $user_id, 'gff_inv_last_sent', current_time( 'mysql' ) . ' — $' . $amount . ' — ' . $invoice_number );
		gff_inv_log_add( $user_id, $invoice_number, $amount, $overview );
		wp_safe_redirect( add_query_arg( array( 'gff_inv' => 'sent', 'gff_inv_amt' => rawurlencode( $amount ) ), $redirect ) );
	} else {
		gff_reg_rollback_invoice_number(); // don't burn a number on a failed send
		wp_safe_redirect( add_query_arg( 'gff_inv', 'failed', $redirect ) );
	}
	exit;
}

/* ============================================================
 * Invoice log — append-only per-customer history so each invoice
 * can be tracked and manually marked paid. `gff_inv_last_sent` is
 * still written elsewhere for back-compat; this log is the record
 * of truth for open/paid status and the Drive "Paid Invoices" tab.
 * Each entry: { num, amount, overview, sent_at, status, paid_at, paid_by }.
 * ============================================================ */
function gff_inv_log_get( $uid ) {
	$log = get_user_meta( (int) $uid, 'gff_inv_log', true );
	return is_array( $log ) ? $log : array();
}
function gff_inv_log_add( $uid, $number, $amount, $overview ) {
	$log   = gff_inv_log_get( $uid );
	$log[] = array(
		'num'      => (string) $number,
		'amount'   => number_format( (float) $amount, 2, '.', '' ),
		'overview' => (string) $overview,
		'sent_at'  => current_time( 'mysql' ),
		'status'   => 'sent',
		'paid_at'  => '',
		'paid_by'  => 0,
	);
	update_user_meta( (int) $uid, 'gff_inv_log', $log );
}
/* Open = anything not yet marked paid. */
function gff_inv_open_entries( $uid ) {
	return array_values( array_filter( gff_inv_log_get( $uid ), function ( $e ) {
		return empty( $e['status'] ) || 'paid' !== $e['status'];
	} ) );
}
function gff_inv_paid_entries( $uid ) {
	return array_values( array_filter( gff_inv_log_get( $uid ), function ( $e ) {
		return isset( $e['status'] ) && 'paid' === $e['status'];
	} ) );
}
function gff_inv_outstanding_total( $uid ) {
	$t = 0.0;
	foreach ( gff_inv_open_entries( $uid ) as $e ) { $t += (float) $e['amount']; }
	return $t;
}
/* Flip one invoice (by number) paid/unpaid. Returns true if it hit one. */
function gff_inv_mark( $uid, $num, $paid, $by ) {
	$log = gff_inv_log_get( $uid );
	$hit = false;
	foreach ( $log as &$e ) {
		if ( (string) $e['num'] === (string) $num ) {
			$e['status']  = $paid ? 'paid' : 'sent';
			$e['paid_at'] = $paid ? current_time( 'mysql' ) : '';
			$e['paid_by'] = $paid ? (int) $by : 0;
			$hit = true;
		}
	}
	unset( $e );
	if ( $hit ) { update_user_meta( (int) $uid, 'gff_inv_log', $log ); }
	return $hit;
}

/* Mark-paid / mark-unpaid action — staff-enabled, per-invoice nonce.
 * Paid invoices drop out of the active view and archive to the Sheet. */
add_action( 'admin_post_gff_inv_mark_paid', 'gff_inv_mark_paid_handler' );
function gff_inv_mark_paid_handler() {
	$uid  = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	$num  = isset( $_POST['num'] ) ? sanitize_text_field( wp_unslash( $_POST['num'] ) ) : '';
	$paid = isset( $_POST['paid'] ) && '1' === (string) $_POST['paid'];
	if ( ! gff_can_manage_clients() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'gff_inv_mark_' . $uid . '_' . $num );
	gff_inv_mark( $uid, $num, $paid, get_current_user_id() );
	$back = wp_get_referer();
	if ( ! $back ) { $back = home_url( '/account/' ); }
	wp_safe_redirect( add_query_arg( 'gff_cnote', $paid ? 'invpaid' : 'invopen', $back ) );
	exit;
}

function gff_reg_admin_page() {
	if ( ! current_user_can( 'list_users' ) ) { wp_die( 'You do not have permission to view this page.' ); }
	$rows  = gff_reg_collect_clients();
	$count = count( $rows );
	$customers = array_values( array_filter( $rows, function ( $r ) { return 'Lead' !== $r['role']; } ) );
	$leads     = array_values( array_filter( $rows, function ( $r ) { return 'Lead' === $r['role']; } ) );
	$export_url = wp_nonce_url( admin_url( 'admin-post.php?action=gff_export_clients' ), 'gff_export_clients' );

	// Invoice-send result notice (from the admin-post redirect).
	if ( isset( $_GET['gff_inv'] ) ) {
		$code = sanitize_key( wp_unslash( $_GET['gff_inv'] ) );
		$amt  = isset( $_GET['gff_inv_amt'] ) ? preg_replace( '/[^0-9.]/', '', wp_unslash( $_GET['gff_inv_amt'] ) ) : '';
		if ( 'sent' === $code ) {
			echo '<div class="notice notice-success is-dismissible"><p>Invoice emailed' . ( $amt !== '' ? ' for $' . esc_html( $amt ) : '' ) . '.</p></div>';
		} elseif ( 'failed' === $code ) {
			echo '<div class="notice notice-error is-dismissible"><p>Invoice could not be sent. Check WP Mail SMTP settings and try again.</p></div>';
		} elseif ( 'noamount' === $code ) {
			echo '<div class="notice notice-error is-dismissible"><p>Enter an amount greater than $0 before sending.</p></div>';
		} elseif ( 'baduser' === $code ) {
			echo '<div class="notice notice-error is-dismissible"><p>That customer has no valid email on file.</p></div>';
		}
	}
	if ( isset( $_GET['gff_cnote'] ) ) {
		$cn   = sanitize_key( wp_unslash( $_GET['gff_cnote'] ) );
		$cmap = array( 'converted' => array( 'success', 'Lead converted to customer.' ), 'classed' => array( 'success', 'Tier updated.' ), 'invited' => array( 'success', 'Garden invite emailed.' ), 'deleted' => array( 'success', 'Deleted.' ), 'err' => array( 'error', 'That action could not be completed.' ), 'saved' => array( 'success', 'Saved.' ) );
		$m    = isset( $cmap[ $cn ] ) ? $cmap[ $cn ] : array( 'success', 'Saved.' );
		echo '<div class="notice notice-' . $m[0] . ' is-dismissible"><p>' . esc_html( $m[1] ) . '</p></div>';
	}
	?>
	<div class="wrap">
		<h1 style="display:flex;align-items:center;gap:.6em;">GFF Clients
			<span style="font-size:13px;font-weight:400;background:#1c1c1a;color:#fff;padding:2px 10px;border-radius:12px;"><?php echo intval( $count ); ?> records</span>
		</h1>
		<p><a href="<?php echo esc_url( $export_url ); ?>" class="button button-primary">Export all to CSV</a></p>
		<?php if ( ! $count ) : ?>
			<div class="notice notice-info inline"><p>No enrollments or leads yet.</p></div>
		<?php else : ?>
			<h2>Customers</h2>
			<table class="widefat striped" style="margin-top:1em;">
				<thead><tr><th>Tier</th><th>Type</th><th>Name</th><th>Contact</th><th>Service Address</th><th>Size</th><th>Reservation</th><th>Add-ons</th><th>Crops</th><th>Agreement</th><?php if ( current_user_can( 'edit_users' ) ) : ?><th>Invoice</th><?php endif; ?></tr></thead>
				<tbody>
				<?php foreach ( $customers as $r ) : ?>
					<tr>
						<td><strong style="font-size:11px;"><?php $rk = gff_class_of( $r['id'] ); echo esc_html( 'customer' === $rk ? 'Paid · ' . ucfirst( gff_paid_plan_of( $r['id'] ) ) : gff_class_label( $rk ) ); ?></strong><br><?php echo gff_class_actions( $r['id'], 'admin' ); ?></td>
						<td><span style="background:<?php echo 'Customer' === $r['role'] ? '#1c1c1a' : '#7a4f00'; ?>;color:#fff;padding:1px 8px;border-radius:8px;font-size:11px;"><?php echo esc_html( $r['role'] ); ?></span></td>
						<td>
							<strong><?php echo esc_html( $r['name'] ? $r['name'] : '(no name)' ); ?></strong><br>
							<a href="<?php echo esc_url( get_edit_user_link( $r['id'] ) ); ?>">view profile</a>
						</td>
						<td>
							<a href="mailto:<?php echo esc_attr( $r['email'] ); ?>"><?php echo esc_html( $r['email'] ); ?></a>
							<?php if ( $r['phone'] ) : ?><br><?php echo esc_html( $r['phone'] ); ?><?php endif; ?>
						</td>
						<td>
							<?php if ( $r['address'] ) : ?>
								<?php echo esc_html( $r['address'] ); ?><br>
								<?php echo esc_html( trim( $r['city'] . ' ' . $r['zip'] ) ); ?>
							<?php elseif ( $r['lead_city'] ) : ?>
								<em>(lead) <?php echo esc_html( $r['lead_city'] ); ?></em>
							<?php else : ?>&mdash;<?php endif; ?>
						</td>
						<td>
							<?php echo $r['sqft'] !== '' ? esc_html( $r['sqft'] ) : '&mdash;'; ?>
							<?php if ( $r['start_date'] ) : ?><br><span style="font-size:11px;color:#1c1c1a;">starts <?php echo esc_html( $r['start_date'] ); ?></span><?php endif; ?>
						</td>
						<td style="font-size:12px;">
							<?php
								$res = $r['reservation'];
								if ( '' === $res || 'none' === $res ) {
									echo '&mdash;';
								} else {
									$rm_disp = gff_reg_reservation_meta( $res );
									$label = $rm_disp['label'];
									echo '<strong>' . esc_html( $label ) . '</strong>';
									if ( 'yes' === $r['reservation_paid'] ) {
										echo '<br><span style="color:#1c1c1a;font-weight:700;">&#10003; paid</span>';
										if ( $r['reservation_txn'] ) { echo '<br><span style="font-size:11px;">txn: ' . esc_html( $r['reservation_txn'] ) . '</span>'; }
										if ( $r['reservation_paid_at'] ) { echo '<br><span style="font-size:11px;color:#5F5E5A;">' . esc_html( $r['reservation_paid_at'] ) . '</span>'; }
									} else {
										echo '<br><span style="color:#7a2417;font-weight:700;">awaiting payment</span>';
									}
									if ( 'yes' === $r['reservation_credited'] ) { echo '<br><span style="font-size:11px;color:#1c1c1a;">credited &#10003;</span>'; }
								}
							?>
						</td>
						<td style="font-size:12px;">
							<?php
								if ( '' === $r['addons'] ) {
									echo '&mdash;';
								} else {
									echo '<details><summary><strong>$' . esc_html( $r['addons_total'] ) . '</strong></summary>'
										. '<div style="margin-top:.4em;font-size:12px;line-height:1.6;">' . esc_html( $r['addons'] ) . '</div></details>';
									if ( 'yes' === $r['addons_invoiced'] ) {
										echo '<span style="font-size:11px;color:#1c1c1a;font-weight:700;">&#10003; invoiced</span>';
									} else {
										echo '<span style="font-size:11px;color:#7a2417;font-weight:700;">to invoice</span>';
									}
								}
							?>
						</td>
						<td>
							<?php
							$n = count( $r['crops'] );
							if ( $n ) {
								echo '<details><summary>' . intval( $n ) . ' selected</summary><div style="margin-top:.4em;font-size:12px;line-height:1.6;">' . esc_html( implode( ', ', $r['crops'] ) ) . '</div></details>';
							} else { echo '&mdash;'; }
							// build-your-farm layout, if present
							if ( ! empty( $r['farm_layout'] ) ) {
								$ly = json_decode( $r['farm_layout'], true );
								if ( is_array( $ly ) ) {
									echo '<details style="margin-top:.4em;"><summary style="color:#1c1c1a;font-weight:600;">🌱 Farm layout</summary><div style="margin-top:.4em;font-size:12px;line-height:1.6;">';
									if ( ! empty( $ly['towers'] ) ) {
										foreach ( $ly['towers'] as $tw ) {
											$pl = ! empty( $tw['plants'] ) ? implode( ', ', array_map( 'esc_html', $tw['plants'] ) ) : '(empty)';
											echo '<strong>Tower ' . intval( $tw['tower'] ) . ':</strong> ' . $pl . '<br>';
										}
									} elseif ( ! empty( $ly['seasonal_spots'] ) ) {
										echo '<strong>Seasonal bed:</strong> ' . esc_html( implode( ', ', $ly['seasonal_spots'] ) );
									}
									echo '</div></details>';
								}
							}
							if ( 'yes' === $r['moringa_upgrade'] ) {
								echo '<div style="margin-top:.3em;font-size:11px;color:#c98b2a;font-weight:600;">🌳 Moringa→fruit tree (+$100, invoice later)</div>';
							}
							?>
						</td>
						<td style="font-size:12px;">
							<?php if ( $r['agr_when'] ) : ?>v<?php echo esc_html( $r['agr_ver'] ); ?><br><?php echo esc_html( $r['agr_when'] ); ?><br><span style="color:#777;">IP <?php echo esc_html( $r['agr_ip'] ); ?></span><?php else : ?>&mdash;<?php endif; ?>
						</td>
						<?php if ( current_user_can( 'edit_users' ) ) :
							$prefill_amt = (string) get_user_meta( $r['id'], 'gff_inv_amount', true );
							$prefill_ovw = (string) get_user_meta( $r['id'], 'gff_inv_overview', true );
							$last_sent   = (string) get_user_meta( $r['id'], 'gff_inv_last_sent', true );
							$rid         = (int) $r['id'];
							?>
						<td style="font-size:12px;min-width:150px;">
							<button type="button" class="button button-small gff-inv-toggle" data-gff-inv="<?php echo esc_attr( $rid ); ?>">Invoice&hellip;</button>
							<?php if ( $last_sent ) : ?><div style="font-size:11px;color:#1c1c1a;margin-top:3px;">last: <?php echo esc_html( $last_sent ); ?></div><?php endif; ?>
							<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" id="gff-inv-form-<?php echo esc_attr( $rid ); ?>" class="gff-inv-form" style="display:none;margin-top:6px;">
								<input type="hidden" name="action" value="gff_send_invoice_row">
								<input type="hidden" name="gff_inv_user" value="<?php echo esc_attr( $rid ); ?>">
								<?php wp_nonce_field( 'gff_send_invoice_row_' . $rid ); ?>
								<label style="display:block;margin-bottom:4px;">Amount $
									<input type="text" name="gff_inv_amount" value="<?php echo esc_attr( $prefill_amt ); ?>" placeholder="0.00" style="width:80px;">
								</label>
								<label style="display:block;margin-bottom:4px;">Overview (optional)<br>
									<textarea name="gff_inv_overview" rows="2" style="width:100%;min-width:140px;" placeholder="What this invoice covers"><?php echo esc_textarea( $prefill_ovw ); ?></textarea>
								</label>
								<button type="submit" class="button button-primary button-small"
									onclick="return confirm('Email this invoice to <?php echo esc_js( $r['email'] ); ?>?');">
									Send to <?php echo esc_html( $r['email'] ); ?>
								</button>
							</form>
						</td>
						<?php endif; ?>
					</tr>
					<tr>
						<td colspan="<?php echo current_user_can( 'edit_users' ) ? 11 : 10; ?>" style="background:#fafdf7;">
							<?php echo gff_client_messages_html( $r['id'] ); echo gff_client_notes_form( $r['id'] ); echo gff_client_delete_form( $r['id'], 'admin' ); ?>
						</td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
			<?php if ( current_user_can( 'edit_users' ) ) : ?>
			<script>
			(function(){
				document.querySelectorAll('.gff-inv-toggle').forEach(function(btn){
					btn.addEventListener('click', function(){
						var id = btn.getAttribute('data-gff-inv');
						var f = document.getElementById('gff-inv-form-'+id);
						if (f) { f.style.display = (f.style.display === 'none' || !f.style.display) ? 'block' : 'none'; }
					});
				});
			})();
			</script>
			<?php endif; ?>

			<h2 style="margin-top:2em;">Leads</h2>
			<?php if ( ! $leads ) : ?>
				<div class="notice notice-info inline"><p>No leads yet.</p></div>
			<?php else : ?>
			<table class="widefat striped">
				<thead><tr><th>Action</th><th>Name</th><th>Contact</th><th>Interest</th><th>Notes</th></tr></thead>
				<tbody>
				<?php foreach ( $leads as $r ) : ?>
					<tr>
						<td><?php echo gff_class_actions( $r['id'], 'admin' ); ?></td>
						<td><strong><?php echo esc_html( $r['name'] ? $r['name'] : '(no name)' ); ?></strong><br><a href="<?php echo esc_url( get_edit_user_link( $r['id'] ) ); ?>">view profile</a></td>
						<td><a href="mailto:<?php echo esc_attr( $r['email'] ); ?>"><?php echo esc_html( $r['email'] ); ?></a><?php if ( $r['phone'] ) : ?><br><?php echo esc_html( $r['phone'] ); ?><?php endif; ?></td>
						<td><?php echo $r['lead_city'] ? esc_html( $r['lead_city'] ) : '&mdash;'; ?></td>
						<td style="min-width:220px;"><?php echo gff_client_messages_html( $r['id'] ); echo gff_client_notes_form( $r['id'] ); echo gff_client_delete_form( $r['id'], 'admin' ); ?></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
			<?php endif; ?>
		<?php endif; ?>
	</div>
	<?php
}

/* ============================================================
 * 13. STAFF role
 * ============================================================ */
register_activation_hook( __FILE__, 'gff_reg_staff_role' );
function gff_reg_staff_role() {
	add_role( 'gff_staff', 'GFF Staff', array( 'read' => true, 'gff_view_clients' => true ) );
	$admin = get_role( 'administrator' );
	if ( $admin ) { $admin->add_cap( 'gff_view_clients' ); }
}

add_action( 'admin_init', 'gff_reg_ensure_staff_role' );
function gff_reg_ensure_staff_role() {
	if ( ! get_role( 'gff_staff' ) ) {
		add_role( 'gff_staff', 'GFF Staff', array( 'read' => true, 'gff_view_clients' => true ) );
	}
	$admin = get_role( 'administrator' );
	if ( $admin && ! $admin->has_cap( 'gff_view_clients' ) ) { $admin->add_cap( 'gff_view_clients' ); }
}

/* ============================================================
 * 15. [gff_account] — logged-in account page + customer→owner message
 *     Added June 2026 (rebuilt). Details + [gff_my_farm] view + a
 *     message box that emails the owner with Reply-To = customer,
 *     and logs each message to the customer's user profile.
 *     Recipient is a settings field (Settings → GFF Settings),
 *     default martingawlak@gmail.com.
 * ============================================================ */

/* --- Recipient setting: registered + rendered via the existing
 *     gff_reg_settings_after hook so we don't touch the settings
 *     page render itself. --- */
add_action( 'admin_init', 'gff_reg_register_msg_recipient' );
function gff_reg_register_msg_recipient() {
	register_setting( 'gff_reg_settings_group', 'gff_reg_msg_recipient', array(
		'type'              => 'string',
		'sanitize_callback' => 'sanitize_email',
		'default'           => 'martingawlak@gmail.com',
	) );
}

add_action( 'gff_reg_settings_after', 'gff_reg_msg_recipient_field' );
function gff_reg_msg_recipient_field() {
	$to = get_option( 'gff_reg_msg_recipient', 'martingawlak@gmail.com' );
	if ( '' === trim( (string) $to ) ) { $to = 'martingawlak@gmail.com'; }
	?>
	<table class="form-table" role="presentation">
		<tr>
			<th scope="row"><label for="gff_reg_msg_recipient">Account-page message recipient</label></th>
			<td>
				<input type="email" id="gff_reg_msg_recipient" name="gff_reg_msg_recipient" value="<?php echo esc_attr( $to ); ?>" class="regular-text" placeholder="martingawlak@gmail.com">
				<p class="description">Where messages from the customer account page (<code>[gff_account]</code>) are emailed. Reply-To is set to the customer, so hitting reply goes straight to them.</p>
			</td>
		</tr>
	</table>
	<?php
}

/* --- [gff_account] --- */
add_shortcode( 'gff_account', 'gff_sc_account' );
function gff_sc_account( $atts = array() ) {

	// Guest view: offer WP login, Google login (if that plugin adds its button
	// to the login form / provides [google_login]), and account creation on home.
	if ( ! is_user_logged_in() ) {
		$login_url = wp_login_url( get_permalink() );
		$home_url  = home_url( '/' );
		ob_start(); ?>
		<div class="gff-acct gff-acct--guest">
			<h2 class="gff-acct__title">Your Gawlak Family Farms account</h2>
			<p class="gff-acct__lead">Log in to view your farm and send us a message.</p>
			<p class="gff-acct__actions">
				<a class="gff-acct__btn" href="<?php echo esc_url( $login_url ); ?>">Log in with WordPress</a>
			</p>
			<?php
			// If a Google-login plugin exposes a shortcode, surface it. Common ones:
			// [google_login_button] (Google Site Kit / NextendSocial variants). Rendered
			// only if the shortcode exists so we never print raw text.
			if ( shortcode_exists( 'google_login_button' ) ) {
				echo '<p class="gff-acct__google">' . do_shortcode( '[google_login_button]' ) . '</p>';
			} elseif ( shortcode_exists( 'nextend_social_login' ) ) {
				echo '<p class="gff-acct__google">' . do_shortcode( '[nextend_social_login provider="google"]' ) . '</p>';
			} else {
				echo '<p class="gff-acct__hint">Prefer Google? Use the Google button on the <a href="' . esc_url( $login_url ) . '">login page</a>.</p>';
			}
			?>
			<p class="gff-acct__hint">New here? <a href="<?php echo esc_url( $home_url ); ?>">Create an account on our home page</a>.</p>
		</div>
		<?php echo gff_acct_styles(); ?>
		<?php return ob_get_clean();
	}

	// Admins get the full Dispatch command center; staff (gff_view_clients)
	// get a Clients-only management view. Same URL, secure server-side gate.
	if ( current_user_can( 'manage_options' ) ) { return gff_admin_dashboard( 'full' ); }
	if ( current_user_can( 'gff_view_clients' ) ) { return gff_admin_dashboard( 'clients' ); }

	$uid   = get_current_user_id();
	$user  = wp_get_current_user();
	$first = get_user_meta( $uid, 'first_name', true );
	$last  = get_user_meta( $uid, 'last_name', true );
	$phone = get_user_meta( $uid, 'gff_phone', true );
	$name  = trim( $first . ' ' . $last );
	if ( '' === $name ) { $name = $user->display_name; }

	// Handle a submitted message (nonce-guarded POST to self).
	$notice = '';
	if ( isset( $_POST['gff_acct_msg_nonce'] )
		&& wp_verify_nonce( sanitize_key( wp_unslash( $_POST['gff_acct_msg_nonce'] ) ), 'gff_acct_msg_' . $uid ) ) {
		$msg = isset( $_POST['gff_acct_message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['gff_acct_message'] ) ) : '';
		if ( '' === trim( $msg ) ) {
			$notice = '<div class="gff-acct__notice gff-acct__notice--warn">Please type a message before sending.</div>';
		} else {
			$sent = gff_acct_send_message( $uid, $user, $name, $phone, $msg );
			$notice = $sent
				? '<div class="gff-acct__notice gff-acct__notice--ok">Message sent — we&rsquo;ll get back to you soon.</div>'
				: '<div class="gff-acct__notice gff-acct__notice--warn">Sorry, the message could not be sent. Please call us at (772) 924-7459.</div>';
		}
	}

	ob_start(); ?>
	<div class="gff-acct">
		<h2 class="gff-acct__title">Your account</h2>
		<?php echo $notice; // already escaped markup ?>

		<div class="gff-acct__card">
			<h3 class="gff-acct__h3">Your details</h3>
			<ul class="gff-acct__details">
				<li><span>Name</span><strong><?php echo esc_html( $name ); ?></strong></li>
				<li><span>Email</span><strong><?php echo esc_html( $user->user_email ); ?></strong></li>
				<?php if ( $phone ) : ?><li><span>Phone</span><strong><?php echo esc_html( $phone ); ?></strong></li><?php endif; ?>
			</ul>
			<p class="gff-acct__manage">
				<?php if ( function_exists( 'wc_get_page_permalink' ) ) : ?>
					<a href="<?php echo esc_url( wc_get_page_permalink( 'myaccount' ) ); ?>">Manage password &amp; account details</a>
				<?php else : ?>
					<a href="<?php echo esc_url( admin_url( 'profile.php' ) ); ?>">Edit your profile</a>
				<?php endif; ?>
			</p>
		</div>

		<div class="gff-acct__card">
			<?php echo do_shortcode( '[gff_my_farm]' ); ?>
		</div>

		<?php $gff_planner = do_shortcode( '[gff_account_planner]' ); ?>
		<?php if ( '' !== trim( $gff_planner ) ) : ?>
			<div class="gff-acct__card">
				<?php echo $gff_planner; // built from escaped parts ?>
			</div>
		<?php endif; ?>

		<div class="gff-acct__card">
			<h3 class="gff-acct__h3">Send us a message</h3>
			<p class="gff-acct__sub">Questions, changes, or scheduling — send it here and we&rsquo;ll reply to <?php echo esc_html( $user->user_email ); ?>.</p>
			<form method="post" class="gff-acct__form">
				<?php wp_nonce_field( 'gff_acct_msg_' . $uid, 'gff_acct_msg_nonce' ); ?>
				<textarea name="gff_acct_message" rows="5" required placeholder="Type your message&hellip;"></textarea>
				<button type="submit" class="gff-acct__btn">Send message</button>
			</form>
		</div>

		<p class="gff-acct__logout"><a href="<?php echo esc_url( wp_logout_url( home_url( '/' ) ) ); ?>">Log out</a></p>
	</div>
	<?php echo gff_acct_styles(); ?>
	<?php return ob_get_clean();
}

/* Send the customer→owner message. Reply-To = customer, HTML body,
 * transported by WP Mail SMTP. Also logs to the customer's profile. */
function gff_acct_send_message( $uid, $user, $name, $phone, $msg ) {
	$to = get_option( 'gff_reg_msg_recipient', 'martingawlak@gmail.com' );
	if ( '' === trim( (string) $to ) || ! is_email( $to ) ) { $to = 'martingawlak@gmail.com'; }

	$subject = 'New account message from ' . $name;
	$body  = '<p><strong>' . esc_html( $name ) . '</strong> sent a message from their account page.</p>';
	$body .= '<p><strong>Email:</strong> ' . esc_html( $user->user_email ) . '<br>';
	if ( $phone ) { $body .= '<strong>Phone:</strong> ' . esc_html( $phone ) . '<br>'; }
	$body .= '<strong>User ID:</strong> ' . intval( $uid ) . '</p>';
	$body .= '<hr><p>' . nl2br( esc_html( $msg ) ) . '</p>';

	$headers = array(
		'Content-Type: text/html; charset=UTF-8',
		'Reply-To: ' . $name . ' <' . $user->user_email . '>',
	);

	$sent = wp_mail( $to, $subject, $body, $headers );

	// Log to the customer's profile regardless of send outcome, so the
	// owner has a record. Newest first, capped to last 50 entries.
	$log = get_user_meta( $uid, 'gff_acct_messages', true );
	if ( ! is_array( $log ) ) { $log = array(); }
	array_unshift( $log, array(
		'time' => current_time( 'mysql' ),
		'msg'  => $msg,
		'sent' => $sent ? 1 : 0,
	) );
	if ( count( $log ) > 50 ) { $log = array_slice( $log, 0, 50 ); }
	update_user_meta( $uid, 'gff_acct_messages', $log );

	return $sent;
}

/* Shared styles for the account page — scoped by .gff-acct prefix,
 * matching the file's Georgia-serif green palette. */
function gff_acct_styles() {
	return '<style>
		.gff-acct{max-width:640px;margin:0 auto;font-family:"Lato",sans-serif;color:#1c1c1a;}
		.gff-acct__title{font-size:24px;text-align:center;margin:.2em 0 .6em;}
		.gff-acct__lead{text-align:center;color:#6f6e69;}
		.gff-acct__card{border:1px solid #e4e2da;border-radius:14px;padding:16px 18px;margin:14px 0;background:#fafaf7;}
		.gff-acct__h3{font-size:16px;color:#1c1c1a;margin:0 0 .6em;}
		.gff-acct__sub{font-size:13px;color:#6f6e69;margin:0 0 .8em;}
		.gff-acct__details{list-style:none;margin:0;padding:0;}
		.gff-acct__details li{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px dashed #e4e2da;font-size:14px;}
		.gff-acct__details li:last-child{border-bottom:none;}
		.gff-acct__details span{color:#9a9a94;}
		.gff-acct__manage{margin:.8em 0 0;font-size:13px;}
		.gff-acct__manage a,.gff-acct__logout a,.gff-acct__hint a{color:#1c1c1a;}
		.gff-acct__form textarea{width:100%;box-sizing:border-box;border:1px solid #e0dccf;border-radius:10px;padding:10px 12px;font-family:inherit;font-size:14px;resize:vertical;}
		.gff-acct__btn{display:inline-block;margin-top:10px;background:#1c1c1a;color:#fff;border:none;border-radius:22px;padding:10px 22px;font-family:inherit;font-size:14px;cursor:pointer;text-decoration:none;}
		.gff-acct__btn:hover{background:#2f6b39;}
		.gff-acct__actions{text-align:center;margin:1em 0;}
		.gff-acct__google{text-align:center;margin:.6em 0;}
		.gff-acct__hint{text-align:center;font-size:13px;color:#6f6e69;}
		.gff-acct__logout{text-align:center;margin:1.2em 0 0;font-size:13px;}
		.gff-acct__notice{border-radius:10px;padding:10px 14px;margin:0 0 12px;font-size:14px;}
		.gff-acct__notice--ok{background:#eef5fb;border:1px solid #bcd6ea;color:#1c1c1a;}
		.gff-acct__notice--warn{background:#fdf3ec;border:1px solid #e8c4a8;color:#a8562a;}
	</style>';
}

/* ============================================================
 * 14. ADMIN DISPATCH DASHBOARD (rendered by [gff_account] for admins)
 * ============================================================
 * When an administrator opens /account, they get a command center:
 *  A. Recent dispatches (every customer request), age-colored, with
 *     Mark-consulted / Assign / Call / Text / Email / Forward.
 *  B. Customer list with contact + services + Invoice (reuses the
 *     existing gff_send_invoice_row pipeline).
 *  C. Team list (administrators) with Call/Text/Email.
 * All state that isn't already in customer meta lives in the
 * gff_dispatch_status option; no new DB tables.
 */

/* Digits-only for tel:/sms: links. */
function gff_dash_tel( $p ) { return preg_replace( '/[^0-9+]/', '', (string) $p ); }

/* Human "x ago" from a MySQL timestamp. */
function gff_dispatch_ago( $mysql ) {
	$t = strtotime( $mysql );
	if ( ! $t ) { return ''; }
	$now = current_time( 'timestamp' );
	if ( $t > $now ) { $t = $now; }
	return human_time_diff( $t, $now ) . ' ago';
}

function gff_dispatch_user_name( $id ) {
	$u = $id ? get_userdata( (int) $id ) : null;
	return $u ? $u->display_name : '&mdash;';
}

/* Age -> colour bucket. Consulted stops the clock (green). */
function gff_dispatch_age_class( $mysql, $consulted = false ) {
	if ( $consulted ) { return 'done'; }
	$t = strtotime( $mysql );
	if ( ! $t ) { return 'aged'; }
	$h = ( current_time( 'timestamp' ) - $t ) / 3600;
	if ( $h < 1 )  { return 'hot'; }
	if ( $h < 4 )  { return 'warm'; }
	if ( $h < 12 ) { return 'amber'; }
	if ( $h < 24 ) { return 'cool'; }
	return 'aged';
}

/* Status store: option keyed by dispatch id -> {consulted_by, consulted_at, assigned_to}. */
function gff_dispatch_status_all() {
	$s = get_option( 'gff_dispatch_status', array() );
	return is_array( $s ) ? $s : array();
}
function gff_dispatch_status_set( $id, $patch ) {
	$all = gff_dispatch_status_all();
	$cur = isset( $all[ $id ] ) && is_array( $all[ $id ] ) ? $all[ $id ] : array();
	$all[ $id ] = array_merge( $cur, $patch );
	if ( count( $all ) > 1000 ) { $all = array_slice( $all, -1000, null, true ); }
	update_option( 'gff_dispatch_status', $all, false );
}

/* Aggregate every customer request into a unified, age-sortable list. */
function gff_collect_dispatches( $days = 30, $limit = 150 ) {
	$cutoff = current_time( 'timestamp' ) - ( $days * DAY_IN_SECONDS );
	$users  = get_users( array( 'role__in' => array( 'gff_customer', 'gff_lead' ) ) );
	$out    = array();

	foreach ( $users as $u ) {
		$uid   = $u->ID;
		$name  = trim( get_user_meta( $uid, 'first_name', true ) . ' ' . get_user_meta( $uid, 'last_name', true ) );
		if ( '' === $name ) { $name = $u->display_name; }
		$phone = get_user_meta( $uid, 'gff_phone', true );
		$email = $u->user_email;

		$push = function( $type, $label, $time, $summary ) use ( &$out, $uid, $name, $phone, $email, $cutoff ) {
			$ts = strtotime( (string) $time );
			if ( ! $ts || $ts < $cutoff ) { return; }
			$out[] = array(
				'id'       => md5( $uid . '|' . $type . '|' . $time . '|' . $summary ),
				'user_id'  => $uid, 'name' => $name, 'phone' => $phone, 'email' => $email,
				'type'     => $type, 'type_label' => $label, 'time' => $time,
				'summary'  => $summary, 'ts' => $ts,
			);
		};

		// Contact messages
		$msgs = get_user_meta( $uid, 'gff_acct_messages', true );
		if ( is_array( $msgs ) ) {
			foreach ( $msgs as $m ) {
				if ( empty( $m['time'] ) ) { continue; }
				$excerpt = wp_trim_words( (string) ( isset( $m['msg'] ) ? $m['msg'] : '' ), 18, '&hellip;' );
				$push( 'message', 'Message', $m['time'], $excerpt );
			}
		}
		// Spire unlock request
		$su = get_user_meta( $uid, 'gff_spire_unlock_request', true );
		if ( is_array( $su ) && ! empty( $su['time'] ) ) {
			$push( 'spire', 'Spire', $su['time'], 'Spire design unlock ($100) - ' . ( isset( $su['status'] ) ? $su['status'] : '' ) );
		}
		// Spire add-on request
		$sa = get_user_meta( $uid, 'gff_spire_addon_request', true );
		if ( is_array( $sa ) && ! empty( $sa['time'] ) ) {
			$push( 'spire', 'Spire', $sa['time'], ( (int) ( isset( $sa['qty'] ) ? $sa['qty'] : 0 ) ) . ' Spire(s) requested - $' . ( isset( $sa['monthly'] ) ? $sa['monthly'] : '?' ) . '/mo' );
		}
		// Reservation / consult
		$res = get_user_meta( $uid, 'gff_reservation', true );
		if ( $res && 'none' !== $res ) {
			$paid_at = get_user_meta( $uid, 'gff_reservation_paid_at', true );
			$paid    = 'yes' === get_user_meta( $uid, 'gff_reservation_paid', true );
			$rt      = $paid_at ? $paid_at : $u->user_registered;
			$push( 'consult', 'Consult', $rt, ucfirst( str_replace( '_', ' ', $res ) ) . ( $paid ? ' - paid' : ' - awaiting payment' ) );
		}
		// New lead
		$lead_at = get_user_meta( $uid, 'gff_lead_at', true );
		if ( $lead_at ) {
			$push( 'lead', 'Lead', $lead_at, 'New lead - ' . get_user_meta( $uid, 'gff_lead_city', true ) );
		}
	}

	usort( $out, function( $a, $b ) { return $b['ts'] <=> $a['ts']; } );
	return array_slice( $out, 0, $limit );
}

/* Short services summary for the customer table. */
function gff_dash_service_summary( $c ) {
	$bits = array();
	if ( ! empty( $c['sqft'] ) )        { $bits[] = $c['sqft'] . ' sqft'; }
	if ( ! empty( $c['start_date'] ) )  { $bits[] = 'starts ' . $c['start_date']; }
	if ( ! empty( $c['reservation'] ) && 'none' !== $c['reservation'] ) { $bits[] = ucfirst( str_replace( '_', ' ', $c['reservation'] ) ); }
	if ( ! empty( $c['addons_total'] ) ){ $bits[] = 'add-ons $' . $c['addons_total']; }
	if ( ! empty( $c['crops'] ) && is_array( $c['crops'] ) ) { $bits[] = count( $c['crops'] ) . ' crops'; }
	return $bits ? implode( ' &middot; ', $bits ) : '&mdash;';
}

/* Inline invoice form - posts to the existing gff_send_invoice_row handler. */
function gff_dash_invoice_form( $c ) {
	if ( ! is_email( $c['email'] ) ) { return '<span style="color:#a8562a;">no email</span>'; }
	$rid  = (int) $c['id'];
	$amt  = esc_attr( (string) get_user_meta( $rid, 'gff_inv_amount', true ) );
	$ovw  = esc_textarea( (string) get_user_meta( $rid, 'gff_inv_overview', true ) );
	$open = gff_inv_open_entries( $rid );
	ob_start(); ?>
	<button type="button" class="gff-dash__mini gff-dash-inv-toggle" data-inv="<?php echo $rid; ?>">Invoice&hellip;</button>
	<?php if ( $open ) : ?>
		<div class="gff-dash__last"><?php echo count( $open ); ?> open &middot; $<?php echo esc_html( number_format( gff_inv_outstanding_total( $rid ), 2 ) ); ?></div>
		<?php foreach ( $open as $e ) : ?>
			<div class="gff-dash__invopen">
				<span><?php echo esc_html( $e['num'] ); ?> &middot; $<?php echo esc_html( $e['amount'] ); ?> &middot; sent <?php echo esc_html( mysql2date( 'M j', $e['sent_at'] ) ); ?></span>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="gff-dash__inline">
					<input type="hidden" name="action" value="gff_inv_mark_paid">
					<input type="hidden" name="uid" value="<?php echo $rid; ?>">
					<input type="hidden" name="num" value="<?php echo esc_attr( $e['num'] ); ?>">
					<input type="hidden" name="paid" value="1">
					<?php wp_nonce_field( 'gff_inv_mark_' . $rid . '_' . $e['num'] ); ?>
					<button type="submit" class="gff-dash__mini gff-dash__mini--go">Mark paid</button>
				</form>
			</div>
		<?php endforeach; ?>
	<?php endif; ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" id="gff-dash-inv-<?php echo $rid; ?>" class="gff-dash-inv-form" style="display:none;">
		<input type="hidden" name="action" value="gff_send_invoice_row">
		<input type="hidden" name="gff_inv_user" value="<?php echo $rid; ?>">
		<?php wp_nonce_field( 'gff_send_invoice_row_' . $rid ); ?>
		<label>$<input type="text" name="gff_inv_amount" value="<?php echo $amt; ?>" placeholder="0.00" style="width:72px;"></label>
		<textarea name="gff_inv_overview" rows="2" placeholder="What this covers" style="width:100%;"><?php echo $ovw; ?></textarea>
		<button type="submit" class="gff-dash__mini gff-dash__mini--go" onclick="return confirm('Email this invoice to <?php echo esc_js( $c['email'] ); ?>?');">Send to <?php echo esc_html( $c['email'] ); ?></button>
	</form>
	<?php return ob_get_clean();
}

/* The three-list admin dashboard. */
function gff_admin_dashboard( $mode = 'full' ) {
	if ( ! gff_can_manage_clients() ) { return ''; }
	// Full dispatch view is admins-only; staff get the Clients-only view.
	$is_full   = gff_can_manage_clients(); // staff now get the full business view, admins too
	$me        = wp_get_current_user();
	$admins    = get_users( array( 'role__in' => array( 'administrator', 'gff_staff' ), 'orderby' => 'display_name' ) ); // Team + assign/forward includes staff
	$clients   = function_exists( 'gff_reg_collect_clients' ) ? gff_reg_collect_clients() : array();
	$customers = array();
	$leads     = array();
	foreach ( $clients as $c ) { if ( 'Lead' === $c['role'] ) { $leads[] = $c; } else { $customers[] = $c; } }
	$disp    = $is_full ? gff_collect_dispatches() : array();
	$status  = gff_dispatch_status_all();

	// Result notices from action redirects.
	$notice = '';
	if ( isset( $_GET['gff_dnote'] ) ) {
		$n = sanitize_key( wp_unslash( $_GET['gff_dnote'] ) );
		$map = array(
			'consulted' => array( 'ok', 'Marked consulted.' ),
			'assigned'  => array( 'ok', 'Dispatch assigned.' ),
			'forwarded' => array( 'ok', 'Forwarded to the team member.' ),
			'invsent'   => array( 'ok', 'Invoice emailed.' ),
			'err'       => array( 'warn', 'That action could not be completed.' ),
		);
		if ( isset( $map[ $n ] ) ) { $notice = '<div class="gff-acct__notice gff-acct__notice--' . $map[ $n ][0] . '">' . esc_html( $map[ $n ][1] ) . '</div>'; }
	}
	// The shared invoice handler redirects back here with ?gff_inv=...
	if ( '' === $notice && isset( $_GET['gff_inv'] ) ) {
		$ic  = sanitize_key( wp_unslash( $_GET['gff_inv'] ) );
		$imp = array(
			'sent'     => array( 'ok', 'Invoice emailed.' ),
			'failed'   => array( 'warn', 'Invoice could not be sent.' ),
			'noamount' => array( 'warn', 'Enter an invoice amount first.' ),
			'baduser'  => array( 'warn', 'That customer has no valid email.' ),
		);
		if ( isset( $imp[ $ic ] ) ) { $notice = '<div class="gff-acct__notice gff-acct__notice--' . $imp[ $ic ][0] . '">' . esc_html( $imp[ $ic ][1] ) . '</div>'; }
	}
	// Client status/notes/convert/delete result (from gff_client_* handlers).
	if ( '' === $notice && isset( $_GET['gff_cnote'] ) ) {
		$cn   = sanitize_key( wp_unslash( $_GET['gff_cnote'] ) );
		$cmap = array( 'converted' => array( 'ok', 'Lead converted to customer.' ), 'classed' => array( 'ok', 'Tier updated.' ), 'invited' => array( 'ok', 'Garden invite emailed.' ), 'deleted' => array( 'ok', 'Deleted.' ), 'invpaid' => array( 'ok', 'Invoice marked paid — archived.' ), 'invopen' => array( 'ok', 'Invoice reopened.' ), 'err' => array( 'warn', 'That action could not be completed.' ), 'saved' => array( 'ok', 'Saved.' ) );
		$m    = isset( $cmap[ $cn ] ) ? $cmap[ $cn ] : array( 'ok', 'Saved.' );
		$notice = '<div class="gff-acct__notice gff-acct__notice--' . $m[0] . '">' . esc_html( $m[1] ) . '</div>';
	}

	$admin_options = '';
	foreach ( $admins as $a ) { $admin_options .= '<option value="' . (int) $a->ID . '">' . esc_html( $a->display_name ) . '</option>'; }

	ob_start(); ?>
	<div class="gff-acct gff-dash">
		<h2 class="gff-acct__title">Dispatch</h2>
		<p class="gff-acct__lead">Signed in as <?php echo esc_html( $me->display_name ); ?> &middot; <?php echo current_user_can( 'manage_options' ) ? 'admin view' : 'staff view'; ?></p>
		<?php echo $notice; ?>

		<?php if ( $is_full ) : ?>
		<div class="gff-acct__card">
			<h3 class="gff-acct__h3">Recent dispatches <span class="gff-dash__count"><?php echo count( $disp ); ?></span></h3>
			<?php if ( ! $disp ) : ?>
				<p class="gff-acct__sub">No requests in the last 30 days.</p>
			<?php else : foreach ( $disp as $d ) :
				$st        = isset( $status[ $d['id'] ] ) ? $status[ $d['id'] ] : array();
				$consulted = ! empty( $st['consulted_at'] );
				$cls       = gff_dispatch_age_class( $d['time'], $consulted );
				$tel       = gff_dash_tel( $d['phone'] );
			?>
				<div class="gff-dash__row gff-dash__row--<?php echo esc_attr( $cls ); ?>">
					<div class="gff-dash__top">
						<span class="gff-dash__type"><?php echo esc_html( $d['type_label'] ); ?></span>
						<strong><?php echo esc_html( $d['name'] ); ?></strong>
						<span class="gff-dash__ago"><?php echo esc_html( gff_dispatch_ago( $d['time'] ) ); ?></span>
						<?php if ( $consulted ) : ?><span class="gff-dash__flag gff-dash__flag--done">&#10003; consulted by <?php echo esc_html( gff_dispatch_user_name( $st['consulted_by'] ) ); ?></span><?php endif; ?>
						<?php if ( ! empty( $st['assigned_to'] ) ) : ?><span class="gff-dash__flag">&rarr; <?php echo esc_html( gff_dispatch_user_name( $st['assigned_to'] ) ); ?></span><?php endif; ?>
					</div>
					<div class="gff-dash__summary"><?php echo esc_html( $d['summary'] ); ?></div>
					<div class="gff-dash__actions">
						<?php if ( $tel ) : ?><a class="gff-dash__mini" href="tel:<?php echo esc_attr( $tel ); ?>">Call</a><a class="gff-dash__mini" href="sms:<?php echo esc_attr( $tel ); ?>">Text</a><?php endif; ?>
						<a class="gff-dash__mini" href="mailto:<?php echo esc_attr( $d['email'] ); ?>">Email</a>
						<?php if ( ! $consulted ) : ?>
						<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="gff-dash__inline">
							<input type="hidden" name="action" value="gff_dispatch_consult">
							<input type="hidden" name="did" value="<?php echo esc_attr( $d['id'] ); ?>">
							<?php wp_nonce_field( 'gff_dispatch_' . $d['id'] ); ?>
							<button type="submit" class="gff-dash__mini gff-dash__mini--go">Mark consulted</button>
						</form>
						<?php endif; ?>
						<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="gff-dash__inline">
							<input type="hidden" name="action" value="gff_dispatch_assign">
							<input type="hidden" name="did" value="<?php echo esc_attr( $d['id'] ); ?>">
							<?php wp_nonce_field( 'gff_dispatch_' . $d['id'] ); ?>
							<select name="assign_to" class="gff-dash__sel" onchange="this.form.submit()"><option value="">Assign&hellip;</option><?php echo $admin_options; ?></select>
						</form>
						<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="gff-dash__inline">
							<input type="hidden" name="action" value="gff_dispatch_forward">
							<input type="hidden" name="did" value="<?php echo esc_attr( $d['id'] ); ?>">
							<?php wp_nonce_field( 'gff_dispatch_' . $d['id'] ); ?>
							<select name="forward_to" class="gff-dash__sel" onchange="this.form.submit()"><option value="">Forward&hellip;</option><?php echo $admin_options; ?></select>
						</form>
					</div>
				</div>
			<?php endforeach; endif; ?>
		</div>

		<?php
		$route_stops = gff_route_active_stops( $clients );
		list( $route_stops, $route_missing ) = gff_route_optimize( $route_stops );
		$route_groups = $route_stops ? array_chunk( $route_stops, 9 ) : array();
		$ob = 2; $route_origin_coords = gff_geocode_cached( gff_route_origin(), $ob ); // cached from optimize
		$osrm_budget = 4; // cap new directions lookups per load
		?>
		<div class="gff-acct__card">
			<h3 class="gff-acct__h3">Customer map <span class="gff-dash__count"><?php echo count( $route_stops ); ?> stops</span></h3>
			<?php if ( $route_groups ) : ?>
				<p class="gff-acct__sub">Ordered as a shortest-hop round route from <b><?php echo esc_html( gff_route_origin() ); ?></b>, up to 9 stops each. <?php echo count( $route_stops ); ?> paid clients &rarr; <?php echo count( $route_groups ); ?> route<?php echo count( $route_groups ) > 1 ? 's' : ''; ?>.<?php if ( $route_missing ) : ?> <span style="color:#a8562a;"><?php echo (int) $route_missing; ?> address<?php echo $route_missing > 1 ? 'es' : ''; ?> still being located &mdash; reload in a moment to finish optimizing.</span><?php endif; ?></p>
				<?php foreach ( $route_groups as $gi => $group ) :
					$dir = gff_route_directions( $route_origin_coords, $group, $osrm_budget );
				?>
					<div class="gff-dash__routeblock">
						<?php if ( $dir && ! empty( $dir['points'] ) ) : ?>
							<div class="gff-route-preview"><?php echo gff_route_preview_svg( $dir, $group, $route_origin_coords ); ?></div>
							<p class="gff-dash__drivetime">&#9733; from <?php echo esc_html( gff_route_origin() ); ?> &middot; <strong>~<?php echo esc_html( gff_fmt_duration( $dir['duration'] ) ); ?> drive</strong> &middot; <?php echo esc_html( round( $dir['distance'] / 1609.34, 1 ) ); ?> mi &middot; <?php echo count( $group ); ?> stops</p>
						<?php else : ?>
							<p class="gff-dash__drivetime">Estimating drive time&hellip; reload in a moment.</p>
						<?php endif; ?>
						<a class="gff-dash__mini gff-dash__mini--go gff-dash__route" href="<?php echo esc_url( gff_route_maps_url( $group ) ); ?>" target="_blank" rel="noopener">&#128506; Open route <?php echo ( $gi + 1 ); ?> in Google Maps (<?php echo count( $group ); ?>)</a>
						<ol class="gff-dash__stops" start="1">
							<?php foreach ( $group as $s ) : ?>
								<li><a href="https://www.google.com/maps/search/?api=1&amp;query=<?php echo rawurlencode( $s['addr'] ); ?>" target="_blank" rel="noopener"><?php echo esc_html( $s['name'] ); ?></a> &mdash; <span><?php echo esc_html( $s['addr'] ); ?></span></li>
							<?php endforeach; ?>
						</ol>
					</div>
				<?php endforeach; ?>
			<?php else : ?>
				<p class="gff-acct__sub">Add a service address to your <b>paid clients</b> to build routes (9 stops each, all starting at <?php echo esc_html( gff_route_origin() ); ?>).</p>
			<?php endif; ?>
		</div>

		<?php endif; // dispatch feed + map are admins-only ?>

		<?php
		$g_leads = array(); $g_seeds = array(); $g_paid = array();
		foreach ( $clients as $c ) {
			$k = gff_class_of( $c['id'] );
			if ( 'lead' === $k ) { $g_leads[] = $c; } elseif ( 'seed' === $k ) { $g_seeds[] = $c; } else { $g_paid[] = $c; }
		}
		?>
		<?php echo gff_dash_client_section( 'Paid Clients', $g_paid, $is_full ); ?>
		<?php
		$seeds_mailer_url = wp_nonce_url( admin_url( 'admin-post.php?action=gff_export_seeds_mailer' ), 'gff_export_seeds_mailer' );
		$seeds_btn = '<a class="gff-dash__mini" href="' . esc_url( $seeds_mailer_url ) . '" style="margin-bottom:8px;">&#11015;&#65039; Export for mailer (CSV)</a>';
		echo gff_dash_client_section( 'Free Seeds Customers', $g_seeds, $is_full, $seeds_btn );
		?>
		<?php echo gff_dash_client_section( 'Leads', $g_leads, $is_full ); ?>

		<?php if ( $is_full ) : ?>
		<div class="gff-acct__card">
			<h3 class="gff-acct__h3">Team</h3>
			<ul class="gff-acct__details">
			<?php foreach ( $admins as $a ) : $ap = gff_dash_tel( get_user_meta( $a->ID, 'gff_phone', true ) ); ?>
				<li>
					<span><?php echo esc_html( $a->display_name ); ?></span>
					<strong><a href="mailto:<?php echo esc_attr( $a->user_email ); ?>"><?php echo esc_html( $a->user_email ); ?></a><?php if ( $ap ) : ?> &middot; <a href="tel:<?php echo esc_attr( $ap ); ?>">Call</a> &middot; <a href="sms:<?php echo esc_attr( $ap ); ?>">Text</a><?php else : ?> &middot; <em style="color:#a8562a;">add phone</em><?php endif; ?></strong>
				</li>
			<?php endforeach; ?>
			</ul>
			<p class="gff-acct__sub">Phones come from each admin&rsquo;s <a href="<?php echo esc_url( admin_url( 'profile.php' ) ); ?>">WordPress profile</a>.</p>
		</div>
		<?php endif; // team: admins only ?>

		<p class="gff-acct__logout"><a href="<?php echo esc_url( wp_logout_url( home_url( '/' ) ) ); ?>">Log out</a></p>
	</div>
	<script>
	(function(){
		document.querySelectorAll('.gff-dash-inv-toggle').forEach(function(b){
			b.addEventListener('click',function(){
				var f=document.getElementById('gff-dash-inv-'+b.getAttribute('data-inv'));
				if(f){ f.style.display=(f.style.display==='none'||!f.style.display)?'block':'none'; }
			});
		});
		// Planting checklist — autosave each toggle, no submit needed.
		var AJAX='<?php echo esc_js( admin_url( 'admin-ajax.php' ) ); ?>';
		document.querySelectorAll('.gff-plant-check').forEach(function(box){
			var uid=box.getAttribute('data-uid'), nonce=box.getAttribute('data-nonce');
			box.querySelectorAll('.gff-plant-box').forEach(function(cb){
				cb.addEventListener('change',function(){
					var crop=cb.getAttribute('data-crop'), on=cb.checked?'1':'0';
					var fd=new FormData();
					fd.append('action','gff_crop_toggle'); fd.append('uid',uid); fd.append('nonce',nonce);
					fd.append('crop',crop); fd.append('on',on);
					cb.disabled=true;
					fetch(AJAX,{method:'POST',body:fd,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){
						cb.disabled=false;
						if(!j||!j.success){ cb.checked=!cb.checked; return; }
						var cnt=box.querySelector('.gff-plant-count'); if(cnt){ cnt.textContent=j.data.done; }
						var when=cb.parentNode.querySelector('.gff-plant-when'); if(when){ when.textContent=on==='1'?('sown '+j.data.when):''; }
					}).catch(function(){ cb.disabled=false; cb.checked=!cb.checked; });
				});
			});
		});
	})();
	</script>
	<?php echo gff_acct_styles(); echo gff_admin_dash_styles(); ?>
	<?php return ob_get_clean();
}

/* Active route stops (customers flagged gff_route_active with an address). */
function gff_route_active_stops( $clients ) {
	$stops = array();
	foreach ( $clients as $c ) {
		if ( 'customer' !== gff_class_of( $c['id'] ) ) { continue; } // all paid clients are on the map
		if ( '' === trim( $c['address'] ) ) { continue; }
		$addr = trim( $c['address'] . ', ' . $c['city'] . ' ' . $c['zip'], ", \t\n\r\0\x0B" );
		$stops[] = array( 'uid' => (int) $c['id'], 'name' => $c['name'] ? $c['name'] : $c['email'], 'addr' => $addr );
	}
	return $stops;
}

/* Geocode an address to [lat,lng], cached in the gff_geo_cache option so
 * each address is only looked up once. Uses Google (if a key is stored in
 * the gff_google_geocode_key option) else free OpenStreetMap/Nominatim.
 * $budget is by-ref: only that many *new* network lookups per page load. */
function gff_geocode_cached( $addr, &$budget ) {
	$addr = trim( (string) $addr );
	if ( '' === $addr ) { return null; }
	$cache = get_option( 'gff_geo_cache', array() );
	if ( ! is_array( $cache ) ) { $cache = array(); }
	$key = md5( strtolower( $addr ) );
	if ( isset( $cache[ $key ] ) ) {
		return is_array( $cache[ $key ] ) ? $cache[ $key ] : null; // 'none' sentinel -> null
	}
	if ( $budget <= 0 ) { return null; } // defer to a later load; keeps the page fast

	$coords = null;
	$gkey   = trim( (string) get_option( 'gff_google_geocode_key', '' ) );
	if ( '' !== $gkey ) {
		$res = wp_remote_get( 'https://maps.googleapis.com/maps/api/geocode/json?address=' . rawurlencode( $addr ) . '&key=' . rawurlencode( $gkey ), array( 'timeout' => 8 ) );
		if ( ! is_wp_error( $res ) ) {
			$b = json_decode( wp_remote_retrieve_body( $res ), true );
			if ( ! empty( $b['results'][0]['geometry']['location'] ) ) {
				$loc    = $b['results'][0]['geometry']['location'];
				$coords = array( (float) $loc['lat'], (float) $loc['lng'] );
			}
		}
	} else {
		$res = wp_remote_get(
			'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' . rawurlencode( $addr ),
			array( 'timeout' => 8, 'headers' => array( 'User-Agent' => 'GawlakFamilyFarms/1.0 (' . get_option( 'admin_email' ) . ')' ) )
		);
		if ( ! is_wp_error( $res ) ) {
			$b = json_decode( wp_remote_retrieve_body( $res ), true );
			if ( ! empty( $b[0]['lat'] ) ) {
				$coords = array( (float) $b[0]['lat'], (float) $b[0]['lon'] );
			}
		}
	}

	$budget--;
	$cache[ $key ] = $coords ? $coords : 'none';
	if ( count( $cache ) > 2000 ) { $cache = array_slice( $cache, -2000, null, true ); }
	update_option( 'gff_geo_cache', $cache, false );
	return $coords;
}

/* Great-circle miles between two [lat,lng] points. */
function gff_haversine( $a, $b ) {
	$R    = 3958.8;
	$dLa  = deg2rad( $b[0] - $a[0] );
	$dLo  = deg2rad( $b[1] - $a[1] );
	$la1  = deg2rad( $a[0] );
	$la2  = deg2rad( $b[0] );
	$h    = sin( $dLa / 2 ) ** 2 + cos( $la1 ) * cos( $la2 ) * sin( $dLo / 2 ) ** 2;
	return 2 * $R * asin( min( 1, sqrt( $h ) ) );
}

/* Order stops as a nearest-neighbour path from the fixed origin (a round-ish
 * route). Stops we couldn't geocode keep their place at the end. */
function gff_route_order_nn( $origin, $stops ) {
	$located = array();
	$missing = array();
	foreach ( $stops as $s ) {
		if ( isset( $s['coords'] ) && is_array( $s['coords'] ) ) { $located[] = $s; } else { $missing[] = $s; }
	}
	if ( ! is_array( $origin ) || count( $located ) < 2 ) {
		return array_merge( $located, $missing );
	}
	$ordered = array();
	$cur     = $origin;
	while ( $located ) {
		$bi = 0; $bd = INF;
		foreach ( $located as $i => $s ) {
			$d = gff_haversine( $cur, $s['coords'] );
			if ( $d < $bd ) { $bd = $d; $bi = $i; }
		}
		$ordered[] = $located[ $bi ];
		$cur       = $located[ $bi ]['coords'];
		array_splice( $located, $bi, 1 );
	}
	return array_merge( $ordered, $missing );
}

/* Geocode (budgeted) + nearest-neighbour order the active stops. */
function gff_route_optimize( $stops ) {
	if ( count( $stops ) < 2 ) { return array( $stops, 0 ); }
	$budget = 6; // cap new network lookups per load; cache warms over a few loads
	$origin = gff_geocode_cached( gff_route_origin(), $budget );
	$missing = 0;
	foreach ( $stops as &$s ) {
		$s['coords'] = gff_geocode_cached( $s['addr'], $budget );
		if ( ! is_array( $s['coords'] ) ) { $missing++; }
	}
	unset( $s );
	return array( gff_route_order_nn( is_array( $origin ) ? $origin : null, $stops ), $missing );
}

/* Fixed starting point for every route. Editable via the
 * gff_route_origin option (or the filter) if the yard moves. */
function gff_route_origin() {
	$o = get_option( 'gff_route_origin', '366 E Midway Road, Fort Pierce, FL' );
	return apply_filters( 'gff_route_origin', $o );
}

/* Build one Google Maps directions URL (opens the app on mobile).
 * Fixed origin (366 E Midway Road) -> up to 9 customer stops.
 * The last stop is the destination; the rest are waypoints. */
function gff_route_maps_url( $stops ) {
	if ( ! $stops ) { return ''; }
	$stops = array_slice( $stops, 0, 9 );
	$addrs = array_map( function( $s ) { return $s['addr']; }, $stops );
	$dest  = array_pop( $addrs );
	$url   = 'https://www.google.com/maps/dir/?api=1'
		. '&origin=' . rawurlencode( gff_route_origin() )
		. '&destination=' . rawurlencode( $dest );
	if ( $addrs ) {
		$url .= '&waypoints=' . implode( '%7C', array_map( 'rawurlencode', $addrs ) );
	}
	return $url;
}

/* Toggle a customer's route-active flag (admin-only, nonce-guarded). */
add_action( 'admin_post_gff_route_toggle', 'gff_route_toggle_handler' );
function gff_route_toggle_handler() {
	$uid = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	if ( ! gff_can_manage_clients() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'gff_route_toggle_' . $uid );
	$now = 'yes' === get_user_meta( $uid, 'gff_route_active', true );
	update_user_meta( $uid, 'gff_route_active', $now ? 'no' : 'yes' );
	// Warm the geocode cache when switching a customer on, so the route
	// ordering has coordinates ready without blocking the dashboard.
	if ( ! $now ) {
		$addr = trim( get_user_meta( $uid, 'gff_service_address', true ) . ', ' . get_user_meta( $uid, 'gff_service_city', true ) . ' ' . get_user_meta( $uid, 'gff_service_zip', true ), ", \t\n\r\0\x0B" );
		if ( '' !== trim( (string) get_user_meta( $uid, 'gff_service_address', true ) ) ) {
			$b = 1; gff_geocode_cached( $addr, $b );
		}
	}
	$back = wp_get_referer();
	if ( ! $back ) { $back = home_url( '/account/' ); }
	wp_safe_redirect( $back );
	exit;
}

/* Dashboard-specific styles (age chips, table, mini-buttons). */
function gff_admin_dash_styles() {
	return '<style>
		.gff-dash{max-width:900px;}
		.gff-dash__count{background:#1c1c1a;color:#fff;font-size:12px;padding:1px 9px;border-radius:12px;vertical-align:middle;margin-left:6px;}
		.gff-dash__row{border-left:5px solid #ccc;background:#fff;border:1px solid #e4e2da;border-radius:10px;padding:10px 12px;margin:8px 0;font-family:"Lato",sans-serif;}
		.gff-dash__row--hot{border-left-color:#d23b2f;background:#fdeceb;}
		.gff-dash__row--warm{border-left-color:#e8791f;background:#fdf3ea;}
		.gff-dash__row--amber{border-left-color:#e0b000;background:#fdfae8;}
		.gff-dash__row--cool{border-left-color:#3a7a9a;background:#eef6fb;}
		.gff-dash__row--aged{border-left-color:#b7b7b7;background:#fafafa;}
		.gff-dash__row--done{border-left-color:#1c1c1a;background:#eef5fb;}
		.gff-dash__top{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:14px;}
		.gff-dash__type{background:#1c1c1a;color:#fff;font-size:11px;padding:1px 8px;border-radius:8px;}
		.gff-dash__ago{color:#9a9a94;font-size:12px;}
		.gff-dash__flag{font-size:12px;color:#1c1c1a;font-weight:600;}
		.gff-dash__summary{font-size:13px;color:#444;margin:5px 0 7px;}
		.gff-dash__actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
		.gff-dash__inline{display:inline;margin:0;}
		.gff-dash__mini{display:inline-block;font-size:12px;padding:4px 10px;border-radius:14px;border:1px solid #ded9cb;background:#fff;color:#1c1c1a;text-decoration:none;cursor:pointer;font-family:inherit;}
		.gff-dash__mini:hover{background:#f1f6ec;}
		.gff-dash__mini--go{background:#1c1c1a;color:#fff;border-color:#1c1c1a;}
		.gff-dash__sel{font-size:12px;padding:3px 6px;border-radius:10px;border:1px solid #ded9cb;font-family:inherit;}
		.gff-dash__scroll{overflow-x:auto;}
		.gff-dash__table{width:100%;border-collapse:collapse;font-family:"Lato",sans-serif;font-size:13px;}
		.gff-dash__table th,.gff-dash__table td{text-align:left;padding:8px 10px;border-bottom:1px solid #eef3e9;vertical-align:top;}
		.gff-dash__table th{color:#9a9a94;font-weight:600;font-size:12px;}
		.gff-dash__badge{font-size:11px;background:#eef3e9;color:#6f6e69;padding:1px 7px;border-radius:8px;}
		.gff-dash__svc{color:#6f6e69;}
		.gff-dash__invcell{min-width:170px;}
		.gff-dash__last{font-size:11px;color:#1c1c1a;margin:3px 0;}
		.gff-dash-inv-form input,.gff-dash-inv-form textarea{border:1px solid #e0dccf;border-radius:8px;padding:5px 7px;font-family:inherit;font-size:12px;margin:3px 0;box-sizing:border-box;}
		.gff-dash__route{font-size:15px;padding:11px 18px;}
		.gff-dash__routeblock{border-top:1px solid #eef3e9;padding-top:12px;margin-top:12px;}
		.gff-dash__routeblock:first-of-type{border-top:none;padding-top:0;margin-top:6px;}
		.gff-route-preview{border:1px solid #e0dccf;border-radius:12px;overflow:hidden;margin-bottom:8px;max-width:520px;}
		.gff-dash__drivetime{font-size:13px;color:#6f6e69;margin:0 0 8px;font-family:"Lato",sans-serif;}
		.gff-dash__drivetime strong{color:#2f6b39;}
		.gff-badge--lead{background:#eef0e8;color:#6a6a52;}
		.gff-badge--seed{background:#eaf6e2;color:#2f6b39;}
		.gff-badge--customer{background:#1c1c1a;color:#fff;}
		.gff-plan-label{font-size:12px;color:#6f6e69;font-weight:600;margin-right:2px;}
		.gff-dash__ex{margin:0 0 8px;font-family:"Lato",sans-serif;}
		.gff-dash__ex summary{cursor:pointer;color:#1c1c1a;font-size:13px;font-weight:600;}
		.gff-dash__exbody{font-size:13px;color:#444;padding:6px 0 4px;line-height:1.5;}
		.gff-dash__msg{border-left:3px solid #e4e2da;padding:2px 0 2px 8px;margin:5px 0;}
		.gff-dash__msgtime{font-size:11px;color:#9a9a94;}
		.gff-dash__stops{margin:12px 0 0;padding-left:20px;font-family:"Lato",sans-serif;font-size:13px;color:#6f6e69;}
		.gff-dash__stops li{margin:3px 0;}
		.gff-dash__stops a{color:#1c1c1a;font-weight:600;}
		.gff-dash__toggle{font-size:12px;padding:4px 12px;border-radius:14px;border:1px solid #ded9cb;background:#f4f4f4;color:#9a9a94;cursor:pointer;font-family:inherit;min-width:56px;}
		.gff-dash__toggle--on{background:#1c1c1a;color:#fff;border-color:#1c1c1a;}
		.gff-dash__inactive{opacity:.5;}
		.gff-dash__inactive td strong{text-decoration:line-through;}
		.gff-dash__notesrow td{padding-top:0;border-bottom:2px solid #eef3e9;}
		.gff-dash__owed{display:inline-block;margin-left:6px;font-size:11px;background:#fdeceb;color:#b3352b;padding:1px 8px;border-radius:8px;font-weight:600;}
		.gff-dash__invopen{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;color:#444;margin:4px 0;}
		.gff-plant-list{display:flex;flex-direction:column;gap:4px;}
		.gff-plant-item{display:flex;align-items:center;gap:8px;font-size:13px;color:#33402c;cursor:pointer;}
		.gff-plant-item input{width:16px;height:16px;}
		.gff-plant-when{font-size:11px;color:#9a9a94;margin-left:auto;}
	</style>';
}

/* ---- Dispatch action handlers (admin-only, nonce-guarded) ---- */
add_action( 'admin_post_gff_dispatch_consult', 'gff_dispatch_consult_handler' );
function gff_dispatch_consult_handler() {
	$did = isset( $_POST['did'] ) ? sanitize_text_field( wp_unslash( $_POST['did'] ) ) : '';
	if ( ! gff_can_manage_clients() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'gff_dispatch_' . $did );
	gff_dispatch_status_set( $did, array( 'consulted_by' => get_current_user_id(), 'consulted_at' => current_time( 'mysql' ) ) );
	gff_dispatch_redirect( 'consulted' );
}

add_action( 'admin_post_gff_dispatch_assign', 'gff_dispatch_assign_handler' );
function gff_dispatch_assign_handler() {
	$did = isset( $_POST['did'] ) ? sanitize_text_field( wp_unslash( $_POST['did'] ) ) : '';
	if ( ! gff_can_manage_clients() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'gff_dispatch_' . $did );
	$to = isset( $_POST['assign_to'] ) ? (int) $_POST['assign_to'] : 0;
	if ( $to ) {
		gff_dispatch_status_set( $did, array( 'assigned_to' => $to ) );
		$admin = get_userdata( $to );
		if ( $admin && is_email( $admin->user_email ) ) {
			wp_mail( $admin->user_email, 'A dispatch was assigned to you', '<p>' . esc_html( wp_get_current_user()->display_name ) . ' assigned you a customer dispatch. Open your account page to view it.</p>', array( 'Content-Type: text/html; charset=UTF-8' ) );
		}
	}
	gff_dispatch_redirect( $to ? 'assigned' : 'err' );
}

add_action( 'admin_post_gff_dispatch_forward', 'gff_dispatch_forward_handler' );
function gff_dispatch_forward_handler() {
	$did = isset( $_POST['did'] ) ? sanitize_text_field( wp_unslash( $_POST['did'] ) ) : '';
	if ( ! gff_can_manage_clients() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'gff_dispatch_' . $did );
	$to = isset( $_POST['forward_to'] ) ? (int) $_POST['forward_to'] : 0;
	$ok = false;
	if ( $to ) {
		$admin = get_userdata( $to );
		// Re-find the dispatch to include its details.
		$match = null;
		foreach ( gff_collect_dispatches( 60, 400 ) as $d ) { if ( $d['id'] === $did ) { $match = $d; break; } }
		if ( $admin && is_email( $admin->user_email ) && $match ) {
			$body  = '<p>' . esc_html( wp_get_current_user()->display_name ) . ' forwarded you a customer dispatch:</p>';
			$body .= '<p><strong>' . esc_html( $match['name'] ) . '</strong> - ' . esc_html( $match['type_label'] ) . '<br>';
			$body .= 'Email: ' . esc_html( $match['email'] ) . ( $match['phone'] ? '<br>Phone: ' . esc_html( $match['phone'] ) : '' ) . '</p>';
			$body .= '<hr><p>' . esc_html( $match['summary'] ) . '</p>';
			$headers = array( 'Content-Type: text/html; charset=UTF-8' );
			if ( is_email( $match['email'] ) ) { $headers[] = 'Reply-To: ' . $match['name'] . ' <' . $match['email'] . '>'; }
			$ok = wp_mail( $admin->user_email, 'Forwarded dispatch: ' . $match['name'], $body, $headers );
		}
	}
	gff_dispatch_redirect( $ok ? 'forwarded' : 'err' );
}

/* Redirect back to the account page with a result note. */
function gff_dispatch_redirect( $note ) {
	$back = wp_get_referer();
	if ( ! $back ) { $back = home_url( '/account/' ); }
	wp_safe_redirect( add_query_arg( 'gff_dnote', $note, $back ) );
	exit;
}

/* ---- Admin phone on the WP user profile (feeds Team Call/Text) ---- */
add_action( 'show_user_profile', 'gff_dash_profile_phone_field' );
add_action( 'edit_user_profile', 'gff_dash_profile_phone_field' );
function gff_dash_profile_phone_field( $user ) {
	$phone = get_user_meta( $user->ID, 'gff_phone', true );
	?>
	<h2>Contact phone</h2>
	<table class="form-table"><tr>
		<th><label for="gff_phone">Phone</label></th>
		<td><input type="tel" name="gff_phone" id="gff_phone" value="<?php echo esc_attr( $phone ); ?>" class="regular-text">
		<p class="description">Used for one-tap Call/Text on the Dispatch dashboard.</p></td>
	</tr></table>
	<?php
}
add_action( 'personal_options_update', 'gff_dash_save_profile_phone' );
add_action( 'edit_user_profile_update', 'gff_dash_save_profile_phone' );
function gff_dash_save_profile_phone( $user_id ) {
	if ( ! current_user_can( 'edit_user', $user_id ) ) { return; }
	if ( isset( $_POST['gff_phone'] ) ) {
		update_user_meta( $user_id, 'gff_phone', sanitize_text_field( wp_unslash( $_POST['gff_phone'] ) ) );
	}
}

/* ============================================================
 * 15. CLIENT MANAGEMENT — active/inactive status + internal Notes
 * ============================================================
 * Shared by the WP-admin GFF Clients page and the front-end
 * staff/admin account view. Status in gff_active meta ('no' = inactive;
 * missing/anything else = active). Internal Notes in gff_notes meta.
 * Both editable by anyone with gff_view_clients (staff) or manage_options.
 */

/* A customer/lead counts as active unless explicitly set inactive. */
function gff_client_is_active( $id ) {
	return 'no' !== get_user_meta( (int) $id, 'gff_active', true );
}

/* Can the current user manage client status/notes? (staff + admins) */
function gff_can_manage_clients() {
	return current_user_can( 'gff_view_clients' ) || current_user_can( 'manage_options' );
}

/* Active/Inactive toggle form. $style 'front' (dashboard chips) or 'admin' (wp buttons). */
function gff_active_toggle_form( $id, $style = 'front' ) {
	$id     = (int) $id;
	$active = gff_client_is_active( $id );
	if ( 'admin' === $style ) {
		$cls   = 'button button-small';
		$extra = $active ? ' style="color:#1c1c1a;font-weight:600;"' : ' style="color:#7a2417;font-weight:600;"';
		$label = $active ? 'Active &#9679;' : 'Inactive &#9675;';
	} else {
		$cls   = 'gff-dash__toggle' . ( $active ? ' gff-dash__toggle--on' : '' );
		$extra = '';
		$label = $active ? 'Active' : 'Inactive';
	}
	ob_start(); ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline;margin:0;">
		<input type="hidden" name="action" value="gff_client_toggle_active">
		<input type="hidden" name="uid" value="<?php echo $id; ?>">
		<?php wp_nonce_field( 'gff_client_active_' . $id ); ?>
		<button type="submit" class="<?php echo esc_attr( $cls ); ?>"<?php echo $extra; ?>><?php echo $label; ?></button>
	</form>
	<?php return ob_get_clean();
}

/* Internal Notes editor (textarea + Save). Neutral inline styles so it
 * renders fine in both wp-admin and the front-end account page. */
function gff_client_notes_form( $id ) {
	$id    = (int) $id;
	$notes = (string) get_user_meta( $id, 'gff_notes', true );
	ob_start(); ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="margin:0;">
		<input type="hidden" name="action" value="gff_client_save_notes">
		<input type="hidden" name="uid" value="<?php echo $id; ?>">
		<?php wp_nonce_field( 'gff_client_notes_' . $id ); ?>
		<textarea name="gff_notes" rows="2" placeholder="Notes about this client&hellip;" style="width:100%;box-sizing:border-box;border:1px solid #ded9cb;border-radius:8px;padding:6px 8px;font-family:inherit;font-size:12px;"><?php echo esc_textarea( $notes ); ?></textarea>
		<button type="submit" style="margin-top:4px;background:#1c1c1a;color:#fff;border:none;border-radius:12px;padding:4px 12px;font-size:12px;cursor:pointer;">Save notes</button>
	</form>
	<?php return ob_get_clean();
}

add_action( 'admin_post_gff_client_toggle_active', 'gff_client_toggle_active_handler' );
function gff_client_toggle_active_handler() {
	$uid = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	if ( ! gff_can_manage_clients() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'gff_client_active_' . $uid );
	update_user_meta( $uid, 'gff_active', gff_client_is_active( $uid ) ? 'no' : 'yes' );
	gff_client_redirect_back();
}

add_action( 'admin_post_gff_client_save_notes', 'gff_client_save_notes_handler' );
function gff_client_save_notes_handler() {
	$uid = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	if ( ! gff_can_manage_clients() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'gff_client_notes_' . $uid );
	$notes = isset( $_POST['gff_notes'] ) ? sanitize_textarea_field( wp_unslash( $_POST['gff_notes'] ) ) : '';
	update_user_meta( $uid, 'gff_notes', $notes );
	gff_client_redirect_back();
}

function gff_client_redirect_back() {
	$back = wp_get_referer();
	if ( ! $back ) { $back = home_url( '/account/' ); }
	wp_safe_redirect( add_query_arg( 'gff_cnote', 'saved', $back ) );
	exit;
}

/* ============================================================
 * 16. ROUTE PREVIEW + DRIVE TIME (per route group)
 * ============================================================
 * Uses the free OSRM demo router (no API key) to get total drive
 * time + distance + road geometry for an ordered set of stops, then
 * renders a self-contained SVG preview (no external image/tiles).
 * Results cached per ordered-coordinate set in gff_route_dir_cache.
 */

/* Decode an encoded polyline (precision 5) into [[lat,lng],...]. */
function gff_decode_polyline( $str, $precision = 5 ) {
	$index = 0; $lat = 0; $lng = 0; $coords = array();
	$factor = pow( 10, $precision );
	$len = strlen( $str );
	while ( $index < $len ) {
		$shift = 0; $result = 0;
		do { $b = ord( $str[ $index++ ] ) - 63; $result |= ( $b & 0x1f ) << $shift; $shift += 5; } while ( $b >= 0x20 && $index < $len );
		$lat += ( $result & 1 ) ? ~( $result >> 1 ) : ( $result >> 1 );
		$shift = 0; $result = 0;
		do { $b = ord( $str[ $index++ ] ) - 63; $result |= ( $b & 0x1f ) << $shift; $shift += 5; } while ( $b >= 0x20 && $index < $len );
		$lng += ( $result & 1 ) ? ~( $result >> 1 ) : ( $result >> 1 );
		$coords[] = array( $lat / $factor, $lng / $factor );
	}
	return $coords;
}

/* Fetch driving directions (duration/distance/geometry) for origin + stops.
 * $budget by-ref caps new network calls per page load. Cached thereafter. */
function gff_route_directions( $origin_coords, $stops, &$budget ) {
	$pts = array();
	if ( is_array( $origin_coords ) ) { $pts[] = $origin_coords; }
	foreach ( $stops as $s ) { if ( isset( $s['coords'] ) && is_array( $s['coords'] ) ) { $pts[] = $s['coords']; } }
	if ( count( $pts ) < 2 ) { return null; }

	$key   = md5( wp_json_encode( $pts ) );
	$cache = get_option( 'gff_route_dir_cache', array() );
	if ( ! is_array( $cache ) ) { $cache = array(); }
	if ( isset( $cache[ $key ] ) ) { return is_array( $cache[ $key ] ) ? $cache[ $key ] : null; }
	if ( $budget <= 0 ) { return null; }

	$coordstr = implode( ';', array_map( function ( $p ) { return $p[1] . ',' . $p[0]; }, $pts ) );
	$res = wp_remote_get(
		'https://router.project-osrm.org/route/v1/driving/' . $coordstr . '?overview=simplified&geometries=polyline',
		array( 'timeout' => 12, 'headers' => array( 'User-Agent' => 'GawlakFamilyFarms/1.0 (' . get_option( 'admin_email' ) . ')' ) )
	);
	$out = null;
	if ( ! is_wp_error( $res ) ) {
		$b = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! empty( $b['routes'][0] ) ) {
			$r0  = $b['routes'][0];
			$out = array(
				'duration' => (float) $r0['duration'],
				'distance' => (float) $r0['distance'],
				'points'   => isset( $r0['geometry'] ) ? gff_decode_polyline( $r0['geometry'] ) : array(),
			);
		}
	}
	$budget--;
	$cache[ $key ] = $out ? $out : 'none';
	if ( count( $cache ) > 500 ) { $cache = array_slice( $cache, -500, null, true ); }
	update_option( 'gff_route_dir_cache', $cache, false );
	return $out;
}

/* "1 hr 23 min" / "45 min" from seconds. */
function gff_fmt_duration( $sec ) {
	$m = (int) round( $sec / 60 );
	if ( $m < 60 ) { return $m . ' min'; }
	$h = intdiv( $m, 60 ); $mm = $m % 60;
	return $h . ' hr' . ( $mm ? ' ' . $mm . ' min' : '' );
}

/* Self-contained SVG preview: road path + numbered stop pins + origin star. */
function gff_route_preview_svg( $dir, $stops, $origin_coords ) {
	$line = isset( $dir['points'] ) ? $dir['points'] : array();
	if ( count( $line ) < 2 ) { return ''; }
	$all = $line;
	if ( is_array( $origin_coords ) ) { $all[] = $origin_coords; }
	foreach ( $stops as $s ) { if ( isset( $s['coords'] ) && is_array( $s['coords'] ) ) { $all[] = $s['coords']; } }
	$lats = array_column( $all, 0 ); $lngs = array_column( $all, 1 );
	$minLa = min( $lats ); $maxLa = max( $lats ); $minLo = min( $lngs ); $maxLo = max( $lngs );
	$spanLa = max( 1e-6, $maxLa - $minLa ); $spanLo = max( 1e-6, $maxLo - $minLo );
	$W = 600; $H = 300; $pad = 26;
	$proj = function ( $la, $lo ) use ( $minLa, $maxLa, $minLo, $spanLa, $spanLo, $W, $H, $pad ) {
		$x = $pad + ( $lo - $minLo ) / $spanLo * ( $W - 2 * $pad );
		$y = $pad + ( $maxLa - $la ) / $spanLa * ( $H - 2 * $pad );
		return array( round( $x, 1 ), round( $y, 1 ) );
	};
	$d = '';
	foreach ( $line as $i => $p ) { list( $x, $y ) = $proj( $p[0], $p[1] ); $d .= ( $i ? 'L' : 'M' ) . $x . ' ' . $y . ' '; }
	$svg  = '<svg viewBox="0 0 ' . $W . ' ' . $H . '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">';
	$svg .= '<rect width="' . $W . '" height="' . $H . '" fill="#eef3e9" rx="10"/>';
	$svg .= '<path d="' . esc_attr( trim( $d ) ) . '" fill="none" stroke="#1c1c1a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>';
	if ( is_array( $origin_coords ) ) {
		list( $ox, $oy ) = $proj( $origin_coords[0], $origin_coords[1] );
		$svg .= '<circle cx="' . $ox . '" cy="' . $oy . '" r="9" fill="#1c1c1a"/><text x="' . $ox . '" y="' . ( $oy + 3.5 ) . '" font-size="10" fill="#fff" text-anchor="middle" font-family="sans-serif">&#9733;</text>';
	}
	$n = 0;
	foreach ( $stops as $s ) {
		if ( ! isset( $s['coords'] ) || ! is_array( $s['coords'] ) ) { continue; }
		$n++;
		list( $sx, $sy ) = $proj( $s['coords'][0], $s['coords'][1] );
		$svg .= '<circle cx="' . $sx . '" cy="' . $sy . '" r="10" fill="#c75c2e" stroke="#fff" stroke-width="2"/>';
		$svg .= '<text x="' . $sx . '" y="' . ( $sy + 4 ) . '" font-size="11" font-weight="700" fill="#fff" text-anchor="middle" font-family="sans-serif">' . $n . '</text>';
	}
	$svg .= '</svg>';
	return $svg;
}

/* ---- Lead -> Customer conversion (activating a lead promotes it) ---- */
function gff_lead_convert_form( $id, $style = 'front' ) {
	$id  = (int) $id;
	$cls = ( 'admin' === $style ) ? 'button button-small button-primary' : 'gff-dash__mini gff-dash__mini--go';
	ob_start(); ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline;margin:0;">
		<input type="hidden" name="action" value="gff_lead_make_customer">
		<input type="hidden" name="uid" value="<?php echo $id; ?>">
		<?php wp_nonce_field( 'gff_lead_convert_' . $id ); ?>
		<button type="submit" class="<?php echo esc_attr( $cls ); ?>" onclick="return confirm('Convert this lead into a customer?');">Make customer</button>
	</form>
	<?php return ob_get_clean();
}

add_action( 'admin_post_gff_lead_make_customer', 'gff_lead_make_customer_handler' );
function gff_lead_make_customer_handler() {
	$uid = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	if ( ! gff_can_manage_clients() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'gff_lead_convert_' . $uid );
	$u = get_userdata( $uid );
	if ( $u && in_array( 'gff_lead', (array) $u->roles, true ) ) {
		$u->remove_role( 'gff_lead' );
		$u->add_role( 'gff_customer' );
		update_user_meta( $uid, 'gff_active', 'yes' );
		update_user_meta( $uid, 'gff_converted_at', current_time( 'mysql' ) );
	}
	$back = wp_get_referer();
	if ( ! $back ) { $back = home_url( '/account/' ); }
	wp_safe_redirect( add_query_arg( 'gff_cnote', 'converted', $back ) );
	exit;
}

/* ---- Delete a lead/customer (admins only; never an admin or self) ---- */
function gff_client_delete_form( $id, $style = 'front' ) {
	if ( ! current_user_can( 'delete_users' ) ) { return ''; }
	$id    = (int) $id;
	$cls   = ( 'admin' === $style ) ? 'button button-small' : 'gff-dash__mini';
	$extra = ' style="color:#a00;border-color:#e0b4b4;margin-left:8px;"';
	ob_start(); ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline;margin:0;">
		<input type="hidden" name="action" value="gff_client_delete">
		<input type="hidden" name="uid" value="<?php echo $id; ?>">
		<?php wp_nonce_field( 'gff_client_delete_' . $id ); ?>
		<button type="submit" class="<?php echo esc_attr( $cls ); ?>"<?php echo $extra; ?> onclick="return confirm('Permanently delete this person and all their data? This cannot be undone.');">Delete</button>
	</form>
	<?php return ob_get_clean();
}

add_action( 'admin_post_gff_client_delete', 'gff_client_delete_handler' );
function gff_client_delete_handler() {
	$uid = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	if ( ! current_user_can( 'delete_users' ) ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'gff_client_delete_' . $uid );
	$u     = get_userdata( $uid );
	$roles = $u ? (array) $u->roles : array();
	$ok    = $u && $uid !== get_current_user_id()
		&& ! in_array( 'administrator', $roles, true )
		&& ( in_array( 'gff_customer', $roles, true ) || in_array( 'gff_lead', $roles, true ) );
	if ( $ok ) {
		require_once ABSPATH . 'wp-admin/includes/user.php';
		wp_delete_user( $uid );
	}
	$back = wp_get_referer();
	if ( ! $back ) { $back = home_url( '/account/' ); }
	wp_safe_redirect( add_query_arg( 'gff_cnote', $ok ? 'deleted' : 'err', $back ) );
	exit;
}

/* ============================================================
 * 17. TIERS: Lead -> (Paid Client | Free Seeds Customer)
 * ============================================================
 * gff_class meta: 'lead' | 'seed' (Free Seeds = runoff/archive for old
 * leads + churned customers) | 'customer' (paid/active). Everyone stays
 * forever; Free Seeds is the runoff bucket. Paid is set via gff_paid.
 */
function gff_class_of( $id ) {
	$id = (int) $id;
	$cl = get_user_meta( $id, 'gff_class', true );
	if ( in_array( $cl, array( 'lead', 'seed', 'customer' ), true ) ) { return $cl; }
	$addr = trim( (string) get_user_meta( $id, 'gff_service_address', true ) );
	$paid = 'yes' === get_user_meta( $id, 'gff_paid', true ) || 'yes' === get_user_meta( $id, 'gff_reservation_paid', true );
	if ( '' === $addr ) { return 'lead'; }
	return $paid ? 'customer' : 'seed';
}
function gff_class_label( $cl ) {
	$m = array( 'lead' => 'Lead', 'seed' => 'Free Seeds', 'customer' => 'Paid Client' );
	return isset( $m[ $cl ] ) ? $m[ $cl ] : 'Lead';
}
function gff_class_redirect( $note ) {
	$back = wp_get_referer();
	if ( ! $back ) { $back = home_url( '/account/' ); }
	wp_safe_redirect( add_query_arg( 'gff_cnote', $note, $back ) );
	exit;
}

add_action( 'admin_post_gff_client_setclass', 'gff_client_setclass_handler' );
function gff_client_setclass_handler() {
	$uid = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	if ( ! gff_can_manage_clients() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'gff_setclass_' . $uid );
	$to   = isset( $_POST['klass'] ) ? sanitize_key( wp_unslash( $_POST['klass'] ) ) : '';
	$plan = isset( $_POST['plan'] ) ? sanitize_key( wp_unslash( $_POST['plan'] ) ) : '';
	$u    = get_userdata( $uid );
	if ( $u && in_array( $to, array( 'lead', 'seed', 'customer' ), true ) ) {
		update_user_meta( $uid, 'gff_class', $to );
		update_user_meta( $uid, 'gff_paid', ( 'customer' === $to ) ? 'yes' : 'no' );
		if ( 'customer' === $to && in_array( $plan, array( 'sunrise', 'spire', 'both' ), true ) ) {
			update_user_meta( $uid, 'gff_paid_plan', $plan );
			update_user_meta( $uid, 'gff_offer', ( 'spire' === $plan ) ? 'spire' : 'sunrise' ); // both -> sunrise primary
		}
		if ( 'lead' === $to ) {
			if ( ! in_array( 'gff_lead', (array) $u->roles, true ) ) { $u->add_role( 'gff_lead' ); }
			$u->remove_role( 'gff_customer' );
		} else {
			if ( ! in_array( 'gff_customer', (array) $u->roles, true ) ) { $u->add_role( 'gff_customer' ); }
			$u->remove_role( 'gff_lead' );
		}
		gff_class_redirect( 'classed' );
	}
	gff_class_redirect( 'err' );
}

/* One tier-move button. */
function gff_class_btn( $uid, $klass, $label, $style = 'front', $go = false, $plan = '' ) {
	$uid = (int) $uid;
	$cls = ( 'admin' === $style ) ? ( 'button button-small' . ( $go ? ' button-primary' : '' ) ) : ( 'gff-dash__mini' . ( $go ? ' gff-dash__mini--go' : '' ) );
	ob_start(); ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline;margin:0 4px 4px 0;">
		<input type="hidden" name="action" value="gff_client_setclass">
		<input type="hidden" name="uid" value="<?php echo $uid; ?>">
		<input type="hidden" name="klass" value="<?php echo esc_attr( $klass ); ?>">
		<?php if ( '' !== $plan ) : ?><input type="hidden" name="plan" value="<?php echo esc_attr( $plan ); ?>"><?php endif; ?>
		<?php wp_nonce_field( 'gff_setclass_' . $uid ); ?>
		<button type="submit" class="<?php echo esc_attr( $cls ); ?>"><?php echo esc_html( $label ); ?></button>
	</form>
	<?php return ob_get_clean();
}

/* Which paid plan is this customer on: sunrise | spire | both. Derived if unset. */
function gff_paid_plan_of( $id ) {
	$id = (int) $id;
	$p  = get_user_meta( $id, 'gff_paid_plan', true );
	if ( in_array( $p, array( 'sunrise', 'spire', 'both' ), true ) ) { return $p; }
	$offer = get_user_meta( $id, 'gff_offer', true );
	$tower = (int) get_user_meta( $id, 'gff_tower_qty', true ) > 0;
	if ( 'sunrise' === $offer && $tower ) { return 'both'; }
	if ( 'spire' === $offer ) { return 'spire'; }
	return 'sunrise';
}

/* Contextual tier moves. Paid clients pick Sunrise / Spire / Both. */
function gff_class_actions( $id, $style = 'front' ) {
	$k = gff_class_of( $id );
	if ( 'customer' === $k ) {
		$plan = gff_paid_plan_of( $id );
		$out  = '<span class="gff-plan-label">Plan:</span> ';
		$out .= gff_class_btn( $id, 'customer', 'Sunrise', $style, ( 'sunrise' === $plan ), 'sunrise' );
		$out .= gff_class_btn( $id, 'customer', 'Spire', $style, ( 'spire' === $plan ), 'spire' );
		$out .= gff_class_btn( $id, 'customer', 'Both', $style, ( 'both' === $plan ), 'both' );
		$out .= gff_class_btn( $id, 'seed', 'Move to Free Seeds', $style );
		return $out;
	}
	$out  = '<span class="gff-plan-label">Make paid:</span> ';
	$out .= gff_class_btn( $id, 'customer', 'Sunrise', $style, true, 'sunrise' );
	$out .= gff_class_btn( $id, 'customer', 'Spire', $style, true, 'spire' );
	$out .= gff_class_btn( $id, 'customer', 'Both', $style, true, 'both' );
	if ( 'lead' === $k ) { $out .= gff_class_btn( $id, 'seed', 'Move to Free Seeds', $style ); }
	return $out;
}

/* Route on/off toggle button (paid clients with an address). */
function gff_route_toggle_btn( $c ) {
	if ( '' === trim( (string) $c['address'] ) ) { return '<span class="gff-dash__badge">no address</span>'; }
	$uid = (int) $c['id'];
	$on  = 'yes' === get_user_meta( $uid, 'gff_route_active', true );
	ob_start(); ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline;margin:0 4px 4px 0;">
		<input type="hidden" name="action" value="gff_route_toggle">
		<input type="hidden" name="uid" value="<?php echo $uid; ?>">
		<?php wp_nonce_field( 'gff_route_toggle_' . $uid ); ?>
		<button type="submit" class="gff-dash__toggle<?php echo $on ? ' gff-dash__toggle--on' : ''; ?>"><?php echo $on ? 'Route: on' : 'Route: off'; ?></button>
	</form>
	<?php return ob_get_clean();
}

/* One tier section on the front-end dashboard. */
function gff_dash_client_section( $title, $rows, $is_full, $header_extra = '' ) {
	ob_start(); ?>
	<div class="gff-acct__card">
		<h3 class="gff-acct__h3"><?php echo esc_html( $title ); ?> <span class="gff-dash__count"><?php echo count( $rows ); ?></span></h3>
		<?php echo $header_extra; // trusted markup built by the caller ?>
		<?php if ( ! $rows ) : ?>
			<p class="gff-acct__sub">None.</p>
		<?php else : ?>
		<div class="gff-dash__scroll">
		<table class="gff-dash__table">
			<thead><tr><th>Name</th><th>Contact</th><th>Address</th><th>Actions</th></tr></thead>
			<tbody>
			<?php foreach ( $rows as $c ) : $tel = gff_dash_tel( $c['phone'] ); $klass = gff_class_of( $c['id'] );
				$badge = ( 'customer' === $klass ) ? 'Paid · ' . ucfirst( gff_paid_plan_of( $c['id'] ) ) : gff_class_label( $klass ); ?>
				<tr>
					<td><strong><?php echo esc_html( $c['name'] ? $c['name'] : '(no name)' ); ?></strong><br><span class="gff-dash__badge gff-badge--<?php echo esc_attr( $klass ); ?>"><?php echo esc_html( $badge ); ?></span><?php $gff_out = gff_inv_outstanding_total( $c['id'] ); if ( $gff_out > 0 ) : ?> <span class="gff-dash__owed">$<?php echo esc_html( number_format( $gff_out, 2 ) ); ?> open</span><?php endif; ?></td>
					<td><a href="mailto:<?php echo esc_attr( $c['email'] ); ?>"><?php echo esc_html( $c['email'] ); ?></a><?php if ( $tel ) : ?><br><a href="tel:<?php echo esc_attr( $tel ); ?>">Call</a> &middot; <a href="sms:<?php echo esc_attr( $tel ); ?>">Text</a><?php endif; ?></td>
					<td><?php if ( trim( (string) $c['address'] ) !== '' ) { echo esc_html( trim( $c['address'] . ', ' . $c['city'] . ' ' . $c['zip'] ) ); } elseif ( ! empty( $c['lead_city'] ) ) { echo '<em>' . esc_html( $c['lead_city'] ) . '</em>'; } else { echo '&mdash;'; } ?></td>
					<td class="gff-dash__actions">
						<?php
						echo gff_class_actions( $c['id'], 'front' );
						echo gff_garden_invite_btn( $c['id'], 'front' );
						if ( 'customer' === $klass ) {
							if ( $is_full ) { echo gff_dash_invoice_form( $c ); }
						}
						echo gff_client_delete_form( $c['id'], 'front' );
						?>
					</td>
				</tr>
				<tr class="gff-dash__notesrow"><td colspan="4"><?php echo gff_client_plants_html( $c ); echo gff_client_planting_html( $c ); echo gff_client_messages_html( $c['id'] ); echo gff_client_notes_form( $c['id'] ); ?></td></tr>
			<?php endforeach; ?>
			</tbody>
		</table>
		</div>
		<?php endif; ?>
	</div>
	<?php return ob_get_clean();
}

/* ---- Collapsible Plant choices + Messages panels for a client ---- */
function gff_client_plants_html( $c ) {
	$crops  = ( ! empty( $c['crops'] ) && is_array( $c['crops'] ) ) ? $c['crops'] : array();
	$layout = '';
	if ( ! empty( $c['farm_layout'] ) ) {
		$ly = json_decode( $c['farm_layout'], true );
		if ( is_array( $ly ) ) {
			if ( ! empty( $ly['towers'] ) ) {
				foreach ( $ly['towers'] as $tw ) {
					$pl = ! empty( $tw['plants'] ) ? implode( ', ', array_map( 'esc_html', (array) $tw['plants'] ) ) : '(empty)';
					$layout .= '<div><strong>Tower ' . intval( isset( $tw['tower'] ) ? $tw['tower'] : 0 ) . ':</strong> ' . $pl . '</div>';
				}
			} elseif ( ! empty( $ly['seasonal_spots'] ) ) {
				$layout .= '<div><strong>Seasonal bed:</strong> ' . esc_html( implode( ', ', (array) $ly['seasonal_spots'] ) ) . '</div>';
			}
		}
	}
	if ( ! $crops && '' === $layout ) { return ''; }
	$out  = '<details class="gff-dash__ex"><summary>&#127793; Plant choices' . ( $crops ? ' (' . count( $crops ) . ')' : '' ) . '</summary><div class="gff-dash__exbody">';
	if ( $crops ) { $out .= '<div>' . esc_html( implode( ', ', $crops ) ) . '</div>'; }
	$out .= $layout . '</div></details>';
	return $out;
}

/* ---- Planting checklist: one checkbox per crop from the customer's single
 * crop list (gff_crops_wanted, derived from their garden layout). Each toggle
 * autosaves via admin-ajax and stamps the sown date, so staff can leave and
 * come back to exactly where they were. Planted state = gff_crops_planted meta
 * (map of crop => sown date). ---- */
function gff_client_planting_html( $c ) {
	$crops = ( ! empty( $c['crops'] ) && is_array( $c['crops'] ) ) ? array_values( array_unique( array_filter( array_map( 'strval', $c['crops'] ) ) ) ) : array();
	if ( ! $crops ) { return ''; }
	$rid     = (int) $c['id'];
	$planted = get_user_meta( $rid, 'gff_crops_planted', true );
	if ( ! is_array( $planted ) ) { $planted = array(); }
	$done = 0;
	foreach ( $crops as $crop ) { if ( ! empty( $planted[ $crop ] ) ) { $done++; } }
	$nonce = wp_create_nonce( 'gff_crop_toggle_' . $rid );
	ob_start(); ?>
	<details class="gff-dash__ex gff-plant-check" data-uid="<?php echo $rid; ?>" data-nonce="<?php echo esc_attr( $nonce ); ?>">
		<summary>&#127793; Planting checklist (<span class="gff-plant-count"><?php echo (int) $done; ?></span>/<?php echo count( $crops ); ?> sown)</summary>
		<div class="gff-dash__exbody gff-plant-list">
		<?php foreach ( $crops as $crop ) : $on = ! empty( $planted[ $crop ] ); ?>
			<label class="gff-plant-item">
				<input type="checkbox" class="gff-plant-box" data-crop="<?php echo esc_attr( $crop ); ?>" <?php checked( $on ); ?>>
				<span class="gff-plant-name"><?php echo esc_html( $crop ); ?></span>
				<span class="gff-plant-when"><?php echo $on ? esc_html( 'sown ' . mysql2date( 'M j', $planted[ $crop ] ) ) : ''; ?></span>
			</label>
		<?php endforeach; ?>
		</div>
	</details>
	<?php return ob_get_clean();
}

/* Autosave one crop's sown/not-sown state. Staff-enabled, per-customer nonce. */
add_action( 'wp_ajax_gff_crop_toggle', 'gff_crop_toggle_ajax' );
function gff_crop_toggle_ajax() {
	$uid  = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	$crop = isset( $_POST['crop'] ) ? sanitize_text_field( wp_unslash( $_POST['crop'] ) ) : '';
	$on   = isset( $_POST['on'] ) && '1' === (string) $_POST['on'];
	if ( ! gff_can_manage_clients() ) { wp_send_json_error( array( 'msg' => 'not allowed' ), 403 ); }
	if ( ! check_ajax_referer( 'gff_crop_toggle_' . $uid, 'nonce', false ) ) { wp_send_json_error( array( 'msg' => 'bad nonce' ), 400 ); }
	if ( ! $uid || '' === $crop ) { wp_send_json_error( array( 'msg' => 'missing data' ), 400 ); }
	$planted = get_user_meta( $uid, 'gff_crops_planted', true );
	if ( ! is_array( $planted ) ) { $planted = array(); }
	if ( $on ) { $planted[ $crop ] = current_time( 'mysql' ); } else { unset( $planted[ $crop ] ); }
	update_user_meta( $uid, 'gff_crops_planted', $planted );
	$crops = get_user_meta( $uid, 'gff_crops_wanted', true );
	if ( ! is_array( $crops ) ) { $crops = array(); }
	$done = 0;
	foreach ( $crops as $cc ) { if ( ! empty( $planted[ (string) $cc ] ) ) { $done++; } }
	wp_send_json_success( array( 'done' => $done, 'total' => count( $crops ), 'when' => $on ? mysql2date( 'M j', $planted[ $crop ] ) : '' ) );
}
function gff_client_messages_html( $id ) {
	$msgs = get_user_meta( (int) $id, 'gff_acct_messages', true );
	if ( ! is_array( $msgs ) || ! $msgs ) { return ''; }
	$out = '<details class="gff-dash__ex"><summary>&#128172; Messages (' . count( $msgs ) . ')</summary><div class="gff-dash__exbody">';
	foreach ( $msgs as $m ) {
		$t = isset( $m['time'] ) ? $m['time'] : '';
		$out .= '<div class="gff-dash__msg"><span class="gff-dash__msgtime">' . esc_html( $t ) . '</span><br>' . nl2br( esc_html( isset( $m['msg'] ) ? $m['msg'] : '' ) ) . '</div>';
	}
	$out .= '</div></details>';
	return $out;
}

/* ============================================================
 * 18. ZORA GARDEN INVITE — email a token link to pick crops,
 *     saved straight to the customer's account file.
 * ============================================================
 * Admin/staff click "Send garden invite" on a client row -> WP emails a
 * no-login token link to [gff_garden_invite] (put that shortcode on a page
 * with slug 'garden', or set the gff_garden_url option). The customer picks
 * their Zora seasonal-bed plants and saves; writes gff_farm_layout +
 * gff_crops_wanted for their account. Token stored hashed, 30-day expiry.
 */
function gff_garden_token_ok( $uid, $tok ) {
	$uid = (int) $uid; $tok = (string) $tok;
	if ( '' === $tok ) { return false; }
	$stored = (string) get_user_meta( $uid, 'gff_garden_token', true );
	$exp    = (int) get_user_meta( $uid, 'gff_garden_token_exp', true );
	if ( '' === $stored || ! $exp || time() > $exp ) { return false; }
	return hash_equals( $stored, wp_hash( $tok ) );
}

add_shortcode( 'gff_garden_invite', 'gff_sc_garden_invite' );
function gff_sc_garden_invite() {
	$uid = isset( $_GET['g'] ) ? (int) $_GET['g'] : 0;
	$tok = isset( $_GET['t'] ) ? sanitize_text_field( wp_unslash( $_GET['t'] ) ) : '';
	if ( ! $uid || ! gff_garden_token_ok( $uid, $tok ) ) {
		return '<div class="gff-acct"><div class="gff-acct__card"><p class="gff-acct__sub">This garden link is invalid or has expired. Please ask Gawlak Family Farms for a fresh link.</p></div></div>' . gff_acct_styles();
	}
	$user = get_userdata( $uid );
	$name = trim( get_user_meta( $uid, 'first_name', true ) . ' ' . get_user_meta( $uid, 'last_name', true ) );
	if ( '' === $name ) { $name = $user ? $user->display_name : 'there'; }

	$notice = '';
	if ( isset( $_POST['gff_garden_nonce'] )
		&& wp_verify_nonce( sanitize_key( wp_unslash( $_POST['gff_garden_nonce'] ) ), 'gff_garden_' . $uid ) ) {
		$parsed = gff_reg_parse_layout( isset( $_POST['gff_farm_layout'] ) ? $_POST['gff_farm_layout'] : '' );
		if ( $parsed && ! empty( $parsed['flat'] ) ) {
			update_user_meta( $uid, 'gff_farm_layout', wp_json_encode( $parsed['layout'] ) );
			update_user_meta( $uid, 'gff_crops_wanted', $parsed['flat'] );
			update_user_meta( $uid, 'gff_moringa_fruit_upgrade', ! empty( $parsed['moringa_upgrade'] ) ? 'yes' : 'no' );
			$chosen_offer = isset( $parsed['layout']['offer'] ) ? $parsed['layout']['offer'] : '';
			if ( in_array( $chosen_offer, gff_v33_offers(), true ) ) { update_user_meta( $uid, 'gff_offer', $chosen_offer ); }
			gff_garden_notify_owner( $uid, $parsed['flat'] );
			$notice = '<div class="gff-acct__notice gff-acct__notice--ok">Your garden is saved &#127793; We&rsquo;ll plant it on our next visit. You can adjust it any time from this link.</div>';
		} else {
			$notice = '<div class="gff-acct__notice gff-acct__notice--warn">Please add at least one plant to a spot, then save again.</div>';
		}
	}

	$offer = function_exists( 'gff_reg_customer_offer' ) ? gff_reg_customer_offer( $uid ) : '';
	$mode  = ( 'sunrise' === $offer || 'spire' === $offer ) ? $offer : 'both';
	$lead  = ( 'both' === $mode )
		? 'pick your garden style &mdash; a <b>&#127749; Sunrise seasonal bed</b> or <b>&#9889; Spire towers</b> &mdash; then choose your plants and save. We plant exactly what you choose on our next visit.'
		: 'choose what you&rsquo;d like growing, fill your spots, then save. We plant exactly what you pick on our next visit.';
	ob_start(); ?>
	<div class="gff-acct">
		<h2 class="gff-acct__title">&#127749; Your Zora Custom Garden</h2>
		<p class="gff-acct__lead">Hi <?php echo esc_html( $name ); ?> &mdash; <?php echo $lead; // static markup ?></p>
		<?php echo $notice; ?>
		<div class="gff-acct__card">
			<form method="post">
				<?php wp_nonce_field( 'gff_garden_' . $uid, 'gff_garden_nonce' ); ?>
				<?php echo do_shortcode( '[gff_farm_builder mode="' . esc_attr( $mode ) . '" user="' . (int) $uid . '"]' ); ?>
				<button type="submit" class="gff-acct__btn">Save my garden</button>
			</form>
		</div>
	</div>
	<script>
	(function(){
		document.querySelectorAll('.gff-fb-enable').forEach(function(cb){ if(!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change')); } });
	})();
	</script>
	<?php echo gff_acct_styles();
	return ob_get_clean();
}

/* Email the customer their garden-design link. */
function gff_garden_send_email( $to, $name, $link ) {
	$subject = 'Design your Zora custom garden \xF0\x9F\x8C\xB1';
	$body  = '<p>Hi ' . esc_html( $name ) . ',</p>';
	$body .= '<p>It&rsquo;s time to choose what grows in your <strong>Zora custom garden</strong>. Tap below to pick the plants for your seasonal bed&rsquo;s 20 spots &mdash; we&rsquo;ll plant exactly what you choose on our next visit.</p>';
	$body .= '<p><a href="' . esc_url( $link ) . '" style="display:inline-block;background:#1c1c1a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:24px;font-weight:600;">&#127793; Choose my garden plants</a></p>';
	$body .= '<p style="font-size:13px;color:#666;">Or paste this link into your browser:<br>' . esc_html( $link ) . '</p>';
	$body .= '<p>&mdash; Gawlak Family Farms</p>';
	$headers = array( 'Content-Type: text/html; charset=UTF-8' );
	$owner   = get_option( 'gff_reg_msg_recipient', 'martingawlak@gmail.com' );
	if ( is_email( $owner ) ) { $headers[] = 'Reply-To: Gawlak Family Farms <' . $owner . '>'; }
	return wp_mail( $to, $subject, $body, $headers );
}

/* Notify the owner when a customer saves their garden. */
function gff_garden_notify_owner( $uid, $flat ) {
	$user = get_userdata( $uid );
	if ( ! $user ) { return; }
	$to = get_option( 'gff_reg_msg_recipient', 'martingawlak@gmail.com' );
	if ( ! is_email( $to ) ) { $to = 'martingawlak@gmail.com'; }
	$name = trim( get_user_meta( $uid, 'first_name', true ) . ' ' . get_user_meta( $uid, 'last_name', true ) );
	if ( '' === $name ) { $name = $user->display_name; }
	$list = is_array( $flat ) ? implode( ', ', array_map( 'esc_html', $flat ) ) : '';
	$body = '<p><strong>' . esc_html( $name ) . '</strong> saved their Zora custom garden via the invite link.</p>';
	$body .= '<p><strong>Plants:</strong> ' . $list . '</p><p>Email: ' . esc_html( $user->user_email ) . '</p>';
	wp_mail( $to, 'Garden chosen: ' . $name, $body, array( 'Content-Type: text/html; charset=UTF-8' ) );
}

add_action( 'admin_post_gff_send_garden_invite', 'gff_send_garden_invite_handler' );
function gff_send_garden_invite_handler() {
	$uid = isset( $_POST['uid'] ) ? (int) $_POST['uid'] : 0;
	if ( ! gff_can_manage_clients() ) { wp_die( 'Not allowed.' ); }
	check_admin_referer( 'gff_garden_invite_' . $uid );
	$user = get_userdata( $uid );
	$ok   = false;
	if ( $user && is_email( $user->user_email ) ) {
		$tok = wp_generate_password( 24, false );
		update_user_meta( $uid, 'gff_garden_token', wp_hash( $tok ) );
		update_user_meta( $uid, 'gff_garden_token_exp', time() + 30 * DAY_IN_SECONDS );
		$base = get_option( 'gff_garden_url', home_url( '/garden/' ) );
		$link = add_query_arg( array( 'g' => $uid, 't' => $tok ), $base );
		$name = trim( get_user_meta( $uid, 'first_name', true ) . ' ' . get_user_meta( $uid, 'last_name', true ) );
		if ( '' === $name ) { $name = $user->display_name; }
		$ok = gff_garden_send_email( $user->user_email, $name, $link );
	}
	gff_class_redirect( $ok ? 'invited' : 'err' );
}

/* "Send garden invite" button for a client row. */
function gff_garden_invite_btn( $uid, $style = 'front' ) {
	$uid = (int) $uid;
	$cls = ( 'admin' === $style ) ? 'button button-small' : 'gff-dash__mini';
	ob_start(); ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline;margin:0 4px 4px 0;">
		<input type="hidden" name="action" value="gff_send_garden_invite">
		<input type="hidden" name="uid" value="<?php echo $uid; ?>">
		<?php wp_nonce_field( 'gff_garden_invite_' . $uid ); ?>
		<button type="submit" class="<?php echo esc_attr( $cls ); ?>" style="color:#2f6b39;border-color:#bcd6ea;" onclick="return confirm('Email this customer their garden-design link?');">&#127793; Send garden invite</button>
	</form>
	<?php return ob_get_clean();
}

/* ============================================================
 * 33. START SERVICE + RECURRING INVOICE ENGINE  (v3.33)
 * ------------------------------------------------------------
 * "Start Service" button on the user profile:
 *   1. Invoices the build balance  ($550 build - $250 consult credit = $300)
 *   2. Starts a 30-day recurring $300 invoice cycle
 *
 * Auto-SEND, not auto-CHARGE. Each cycle generates and emails a real
 * invoice; the customer pays it via the existing payment links. There is
 * no stored card and no charge without a human action, by design.
 *
 * Reuses the existing invoice engine (numbering, rollback, email builder,
 * log) so cron invoices are identical to hand-sent ones.
 * ============================================================ */

/* Valid offers. 'both' = start with a Sunrise bed AND three Spires on day one.
 * Every farm converges on both anyway via the Propagation Program; this just
 * lets a customer skip the wait. Single source of truth for all validation. */
function gff_v33_offers() { return array( 'sunrise', 'spire', 'both' ); }

/* ---- Pricing (single source of truth) ---- */
function gff_v33_monthly()        { return 300.00; } // $/mo, both offers
function gff_v33_consult()        { return 250.00; } // design consult, credited
function gff_v33_start_total()     { return 772.00; } // full starter: consult + design + build + install + month one + herbs + propagation + shirt
function gff_v33_cycle_days()     { return 30; }     // days between invoices

/* Build balance = build fee minus the consult credit they already paid.
 * If they never paid a consult, they owe the full build. */
function gff_v33_build_balance( $user_id ) {
	$credit = ( 'yes' === get_user_meta( $user_id, 'gff_consult_paid', true ) ) ? gff_v33_consult() : 0.00;
	$bal    = gff_v33_start_total() - $credit;
	return $bal > 0 ? $bal : 0.00;
}

/* ---- Cron ---- */
add_action( 'gff_v33_cron', 'gff_v33_run_cycle' );

function gff_v33_schedule_cron() {
	if ( ! wp_next_scheduled( 'gff_v33_cron' ) ) {
		wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'gff_v33_cron' );
	}
}
add_action( 'init', 'gff_v33_schedule_cron' );

/* Clean up on deactivate. */
function gff_v33_unschedule_cron() {
	$ts = wp_next_scheduled( 'gff_v33_cron' );
	if ( $ts ) { wp_unschedule_event( $ts, 'gff_v33_cron' ); }
}

/* ---- Daily sweep: invoice anyone whose next invoice is due ---- */
function gff_v33_run_cycle() {
	$users = get_users( array(
		'meta_key'   => 'gff_service_active',
		'meta_value' => 'yes',
		'fields'     => 'ID',
		'number'     => 200,
	) );
	if ( empty( $users ) ) { return; }

	$now = current_time( 'timestamp' );

	foreach ( $users as $uid ) {
		$due = (int) get_user_meta( $uid, 'gff_next_invoice_ts', true );
		if ( ! $due || $due > $now ) { continue; }

		$sent = gff_v33_send_invoice(
			$uid,
			gff_v33_monthly(),
			'Monthly service — weekly visits, planting, maintenance, seasonal replanting.'
		);

		// Advance the clock only on a successful send; a failed send retries
		// tomorrow rather than silently skipping the month.
		if ( $sent ) {
			update_user_meta( $uid, 'gff_next_invoice_ts', $now + ( gff_v33_cycle_days() * DAY_IN_SECONDS ) );
			$count = (int) get_user_meta( $uid, 'gff_invoice_cycles', true );
			update_user_meta( $uid, 'gff_invoice_cycles', $count + 1 );
		}
	}
}

/* ---- Shared sender. Wraps the existing engine so cron and manual sends
 *      produce identical invoices, numbering, and log entries. ---- */
function gff_v33_send_invoice( $user_id, $amount, $overview ) {
	$user = get_userdata( $user_id );
	if ( ! $user || ! is_email( $user->user_email ) ) { return false; }

	$amount = number_format( (float) $amount, 2, '.', '' );

	$invoice_number = gff_reg_next_invoice_number( $user_id );
	$body           = gff_reg_build_invoice_email( $user, $amount, $overview, $invoice_number );
	$subject        = 'Your Gawlak Family Farms invoice — $' . $amount;
	$headers        = array( 'Content-Type: text/html; charset=UTF-8' );

	$sent = wp_mail( $user->user_email, $subject, $body, $headers );

	if ( $sent ) {
		update_user_meta( $user_id, 'gff_inv_number', $invoice_number );
		update_user_meta( $user_id, 'gff_inv_last_sent', current_time( 'mysql' ) . ' — $' . $amount . ' — ' . $invoice_number );
		if ( function_exists( 'gff_inv_log_add' ) ) {
			gff_inv_log_add( $user_id, $invoice_number, $amount, $overview );
		}
		return true;
	}

	gff_reg_rollback_invoice_number(); // don't burn a number on a failed send
	return false;
}

/* ---- Admin UI on the user profile ---- */
add_action( 'show_user_profile', 'gff_v33_profile_ui' );
add_action( 'edit_user_profile', 'gff_v33_profile_ui' );
function gff_v33_profile_ui( $user ) {
	if ( ! current_user_can( 'edit_users' ) ) { return; }
	$uid = (int) $user->ID;

	$active       = 'yes' === get_user_meta( $uid, 'gff_service_active', true );
	$consult_paid = 'yes' === get_user_meta( $uid, 'gff_consult_paid', true );
	$next_ts      = (int) get_user_meta( $uid, 'gff_next_invoice_ts', true );
	$cycles       = (int) get_user_meta( $uid, 'gff_invoice_cycles', true );
	$balance      = gff_v33_build_balance( $uid );
	?>
	<h2>Service &amp; Billing</h2>
	<table class="form-table" role="presentation">
		<tr>
			<th scope="row">Consult credit</th>
			<td>
				<label>
					<input type="checkbox" name="gff_consult_paid" value="yes" <?php checked( $consult_paid ); ?>>
					$250 design consult paid
				</label>
				<p class="description">Credited against the $550 build. Tick this once PayPal confirms.</p>
			</td>
		</tr>
		<tr>
			<th scope="row">Status</th>
			<td>
				<?php if ( $active ) : ?>
					<strong style="color:#2F6B39;">Active</strong> &mdash;
					<?php echo (int) $cycles; ?> invoice<?php echo 1 === $cycles ? '' : 's'; ?> sent.
					<?php if ( $next_ts ) : ?>
						Next: <strong><?php echo esc_html( date_i18n( 'M j, Y', $next_ts ) ); ?></strong>
						($<?php echo esc_html( number_format( gff_v33_monthly(), 2 ) ); ?>)
					<?php endif; ?>
				<?php else : ?>
					<em>Not started.</em>
				<?php endif; ?>
			</td>
		</tr>

		<?php if ( ! $active ) : ?>
		<tr>
			<th scope="row">Start service</th>
			<td>
				<?php wp_nonce_field( 'gff_v33_start_' . $uid, 'gff_v33_start_nonce' ); ?>
				<p>
					Starter $<?php echo esc_html( number_format( gff_v33_start_total(), 2 ) ); ?>
					<?php if ( $consult_paid ) : ?>
						&minus; $<?php echo esc_html( number_format( gff_v33_consult(), 2 ) ); ?> consult credit
					<?php endif; ?>
					= <strong>$<?php echo esc_html( number_format( $balance, 2 ) ); ?> due now.</strong>
				</p>
				<button type="submit" name="gff_v33_start" value="1" class="button button-primary">
					Start Service &mdash; invoice $<?php echo esc_html( number_format( $balance, 2 ) ); ?>
				</button>
				<p class="description">
					Emails the build invoice now, then automatically emails a
					$<?php echo esc_html( number_format( gff_v33_monthly(), 2 ) ); ?> invoice every
					<?php echo (int) gff_v33_cycle_days(); ?> days. Invoices are sent, not charged.
				</p>
			</td>
		</tr>
		<?php else : ?>
		<tr>
			<th scope="row">Stop billing</th>
			<td>
				<?php wp_nonce_field( 'gff_v33_stop_' . $uid, 'gff_v33_stop_nonce' ); ?>
				<button type="submit" name="gff_v33_stop" value="1" class="button">
					Stop recurring invoices
				</button>
				<p class="description">Halts the cycle. Does not cancel the agreement or delete history.</p>
			</td>
		</tr>
		<?php endif; ?>
	</table>
	<?php
}

/* ---- Handlers ---- */
add_action( 'edit_user_profile_update', 'gff_v33_handle_profile' );
add_action( 'personal_options_update',  'gff_v33_handle_profile' );
function gff_v33_handle_profile( $user_id ) {
	if ( ! current_user_can( 'edit_users' ) ) { return; }
	$user_id = (int) $user_id;

	// Consult-paid flag saves on every profile update.
	if ( isset( $_POST['gff_v33_start_nonce'] ) || isset( $_POST['gff_v33_stop_nonce'] ) ) {
		update_user_meta( $user_id, 'gff_consult_paid', isset( $_POST['gff_consult_paid'] ) ? 'yes' : 'no' );
	}

	// START
	if ( ! empty( $_POST['gff_v33_start'] ) ) {
		if ( ! isset( $_POST['gff_v33_start_nonce'] )
			|| ! wp_verify_nonce( sanitize_key( wp_unslash( $_POST['gff_v33_start_nonce'] ) ), 'gff_v33_start_' . $user_id ) ) {
			return;
		}
		if ( 'yes' === get_user_meta( $user_id, 'gff_service_active', true ) ) { return; } // already running

		$balance = gff_v33_build_balance( $user_id );

		$overview = 'Design, build, and install — soil, plants, structure, installation. Includes your first month of service, complimentary herbs, enrollment in the Propagation Program, and one apparel item.';
		if ( $balance < gff_v33_start_total() ) {
			$overview .= ' Your $' . number_format( gff_v33_consult(), 2 ) . ' design consult has been credited in full.';
		}

		$sent = gff_v33_send_invoice( $user_id, $balance, $overview );
		if ( ! $sent ) { return; } // don't start the clock on a failed send

		update_user_meta( $user_id, 'gff_service_active',  'yes' );
		update_user_meta( $user_id, 'gff_service_started', current_time( 'mysql' ) );
		update_user_meta( $user_id, 'gff_invoice_cycles',  1 );

		// First month is inside the build fee, so the next invoice is one
		// full cycle out — the customer never pays for a month with nothing
		// growing in it.
		update_user_meta( $user_id, 'gff_next_invoice_ts', current_time( 'timestamp' ) + ( gff_v33_cycle_days() * DAY_IN_SECONDS ) );

		// Propagation clock: first free Spire + first donated module at 12 months.
		update_user_meta( $user_id, 'gff_propagation_due', current_time( 'timestamp' ) + YEAR_IN_SECONDS );
	}

	// STOP
	if ( ! empty( $_POST['gff_v33_stop'] ) ) {
		if ( ! isset( $_POST['gff_v33_stop_nonce'] )
			|| ! wp_verify_nonce( sanitize_key( wp_unslash( $_POST['gff_v33_stop_nonce'] ) ), 'gff_v33_stop_' . $user_id ) ) {
			return;
		}
		update_user_meta( $user_id, 'gff_service_active', 'no' );
		delete_user_meta( $user_id, 'gff_next_invoice_ts' );
	}
}

register_deactivation_hook( __FILE__, 'gff_v33_unschedule_cron' );

/* ============================================================
 * 34. FRICTIONLESS START  [gff_start]  (v3.34)
 * ------------------------------------------------------------
 * One checkbox, one button. No name, no email, no address.
 *
 *   1. Customer ticks "I accept the Service Agreement (v6.0)"
 *   2. Button unlocks
 *   3. Click → we record consent (agreement version + timestamp + IP),
 *      then redirect to PayPal for the $250 design consult
 *   4. PayPal returns their name + email. Everything else — service
 *      address, phone, crops, involvement, shirt size — comes on the call.
 *
 * The checkbox is NOT decoration. It is the only record that the customer
 * accepted the land-access license (§5) and the 24-month vesting terms
 * (§3/§6). Consent is written BEFORE the redirect, so a completed payment
 * always has an acceptance behind it.
 *
 * Consent for logged-out visitors is stored as an option row keyed by a
 * random token, then claimed and moved onto the user record when the
 * account is created. Nothing is lost if they pay first and register later.
 * ============================================================ */

function gff_v34_paypal_url() { return 'https://www.paypal.com/ncp/payment/XJYNQSNDSDE5S'; } // $250 design consult
function gff_v34_consult()    { return '250'; }

/* ---- [gff_start offer="sunrise|spire|both"] ---- */
add_shortcode( 'gff_start', 'gff_sc_start' );
function gff_sc_start( $atts = array() ) {
	$a = shortcode_atts( array(
		'offer'  => '',                       // optional; blank = carried from the page toggle
		'label'  => 'Start — $' . gff_v34_consult(),
		'note'   => 'Credited in full toward your $772 start. We&rsquo;ll call within 24 hours to book your consult.',
	), $atts, 'gff_start' );

	$offer = in_array( $a['offer'], gff_v33_offers(), true ) ? $a['offer'] : '';
	$nonce = wp_create_nonce( 'gff_v34_start' );

	ob_start(); ?>
	<div class="gff-start" data-gff-section="start">
		<label class="gff-check gff-start__agree">
			<input type="checkbox" id="gff_v34_agree">
			<span>
				I have read and accept the Gawlak Family Farms Service Agreement
				(v<?php echo esc_html( gff_reg_agreement_version() ); ?>).
			</span>
		</label>

		<button type="button" class="gff-start__btn" id="gff_v34_btn" disabled
			data-nonce="<?php echo esc_attr( $nonce ); ?>"
			data-offer="<?php echo esc_attr( $offer ); ?>"
			data-ajax="<?php echo esc_url( admin_url( 'admin-ajax.php' ) ); ?>"
			data-paypal="<?php echo esc_url( gff_v34_paypal_url() ); ?>">
			<?php echo esc_html( $a['label'] ); ?>
		</button>

		<p class="gff-start__note"><?php echo wp_kses_post( $a['note'] ); ?></p>
	</div>

	<script>
	(function(){
		var cb  = document.getElementById('gff_v34_agree');
		var btn = document.getElementById('gff_v34_btn');
		if ( ! cb || ! btn ) { return; }

		cb.addEventListener('change', function(){ btn.disabled = ! cb.checked; });

		btn.addEventListener('click', function(){
			if ( ! cb.checked || btn.dataset.sent === '1' ) { return; }
			btn.dataset.sent = '1';
			btn.disabled = true;

			// Offer: explicit attr, else whatever the page toggle set, else blank.
			var offer = btn.dataset.offer;
			if ( ! offer ) {
				var f = document.getElementById('gff_offer_field')
					|| document.querySelector('input[name="gff_offer"]');
				if ( f && f.value ) { offer = f.value; }
			}

			var body = new URLSearchParams();
			body.append('action', 'gff_v34_consent');
			body.append('nonce', btn.dataset.nonce);
			body.append('offer', offer || '');

			// Record consent, THEN go to PayPal. If the request fails we still
			// send them — but we do not want a silent no-consent payment, so a
			// failure is logged server-side on return.
			fetch(btn.dataset.ajax, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: body.toString()
			})
			.then(function(r){ return r.json(); })
			.then(function(j){
				var url = btn.dataset.paypal;
				if ( j && j.data && j.data.token ) {
					try { localStorage.setItem('gff_consent_token', j.data.token); } catch(e){}
				}
				if ( typeof gtag === 'function' ) {
					gtag('event','begin_checkout',{event_category:'gff_funnel',value:<?php echo (int) gff_v34_consult(); ?>});
				}
				window.location.href = url;
			})
			.catch(function(){
				window.location.href = btn.dataset.paypal;
			});
		});
	})();
	</script>
	<?php return ob_get_clean();
}

/* ---- Record consent (logged in or out) ---- */
add_action( 'wp_ajax_gff_v34_consent',        'gff_v34_record_consent' );
add_action( 'wp_ajax_nopriv_gff_v34_consent', 'gff_v34_record_consent' );
function gff_v34_record_consent() {
	check_ajax_referer( 'gff_v34_start', 'nonce' );

	$offer = sanitize_key( wp_unslash( $_POST['offer'] ?? '' ) );
	if ( ! in_array( $offer, gff_v33_offers(), true ) ) { $offer = ''; }

	$record = array(
		'agreed'     => 'yes',
		'version'    => gff_reg_agreement_version(),
		'time'       => current_time( 'mysql' ),
		'offer'      => $offer,
		'ip'         => gff_v34_client_ip(),
		'user_agent' => substr( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ?? '' ) ), 0, 250 ),
	);

	$uid = get_current_user_id();

	if ( $uid ) {
		update_user_meta( $uid, 'gff_agree',           'yes' );
		update_user_meta( $uid, 'gff_agree_record',    $record );
		update_user_meta( $uid, 'gff_reservation',     'consult' );
		if ( $offer ) { update_user_meta( $uid, 'gff_offer', $offer ); }
		wp_send_json_success( array( 'token' => '' ) );
	}

	// Logged out: park the consent under a random token. Claimed at
	// registration, or readable from the admin queue if they never register.
	$token = wp_generate_password( 20, false, false );
	set_transient( 'gff_consent_' . $token, $record, 60 * DAY_IN_SECONDS );
	gff_v34_queue_add( $token, $record );

	wp_send_json_success( array( 'token' => $token ) );
}

function gff_v34_client_ip() {
	$ip = $_SERVER['REMOTE_ADDR'] ?? '';
	return sanitize_text_field( wp_unslash( $ip ) );
}

/* ---- Pending-consent queue: signed but not yet matched to a customer ---- */
function gff_v34_queue_add( $token, $record ) {
	$q = get_option( 'gff_consent_queue', array() );
	if ( ! is_array( $q ) ) { $q = array(); }
	$q[ $token ] = $record;
	if ( count( $q ) > 200 ) { $q = array_slice( $q, -200, null, true ); } // keep it bounded
	update_option( 'gff_consent_queue', $q, false );
}

function gff_v34_queue_claim( $user_id, $token ) {
	$record = get_transient( 'gff_consent_' . $token );
	if ( ! $record ) { return false; }

	update_user_meta( $user_id, 'gff_agree',        'yes' );
	update_user_meta( $user_id, 'gff_agree_record', $record );
	update_user_meta( $user_id, 'gff_reservation',  'consult' );
	if ( ! empty( $record['offer'] ) ) { update_user_meta( $user_id, 'gff_offer', $record['offer'] ); }

	delete_transient( 'gff_consent_' . $token );
	$q = get_option( 'gff_consent_queue', array() );
	unset( $q[ $token ] );
	update_option( 'gff_consent_queue', $q, false );
	return true;
}

/* ---- Admin: show consents that have no customer attached yet ---- */
add_action( 'admin_notices', 'gff_v34_pending_notice' );
function gff_v34_pending_notice() {
	if ( ! current_user_can( 'edit_users' ) ) { return; }
	$q = get_option( 'gff_consent_queue', array() );
	if ( empty( $q ) || ! is_array( $q ) ) { return; }

	$n = count( $q );
	echo '<div class="notice notice-warning"><p><strong>Gawlak Family Farms:</strong> '
		. esc_html( $n ) . ' agreement acceptance' . ( 1 === $n ? '' : 's' )
		. ' with no customer record yet. These people accepted the agreement and were sent to PayPal &mdash; '
		. 'check PayPal for payment, then create their account and call them for the service address.</p>';

	echo '<ul style="margin:0 0 8px 14px;list-style:disc;">';
	foreach ( array_slice( array_reverse( $q, true ), 0, 10, true ) as $tok => $r ) {
		echo '<li><code>' . esc_html( substr( $tok, 0, 8 ) ) . '</code> &mdash; '
			. esc_html( $r['time'] ?? '' )
			. ( ! empty( $r['offer'] ) ? ' &mdash; ' . esc_html( ucfirst( $r['offer'] ) ) : '' )
			. ' &mdash; v' . esc_html( $r['version'] ?? '' )
			. ' &mdash; ' . esc_html( $r['ip'] ?? '' )
			. '</li>';
	}
	echo '</ul></div>';
}

/* ============================================================
 * 35. [gff_convince] — the collapsible objection-handler  (v3.37)
 * ------------------------------------------------------------
 * Collapsed by default. Only the curious open it, which is exactly why
 * the copy inside can be blunt — it never costs a cautious visitor.
 *
 * v3.37: reworked to address BOTH Sunrise (yard) and Spire (no-yard)
 * customers. Old opener ("Your yard is already a farm") silently excluded
 * apartment/mobile-home buyers; new spine is "your home already provides —
 * this makes it provide more," which holds for any dwelling. Lead is the
 * done-for-you ease (impulse driver) followed by the ownership/homestead
 * payoff. Table rows 1-3 lean yard-owner; row 4 pulls the no-room buyer
 * back in.
 *
 * The comparison table is your home vs ITSELF, not against a competitor's
 * price. Nothing here for a prospect to price-shop against.
 *
 * Lives in the plugin rather than as raw HTML in Beaver Builder so the
 * table markup can't get rewritten by the page builder.
 * ============================================================ */

add_shortcode( 'gff_convince', 'gff_sc_convince' );
function gff_sc_convince( $atts = array() ) {
	$a = shortcode_atts( array(
		'label' => 'Talk me into this.',
		'open'  => 'no',   // 'yes' to render expanded
	), $atts, 'gff_convince' );

	$open = ( 'yes' === strtolower( $a['open'] ) ) ? ' open' : '';

	ob_start(); ?>
	<style>
		.gff-convince{border:1px solid #dfe3ea;border-radius:8px;margin:22px 0;background:#fafaf7;}
		.gff-convince>summary{cursor:pointer;padding:14px 18px;font-weight:700;color:#2f6b39;list-style:none;
			display:flex;align-items:center;gap:8px;font-size:16px;}
		.gff-convince>summary::-webkit-details-marker{display:none;}
		.gff-convince>summary::before{content:"\25B8";display:inline-block;transition:transform .18s ease;color:#9a9a94;}
		.gff-convince[open]>summary::before{transform:rotate(90deg);}
		.gff-convince>summary:hover{background:#f2f8ee;border-radius:7px;}
		.gff-convince__body{padding:4px 18px 18px;}
		.gff-convince__body p{margin:0 0 12px;line-height:1.55;}
		.gff-convince__body p strong{color:#1c1c1a;}
		.gff-convince__table{width:100%;border-collapse:collapse;margin:16px 0 12px;font-size:15px;}
		.gff-convince__table th{text-align:left;padding:9px 10px;border-bottom:2px solid #2f6b39;
			font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#2f6b39;}
		.gff-convince__table td{padding:9px 10px;border-bottom:1px solid #e4e2da;}
		.gff-convince__table td:last-child{color:#2f6b39;font-weight:600;background:#f6fbf3;}
		.gff-convince__kicker{margin-top:14px;font-weight:700;color:#2f6b39;font-size:16px;}
		@media(max-width:520px){.gff-convince__table{font-size:13px;}.gff-convince__table th,.gff-convince__table td{padding:7px 6px;}}
	</style>

	<details class="gff-convince"<?php echo $open; ?>>
		<summary><?php echo esc_html( $a['label'] ); ?></summary>
		<div class="gff-convince__body">

			<p><strong>A working farm at your home &mdash; and you don&rsquo;t lift a finger.</strong></p>

			<p>Someone shows up every week to plant it, tend it, and keep it alive. You don&rsquo;t dig, weed, water,
			or learn how &mdash; unless you want to. It arrives already working and stays that way.</p>

			<p><strong>It comes with a farmer. But the harvest is yours, the food is yours, the homestead is yours.</strong>
			You&rsquo;re not paying for a service you watch happen &mdash; you&rsquo;re living on land that finally feeds you.</p>

			<p>Your home already provides for you. This makes it provide more &mdash; without requiring anything of you.</p>

			<p><strong>Two ways to grow it, depending on your space.</strong> The Zora Sunrise Module is an in-ground
			food forest for properties with yard or open ground &mdash; vegetables, herbs, and fruit, up to 1,500 sq ft,
			built around what your family eats. Spire Towers grow the same fresh food vertically, for patios, balconies,
			mobile homes, or tight spaces &mdash; no yard required. Same service. Same $300 a month.
			We shape it to the space you have.</p>

			<table class="gff-convince__table">
				<thead>
					<tr><th>Your home now</th><th>Your home with us</th></tr>
				</thead>
				<tbody>
					<tr><td>Lawn costs money to keep cut</td><td>Can replace your entire lawn with food</td></tr>
					<tr><td>A lawn service bill every month</td><td>Can replace your lawn service bill</td></tr>
					<tr><td>Food comes from a truck</td><td>Supper comes from your soil</td></tr>
					<tr><td>Not enough room to farm</td><td>Vertical farming with our Spires</td></tr>
					<tr><td>Chemicals, usually</td><td>None</td></tr>
					<tr><td>Cost of everything goes up every year</td><td>A free tower added every year</td></tr>
					<tr><td>A place you live</td><td>A homestead</td></tr>
				</tbody>
			</table>

			<p class="gff-convince__kicker">The home you already have, making more of what you already pay for.</p>

		</div>
	</details>
	<?php return ob_get_clean();
}
