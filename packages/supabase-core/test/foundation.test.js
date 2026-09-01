import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

test("ingest functions use custom device auth without exposing server credentials", async () => {
  const auth = await readFile(
    resolve(repositoryRoot, "supabase/functions/_shared/device-auth.ts"),
    "utf8",
  );
  const android = await readFile(
    resolve(
      repositoryRoot,
      "apps/android-sensor/app/src/main/java/br/com/radardarede/sensor/transport/IngestClient.kt",
    ),
    "utf8",
  );
  const processingAuth = await readFile(
    resolve(repositoryRoot, "supabase/functions/_shared/processing-auth.ts"),
    "utf8",
  );

  assert.match(auth, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(auth, /\.is\("revoked_at", null\)/);
  assert.doesNotMatch(android, /service.role|service_role|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(android, /Authorization/);
  assert.match(processingAuth, /processing_credentials/);
  assert.match(processingAuth, /\.is\("revoked_at", null\)/);
});

test("group registry stays additive, scoped and administratively audited", async () => {
  const sql = await readFile(resolve(repositoryRoot, "supabase/schemas/core.sql"), "utf8");
  const eventContract = await readFile(
    resolve(repositoryRoot, "packages/contracts/schemas/normalized-event.v0.1.0.schema.json"),
    "utf8",
  );

  assert.match(sql, /create table public\.groups/);
  assert.match(sql, /create table public\.group_aliases/);
  assert.match(sql, /create table public\.group_classification_changes/);
  assert.match(sql, /classification_status.*unclassified.*partially_classified.*confirmed/s);
  assert.match(sql, /create or replace function public\.classify_group/);
  assert.match(sql, /to_jsonb\(v_group\)->change\.key/);
  assert.match(sql, /resolution_status.*automatic.*confirmed.*ambiguous.*rejected/s);
  assert.match(sql, /grant execute on function public\.resolve_group_observations\(uuid, jsonb\) to service_role/);
  assert.doesNotMatch(eventContract, /group_id/);
});
