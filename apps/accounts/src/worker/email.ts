import type { Env } from "./env";

export async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}

export function signInCodeEmail(code: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:28rem">
  <p>Your Martin Gawlak Company sign-in code is:</p>
  <p style="font-size:2rem;font-weight:700;letter-spacing:.2em">${code}</p>
  <p style="color:#666">It expires in 5 minutes. If you didn't ask for this, you can ignore this email.</p>
</div>`;
}
