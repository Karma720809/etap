// Stage 3 PR #4 — Short Circuit normalization tests.
//
// These tests exercise the wire→app projection in isolation. They build
// a minimal AppNetwork plus hand-crafted `ShortCircuitSidecarResponse`
// fixtures (no orchestrator, no transport) so the assertions focus on
// the field-rename + status-mapping rules in spec §7.5 and the
// nullability invariants in §7.1.

import { describe, expect, it } from "vitest";
import type { AppNetwork } from "@power-system-study/network-model";

import {
  DEFAULT_SHORT_CIRCUIT_OPTIONS,
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_INPUT_VERSION,
  normalizeShortCircuitResult,
  type ShortCircuitRequest,
  type ShortCircuitSidecarResponse,
  type SolverInput,
} from "../src/index.js";

const NOW = "2026-05-02T00:00:00Z";

function makeAppNetwork(): AppNetwork {
  return {
    networkModelVersion: "2.0.0-pr2",
    scenarioId: "SCN-N",
    frequencyHz: 60,
    buses: [
      {
        internalId: "eq_bus_mv",
        tag: "BUS-MV",
        vnKv: 6.6,
        topology: "3P3W",
        minVoltagePct: null,
        maxVoltagePct: null,
      },
      {
        internalId: "eq_bus_lv",
        tag: "BUS-LV",
        vnKv: 0.4,
        topology: "3P4W",
        minVoltagePct: null,
        maxVoltagePct: null,
      },
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
    generators: [],
    transformers: [],
    cables: [],
    gates: [],
    gateConnections: [],
    loads: [],
    motors: [],
    topologyEdges: [],
  };
}

function emptySolverInput(): SolverInput {
  return {
    inputVersion: SOLVER_INPUT_VERSION,
    scenarioId: "SCN-N",
    frequencyHz: 60,
    buses: [
      { internalId: "eq_bus_mv", tag: "BUS-MV", vnKv: 6.6, topology: "3P3W" },
      { internalId: "eq_bus_lv", tag: "BUS-LV", vnKv: 0.4, topology: "3P4W" },
    ],
    sources: [],
    transformers: [],
    lines: [],
    loads: [],
    generatorsPQ: [],
    options: DEFAULT_SOLVER_OPTIONS,
  };
}

function makeRequest(overrides: Partial<ShortCircuitRequest> = {}): ShortCircuitRequest {
  return {
    solverInput: emptySolverInput(),
    mode: "all_buses",
    faultTargets: [],
    shortCircuitOptions: DEFAULT_SHORT_CIRCUIT_OPTIONS,
    ...overrides,
  };
}

function makeResponse(
  overrides: Partial<ShortCircuitSidecarResponse> = {},
): ShortCircuitSidecarResponse {
  return {
    status: "succeeded",
    metadata: {
      solverName: "pandapower",
      solverVersion: "fake-2.14.10",
      adapterVersion: "0.0.0-sidecar",
      options: DEFAULT_SOLVER_OPTIONS,
      executedAt: NOW,
      inputHash: null,
      networkHash: null,
    },
    shortCircuit: {
      calculationCase: "maximum",
      faultType: "threePhase",
      computePeak: true,
      computeThermal: true,
      voltageFactor: 1,
    },
    buses: [
      {
        internalId: "eq_bus_mv",
        voltageLevelKv: 6.6,
        ikssKa: 12.34,
        ipKa: 31.5,
        ithKa: 13.0,
        skssMva: 141.1,
        status: "valid",
      },
      {
        internalId: "eq_bus_lv",
        voltageLevelKv: 0.4,
        ikssKa: 8.5,
        ipKa: 21.7,
        ithKa: 9.1,
        skssMva: 5.9,
        status: "valid",
      },
    ],
    issues: [],
    ...overrides,
  };
}

describe("normalizeShortCircuitResult — happy path", () => {
  it("renames internalId → busInternalId and maps valid → ok", () => {
    const result = normalizeShortCircuitResult({
      resultId: "scr_1",
      runtimeSnapshotId: "snap_1",
      appNetwork: makeAppNetwork(),
      request: makeRequest(),
      response: makeResponse(),
      adapterVersion: "0.1.0",
      createdAt: NOW,
    });

    expect(result.module).toBe("shortCircuit");
    expect(result.status).toBe("valid");
    expect(result.busResults).toHaveLength(2);

    const mv = result.busResults.find((b) => b.busInternalId === "eq_bus_mv");
    expect(mv).toBeDefined();
    expect(mv?.tag).toBe("BUS-MV");
    expect(mv?.voltageLevelKv).toBe(6.6);
    expect(mv?.status).toBe("ok");
    expect(mv?.ikssKa).toBe(12.34);
    expect(mv?.ipKa).toBe(31.5);
    expect(mv?.ithKa).toBe(13);
    expect(mv?.skssMva).toBe(141.1);

    expect(result.metadata.adapterVersion).toBe("0.1.0");
    expect(result.metadata.solverVersion).toBe("fake-2.14.10");
    expect(result.faultType).toBe("threePhase");
    expect(result.calculationCase).toBe("maximum");
    expect(result.voltageFactor).toBe(1);
  });

  it("preserves null numeric fields end-to-end (no synthesized defaults)", () => {
    const response = makeResponse({
      buses: [
        {
          internalId: "eq_bus_mv",
          voltageLevelKv: 6.6,
          ikssKa: 12.0,
          ipKa: null,
          ithKa: null,
          skssMva: 137.0,
          status: "valid",
        },
        {
          internalId: "eq_bus_lv",
          voltageLevelKv: 0.4,
          ikssKa: 8.5,
          ipKa: null,
          ithKa: null,
          skssMva: 5.9,
          status: "valid",
        },
      ],
    });
    const result = normalizeShortCircuitResult({
      resultId: "scr_1",
      runtimeSnapshotId: "snap_1",
      appNetwork: makeAppNetwork(),
      request: makeRequest(),
      response,
      adapterVersion: "0.1.0",
      createdAt: NOW,
    });
    const mv = result.busResults.find((b) => b.busInternalId === "eq_bus_mv");
    expect(mv?.ipKa).toBeNull();
    expect(mv?.ithKa).toBeNull();
    expect(mv?.ikssKa).toBe(12);
  });

  it("maps any per-row warning to top-level warning (no per-row failed)", () => {
    const response = makeResponse({
      buses: [
        {
          internalId: "eq_bus_mv",
          voltageLevelKv: 6.6,
          ikssKa: 12.34,
          ipKa: 31.5,
          ithKa: 13,
          skssMva: 141.1,
          status: "warning",
          issueCodes: ["W-SC-001"],
        },
        {
          internalId: "eq_bus_lv",
          voltageLevelKv: 0.4,
          ikssKa: 8.5,
          ipKa: 21.7,
          ithKa: 9.1,
          skssMva: 5.9,
          status: "valid",
        },
      ],
    });
    const result = normalizeShortCircuitResult({
      resultId: "scr_1",
      runtimeSnapshotId: "snap_1",
      appNetwork: makeAppNetwork(),
      request: makeRequest(),
      response,
      adapterVersion: "0.1.0",
      createdAt: NOW,
    });
    const mv = result.busResults.find((b) => b.busInternalId === "eq_bus_mv");
    expect(mv?.status).toBe("warning");
    expect(mv?.issueCodes).toEqual(["W-SC-001"]);
    expect(result.status).toBe("warning");
  });

  it("maps any per-row failed to top-level warning (run completed with issues)", () => {
    // Spec §7.5.3: a per-row failure does not block other rows; the
    // top-level status reflects "the run completed with warnings".
    const response = makeResponse({
      buses: [
        {
          internalId: "eq_bus_mv",
          voltageLevelKv: 6.6,
          ikssKa: 12.34,
          ipKa: 31.5,
          ithKa: 13,
          skssMva: 141.1,
          status: "valid",
        },
        {
          internalId: "eq_bus_lv",
          voltageLevelKv: 0.4,
          ikssKa: null,
          ipKa: null,
          ithKa: null,
          skssMva: null,
          status: "failed",
          issueCodes: ["E-SC-001"],
        },
      ],
    });
    const result = normalizeShortCircuitResult({
      resultId: "scr_1",
      runtimeSnapshotId: "snap_1",
      appNetwork: makeAppNetwork(),
      request: makeRequest(),
      response,
      adapterVersion: "0.1.0",
      createdAt: NOW,
    });
    const lv = result.busResults.find((b) => b.busInternalId === "eq_bus_lv");
    expect(lv?.status).toBe("failed");
    expect(lv?.ikssKa).toBeNull();
    expect(lv?.ipKa).toBeNull();
    expect(result.status).toBe("warning");
  });
});

describe("normalizeShortCircuitResult — failed sidecar response", () => {
  it("maps failed_solver to a failed top-level result with empty busResults", () => {
    const response = makeResponse({
      status: "failed_solver",
      buses: [],
      issues: [
        {
          code: "E-SC-001",
          severity: "error",
          message: "pandapower calc_sc raised: RuntimeError",
        },
      ],
    });
    const result = normalizeShortCircuitResult({
      resultId: "scr_1",
      runtimeSnapshotId: "snap_1",
      appNetwork: makeAppNetwork(),
      request: makeRequest(),
      response,
      adapterVersion: "0.1.0",
      createdAt: NOW,
    });
    expect(result.status).toBe("failed");
    expect(result.busResults).toEqual([]);
    expect(result.issues[0]?.code).toBe("E-SC-001");
  });

  it("maps failed_validation to a failed top-level result with no fake numerics", () => {
    const response = makeResponse({
      status: "failed_validation",
      buses: [],
      issues: [
        {
          code: "E-SC-005",
          severity: "error",
          message: "mode='specific' requires at least one faultTargets entry.",
          field: "faultTargets",
        },
      ],
    });
    const result = normalizeShortCircuitResult({
      resultId: "scr_1",
      runtimeSnapshotId: "snap_1",
      appNetwork: makeAppNetwork(),
      request: makeRequest({ mode: "specific" }),
      response,
      adapterVersion: "0.1.0",
      createdAt: NOW,
    });
    expect(result.status).toBe("failed");
    expect(result.busResults).toEqual([]);
    expect(result.issues[0]?.code).toBe("E-SC-005");
    expect(result.issues[0]?.field).toBe("faultTargets");
  });
});

describe("normalizeShortCircuitResult — synthesized unavailable rows", () => {
  it("synthesizes unavailable rows for AppNetwork buses missing from the wire response (mode='specific')", () => {
    // Specific-mode response that only computed eq_bus_mv. eq_bus_lv
    // must come back as `unavailable` with all numerics null. Per spec
    // §7.3, `unavailable` rows do not flip the top-level status — the
    // missing bus reflects the specific-mode scoping decision, not a
    // calculation failure.
    const response = makeResponse({
      buses: [
        {
          internalId: "eq_bus_mv",
          voltageLevelKv: 6.6,
          ikssKa: 12.34,
          ipKa: 31.5,
          ithKa: 13,
          skssMva: 141.1,
          status: "valid",
        },
      ],
    });
    const request = makeRequest({
      mode: "specific",
      faultTargets: [{ busInternalId: "eq_bus_mv" }],
    });
    const result = normalizeShortCircuitResult({
      resultId: "scr_1",
      runtimeSnapshotId: "snap_1",
      appNetwork: makeAppNetwork(),
      request,
      response,
      adapterVersion: "0.1.0",
      createdAt: NOW,
    });
    const lv = result.busResults.find((b) => b.busInternalId === "eq_bus_lv");
    expect(lv).toBeDefined();
    expect(lv?.status).toBe("unavailable");
    expect(lv?.tag).toBe("BUS-LV");
    expect(lv?.voltageLevelKv).toBe(0.4);
    expect(lv?.ikssKa).toBeNull();
    expect(lv?.ipKa).toBeNull();
    expect(lv?.ithKa).toBeNull();
    expect(lv?.skssMva).toBeNull();
    expect(lv?.issueCodes).toEqual([]);
    // Specific-mode missing rows do NOT add a top-level issue.
    expect(result.issues).toEqual([]);
    expect(result.status).toBe("valid");
  });
});

// ---------------------------------------------------------------------------
// Stage 3 PR #4 review-blocker fixes
// ---------------------------------------------------------------------------

describe("normalizeShortCircuitResult — mode='all_buses' completeness check (Blocker 1)", () => {
  it("emits a structured E-SC-001 and non-valid status when an expected bus is missing", () => {
    // mode='all_buses' implicitly targets every bus; a missing wire
    // row is a sidecar response completeness mismatch (spec §7.5.2).
    const response = makeResponse({
      buses: [
        {
          internalId: "eq_bus_mv",
          voltageLevelKv: 6.6,
          ikssKa: 12.34,
          ipKa: 31.5,
          ithKa: 13,
          skssMva: 141.1,
          status: "valid",
        },
        // eq_bus_lv intentionally missing.
      ],
    });
    const result = normalizeShortCircuitResult({
      resultId: "scr_1",
      runtimeSnapshotId: "snap_1",
      appNetwork: makeAppNetwork(),
      request: makeRequest({ mode: "all_buses" }),
      response,
      adapterVersion: "0.1.0",
      createdAt: NOW,
    });
    // Top-level status MUST NOT be valid when all_buses output is
    // incomplete. The error severity flips it to failed per §S3-OQ-02.
    expect(result.status).not.toBe("valid");
    expect(result.status).toBe("failed");
    // A structured top-level issue identifies the missing bus.
    const incompleteIssue = result.issues.find(
      (i) => i.code === "E-SC-001" && i.internalId === "eq_bus_lv",
    );
    expect(incompleteIssue).toBeDefined();
    expect(incompleteIssue?.severity).toBe("error");
    // Diagnostic rows still ship: eq_bus_mv from the wire response,
    // eq_bus_lv as orchestrator-synthesized unavailable.
    const lv = result.busResults.find((b) => b.busInternalId === "eq_bus_lv");
    expect(lv?.status).toBe("unavailable");
    expect(lv?.ikssKa).toBeNull();
  });

  it("does NOT emit a top-level issue when mode='specific' has missing rows", () => {
    // Specific-mode missing rows are an expected scoping outcome, not
    // a discrepancy. Status stays valid.
    const response = makeResponse({
      buses: [
        {
          internalId: "eq_bus_mv",
          voltageLevelKv: 6.6,
          ikssKa: 12.34,
          ipKa: 31.5,
          ithKa: 13,
          skssMva: 141.1,
          status: "valid",
        },
      ],
    });
    const result = normalizeShortCircuitResult({
      resultId: "scr_1",
      runtimeSnapshotId: "snap_1",
      appNetwork: makeAppNetwork(),
      request: makeRequest({
        mode: "specific",
        faultTargets: [{ busInternalId: "eq_bus_mv" }],
      }),
      response,
      adapterVersion: "0.1.0",
      createdAt: NOW,
    });
    expect(result.issues).toEqual([]);
    expect(result.status).toBe("valid");
  });
});

describe("normalizeShortCircuitResult — unknown wire bus row (Blocker 2)", () => {
  it("does NOT fabricate voltageLevelKv = 0 when the wire row carries voltageLevelKv: null", () => {
    // The pre-fix code path took `wireRow.voltageLevelKv ?? 0`, which
    // substituted `0` for `null` and produced a fake bus row. The fix
    // drops the row entirely and surfaces a structured issue instead.
    const response = makeResponse({
      buses: [
        // Both AppNetwork buses correctly mirrored.
        {
          internalId: "eq_bus_mv",
          voltageLevelKv: 6.6,
          ikssKa: 12.34,
          ipKa: 31.5,
          ithKa: 13,
          skssMva: 141.1,
          status: "valid",
        },
        {
          internalId: "eq_bus_lv",
          voltageLevelKv: 0.4,
          ikssKa: 8.5,
          ipKa: 21.7,
          ithKa: 9.1,
          skssMva: 5.9,
          status: "valid",
        },
        // Unknown bus that AppNetwork does not contain — voltageLevelKv null.
        {
          internalId: "eq_bus_phantom",
          voltageLevelKv: null,
          ikssKa: null,
          ipKa: null,
          ithKa: null,
          skssMva: null,
          status: "failed",
          issueCodes: ["E-SC-001"],
        },
      ],
    });
    const result = normalizeShortCircuitResult({
      resultId: "scr_1",
      runtimeSnapshotId: "snap_1",
      appNetwork: makeAppNetwork(),
      request: makeRequest({ mode: "all_buses" }),
      response,
      adapterVersion: "0.1.0",
      createdAt: NOW,
    });

    // No row in busResults references the phantom bus.
    const phantomRow = result.busResults.find(
      (b) => b.busInternalId === "eq_bus_phantom",
    );
    expect(phantomRow).toBeUndefined();
    // No row has voltageLevelKv === 0 fabricated from a null wire value.
    for (const row of result.busResults) {
      expect(row.voltageLevelKv).not.toBe(0);
    }
    // A structured top-level issue identifies the unknown id.
    const unknownIssue = result.issues.find(
      (i) => i.code === "E-SC-001" && i.internalId === "eq_bus_phantom",
    );
    expect(unknownIssue).toBeDefined();
    expect(unknownIssue?.severity).toBe("error");
    // Top-level status flipped from valid by the synthesized error.
    expect(result.status).not.toBe("valid");
    expect(result.status).toBe("failed");
  });

  it("guarantees no null → 0 voltageLevelKv substitution for any emitted row", () => {
    // Belt-and-braces: even with multiple unknown wire rows, none of
    // them must reach `busResults` carrying voltageLevelKv = 0.
    const response = makeResponse({
      buses: [
        {
          internalId: "eq_bus_phantom_a",
          voltageLevelKv: null,
          ikssKa: null,
          ipKa: null,
          ithKa: null,
          skssMva: null,
          status: "failed",
        },
        {
          internalId: "eq_bus_phantom_b",
          voltageLevelKv: null,
          ikssKa: null,
          ipKa: null,
          ithKa: null,
          skssMva: null,
          status: "failed",
        },
      ],
    });
    const result = normalizeShortCircuitResult({
      resultId: "scr_1",
      runtimeSnapshotId: "snap_1",
      appNetwork: makeAppNetwork(),
      request: makeRequest({ mode: "all_buses" }),
      response,
      adapterVersion: "0.1.0",
      createdAt: NOW,
    });
    for (const row of result.busResults) {
      expect(row.busInternalId).not.toMatch(/^eq_bus_phantom_/);
      expect(row.voltageLevelKv).not.toBe(0);
    }
    // Two unknown wire rows + two missing AppNetwork buses
    // (eq_bus_mv / eq_bus_lv expected for all_buses mode).
    const unknownIssues = result.issues.filter(
      (i) => i.internalId === "eq_bus_phantom_a" || i.internalId === "eq_bus_phantom_b",
    );
    expect(unknownIssues).toHaveLength(2);
    for (const issue of unknownIssues) {
      expect(issue.code).toBe("E-SC-001");
      expect(issue.severity).toBe("error");
    }
  });
});
