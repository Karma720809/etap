// Stage 3 ED-PR-02 — Equipment Duty Check contract type tests.
//
// These tests exercise the contract surface (status enums, criterion
// pairing, issue codes, structural guards, serialization stability)
// without invoking any orchestrator, readiness wrapper, retention
// layer, or UI. They mirror the Stage 3 PR #2 contract-test pattern
// in `packages/solver-adapter/tests/shortCircuitContract.test.ts`.

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DUTY_CHECK_CRITERIA,
  DUTY_CHECK_CRITERION_TO_EQUIPMENT_KIND,
  DUTY_CHECK_EQUIPMENT_KINDS,
  DUTY_CHECK_ISSUE_CODES,
  DUTY_CHECK_RUN_STATUSES,
  DUTY_CHECK_STATUSES,
  DUTY_CHECK_VERDICT_BASES,
  isDutyCheckCriterion,
  isDutyCheckEquipmentKind,
  isDutyCheckEquipmentResult,
  isDutyCheckIssue,
  isDutyCheckIssueCode,
  isDutyCheckResult,
  isDutyCheckRunStatus,
  isDutyCheckStatus,
  isDutyCheckVerdictBasis,
  type DutyCheckCriterion,
  type DutyCheckEquipmentKind,
  type DutyCheckEquipmentResult,
  type DutyCheckIssue,
  type DutyCheckIssueCode,
  type DutyCheckResult,
  type DutyCheckRunStatus,
  type DutyCheckStatus,
  type DutyCheckVerdictBasis,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-05-07T00:00:00Z";

function makePassingBreakerRow(): DutyCheckEquipmentResult {
  return {
    equipmentInternalId: "eq_brk_01",
    equipmentKind: "breaker",
    criterion: "breakerInterrupting",
    faultBusInternalId: "eq_bus_lv",
    shortCircuitResultId: "scr_abc_01",
    faultCaseId: null,
    dutyValue: 18.4,
    ratingValue: 25,
    utilizationPct: 73.6,
    marginValue: 6.6,
    status: "pass",
    verdictBasis: "verified",
    issueCodes: [],
  };
}

function makeMissingRatingCableRow(): DutyCheckEquipmentResult {
  return {
    equipmentInternalId: "eq_cable_01",
    equipmentKind: "cable",
    criterion: "cableThermalWithstand",
    faultBusInternalId: "eq_bus_lv",
    shortCircuitResultId: "scr_abc_01",
    faultCaseId: null,
    dutyValue: null,
    ratingValue: null,
    utilizationPct: null,
    marginValue: null,
    status: "missing_rating",
    verdictBasis: "provisional",
    issueCodes: ["W-DC-001"],
  };
}

function makeNotEvaluatedSwitchRow(): DutyCheckEquipmentResult {
  return {
    equipmentInternalId: "eq_sw_01",
    equipmentKind: "switch",
    criterion: "switchPeak",
    faultBusInternalId: null,
    shortCircuitResultId: null,
    faultCaseId: null,
    dutyValue: null,
    ratingValue: null,
    utilizationPct: null,
    marginValue: null,
    status: "not_evaluated",
    verdictBasis: "provisional",
    issueCodes: ["I-DC-002"],
  };
}

function makeResult(): DutyCheckResult {
  return {
    resultId: "dcr_001",
    runtimeSnapshotId: "snap_SCN_001",
    scenarioId: "SCN-N",
    module: "dutyCheck",
    status: "warning",
    sourceShortCircuitResultId: "scr_abc_01",
    equipmentResults: [
      makePassingBreakerRow(),
      makeMissingRatingCableRow(),
      makeNotEvaluatedSwitchRow(),
    ],
    issues: [
      {
        code: "W-DC-001",
        severity: "warning",
        message: "missing equipment rating",
        internalId: "eq_cable_01",
      },
      {
        code: "I-DC-002",
        severity: "info",
        message: "row not evaluated by orchestrator",
        internalId: "eq_sw_01",
      },
    ],
    metadata: {
      solverName: "duty-check",
      solverVersion: "0.1.0",
      adapterVersion: "0.1.0",
      executedAt: NOW,
      inputHash: null,
      networkHash: null,
      options: {},
      basis: { tminS: 0.05, faultClearingS: 0.5 },
    },
    createdAt: NOW,
  };
}

// ---------------------------------------------------------------------------
// Status / criterion / kind enums
// ---------------------------------------------------------------------------

describe("DutyCheckEquipmentKind", () => {
  it("covers exactly breaker / switch / bus / cable", () => {
    expect([...DUTY_CHECK_EQUIPMENT_KINDS]).toEqual([
      "breaker",
      "switch",
      "bus",
      "cable",
    ]);
    expectTypeOf<DutyCheckEquipmentKind>().toEqualTypeOf<
      "breaker" | "switch" | "bus" | "cable"
    >();
  });

  it("rejects unknown / forbidden category aliases", () => {
    // Sanity-check the runtime guard against non-listed kinds the
    // schema deliberately does not carry through to duty check.
    expect(isDutyCheckEquipmentKind("busbar")).toBe(false);
    expect(isDutyCheckEquipmentKind("transformer")).toBe(false);
    expect(isDutyCheckEquipmentKind("motor")).toBe(false);
    expect(isDutyCheckEquipmentKind("generator")).toBe(false);
    expect(isDutyCheckEquipmentKind("load")).toBe(false);
    expect(isDutyCheckEquipmentKind("utility")).toBe(false);
    expect(isDutyCheckEquipmentKind(null)).toBe(false);
    expect(isDutyCheckEquipmentKind(undefined)).toBe(false);
  });

  it("accepts every listed kind", () => {
    for (const kind of DUTY_CHECK_EQUIPMENT_KINDS) {
      expect(isDutyCheckEquipmentKind(kind)).toBe(true);
    }
  });
});

describe("DutyCheckStatus", () => {
  it("covers exactly the five contract states", () => {
    expect([...DUTY_CHECK_STATUSES]).toEqual([
      "pass",
      "fail",
      "missing_rating",
      "not_applicable",
      "not_evaluated",
    ]);
    expectTypeOf<DutyCheckStatus>().toEqualTypeOf<
      "pass" | "fail" | "missing_rating" | "not_applicable" | "not_evaluated"
    >();
  });

  it("does not admit a `warning` status (warning is per-row utilization, not status)", () => {
    expect(isDutyCheckStatus("warning")).toBe(false);
    expect(isDutyCheckStatus("violation")).toBe(false);
    expect(isDutyCheckStatus("ok")).toBe(false);
    expect(isDutyCheckStatus("unavailable")).toBe(false);
  });
});

describe("DutyCheckRunStatus", () => {
  it("covers exactly valid / warning / failed (top-level run alphabet)", () => {
    expect([...DUTY_CHECK_RUN_STATUSES]).toEqual(["valid", "warning", "failed"]);
    expectTypeOf<DutyCheckRunStatus>().toEqualTypeOf<
      "valid" | "warning" | "failed"
    >();
  });

  it("rejects per-row status values at the top level", () => {
    expect(isDutyCheckRunStatus("pass")).toBe(false);
    expect(isDutyCheckRunStatus("missing_rating")).toBe(false);
  });
});

describe("DutyCheckVerdictBasis", () => {
  it("covers exactly verified / provisional", () => {
    expect([...DUTY_CHECK_VERDICT_BASES]).toEqual(["verified", "provisional"]);
    expectTypeOf<DutyCheckVerdictBasis>().toEqualTypeOf<
      "verified" | "provisional"
    >();
  });
});

// ---------------------------------------------------------------------------
// Criterion ↔ equipment kind pairing
// ---------------------------------------------------------------------------

describe("DutyCheckCriterion ↔ equipment kind pairing", () => {
  it("covers exactly the seven contract criteria", () => {
    expect([...DUTY_CHECK_CRITERIA]).toEqual([
      "breakerInterrupting",
      "breakerPeak",
      "switchShortTimeWithstand",
      "switchPeak",
      "busShortTimeWithstand",
      "busPeak",
      "cableThermalWithstand",
    ]);
    expectTypeOf<DutyCheckCriterion>().toEqualTypeOf<
      | "breakerInterrupting"
      | "breakerPeak"
      | "switchShortTimeWithstand"
      | "switchPeak"
      | "busShortTimeWithstand"
      | "busPeak"
      | "cableThermalWithstand"
    >();
  });

  it("each criterion maps to exactly one equipment kind", () => {
    expect(DUTY_CHECK_CRITERION_TO_EQUIPMENT_KIND).toEqual({
      breakerInterrupting: "breaker",
      breakerPeak: "breaker",
      switchShortTimeWithstand: "switch",
      switchPeak: "switch",
      busShortTimeWithstand: "bus",
      busPeak: "bus",
      cableThermalWithstand: "cable",
    });
    for (const criterion of DUTY_CHECK_CRITERIA) {
      const kind = DUTY_CHECK_CRITERION_TO_EQUIPMENT_KIND[criterion];
      expect(isDutyCheckEquipmentKind(kind)).toBe(true);
    }
  });

  it("guard rejects unknown criterion strings", () => {
    expect(isDutyCheckCriterion("breakerMaking")).toBe(false);
    expect(isDutyCheckCriterion("busPeakWithstand")).toBe(false);
    expect(isDutyCheckCriterion("cableShortCircuit")).toBe(false);
    expect(isDutyCheckCriterion("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Issue codes
// ---------------------------------------------------------------------------

describe("DutyCheckIssueCode", () => {
  it("covers exactly W-DC-001..003 + I-DC-001..002", () => {
    expect([...DUTY_CHECK_ISSUE_CODES]).toEqual([
      "W-DC-001",
      "W-DC-002",
      "W-DC-003",
      "I-DC-001",
      "I-DC-002",
    ]);
    expectTypeOf<DutyCheckIssueCode>().toEqualTypeOf<
      "W-DC-001" | "W-DC-002" | "W-DC-003" | "I-DC-001" | "I-DC-002"
    >();
  });

  it("rejects Stage 1 / Stage 2 / Stage 3 short-circuit codes", () => {
    // Stage-boundary discipline: codes from other modules must not be
    // accepted on the duty-check surface even structurally.
    expect(isDutyCheckIssueCode("E-LF-001")).toBe(false);
    expect(isDutyCheckIssueCode("E-SC-001")).toBe(false);
    expect(isDutyCheckIssueCode("W-SC-001")).toBe(false);
    expect(isDutyCheckIssueCode("E-NET-001")).toBe(false);
    expect(isDutyCheckIssueCode("E-EQ-001")).toBe(false);
  });

  it("rejects ill-formed codes", () => {
    expect(isDutyCheckIssueCode("W-DC-999")).toBe(false);
    expect(isDutyCheckIssueCode("DC-001")).toBe(false);
    expect(isDutyCheckIssueCode("")).toBe(false);
    expect(isDutyCheckIssueCode(null)).toBe(false);
  });
});

describe("isDutyCheckIssue", () => {
  it("accepts a minimal warning issue", () => {
    const issue: DutyCheckIssue = {
      code: "W-DC-001",
      severity: "warning",
      message: "missing equipment rating",
    };
    expect(isDutyCheckIssue(issue)).toBe(true);
  });

  it("accepts an info issue with internalId + field", () => {
    const issue: DutyCheckIssue = {
      code: "I-DC-001",
      severity: "info",
      message: "criterion not applicable",
      internalId: "eq_brk_01",
      field: "peakWithstandKa",
    };
    expect(isDutyCheckIssue(issue)).toBe(true);
  });

  it("rejects unknown severities", () => {
    expect(
      isDutyCheckIssue({
        code: "W-DC-001",
        severity: "error",
        message: "x",
      }),
    ).toBe(false);
  });

  it("rejects non-string optional fields", () => {
    expect(
      isDutyCheckIssue({
        code: "W-DC-001",
        severity: "warning",
        message: "x",
        internalId: 42,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Equipment-result row structural guard
// ---------------------------------------------------------------------------

describe("isDutyCheckEquipmentResult", () => {
  it("accepts a passing breaker row", () => {
    expect(isDutyCheckEquipmentResult(makePassingBreakerRow())).toBe(true);
  });

  it("accepts a missing-rating cable row with all numerics null", () => {
    expect(isDutyCheckEquipmentResult(makeMissingRatingCableRow())).toBe(true);
  });

  it("accepts a not_evaluated row with no driving bus / source", () => {
    expect(isDutyCheckEquipmentResult(makeNotEvaluatedSwitchRow())).toBe(true);
  });

  it("rejects a row whose criterion does not pair with the equipment kind", () => {
    const row: DutyCheckEquipmentResult = {
      ...makePassingBreakerRow(),
      // breakerInterrupting belongs to a breaker, not a cable.
      equipmentKind: "cable",
    };
    expect(isDutyCheckEquipmentResult(row)).toBe(false);
  });

  it("rejects a row whose status is not in the contract enum", () => {
    const row = {
      ...makePassingBreakerRow(),
      status: "warning",
    };
    expect(isDutyCheckEquipmentResult(row)).toBe(false);
  });

  it("rejects a row whose numeric field is NaN or non-finite", () => {
    expect(
      isDutyCheckEquipmentResult({
        ...makePassingBreakerRow(),
        utilizationPct: Number.NaN,
      }),
    ).toBe(false);
    expect(
      isDutyCheckEquipmentResult({
        ...makePassingBreakerRow(),
        ratingValue: Number.POSITIVE_INFINITY,
      }),
    ).toBe(false);
  });

  it("rejects a row missing equipmentInternalId", () => {
    expect(
      isDutyCheckEquipmentResult({
        ...makePassingBreakerRow(),
        equipmentInternalId: "",
      }),
    ).toBe(false);
  });

  it("rejects a row whose issueCodes array carries an unknown string", () => {
    expect(
      isDutyCheckEquipmentResult({
        ...makeMissingRatingCableRow(),
        issueCodes: ["W-SC-001"],
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Result envelope: shape + serialization stability
// ---------------------------------------------------------------------------

describe("isDutyCheckResult", () => {
  it("accepts the canonical sample", () => {
    expect(isDutyCheckResult(makeResult())).toBe(true);
  });

  it("requires module === 'dutyCheck' (distinct from retention key)", () => {
    expect(
      isDutyCheckResult({
        ...makeResult(),
        module: "duty_check_bundle",
      }),
    ).toBe(false);
  });

  it("rejects a result whose top-level status is a per-row literal", () => {
    expect(
      isDutyCheckResult({
        ...makeResult(),
        status: "pass",
      }),
    ).toBe(false);
  });

  it("rejects a result whose metadata.solverName is not 'duty-check'", () => {
    const r = makeResult();
    expect(
      isDutyCheckResult({
        ...r,
        metadata: { ...r.metadata, solverName: "pandapower" as never },
      }),
    ).toBe(false);
  });

  it("rejects a result whose metadata.basis is missing tminS / faultClearingS", () => {
    const r = makeResult();
    expect(
      isDutyCheckResult({
        ...r,
        metadata: {
          ...r.metadata,
          basis: { tminS: 0.05 } as never,
        },
      }),
    ).toBe(false);
  });
});

describe("DutyCheckResult serialization stability", () => {
  it("is JSON round-trip stable (no Date / Map / Set / undefined fields)", () => {
    const original = makeResult();
    const json = JSON.stringify(original);
    const parsed = JSON.parse(json) as unknown;
    expect(isDutyCheckResult(parsed)).toBe(true);
    // The structural guard already covers the field-by-field shape;
    // an exact-equality check additionally pins serialization to a
    // contract-stable byte stream so future PRs cannot quietly add /
    // drop fields without updating this test.
    expect(parsed).toEqual(original);
  });

  it("preserves the equipment / rating / margin / utilization separation per row", () => {
    const result = makeResult();
    const passing = result.equipmentResults.find(
      (r) => r.status === "pass",
    );
    expect(passing).toBeDefined();
    if (!passing) return;
    // The four numeric columns are independent and must not be
    // collapsed / derived at the contract surface — the orchestrator
    // sets them explicitly so retention / UI can read each without
    // recomputation.
    expect(passing.dutyValue).not.toBeNull();
    expect(passing.ratingValue).not.toBeNull();
    expect(passing.utilizationPct).not.toBeNull();
    expect(passing.marginValue).not.toBeNull();

    const missing = result.equipmentResults.find(
      (r) => r.status === "missing_rating",
    );
    expect(missing).toBeDefined();
    if (!missing) return;
    // Missing rating ⇒ every numeric column null (no fake numbers).
    expect(missing.dutyValue).toBeNull();
    expect(missing.ratingValue).toBeNull();
    expect(missing.utilizationPct).toBeNull();
    expect(missing.marginValue).toBeNull();
  });

  it("carries source linkage fields on every row (including null when not applicable)", () => {
    const result = makeResult();
    for (const row of result.equipmentResults) {
      // Linkage fields exist on every row so retention / UI can pivot
      // back even for unevaluated rows. `undefined` is not a legal
      // value: missing linkage is `null`.
      expect(row).toHaveProperty("equipmentInternalId");
      expect(row).toHaveProperty("equipmentKind");
      expect(row).toHaveProperty("criterion");
      expect(row).toHaveProperty("faultBusInternalId");
      expect(row).toHaveProperty("shortCircuitResultId");
      expect(row).toHaveProperty("faultCaseId");
      expect(row.faultBusInternalId === null || typeof row.faultBusInternalId === "string").toBe(true);
      expect(row.shortCircuitResultId === null || typeof row.shortCircuitResultId === "string").toBe(true);
      expect(row.faultCaseId === null || typeof row.faultCaseId === "string").toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-status / cross-issue invariants the orchestrator must satisfy
// ---------------------------------------------------------------------------

describe("status ↔ issue-code expected pairings", () => {
  it("every issue code in the contract is reachable from the union", () => {
    // Catches drift between DUTY_CHECK_ISSUE_CODES and the type-level
    // union: if a code is added to one but not the other, the test
    // run fails because the per-element `isDutyCheckIssueCode(...)`
    // structural guard is generated from the same constant.
    for (const code of DUTY_CHECK_ISSUE_CODES) {
      expect(isDutyCheckIssueCode(code)).toBe(true);
    }
  });
});
