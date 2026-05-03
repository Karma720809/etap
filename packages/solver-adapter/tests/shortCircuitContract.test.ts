// Stage 3 PR #2 — Short Circuit contract tests.
//
// These tests exercise the Short Circuit contract / sidecar wire
// surface without invoking pandapower or any sidecar. They mirror the
// Stage 2 PR #3 contract-test pattern in `contract.test.ts`. Per the
// merged Stage 3 spec
// (`docs/stage-3/stage_3_short_circuit_mvp_spec.md` §5.3, §6.3, §11)
// and the implementation plan, PR #2 ships:
//
//   - request envelope (`ShortCircuitRequest`)
//   - sidecar response wire shape (`ShortCircuitSidecarResponse`)
//   - issue codes
//
// PR #2 does NOT ship the orchestrator, the app-normalized result
// model, or the transport call.

import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DEFAULT_SHORT_CIRCUIT_OPTIONS,
  DEFAULT_SOLVER_OPTIONS,
  SHORT_CIRCUIT_COMMAND,
  SHORT_CIRCUIT_ISSUE_CODES,
  SOLVER_INPUT_VERSION,
  isShortCircuitSidecarResponse,
  type ShortCircuitFaultTarget,
  type ShortCircuitIssueCode,
  type ShortCircuitOptions,
  type ShortCircuitRequest,
  type ShortCircuitSidecarBusRow,
  type ShortCircuitSidecarResponse,
  type ShortCircuitWireIssue,
  type SolverInput,
  type SolverMetadata,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-05-02T00:00:00Z";

function emptySolverInput(): SolverInput {
  return {
    inputVersion: SOLVER_INPUT_VERSION,
    scenarioId: "SCN-NORMAL",
    frequencyHz: 60,
    buses: [
      { internalId: "eq_bus_mv", tag: "BUS-MV", vnKv: 6.6, topology: "3P3W" },
      { internalId: "eq_bus_lv", tag: "BUS-LV", vnKv: 0.4, topology: "3P4W" },
    ],
    sources: [
      {
        internalId: "eq_util_1",
        tag: "UTL-1",
        kind: "utility",
        busInternalId: "eq_bus_mv",
        vnKv: 6.6,
        scLevelMva: 250,
        faultCurrentKa: null,
        xrRatio: 10,
        voltageFactor: 1,
        role: "slack",
        pMw: null,
        qMvar: null,
      },
    ],
    transformers: [],
    lines: [],
    loads: [],
    generatorsPQ: [],
    options: DEFAULT_SOLVER_OPTIONS,
  };
}

function stubMetadata(): SolverMetadata {
  return {
    solverName: "pandapower",
    solverVersion: "2.14.10",
    adapterVersion: "0.1.0",
    options: DEFAULT_SOLVER_OPTIONS,
    executedAt: NOW,
    inputHash: null,
    networkHash: null,
  };
}

// ---------------------------------------------------------------------------
// Command identifier
// ---------------------------------------------------------------------------

describe("Short Circuit sidecar command identifier", () => {
  it("is the literal `run_short_circuit`", () => {
    expect(SHORT_CIRCUIT_COMMAND).toBe("run_short_circuit");
    expectTypeOf(SHORT_CIRCUIT_COMMAND).toEqualTypeOf<"run_short_circuit">();
  });
});

// ---------------------------------------------------------------------------
// ShortCircuitOptions
// ---------------------------------------------------------------------------

describe("ShortCircuitOptions / DEFAULT_SHORT_CIRCUIT_OPTIONS", () => {
  it("defaults to IEC 60909 maximum 3-phase with both peak and thermal", () => {
    expect(DEFAULT_SHORT_CIRCUIT_OPTIONS).toEqual({
      faultType: "threePhase",
      calculationCase: "maximum",
      computePeak: true,
      computeThermal: true,
    });
  });

  it("rejects unsupported fault types and calculation cases at compile time", () => {
    // The MVP locks faultType to "threePhase" and calculationCase to "maximum".
    // Any other literal must fail TypeScript's literal-type narrowing.
    // @ts-expect-error — single-phase is out of MVP scope (S3-OQ-03).
    const a: ShortCircuitOptions = { ...DEFAULT_SHORT_CIRCUIT_OPTIONS, faultType: "singlePhaseGround" };
    // @ts-expect-error — minimum case is deferred (S3-FU-01).
    const b: ShortCircuitOptions = { ...DEFAULT_SHORT_CIRCUIT_OPTIONS, calculationCase: "minimum" };
    void a;
    void b;
  });
});

// ---------------------------------------------------------------------------
// ShortCircuitFaultTarget — busInternalId only
// ---------------------------------------------------------------------------

describe("ShortCircuitFaultTarget", () => {
  it("identifies fault targets by busInternalId, never display tag", () => {
    const target: ShortCircuitFaultTarget = { busInternalId: "eq_bus_mv" };
    expect(target.busInternalId).toBe("eq_bus_mv");

    // Type-system check: a ShortCircuitFaultTarget surface only has
    // busInternalId. There is no `tag`, no `displayName`, no `kind`.
    expectTypeOf<ShortCircuitFaultTarget>().toEqualTypeOf<{ busInternalId: string }>();
  });

  it("does not accept tag-shaped payloads at the type level", () => {
    // @ts-expect-error — tag is not a valid fault-target identifier.
    const wrong: ShortCircuitFaultTarget = { tag: "BUS-MV" };
    void wrong;
  });
});

// ---------------------------------------------------------------------------
// ShortCircuitRequest envelope
// ---------------------------------------------------------------------------

describe("ShortCircuitRequest envelope", () => {
  it("carries SolverInput verbatim (S3-OQ-07 SolverInput reuse)", () => {
    const request: ShortCircuitRequest = {
      solverInput: emptySolverInput(),
      mode: "specific",
      faultTargets: [{ busInternalId: "eq_bus_mv" }],
      shortCircuitOptions: DEFAULT_SHORT_CIRCUIT_OPTIONS,
    };

    expect(request.solverInput.inputVersion).toBe(SOLVER_INPUT_VERSION);
    expect(request.solverInput.options).toEqual(DEFAULT_SOLVER_OPTIONS);
    expect(request.faultTargets).toEqual([{ busInternalId: "eq_bus_mv" }]);
    expect(request.mode).toBe("specific");
  });

  it("supports the `all_buses` mode shorthand", () => {
    const request: ShortCircuitRequest = {
      solverInput: emptySolverInput(),
      mode: "all_buses",
      faultTargets: [],
      shortCircuitOptions: DEFAULT_SHORT_CIRCUIT_OPTIONS,
    };
    expect(request.mode).toBe("all_buses");
    expect(request.faultTargets).toEqual([]);
  });

  it("does not introduce calculation-result fields on the request envelope", () => {
    const request: ShortCircuitRequest = {
      solverInput: emptySolverInput(),
      mode: "specific",
      faultTargets: [{ busInternalId: "eq_bus_mv" }],
      shortCircuitOptions: DEFAULT_SHORT_CIRCUIT_OPTIONS,
    };

    expect(request).not.toHaveProperty("buses");
    expect(request).not.toHaveProperty("ikssKa");
    expect(request).not.toHaveProperty("calculationResults");
    expect(request).not.toHaveProperty("calculationSnapshots");
  });
});

// ---------------------------------------------------------------------------
// Sidecar wire response shape
// ---------------------------------------------------------------------------

describe("ShortCircuitSidecarResponse / ShortCircuitSidecarBusRow", () => {
  it("uses wire-level row status vocabulary `valid | warning | failed`", () => {
    const valid: ShortCircuitSidecarBusRow = {
      internalId: "eq_bus_mv",
      voltageLevelKv: 6.6,
      ikssKa: 18.42,
      ipKa: 41.18,
      ithKa: 19.05,
      skssMva: 351.2,
      status: "valid",
    };
    const warning: ShortCircuitSidecarBusRow = { ...valid, status: "warning" };
    const failed: ShortCircuitSidecarBusRow = { ...valid, status: "failed" };
    expect([valid.status, warning.status, failed.status]).toEqual([
      "valid",
      "warning",
      "failed",
    ]);

    // The app-side "ok" / "unavailable" vocabulary must NOT leak onto
    // the wire — those are orchestrator-side projections (PR #4).
    // @ts-expect-error — "ok" is the app-normalized status, not the wire one.
    const wrongOk: ShortCircuitSidecarBusRow = { ...valid, status: "ok" };
    // @ts-expect-error — "unavailable" is synthesized by the orchestrator.
    const wrongUnavail: ShortCircuitSidecarBusRow = { ...valid, status: "unavailable" };
    void wrongOk;
    void wrongUnavail;
  });

  it("allows every numeric per-bus field to be null", () => {
    const allNull: ShortCircuitSidecarBusRow = {
      internalId: "eq_bus_mv",
      voltageLevelKv: null,
      ikssKa: null,
      ipKa: null,
      ithKa: null,
      skssMva: null,
      status: "failed",
    };
    expect(allNull.ikssKa).toBeNull();
    expect(allNull.ipKa).toBeNull();
    expect(allNull.ithKa).toBeNull();
    expect(allNull.skssMva).toBeNull();
    expect(allNull.voltageLevelKv).toBeNull();
  });

  it("preserves internalId verbatim on each row", () => {
    const row: ShortCircuitSidecarBusRow = {
      internalId: "eq_bus_lv",
      voltageLevelKv: 0.4,
      ikssKa: 12.3,
      ipKa: null,
      ithKa: null,
      skssMva: null,
      status: "valid",
    };
    expect(row.internalId).toBe("eq_bus_lv");
    expect(row).not.toHaveProperty("tag");
    expect(row).not.toHaveProperty("busInternalId");
  });

  it("carries the shortCircuit metadata block alongside SolverMetadata on the response", () => {
    const response: ShortCircuitSidecarResponse = {
      status: "succeeded",
      metadata: stubMetadata(),
      shortCircuit: {
        calculationCase: "maximum",
        faultType: "threePhase",
        computePeak: true,
        computeThermal: true,
        voltageFactor: 1.0,
      },
      buses: [],
      issues: [],
    };
    expect(response.metadata.solverName).toBe("pandapower");
    expect(response.shortCircuit.voltageFactor).toBe(1.0);
    expect(response.shortCircuit.calculationCase).toBe("maximum");
  });

  it("uses the Stage 2 `succeeded | failed_validation | failed_solver` top-level vocabulary", () => {
    const succeeded: ShortCircuitSidecarResponse["status"] = "succeeded";
    const failedValidation: ShortCircuitSidecarResponse["status"] = "failed_validation";
    const failedSolver: ShortCircuitSidecarResponse["status"] = "failed_solver";
    expect([succeeded, failedValidation, failedSolver]).toEqual([
      "succeeded",
      "failed_validation",
      "failed_solver",
    ]);
  });

  it("typed `issueCodes` are app-level E-SC-* / W-SC-* codes only", () => {
    const codes: ShortCircuitIssueCode[] = [
      "E-SC-001",
      "E-SC-002",
      "E-SC-003",
      "E-SC-004",
      "E-SC-005",
      "E-SC-006",
      "W-SC-001",
      "W-SC-002",
      "W-SC-003",
    ];
    expect(codes).toHaveLength(9);

    // Pandapower exception names must NOT leak in as issue codes.
    // @ts-expect-error — pandapower exceptions are not app-level codes.
    const leaked: ShortCircuitIssueCode = "LoadflowNotConverged";
    void leaked;
  });
});

// ---------------------------------------------------------------------------
// isShortCircuitSidecarResponse — structural guard
// ---------------------------------------------------------------------------

describe("isShortCircuitSidecarResponse — strict structural validation", () => {
  function busRow(overrides: Partial<ShortCircuitSidecarBusRow> = {}): ShortCircuitSidecarBusRow {
    return {
      internalId: "eq_bus_mv",
      voltageLevelKv: 6.6,
      ikssKa: 18.42,
      ipKa: 41.18,
      ithKa: 19.05,
      skssMva: 351.2,
      status: "valid",
      ...overrides,
    };
  }

  function wireIssue(): ShortCircuitWireIssue {
    return {
      code: "E-SC-001",
      severity: "error",
      message: "pandapower exception",
    };
  }

  function validResponse(
    overrides: Partial<ShortCircuitSidecarResponse> = {},
  ): ShortCircuitSidecarResponse {
    return {
      status: "succeeded",
      metadata: stubMetadata(),
      shortCircuit: {
        calculationCase: "maximum",
        faultType: "threePhase",
        computePeak: true,
        computeThermal: true,
        voltageFactor: 1.0,
      },
      buses: [busRow()],
      issues: [],
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // Acceptance baseline + nullable numeric tolerance
  // -------------------------------------------------------------------------

  it("accepts a well-formed response", () => {
    expect(isShortCircuitSidecarResponse(validResponse())).toBe(true);
  });

  it("accepts a response whose bus rows carry null numeric fields (failed/disabled rows)", () => {
    const response = validResponse({
      buses: [
        busRow({
          ikssKa: null,
          ipKa: null,
          ithKa: null,
          skssMva: null,
          voltageLevelKv: null,
          status: "failed",
          issueCodes: ["E-SC-001"],
        }),
      ],
    });
    expect(isShortCircuitSidecarResponse(response)).toBe(true);
  });

  it("accepts an empty buses array (e.g., transport-validation failure with no rows)", () => {
    const response = validResponse({ buses: [], status: "failed_validation" });
    expect(isShortCircuitSidecarResponse(response)).toBe(true);
  });

  it("accepts an issues array with both error and warning entries", () => {
    const response = validResponse({
      issues: [
        { code: "E-SC-002", severity: "error", message: "missing source data" },
        { code: "W-SC-002", severity: "warning", message: "motors ignored" },
      ],
    });
    expect(isShortCircuitSidecarResponse(response)).toBe(true);
  });

  it("accepts optional internalId / field on issues", () => {
    const response = validResponse({
      issues: [
        {
          code: "E-SC-003",
          severity: "error",
          message: "missing transformer impedance",
          internalId: "eq_tr_1",
          field: "vkPercent",
        },
      ],
    });
    expect(isShortCircuitSidecarResponse(response)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Top-level rejections
  // -------------------------------------------------------------------------

  it("rejects null and primitives", () => {
    expect(isShortCircuitSidecarResponse(null)).toBe(false);
    expect(isShortCircuitSidecarResponse(undefined)).toBe(false);
    expect(isShortCircuitSidecarResponse("succeeded")).toBe(false);
    expect(isShortCircuitSidecarResponse(42)).toBe(false);
    expect(isShortCircuitSidecarResponse(true)).toBe(false);
    expect(isShortCircuitSidecarResponse([])).toBe(false);
  });

  it("rejects an unknown top-level status string (not in the contract enum)", () => {
    const broken = validResponse({ status: "ok" as unknown as ShortCircuitSidecarResponse["status"] });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects an empty top-level status string", () => {
    const broken = validResponse({ status: "" as unknown as ShortCircuitSidecarResponse["status"] });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects a non-string top-level status", () => {
    const broken = { ...validResponse(), status: 1 as unknown as ShortCircuitSidecarResponse["status"] };
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Metadata rejections
  // -------------------------------------------------------------------------

  it("rejects responses with a null metadata block (Stage 2 PR #4 hardening parity)", () => {
    const broken = { ...validResponse(), metadata: null };
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects metadata missing required fields", () => {
    const noVersion = {
      ...validResponse(),
      metadata: { ...stubMetadata(), solverVersion: undefined },
    };
    const noOptions = {
      ...validResponse(),
      metadata: { ...stubMetadata(), options: null },
    };
    expect(isShortCircuitSidecarResponse(noVersion)).toBe(false);
    expect(isShortCircuitSidecarResponse(noOptions)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // shortCircuit metadata-block rejections
  // -------------------------------------------------------------------------

  it("rejects responses without the shortCircuit metadata block", () => {
    const r = validResponse() as unknown as Record<string, unknown>;
    delete r.shortCircuit;
    expect(isShortCircuitSidecarResponse(r)).toBe(false);
  });

  it("rejects unsupported shortCircuit.calculationCase (e.g., 'minimum' is deferred per S3-FU-01)", () => {
    const broken = {
      ...validResponse(),
      shortCircuit: {
        ...validResponse().shortCircuit,
        calculationCase: "minimum",
      },
    };
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects unsupported shortCircuit.faultType (e.g., 'singlePhaseGround' is out of MVP)", () => {
    const broken = {
      ...validResponse(),
      shortCircuit: {
        ...validResponse().shortCircuit,
        faultType: "singlePhaseGround",
      },
    };
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects non-boolean computePeak / computeThermal", () => {
    const peakStr = {
      ...validResponse(),
      shortCircuit: { ...validResponse().shortCircuit, computePeak: "true" },
    };
    const thermalNum = {
      ...validResponse(),
      shortCircuit: { ...validResponse().shortCircuit, computeThermal: 1 },
    };
    expect(isShortCircuitSidecarResponse(peakStr)).toBe(false);
    expect(isShortCircuitSidecarResponse(thermalNum)).toBe(false);
  });

  it("rejects responses where shortCircuit.voltageFactor is a string", () => {
    const broken = {
      ...validResponse(),
      shortCircuit: {
        ...validResponse().shortCircuit,
        voltageFactor: "cmax" as unknown as number,
      },
    };
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects non-finite voltageFactor (NaN / Infinity)", () => {
    const nanFactor = {
      ...validResponse(),
      shortCircuit: { ...validResponse().shortCircuit, voltageFactor: Number.NaN },
    };
    const infFactor = {
      ...validResponse(),
      shortCircuit: { ...validResponse().shortCircuit, voltageFactor: Number.POSITIVE_INFINITY },
    };
    expect(isShortCircuitSidecarResponse(nanFactor)).toBe(false);
    expect(isShortCircuitSidecarResponse(infFactor)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Bus row rejections
  // -------------------------------------------------------------------------

  it("rejects responses where buses is not an array", () => {
    const broken = { ...validResponse(), buses: undefined };
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects a bus row with a missing or non-string internalId", () => {
    const noId = validResponse({
      buses: [{ ...busRow(), internalId: undefined as unknown as string }],
    });
    const numericId = validResponse({
      buses: [{ ...busRow(), internalId: 1 as unknown as string }],
    });
    const emptyId = validResponse({ buses: [{ ...busRow(), internalId: "" }] });
    expect(isShortCircuitSidecarResponse(noId)).toBe(false);
    expect(isShortCircuitSidecarResponse(numericId)).toBe(false);
    expect(isShortCircuitSidecarResponse(emptyId)).toBe(false);
  });

  it("rejects a bus row with an unknown status (and the app-side 'unavailable' specifically)", () => {
    const unknownStatus = validResponse({
      buses: [
        {
          ...busRow(),
          status: "ok" as unknown as ShortCircuitSidecarBusRow["status"],
        },
      ],
    });
    const unavailable = validResponse({
      buses: [
        {
          ...busRow(),
          status: "unavailable" as unknown as ShortCircuitSidecarBusRow["status"],
        },
      ],
    });
    expect(isShortCircuitSidecarResponse(unknownStatus)).toBe(false);
    // 'unavailable' is synthesized by the orchestrator (PR #4) for buses
    // that were not in the fault target set. It must NEVER appear on the
    // sidecar wire and the guard must reject it.
    expect(isShortCircuitSidecarResponse(unavailable)).toBe(false);
  });

  it("rejects a bus row missing a required numeric field", () => {
    for (const missing of ["voltageLevelKv", "ikssKa", "ipKa", "ithKa", "skssMva"] as const) {
      const row = { ...busRow() } as Record<string, unknown>;
      delete row[missing];
      const broken = validResponse({
        buses: [row as unknown as ShortCircuitSidecarBusRow],
      });
      expect(isShortCircuitSidecarResponse(broken)).toBe(false);
    }
  });

  it("rejects a bus row whose numeric fields are strings", () => {
    const broken = validResponse({
      buses: [
        {
          ...busRow(),
          ikssKa: "18.42" as unknown as number,
        },
      ],
    });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects a bus row with NaN numeric fields (sidecar must emit null instead)", () => {
    const broken = validResponse({
      buses: [{ ...busRow(), ikssKa: Number.NaN }],
    });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects malformed issueCodes (non-array, or non-string entries)", () => {
    const notArray = validResponse({
      buses: [
        {
          ...busRow(),
          issueCodes: "E-SC-001" as unknown as string[],
        },
      ],
    });
    const numericEntry = validResponse({
      buses: [
        {
          ...busRow(),
          issueCodes: [1 as unknown as string],
        },
      ],
    });
    const emptyEntry = validResponse({
      buses: [{ ...busRow(), issueCodes: [""] }],
    });
    expect(isShortCircuitSidecarResponse(notArray)).toBe(false);
    expect(isShortCircuitSidecarResponse(numericEntry)).toBe(false);
    expect(isShortCircuitSidecarResponse(emptyEntry)).toBe(false);
  });

  it("rejects an entirely non-object bus row", () => {
    const broken = validResponse({ buses: ["eq_bus_mv" as unknown as ShortCircuitSidecarBusRow] });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Issue rejections
  // -------------------------------------------------------------------------

  it("rejects responses where issues is not an array", () => {
    const broken = { ...validResponse(), issues: undefined };
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects an issue with an invalid severity (e.g., 'fatal' / 'info')", () => {
    const fatal = validResponse({
      issues: [{ ...wireIssue(), severity: "fatal" as unknown as ShortCircuitWireIssue["severity"] }],
    });
    const info = validResponse({
      issues: [{ ...wireIssue(), severity: "info" as unknown as ShortCircuitWireIssue["severity"] }],
    });
    expect(isShortCircuitSidecarResponse(fatal)).toBe(false);
    // Severity 'info' is intentionally NOT part of the Short Circuit
    // wire vocabulary — the contract is "error" | "warning" only.
    expect(isShortCircuitSidecarResponse(info)).toBe(false);
  });

  it("rejects an issue without a string message", () => {
    const broken = validResponse({
      issues: [{ ...wireIssue(), message: undefined as unknown as string }],
    });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects an issue without a non-empty code", () => {
    const noCode = validResponse({
      issues: [{ ...wireIssue(), code: undefined as unknown as string }],
    });
    const emptyCode = validResponse({
      issues: [{ ...wireIssue(), code: "" }],
    });
    expect(isShortCircuitSidecarResponse(noCode)).toBe(false);
    expect(isShortCircuitSidecarResponse(emptyCode)).toBe(false);
  });

  it("rejects an issue with a non-string optional internalId / field", () => {
    const badId = validResponse({
      issues: [{ ...wireIssue(), internalId: 1 as unknown as string }],
    });
    const badField = validResponse({
      issues: [{ ...wireIssue(), field: 2 as unknown as string }],
    });
    expect(isShortCircuitSidecarResponse(badId)).toBe(false);
    expect(isShortCircuitSidecarResponse(badField)).toBe(false);
  });

  it("rejects an entirely non-object issue entry", () => {
    const broken = validResponse({ issues: ["E-SC-001" as unknown as ShortCircuitWireIssue] });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Issue-code rejection (PR #13 re-review blocker)
  // -------------------------------------------------------------------------

  it("accepts every declared Short Circuit issue code on a top-level issue", () => {
    for (const code of SHORT_CIRCUIT_ISSUE_CODES) {
      const severity: ShortCircuitWireIssue["severity"] =
        code.startsWith("E-") ? "error" : "warning";
      const response = validResponse({
        issues: [{ code, severity, message: `code ${code}` }],
      });
      expect(isShortCircuitSidecarResponse(response)).toBe(true);
    }
  });

  it("accepts every declared Short Circuit issue code in a bus row's issueCodes array", () => {
    const response = validResponse({
      buses: [
        {
          ...busRow(),
          issueCodes: [...SHORT_CIRCUIT_ISSUE_CODES],
        },
      ],
    });
    expect(isShortCircuitSidecarResponse(response)).toBe(true);
  });

  it("rejects a top-level issue whose code is a Stage 1 / Stage 2 code (e.g., E-LF-001)", () => {
    // Stage 1 / Stage 2 codes must NOT leak across the Stage 3 wire
    // boundary. The wire model only carries `E-SC-*` / `W-SC-*` codes.
    const broken = validResponse({
      issues: [
        {
          code: "E-LF-001" as unknown as ShortCircuitWireIssue["code"],
          severity: "error",
          message: "leaked Load Flow code",
        },
      ],
    });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects a top-level issue whose code is an unknown string", () => {
    const broken = validResponse({
      issues: [
        {
          code: "NOT-A-CODE" as unknown as ShortCircuitWireIssue["code"],
          severity: "error",
          message: "garbage code",
        },
      ],
    });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects a top-level issue whose code is an empty string or non-string value", () => {
    const empty = validResponse({
      issues: [
        {
          code: "" as unknown as ShortCircuitWireIssue["code"],
          severity: "error",
          message: "blank code",
        },
      ],
    });
    const numeric = validResponse({
      issues: [
        {
          code: 42 as unknown as ShortCircuitWireIssue["code"],
          severity: "error",
          message: "numeric code",
        },
      ],
    });
    expect(isShortCircuitSidecarResponse(empty)).toBe(false);
    expect(isShortCircuitSidecarResponse(numeric)).toBe(false);
  });

  it("rejects a bus row whose issueCodes contains a Stage 1 / Stage 2 code (e.g., E-LF-001)", () => {
    const broken = validResponse({
      buses: [
        {
          ...busRow(),
          issueCodes: ["E-LF-001"] as unknown as ShortCircuitIssueCode[],
        },
      ],
    });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects a bus row whose issueCodes contains an unknown string", () => {
    const broken = validResponse({
      buses: [
        {
          ...busRow(),
          issueCodes: ["NOT-A-CODE"] as unknown as ShortCircuitIssueCode[],
        },
      ],
    });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects a bus row whose issueCodes contains an empty string or non-string value", () => {
    const empty = validResponse({
      buses: [{ ...busRow(), issueCodes: [""] as unknown as ShortCircuitIssueCode[] }],
    });
    const numeric = validResponse({
      buses: [
        {
          ...busRow(),
          issueCodes: [1 as unknown as ShortCircuitIssueCode],
        },
      ],
    });
    expect(isShortCircuitSidecarResponse(empty)).toBe(false);
    expect(isShortCircuitSidecarResponse(numeric)).toBe(false);
  });

  it("rejects a bus row whose issueCodes mixes one valid and one invalid code", () => {
    // The "first valid, then invalid" ordering rules out a guard that
    // only checks the head of the array.
    const broken = validResponse({
      buses: [
        {
          ...busRow(),
          issueCodes: [
            "W-SC-001",
            "E-LF-001",
          ] as unknown as ShortCircuitIssueCode[],
        },
      ],
    });
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stage 3 PR #4 graduation — guardrails updated.
//
// PR #2 originally enforced that the app-normalized result model and
// orchestrator were NOT exported. PR #4 ships those surfaces (spec
// §7.2 / §7.5 / §13 PR #4) so the original "must-not-export" guardrail
// is replaced with a positive surface assertion. Out-of-scope checks
// that remain valid post-PR-#4 (no transport-level run on the public
// surface, no project-file fields on the request) are kept.
// ---------------------------------------------------------------------------

describe("Stage 3 PR #4 graduation — public surface", () => {
  it("exports the app-normalized ShortCircuit result model and orchestrator", async () => {
    const adapter = (await import("../src/index.js")) as unknown as Record<
      string,
      unknown
    >;
    expect(adapter).toHaveProperty("normalizeShortCircuitResult");
    expect(adapter).toHaveProperty("runShortCircuitForAppNetwork");
  });

  it("does not introduce a transport-level sidecar-execution call on the public surface", async () => {
    // The transport methods (`runShortCircuit`, `runLoadFlow`) live on
    // the `SidecarTransport` interface and are not re-exported from
    // the package index — only the orchestrator
    // (`runShortCircuitForAppNetwork`) is the public entry point.
    const adapter = (await import("../src/index.js")) as unknown as Record<
      string,
      unknown
    >;
    expect(adapter).not.toHaveProperty("runShortCircuit");
    expect(adapter).not.toHaveProperty("invokeShortCircuit");
  });

  it("does not add calculationResults / calculationSnapshots fields onto the request envelope", () => {
    const request: ShortCircuitRequest = {
      solverInput: emptySolverInput(),
      mode: "specific",
      faultTargets: [{ busInternalId: "eq_bus_mv" }],
      shortCircuitOptions: DEFAULT_SHORT_CIRCUIT_OPTIONS,
    };
    expect(request).not.toHaveProperty("calculationResults");
    expect(request).not.toHaveProperty("calculationSnapshots");
    expect(request.solverInput).not.toHaveProperty("calculationResults");
    expect(request.solverInput).not.toHaveProperty("calculationSnapshots");
  });
});
