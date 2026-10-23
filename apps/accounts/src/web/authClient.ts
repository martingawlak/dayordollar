import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { adminClient, emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// oauthProviderClient forwards the signed sign-in request when a brand site
// sent the visitor here, so signing in sends them straight back.
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [emailOTPClient(), adminClient(), oauthProviderClient()],
});

/** After any successful sign-in: go back to the brand site, or to /account. */
export function finishSignIn(data: unknown) {
  // When a brand site sent the visitor here, the response is { redirect: true, url }
  // and the auth client's redirect plugin already navigates there.
  if ((data as { redirect?: boolean } | null)?.redirect) return;
  window.location.assign("/account");
}
