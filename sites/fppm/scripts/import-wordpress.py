#!/usr/bin/env python3
"""Turn the fppm.us WordPress database (Martin's phpMyAdmin export, loaded into
MySQL/MariaDB) into one SQL file of INSERTs for D1. The output contains member
data (names, addresses, signed waivers): write it OUTSIDE the repo and never
commit it.

    mysql -e 'create database fppm_old character set utf8mb4'
    sed 's/utf8mb4_0900_ai_ci/utf8mb4_unicode_ci/g' export.sql | mysql fppm_old
    python3 -I scripts/import-wordpress.py --db fppm_old > /path/outside/repo/import.sql
    npx wrangler d1 execute fppm --remote --file /path/outside/repo/import.sql

The table prefix is found by itself (the export's is bxb_); --prefix overrides.

What is carried over, under the same user ids:
  - every user (login, email lowercased, display name, registered, roles);
  - the plugin's user meta (fppm_*: type, phone, address, waiver and oath records,
    dues log, orders, notes, coupon, invites...) and first_name / last_name;
  - the plugin's settings (fppm_*), GFF Drive Backup's (gff_dbk_*), the WordPress
    ones they read, and the Drive backup's next planned run.
Waiver records (fppm_waiver, fppm_waiver_synced) are copied value for value:
nothing in them is rewritten, only re-encoded from PHP's serialize() to JSON.

Credentials are NOT copied (they become Worker secrets; see SECRET_OPTIONS).
hello@martingawlakcompany.com is made an administrator alongside the existing
admin (Martin's wish on every site): added as a new user unless that email is
already a user, who then gets the role.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from phpserialize import unserialize  # noqa: E402

# Settings that are credentials. They move to Worker secrets, never into D1.
SECRET_OPTIONS = {
    "fppm_gs_json": "GOOGLE_SA_JSON",          # the waiver Sheet's service-account key
    "fppm_pp_secret": "PAYPAL_SECRET",         # the store's PayPal REST app secret
    "fppm_printful_token": "PRINTFUL_TOKEN",   # the store's Printful API token
    "gff_dbk_sa_json": "(not needed: GFF Drive Backup only logs SKIPPED on this site)",
}

# WordPress's own per-user settings the plugin reads besides its fppm_* keys.
CORE_META = {"first_name", "last_name"}

# Site settings the plugin (or WordPress for it) reads besides its own keys.
CORE_OPTIONS = ("timezone_string", "gmt_offset", "admin_email", "blogname", "blogdescription",
                "date_format", "time_format", "default_role")

EXTRA_ADMIN = "hello@martingawlakcompany.com"


def rows(db: str, sql: str) -> list[dict]:
    out = subprocess.run(
        ["mysql", "--default-character-set=utf8mb4", "--batch", "--raw", "-N", db, "-e", sql],
        check=True, capture_output=True, text=True,
    ).stdout
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def find_prefix(db: str) -> str:
    out = subprocess.run(["mysql", "-N", "--batch", db, "-e", "show tables like '%usermeta'"],
                         check=True, capture_output=True, text=True).stdout.split()
    if len(out) != 1:
        sys.exit(f"cannot tell the table prefix (usermeta tables: {out}); pass --prefix")
    return out[0][: -len("usermeta")]


def lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def events_for_d1(events):
    """fppm_events: each event's rsvps (PHP array uid => status, in the order people answered)
    becomes a list of [uid, status] pairs, because a JSON object would lose that order."""
    if not isinstance(events, list):
        return events
    out = []
    for e in events:
        if isinstance(e, dict) and "rsvps" in e:
            r = e["rsvps"]
            pairs = [[int(k), v] for k, v in r.items()] if isinstance(r, dict) else [[i, v] for i, v in enumerate(r or [])]
            e = {**e, "rsvps": pairs}
        out.append(e)
    return out


def encode(value, name: str = ""):
    """Serialized PHP arrays become JSON; a string that starts like JSON is kept as a JSON string
    literal (so the Worker reads it back as text); anything else stays as WordPress stored it."""
    parsed = unserialize(value) if isinstance(value, str) else None
    if isinstance(parsed, (list, dict)):
        if name == "fppm_events":
            parsed = events_for_d1(parsed)
        return json.dumps(parsed, separators=(",", ":"), ensure_ascii=False)
    if isinstance(value, str) and value[:1] in ("[", "{", '"'):
        return json.dumps(value, ensure_ascii=False)
    return value


def insert(table: str, cols: list[str], record: dict) -> str:
    return f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(lit(record[c]) for c in cols)});"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--prefix", help="table prefix (found by itself when left out)")
    ap.add_argument("--no-extra-admin", action="store_true", help=f"do not add {EXTRA_ADMIN} as an administrator")
    a = ap.parse_args()
    p = a.prefix or find_prefix(a.db)
    out: list[str] = []
    counts: dict[str, int] = {}

    users = rows(a.db, f"""select json_object('id', u.ID, 'login', u.user_login, 'email', lower(u.user_email),
        'display_name', u.display_name, 'registered', u.user_registered,
        'caps', (select meta_value from {p}usermeta m where m.user_id = u.ID and m.meta_key = '{p}capabilities' limit 1))
        from {p}users u order by u.ID""")
    for u in users:
        caps = unserialize(u.pop("caps") or "") or {}
        u["roles"] = json.dumps([r for r, on in caps.items() if on] if isinstance(caps, dict) else [])
    if not a.no_extra_admin:
        mine = next((u for u in users if u["email"] == EXTRA_ADMIN), None)
        if mine:
            roles = json.loads(mine["roles"])
            if "administrator" not in roles:
                mine["roles"] = json.dumps(roles + ["administrator"])
        else:
            users.append({"id": max([u["id"] for u in users] or [0]) + 1, "login": EXTRA_ADMIN, "email": EXTRA_ADMIN,
                          "display_name": EXTRA_ADMIN, "registered": "2026-11-27 00:00:00", "roles": json.dumps(["administrator"])})
    for u in users:
        out.append(insert("wp_users", ["id", "login", "email", "display_name", "registered", "roles"], u))
    counts["wp_users"] = len(users)

    meta = rows(a.db, f"""select json_object('user_id', user_id, 'meta_key', meta_key, 'meta_value', meta_value)
        from {p}usermeta where meta_key like 'fppm\\_%' or meta_key in ({", ".join(lit(k) for k in sorted(CORE_META))})
        order by user_id, umeta_id""")
    seen = set()
    for m in meta:
        key = (m["user_id"], m["meta_key"])
        if key in seen:  # get_user_meta( ..., true ) reads the first row of a key
            continue
        seen.add(key)
        m["meta_value"] = encode(m["meta_value"], m["meta_key"])
        out.append(insert("wp_usermeta", ["user_id", "meta_key", "meta_value"], m))
    counts["wp_usermeta"] = len(seen)
    counts["waivers"] = sum(1 for (_, k) in seen if k == "fppm_waiver")

    found_secrets = []
    opts = []
    for o in rows(a.db, f"""select json_object('option_name', option_name, 'option_value', option_value)
            from {p}options where option_name like 'fppm\\_%' or option_name like 'gff\\_dbk\\_%'
            or option_name in ({", ".join(lit(k) for k in CORE_OPTIONS)})"""):
        if o["option_name"] in SECRET_OPTIONS:
            if (o["option_value"] or "").strip():
                found_secrets.append(o["option_name"])
            continue
        o["option_value"] = encode(o["option_value"], o["option_name"])
        opts.append(o)
    out.extend(insert("wp_options", ["option_name", "option_value"], o) for o in opts)
    counts["wp_options"] = len(opts)

    # When WP-Cron planned the Drive backup next (the Tools page shows it as "Next run").
    cron = rows(a.db, f"select json_object('v', option_value) from {p}options where option_name = 'cron'")
    sched = unserialize(cron[0]["v"]) if cron else {}
    for ts, hooks in (sched or {}).items():
        if isinstance(hooks, dict) and "gff_dbk_daily_event" in hooks:
            out.append(insert("wp_options", ["option_name", "option_value"], {"option_name": "cron_next:gff_dbk_daily_event", "option_value": str(ts)}))
    print("\n".join(out))
    print(json.dumps(counts), file=sys.stderr)
    for name in found_secrets:
        print(f"left out credential {name} -> Worker secret {SECRET_OPTIONS[name]}", file=sys.stderr)


if __name__ == "__main__":
    main()
