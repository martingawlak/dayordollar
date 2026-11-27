/**
 * /llms.txt and /sitemap.xml: a plain guide to the site for AI models and
 * search engines (Martin, 2026-11-27). Facts only, taken from the site's own
 * pages and the team plugin; keep it in step with them. Members-only pages
 * are named but not described beyond what a visitor is told.
 */
const ORIGIN = "https://fppm.us";

const PAGES: [string, string, string][] = [
  ["/", "Fort Pierce Purple Martins FC", "Join the club: as a fan (free), a player ($10 dues) or a supporter ($25 and up, with a team tee and a 10% merch code); the liability waiver and the club oath are signed when joining."],
  ["/go/", "Go", "The same join form, the link members share to recruit others."],
  ["/account/", "Account", "Members only: dues, your member promo code, the schedule with RSVPs and calendar links, team updates, the team store, and your details."],
  ["/roster/", "Roster", "Members only: the coaching staff and the Saturday conditioning sessions."],
];

export const LLMS_TXT = `# Fort Pierce Purple Martins FC

> An adult soccer club in Fort Pierce, Florida, playing in the United Premier Soccer League (UPSL). Every member — fan, player or supporter — is part of the "Litty Committee".

- Fans join free and get team updates.
- Players pay $10 dues, try out and compete; open conditioning is held every Saturday at 8am at the Dan McCarty track.
- Supporters contribute $25 or more and get a team tee and a personal 10% off code for the merch store.
- Everyone signs a liability waiver and takes the club oath when joining.
- Apparel ships on demand through Printful; dues and contributions are paid by PayPal.

The site is members-only: signed-out visitors are sent to the join page. Accounts: one sign-in shared with the other Martin Gawlak Company sites (accounts.martingawlakcompany.com), by email code or Google.

## Pages

${PAGES.map(([p, t, d]) => `- [${t}](${ORIGIN}${p}): ${d}`).join("\n")}
`;

export const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.slice(0, 2).map(([p]) => `  <url><loc>${ORIGIN}${p}</loc></url>`).join("\n")}
</urlset>
`;
