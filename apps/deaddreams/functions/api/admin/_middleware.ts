import type { Env } from "../../env.ts";
import { requireStaff } from "../../lib/staff.ts";

/** Everything under /api/admin is for admins only. */
export const onRequest: PagesFunction<Env> = async ({ request, env, next, data }) => {
  const { staff, denied } = await requireStaff(request, env, ["admin"]);
  if (denied) return denied;
  (data as Record<string, unknown>).staff = staff;
  return next();
};
