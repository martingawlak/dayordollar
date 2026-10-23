import { oauthProvider } from "@better-auth/oauth-provider";
import { brandOrigins } from "@mgc/brands";
import { betterAuth } from "better-auth";
import { admin, emailOTP, jwt } from "better-auth/plugins";
import { sendEmail, signInCodeEmail } from "./email";
import type { Env } from "./env";
import { privy } from "./privy";

/**
 * One account per email address, whichever way someone signs in: email code,
 * Google, Apple or Privy all land on the same user. Every brand site signs in
 * through this service over OpenID Connect.
 */
export function createAuth(env: Env) {
  const adminEmails = new Set(
    env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  );

  const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
      appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
    };
  }

  return betterAuth({
    appName: "Martin Gawlak Company",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [env.BETTER_AUTH_URL, ...brandOrigins, "https://appleid.apple.com"],
    socialProviders,
    account: {
      accountLinking: {
        enabled: true,
        // Providers that verify email ownership; signing in with any of them
        // joins the existing account for that email.
        trustedProviders: ["google", "apple", "email-otp", "privy"],
      },
    },
    user: {
      deleteUser: { enabled: true },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, role: adminEmails.has(user.email.toLowerCase()) ? "admin" : "user" },
          }),
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        // Sign-in codes create the account on first use.
        async sendVerificationOTP({ email, otp }) {
          if (!env.RESEND_API_KEY && env.BETTER_AUTH_URL.startsWith("http://localhost")) {
            console.log(`[dev] sign-in code for ${email}: ${otp}`);
            return;
          }
          await sendEmail(env, email, `${otp} is your sign-in code`, signInCodeEmail(otp));
        },
      }),
      privy({ appId: env.PRIVY_APP_ID, verificationKey: env.PRIVY_VERIFICATION_KEY }),
      admin(),
      jwt(),
      oauthProvider({
        loginPage: "/sign-in",
        consentPage: "/consent",
        scopes: ["openid", "profile", "email", "offline_access"],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
