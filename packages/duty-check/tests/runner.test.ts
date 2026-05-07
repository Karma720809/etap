// Stage 3 ED-PR-03 — orchestrator behavior tests.
//
// These tests pin the contract-level behavior of `runDutyCheckForBundle`:
//   - Bundle shape (dutyCheck / snapshot / shortCircuit).
//   - Status transitions (valid / warning / failed) per upstream and
//     row-status mix.
//   - Per-row status mapping for missing / opt-out / present rating.
//   - Numeric integrity: every emitted row has null duty / rating /
//     utilization / margin (no fake numbers).
//   - Out-of-service equipment is skipped (no row emitted).
//   - Source linkage: shortCircuitResultId mirrors the upstream SC
//     result id when SC succeeded; null when SC failed.
//   - Snapshot reuse: the duty bundle reuses the SC bundle's
//     snapshot reference (no quiet divergence).
//   - Project file is not mutated by the orchestrator.

import { describe, expect, it } from "vitest";

import {
  isDutyCheckResult,
  runDutyCheckForBundle,
  DEFAULT_DUTY_FAULT_CLEARING_S,
  DEFAULT_DUTY_TMIN_S,
} from "../src/index.js";
import {
  fakeShortCircuitBundle,
  projectWithDutyEquipment,
  TEST_NOW,
} from "./test-builders.js";

describe("runDutyCheckForBundle — bundle shape", () => {
  it("returns a structurally valid DutyCheckResult with the upstream linkage", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid", "snap_dc_test");
    const project = projectWithDutyEquipment({ withRatedBreaker: true });
    const bundle = runDutyCheckForBundle(sc, {
      project,
      now: () => new Date(TEST_NOW),
      generateResultId: () => "dcr_pinned_001",
    });
    expect(isDutyCheckResult(bundle.dutyCheck)).toBe(true);
    expect(bundle.dutyCheck.module).toBe("dutyCheck");
    expect(bundle.dutyCheck.resultId).toBe("dcr_pinned_001");
    expect(bundle.dutyCheck.runtimeSnapshotId).toBe("snap_dc_test");
    expect(bundle.dutyCheck.sourceShortCircuitResultId).toBe(sc.shortCircuit.resultId);
    expect(bundle.dutyCheck.scenarioId).toBe("SCN-A");
    expect(bundle.dutyCheck.metadata.solverName).toBe("duty-check");
    expect(bundle.dutyCheck.metadata.basis).toEqual({
      tminS: DEFAULT_DUTY_TMIN_S,
      faultClearingS: DEFAULT_DUTY_FAULT_CLEARING_S,
    });
  });

  it("reuses the upstream snapshot reference (no quiet divergence)", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment(),
    });
    expect(bundle.snapshot).toBe(sc.snapshot);
    expect(bundle.shortCircuit).toBe(sc);
  });

  it("snapshots provided per-run options onto the result metadata", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment({ withRatedBreaker: true }),
      options: { tminS: 0.07, faultClearingS: 0.4 },
    });
    expect(bundle.dutyCheck.metadata.options).toEqual({
      tminS: 0.07,
      faultClearingS: 0.4,
    });
    expect(bundle.dutyCheck.metadata.basis).toEqual({
      tminS: 0.07,
      faultClearingS: 0.4,
    });
  });
});

describe("runDutyCheckForBundle — upstream Short Circuit failure", () => {
  it("returns a failed run with no rows and an info-level top-level issue", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "failed");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment({ withRatedBreaker: true }),
    });
    expect(bundle.dutyCheck.status).toBe("failed");
    expect(bundle.dutyCheck.equipmentResults).toEqual([]);
    expect(bundle.dutyCheck.sourceShortCircuitResultId).toBeNull();
    expect(bundle.dutyCheck.issues).toHaveLength(1);
    expect(bundle.dutyCheck.issues[0]?.code).toBe("I-DC-002");
    expect(bundle.dutyCheck.issues[0]?.severity).toBe("info");
  });

  it("does not enumerate per-equipment rows when upstream failed (no fake numbers)", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "failed");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment({
        withRatedBreaker: true,
        withMissingRatingCable: true,
        withMissingRatingBus: true,
      }),
    });
    expect(bundle.dutyCheck.equipmentResults).toEqual([]);
  });
});

describe("runDutyCheckForBundle — per-row status mapping", () => {
  it("emits missing_rating + W-DC-001 for a breaker without interruptingCapacityKa", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment({ withMissingRatingBreaker: true }),
    });
    const interruptingRow = bundle.dutyCheck.equipmentResults.find(
      (r) =>
        r.equipmentInternalId === "eq_brk_miss" &&
        r.criterion === "breakerInterrupting",
    );
    expect(interruptingRow).toBeDefined();
    expect(interruptingRow?.status).toBe("missing_rating");
    expect(interruptingRow?.issueCodes).toEqual(["W-DC-001"]);
    expect(interruptingRow?.dutyValue).toBeNull();
    expect(interruptingRow?.ratingValue).toBeNull();
    expect(interruptingRow?.utilizationPct).toBeNull();
    expect(interruptingRow?.marginValue).toBeNull();
    expect(interruptingRow?.verdictBasis).toBe("provisional");
  });

  it("emits not_applicable + I-DC-001 for a breaker that opts out of peakWithstandKa", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment({ withPeakOptOutBreaker: true }),
    });
    const peakRow = bundle.dutyCheck.equipmentResults.find(
      (r) =>
        r.equipmentInternalId === "eq_brk_optout" &&
        r.criterion === "breakerPeak",
    );
    expect(peakRow).toBeDefined();
    expect(peakRow?.status).toBe("not_applicable");
    expect(peakRow?.issueCodes).toEqual(["I-DC-001"]);
    expect(peakRow?.dutyValue).toBeNull();
    expect(peakRow?.ratingValue).toBeNull();

    // The breaker's interrupting row is independently statused.
    const interruptingRow = bundle.dutyCheck.equipmentResults.find(
      (r) =>
        r.equipmentInternalId === "eq_brk_optout" &&
        r.criterion === "breakerInterrupting",
    );
    expect(interruptingRow?.status).toBe("not_evaluated");
    expect(interruptingRow?.issueCodes).toEqual(["I-DC-002"]);
  });

  it("emits not_evaluated + I-DC-002 for a fully rated breaker (orchestrator did not compute)", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment({ withRatedBreaker: true }),
    });
    const rows = bundle.dutyCheck.equipmentResults.filter(
      (r) => r.equipmentInternalId === "eq_brk_rated",
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("not_evaluated");
      expect(row.issueCodes).toEqual(["I-DC-002"]);
      expect(row.dutyValue).toBeNull();
      expect(row.ratingValue).toBeNull();
      expect(row.utilizationPct).toBeNull();
      expect(row.marginValue).toBeNull();
      expect(row.shortCircuitResultId).toBe(sc.shortCircuit.resultId);
    }
  });

  it("emits missing_rating for switch / bus when rating fields are absent", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment({
        withMissingRatingSwitch: true,
        withMissingRatingBus: true,
      }),
    });
    const switchSht = bundle.dutyCheck.equipmentResults.find(
      (r) => r.criterion === "switchShortTimeWithstand",
    );
    expect(switchSht?.status).toBe("missing_rating");
    expect(switchSht?.issueCodes).toEqual(["W-DC-001"]);
    const switchPeak = bundle.dutyCheck.equipmentResults.find(
      (r) => r.criterion === "switchPeak",
    );
    // Switch peak is opt-out by absence per the contract.
    expect(switchPeak?.status).toBe("not_applicable");
    expect(switchPeak?.issueCodes).toEqual(["I-DC-001"]);

    const busSht = bundle.dutyCheck.equipmentResults.find(
      (r) => r.criterion === "busShortTimeWithstand",
    );
    expect(busSht?.status).toBe("missing_rating");
    expect(busSht?.issueCodes).toEqual(["W-DC-001"]);
    const busPeak = bundle.dutyCheck.equipmentResults.find(
      (r) => r.criterion === "busPeak",
    );
    expect(busPeak?.status).toBe("not_applicable");
    expect(busPeak?.issueCodes).toEqual(["I-DC-001"]);
  });

  it("emits missing_rating for cable without shortCircuitKValue and not_evaluated when present", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment({
        withMissingRatingCable: true,
        withRatedCable: true,
      }),
    });
    const missing = bundle.dutyCheck.equipmentResults.find(
      (r) => r.equipmentInternalId === "eq_cbl_miss",
    );
    expect(missing?.status).toBe("missing_rating");
    expect(missing?.issueCodes).toEqual(["W-DC-001"]);

    const rated = bundle.dutyCheck.equipmentResults.find(
      (r) => r.equipmentInternalId === "eq_cbl_rated",
    );
    expect(rated?.status).toBe("not_evaluated");
    expect(rated?.issueCodes).toEqual(["I-DC-002"]);
  });
});

describe("runDutyCheckForBundle — top-level status derivation", () => {
  it("is `valid` when no equipment is in scope (no rows emitted)", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment(),
    });
    expect(bundle.dutyCheck.equipmentResults).toEqual([]);
    expect(bundle.dutyCheck.status).toBe("valid");
  });

  it("is `warning` when at least one row is non-pass and no row is fail", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment({ withMissingRatingBreaker: true }),
    });
    expect(
      bundle.dutyCheck.equipmentResults.every(
        (r) => r.status === "missing_rating" || r.status === "not_applicable",
      ),
    ).toBe(true);
    expect(bundle.dutyCheck.status).toBe("warning");
  });
});

describe("runDutyCheckForBundle — out-of-service equipment", () => {
  it("skips out-of-service breakers (no row emitted)", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const bundle = runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment({
        withOutOfServiceBreaker: true,
        withRatedBreaker: true,
      }),
    });
    const oosRows = bundle.dutyCheck.equipmentResults.filter(
      (r) => r.equipmentInternalId === "eq_brk_oos",
    );
    expect(oosRows).toEqual([]);
    // The in-service breaker still produces its rows.
    const ratedRows = bundle.dutyCheck.equipmentResults.filter(
      (r) => r.equipmentInternalId === "eq_brk_rated",
    );
    expect(ratedRows).toHaveLength(2);
  });
});

describe("runDutyCheckForBundle — input isolation", () => {
  it("does not mutate the input project file", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const project = projectWithDutyEquipment({
      withMissingRatingBreaker: true,
      withRatedCable: true,
    });
    const before = JSON.stringify(project);
    runDutyCheckForBundle(sc, { project });
    expect(JSON.stringify(project)).toBe(before);
  });

  it("does not mutate the input SC bundle", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const before = JSON.stringify(sc);
    runDutyCheckForBundle(sc, {
      project: projectWithDutyEquipment({ withRatedBreaker: true }),
    });
    expect(JSON.stringify(sc)).toBe(before);
  });

  it("emits no rows when the project file is omitted (no fabrication)", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const bundle = runDutyCheckForBundle(sc);
    expect(bundle.dutyCheck.equipmentResults).toEqual([]);
    expect(bundle.dutyCheck.status).toBe("valid");
  });
});
