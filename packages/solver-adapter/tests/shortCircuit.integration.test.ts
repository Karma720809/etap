// Stage 3 PR #3 — Real-sidecar Short Circuit integration test (opt-in).
//
// This test exercises the full TypeScript ↔ Python boundary for the
// `run_short_circuit` command against a real Python interpreter and a
// real `pandapower` install (via `pandapower.shortcircuit.calc_sc`). It
// is SKIPPED by default for the same reasons as the Load Flow
// integration test — stock CI runners may not have the scientific
// stack, and developer machines may not have run
// `pip install -r services/solver-sidecar/requirements.txt` yet.
//
// To run this test:
//
//   cd <repo>
//   python3 -m venv services/solver-sidecar/.venv
//   source services/solver-sidecar/.venv/bin/activate
//   pip install -r services/solver-sidecar/requirements.txt
//   RUN_SIDECAR_INTEGRATION=1 \
//     SOLVER_PYTHON=services/solver-sidecar/.venv/bin/python \
//     pnpm --filter @power-system-study/solver-adapter test \
//       tests/shortCircuit.integration.test.ts
//
// The test does NOT claim Golden Case verification (S3-FU-09 — the
// verified GC-SC-01 reference is deferred). It only confirms that:
//   - the sidecar returns a `succeeded` response with the pinned
//     `shortCircuit.calculationCase = "maximum"` /
//     `faultType = "threePhase"` block;
//   - per-bus rows carry **non-fake** numeric values for `ikssKa` and
//     `skssMva` (positive, finite, in plausible engineering ranges);
//   - the wire payload satisfies the strict structural guard.

import { describe, expect, it } from "vitest";

import { isShortCircuitSidecarResponse } from "../src/shortCircuit.js";
import {
  DEFAULT_SHORT_CIRCUIT_OPTIONS,
  type ShortCircuitRequest,
} from "../src/shortCircuit.js";
import {
  StdioSidecarTransport,
  DEFAULT_SIDECAR_SCRIPT_PATH,
} from "../src/stdioSidecarTransport.js";
import {
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_INPUT_VERSION,
  type SolverInput,
} from "../src/types.js";

const SHOULD_RUN = process.env.RUN_SIDECAR_INTEGRATION === "1";
const PYTHON = process.env.SOLVER_PYTHON ?? "python3";

function tinySolverInput(): SolverInput {
  // Utility on the MV bus → transformer → LV bus. Mirrors the Load
  // Flow integration fixture so a single `pip install` covers both
  // smoke runs.
  return {
    inputVersion: SOLVER_INPUT_VERSION,
    scenarioId: "SCN-INT-SC",
    frequencyHz: 60,
    buses: [
      { internalId: "eq_bus_mv", tag: "BUS-MV", vnKv: 6.6, topology: "3P3W" },
      { internalId: "eq_bus_lv", tag: "BUS-LV", vnKv: 0.4, topology: "3P4W" },
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
    lines: [],
    loads: [],
    generatorsPQ: [],
    options: { ...DEFAULT_SOLVER_OPTIONS },
  };
}

function shortCircuitRequest(mode: "all_buses" | "specific"): ShortCircuitRequest {
  return {
    solverInput: tinySolverInput(),
    mode,
    faultTargets: mode === "specific" ? [{ busInternalId: "eq_bus_mv" }] : [],
    shortCircuitOptions: { ...DEFAULT_SHORT_CIRCUIT_OPTIONS },
  };
}

const describeIntegration = SHOULD_RUN ? describe : describe.skip;

describeIntegration("Short Circuit integration — real Python sidecar", () => {
  it("computes a `succeeded` IEC 60909 maximum 3-phase fault on the MV bus", async () => {
    const transport = new StdioSidecarTransport({
      pythonExecutable: PYTHON,
      sidecarScriptPath: DEFAULT_SIDECAR_SCRIPT_PATH,
      // pandapower's `calc_sc` cold-import cost is comparable to
      // `runpp`. Generous timeout matches the Load Flow integration
      // test for parity across dev machines.
      timeoutMs: 300_000,
    });

    const health = await transport.health();
    expect(health.status).toBe("ok");
    if (health.solverVersion === "unavailable") {
      throw new Error(
        "pandapower is not installed in the integration environment. Install via " +
          "`pip install -r services/solver-sidecar/requirements.txt` then re-run.",
      );
    }

    const response = await transport.runShortCircuit(shortCircuitRequest("specific"));

    expect(isShortCircuitSidecarResponse(response)).toBe(true);
    expect(response.status).toBe("succeeded");
    expect(response.metadata.solverName).toBe("pandapower");
    expect(response.metadata.solverVersion).not.toBe("unavailable");

    expect(response.shortCircuit.calculationCase).toBe("maximum");
    expect(response.shortCircuit.faultType).toBe("threePhase");
    expect(response.shortCircuit.computePeak).toBe(true);
    expect(response.shortCircuit.computeThermal).toBe(true);

    // Exactly one row was requested in `specific` mode.
    expect(response.buses).toHaveLength(1);
    const mv = response.buses[0];
    expect(mv?.internalId).toBe("eq_bus_mv");
    expect(mv?.status).toBe("valid");

    // Non-fake values: `Ik''` and `Sk''` are positive and finite. The
    // exact values depend on pandapower's IEC 60909 implementation;
    // we use loose ranges so future pandapower bumps do not flake the
    // test, but values must clearly fall on the engineering side
    // (250 MVA utility → ~21.9 kA at 6.6 kV under the ideal IEC 60909
    // c=1.1 default; we keep the lower bound safely below that).
    expect(mv?.ikssKa).not.toBeNull();
    expect(mv?.ikssKa ?? 0).toBeGreaterThan(15);
    expect(mv?.ikssKa ?? 0).toBeLessThan(40);
    expect(mv?.skssMva).not.toBeNull();
    expect(mv?.skssMva ?? 0).toBeGreaterThan(150);
    // ip and ith are populated when computePeak / computeThermal are true.
    expect(mv?.ipKa).not.toBeNull();
    expect(mv?.ipKa ?? 0).toBeGreaterThan(mv?.ikssKa ?? 0);
    expect(mv?.ithKa).not.toBeNull();

    // No fake numbers leaked into a `failed` slot.
    expect(response.issues).toEqual([]);
  }, 600_000);

  it("returns a row per in-scope bus when `mode = 'all_buses'`", async () => {
    const transport = new StdioSidecarTransport({
      pythonExecutable: PYTHON,
      sidecarScriptPath: DEFAULT_SIDECAR_SCRIPT_PATH,
      timeoutMs: 300_000,
    });

    const response = await transport.runShortCircuit(shortCircuitRequest("all_buses"));

    expect(response.status).toBe("succeeded");
    expect(response.buses.map((b) => b.internalId).sort()).toEqual([
      "eq_bus_lv",
      "eq_bus_mv",
    ]);
    for (const row of response.buses) {
      expect(row.status === "valid" || row.status === "warning").toBe(true);
      expect(row.ikssKa).not.toBeNull();
    }
  }, 600_000);
});
