// Stage 2 PR #5 — Voltage Drop derivation tests.
//
// These tests pin `deriveVoltageDrop()` against the spec rules in
// §7 / §9: failed-LF → E-VD-001, missing endpoint voltage → E-VD-002
// row-level unavailable, status mapping ok / warning (W-VD-002) /
// violation (W-VD-001), and the spec §7.2 default limits.
//
// The tests also enforce app-vocabulary preservation: the runtime
// VoltageDropBranchResult must use `cable | transformer` (never
// pandapower's `line`), and every row must carry the AppNetwork
// `internalId` verbatim.

import { describe, expect, it } from "vitest";
import type { AppNetwork } from "@power-system-study/network-model";

import {
  DEFAULT_VOLTAGE_DROP_LIMIT_CABLE_PCT,
  DEFAULT_VOLTAGE_DROP_LIMIT_TRANSFORMER_PCT,
  deriveVoltageDrop,
} from "../src/voltageDrop.js";
import type {
  LoadFlowBranchResult,
  LoadFlowBusResult,
  LoadFlowResult,
} from "../src/results.js";
import { DEFAULT_SOLVER_OPTIONS } from "../src/types.js";

const NETWORK_MODEL_VERSION = "2.0.0-pr2" as const;

function tinyAppNetwork(): AppNetwork {
  return {
    networkModelVersion: NETWORK_MODEL_VERSION,
    scenarioId: "SCN-N",
    frequencyHz: 60,
    buses: [
      { internalId: "eq_bus_a", tag: "BUS-A", vnKv: 6.6, topology: "3P3W", minVoltagePct: 95, maxVoltagePct: 105 },
      { internalId: "eq_bus_b", tag: "BUS-B", vnKv: 0.4, topology: "3P4W", minVoltagePct: 95, maxVoltagePct: 105 },
    ],
    sources: [],
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

function bus(internalId: string, voltagePuPct: number, voltageKv: number): LoadFlowBusResult {
  return {
    busInternalId: internalId,
    tag: internalId,
    voltageKv,
    voltagePuPct,
    angleDeg: 0,
    status: "ok",
  };
}

function branch(args: Partial<LoadFlowBranchResult> & {
  branchInternalId: string;
  branchKind: "cable" | "transformer";
  fromBusInternalId: string;
  toBusInternalId: string;
}): LoadFlowBranchResult {
  return {
    branchInternalId: args.branchInternalId,
    branchKind: args.branchKind,
    sourceEquipmentInternalId: args.sourceEquipmentInternalId ?? args.branchInternalId,
    fromBusInternalId: args.fromBusInternalId,
    toBusInternalId: args.toBusInternalId,
    fromBusTag: args.fromBusTag ?? args.fromBusInternalId,
    toBusTag: args.toBusTag ?? args.toBusInternalId,
    pMwFrom: args.pMwFrom ?? 0.1,
    qMvarFrom: args.qMvarFrom ?? 0.05,
    pMwTo: args.pMwTo ?? -0.099,
    qMvarTo: args.qMvarTo ?? -0.049,
    currentA: args.currentA ?? 100,
    loadingPct: args.loadingPct ?? null,
    lossKw: args.lossKw ?? 1.0,
    status: args.status ?? "ok",
  };
}

function makeLoadFlow(args: {
  resultId?: string;
  status?: LoadFlowResult["status"];
  buses?: LoadFlowBusResult[];
  branches?: LoadFlowBranchResult[];
}): LoadFlowResult {
  return {
    resultId: args.resultId ?? "lfr_test",
    runtimeSnapshotId: "snap_test",
    scenarioId: "SCN-N",
    createdAt: "2026-05-02T00:00:00Z",
    status: args.status ?? "valid",
    converged: args.status !== "failed",
    busResults: args.buses ?? [],
    branchResults: args.branches ?? [],
    loadResults: [],
    motorResults: [],
    totalGenerationMw: 0,
    totalLoadMw: 0,
    totalLossesMw: 0,
    issues: [],
    metadata: {
      solverName: "pandapower",
      solverVersion: "fake",
      adapterVersion: "0.1.0",
      solverOptions: { ...DEFAULT_SOLVER_OPTIONS },
      executedAt: "2026-05-02T00:00:00Z",
      inputHash: null,
      networkHash: null,
    },
  };
}

// ---------------------------------------------------------------------------
// E-VD-001 — Load Flow failed
// ---------------------------------------------------------------------------

describe("deriveVoltageDrop — failed Load Flow", () => {
  it("returns a failed result with E-VD-001 when loadFlow.status is 'failed' (spec §7.4)", () => {
    const lf = makeLoadFlow({ status: "failed" });
    const vd = deriveVoltageDrop(lf, tinyAppNetwork(), {
      resultId: "vdr_test_failed",
      createdAt: "2026-05-02T00:00:01Z",
    });

    expect(vd.status).toBe("failed");
    expect(vd.branchResults).toEqual([]);
    expect(vd.issues).toHaveLength(1);
    expect(vd.issues[0]?.code).toBe("E-VD-001");
    expect(vd.issues[0]?.severity).toBe("error");
    expect(vd.totals.branchCount).toBe(0);
    expect(vd.totals.maxVoltageDropPct).toBeNull();
  });

  it("preserves identity fields on the failed result", () => {
    const lf = makeLoadFlow({ status: "failed", resultId: "lfr_xxx" });
    const vd = deriveVoltageDrop(lf, tinyAppNetwork(), {
      resultId: "vdr_xxx",
      createdAt: "2026-05-02T00:00:01Z",
    });

    expect(vd.resultId).toBe("vdr_xxx");
    expect(vd.sourceLoadFlowResultId).toBe("lfr_xxx");
    expect(vd.runtimeSnapshotId).toBe("snap_test");
    expect(vd.scenarioId).toBe("SCN-N");
  });
});

// ---------------------------------------------------------------------------
// E-VD-002 — missing endpoint voltage
// ---------------------------------------------------------------------------

describe("deriveVoltageDrop — missing input voltage", () => {
  it("marks the branch row 'unavailable' and emits E-VD-002 when an endpoint voltage is missing", () => {
    const lf = makeLoadFlow({
      buses: [bus("eq_bus_a", 100, 6.6)], // bus_b absent — no LF row
      branches: [
        branch({
          branchInternalId: "eq_cbl",
          branchKind: "cable",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
        }),
      ],
    });

    const vd = deriveVoltageDrop(lf, tinyAppNetwork(), {
      resultId: "vdr_evd002",
      createdAt: "2026-05-02T00:00:01Z",
    });

    expect(vd.status).toBe("warning");
    expect(vd.branchResults).toHaveLength(1);
    const row = vd.branchResults[0]!;
    expect(row.status).toBe("unavailable");
    expect(row.sendingEndVoltagePu).toBeNull();
    expect(row.receivingEndVoltagePu).toBeNull();
    expect(row.voltageDropPct).toBeNull();
    expect(row.issueCodes).toEqual(["E-VD-002"]);
    // No fake numeric values were invented.
    expect(row.voltageDropV).toBeNull();
    expect(row.voltageDropPu).toBeNull();
    // The error should also appear on the top-level issues list.
    expect(vd.issues.some((i) => i.code === "E-VD-002" && i.internalId === "eq_cbl")).toBe(true);
    // Totals partition the unavailable row out of ok/warning/violation buckets.
    expect(vd.totals.unavailableCount).toBe(1);
    expect(vd.totals.okCount).toBe(0);
    expect(vd.totals.maxVoltageDropPct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Numeric derivation
// ---------------------------------------------------------------------------

describe("deriveVoltageDrop — numeric derivation", () => {
  it("computes voltageDropPct from two bus voltagePuPct values per spec §7.1", () => {
    // Send=6.6 kV @ 100% pu, Recv=6.5 kV @ ~98.5% pu  →
    // dropV = 100 V, dropPct = 100 / 6600 * 100 ≈ 1.515%.
    const lf = makeLoadFlow({
      buses: [bus("eq_bus_a", 100, 6.6), bus("eq_bus_b", 98.4848, 6.5)],
      branches: [
        branch({
          branchInternalId: "eq_cbl",
          branchKind: "cable",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
          pMwFrom: 0.5, // sending = from
        }),
      ],
    });
    const vd = deriveVoltageDrop(lf, tinyAppNetwork(), {
      resultId: "vdr_n1",
      createdAt: "2026-05-02T00:00:01Z",
    });

    const row = vd.branchResults[0]!;
    expect(row.sendingBusInternalId).toBe("eq_bus_a");
    expect(row.receivingBusInternalId).toBe("eq_bus_b");
    expect(row.sendingEndVoltageV).toBeCloseTo(6600, 6);
    expect(row.receivingEndVoltageV).toBeCloseTo(6500, 6);
    expect(row.voltageDropV).toBeCloseTo(100, 6);
    expect(row.voltageDropPct).toBeCloseTo(1.5151515, 4);
    expect(row.voltageDropPu).toBeCloseTo(100 / 6600 /* ≈ 0.01515 */, 4);
  });

  it("flips sending/receiving when pMwFrom is negative (spec §7.1 direction by power flow)", () => {
    const lf = makeLoadFlow({
      buses: [bus("eq_bus_a", 99, 6.534), bus("eq_bus_b", 100, 6.6)],
      branches: [
        branch({
          branchInternalId: "eq_cbl",
          branchKind: "cable",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
          pMwFrom: -0.2, // power flows to → from, so sending = "to"
          pMwTo: 0.2,
        }),
      ],
    });
    const vd = deriveVoltageDrop(lf, tinyAppNetwork(), {
      resultId: "vdr_n2",
      createdAt: "2026-05-02T00:00:01Z",
    });

    const row = vd.branchResults[0]!;
    expect(row.sendingBusInternalId).toBe("eq_bus_b");
    expect(row.receivingBusInternalId).toBe("eq_bus_a");
    expect(row.sendingEndVoltagePu).toBeCloseTo(1.0, 6);
    expect(row.receivingEndVoltagePu).toBeCloseTo(0.99, 6);
    expect(row.voltageDropPct).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Status mapping (spec §7.3.1)
// ---------------------------------------------------------------------------

describe("deriveVoltageDrop — status mapping", () => {
  it("status 'ok' when voltageDropPct ≤ 0.9 × limitPct", () => {
    // Cable limit default is 3% → 0.9 × 3 = 2.7%. A 1.5% drop is ok.
    const lf = makeLoadFlow({
      buses: [bus("eq_bus_a", 100, 6.6), bus("eq_bus_b", 98.5, 6.501)],
      branches: [
        branch({
          branchInternalId: "eq_cbl_ok",
          branchKind: "cable",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
        }),
      ],
    });
    const vd = deriveVoltageDrop(lf, tinyAppNetwork(), {
      resultId: "vdr_ok",
      createdAt: "2026-05-02T00:00:01Z",
    });

    expect(vd.branchResults[0]?.status).toBe("ok");
    expect(vd.branchResults[0]?.issueCodes).toEqual([]);
    expect(vd.status).toBe("valid");
  });

  it("status 'warning' (W-VD-002) when 0.9 × limit < drop ≤ limit", () => {
    // Cable limit 3.0%; 2.85% drop sits in the 90–100% band.
    const lf = makeLoadFlow({
      buses: [bus("eq_bus_a", 100, 6.6), bus("eq_bus_b", 97.15, 6.4119)],
      branches: [
        branch({
          branchInternalId: "eq_cbl_warn",
          branchKind: "cable",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
        }),
      ],
    });
    const vd = deriveVoltageDrop(lf, tinyAppNetwork(), {
      resultId: "vdr_warn",
      createdAt: "2026-05-02T00:00:01Z",
    });

    expect(vd.branchResults[0]?.status).toBe("warning");
    expect(vd.branchResults[0]?.issueCodes).toContain("W-VD-002");
    expect(vd.issues.some((i) => i.code === "W-VD-002" && i.internalId === "eq_cbl_warn")).toBe(true);
    expect(vd.status).toBe("warning");
  });

  it("status 'violation' (W-VD-001) when drop > limit", () => {
    // Cable limit 3.0%; 4% drop exceeds the limit.
    const lf = makeLoadFlow({
      buses: [bus("eq_bus_a", 100, 6.6), bus("eq_bus_b", 96, 6.336)],
      branches: [
        branch({
          branchInternalId: "eq_cbl_vio",
          branchKind: "cable",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
        }),
      ],
    });
    const vd = deriveVoltageDrop(lf, tinyAppNetwork(), {
      resultId: "vdr_vio",
      createdAt: "2026-05-02T00:00:01Z",
    });

    expect(vd.branchResults[0]?.status).toBe("violation");
    expect(vd.branchResults[0]?.issueCodes).toContain("W-VD-001");
    expect(vd.issues.some((i) => i.code === "W-VD-001" && i.internalId === "eq_cbl_vio")).toBe(true);
    expect(vd.totals.violationCount).toBe(1);
    expect(vd.status).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// Limits & vocabulary
// ---------------------------------------------------------------------------

describe("deriveVoltageDrop — limits and vocabulary", () => {
  it("uses spec §7.2 default limits — 3% cable, 5% transformer", () => {
    const lf = makeLoadFlow({
      buses: [bus("eq_bus_a", 100, 6.6), bus("eq_bus_b", 99, 6.534)],
      branches: [
        branch({
          branchInternalId: "eq_cbl",
          branchKind: "cable",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
        }),
        branch({
          branchInternalId: "eq_tr",
          branchKind: "transformer",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
        }),
      ],
    });
    const vd = deriveVoltageDrop(lf, tinyAppNetwork(), {
      resultId: "vdr_limits",
      createdAt: "2026-05-02T00:00:01Z",
    });

    const cableRow = vd.branchResults.find((r) => r.branchKind === "cable")!;
    const xfmrRow = vd.branchResults.find((r) => r.branchKind === "transformer")!;
    expect(cableRow.limitPct).toBe(DEFAULT_VOLTAGE_DROP_LIMIT_CABLE_PCT);
    expect(xfmrRow.limitPct).toBe(DEFAULT_VOLTAGE_DROP_LIMIT_TRANSFORMER_PCT);
    expect(vd.limits.cablePct).toBe(3.0);
    expect(vd.limits.transformerPct).toBe(5.0);
  });

  it("respects caller-supplied per-kind limit overrides", () => {
    const lf = makeLoadFlow({
      buses: [bus("eq_bus_a", 100, 6.6), bus("eq_bus_b", 99, 6.534)],
      branches: [
        branch({
          branchInternalId: "eq_cbl",
          branchKind: "cable",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
        }),
      ],
    });
    const vd = deriveVoltageDrop(lf, tinyAppNetwork(), {
      resultId: "vdr_override",
      createdAt: "2026-05-02T00:00:01Z",
      cableLimitPct: 0.5, // very tight — 1% drop violates 0.5% limit
      transformerLimitPct: 2.0,
    });

    expect(vd.branchResults[0]?.limitPct).toBe(0.5);
    expect(vd.branchResults[0]?.status).toBe("violation");
  });

  it("preserves app vocabulary `cable` / `transformer` and the source equipment internalId", () => {
    const lf = makeLoadFlow({
      buses: [bus("eq_bus_a", 100, 6.6), bus("eq_bus_b", 98.5, 6.501)],
      branches: [
        branch({
          branchInternalId: "eq_cbl_lv01",
          branchKind: "cable",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
        }),
      ],
    });
    const vd = deriveVoltageDrop(lf, tinyAppNetwork(), {
      resultId: "vdr_voc",
      createdAt: "2026-05-02T00:00:01Z",
    });

    expect(vd.branchResults[0]?.branchKind).toBe("cable");
    expect(vd.branchResults[0]?.branchInternalId).toBe("eq_cbl_lv01");
    expect(vd.branchResults[0]?.sourceEquipmentInternalId).toBe("eq_cbl_lv01");
  });

  it("does not mutate the input LoadFlowResult or AppNetwork", () => {
    const network = tinyAppNetwork();
    const lf = makeLoadFlow({
      buses: [bus("eq_bus_a", 100, 6.6), bus("eq_bus_b", 99, 6.534)],
      branches: [
        branch({
          branchInternalId: "eq_cbl",
          branchKind: "cable",
          fromBusInternalId: "eq_bus_a",
          toBusInternalId: "eq_bus_b",
        }),
      ],
    });
    const lfBefore = JSON.stringify(lf);
    const networkBefore = JSON.stringify(network);

    deriveVoltageDrop(lf, network, {
      resultId: "vdr_purity",
      createdAt: "2026-05-02T00:00:01Z",
    });

    expect(JSON.stringify(lf)).toBe(lfBefore);
    expect(JSON.stringify(network)).toBe(networkBefore);
  });
});
