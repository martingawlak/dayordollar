import type { SsoEnv } from "@mgc/sso";

export interface Env extends SsoEnv {
  STRIPE_SECRET_KEY: string;
  RESEND_API_KEY?: string;
  CONTACT_TO: string;
  CONTACT_FROM: string;
}
