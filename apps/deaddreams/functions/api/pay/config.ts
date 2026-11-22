import { PAYMENTS } from "../../../src/config.ts";
import type { Env } from "../../env.ts";
import { json } from "../../lib/util.ts";

/** GET /api/pay/config  what the ticket page needs to show the card buttons (all public). */
export const onRequestGet: PagesFunction<Env> = async ({ env }) =>
  json({
    cardProvider: PAYMENTS.cardProvider,
    paypalClientId: PAYMENTS.cardProvider === "paypal" ? env.PAYPAL_CLIENT_ID ?? "" : "",
    paypalSandbox: env.PAYPAL_ENV === "sandbox",
  });
