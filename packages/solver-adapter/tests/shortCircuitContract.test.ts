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
  SOLVER_INPUT_VERSION,
  isShortCircuitSidecarResponse,
  type ShortCircuitFaultTarget,
  type ShortCircuitIssueCode,
  type ShortCircuitOptions,
  type ShortCircuitRequest,
  type ShortCircuitSidecarBusRow,
  type ShortCircuitSidecarResponse,
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

describe("isShortCircuitSidecarResponse", () => {
  function validResponse(): ShortCircuitSidecarResponse {
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
      buses: [],
      issues: [],
    };
  }

  it("accepts a well-formed response", () => {
    expect(isShortCircuitSidecarResponse(validResponse())).toBe(true);
  });

  it("rejects null and primitives", () => {
    expect(isShortCircuitSidecarResponse(null)).toBe(false);
    expect(isShortCircuitSidecarResponse(undefined)).toBe(false);
    expect(isShortCircuitSidecarResponse("succeeded")).toBe(false);
    expect(isShortCircuitSidecarResponse(42)).toBe(false);
  });

  it("rejects responses with a null metadata block (Stage 2 PR #4 hardening parity)", () => {
    const broken = { ...validResponse(), metadata: null };
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });

  it("rejects responses without the shortCircuit metadata block", () => {
    const r = validResponse() as unknown as Record<string, unknown>;
    delete r.shortCircuit;
    expect(isShortCircuitSidecarResponse(r)).toBe(false);
  });

  it("rejects responses without buses or issues arrays", () => {
    const noBuses = { ...validResponse(), buses: undefined };
    const noIssues = { ...validResponse(), issues: undefined };
    expect(isShortCircuitSidecarResponse(noBuses)).toBe(false);
    expect(isShortCircuitSidecarResponse(noIssues)).toBe(false);
  });

  it("rejects responses where shortCircuit.voltageFactor is not numeric", () => {
    const broken = {
      ...validResponse(),
      shortCircuit: {
        ...validResponse().shortCircuit,
        voltageFactor: "cmax" as unknown as number,
      },
    };
    expect(isShortCircuitSidecarResponse(broken)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Out-of-scope guardrails — PR #2 must not reach into project file or PR #4
// surfaces.
// ---------------------------------------------------------------------------

describe("Stage 3 PR #2 guardrails", () => {
  it("does not export an app-normalized ShortCircuitResult / ShortCircuitBusResult / ShortCircuitRunBundle", async () => {
    // Boundary check: PR #2 only ships wire-level types. The app-
    // normalized result model and the runtime bundle land in PR #4.
    // Importing them here must fail at the module level.
    const adapter = (await import("../src/index.js")) as unknown as Record<
      string,
      unknown
    >;
    expect(adapter).not.toHaveProperty("ShortCircuitResult");
    expect(adapter).not.toHaveProperty("ShortCircuitBusResult");
    expect(adapter).not.toHaveProperty("ShortCircuitRunBundle");
    expect(adapter).not.toHaveProperty("normalizeShortCircuitResult");
    expect(adapter).not.toHaveProperty("runShortCircuitForAppNetwork");
  });

  it("does not introduce any sidecar-execution call on the public surface", async () => {
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
