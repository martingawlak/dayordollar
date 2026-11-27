import type { AccountsBinding } from "./account-panel";

export interface Env {
  /** The accounts service's private Members entrypoint: the shared Inbox (src/account-panel.ts). */
  ACCOUNTS?: AccountsBinding;
  DB: D1Database;
  /** Shared accounts service, e.g. https://accounts.martingawlakcompany.com/api/auth */
  SSO_ISSUER: string;
  SSO_CLIENT_ID: string;
  SSO_CLIENT_SECRET: string;
  /** Signs this site's session cookie. */
  SESSION_SECRET: string;
  /** Mail: Resend when RESEND_API_KEY is set, else Cloudflare Email Sending (the EMAIL binding). */
  EMAIL?: SendEmail;
  RESEND_API_KEY?: string;
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_FROM_NAME?: string;
  /** Where replies go when a message sets no Reply-To of its own. */
  EMAIL_REPLY_TO?: string;
  /** This site's address (default https://fppm.us). */
  SITE_ORIGIN?: string;
  /** The store's PayPal REST app secret: the plugin's fppm_pp_secret setting, now a Worker secret. */
  PAYPAL_SECRET?: string;
  /** The store's Printful API token: the plugin's fppm_printful_token setting, now a Worker secret. */
  PRINTFUL_TOKEN?: string;
  /** The waiver Sheet's Google service-account key (the JSON file, whole): the plugin's fppm_gs_json setting. */
  GOOGLE_SA_JSON?: string;
  /** Tests only: when present, mail is recorded here instead of sent. */
  MAIL_LOG?: { to: string; subject: string; body: string; headers?: unknown }[];
  /** Local development only: enables /auth/dev-login. Never set in production. */
  DEV_LOGIN?: string;
}
