import { handleAuth } from "@mgc/sso";
import type { Env } from "../env";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) =>
  (await handleAuth(request, env)) ?? new Response("Not found", { status: 404 });
