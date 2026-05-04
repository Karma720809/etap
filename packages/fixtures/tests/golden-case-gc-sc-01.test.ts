// Stage 3 PR #7 — GC-SC-01 Golden Case structural integration test.
//
// This test exercises the executable-fixture-loader half of the GC-SC-01
// integration. It verifies that the static support-package artifact in
//   docs/stage-1-baseline/.../GC-SC-01.utility_transformer_lv_fault.json
// is loadable through the fixtures package and that its `input.projectFile`
// passes the same Stage 1 canonical schema check the demo fixture passes.
//
// It deliberately does NOT run the solver — that lives in
// `packages/solver-adapter/tests/shortCircuit.goldenCaseGcSc01.test.ts`,
// which compares the per-bus numerics against the hand-calc reference
// under the documented tolerance. Keeping the structural assertions
// here means stock CI catches artifact-level regressions (renamed
// fields, schema drift) without needing the Python sidecar.
//
// The artifact's documented numeric values (`expected.ikssKA = 42.46`,
// `expected.ipKA = 97.55`, `expected.xOverR = 6.22`) and tolerance
// literals (`±1%`, `±2%`, `±5%`) are asserted exactly as they appear in
// the support-package JSON — Stage 3 PR #7 does not invent or relax
// them (task instruction: "Do not change expected numeric values
// unless the source document clearly supports the change").

import { describe, expect, it } from "vitest";
import { PowerSystemProjectFileSchema } from "@power-system-study/schemas";

import {
  GOLDEN_CASE_GC_SC_01_PATH,
  getGoldenCaseGcSc01,
  parseGoldenCasePercentTolerance,
} from "../src/index.js";

describe("GC-SC-01 Golden Case fixture — loader", () => {
  it("resolves to the authoritative docs/stage-1-baseline support artifact", () => {
    expect(GOLDEN_CASE_GC_SC_01_PATH).toMatch(
      /docs\/stage-1-baseline\/stage_1_preimplementation_support_v1_1\/golden_cases\/gc_sc_01\/GC-SC-01\.utility_transformer_lv_fault\.json$/,
    );
  });

  it("loads the artifact and pins caseId / module / referenceType", () => {
    const gc = getGoldenCaseGcSc01();
    expect(gc.caseId).toBe("GC-SC-01");
    expect(gc.module).toBe("short-circuit");
    expect(gc.referenceType).toBe("hand_calculation");
    expect(gc.referenceStatus).toBe("verified");
  });

  it("returns a fresh deep clone per call so test mutation does not bleed", () => {
    const a = getGoldenCaseGcSc01();
    const b = getGoldenCaseGcSc01();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    // Mutating one clone must not disturb the next read.
    a.expected.ikssKA = 0;
    const c = getGoldenCaseGcSc01();
    expect(c.expected.ikssKA).toBe(42.46);
  });
});

describe("GC-SC-01 Golden Case fixture — solver options + fault target", () => {
  it("documents the simplified-IEC assumption set the hand-calc was performed under", () => {
    const gc = getGoldenCaseGcSc01();
    // These values come straight from the GC-SC-01 hand-calculation note §11
    // and define what a comparison-capable solver run MUST honor before
    // the Golden Case can be promoted from "executable" to "verified"
    // (closeout §4.1, plan §10).
    expect(gc.input.solverOptions.shortCircuitStandard).toBe("iec60909_simplified");
    expect(gc.input.solverOptions.voltageFactorC).toBe(1.0);
    expect(gc.input.solverOptions.applyKt).toBe(false);
    expect(gc.input.solverOptions.applyKg).toBe(false);
    expect(gc.input.solverOptions.motorContributionMode).toBe("excluded");
    expect(gc.input.solverOptions.generatorContributionMode).toBe("excluded");
  });

  it("targets the LV bus for a 3-phase bolted fault per the hand-calc", () => {
    const gc = getGoldenCaseGcSc01();
    expect(gc.input.fault.type).toBe("3phase_bolted");
    expect(gc.input.fault.locationInternalId).toBe("eq_bus_lv_001");
    expect(gc.input.fault.locationTag).toBe("BUS-LV-001");
    // The fault-target bus must exist on the input project file.
    const lv = gc.input.projectFile.equipment.buses.find(
      (b) => b.internalId === gc.input.fault.locationInternalId,
    );
    expect(lv).toBeDefined();
    expect(lv?.vnKv).toBe(0.4);
  });
});

describe("GC-SC-01 Golden Case fixture — expected reference values", () => {
  it("preserves the hand-calc expected values verbatim", () => {
    const gc = getGoldenCaseGcSc01();
    // Reference values from GC-SC-01.hand_calculation.md §9. Stage 3
    // PR #7 must not edit these — only the spec-revision PR that
    // documents the simplified-IEC assumption set may adjust them.
    expect(gc.expected.ikssKA).toBe(42.46);
    expect(gc.expected.ipKA).toBe(97.55);
    expect(gc.expected.xOverR).toBe(6.22);
    expect(gc.expected.status).toBe("pass");
    expect(gc.expected.warningCodes).toEqual([]);
    expect(gc.expected.errorCodes).toEqual([]);
  });

  it("preserves the documented tolerance literals verbatim", () => {
    const gc = getGoldenCaseGcSc01();
    // Tolerance bands from GC-SC-01.hand_calculation.md §10.
    expect(gc.tolerance.ikssKA).toBe("±1%");
    expect(gc.tolerance.ipKA).toBe("±2%");
    expect(gc.tolerance.xOverR).toBe("±5%");
    expect(gc.tolerance.status).toBe("exact match");
    expect(gc.tolerance.warningCodes).toBe("exact match");
    expect(gc.tolerance.errorCodes).toBe("exact match");
  });

  it("parseGoldenCasePercentTolerance maps the documented literals to fractional bounds", () => {
    expect(parseGoldenCasePercentTolerance("±1%")).toBeCloseTo(0.01, 12);
    expect(parseGoldenCasePercentTolerance("±2%")).toBeCloseTo(0.02, 12);
    expect(parseGoldenCasePercentTolerance("±5%")).toBeCloseTo(0.05, 12);
  });

  it("parseGoldenCasePercentTolerance rejects malformed literals (no silent fallback)", () => {
    expect(() => parseGoldenCasePercentTolerance("loose")).toThrow();
    expect(() => parseGoldenCasePercentTolerance("-1%")).toThrow();
    expect(() => parseGoldenCasePercentTolerance("")).toThrow();
  });
});

describe("GC-SC-01 Golden Case fixture — input project file", () => {
  it("passes the canonical Stage 1 Zod schema (PowerSystemProjectFileSchema)", () => {
    const gc = getGoldenCaseGcSc01();
    const parse = PowerSystemProjectFileSchema.safeParse(gc.input.projectFile);
    if (!parse.success) {
      // eslint-disable-next-line no-console
      console.error(parse.error.issues.slice(0, 5));
    }
    expect(parse.success).toBe(true);
  });

  it("calculationSnapshots is reserved and present as an empty array (Stage 1 invariant)", () => {
    const gc = getGoldenCaseGcSc01();
    expect(gc.input.projectFile.calculationSnapshots).toEqual([]);
  });

  it("does NOT contain a calculationResults field (Stage 1 / Stage 3 guardrail)", () => {
    const gc = getGoldenCaseGcSc01();
    const project = gc.input.projectFile as unknown as Record<string, unknown>;
    expect("calculationResults" in project).toBe(false);
  });

  it("carries the slack utility, MV/LV buses, and 2.0 MVA transformer the hand-calc assumes", () => {
    const gc = getGoldenCaseGcSc01();
    const eq = gc.input.projectFile.equipment;
    expect(eq.utilities).toHaveLength(1);
    expect(eq.utilities[0]?.scLevelMva).toBe(250);
    expect(eq.utilities[0]?.xrRatio).toBe(10);
    expect(eq.utilities[0]?.voltageFactor).toBe(1);
    expect(eq.buses).toHaveLength(2);
    expect(eq.buses.map((b) => b.internalId).sort()).toEqual([
      "eq_bus_lv_001",
      "eq_bus_mv_001",
    ]);
    expect(eq.transformers).toHaveLength(1);
    const tr = eq.transformers[0];
    expect(tr?.snMva).toBe(2);
    expect(tr?.vnHvKv).toBe(6.6);
    expect(tr?.vnLvKv).toBe(0.4);
    expect(tr?.vkPercent).toBe(6);
    expect(tr?.vkrPercent).toBe(1);
  });
});
