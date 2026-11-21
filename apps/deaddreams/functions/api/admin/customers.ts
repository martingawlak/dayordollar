import type { Env } from "../../env.ts";
import { json } from "../../lib/util.ts";

/** GET /api/admin/customers[?format=csv]  everyone who has ordered, with totals. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.email, c.phone, c.marketing_opt_in, c.created_at,
       COUNT(CASE WHEN o.status = 'paid' THEN 1 END) AS orders,
       COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.quantity END), 0) AS tickets,
       COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.total_cents END), 0) AS spent_cents,
       MAX(o.created_at) AS last_order_at
     FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
     GROUP BY c.id ORDER BY last_order_at DESC LIMIT 5000`,
  ).all<Record<string, string | number | null>>();

  if (new URL(request.url).searchParams.get("format") !== "csv") return json({ customers: results });
  const cols = ["name", "email", "phone", "marketing_opt_in", "orders", "tickets", "spent_cents", "created_at", "last_order_at"];
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // keep spreadsheets from running it as a formula
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...results.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="dead-dreams-customers.csv"`,
      "cache-control": "no-store",
    },
  });
};
