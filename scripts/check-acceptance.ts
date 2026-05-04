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

interface GoldenCase {
  id: string;
  summary: string;
  owner: string;
  referenceStatus: "verified" | "provisional" | "regression_only";
}

interface GoldenCaseBlock {
  cases: GoldenCase[];
}

interface CoverageManifest {
  stage1: StageBlock;
  stage2: StageBlock;
  stage3: StageBlock;
  stage3GoldenCases?: GoldenCaseBlock;
}

const manifestPath = resolve(repoRoot, "scripts/acceptance-coverage.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CoverageManifest;

const stage1Expected = Array.from({ length: 23 }, (_, i) => `AC${String(i + 1).padStart(2, "0")}`);
const stage2Expected = Array.from({ length: 17 }, (_, i) => `AC-S2-${String(i + 1).padStart(2, "0")}`);
const stage3Expected = Array.from({ length: 7 }, (_, i) => `AC-S3-${String(i + 1).padStart(2, "0")}`);

// Stage 3 Golden Case integration entries the checker enforces. Each
// entry pins both the case id and the EXPECTED Stage 3 Golden Case
// integration `referenceStatus` for THIS PR, so a future edit to
// `acceptance-coverage.json` cannot silently flip GC-SC-01 to
// `verified` before S3-OQ-08 voltage-factor alignment ships and the
// strict Layer 3 sidecar comparison passes (closeout §4.1).
//
// `referenceStatus` here records the Stage 3 Golden Case integration
// status, NOT the static support-package artifact's own
// `referenceStatus` field — the artifact JSON keeps its own
// `referenceStatus: "verified"` for the hand-calc reference.
interface ExpectedGoldenCase {
  id: string;
  expectedReferenceStatus: GoldenCase["referenceStatus"];
}

const stage3GoldenCasesExpected: readonly ExpectedGoldenCase[] = [
  { id: "GC-SC-01", expectedReferenceStatus: "provisional" },
];

const VALID_REFERENCE_STATUSES: ReadonlySet<GoldenCase["referenceStatus"]> = new Set([
  "verified",
  "provisional",
  "regression_only",
]);

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

function reportGoldenCases(
  label: string,
  expected: readonly ExpectedGoldenCase[],
  block: GoldenCaseBlock | undefined,
): void {
  console.log(`${label} executable Golden Case integration entries:`);
  if (!block || !Array.isArray(block.cases)) {
    console.log(`  (no '${label.toLowerCase().replace(" ", "")}' block in manifest)`);
    ok = false;
    return;
  }
  const seen = new Set(block.cases.map((c) => c.id));
  for (const exp of expected) {
    const gc = block.cases.find((c) => c.id === exp.id);
    if (!gc) {
      console.log(`  ${exp.id}: MISSING from manifest`);
      ok = false;
      continue;
    }
    if (!VALID_REFERENCE_STATUSES.has(gc.referenceStatus)) {
      console.log(`  ${exp.id}: invalid referenceStatus ${JSON.stringify(gc.referenceStatus)}`);
      ok = false;
      continue;
    }
    if (gc.referenceStatus !== exp.expectedReferenceStatus) {
      console.log(
        `  ${exp.id}: integration referenceStatus ${JSON.stringify(gc.referenceStatus)} does not match the pinned expected status ${JSON.stringify(exp.expectedReferenceStatus)} for this PR. Promotion to "verified" requires S3-OQ-08 voltage-factor alignment AND the strict Layer 3 sidecar comparison passing within the documented tolerance (closeout §4.1).`,
      );
      ok = false;
      continue;
    }
    console.log(`  ${exp.id} [${gc.referenceStatus}]: ${gc.summary} → ${gc.owner}`);
  }
  const expectedIds = new Set(expected.map((e) => e.id));
  const missing = expected.filter((e) => !seen.has(e.id)).map((e) => e.id);
  const unowned = block.cases.filter((c) => !c.owner || c.owner.trim() === "");
  const unexpected = block.cases.filter((c) => !expectedIds.has(c.id));
  if (missing.length > 0) {
    console.log(`  ${missing.length} golden cases missing from manifest: ${missing.join(", ")}`);
    ok = false;
  }
  if (unowned.length > 0) {
    console.log(`  ${unowned.length} golden cases have no owner: ${unowned.map((c) => c.id).join(", ")}`);
    ok = false;
  }
  if (unexpected.length > 0) {
    console.log(`  ${unexpected.length} unexpected golden cases in manifest: ${unexpected.map((c) => c.id).join(", ")}`);
    ok = false;
  }
}

reportStage("Stage 1", stage1Expected, manifest.stage1);
console.log("");
reportStage("Stage 2", stage2Expected, manifest.stage2);
console.log("");
reportStage("Stage 3", stage3Expected, manifest.stage3);
console.log("");
reportGoldenCases("Stage 3", stage3GoldenCasesExpected, manifest.stage3GoldenCases);

if (ok) {
  const goldenSummary = stage3GoldenCasesExpected
    .map((e) => `${e.id} (${e.expectedReferenceStatus})`)
    .join(", ");
  console.log(
    `\nAll ${stage1Expected.length} Stage 1 + ${stage2Expected.length} Stage 2 + ${stage3Expected.length} Stage 3 acceptance criteria have a verification owner (mapped or deferred); ${stage3GoldenCasesExpected.length} Stage 3 Golden Case(s) integrated [${goldenSummary}].`,
  );
  process.exit(0);
}
console.error("\nAcceptance coverage check FAILED.");
process.exit(1);
