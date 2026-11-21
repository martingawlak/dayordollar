import { getSessionUser, type SessionUser } from "@mgc/sso";
import type { Env } from "../env.ts";

export type Role = "admin" | "door";

const list = (s?: string) => new Set((s ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));

/** The signed-in staff member and their role, or null. */
export async function getStaff(request: Request, env: Env): Promise<{ user: SessionUser; role: Role } | null> {
  const host = new URL(request.url).hostname;
  const user =
    env.DEV_STAFF_EMAIL && (host === "localhost" || host === "127.0.0.1")
      ? { id: "dev", email: env.DEV_STAFF_EMAIL }
      : await getSessionUser(request, env);
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  if (list(env.ADMIN_EMAILS).has(email)) return { user, role: "admin" };
  if (list(env.DOOR_EMAILS).has(email)) return { user, role: "door" };
  return null;
}

export async function requireStaff(request: Request, env: Env, roles: Role[]) {
  const staff = await getStaff(request, env);
  if (staff && roles.includes(staff.role)) return { staff };
  const signedIn = !!(await getSessionUser(request, env));
  return {
    denied: Response.json(
      { error: signedIn ? "This account doesn't have access." : "Sign in first.", signIn: !signedIn },
      { status: signedIn ? 403 : 401, headers: { "cache-control": "no-store" } },
    ),
  };
}
