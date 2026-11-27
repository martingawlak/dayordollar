/**
 * The plugin's admin-ajax.php and admin-post.php handlers, by action name, as
 * WordPress picked them: wp_ajax_<action> / admin_post_<action> for a
 * signed-in visitor (the plugin registered no _nopriv handlers, so a
 * signed-out visitor got admin-ajax's "0" or admin-post's empty page).
 */
import type { Handler } from "./ajax";
import { shopCapture, shopCreate, fetchCatalog } from "./fppm/store";
import { hAcceptInvite, hComplete } from "./fppm/account";
import { hAdminDelete, hAnnounce, hDuesMark, hExportRoster, hPlayerInvite, hSaveNotes, hSelfDelete, hSetStatus } from "./fppm/staff";
import { addEvent, deleteEvent, rsvp } from "./fppm/events";
import { exportWaivers, syncWaivers } from "./fppm/waivers";

export const AJAX: Record<string, Handler> = {
  fppm_shop_create: shopCreate,
  fppm_shop_capture: shopCapture,
};

export const POSTS: Record<string, Handler> = {
  fppm_complete: hComplete,
  fppm_player_invite: hPlayerInvite,
  fppm_accept_invite: hAcceptInvite,
  fppm_self_delete: hSelfDelete,
  fppm_admin_delete: hAdminDelete,
  fppm_dues_mark: hDuesMark,
  fppm_set_status: hSetStatus,
  fppm_save_notes: hSaveNotes,
  fppm_announce: hAnnounce,
  fppm_export_roster: hExportRoster,
  fppm_fetch_catalog: fetchCatalog,
  fppm_export_waivers: exportWaivers,
  fppm_sync_waivers: syncWaivers,
  fppm_add_event: addEvent,
  fppm_delete_event: deleteEvent,
  fppm_rsvp: rsvp,
};
