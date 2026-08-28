import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const canonicalPath = resolve(repositoryRoot, "packages/contracts/src/index.js");
const edgePath = resolve(repositoryRoot, "supabase/functions/_shared/contracts.js");
const canonical = await readFile(canonicalPath, "utf8");
const banner = "// GENERATED from packages/contracts/src/index.js — do not edit manually.\n";

await writeFile(edgePath, banner + canonical, "utf8");
console.log("synced portable contracts into Supabase Edge Functions");
