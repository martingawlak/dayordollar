import type { SsoEnv } from "@mgc/sso";

export interface Env extends SsoEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  /** PayPal REST app (developer.paypal.com > Apps & Credentials). The client id is public. */
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  /** "live" (default) or "sandbox" for test payments. */
  PAYPAL_ENV?: string;
  /** Testing only: send PayPal API calls here instead of PayPal. */
  PAYPAL_API_BASE?: string;
  /** The Dead Dreams Facebook Page, for importing its events (Page id + long-lived Page access token). */
  FB_PAGE_ID?: string;
  FB_PAGE_TOKEN?: string;
  /** Testing only: send Facebook Graph calls here. */
  FB_GRAPH_BASE?: string;
  /** Only when PAYMENTS.cardProvider is "stripe". */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
  ADMIN_EMAILS: string;
  DOOR_EMAILS?: string;
  /** Local development only (honored on localhost): act as this staff member. */
  DEV_STAFF_EMAIL?: string;
}
