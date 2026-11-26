export interface Env {
  DB: D1Database;
  /** Shared accounts service, e.g. https://accounts.martingawlakcompany.com/api/auth */
  SSO_ISSUER: string;
  SSO_CLIENT_ID: string;
  SSO_CLIENT_SECRET: string;
  /** Signs this site's session cookie. */
  SESSION_SECRET: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** This site's address, for links in emails (default https://gawlakfamilyfarms.com). */
  SITE_ORIGIN?: string;
  /** Google's geocoding key: the plugin kept it in wp_options (gff_google_geocode_key); now a Worker secret. */
  GOOGLE_GEOCODE_KEY?: string;
  /** Tests only: when present, mail is recorded here instead of sent. */
  MAIL_LOG?: { to: string; subject: string; body: string; headers?: unknown }[];
  /** Local development only: enables /auth/dev-login. Never set in production. */
  DEV_LOGIN?: string;
}
