import type { SsoEnv } from "@mgc/sso";

export interface Env extends SsoEnv {
  STRIPE_SECRET_KEY: string;
  /** The accounts Worker's private Mailer entrypoint (Cloudflare Email Sending). */
  MAILER: { contact(m: { name: string; email: string; phone: string; message: string }): Promise<boolean> };
}
