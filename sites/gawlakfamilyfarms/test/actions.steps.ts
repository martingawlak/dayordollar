/**
 * The steps test/actions.parity.ts replays, and the fake outside world both
 * sides see. Users in the fixture: 1 (administrator), 4, 18, 24, 27, 28
 * (gff_customer), 29 (gff_lead), 30, 33 (gff_staff).
 */
import type { Handler } from "./harness";

export interface Step {
  uid: number;
  action: string;
  post?: Record<string, string | string[]>;
  get?: Record<string, string>;
  tag?: string;
  /** A check only the Worker makes: the plugin side "replies" with expect. */
  workerOnly?: boolean;
  expect?: unknown;
}

/** A fresh fake outside world (geocoding, Nominatim, OSRM) for one side. */
export function handler(): { handle: Handler } {
  const handle: Handler = () => undefined;
  return { handle };
}

const J = (v: unknown) => JSON.stringify(v);
/** The express form as the home page posts it. */
const express = (fields: Record<string, string | string[]>): Record<string, string | string[]> =>
  ({ gff_express_nonce: "nonce-gff_express_action", gff_offer: "", gff_company_url: "", gff_express_submit: "1", gff_reservation: "consult", ...fields });
const X = (post: Record<string, string | string[]>, tag = "express", uid = 0): Step => ({ uid, action: "@page", post: express(post), tag });

/** The full enrollment form ([gff_form_start] … [gff_submit]), without its password fields (MIGRATION.md). */
const full = (fields: Record<string, string | string[]>): Step => ({ uid: 0, action: "@page", tag: "full",
  post: { gff_reg_nonce: "nonce-gff_reg_action", gff_offer: "", gff_company_url: "", gff_reg_submit: "1", ...fields } });
/** The lead form ([gff_lead_capture]). */
const lead = (fields: Record<string, string | string[]>): Step => ({ uid: 0, action: "@page", tag: "lead",
  post: { gff_lead_nonce: "nonce-gff_lead_action", gff_company_url: "", gff_lead_submit: "1", ...fields } });
/** The Spire form ([gff_tower_start] … [gff_tower_submit]). */
const tower = (fields: Record<string, string | string[]>, uid = 0): Step => ({ uid, action: "@page", tag: "tower",
  post: { gff_tower_nonce: "nonce-gff_tower_action", gff_company_url: "", gff_tower_submit: "1", ...fields } });

export const STEPS: Step[] = [
  // Refusals: no nonce field, the honeypot, nothing filled in, each requirement alone.
  { uid: 0, action: "@page", post: { gff_express_submit: "1", gff_email: "a@b.co" }, tag: "express" },
  X({ gff_company_url: "http://spam.example", gff_email: "a@b.co" }),
  X({ gff_reservation: "" }),
  X({ gff_offer: "sunrise", gff_email: "not-an-email", gff_address: "1 Main St", gff_first: " Ann <b>", gff_crops: ["Kale", "Bogus"], gff_addons: ["Starfruit!", "x"], gff_agree: "yes", gff_tower_qty: "3x" }),
  X({ gff_offer: "spire", gff_email: "a@b.co", gff_address: "  " }),
  X({ gff_offer: "both", gff_email: "a@b.co", gff_address: "1 Main St", gff_reservation: "later" }),
  // A new lead (no payment): role gff_lead, the admin is told.
  X({ gff_offer: "sunrise", gff_email: "new.lead@example.com", gff_address: "10 Oak Ln", gff_first: "Nia", gff_agree: "yes", gff_reservation: "none" }),
  // The same person again (any letter case): updated, no second account, no second admin email; now a consult.
  X({ gff_offer: "both", gff_email: "New.Lead@Example.com", gff_address: "10 Oak Ln", gff_phone: "772-555-0100", gff_city: "Fort Pierce", gff_zip: "34982", gff_reservation: "consult" }),
  // A new customer with everything: crops (one unknown), add-ons (repeats, an unknown), Three Sisters, a Spire layout.
  X({
    gff_offer: "spire", gff_email: "full.form@example.com", gff_address: "5 Palm Way", gff_first: "Rae", gff_last: "O'Neil", gff_phone: "555", gff_city: "Stuart",
    gff_zip: "34994", gff_start_date: "2026-12-01", gff_sqft: "400", gff_ratelock: "1", gff_agree: "yes", gff_three_sisters_optin: "yes", gff_workshop_interest: "YES",
    gff_crops: ["Kale", "Pansy / viola", "Bachelor's button", "Mango"], gff_addons: ["starfruit", "bogus", "starfruit", "strawberry"],
    gff_farm_layout: J({ offer: "spire", towers_plants: [{ tower: 1, plants: ["Basil", "Kale", "Nope"] }, { tower: "2", plants: ["Mint"] }, { plants: "x" }], moringa_fruit_upgrade: 1 }),
  }),
  // The bundle wins over single add-ons; a Sunrise layout; the legacy workshop reservation.
  X({
    gff_offer: "sunrise", gff_email: "bundle@example.com", gff_address: "7 Elm", gff_reservation: "workshop", gff_addons: ["workshop", "bundle", "headstart"],
    gff_farm_layout: J({ offer: "sunrise", seasonal_spots: ["Okra", "Okra", "Zinnia", 5], moringa_fruit_upgrade: 0 }),
  }),
  // A taken username (the lead above is "new.lead") gets a number; the legacy down payment uses the PayPal link setting.
  X({ gff_offer: "both", gff_email: "new.lead@elsewhere.example", gff_address: "1 A St", gff_reservation: "down_payment", gff_first: "0", gff_farm_layout: "{not json" }),
  { uid: 0, action: "@option", post: { gff_reg_paypal_link: "https://www.paypal.me/gawlakfarms/", gff_reg_msg_recipient: "not an email" }, tag: "express" },
  X({ gff_offer: "spire", gff_email: "+++@plus.example", gff_address: "2 B St", gff_reservation: "down_payment", gff_three_sisters_optin: "", gff_farm_layout: J({ offer: "both", towers_plants: [] }) }),
  X({ gff_offer: "spire", gff_email: "+++@plus2.example", gff_address: "3 C St", gff_reservation: "none", gff_farm_layout: J([]) }),
  // A signed-in visitor using the form: still keyed by the email typed (here the express customer's).
  X({ gff_offer: "sunrise", gff_email: "full.form@example.com", gff_address: "9 D St", gff_reservation: "none", gff_three_sisters_optin: "1" }, "express", 4),

  // ---- The full enrollment ----
  { uid: 0, action: "@page", post: { gff_reg_submit: "1" }, tag: "full" },
  full({ gff_company_url: "x" }),
  full({ gff_email: "bad", gff_crops: ["Kale"], gff_sqft: "400" }),
  full({ gff_offer: "sunrise", gff_email: "full.form@example.com", gff_address: "5 Palm Way", gff_reservation: "consult" }),
  full({
    gff_offer: "sunrise", gff_email: "enroll@example.com", gff_address: "1 Grove Rd", gff_first: "Ida", gff_last: "Moss", gff_phone: "555-1", gff_city: "Vero", gff_zip: "32960",
    gff_sqft: "1200", gff_start_date: "2027-01-05", gff_ratelock: "1", gff_agree: "yes", gff_reservation: "consult", gff_crops: ["Okra", "Dill", "Plum"],
    gff_addons: ["pollinator", "headstart", "pollinator"], gff_workshop_interest: "yes",
  }),
  full({ gff_offer: "spire", gff_email: "spire.full@example.com", gff_address: "2 Grove Rd", gff_sqft: "2500.7", gff_reservation: "down_payment", gff_three_sisters_optin: "1",
    gff_farm_layout: J({ offer: "spire", towers_plants: [{ tower: 1, plants: ["Basil"] }, { tower: 2, plants: [] }, { tower: 3 }] }), gff_addons: ["bundle", "starfruit"] }),
  full({ gff_offer: "both", gff_email: "nofirst@example.com", gff_address: "3 Grove Rd", gff_sqft: "abc", gff_reservation: "none" }),
  full({ gff_offer: "spire", gff_email: "work@example.com", gff_address: "4 Grove Rd", gff_sqft: "0", gff_reservation: "workshop", gff_farm_layout: J({ offer: "spire" }) }),
  full({ gff_offer: "sunrise", gff_email: "zero@example.com", gff_address: "5 Grove Rd", gff_reservation: "none", gff_first: "0", gff_farm_layout: J({ offer: "sunrise", seasonal_spots: ["Kale"] }) }),

  // ---- The lead form ----
  { uid: 0, action: "@page", post: { gff_lead_submit: "1" }, tag: "lead" },
  lead({ gff_company_url: "x" }),
  lead({ gff_first: "Lu", gff_email: "x" }),
  lead({ gff_first: "Lu", gff_last: "Ng", gff_email: "lead2@example.com", gff_phone: "555-2", gff_city: "Jensen Beach" }),
  lead({ gff_first: "Lucy", gff_last: "Ng", gff_email: "LEAD2@example.com", gff_phone: "555-3", gff_city: "Stuart" }),
  lead({ gff_first: "<i>Al</i>", gff_last: "Bo", gff_email: "al@example.com", gff_phone: "1", gff_city: "x" }),

  // ---- The Spire flow ----
  { uid: 0, action: "@page", post: { gff_tower_submit: "1" }, tag: "tower" },
  tower({ gff_company_url: "x", gff_email: "a@b.co" }),
  tower({ gff_email: "nope", gff_tower_qty: "4" }),
  tower({ gff_email: "t1@example.com", gff_tower_qty: "2" }),
  tower({ gff_email: "t1@example.com", gff_tower_qty: "1", gff_agree: "yes", gff_reservation: "bogus", gff_first: "Tia" }),
  tower({ gff_email: "t2@example.com", gff_tower_qty: "3", gff_agree: "yes", gff_reservation: "consult", gff_phone: "9", gff_address: "6 Sea Ave", gff_city: "Hobe", gff_zip: "33455",
    gff_farm_layout: J({ offer: "spire", towers_plants: [{ tower: 1, plants: ["Mint", "Thyme"] }] }), gff_workshop_interest: "yes" }),
  tower({ gff_email: "t3@example.com", gff_tower_qty: "250", gff_agree: "yes", gff_reservation: "workshop", gff_farm_layout: J({ offer: "sunrise" }) }),
  tower({ gff_email: "t4@example.com", gff_tower_qty: "-5", gff_agree: "yes", gff_reservation: "down_payment" }),
  // An express customer adding Spires: the 10% member discount on the first tower.
  tower({ gff_email: "full.form@example.com", gff_tower_qty: "2", gff_agree: "yes", gff_reservation: "none" }, 4),
  tower({ gff_email: "enroll@example.com", gff_tower_qty: "1", gff_agree: "yes", gff_reservation: "consult" }),
];
