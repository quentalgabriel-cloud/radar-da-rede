import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve(import.meta.dirname, "../schemas");
const files = readdirSync(directory).filter((name) => name.endsWith(".schema.json"));

if (files.length !== 3) throw new Error(`expected 3 schemas, found ${files.length}`);

const ids = new Set();
for (const file of files) {
  const schema = JSON.parse(readFileSync(resolve(directory, file), "utf8"));
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    throw new Error(`${file}: unexpected JSON Schema dialect`);
  }
  if (!schema.$id || ids.has(schema.$id)) throw new Error(`${file}: missing or duplicate $id`);
  ids.add(schema.$id);
  if (schema.type !== "object" || schema.additionalProperties !== false) {
    throw new Error(`${file}: top-level schema must be a closed object`);
  }
}

console.log(`checked ${files.length} portable contract schemas`);
