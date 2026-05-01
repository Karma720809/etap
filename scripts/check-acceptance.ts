#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

interface Criterion {
  id: string;
  summary: string;
  owner: string;
}

interface CoverageManifest {
  criteria: Criterion[];
}

const manifestPath = resolve(repoRoot, "scripts/acceptance-coverage.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CoverageManifest;

const expected = Array.from({ length: 23 }, (_, i) => `AC${String(i + 1).padStart(2, "0")}`);
const seen = new Set(manifest.criteria.map((c) => c.id));

const missing = expected.filter((id) => !seen.has(id));
const unowned = manifest.criteria.filter((c) => !c.owner || c.owner.trim() === "");

let ok = true;

console.log("Stage 1 acceptance coverage:");
for (const id of expected) {
  const crit = manifest.criteria.find((c) => c.id === id);
  if (!crit) {
    console.log(`  ${id}: MISSING from manifest`);
    ok = false;
    continue;
  }
  const isDeferred = crit.owner.includes("deferred-PR-");
  const tag = isDeferred ? "deferred" : "mapped";
  console.log(`  ${id} [${tag}]: ${crit.summary} → ${crit.owner}`);
}

if (missing.length > 0) {
  console.log(`\n${missing.length} criteria missing from manifest: ${missing.join(", ")}`);
  ok = false;
}
if (unowned.length > 0) {
  console.log(`\n${unowned.length} criteria have no owner: ${unowned.map((c) => c.id).join(", ")}`);
  ok = false;
}

if (ok) {
  console.log(`\nAll ${expected.length} Stage 1 acceptance criteria have a verification owner (mapped or deferred).`);
  process.exit(0);
}
console.error("\nAcceptance coverage check FAILED.");
process.exit(1);
