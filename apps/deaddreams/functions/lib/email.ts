import type { Env } from "../env.ts";
import { escapeHtml, showDate } from "./util.ts";
import type { orderView } from "./db.ts";

type View = NonNullable<Awaited<ReturnType<typeof orderView>>>;

/** Email the buyer a link to their tickets. Skipped (logged) without RESEND_API_KEY. */
export async function sendTicketsEmail(env: Env, origin: string, order: View, to: string) {
  if (!env.RESEND_API_KEY) {
    console.log(`RESEND_API_KEY not set; tickets for ${order.code} not emailed`);
    return;
  }
  const link = `${origin}/order/?id=${order.id}`;
  const e = order.event;
  const n = order.quantity;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject: `Your ${n === 1 ? "ticket" : `${n} tickets`}: ${e.title}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#232323">
        <p>Hi ${escapeHtml(order.name)},</p>
        <p>You're in. ${n === 1 ? "Your ticket is" : `Your ${n} tickets are`} ready:</p>
        <p style="font-size:18px"><strong>${escapeHtml(e.title)}</strong><br>
          ${escapeHtml(showDate(e.startsAt))}${e.venue ? ` · ${escapeHtml(e.venue)}` : ""}</p>
        <p><a href="${link}" style="display:inline-block;background:#ff00e1;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">Show my tickets</a></p>
        <p style="color:#6b6b6b;font-size:13px">Show the QR code at the door. Order ${escapeHtml(order.code)}.</p>
      </div>`,
    }),
  });
  if (!res.ok) console.error("Resend failed", res.status, await res.text());
}
