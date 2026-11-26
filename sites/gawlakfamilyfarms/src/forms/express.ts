/**
 * The sign-up forms' submission (gff_reg_maybe_handle_submit on the 'wp'
 * hook): the page posts to itself, the handler runs before any shortcode
 * renders and leaves its alert in $gff_reg_state['notice'] (and, after a
 * failed submit, the values to refill). This file: the express flow (the home
 * page's form); signup.ts: the full, lead and tower flows.
 *
 * Intended difference (MIGRATION.md): the plugin gave a new person a random
 * WordPress password (wp_generate_password); the Worker creates the user by
 * email with no password — they sign in through the shared accounts service.
 */
import { type AjaxCtx, p, pa } from "../ajax";
import { type Ctx, setMeta } from "../ctx";
import { esc, escUrl, numberFormat, phpInt, phpJson, truthy } from "../php";
import { isEmail, sanitizeEmail, sanitizeKey, sanitizeTextField } from "../wpfn";
import { currentMysql, getUserBy, insertUser, isWPError, newUserNotification, sanitizeUser, usernameExists } from "../wpcore";
import { sendMail } from "../wp";
import { opt, meta } from "../ctx";
import { addons, agreementVersion, allCrops, bundle, offers, reservationMeta } from "./catalog";

/** gff_reg_alert( $type, $html ): the notice box, and the script that scrolls to it. */
export function alert(type: string, html: string): string {
  const cls = type === "success" ? "gff-alert--ok" : "gff-alert--err";
  const role = type === "success" ? "status" : "alert";
  const lead = type === "success" ? "" : '<strong class="gff-alert__lead">Please fix the following before submitting:</strong>';
  return '<div id="gff-alert" class="gff-alert ' + esc(cls) + '" role="' + esc(role) + '" tabindex="-1">'
    + lead + html
    + "</div>"
    + "<script>(function(){"
    + 'var a=document.getElementById("gff-alert");if(!a)return;'
    + "setTimeout(function(){"
    + 'a.scrollIntoView({behavior:"smooth",block:"center"});'
    + "try{a.focus({preventScroll:true});}catch(e){a.focus();}"
    + "},120);"
    + "})();</script>";
}

/** gff_reg_flag_repop(): refill the form after a failed submit (never passwords). */
export function flagRepop(c: AjaxCtx): void {
  c.reg.repop = true;
  const has = (k: string) => c.post[k] !== undefined;
  for (const k of ["gff_first", "gff_last", "gff_email", "gff_phone", "gff_address", "gff_city", "gff_zip", "gff_start_date", "gff_sqft", "gff_reservation"]) {
    c.reg.old[k] = has(k) ? sanitizeTextField(p(c, k)) : "";
  }
  const crops = pa(c, "gff_crops");
  c.reg.old.gff_crops = crops ? crops.map((x) => sanitizeTextField(x)) : [];
  const ads = pa(c, "gff_addons");
  c.reg.old.gff_addons = ads ? ads.map((x) => sanitizeKey(x)) : [];
  c.reg.old.gff_ratelock = has("gff_ratelock") ? "yes" : "";
  c.reg.old.gff_three_sisters_optin = has("gff_three_sisters_optin") ? "yes" : "";
  c.reg.old.gff_agree = has("gff_agree") ? "yes" : "";
  c.reg.old.gff_express_email = has("gff_email") ? sanitizeTextField(p(c, "gff_email")) : "";
  c.reg.old.gff_tower_email = has("gff_email") ? sanitizeTextField(p(c, "gff_email")) : "";
  c.reg.old.gff_tower_qty = has("gff_tower_qty") ? phpInt(p(c, "gff_tower_qty")) : "";
}

/** gff_reg_unique_username( $email ): the email's local part, numbered if taken. */
export async function uniqueUsername(c: Ctx, email: string): Promise<string> {
  let base = sanitizeUser(email.split("@")[0], true);
  if (base === "") base = "customer";
  let tryName = base;
  let i = 1;
  while (await usernameExists(c, tryName)) { tryName = base + i; i++; }
  return tryName;
}

/** json_decode( $s, true ): null when invalid; {} is an empty array; 0..n-1 keys read as a list. */
export function phpJsonDecode(s: string): unknown {
  let v: unknown;
  try { v = JSON.parse(s); } catch { return null; }
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === "object") {
      const keys = Object.keys(x);
      if (keys.every((k, i) => k === String(i))) return keys.map((k) => norm((x as any)[k]));
      return Object.fromEntries(keys.map((k) => [k, norm((x as any)[k])]));
    }
    return x;
  };
  return norm(v);
}
export const isArr = (v: unknown): v is Record<string, any> => !!v && typeof v === "object";
/** (string) of a PHP scalar ("1" for true, "" for false/null, "Array" for an array). */
export const str = (v: unknown) => (v === true ? "1" : v === false || v === null || v === undefined ? "" : isArr(v) ? "Array" : String(v));
/** !empty() of a PHP value. */
export const notEmpty = (v: unknown) => truthy(v) && !(isArr(v) && Object.keys(v).length === 0);

/** gff_reg_parse_layout( $raw ): the build-your-farm configurator's picks, every plant checked against the crop list. */
export function parseLayout(raw: unknown): { flat: string[]; layout: Record<string, any>; moringa_upgrade: boolean } | null {
  if (!notEmpty(raw) || typeof raw !== "string") return null;
  const data = phpJsonDecode(raw);
  if (!isArr(data)) return null;
  const all = allCrops();
  const flat: string[] = [];
  const clean: Record<string, any> = { offer: "" };
  const offer = data.offer !== undefined && data.offer !== null ? sanitizeKey(str(data.offer)) : "";
  if (offers().includes(offer)) clean.offer = offer;
  if (clean.offer === "spire" && notEmpty(data.towers_plants) && isArr(data.towers_plants)) {
    clean.towers = [];
    for (const t of Object.values<any>(data.towers_plants)) {
      const tn = t?.tower !== undefined && t?.tower !== null ? phpInt(t.tower) : 0;
      const plants: string[] = [];
      if (notEmpty(t?.plants) && isArr(t.plants)) {
        for (const x of Object.values(t.plants)) {
          const pl = sanitizeTextField(str(x));
          if (all.includes(pl)) { plants.push(pl); flat.push(pl); }
        }
      }
      clean.towers.push({ tower: tn, plants });
    }
  } else if (clean.offer === "sunrise" && notEmpty(data.seasonal_spots) && isArr(data.seasonal_spots)) {
    clean.seasonal_spots = [];
    for (const x of Object.values(data.seasonal_spots)) {
      const pl = sanitizeTextField(str(x));
      if (all.includes(pl)) { clean.seasonal_spots.push(pl); flat.push(pl); }
    }
  }
  return { flat: [...new Set(flat)], layout: clean, moringa_upgrade: notEmpty(data.moringa_fruit_upgrade) };
}

/** html_entity_decode( $s, ENT_QUOTES ) for the entities the catalogue uses. */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", nbsp: " ", trade: "™", middot: "·", times: "×", rarr: "→" };
export const entityDecode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e] ?? m);

/** gff_reg_send_three_sisters_email( $uid ): the owner's note about a Three Sisters request. */
export async function sendThreeSistersEmail(c: Ctx, uid: number): Promise<boolean> {
  const user = await getUserBy(c, "id", uid);
  if (!user) return false;
  let name = (str(await meta(c, uid, "first_name")) + " " + str(await meta(c, uid, "last_name"))).trim();
  if (name === "") name = user.display_name;
  const phone = await meta(c, uid, "gff_phone");
  let to = str(opt(c, "gff_reg_msg_recipient", "martingawlak@gmail.com"));
  if (to.trim() === "" || !isEmail(to)) to = "martingawlak@gmail.com";
  const subject = "Three Sisters request ($300 one-time) — " + name;
  let body = "<p><strong>" + esc(name) + "</strong> requested the <strong>Three Sisters</strong> propagation add-on from their account page.</p>";
  body += "<p><strong>$300 one-time.</strong> Send the $300 invoice from their profile (Users &rarr; Edit User); once it is paid, start their propagation clock: one free Spire per year, up to one per paid Spire.</p>";
  body += "<p><strong>Email:</strong> " + esc(user.user_email) + "<br>";
  if (truthy(phone)) body += "<strong>Phone:</strong> " + esc(phone) + "<br>";
  body += "<strong>User ID:</strong> " + phpInt(uid) + "</p>";
  const headers = ["Content-Type: text/html; charset=UTF-8"];
  if (isEmail(user.user_email)) headers.push("Reply-To: " + name + " <" + user.user_email + ">");
  return sendMail(c.env, to, subject, body, headers);
}

/** gff_reg_handle_express(): the express sign-up — email, site address, offer and reservation; everything else optional. */
export async function handleExpress(c: AjaxCtx): Promise<string> {
  if (c.post.gff_express_nonce === undefined) {
    return alert("error", "Security check failed. Please reload the page and try again.");
  }
  if (notEmpty(c.post.gff_company_url)) return alert("error", "Submission blocked.");

  const email = sanitizeEmail(p(c, "gff_email"));
  const address = sanitizeTextField(p(c, "gff_address"));
  const offer = sanitizeKey(p(c, "gff_offer"));
  const reservation = sanitizeKey(p(c, "gff_reservation"));

  const errors: string[] = [];
  if (!offers().includes(offer)) errors.push("Please choose Sunrise, Spire, or both above.");
  if (!isEmail(email)) errors.push("Please enter a valid email address.");
  if (address === "") errors.push("Please enter your site address.");
  if (!["none", "consult", "down_payment", "workshop"].includes(reservation)) errors.push("Please choose a reservation option (reserve, consult, or no payment).");
  if (errors.length) {
    flagRepop(c);
    return alert("error", errors.map((e) => esc(e)).join("<br>"));
  }

  const first = sanitizeTextField(p(c, "gff_first"));
  const last = sanitizeTextField(p(c, "gff_last"));
  const phone = sanitizeTextField(p(c, "gff_phone"));
  const city = sanitizeTextField(p(c, "gff_city"));
  const zip = sanitizeTextField(p(c, "gff_zip"));
  const startDate = sanitizeTextField(p(c, "gff_start_date"));
  const sqft = sanitizeTextField(p(c, "gff_sqft"));
  const ratelock = c.post.gff_ratelock !== undefined ? "yes" : "no";
  const indicated = c.post.gff_agree !== undefined ? "yes" : "no";

  const all = allCrops();
  const picked: string[] = [];
  const cropsIn = pa(c, "gff_crops");
  if (cropsIn && cropsIn.length) {
    for (const x of cropsIn) { const cr = sanitizeTextField(x); if (all.includes(cr)) picked.push(cr); }
  }

  const catalog = addons();
  let pickedAddons: string[] = [];
  const adsIn = pa(c, "gff_addons");
  if (adsIn && adsIn.length) {
    for (const x of adsIn) { const ad = sanitizeKey(x); if (ad === "bundle" || catalog[ad] !== undefined) pickedAddons.push(ad); }
    pickedAddons = [...new Set(pickedAddons)];
    if (pickedAddons.includes("bundle")) pickedAddons = ["bundle"];
  }

  // Existing account? Update as an express lead rather than erroring.
  const existing = await getUserBy(c, "email", email);
  let uid: number;
  let isNew: boolean;
  if (existing) {
    uid = existing.ID;
    isNew = false;
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
  }

  if (phone !== "") await setMeta(c, uid, "gff_phone", phone);
  if (address !== "") await setMeta(c, uid, "gff_service_address", address);
  if (city !== "") await setMeta(c, uid, "gff_service_city", city);
  if (zip !== "") await setMeta(c, uid, "gff_service_zip", zip);
  if (sqft !== "") await setMeta(c, uid, "gff_start_sqft", sqft);
  if (startDate !== "") await setMeta(c, uid, "gff_start_date", startDate);
  if (picked.length) await setMeta(c, uid, "gff_crops_wanted", picked);

  const layout = parseLayout(c.post.gff_farm_layout ?? "");
  if (layout) {
    const merged = [...new Set([...picked, ...layout.flat])];
    if (merged.length) await setMeta(c, uid, "gff_crops_wanted", merged);
    await setMeta(c, uid, "gff_farm_layout", phpJson(layout.layout));
    await setMeta(c, uid, "gff_moringa_fruit_upgrade", layout.moringa_upgrade ? "yes" : "no");
  }

  await setMeta(c, uid, "gff_signup_flow", "express");
  await setMeta(c, uid, "gff_offer", offer);
  await setMeta(c, uid, "gff_rate_lock", ratelock);
  if (c.post.gff_three_sisters_optin !== undefined) {
    await setMeta(c, uid, "gff_three_sisters_request", { time: currentMysql(c), status: "requested_at_signup" });
    await sendThreeSistersEmail(c, uid);
  }
  // "Indicated" — not a binding acceptance; distinct from the strict flow's keys.
  await setMeta(c, uid, "gff_indicated_agreement", indicated);
  await setMeta(c, uid, "gff_indicated_agreement_version", agreementVersion());
  await setMeta(c, uid, "gff_indicated_at", currentMysql(c));

  await setMeta(c, uid, "gff_reservation", reservation);
  const workshop = c.post.gff_workshop_interest !== undefined && sanitizeKey(p(c, "gff_workshop_interest")) === "yes" ? "yes" : "no";
  await setMeta(c, uid, "gff_workshop_interest", workshop);
  const resMeta = reservationMeta(c, reservation);
  await setMeta(c, uid, "gff_reservation_amount", resMeta.amount);
  await setMeta(c, uid, "gff_reservation_paid", reservation === "none" ? "no" : "yes");
  await setMeta(c, uid, "gff_reservation_paid_at", reservation === "none" ? "" : currentMysql(c));

  let addonTotal = 0;
  const addonLabels: string[] = [];
  if (pickedAddons.includes("bundle")) {
    const b = bundle();
    addonTotal = b.price;
    addonLabels.push(entityDecode(b.power) + " (" + b.name + ", $" + b.price + ")");
  } else {
    for (const ad of pickedAddons) {
      const a = catalog[ad];
      if (a) { addonTotal += a.price; addonLabels.push(entityDecode(a.power) + " (" + a.name + ", $" + a.price + ")"); }
    }
  }
  if (pickedAddons.length) {
    await setMeta(c, uid, "gff_addons", pickedAddons);
    await setMeta(c, uid, "gff_addons_total", numberFormat(addonTotal, 2).replace(/,/g, ""));
    await setMeta(c, uid, "gff_addons_invoiced", "no");
    await setMeta(c, uid, "gff_addons_labels", addonLabels.join("; "));
  }

  if (isNew) await newUserNotification(c, uid, "admin");

  const method = reservation === "none" ? "express_email_lead" : "express_" + reservation;
  let out = "Thanks, " + (truthy(first) ? esc(first) : "there") + "! ";
  if (reservation === "none") {
    out += "You&rsquo;re on the list &mdash; we&rsquo;ll email you at <strong>" + esc(email) + "</strong> with your next steps"
      + (indicated === "yes" ? ", including the agreement details you reviewed" : "") + ".";
  } else {
    const rm = reservationMeta(c, reservation);
    const payUrl = rm.url;
    const amtDisp = "$" + rm.amount.replace(/0+$/, "").replace(/\.+$/, "");
    const label = rm.label;
    const callout = reservation === "consult" ? "Send your " + amtDisp + " now to lock in your on-site consult. It credits to your first month."
      : reservation === "workshop" ? "Send your " + amtDisp + " now to reserve your seat at the monthly workshop."
        : "Send your " + amtDisp + " now &mdash; we drop inoculant and hay on your site within 48 hours of your PayPal payment.";
    out += "Your spot is reserved. <strong>" + esc(label) + "</strong> &mdash; complete it below and we&rsquo;ll reach out to finish onboarding.";
    out += '<div class="gff-paid-callout"><p><strong>' + esc(label) + " selected.</strong> "
      + '<a class="gff-paid-callout__link" href="' + escUrl(payUrl) + '" target="_blank" rel="noopener">Send your ' + esc(amtDisp) + " via PayPal &rarr;</a></p></div>";
    out += '<div class="gff-modal" id="gff-pay-modal" role="dialog" aria-modal="true" hidden>'
      + '<div class="gff-modal__backdrop" data-gff-modal-close></div>'
      + '<div class="gff-modal__card">'
      + '<button type="button" class="gff-modal__close" data-gff-modal-close aria-label="Close">&times;</button>'
      + '<h3 class="gff-modal__title">' + esc(label) + "</h3>"
      + '<p class="gff-modal__body">' + esc(callout) + "</p>"
      + '<a href="' + escUrl(payUrl) + '" target="_blank" rel="noopener" class="gff-btn gff-btn--pp">Pay ' + esc(amtDisp) + " via PayPal &rarr;</a>"
      + '<p class="gff-modal__hint">Opens PayPal in a new tab. Credit/debit card works &mdash; no PayPal account required.</p>'
      + "</div></div>";
    out += '<script>(function(){var m=document.getElementById("gff-pay-modal");if(!m)return;'
      + "if(m.parentNode!==document.body){document.body.appendChild(m);}"
      + 'var open=function(){m.hidden=false;document.body.style.overflow="hidden";};'
      + 'var close=function(){m.hidden=true;document.body.style.overflow="";};'
      + 'm.querySelectorAll("[data-gff-modal-close]").forEach(function(el){el.addEventListener("click",close);});'
      + 'document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!m.hidden)close();});'
      + "setTimeout(open,600);})();</script>";
  }
  if (pickedAddons.length) {
    out += '<div class="gff-addon-callout">'
      + "<p><strong>Bounties claimed:</strong> " + esc(addonLabels.join(", ")) + ".</p>"
      + "<p>Total: <strong>$" + esc(numberFormat(addonTotal, 2).replace(/,/g, "")) + "</strong> &mdash; invoiced separately after enrollment.</p>"
      + "</div>";
  }
  out += '<script>(function(){if(typeof gtag!=="function"){return;}'
    + 'gtag("event","sign_up",{method:' + phpJson(method) + ',value:150,currency:"USD"});'
    + "})();</script>";
  out += "<script>(function(){var tries=0;function fire(){"
    + 'if(typeof fbq!=="function"){if(tries++<40){return setTimeout(fire,150);}return;}'
    + 'try{fbq("track","CompleteRegistration",{value:150,currency:"USD",content_name:"Zora Express Enrollment",registration_type:' + phpJson(method) + "});}catch(e){}"
    + "}fire();})();</script>";
  return alert("success", out);
}

/** gff_reg_maybe_handle_submit() (the 'wp' hook): run the form's handler before the page renders. */
export async function maybeHandleSubmit(c: AjaxCtx): Promise<void> {
  const { handleSubmit, handleTower } = await import("./signup");
  if (c.post.gff_reg_submit !== undefined) c.reg.notice = await handleSubmit(c, "full");
  else if (c.post.gff_lead_submit !== undefined) c.reg.notice = await handleSubmit(c, "lead");
  else if (c.post.gff_express_submit !== undefined) c.reg.notice = await handleExpress(c);
  else if (c.post.gff_tower_submit !== undefined) c.reg.notice = await handleTower(c);
}
