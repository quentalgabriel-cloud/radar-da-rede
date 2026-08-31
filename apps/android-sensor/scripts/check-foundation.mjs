import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(packageRoot, "../..");

async function source(path) {
  return readFile(resolve(packageRoot, path), "utf8");
}

export async function checkFoundation() {
  const schema = JSON.parse(
    await readFile(
      resolve(repositoryRoot, "packages/contracts/schemas/normalized-event.v0.1.0.schema.json"),
      "utf8",
    ),
  );
  const model = await source(
    "app/src/main/java/br/com/radardarede/sensor/contract/NormalizedEvent.kt",
  );
  const parser = await source(
    "app/src/main/java/br/com/radardarede/sensor/capture/NotificationParser.kt",
  );
  const manifest = await source("app/src/main/AndroidManifest.xml");
  const worker = await source(
    "app/src/main/java/br/com/radardarede/sensor/transport/UploadWorker.kt",
  );
  const gradle = await source("app/build.gradle.kts");
  const kotlinFiles = await collectKotlinFiles(
    resolve(packageRoot, "app/src/main/java"),
  );
  const allKotlin = (await Promise.all(kotlinFiles.map((path) => readFile(path, "utf8")))).join("\n");

  assert.equal(schema.properties.schema_version.const, "0.1.0");
  assert.match(model, /SCHEMA_VERSION = "0\.1\.0"/);
  assert.match(model, /source: String = "android_notification"/);
  assert.match(parser, /class MessagingStyleWhatsAppParser/);
  assert.match(parser, /override val version = "0\.3\.0"/);
  assert.match(parser, /notification_messaging_style/);
  assert.match(parser, /UUID\.nameUUIDFromBytes/);
  assert.match(manifest, /BIND_NOTIFICATION_LISTENER_SERVICE/);
  assert.match(manifest, /com\.whatsapp/);
  assert.match(manifest, /usesCleartextTraffic="false"/);
  assert.match(worker, /Result\.retry\(\)/);
  assert.match(worker, /outbox\.acknowledge/);
  assert.match(gradle, /room-runtime/);
  assert.match(gradle, /work-runtime/);
  assert.doesNotMatch(allKotlin, /service_role/i);
  assert.doesNotMatch(allKotlin, /SUPABASE_SERVICE_ROLE_KEY/);

  return {
    kotlinFiles: kotlinFiles.length,
    schemaVersion: schema.properties.schema_version.const,
    parserStatus: "messaging-style-v0.3.0",
  };
}

async function collectKotlinFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return collectKotlinFiles(path);
      return entry.name.endsWith(".kt") ? [path] : [];
    }),
  );
  return nested.flat();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await checkFoundation();
  console.log(
    `Android foundation OK: ${result.kotlinFiles} Kotlin files, contract ${result.schemaVersion}, parser ${result.parserStatus}.`,
  );
}
