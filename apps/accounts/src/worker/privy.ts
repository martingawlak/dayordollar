/**
 * Sign in with Privy, merged into the same user as every other login method.
 *
 * The browser signs in with Privy, then posts its Privy identity token here.
 * We verify it with the app's verification key, take the user's verified email
 * from it, and attach a "privy" account to the user with that email (creating
 * the user if needed). Wallet addresses are kept on the account row.
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { importSPKI, jwtVerify } from "jose";
import * as z from "zod";

interface PrivyLinkedAccount {
  type: string;
  address?: string;
  email?: string;
  name?: string;
  chain_type?: string;
}

export interface PrivyOptions {
  appId?: string;
  verificationKey?: string;
}

export const privy = (options: PrivyOptions) =>
  ({
    id: "privy",
    endpoints: {
      signInPrivy: createAuthEndpoint(
        "/sign-in/privy",
        {
          method: "POST",
          body: z.object({
            idToken: z.string().min(1),
            /** Signed OAuth request when signing in to a brand site (handled by oauth-provider). */
            oauth_query: z.string().optional(),
          }),
        },
        async (ctx) => {
          if (!options.appId || !options.verificationKey) {
            throw new APIError("NOT_FOUND", { message: "Privy sign-in is not enabled" });
          }
          let linked: PrivyLinkedAccount[];
          let subject: string;
          try {
            const key = await importSPKI(options.verificationKey.replace(/\\n/g, "\n"), "ES256");
            const { payload } = await jwtVerify(ctx.body.idToken, key, {
              issuer: "privy.io",
              audience: options.appId,
              algorithms: ["ES256"],
            });
            subject = String(payload.sub);
            linked = JSON.parse(String(payload.linked_accounts ?? "[]"));
          } catch {
            throw new APIError("UNAUTHORIZED", { message: "Invalid Privy token" });
          }

          // Privy only lists email / Google / Apple accounts after verifying them.
          const emailAccount =
            linked.find((a) => a.type === "email" && a.address) ??
            linked.find((a) => (a.type === "google_oauth" || a.type === "apple_oauth") && a.email);
          const email = (emailAccount?.address ?? emailAccount?.email)?.toLowerCase();
          if (!email) {
            throw new APIError("BAD_REQUEST", {
              message: "Add an email address to your Privy login so we can find your account.",
            });
          }
          const wallets = linked.filter((a) => a.type === "wallet" && a.address).map((a) => a.address!);
          const name = linked.find((a) => a.name)?.name ?? email.split("@")[0];

          const adapter = ctx.context.internalAdapter;
          const existing = await adapter.findUserByEmail(email, { includeAccounts: true });
          let user = existing?.user;
          if (!user) {
            user = await adapter.createUser({ email, name, emailVerified: true }, { method: "privy" });
          } else if (!user.emailVerified) {
            // Someone started an account with this email but never proved they own it.
            // Don't hand that account to whoever signs in next.
            throw new APIError("FORBIDDEN", { message: "Sign in with an email code first to confirm this email." });
          }
          const privyAccount = existing?.accounts.find((a) => a.providerId === "privy");
          const scope = wallets.join(" ") || undefined;
          if (!privyAccount) {
            await adapter.linkAccount({ userId: user.id, providerId: "privy", accountId: subject, scope });
          } else if (privyAccount.accountId !== subject) {
            throw new APIError("FORBIDDEN", { message: "This email is linked to a different Privy login." });
          } else if (scope && privyAccount.scope !== scope) {
            await adapter.updateAccount(privyAccount.id, { scope });
          }

          const session = await adapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ user: { id: user.id, email: user.email, name: user.name } });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
