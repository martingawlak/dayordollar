import type { SsoEnv } from "@mgc/sso";
import type { AccountsBinding } from "./account-panel";

export interface Env extends SsoEnv {
  STRIPE_SECRET_KEY: string;
  /**
   * "1": signed-in buyers check out as their one Stripe Customer shared with
   * the other sites (functions/api/checkout.ts). Unset: as today, by email.
   * Turn on only after the key gains Customers: Write.
   */
  STRIPE_SHARED_CUSTOMER?: string;
  /** The accounts Worker's private Mailer entrypoint (Cloudflare Email Sending). */
  /** The accounts Worker's private Members entrypoint: the shared Inbox (functions/account-panel.ts). */
  INBOX?: AccountsBinding;
  MAILER: { contact(m: { name: string; email: string; phone: string; message: string }): Promise<boolean> };
}
