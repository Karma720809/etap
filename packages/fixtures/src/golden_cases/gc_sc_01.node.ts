// Stage 3 PR #7 — GC-SC-01 Golden Case loader (Node-only subpath).
//
// This module is intentionally Node-only — it imports `node:fs`,
// `node:url`, and `node:path` to read the authoritative GC-SC-01
// support-package artifact from `docs/stage-1-baseline/...`. The root
// `@power-system-study/fixtures` entrypoint must stay browser-safe so
// `apps/web` (Vite) can keep importing the demo fixture, so this
// loader lives behind the dedicated subpath
// `@power-system-study/fixtures/golden-cases/gc-sc-01` (mapped in
// `package.json` `exports`). Only Node consumers — fixture tests and
// solver-adapter tests — import from that subpath.
//
// Three layers are intentionally distinguished and remain separate
// artifacts (see Stage 3 closeout §4.1):
//   1. The static support-package artifact (the docs JSON).
//   2. The executable fixture loader (this module's `getGoldenCaseGcSc01`).
//   3. The Stage 3 Golden Case integration entry in
//      `scripts/acceptance-coverage.json` `stage3GoldenCases`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import type { PowerSystemProjectFile } from "@power-system-study/schemas";

/**
 * IEC 60909 fault-target descriptor on the GC-SC-01 artifact.
 * `type` is pinned to the only fault topology Stage 3 MVP supports
 * (3-phase bolted; spec §S3-OQ-03).
 */
export interface GoldenCaseGcSc01Fault {
  locationInternalId: string;
  locationTag: string;
  type: "3phase_bolted";
}

/**
 * Solver options bundle the artifact records as the assumption set the
 * hand calculation was performed under. The simplified-IEC labels
 * (`voltageFactorC = 1.0`, `applyKt = false`, `applyKg = false`) come
 * straight from the hand-calc note §11 and MUST NOT be modified here.
 */
export interface GoldenCaseGcSc01SolverOptions {
  shortCircuitStandard: string;
  voltageFactorC: number;
  applyKt: boolean;
  applyKg: boolean;
  motorContributionMode: string;
  generatorContributionMode: string;
}

/**
 * Per-quantity expected values produced by the GC-SC-01 hand calc.
 * Units are kA for current and dimensionless for X/R, matching the
 * artifact JSON verbatim. Numeric values must not be edited here.
 */
export interface GoldenCaseGcSc01Expected {
  ikssKA: number;
  ipKA: number;
  xOverR: number;
  status: "pass" | "fail";
  warningCodes: string[];
  errorCodes: string[];
}

/**
 * Tolerance bands the artifact documents per quantity. The strings are
 * intentionally retained verbatim ("±1%", "±2%", "±5%") so a comparison
 * runner cannot silently widen the tolerance — callers must parse them.
 */
export interface GoldenCaseGcSc01Tolerance {
  ikssKA: string;
  ipKA: string;
  xOverR: string;
  status: string;
  warningCodes: string;
  errorCodes: string;
}

export interface GoldenCaseGcSc01Audit {
  preparedBy: string;
  reviewedBy: string;
  preparedAt: string;
  notes: string;
}

/**
 * The full GC-SC-01 support-package artifact, projected into a typed
 * shape. `input.projectFile` is a Stage 1 canonical project file and
 * is treated as `PowerSystemProjectFile` once it has cleared the Zod
 * schema check that the Golden Case structural test runs.
 */
export interface GoldenCaseGcSc01 {
  caseId: "GC-SC-01";
  module: "short-circuit";
  title: string;
  description: string;
  standard: string;
  referenceType: "hand_calculation";
  referenceStatus: "verified" | "provisional" | "regression_only";
  referenceSource: string;
  schemaVersion: string;
  appVersion: string;
  calculationEngineVersion: string;
  adapterVersion: string;
  tolerance: GoldenCaseGcSc01Tolerance;
  input: {
    inputModel: string;
    projectFile: PowerSystemProjectFile;
    fault: GoldenCaseGcSc01Fault;
    solverOptions: GoldenCaseGcSc01SolverOptions;
  };
  expected: GoldenCaseGcSc01Expected;
  audit: GoldenCaseGcSc01Audit;
}

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Path to the authoritative GC-SC-01 support-package artifact.
 * Resolved relative to this module so vitest, tsx, and any Node-only
 * consumer that imports `@power-system-study/fixtures/golden-cases/gc-sc-01`
 * reads the same file.
 *
 * Layout: `<repo>/docs/stage-1-baseline/.../GC-SC-01.utility_transformer_lv_fault.json`
 * and this module sits at
 * `<repo>/packages/fixtures/src/golden_cases/gc_sc_01.node.ts`, so the
 * path walks up five levels to the repo root before descending into
 * the docs tree.
 */
export const GOLDEN_CASE_GC_SC_01_PATH = resolve(
  here,
  "..",
  "..",
  "..",
  "..",
  "docs",
  "stage-1-baseline",
  "stage_1_preimplementation_support_v1_1",
  "golden_cases",
  "gc_sc_01",
  "GC-SC-01.utility_transformer_lv_fault.json",
);

/**
 * Read the GC-SC-01 Golden Case artifact from disk and return a fresh
 * deep clone per call. The file is the authoritative Stage 1 support
 * artifact; this loader does not transform or fabricate any field.
 *
 * Throws if the file is missing or unparsable — those are real
 * integration failures, not silent fallbacks (per the Stage 3
 * no-fake-numbers rule, spec §S3-OQ-02).
 *
 * Node-only — uses `node:fs`. Browser callers must not reach this
 * module; the root `@power-system-study/fixtures` entrypoint is the
 * browser-safe surface.
 */
export function getGoldenCaseGcSc01(): GoldenCaseGcSc01 {
  const raw = readFileSync(GOLDEN_CASE_GC_SC_01_PATH, "utf8");
  return JSON.parse(raw) as GoldenCaseGcSc01;
}

/**
 * Parse a documented tolerance literal such as `"±1%"` into the
 * fractional bound `0.01`. Accepts a leading `±` (canonical), `+/-`,
 * or no prefix (treated as one-sided). Rejects anything that is not a
 * numeric percentage so the comparison runner cannot accidentally
 * loosen tolerance by mis-parsing the artifact.
 *
 * Pure string parsing — would be safe in the browser, but lives here
 * alongside the loader because every consumer of this helper also
 * consumes the loader, and keeping them in one Node-only module
 * avoids a second import path in tests.
 */
export function parseGoldenCasePercentTolerance(literal: string): number {
  const trimmed = literal.trim();
  const stripped = trimmed.replace(/^(±|\+\/-|\+-)/u, "").trim();
  if (!stripped.endsWith("%")) {
    throw new Error(
      `parseGoldenCasePercentTolerance: expected a "<value>%" tolerance literal, got ${JSON.stringify(literal)}`,
    );
  }
  const numericText = stripped.slice(0, -1).trim();
  const numeric = Number(numericText);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(
      `parseGoldenCasePercentTolerance: tolerance must be a non-negative finite percentage, got ${JSON.stringify(literal)}`,
    );
  }
  return numeric / 100;
}
