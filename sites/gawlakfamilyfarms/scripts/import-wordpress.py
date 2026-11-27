#!/usr/bin/env python3
"""Turn the gawlakfamilyfarms.com WordPress database (loaded into MySQL/MariaDB) into one
SQL file of INSERTs for D1. The output contains customer data: write it outside
the repo and never commit it.

    python3 -I scripts/import-wordpress.py --db gff_old --prefix svz_ > /path/outside/repo/import.sql
    npx wrangler d1 execute gawlakfamilyfarms --local --file /path/outside/repo/import.sql
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
# gff_dbk_sa_json is the Drive backup plugin's service-account key (that plugin
# is not ported yet; when it is, the key becomes a Worker secret too).
SECRET_OPTIONS = {"gff_google_geocode_key", "gff_dbk_sa_json",
                  # Aerial Timelapse's bulk-check token (?token= on /check-updates): the AT_CHECK_TOKEN secret.
                  "at_check_token"}

# WordPress's own per-user settings the plugins read besides their gff_* / at_* keys
# (Aerial Timelapse prefills the address from WooCommerce's billing fields).
CORE_META = {"first_name", "last_name", "billing_address_1", "billing_city", "billing_state", "billing_postcode"}

# Site settings the plugin (or WordPress for it) reads besides its gff_* keys.
CORE_OPTIONS = ("timezone_string", "gmt_offset", "admin_email", "blogname", "blogdescription", "date_format", "time_format")


def rows(db: str, sql: str) -> list[dict]:
    out = subprocess.run(
        ["mysql", "--default-character-set=utf8mb4", "--batch", "--raw", "-N", db, "-e", sql],
        check=True, capture_output=True, text=True,
    ).stdout
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def columns(db: str, table: str) -> list[str]:
    out = subprocess.run(
        ["mysql", "-N", "--batch", db, "-e",
         f"select column_name from information_schema.columns where table_schema='{db}' "
         f"and table_name='{table}' order by ordinal_position"],
        check=True, capture_output=True, text=True,
    ).stdout
    return out.split()


def lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def jsonify(value):
    """Serialized PHP arrays become JSON; everything else stays as WordPress stored it."""
    parsed = unserialize(value) if isinstance(value, str) else None
    return json.dumps(parsed, separators=(",", ":"), ensure_ascii=False) if isinstance(parsed, (list, dict)) else value


def insert(table: str, cols: list[str], record: dict) -> str:
    return f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(lit(record[c]) for c in cols)});"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--prefix", required=True)
    a = ap.parse_args()
    p = a.prefix
    out: list[str] = []
    counts: dict[str, int] = {}

    users = rows(a.db, f"""select json_object('id', u.ID, 'login', u.user_login, 'email', lower(u.user_email),
        'display_name', u.display_name, 'registered', u.user_registered,
        'caps', (select meta_value from {p}usermeta m where m.user_id = u.ID and m.meta_key = '{p}capabilities'))
        from {p}users u""")
    for u in users:
        # wp_capabilities is a serialized PHP array like a:1:{s:10:"subscriber";b:1;}
        u["roles"] = json.dumps(re.findall(r's:\d+:"([^"]+)";b:1;', u.pop("caps") or ""))
        out.append(insert("wp_users", ["id", "login", "email", "display_name", "registered", "roles"], u))
    counts["wp_users"] = len(users)

    meta = rows(a.db, f"""select json_object('user_id', user_id, 'meta_key', meta_key, 'meta_value', meta_value)
        from {p}usermeta where meta_key like 'gff\\_%' or meta_key like 'at\\_%' or meta_key in ({", ".join(lit(k) for k in sorted(CORE_META))})""")
    for m in meta:
        m["meta_value"] = jsonify(m["meta_value"])
    out.extend(insert("wp_usermeta", ["user_id", "meta_key", "meta_value"], m) for m in meta)
    counts["wp_usermeta"] = len(meta)

    opts = [o for o in rows(a.db, f"""select json_object('option_name', option_name, 'option_value', option_value)
        from {p}options where option_name like 'gff\\_%' or option_name like 'at\\_%' or option_name in ({", ".join(lit(k) for k in CORE_OPTIONS)})""") if o["option_name"] not in SECRET_OPTIONS]
    for o in opts:
        o["option_value"] = jsonify(o["option_value"])
    out.extend(insert("wp_options", ["option_name", "option_value"], o) for o in opts)
    counts["wp_options"] = len(opts)

    # When WP-Cron planned each of the plugin's jobs next, so the Worker keeps the same rhythm
    # (src/jobs/schedule.ts reads these as "cron_next:<hook>").
    cron = rows(a.db, f"select json_object('v', option_value) from {p}options where option_name = 'cron'")
    sched = unserialize(cron[0]["v"]) if cron else {}
    for ts, hooks in (sched or {}).items():
        if not isinstance(hooks, dict):
            continue
        for hook in hooks:
            if str(hook).startswith("gff_"):
                out.append(insert("wp_options", ["option_name", "option_value"], {"option_name": f"cron_next:{hook}", "option_value": str(ts)}))
    print("\n".join(out))
    print(json.dumps(counts), file=sys.stderr)


if __name__ == "__main__":
    main()
