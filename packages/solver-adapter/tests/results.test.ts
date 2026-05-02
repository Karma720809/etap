// Stage 2 PR #4 — Result normalization tests.
//
// Validates that `normalizeSolverResult` correctly projects the
// solver-shaped result into the app-shaped LoadFlowResult, preserves
// `internalId` traceability, swaps the solver's "line" vocabulary for
// the spec's "cable" vocabulary, and derives an honest `status`.

import { describe, expect, it } from "vitest";
import type { AppNetwork } from "@power-system-study/network-model";

import { normalizeSolverResult } from "../src/results.js";
import {
  buildSolverInputFromAppNetwork,
} from "../src/contract.js";
import {
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_INPUT_VERSION,
  type SolverInput,
  type SolverResult,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NETWORK_MODEL_VERSION = "2.0.0-pr2" as const;

function tinyAppNetwork(): AppNetwork {
  return {
    networkModelVersion: NETWORK_MODEL_VERSION,
    scenarioId: "SCN-N",
    frequencyHz: 60,
    buses: [
      {
        internalId: "eq_bus_a",
        tag: "BUS-A",
        vnKv: 6.6,
        topology: "3P3W",
        minVoltagePct: 95,
        maxVoltagePct: 105,
      },
      {
        internalId: "eq_bus_b",
        tag: "BUS-B",
        vnKv: 0.4,
        topology: "3P4W",
        minVoltagePct: 95,
        maxVoltagePct: 105,
      },
    ],
    sources: [
      {
        internalId: "eq_util",
        tag: "UTL",
        kind: "utility",
        busInternalId: "eq_bus_a",
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
    transformers: [
      {
        internalId: "eq_tr",
        tag: "TR",
        fromBusInternalId: "eq_bus_a",
        toBusInternalId: "eq_bus_b",
        snMva: 1,
        vnHvKv: 6.6,
        vnLvKv: 0.4,
        vkPercent: 6,
        vkrPercent: 1,
        xrRatio: null,
        vectorGroup: null,
        tapPosition: null,
      },
    ],
    cables: [],
    gates: [],
    gateConnections: [],
    loads: [
      {
        internalId: "eq_ld",
        tag: "LD",
        busInternalId: "eq_bus_b",
        pMw: 0.05,
        qMvar: 0.024,
        demandFactor: 1,
      },
    ],
    motors: [
      {
        internalId: "eq_mt",
        tag: "MT",
        busInternalId: "eq_bus_b",
        pMw: 0.1,
        qMvar: 0.05,
      },
    ],
    topologyEdges: [],
  };
}

function tinySolverResult(): SolverResult {
  return {
    status: "succeeded",
    converged: true,
    metadata: {
      solverName: "pandapower",
      solverVersion: "2.14.11",
      adapterVersion: "0.0.0-sidecar",
      options: { ...DEFAULT_SOLVER_OPTIONS },
      executedAt: "2026-05-02T00:00:00Z",
      inputHash: null,
      networkHash: null,
    },
    buses: [
      { internalId: "eq_bus_a", voltageKv: 6.6, voltagePuPct: 100, angleDeg: 0 },
      { internalId: "eq_bus_b", voltageKv: 0.396, voltagePuPct: 99, angleDeg: -0.5 },
    ],
    branches: [
      {
        internalId: "eq_tr",
        branchKind: "transformer",
        fromBusInternalId: "eq_bus_a",
        toBusInternalId: "eq_bus_b",
        pMwFrom: 0.151,
        qMvarFrom: 0.075,
        pMwTo: -0.15,
        qMvarTo: -0.074,
        currentA: 0.013 * 1000,
        loadingPct: 15,
        lossKw: 1.0,
      },
    ],
    issues: [],
  };
}

function makeSolverInput(appNetwork: AppNetwork): SolverInput {
  return buildSolverInputFromAppNetwork(appNetwork);
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

describe("normalizeSolverResult — happy path", () => {
  it("preserves bus internalIds and recovers tags from AppNetwork", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: tinySolverResult(),
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.busResults.map((b) => b.busInternalId)).toEqual(["eq_bus_a", "eq_bus_b"]);
    expect(result.busResults[0]?.tag).toBe("BUS-A");
    expect(result.busResults[1]?.tag).toBe("BUS-B");
    expect(result.busResults[1]?.voltagePuPct).toBeCloseTo(99);
  });

  it("preserves transformer branch attribution and copies P/Q from/to / current / loading / loss", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: tinySolverResult(),
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.branchResults).toHaveLength(1);
    const tx = result.branchResults[0]!;
    expect(tx.branchInternalId).toBe("eq_tr");
    expect(tx.sourceEquipmentInternalId).toBe("eq_tr");
    expect(tx.branchKind).toBe("transformer");
    expect(tx.fromBusInternalId).toBe("eq_bus_a");
    expect(tx.toBusInternalId).toBe("eq_bus_b");
    expect(tx.fromBusTag).toBe("BUS-A");
    expect(tx.toBusTag).toBe("BUS-B");
    expect(tx.loadingPct).toBe(15);
    expect(tx.lossKw).toBe(1.0);
  });

  it("rewrites solver branchKind \"line\" to spec vocabulary \"cable\"", () => {
    const appNetwork: AppNetwork = {
      ...tinyAppNetwork(),
      cables: [
        {
          internalId: "eq_cbl",
          tag: "CBL",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
          lengthM: 50,
          rOhmPerKm: 0.1,
          xOhmPerKm: 0.08,
          branchChainOrderIndex: 0,
          branchChainEdgeId: "e_chain",
        },
      ],
    };
    const solverInput = makeSolverInput(appNetwork);
    const solverResult: SolverResult = {
      ...tinySolverResult(),
      branches: [
        {
          internalId: "eq_cbl",
          branchKind: "line",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
          pMwFrom: 0.05,
          qMvarFrom: 0.02,
          pMwTo: -0.0499,
          qMvarTo: -0.0199,
          currentA: 12,
          loadingPct: null,
          lossKw: 0.05,
        },
      ],
    };

    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput,
      solverResult,
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.branchResults).toHaveLength(1);
    expect(result.branchResults[0]?.branchKind).toBe("cable");
    expect(result.branchResults[0]?.loadingPct).toBeNull();
  });

  it("partitions loads and motors into separate equipment loading lists", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: tinySolverResult(),
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.loadResults).toHaveLength(1);
    expect(result.loadResults[0]?.equipmentInternalId).toBe("eq_ld");
    expect(result.loadResults[0]?.origin).toBe("load");
    expect(result.motorResults).toHaveLength(1);
    expect(result.motorResults[0]?.equipmentInternalId).toBe("eq_mt");
    expect(result.motorResults[0]?.origin).toBe("motor");
  });

  it("derives status=\"valid\" on a converged, issue-free run", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: tinySolverResult(),
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.status).toBe("valid");
    expect(result.converged).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("stamps the caller-provided adapterVersion on metadata, not the sidecar's", () => {
    const appNetwork = tinyAppNetwork();
    const solverResult: SolverResult = {
      ...tinySolverResult(),
      metadata: {
        ...tinySolverResult().metadata,
        adapterVersion: "0.0.0-sidecar-fallback",
      },
    };
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult,
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.metadata.adapterVersion).toBe("0.1.0");
    expect(result.metadata.solverVersion).toBe("2.14.11");
  });
});

// ---------------------------------------------------------------------------
// Failure / warning derivation
// ---------------------------------------------------------------------------

describe("normalizeSolverResult — status derivation", () => {
  it("status=\"failed\" when the solver reports failed_solver", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: {
        ...tinySolverResult(),
        status: "failed_solver",
        converged: false,
        buses: [],
        branches: [],
        issues: [
          {
            code: "E-LF-001",
            severity: "error",
            message: "non-converged",
          },
        ],
      },
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.status).toBe("failed");
    expect(result.issues[0]?.code).toBe("E-LF-001");
    expect(result.busResults).toEqual([]);
  });

  it("status=\"warning\" when converged but warnings are present", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: {
        ...tinySolverResult(),
        issues: [
          {
            code: "W-LF-001",
            severity: "warning",
            message: "bus undervoltage",
            internalId: "eq_bus_b",
          },
        ],
      },
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.status).toBe("warning");
    expect(result.issues[0]?.internalId).toBe("eq_bus_b");
  });
});

// ---------------------------------------------------------------------------
// Stage 2 PR #4 review blocker 3 — totals + per-row status
// ---------------------------------------------------------------------------

describe("normalizeSolverResult — bus voltage-band status", () => {
  it("flags an undervoltage bus as 'warning' when below minVoltagePct", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: {
        ...tinySolverResult(),
        buses: [
          { internalId: "eq_bus_a", voltageKv: 6.6, voltagePuPct: 100, angleDeg: 0 },
          // BUS-B is below the 95% min band on the AppNetwork bus.
          { internalId: "eq_bus_b", voltageKv: 0.376, voltagePuPct: 94, angleDeg: -1 },
        ],
      },
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    const a = result.busResults.find((b) => b.busInternalId === "eq_bus_a");
    const b = result.busResults.find((b) => b.busInternalId === "eq_bus_b");
    expect(a?.status).toBe("ok");
    expect(b?.status).toBe("warning");
    expect(result.status).toBe("warning");
  });

  it("flags an overvoltage bus as 'warning' when above maxVoltagePct", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: {
        ...tinySolverResult(),
        buses: [
          { internalId: "eq_bus_a", voltageKv: 6.6, voltagePuPct: 100, angleDeg: 0 },
          { internalId: "eq_bus_b", voltageKv: 0.428, voltagePuPct: 107, angleDeg: 1 },
        ],
      },
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    const b = result.busResults.find((b) => b.busInternalId === "eq_bus_b");
    expect(b?.status).toBe("warning");
  });

  it("defaults bus status to 'ok' when no min/max is entered on the bus", () => {
    const appNetwork: AppNetwork = {
      ...tinyAppNetwork(),
      buses: [
        {
          internalId: "eq_bus_a",
          tag: "BUS-A",
          vnKv: 6.6,
          topology: "3P3W",
          minVoltagePct: null,
          maxVoltagePct: null,
        },
        {
          internalId: "eq_bus_b",
          tag: "BUS-B",
          vnKv: 0.4,
          topology: "3P4W",
          minVoltagePct: null,
          maxVoltagePct: null,
        },
      ],
    };
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: {
        ...tinySolverResult(),
        buses: [
          { internalId: "eq_bus_a", voltageKv: 6.6, voltagePuPct: 100, angleDeg: 0 },
          { internalId: "eq_bus_b", voltageKv: 0.34, voltagePuPct: 85, angleDeg: -2 },
        ],
      },
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.busResults.every((b) => b.status === "ok")).toBe(true);
  });
});

describe("normalizeSolverResult — branch loading status", () => {
  it("flags an overloaded branch as 'violation' when loadingPct > 100", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: {
        ...tinySolverResult(),
        branches: [
          {
            internalId: "eq_tr",
            branchKind: "transformer",
            fromBusInternalId: "eq_bus_a",
            toBusInternalId: "eq_bus_b",
            pMwFrom: 1.2,
            qMvarFrom: 0.4,
            pMwTo: -1.18,
            qMvarTo: -0.39,
            currentA: 100,
            loadingPct: 120,
            lossKw: 5,
          },
        ],
      },
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    const tx = result.branchResults[0]!;
    expect(tx.loadingPct).toBe(120);
    expect(tx.status).toBe("violation");
    expect(result.status).toBe("warning");
  });

  it("flags a near-limit branch as 'warning' at 90 ≤ loadingPct ≤ 100", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: {
        ...tinySolverResult(),
        branches: [
          {
            internalId: "eq_tr",
            branchKind: "transformer",
            fromBusInternalId: "eq_bus_a",
            toBusInternalId: "eq_bus_b",
            pMwFrom: 0.9,
            qMvarFrom: 0.3,
            pMwTo: -0.89,
            qMvarTo: -0.29,
            currentA: 80,
            loadingPct: 95,
            lossKw: 3,
          },
        ],
      },
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.branchResults[0]?.status).toBe("warning");
  });

  it("defaults branch status to 'ok' when loadingPct is null (no rating)", () => {
    const appNetwork: AppNetwork = {
      ...tinyAppNetwork(),
      cables: [
        {
          internalId: "eq_cbl",
          tag: "CBL",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
          lengthM: 50,
          rOhmPerKm: 0.1,
          xOhmPerKm: 0.08,
          branchChainOrderIndex: 0,
          branchChainEdgeId: "e_chain",
        },
      ],
    };
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: {
        ...tinySolverResult(),
        branches: [
          {
            internalId: "eq_cbl",
            branchKind: "line",
            fromBusInternalId: "eq_bus_a",
            toBusInternalId: "eq_bus_b",
            pMwFrom: 0.05,
            qMvarFrom: 0.02,
            pMwTo: -0.0499,
            qMvarTo: -0.0199,
            currentA: 12,
            loadingPct: null,
            lossKw: 0.1,
          },
        ],
      },
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.branchResults[0]?.status).toBe("ok");
    // Branch vocabulary uses "cable", not "line".
    expect(result.branchResults[0]?.branchKind).toBe("cable");
  });
});

describe("normalizeSolverResult — equipment loading status", () => {
  it("emits status='ok' on equipment rows when no rating is wired through", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: tinySolverResult(),
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    for (const row of result.loadResults) {
      expect(row.loadingPct).toBeNull();
      expect(row.status).toBe("ok");
    }
    for (const row of result.motorResults) {
      expect(row.loadingPct).toBeNull();
      expect(row.status).toBe("ok");
    }
  });
});

describe("normalizeSolverResult — totals", () => {
  it("derives totalGenerationMw from slack-side branch flows", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: tinySolverResult(),
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    // The transformer's HV side (eq_bus_a) is the slack bus, so its
    // pMwFrom (0.151) is the generation seen at the slack.
    expect(result.totalGenerationMw).toBeCloseTo(0.151, 6);
  });

  it("derives totalLoadMw by summing load + motor pMw", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: tinySolverResult(),
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    // 0.05 (LD) + 0.1 (MT) = 0.15
    expect(result.totalLoadMw).toBeCloseTo(0.15, 6);
  });

  it("derives totalLossesMw by summing branch losses", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: tinySolverResult(),
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    // tinySolverResult has 1 branch with lossKw=1.0 → totalLossesMw=0.001.
    expect(result.totalLossesMw).toBeCloseTo(0.001, 6);
  });

  it("returns zero totals when the run failed", () => {
    const appNetwork = tinyAppNetwork();
    const result = normalizeSolverResult({
      resultId: "lfr_test",
      runtimeSnapshotId: "snap_test",
      appNetwork,
      solverInput: makeSolverInput(appNetwork),
      solverResult: {
        ...tinySolverResult(),
        status: "failed_solver",
        converged: false,
        buses: [],
        branches: [],
        issues: [{ code: "E-LF-001", severity: "error", message: "no convergence" }],
      },
      adapterVersion: "0.1.0",
      createdAt: "2026-05-02T00:00:00Z",
    });

    expect(result.totalGenerationMw).toBe(0);
    expect(result.totalLoadMw).toBe(0);
    expect(result.totalLossesMw).toBe(0);
    expect(result.metadata.solverName).toBe("pandapower");
    expect(result.issues[0]?.code).toBe("E-LF-001");
  });
});
