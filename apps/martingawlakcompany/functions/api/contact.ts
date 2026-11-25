import type { Env } from "../env";

/**
 * POST /api/contact  (form fields: name, email, phone, message, company[honeypot])
 * Hands the message to the accounts Worker's Mailer (Cloudflare Email Sending),
 * which sends it to hello@martingawlakcompany.com.
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
  const sent = env.MAILER ? await env.MAILER.contact({ name, email, phone, message }).catch(() => false) : false;
  return back(sent ? "1" : "error");
};
