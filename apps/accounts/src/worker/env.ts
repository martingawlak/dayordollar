export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  /** Comma-separated emails that get the admin role when they sign up. */
  ADMIN_EMAILS: string;
  /** Cloudflare Email Sending binding ([[send_email]] in wrangler.toml). */
  EMAIL?: { send(message: { to: string; from: { email: string; name: string }; subject: string; html: string; text: string }): Promise<unknown> };
  /** Resend API key; when set, mail goes through Resend instead of the EMAIL binding. */
  RESEND_API_KEY?: string;
  EMAIL_FROM_ADDRESS: string;
  EMAIL_FROM_NAME: string;
  /** Where website contact-form messages go. */
  CONTACT_TO: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_IDENTIFIER?: string;
  PRIVY_APP_ID?: string;
  /** The PEM "Verification key" from the Privy dashboard. */
  PRIVY_VERIFICATION_KEY?: string;
}
