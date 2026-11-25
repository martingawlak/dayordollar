/**
 * Every Martin Gawlak Company brand, in menu order. This list drives the shared
 * brand menu on every site and the allowed sign-in return URLs on the accounts
 * service, so a new brand only needs to be added here.
 */
export interface Brand {
  id: string;
  name: string;
  url: string;
  /** One line for menus and the brand grid. Left empty until Martin writes one. */
  tagline?: string;
  /** Own domain (as opposed to a section of martingawlakcompany.com). */
  domain?: string;
}

export const ACCOUNTS_URL = "https://accounts.martingawlakcompany.com";

export const brands: Brand[] = [
  {
    id: "mgc",
    name: "Martin Gawlak Company",
    url: "https://martingawlakcompany.com/",
    tagline: "Prolific strategic equity",
    domain: "martingawlakcompany.com",
  },
  {
    id: "bandturo",
    name: "Bandturo",
    url: "https://bandturo.com/",
    tagline: "Tour Booking PartyStarter™ Dream Machine",
    domain: "bandturo.com",
  },
  {
    id: "dayordollar",
    name: "DayorDollar",
    url: "https://dayordollar.com/",
    tagline: "The label that puts 100% of its profits into its artists",
    domain: "dayordollar.com",
  },
  {
    id: "deaddreams",
    name: "Dead Dreams Booking",
    url: "https://deaddreamsbooking.com/",
    tagline: "Live music booking and events",
    domain: "deaddreamsbooking.com",
  },
  {
    id: "babyzora",
    name: "BabyZoraGawlak.com",
    url: "https://babyzoragawlak.com/",
    tagline: "Who are you today?",
    domain: "babyzoragawlak.com",
  },
  {
    id: "fppm",
    name: "Fort Pierce Purple Martins",
    url: "https://fppm.us/",
    domain: "fppm.us",
  },
  {
    id: "familybank",
    name: "$GAWLAK Family Bank",
    url: "https://martingawlakcompany.com/rainbowgun/",
    tagline: "The $GAWLAK creator coin",
  },
  {
    id: "gff",
    name: "Gawlak Family Farms",
    url: "https://gawlakfamilyfarms.com/",
  },
];

/** Origins allowed to receive sign-ins from the accounts service. */
export const brandOrigins: string[] = [
  ...new Set(brands.map((b) => new URL(b.url).origin)),
];
