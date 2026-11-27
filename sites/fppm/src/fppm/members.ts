/** get_users() as the plugin asks it, and fppm_collect_members() (the roster's rows). */
import { type Ctx, loadUser, meta, type User } from "../ctx";
import { addressLine, displayName, duesOutstanding, playerStatusOf, str, typeOf } from "./core";

/** get_users( role__in, orderby registered|login, order, number ) — ties by id. */
export async function getUsers(c: Ctx, a: { role__in?: string[]; orderby?: "registered"; order?: "ASC" | "DESC"; number?: number } = {}): Promise<User[]> {
  const col = a.orderby === "registered" ? "registered" : "login collate nocase";
  const rows = await c.env.DB.prepare(`select id from wp_users order by ${col} ${a.order === "DESC" ? "desc" : "asc"}, id asc`).all<{ id: number }>();
  const out: User[] = [];
  for (const r of rows.results) {
    const u = await loadUser(c.env, r.id);
    if (!u) continue;
    if (a.role__in && !u.roles.some((x) => a.role__in!.includes(x))) continue;
    out.push(u);
    if (a.number && out.length >= a.number) break;
  }
  return out;
}

export interface MemberRow { id: number; name: string; email: string; phone: string; address: string; type: string; status: string; pos: string; jersey: string; shirt: string; owe: number }
export async function collectMembers(c: Ctx): Promise<MemberRow[]> {
  const rows: MemberRow[] = [];
  for (const u of await getUsers(c, { role__in: ["fppm_member"], orderby: "registered", order: "DESC", number: 2000 })) {
    const uid = u.ID;
    rows.push({
      id: uid, name: await displayName(c, uid), email: u.user_email, phone: str(await meta(c, uid, "fppm_phone")), address: await addressLine(c, uid),
      type: await typeOf(c, uid), status: await playerStatusOf(c, uid), pos: str(await meta(c, uid, "fppm_position")), jersey: str(await meta(c, uid, "fppm_jersey")),
      shirt: str(await meta(c, uid, "fppm_shirt")), owe: await duesOutstanding(c, uid),
    });
  }
  return rows;
}
