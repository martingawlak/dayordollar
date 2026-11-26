/**
 * The plugin's fixed catalogues and prices (gff-customer-registration.php
 * §2–4 and the add-ons): crops, add-ons and the bundle, the offers, the
 * reservation options and their PayPal links. Same values, same order.
 */
import { type Ctx, opt } from "../ctx";
import { escUrlRaw } from "../wpfn";
import { rawurlencode, truthy } from "../php";

/** gff_reg_crops(): the crop checklist, matching the printed flyer. */
export const crops = (): Record<string, string[]> => ({
  Edibles: [
    "Tomatoes", "Cherry tomatoes", "Everglades tomato", "Peppers", "Hot peppers",
    "Lettuce & greens", "Broccoli", "Cauliflower", "Cabbage", "Kale", "Collards",
    "Swiss chard", "Mustard greens", "Spinach", "Longevity spinach", "Bok choy",
    "Carrots", "Beets", "Radish", "Onions", "Green onions", "Peas", "Bush beans",
    "Pole beans", "Southern peas", "Pigeon pea", "Squash & zucchini", "Cucumbers",
    "Watermelon", "Cantaloupe", "Okra", "Sweet potato", "Seminole pumpkin", "Strawberries",
  ],
  Flowers: [
    "Sweet pea", "Snapdragon", "Bachelor's button", "Nasturtium", "Pansy / viola",
    "Zinnia", "Sunflower", "Cosmos", "Marigold", "Celosia", "Portulaca", "Vinca",
    "Morning glory", "Coreopsis",
  ],
  Herbs: [
    "Cilantro", "Dill", "Parsley", "Fennel", "Basil", "Lemongrass", "Ginger / turmeric",
    "Rosemary", "Oregano", "Mint", "Thyme",
  ],
  "Trees & Shrubs": ["Cranberry hibiscus", "Moringa"],
});
/** Every crop name, flattened in order. */
export const allCrops = () => Object.values(crops()).flat();

/** gff_reg_agreement_version() */
export const agreementVersion = () => "6.0 (2026-07)";

/** gff_v33_offers() */
export const offers = () => ["sunrise", "spire", "both"];

export interface Addon { emoji: string; power: string; name: string; desc: string; price: number; value: number; icon: string; paypal_url: string }
/** gff_reg_addons() */
export const addons = (): Record<string, Addon> => ({
  workshop: {
    emoji: "🎟️", power: "Wizard&rsquo;s Apprenticeship", name: "The Business of Abundance Workshop",
    desc: "A seat at our monthly Fort Pierce workshop — JADAM, lazy-gardening, and abundance principles for any business or career. Every attendee gets a free surprise plant.",
    price: 50, value: 120, icon: "wizard", paypal_url: "",
  },
  starfruit: {
    emoji: "🌳", power: "Funny Comet", name: "Starfruit Tree",
    desc: "A grafted, fruit-bearing starfruit tree planted right in your module — yours to harvest for years.",
    price: 75, value: 175, icon: "comet", paypal_url: "",
  },
  strawberry: {
    emoji: "🍓", power: "Children&rsquo;s Mead", name: "Strawberry Patch",
    desc: "10 producing strawberry plants, installed and ready to fruit.",
    price: 45, value: 120, icon: "mead", paypal_url: "",
  },
  pollinator: {
    emoji: "🦋", power: "Faerie Food", name: "Butterfly Pollinator Border",
    desc: "A ~30 sq ft flowering border that draws butterflies and bees — beautiful, and good for every crop around it.",
    price: 60, value: 150, icon: "faerie", paypal_url: "",
  },
  headstart: {
    emoji: "🌱", power: "Time Travel Boots", name: "Nursery Head-Start + Microgreens Trial",
    desc: "We pre-grow your module&rsquo;s plants at our nursery so they&rsquo;re established the day your soil is ready — plus 4 weeks of weekly black-oil sunflower microgreens to harvest while you wait.",
    price: 50, value: 180, icon: "boots", paypal_url: "",
  },
});
/** gff_reg_bundle() */
export const bundle = () => ({
  emoji: "🌟", power: "The Abundance Bundle", name: "Every bounty, claimed at once",
  desc: "Wizard&rsquo;s Apprenticeship, Funny Comet, Children&rsquo;s Mead, Faerie Food, and Time Travel Boots — every power-up, bundled into one.",
  price: 175, icon: "bundle",
});

/** gff_reg_paypal_link(): the gff_reg_paypal_link setting, else the default NCP link. (GFF_PAYPAL_LINK, a wp-config constant, was never set.) */
export function paypalLink(c: Ctx): string {
  const o = opt(c, "gff_reg_paypal_link", "");
  if (truthy(o)) return escUrlRaw(o);
  return "https://www.paypal.com/ncp/payment/YBGEYKG9KCFWC";
}
/** gff_reg_paypal_payment_url( $amount ) */
export function paypalPaymentUrl(c: Ctx, amount = "100"): string {
  const base = paypalLink(c);
  if (base.toLowerCase().includes("paypal.me")) return base.replace(/\/+$/, "") + "/" + rawurlencode(amount);
  return base;
}
/** gff_reg_consult_amount() */
export const consultAmount = () => "250.00";

/** gff_reg_reservation_meta( $option ): amount, PayPal link and label of a reservation option. */
export function reservationMeta(c: Ctx, option: string): { amount: string; url: string; label: string } {
  switch (option) {
    case "consult": return { amount: "250.00", url: "https://www.paypal.com/ncp/payment/XJYNQSNDSDE5S", label: "$250 Design Consult" };
    case "down_payment": return { amount: "100.00", url: paypalLink(c), label: "$100 Down Payment + 48hr (legacy)" };
    case "workshop": return { amount: "120.00", url: "https://www.paypal.com/ncp/payment/9Z672HWTB8KM4", label: "Monthly Workshop ($120) (legacy)" };
    default: return { amount: "0.00", url: "", label: "No upfront payment" };
  }
}

/* ---- Spire (tower) pricing: $100 first tower, $50 each more, the 3rd free at 3+, cap 100 ---- */
export const towerFirstPrice = () => 100;
export const towerAddlPrice = () => 50;
export const towerMax = () => 100;
export const towerFoodValue = () => 100;
export const towerCrosssellPct = () => 10;
/** gff_reg_tower_total( $qty ): the monthly for a tower count. */
export function towerTotal(qty: number): number {
  qty = Math.max(0, Math.min(Math.trunc(qty), towerMax()));
  if (qty <= 0) return 0;
  let total = towerFirstPrice() + (qty - 1) * towerAddlPrice();
  if (qty >= 3) total -= towerAddlPrice();
  return total;
}
/** gff_reg_tower_full_reference( $qty ): every tower at full price. */
export const towerFullReference = (qty: number) => Math.max(0, Math.min(Math.trunc(qty), towerMax())) * towerFirstPrice();
