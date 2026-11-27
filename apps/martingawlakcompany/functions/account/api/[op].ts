import { getSessionUser } from "@mgc/sso";
import { inboxProxy } from "../../account-panel";
import type { Env } from "../../env";

/** The shared Inbox for the panel on /account/ (functions/account-panel.ts). */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  return inboxProxy(env.INBOX, request, "mgc", user?.id ?? null);
};
