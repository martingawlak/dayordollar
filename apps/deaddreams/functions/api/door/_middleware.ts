import type { Env } from "../../env.ts";
import { requireStaff } from "../../lib/staff.ts";

/** The door scanner is for admins and door staff. */
export const onRequest: PagesFunction<Env> = async ({ request, env, next, data }) => {
  const { staff, denied } = await requireStaff(request, env, ["admin", "door"]);
  if (denied) return denied;
  (data as Record<string, unknown>).staff = staff;
  return next();
};
