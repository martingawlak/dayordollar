import type { Env } from "../env";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * POST /api/contact  (form fields: name, email, phone, message, company[honeypot])
 * Emails the message to CONTACT_TO through Resend, replying-to the sender.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const form = await request.formData();
  const field = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const back = (status: string) => Response.redirect(new URL(`/contact/?sent=${status}`, request.url).toString(), 303);

  // Bots fill the hidden "company" field; pretend success.
  if (field("company", 200)) return back("1");

  const name = field("name", 200);
  const email = field("email", 320);
  const phone = field("phone", 50);
  const message = field("message", 5000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) return back("invalid");
  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set; contact form message dropped");
    return back("error");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: [env.CONTACT_TO],
      reply_to: email,
      subject: `Website message from ${name}`,
      html: `<p><strong>${escape(name)}</strong> &lt;${escape(email)}&gt;${phone ? ` · ${escape(phone)}` : ""}</p>
             <p style="white-space:pre-wrap">${escape(message)}</p>`,
    }),
  });
  if (!res.ok) console.error("Resend failed", res.status, await res.text());
  return back(res.ok ? "1" : "error");
};
