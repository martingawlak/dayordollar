import type { Env } from "./env";

/**
 * Mail goes out through Resend when RESEND_API_KEY is set (the sending domain,
 * martingawlakcompany.com, is verified there). Otherwise through Cloudflare
 * Email Sending (the `send_email` binding) — which, on the Workers Free plan,
 * only delivers to the account's verified destination addresses.
 */
export async function sendEmail(env: Env, to: string, subject: string, html: string, text?: string): Promise<void> {
  const plain = text ?? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`, to: [to], subject, html, text: plain }),
    });
    if (!res.ok) throw new Error(`Email not sent (${res.status}): ${await res.text()}`);
    return;
  }
  if (!env.EMAIL) throw new Error("Email sending is not set up (no RESEND_API_KEY or EMAIL binding)");
  await env.EMAIL.send({ to, from: { email: env.EMAIL_FROM_ADDRESS, name: env.EMAIL_FROM_NAME }, subject, html, text: plain });
}

export function signInCodeEmail(code: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:28rem">
  <p>Your Martin Gawlak Company sign-in code is:</p>
  <p style="font-size:2rem;font-weight:700;letter-spacing:.2em">${code}</p>
  <p style="color:#666">It expires in 5 minutes. If you didn't ask for this, you can ignore this email.</p>
</div>`;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A website contact-form message, formatted for the inbox. */
export function contactEmail(m: { name: string; email: string; phone: string; message: string }): { subject: string; html: string; text: string } {
  return {
    subject: `Website message from ${m.name} <${m.email}>`,
    html: `<p><strong>${escape(m.name)}</strong> &lt;${escape(m.email)}&gt;${m.phone ? ` · ${escape(m.phone)}` : ""}</p>
<p style="white-space:pre-wrap">${escape(m.message)}</p>
<p style="color:#666">Reply to ${escape(m.email)} to answer.</p>`,
    text: `${m.name} <${m.email}>${m.phone ? ` · ${m.phone}` : ""}\n\n${m.message}\n\nReply to ${m.email} to answer.`,
  };
}
