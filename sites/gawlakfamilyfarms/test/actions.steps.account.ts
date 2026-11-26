/** Steps for the account page's AJAX (planner autosave, crop toggle) and the consent start (gff_v34_consent). */
import type { Step } from "./actions.steps";

const J = (v: unknown) => JSON.stringify(v);
const A = (uid: number, action: string, post: Record<string, string | string[]>, tag = "account"): Step => ({ uid, action, post, tag });

export const STEPS_ACCOUNT: Step[] = [
  // Planner autosave: signed out (admin-ajax's "0"), nothing usable, a Spire layout, a Sunrise one with the moringa upgrade.
  A(0, "gff_planner_autosave", { nonce: "x", gff_farm_layout: J({ offer: "spire", towers_plants: [{ tower: 1, plants: ["Kale"] }] }) }),
  A(18, "gff_planner_autosave", { nonce: "x" }),
  A(18, "gff_planner_autosave", { nonce: "x", gff_farm_layout: J({ offer: "spire", towers_plants: [{ tower: 1, plants: ["Nope"] }] }) }),
  A(18, "gff_planner_autosave", { nonce: "x", gff_farm_layout: J({ offer: "spire", towers_plants: [{ tower: 1, plants: ["Kale", "Basil"] }, { tower: 2, plants: ["Mint"] }] }) }),
  A(24, "gff_planner_autosave", { nonce: "x", gff_farm_layout: J({ offer: "sunrise", seasonal_spots: ["Okra", "Dill"], moringa_fruit_upgrade: true }) }),
  A(24, "gff_planner_autosave", { nonce: "x", gff_farm_layout: J({ offer: "", seasonal_spots: ["Okra"] }) }),
  // Crop toggle: customers may not; staff and the admin may; missing data; on, on again, off.
  A(18, "gff_crop_toggle", { uid: "18", crop: "Kale", on: "1", nonce: "x" }),
  A(30, "gff_crop_toggle", { uid: "0", crop: "Kale", on: "1", nonce: "x" }),
  A(30, "gff_crop_toggle", { uid: "18", crop: " ", on: "1", nonce: "x" }),
  A(30, "gff_crop_toggle", { uid: "18", crop: "Kale", on: "1", nonce: "x" }),
  A(1, "gff_crop_toggle", { uid: "18", crop: "Mint", on: "1", nonce: "x" }),
  A(1, "gff_crop_toggle", { uid: "18", crop: "Kale", on: "0", nonce: "x" }),
  A(33, "gff_crop_toggle", { uid: "24", crop: "Okra", nonce: "x" }),
  A(33, "gff_crop_toggle", { uid: "24", crop: "Okra", on: "1", nonce: "x" }),
  // Consent: signed out (parked under a token, in the queue), with and without a valid offer; signed in (on the user).
  A(0, "gff_v34_consent", { nonce: "x", offer: "spire" }, "consent"),
  A(0, "gff_v34_consent", { nonce: "x", offer: "lawn" }, "consent"),
  A(0, "gff_v34_consent", { nonce: "x" }, "consent"),
  A(29, "gff_v34_consent", { nonce: "x", offer: "both" }, "consent"),
  A(29, "gff_v34_consent", { nonce: "x", offer: "nope" }, "consent"),
];
