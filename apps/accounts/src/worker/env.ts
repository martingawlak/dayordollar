export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  /** Comma-separated emails that get the admin role when they sign up. */
  ADMIN_EMAILS: string;
  EMAIL_FROM: string;
  RESEND_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_IDENTIFIER?: string;
  PRIVY_APP_ID?: string;
  /** The PEM "Verification key" from the Privy dashboard. */
  PRIVY_VERIFICATION_KEY?: string;
}
