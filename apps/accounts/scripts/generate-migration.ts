/**
 * Prints the SQL that creates the accounts database from the current auth
 * config. Run when upgrading better-auth or changing plugins:
 *
 *   npx tsx apps/accounts/scripts/generate-migration.ts > apps/accounts/migrations/000N_name.sql
 *
 * It diffs against an empty database, so for later migrations edit the output
 * down to just the new tables/columns.
 */
import { getMigrations } from "better-auth/db/migration";
import { DatabaseSync } from "node:sqlite";
import { createAuth } from "../src/worker/auth";
import type { Env } from "../src/worker/env";

const auth = createAuth({
  BETTER_AUTH_URL: "http://localhost:8787",
  BETTER_AUTH_SECRET: "migration-only-secret-not-used-for-anything",
  ADMIN_EMAILS: "",
  EMAIL_FROM: "",
} as Env);
const options = { ...auth.options, database: new DatabaseSync(":memory:") };
const { compileMigrations } = await getMigrations(options as never);
console.log(await compileMigrations());
