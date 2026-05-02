// Stage 2 PR #4 — Real-sidecar integration test (opt-in).
//
// This test exercises the full TypeScript ↔ Python boundary against a
// real Python interpreter and a real `pandapower` install. It is
// SKIPPED by default because:
//
//   - Stock CI runners may not have Python with the scientific stack.
//   - Developer machines may not have run
//       `pip install -r services/solver-sidecar/requirements.txt`
//     yet.
//
// To run this test:
//
//   cd <repo>
//   python3 -m venv services/solver-sidecar/.venv
//   source services/solver-sidecar/.venv/bin/activate
//   pip install -r services/solver-sidecar/requirements.txt
//   RUN_SIDECAR_INTEGRATION=1 \
//     SOLVER_PYTHON=services/solver-sidecar/.venv/bin/python \
//     pnpm --filter @power-system-study/solver-adapter test:integration
//
// The presence of the env var is the only switch — the test runner
// otherwise treats this file like any other suite, so it stays fully
// type-checked and lint-checked even when not executed.

import { describe, expect, it } from "vitest";
import type { AppNetwork } from "@power-system-study/network-model";

import { runLoadFlowForAppNetwork } from "../src/loadFlow.js";
import {
  StdioSidecarTransport,
  DEFAULT_SIDECAR_SCRIPT_PATH,
} from "../src/stdioSidecarTransport.js";

const SHOULD_RUN = process.env.RUN_SIDECAR_INTEGRATION === "1";
const PYTHON = process.env.SOLVER_PYTHON ?? "python3";

const NETWORK_MODEL_VERSION = "2.0.0-pr2" as const;

function tinyAppNetwork(): AppNetwork {
  // Utility → MV bus → transformer → LV bus → load on LV bus.
  // No cable yet — that exercises the transformer-only path.
  return {
    networkModelVersion: NETWORK_MODEL_VERSION,
    scenarioId: "SCN-INT",
    frequencyHz: 60,
    buses: [
      {
        internalId: "eq_bus_mv",
        tag: "BUS-MV",
        vnKv: 6.6,
        topology: "3P3W",
        minVoltagePct: 95,
        maxVoltagePct: 105,
      },
      {
        internalId: "eq_bus_lv",
        tag: "BUS-LV",
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
    transformers: [
      {
        internalId: "eq_tr",
        tag: "TR",
        fromBusInternalId: "eq_bus_mv",
        toBusInternalId: "eq_bus_lv",
        snMva: 1,
        vnHvKv: 6.6,
        vnLvKv: 0.4,
        vkPercent: 6,
        vkrPercent: 1,
        xrRatio: null,
        vectorGroup: "Dyn11",
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
        busInternalId: "eq_bus_lv",
        pMw: 0.05,
        qMvar: 0.024,
        demandFactor: 1,
      },
    ],
    motors: [],
    topologyEdges: [],
  };
}

const describeIntegration = SHOULD_RUN ? describe : describe.skip;

describeIntegration("Load Flow integration — real Python sidecar", () => {
  it("computes a converged Load Flow on a tiny utility-+-transformer network", async () => {
    const transport = new StdioSidecarTransport({
      pythonExecutable: PYTHON,
      sidecarScriptPath: DEFAULT_SIDECAR_SCRIPT_PATH,
      // Cold pandapower import on stock CPython without numba can run
      // ~30-150s. Generous timeout makes the test deterministic across
      // dev machines.
      timeoutMs: 300_000,
    });

    // Sanity: confirm the sidecar reports pandapower as installed
    // before running the real load flow.
    const health = await transport.health();
    expect(health.status).toBe("ok");
    if (health.solverVersion === "unavailable") {
      throw new Error(
        "pandapower is not installed in the integration environment. Install via " +
          "`pip install -r services/solver-sidecar/requirements.txt` then re-run.",
      );
    }

    const bundle = await runLoadFlowForAppNetwork(tinyAppNetwork(), { transport });

    expect(bundle.loadFlow.status).toBe("valid");
    expect(bundle.loadFlow.converged).toBe(true);
    expect(bundle.loadFlow.busResults.length).toBeGreaterThan(0);
    // MV bus should be near nominal; LV bus should be slightly
    // depressed because of the transformer + load. Ranges chosen
    // wide enough to tolerate pandapower-version differences.
    const mv = bundle.loadFlow.busResults.find((b) => b.busInternalId === "eq_bus_mv");
    const lv = bundle.loadFlow.busResults.find((b) => b.busInternalId === "eq_bus_lv");
    expect(mv?.voltagePuPct).toBeGreaterThan(99.5);
    expect(mv?.voltagePuPct).toBeLessThan(100.5);
    expect(lv?.voltagePuPct).toBeGreaterThan(95);
    expect(lv?.voltagePuPct).toBeLessThan(101);

    expect(bundle.loadFlow.metadata.solverName).toBe("pandapower");
    expect(bundle.loadFlow.metadata.solverVersion).not.toBe("unavailable");
    expect(bundle.snapshot.snapshotId).toBe(bundle.loadFlow.runtimeSnapshotId);

    // Stage 2 PR #5: Voltage Drop derives from the same Load Flow
    // result. The bundle should carry a real VoltageDropResult (not
    // null), one row per branch, with the spec §7.2 default limits.
    expect(bundle.voltageDrop).not.toBeNull();
    expect(bundle.voltageDrop?.branchResults.length).toBe(
      bundle.loadFlow.branchResults.length,
    );
    const txDrop = bundle.voltageDrop?.branchResults.find(
      (br) => br.branchInternalId === "eq_tr",
    );
    expect(txDrop).toBeDefined();
    expect(txDrop?.branchKind).toBe("transformer");
    expect(txDrop?.limitPct).toBeCloseTo(5.0, 6);
    // Light load on the LV side → drop magnitude is small but
    // non-negative under the spec's direction rule.
    expect(txDrop?.voltageDropPct).not.toBeNull();
    expect(txDrop?.voltageDropPct ?? -1).toBeGreaterThanOrEqual(0);
    // Two spawn calls (health + runLoadFlow) each pay the cold import
    // cost. The vitest-level timeout matches the worst-case observed
    // runtime on stock CPython without numba.
  }, 600_000);
});
