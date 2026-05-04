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

interface StageBlock {
  criteria: Criterion[];
}

interface CoverageManifest {
  stage1: StageBlock;
  stage2: StageBlock;
  stage3: StageBlock;
}

const manifestPath = resolve(repoRoot, "scripts/acceptance-coverage.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CoverageManifest;

const stage1Expected = Array.from({ length: 23 }, (_, i) => `AC${String(i + 1).padStart(2, "0")}`);
const stage2Expected = Array.from({ length: 17 }, (_, i) => `AC-S2-${String(i + 1).padStart(2, "0")}`);
const stage3Expected = Array.from({ length: 7 }, (_, i) => `AC-S3-${String(i + 1).padStart(2, "0")}`);

let ok = true;

function reportStage(label: string, expected: string[], block: StageBlock | undefined): void {
  console.log(`${label} acceptance coverage:`);
  if (!block || !Array.isArray(block.criteria)) {
    console.log(`  (no '${label.toLowerCase().replace(" ", "")}' block in manifest)`);
    ok = false;
    return;
  }
  const seen = new Set(block.criteria.map((c) => c.id));
  for (const id of expected) {
    const crit = block.criteria.find((c) => c.id === id);
    if (!crit) {
      console.log(`  ${id}: MISSING from manifest`);
      ok = false;
      continue;
    }
    const isDeferred = crit.owner.includes("deferred-PR-") || crit.owner.includes("deferred-post-stage-");
    const tag = isDeferred ? "deferred" : "mapped";
    console.log(`  ${id} [${tag}]: ${crit.summary} → ${crit.owner}`);
  }
  const missing = expected.filter((id) => !seen.has(id));
  const unowned = block.criteria.filter((c) => !c.owner || c.owner.trim() === "");
  const unexpected = block.criteria.filter((c) => !expected.includes(c.id));
  if (missing.length > 0) {
    console.log(`  ${missing.length} criteria missing from manifest: ${missing.join(", ")}`);
    ok = false;
  }
  if (unowned.length > 0) {
    console.log(`  ${unowned.length} criteria have no owner: ${unowned.map((c) => c.id).join(", ")}`);
    ok = false;
  }
  if (unexpected.length > 0) {
    console.log(`  ${unexpected.length} unexpected criteria in manifest: ${unexpected.map((c) => c.id).join(", ")}`);
    ok = false;
  }
}

reportStage("Stage 1", stage1Expected, manifest.stage1);
console.log("");
reportStage("Stage 2", stage2Expected, manifest.stage2);
console.log("");
reportStage("Stage 3", stage3Expected, manifest.stage3);

if (ok) {
  console.log(
    `\nAll ${stage1Expected.length} Stage 1 + ${stage2Expected.length} Stage 2 + ${stage3Expected.length} Stage 3 acceptance criteria have a verification owner (mapped or deferred).`,
  );
  process.exit(0);
}
console.error("\nAcceptance coverage check FAILED.");
process.exit(1);
