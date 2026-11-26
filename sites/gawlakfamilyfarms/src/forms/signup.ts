/**
 * The other sign-up posts: gff_reg_handle_submit( 'full' | 'lead' ) and
 * gff_reg_handle_tower(). Ported line for line; checked by the actions bench.
 *
 * Intended differences (MIGRATION.md): the full flow's password fields
 * (gff_pass / gff_pass2) left the form and are ignored — no password is
 * checked or stored, the person signs in through the shared accounts
 * service; new users are created by email with no password.
 */
import { type AjaxCtx, p, pa } from "../ajax";
import { meta, setMeta } from "../ctx";
import { loginUrl } from "../ctx";
import { esc, escUrl, numberFormat, phpInt, phpJson, phpRound, truthy } from "../php";
import { isEmail, sanitizeEmail, sanitizeKey, sanitizeTextField } from "../wpfn";
import { currentMysql, emailExists, getUserBy, insertUser, isWPError, newUserNotification } from "../wpcore";
import { addons, agreementVersion, allCrops, bundle, offers, reservationMeta, towerCrosssellPct, towerFirstPrice, towerFoodValue, towerMax, towerTotal } from "./catalog";
import { alert, entityDecode, flagRepop, isArr, notEmpty, parseLayout, sendThreeSistersEmail, uniqueUsername } from "./express";

/** number_format( $n, 2, '.', '' ). */
const fmt2 = (n: number) => numberFormat(n, 2).replace(/,/g, "");
/** is_numeric(). */
const isNumeric = (s: string) => /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(s);
/** rtrim( rtrim( $amt, '0' ), '.' ) */
const trimAmount = (a: string) => a.replace(/0+$/, "").replace(/\.+$/, "");

/** The picked add-ons (the bundle replaces individuals) from $_POST['gff_addons']. */
function pickAddons(c: AjaxCtx): string[] {
  const catalog = addons();
  let picked: string[] = [];
  const ads = pa(c, "gff_addons");
  if (ads && ads.length) {
    for (const x of ads) { const ad = sanitizeKey(x); if (ad === "bundle" || catalog[ad] !== undefined) picked.push(ad); }
    picked = [...new Set(picked)];
    if (picked.includes("bundle")) picked = ["bundle"];
  }
  return picked;
}
/** The total and labels of the picked add-ons. */
function addonSums(picked: string[]): { total: number; labels: string[] } {
  const catalog = addons();
  let total = 0;
  const labels: string[] = [];
  if (picked.includes("bundle")) {
    const b = bundle();
    total = b.price;
    labels.push(entityDecode(b.power) + " (" + b.name + ", $" + b.price + ")");
  } else {
    for (const ad of picked) {
      const a = catalog[ad];
      if (a) { total += a.price; labels.push(entityDecode(a.power) + " (" + a.name + ", $" + a.price + ")"); }
    }
  }
  return { total, labels };
}
/** The crops checked from $_POST['gff_crops'] that are on the list. */
function pickCrops(c: AjaxCtx): string[] {
  const all = allCrops();
  const picked: string[] = [];
  const crops = pa(c, "gff_crops");
  if (crops && crops.length) for (const x of crops) { const cr = sanitizeTextField(x); if (all.includes(cr)) picked.push(cr); }
  return picked;
}
const workshopInterest = (c: AjaxCtx) => (c.post.gff_workshop_interest !== undefined && sanitizeKey(p(c, "gff_workshop_interest")) === "yes" ? "yes" : "no");
const modalScript = '<script>(function(){var m=document.getElementById("gff-pay-modal");if(!m)return;'
  + "if(m.parentNode!==document.body){document.body.appendChild(m);}"
  + 'var open=function(){m.hidden=false;document.body.style.overflow="hidden";};'
  + 'var close=function(){m.hidden=true;document.body.style.overflow="";};'
  + 'm.querySelectorAll("[data-gff-modal-close]").forEach(function(el){el.addEventListener("click",close);});'
  + 'document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!m.hidden)close();});'
  + "setTimeout(open,600);})();</script>";

/** gff_reg_handle_submit( $mode ): the full enrollment, or the lead form. */
export async function handleSubmit(c: AjaxCtx, mode: "full" | "lead"): Promise<string> {
  const nonceField = mode === "full" ? "gff_reg_nonce" : "gff_lead_nonce";
  if (c.post[nonceField] === undefined) return alert("error", "Security check failed. Please reload the page and try again.");
  if (notEmpty(c.post.gff_company_url)) return alert("error", "Submission blocked.");

  const first = sanitizeTextField(p(c, "gff_first"));
  const last = sanitizeTextField(p(c, "gff_last"));
  const email = sanitizeEmail(p(c, "gff_email"));
  const phone = sanitizeTextField(p(c, "gff_phone"));
  const city = sanitizeTextField(p(c, "gff_city"));

  if (mode === "lead") {
    const errors: string[] = [];
    if (first === "" || last === "") errors.push("Please enter your first and last name.");
    if (!isEmail(email)) errors.push("Please enter a valid email address.");
    if (phone === "") errors.push("Please enter your phone number.");
    if (city === "") errors.push("Please enter your city.");
    if (errors.length) return alert("error", errors.map((e) => esc(e)).join("<br>"));
    const existing = await getUserBy(c, "email", email);
    if (existing) {
      await setMeta(c, existing.ID, "gff_lead_first", first);
      await setMeta(c, existing.ID, "gff_lead_phone", phone);
      await setMeta(c, existing.ID, "gff_lead_city", city);
      await setMeta(c, existing.ID, "gff_lead_at", currentMysql(c));
      return alert("success", "Thanks, " + esc(first) + "! Your info is updated. We&rsquo;ll be in touch shortly.");
    }
    const username = await uniqueUsername(c, email);
    const uid = await insertUser(c, { user_login: username, user_email: email, first_name: first, last_name: last, display_name: (first + " " + last).trim(), role: "gff_lead" });
    if (isWPError(uid)) return alert("error", esc(uid.message));
    await setMeta(c, uid, "gff_phone", phone);
    await setMeta(c, uid, "gff_lead_city", city);
    await setMeta(c, uid, "gff_lead_at", currentMysql(c));
    await setMeta(c, uid, "gff_lead_ip", sanitizeTextField(c.ip ?? ""));
    await newUserNotification(c, uid, "admin");
    return alert("success", "Thanks, " + esc(first) + "! We&rsquo;ll be in touch shortly.");
  }

  const address = sanitizeTextField(p(c, "gff_address"));
  const zip = sanitizeTextField(p(c, "gff_zip"));
  const sqft = sanitizeTextField(p(c, "gff_sqft"));
  const ratelock = c.post.gff_ratelock !== undefined ? "yes" : "no";
  const startDate = sanitizeTextField(p(c, "gff_start_date"));
  const offer = sanitizeKey(p(c, "gff_offer"));
  const reservation = sanitizeKey(p(c, "gff_reservation"));
  const pickedAddons = pickAddons(c);
  const picked = pickCrops(c);

  const errors: string[] = [];
  if (!offers().includes(offer)) errors.push("Please choose Sunrise, Spire, or both above.");
  if (!isEmail(email)) errors.push("Please enter a valid email address.");
  if (await emailExists(c, email)) errors.push("An account with that email already exists. Try logging in instead.");
  if (address === "") errors.push("Please enter your site address.");
  if (!["none", "consult", "down_payment", "workshop"].includes(reservation)) errors.push("Please choose a reservation option (reserve, consult, or no payment).");
  // (The plugin's password checks went with its password fields: sign-in is the accounts service.)
  if (errors.length) {
    flagRepop(c);
    return alert("error", errors.map((e) => esc(e)).join("<br>"));
  }

  const username = await uniqueUsername(c, email);
  const uid = await insertUser(c, {
    user_login: username, user_email: email, first_name: first, last_name: last,
    display_name: truthy((first + " " + last).trim()) ? (first + " " + last).trim() : email, role: "gff_customer",
  });
  if (isWPError(uid)) return alert("error", esc(uid.message));

  await setMeta(c, uid, "gff_phone", phone);
  await setMeta(c, uid, "gff_service_address", address);
  await setMeta(c, uid, "gff_service_city", city);
  await setMeta(c, uid, "gff_service_zip", zip);
  await setMeta(c, uid, "gff_start_sqft", sqft);
  await setMeta(c, uid, "gff_start_date", startDate);
  await setMeta(c, uid, "gff_crops_wanted", picked);
  await setMeta(c, uid, "gff_offer", offer);
  if (c.post.gff_three_sisters_optin !== undefined) {
    await setMeta(c, uid, "gff_three_sisters_request", { time: currentMysql(c), status: "requested_at_signup" });
    await sendThreeSistersEmail(c, uid);
  }
  const layout = parseLayout(c.post.gff_farm_layout ?? "");
  if (layout) {
    await setMeta(c, uid, "gff_crops_wanted", [...new Set([...picked, ...layout.flat])]);
    await setMeta(c, uid, "gff_farm_layout", phpJson(layout.layout));
    await setMeta(c, uid, "gff_moringa_fruit_upgrade", layout.moringa_upgrade ? "yes" : "no");
    const lay = layout.layout;
    if (lay.offer !== undefined && lay.offer === "spire") {
      let tq = 0;
      if (isArr(lay.towers)) tq = Object.keys(lay.towers).length;
      else if (lay.towers !== undefined && lay.towers !== null) tq = phpInt(lay.towers);
      if (tq > 0) {
        await setMeta(c, uid, "gff_tower_qty", String(tq));
        await setMeta(c, uid, "gff_tower_monthly", fmt2(towerTotal(tq)));
      }
    }
  }
  await setMeta(c, uid, "gff_rate_lock", ratelock);
  await setMeta(c, uid, "gff_reservation", reservation);
  await setMeta(c, uid, "gff_workshop_interest", workshopInterest(c));
  await setMeta(c, uid, "gff_reservation_amount", reservationMeta(c, reservation).amount);
  await setMeta(c, uid, "gff_reservation_paid", reservation === "none" ? "no" : "yes");
  await setMeta(c, uid, "gff_reservation_txn", "");
  await setMeta(c, uid, "gff_reservation_paid_at", reservation === "none" ? "" : currentMysql(c));
  await setMeta(c, uid, "gff_reservation_credited_signup", "no");

  const { total: addonTotal, labels: addonLabels } = addonSums(pickedAddons);
  await setMeta(c, uid, "gff_addons", pickedAddons);
  await setMeta(c, uid, "gff_addons_total", fmt2(addonTotal));
  await setMeta(c, uid, "gff_addons_invoiced", "no");
  await setMeta(c, uid, "gff_addons_labels", addonLabels.join("; "));

  await setMeta(c, uid, "gff_agreement_version", agreementVersion());
  await setMeta(c, uid, "gff_agreement_accepted_at", currentMysql(c));
  await setMeta(c, uid, "gff_agreement_ip", sanitizeTextField(c.ip ?? ""));

  await newUserNotification(c, uid, "admin");

  let out = "Welcome to Gawlak Family Farms, " + esc(first) + "! Your account is created and your enrollment is recorded.";
  if (isNumeric(sqft) && Number(sqft) > 0) {
    const n = Math.trunc(Number(sqft));
    if (n <= 1500) {
      out += " Your Zora Sunrise Module™ at <strong>" + esc(n) + " sq ft</strong> is <strong>$300/month</strong>, all-inclusive, with a guaranteed minimum <strong>$300/month in food harvest value</strong> once established. Bigger costs the same — take the space.";
    } else {
      out += " Your space (" + esc(n) + " sq ft) is larger than a single Zora Sunrise Module™ (max 1,500 sq ft at $300/month). We'll discuss multi-module options at your design consult.";
    }
  }
  if (reservation !== "none") {
    const rm = reservationMeta(c, reservation);
    const amtDisp = "$" + trimAmount(rm.amount);
    const callout = reservation === "consult" ? "Send your " + amtDisp + " now to lock in your on-site consult. It credits to your first month."
      : reservation === "workshop" ? "Send your " + amtDisp + " now to reserve your seat at the monthly workshop."
        : "Send your " + amtDisp + " now — we drop inoculant and hay on your site within 48 hours of your PayPal payment.";
    out += '<div class="gff-paid-callout">'
      + "<p><strong>" + esc(rm.label) + " selected.</strong> "
      + '<a class="gff-paid-callout__link" href="' + escUrl(rm.url) + '" target="_blank" rel="noopener">Send your ' + esc(amtDisp) + " via PayPal &rarr;</a></p>"
      + "</div>";
    out += '<div class="gff-modal" id="gff-pay-modal" role="dialog" aria-modal="true" aria-labelledby="gff-pay-modal-title" hidden>'
      + '<div class="gff-modal__backdrop" data-gff-modal-close></div>'
      + '<div class="gff-modal__card">'
      + '<button type="button" class="gff-modal__close" data-gff-modal-close aria-label="Close">&times;</button>'
      + '<h3 id="gff-pay-modal-title" class="gff-modal__title">' + esc(rm.label) + "</h3>"
      + '<p class="gff-modal__body">' + esc(callout) + "</p>"
      + '<a href="' + escUrl(rm.url) + '" target="_blank" rel="noopener" class="gff-btn gff-btn--pp">Pay ' + esc(amtDisp) + " via PayPal &rarr;</a>"
      + '<p class="gff-modal__hint">Opens PayPal in a new tab. You can pay with a credit/debit card &mdash; no PayPal account required.</p>'
      + "</div>"
      + "</div>";
    out += "<script>(function(){"
      + 'var m=document.getElementById("gff-pay-modal");if(!m)return;'
      + "if(m.parentNode!==document.body){document.body.appendChild(m);}"
      + 'var open=function(){m.hidden=false;document.body.style.overflow="hidden";};'
      + 'var close=function(){m.hidden=true;document.body.style.overflow="";};'
      + 'm.querySelectorAll("[data-gff-modal-close]").forEach(function(el){el.addEventListener("click",close);});'
      + 'document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!m.hidden)close();});'
      + "setTimeout(open,600);"
      + "})();</script>";
  }
  out += ' You can log in any time at <a href="' + escUrl(loginUrl()) + '">the member login</a>.';
  if (pickedAddons.length) {
    out += '<div class="gff-addon-callout">'
      + "<p><strong>Add-ons selected:</strong> " + esc(addonLabels.join(", ")) + ".</p>"
      + "<p>Total add-ons: <strong>$" + esc(fmt2(addonTotal)) + "</strong> &mdash; "
      + "we&rsquo;ll send you a separate invoice for these (your $100 reservation is unchanged).</p>"
      + "</div>";
  }
  const method = reservation === "none" ? "enroll_no_reservation" : "enroll_" + reservation;
  const prepay = reservation === "consult" ? { e: "consult_reservation", v: 300 } : reservation === "down_payment" ? { e: "down_payment_reservation", v: 400 } : null;
  out += "<script>(function(){"
    + 'if(typeof gtag!=="function"){return;}'
    + 'gtag("event","sign_up",{'
    + "method:" + phpJson(method) + ","
    + "value:150,"
    + 'currency:"USD"'
    + "});"
    + (prepay ? 'gtag("event",' + phpJson(prepay.e) + ",{method:" + phpJson(method) + ",value:" + prepay.v + ',currency:"USD"});' : "")
    + "})();</script>";
  out += "<script>(function(){"
    + "var tries=0;"
    + "function fire(){"
    + 'if(typeof fbq!=="function"){if(tries++<40){return setTimeout(fire,150);}return;}'
    + "try{"
    + 'fbq("track","CompleteRegistration",{'
    + 'value:150,currency:"USD",'
    + 'content_name:"Zora Sunrise Module Enrollment",'
    + "registration_type:" + phpJson(method)
    + "});"
    + "}catch(e){}"
    + "}"
    + "fire();"
    + "})();</script>"
    + '<noscript><img height="1" width="1" style="display:none" '
    + 'src="https://www.facebook.com/tr?id=' + esc("408144794862479") + '&ev=CompleteRegistration&noscript=1"/></noscript>';
  return alert("success", out);
}

/** gff_reg_handle_tower(): the Spire flow — email and the agreement required; tower count 1–100. */
export async function handleTower(c: AjaxCtx): Promise<string> {
  if (c.post.gff_tower_nonce === undefined) return alert("error", "Security check failed. Please reload the page and try again.");
  if (notEmpty(c.post.gff_company_url)) return alert("error", "Submission blocked.");
  const email = sanitizeEmail(p(c, "gff_email"));
  if (!isEmail(email)) {
    flagRepop(c);
    return alert("error", "Please enter a valid email address to continue.");
  }
  let qty = c.post.gff_tower_qty !== undefined ? phpInt(p(c, "gff_tower_qty")) : 1;
  qty = Math.max(1, Math.min(qty, towerMax()));
  const first = sanitizeTextField(p(c, "gff_first"));
  const last = sanitizeTextField(p(c, "gff_last"));
  const phone = sanitizeTextField(p(c, "gff_phone"));
  const address = sanitizeTextField(p(c, "gff_address"));
  const city = sanitizeTextField(p(c, "gff_city"));
  const zip = sanitizeTextField(p(c, "gff_zip"));
  let reservation = sanitizeKey(c.post.gff_reservation !== undefined ? p(c, "gff_reservation") : "none");
  if (!["none", "consult", "down_payment", "workshop"].includes(reservation)) reservation = "none";
  const indicated = c.post.gff_agree !== undefined ? "yes" : "no";
  if (indicated !== "yes") {
    flagRepop(c);
    return alert("error", "Please read and accept the Spire Service Agreement to continue.");
  }
  let monthly = towerTotal(qty);

  const existing = await getUserBy(c, "email", email);
  let uid: number;
  let isNew: boolean;
  let crosssell: boolean;
  if (existing) {
    uid = existing.ID;
    isNew = false;
    crosssell = ["full", "express"].includes(String(await meta(c, uid, "gff_signup_flow")));
  } else {
    const username = await uniqueUsername(c, email);
    const r = await insertUser(c, {
      user_login: username, user_email: email, first_name: first, last_name: last,
      display_name: truthy((first + " " + last).trim()) ? (first + " " + last).trim() : email,
      role: reservation === "none" ? "gff_lead" : "gff_customer",
    });
    if (isWPError(r)) return alert("error", esc(r.message));
    uid = r;
    isNew = true;
    crosssell = false;
  }
  if (crosssell) {
    const discount = phpRound(towerFirstPrice() * (towerCrosssellPct() / 100), 2);
    monthly = Math.max(0, monthly - discount);
    await setMeta(c, uid, "gff_tower_crosssell", "yes");
  }
  if (phone !== "") await setMeta(c, uid, "gff_phone", phone);
  if (address !== "") await setMeta(c, uid, "gff_service_address", address);
  if (city !== "") await setMeta(c, uid, "gff_service_city", city);
  if (zip !== "") await setMeta(c, uid, "gff_service_zip", zip);
  await setMeta(c, uid, "gff_signup_flow", "tower");
  await setMeta(c, uid, "gff_tower_qty", String(qty));
  await setMeta(c, uid, "gff_tower_monthly", fmt2(monthly));
  await setMeta(c, uid, "gff_tower_food_value", String(towerFoodValue() * qty));
  const layout = parseLayout(c.post.gff_farm_layout ?? "");
  if (layout) {
    if (layout.flat.length) await setMeta(c, uid, "gff_crops_wanted", layout.flat);
    await setMeta(c, uid, "gff_farm_layout", phpJson(layout.layout));
  }
  await setMeta(c, uid, "gff_indicated_agreement", indicated);
  await setMeta(c, uid, "gff_indicated_agreement_version", agreementVersion());
  await setMeta(c, uid, "gff_indicated_at", currentMysql(c));
  await setMeta(c, uid, "gff_reservation", reservation);
  await setMeta(c, uid, "gff_reservation_paid", reservation === "none" ? "no" : "yes");
  await setMeta(c, uid, "gff_workshop_interest", workshopInterest(c));
  await setMeta(c, uid, "gff_reservation_amount", reservationMeta(c, reservation).amount);
  if (isNew) await newUserNotification(c, uid, "admin");

  let method = reservation === "none" ? "tower_email_lead" : "tower_" + reservation;
  if (crosssell) method += "_crosssell";
  let out = "Thanks, " + (truthy(first) ? esc(first) : "there") + "! ";
  out += "You&rsquo;ve reserved <strong>" + qty + " " + (qty === 1 ? "Spire" : "Spires") + "</strong> at <strong>$" + esc(numberFormat(monthly, 0)) + "/mo</strong>";
  out += crosssell ? " <em>(includes your 10% member discount)</em>." : ".";
  out += " Each Spire includes its own herb garden, and we install and maintain everything for you.";
  if (reservation !== "none") {
    const rm = reservationMeta(c, reservation);
    const amtDisp = "$" + trimAmount(rm.amount);
    const body = reservation === "workshop" ? "Send your " + amtDisp + " now to reserve your seat at the monthly workshop."
      : reservation === "consult" ? "Send your " + amtDisp + " now to lock in your on-site consult. It credits to your first month."
        : "Send your " + amtDisp + " now to lock in your Spire install. It credits to your first month.";
    out += '<div class="gff-paid-callout"><p><strong>' + esc(rm.label) + " selected.</strong> "
      + '<a class="gff-paid-callout__link" href="' + escUrl(rm.url) + '" target="_blank" rel="noopener">Send your ' + esc(amtDisp) + " via PayPal &rarr;</a></p></div>";
    out += '<div class="gff-modal" id="gff-pay-modal" role="dialog" aria-modal="true" hidden>'
      + '<div class="gff-modal__backdrop" data-gff-modal-close></div>'
      + '<div class="gff-modal__card">'
      + '<button type="button" class="gff-modal__close" data-gff-modal-close aria-label="Close">&times;</button>'
      + '<h3 class="gff-modal__title">' + esc(rm.label) + "</h3>"
      + '<p class="gff-modal__body">' + esc(body) + "</p>"
      + '<a href="' + escUrl(rm.url) + '" target="_blank" rel="noopener" class="gff-btn gff-btn--pp">Pay ' + esc(amtDisp) + " via PayPal &rarr;</a>"
      + '<p class="gff-modal__hint">Opens PayPal in a new tab. Credit/debit card works &mdash; no PayPal account required.</p>'
      + "</div></div>";
    out += modalScript;
  }
  out += '<script>(function(){if(typeof gtag!=="function"){return;}'
    + 'gtag("event","sign_up",{method:' + phpJson(method) + ",value:" + Math.trunc(monthly) + ',currency:"USD"});'
    + "})();</script>";
  out += "<script>(function(){var tries=0;function fire(){"
    + 'if(typeof fbq!=="function"){if(tries++<40){return setTimeout(fire,150);}return;}'
    + 'try{fbq("track","CompleteRegistration",{value:' + Math.trunc(monthly) + ',currency:"USD",content_name:"Spire Tower Enrollment",registration_type:' + phpJson(method) + "});}catch(e){}"
    + "}fire();})();</script>";
  return alert("success", out);
}
