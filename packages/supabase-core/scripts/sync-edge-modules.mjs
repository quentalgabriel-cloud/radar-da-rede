import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EDGE_GENERATED_MODULES, generatedBanner } from "../src/edge-modules.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
for (const { canonical, edge } of EDGE_GENERATED_MODULES) {
  const source = await readFile(resolve(repositoryRoot, canonical), "utf8");
  await writeFile(resolve(repositoryRoot, edge), generatedBanner(canonical) + source, "utf8");
  console.log(`synced ${canonical} -> ${edge}`);
}
