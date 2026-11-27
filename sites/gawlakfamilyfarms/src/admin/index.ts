/** The client admin's admin-post.php handlers, by the plugin's own action names (all admin_post_ only: signed in). */
import type { Action } from "../ajax";
import * as P from "./posts";
import { dashboard } from "../render/account";
import { adminDashboard } from "./views";
import type { AdminCtx } from "./core";

/** [gff_account] shows staff and admins the Dispatch dashboard (gff_admin_dashboard). */
dashboard.render = (c) => adminDashboard(c as AdminCtx);

const priv = (h: Action["priv"]): Action => ({ priv: h });

export const ADMIN_POSTS: Record<string, Action> = {
  gff_export_seeds_mailer: priv(P.exportSeedsMailer as Action["priv"]),
  gff_export_clients: priv(P.exportClients as Action["priv"]),
  gff_send_invoice_row: priv(P.sendInvoiceRow as Action["priv"]),
  gff_inv_mark_paid: priv(P.invMarkPaid as Action["priv"]),
  gff_route_toggle: priv(P.routeToggle as Action["priv"]),
  gff_dispatch_consult: priv(P.dispatchConsult as Action["priv"]),
  gff_dispatch_assign: priv(P.dispatchAssign as Action["priv"]),
  gff_dispatch_forward: priv(P.dispatchForward as Action["priv"]),
  gff_client_toggle_active: priv(P.clientToggleActive as Action["priv"]),
  gff_client_save_notes: priv(P.clientSaveNotes as Action["priv"]),
  gff_lead_make_customer: priv(P.leadMakeCustomer as Action["priv"]),
  gff_client_delete: priv(P.clientDelete as Action["priv"]),
  gff_client_setclass: priv(P.clientSetClass as Action["priv"]),
  gff_send_garden_invite: priv(P.sendGardenInvite as Action["priv"]),
};
