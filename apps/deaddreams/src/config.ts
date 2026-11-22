/**
 * Dead Dreams Booking settings shared by the pages and the server.
 * Payment handles start as the Iced Marty page's; change them to whoever
 * collects for Dead Dreams. A blank handle hides that payment button.
 */
export const SITE = {
  name: "Dead Dreams Booking",
  shortName: "Dead Dreams",
  tagline: "Live music booking and events",
  url: "https://deaddreamsbooking.com",
  /** Every event time is entered and shown in this zone. */
  timeZone: "America/New_York",
  /** The Facebook Page events get promoted from. Blank hides the link. */
  facebookPage: "",
};

export const PAYMENTS = {
  /** Card, Apple Pay and Google Pay through Stripe Checkout. */
  card: true,
  cashtag: "$martingawlak",
  venmoUser: "martingawlak",
  paypalMe: "ordinarymartinn",
  zelle: { name: "", contact: "(772) 924-9229" },
};

/** Ticket price a new show starts with; each show's price can be changed in the admin. */
export const DEFAULT_PRICE_CENTS = 1000;

/** "Another day" (no tip) or "Another dollar" ($1 for the artists), per order. */
export const TIP_OPTIONS_CENTS = [0, 100];

export type PayMethod = "card" | "cashapp" | "venmo" | "paypal" | "zelle";

export function enabledMethods(): PayMethod[] {
  const m: PayMethod[] = [];
  if (PAYMENTS.card) m.push("card");
  if (PAYMENTS.cashtag) m.push("cashapp");
  if (PAYMENTS.venmoUser) m.push("venmo");
  if (PAYMENTS.paypalMe) m.push("paypal");
  if (PAYMENTS.zelle.contact) m.push("zelle");
  return m;
}

/** Deep link that opens the payment app with the amount (and note, where the app allows it). */
export function payLink(method: PayMethod, totalCents: number, note: string): string {
  const amt = (totalCents / 100).toFixed(2);
  switch (method) {
    case "cashapp":
      return `https://cash.app/$${encodeURIComponent(PAYMENTS.cashtag.replace(/^\$/, ""))}/${amt}`;
    case "venmo":
      return `https://venmo.com/${encodeURIComponent(PAYMENTS.venmoUser.replace(/^@/, ""))}?txn=pay&amount=${amt}&note=${encodeURIComponent(note)}`;
    case "paypal":
      return `https://paypal.me/${encodeURIComponent(PAYMENTS.paypalMe)}/${amt}USD`;
    default:
      return "";
  }
}

export const METHOD_LABEL: Record<string, string> = {
  card: "Card",
  cashapp: "Cash App",
  venmo: "Venmo",
  paypal: "PayPal",
  zelle: "Zelle",
  comp: "Comp",
  free: "Free",
};
