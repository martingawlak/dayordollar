/**
 * /llms.txt and /sitemap.xml: a plain guide to the site for AI models and
 * search engines (Martin, 2026-11-27). Facts only, taken from the site's own
 * pages; keep it in step with them. Personal garden links are left out.
 */
const ORIGIN = "https://gawlakfamilyfarms.com";

const PAGES: [string, string, string][] = [
  ["/", "Gawlak Family Farms", "The offer, the two starting options, pricing and the service agreement; sign up here."],
  ["/shop/", "Shop", "The Gawlak Family Legacy Starter Deck (100 cards, $60)."],
  ["/go/", "Add to your phone", "Add the farm to your Home Screen."],
  ["/account/", "Account", "Your farm account and invoices."],
];

export const LLMS_TXT = `# Gawlak Family Farms

> Local organic permaculture in Fort Pierce, Florida: "your own farm that comes with a farmer." Gawlak Family Farms designs, installs and maintains a working food and flower garden on the customer's property, and someone comes every week to keep it alive.

The offer:

- Two ways to start, both $300 a month: the Zora Sunrise Module, in the ground, up to 1,500 sq ft (the largest module the property allows); or Three Spire Towers, in the air, which fit anywhere. Every farm goes on to grow self-propagating Spires.
- The monthly fee covers design, installation, planting, materials, soil biology, maintenance, seasonal replanting and system management. It does not increase for as long as service continues.
- The farm guarantees at least $300 a month in food harvest value once the system reaches steady production (typically by month 3), at current Treasure Coast farmers market prices.
- Getting started: a $250 design consult for properties in or near ZIP 34982, credited in full toward the $772 starter fee (consult, design, build, install, the first month's service and the propagation program). Limited spots, Fort Pierce only.

Contact: (772) 924-7459.

Accounts: one sign-in shared with the other Martin Gawlak Company sites (accounts.martingawlakcompany.com), by email code or Google.

## Pages

${PAGES.map(([p, t, d]) => `- [${t}](${ORIGIN}${p}): ${d}`).join("\n")}
`;

export const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map(([p]) => `  <url><loc>${ORIGIN}${p}</loc></url>`).join("\n")}
</urlset>
`;
