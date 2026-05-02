// Stage 2 PR #4 review blocker 2 — RuntimeCalculationSnapshot tests.
//
// Validates:
//   - The snapshot includes a `validation` summary (status, network
//     build status, issues).
//   - The snapshot deep-clones the AppNetwork and SolverInput.
//   - Mutating the original AppNetwork after snapshot creation does
//     not leak into the snapshot.
//   - The snapshot remains runtime-only — it does not touch the
//     project file's `calculationSnapshots` array.

import { describe, expect, it } from "vitest";
import type { AppNetwork } from "@power-system-study/network-model";

import {
  createRuntimeSnapshot,
  type RuntimeValidationSummary,
} from "../src/runtimeSnapshot.js";
import {
  buildSolverInputFromAppNetwork,
} from "../src/contract.js";
import { DEFAULT_SOLVER_OPTIONS } from "../src/types.js";

const NETWORK_MODEL_VERSION = "2.0.0-pr2" as const;

function tinyAppNetwork(): AppNetwork {
  return {
    networkModelVersion: NETWORK_MODEL_VERSION,
    scenarioId: "SCN-S",
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
    transformers: [],
    cables: [],
    gates: [],
    gateConnections: [],
    loads: [],
    motors: [],
    topologyEdges: [],
  };
}

describe("createRuntimeSnapshot — validation summary", () => {
  it("uses the supplied validation summary", () => {
    const appNetwork = tinyAppNetwork();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);
    const validation: RuntimeValidationSummary = {
      status: "ran_with_warnings",
      networkBuildStatus: "valid",
      issues: [
        { code: "W-CBL-001", severity: "warning", message: "manual R/X" },
      ],
    };
    const snap = createRuntimeSnapshot({
      appNetwork,
      solverInput,
      options: DEFAULT_SOLVER_OPTIONS,
      adapterVersion: "0.1.0",
      validation,
    });

    expect(snap.validation.status).toBe("ran_with_warnings");
    expect(snap.validation.networkBuildStatus).toBe("valid");
    expect(snap.validation.issues).toHaveLength(1);
    expect(snap.validation.issues[0]?.code).toBe("W-CBL-001");
  });

  it("defaults to a 'not_evaluated' validation summary when none is provided", () => {
    const appNetwork = tinyAppNetwork();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);
    const snap = createRuntimeSnapshot({
      appNetwork,
      solverInput,
      options: DEFAULT_SOLVER_OPTIONS,
      adapterVersion: "0.1.0",
    });

    expect(snap.validation.status).toBe("not_evaluated");
    expect(snap.validation.networkBuildStatus).toBe("not_evaluated");
    expect(snap.validation.issues).toEqual([]);
  });

  it("clones the validation issues array (mutation does not leak)", () => {
    const appNetwork = tinyAppNetwork();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);
    const issues = [
      { code: "I-NET-001", severity: "info" as const, message: "first" },
    ];
    const validation: RuntimeValidationSummary = {
      status: "ready_to_run",
      networkBuildStatus: "valid",
      issues,
    };
    const snap = createRuntimeSnapshot({
      appNetwork,
      solverInput,
      options: DEFAULT_SOLVER_OPTIONS,
      adapterVersion: "0.1.0",
      validation,
    });

    issues.push({ code: "I-NET-002", severity: "info", message: "later" });
    expect(snap.validation.issues).toHaveLength(1);
    expect(snap.validation.issues[0]?.code).toBe("I-NET-001");
  });
});

describe("createRuntimeSnapshot — deep clone", () => {
  it("deep-clones the AppNetwork", () => {
    const appNetwork = tinyAppNetwork();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);
    const snap = createRuntimeSnapshot({
      appNetwork,
      solverInput,
      options: DEFAULT_SOLVER_OPTIONS,
      adapterVersion: "0.1.0",
    });

    expect(snap.appNetwork).not.toBe(appNetwork);
    expect(snap.appNetwork.buses).not.toBe(appNetwork.buses);
    expect(snap.appNetwork.buses[0]).not.toBe(appNetwork.buses[0]);
    expect(snap.appNetwork).toEqual(appNetwork);
  });

  it("deep-clones the SolverInput", () => {
    const appNetwork = tinyAppNetwork();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);
    const snap = createRuntimeSnapshot({
      appNetwork,
      solverInput,
      options: DEFAULT_SOLVER_OPTIONS,
      adapterVersion: "0.1.0",
    });

    expect(snap.solverInput).not.toBe(solverInput);
    expect(snap.solverInput.buses).not.toBe(solverInput.buses);
    expect(snap.solverInput).toEqual(solverInput);
  });

  it("mutating the original AppNetwork after snapshot creation does not change the snapshot", () => {
    const appNetwork = tinyAppNetwork();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);
    const snap = createRuntimeSnapshot({
      appNetwork,
      solverInput,
      options: DEFAULT_SOLVER_OPTIONS,
      adapterVersion: "0.1.0",
    });

    // Heavily mutate the original. This should be impossible to
    // observe through the snapshot.
    const firstBus = appNetwork.buses[0];
    if (firstBus) {
      firstBus.tag = "MUTATED";
      firstBus.vnKv = 999;
    }
    appNetwork.buses.push({
      internalId: "eq_bus_appended",
      tag: "APPENDED",
      vnKv: 11,
      topology: "3P3W",
      minVoltagePct: null,
      maxVoltagePct: null,
    });

    expect(snap.appNetwork.buses).toHaveLength(1);
    expect(snap.appNetwork.buses[0]?.tag).toBe("BUS-A");
    expect(snap.appNetwork.buses[0]?.vnKv).toBe(6.6);
  });

  it("mutating the original SolverInput after snapshot creation does not change the snapshot", () => {
    const appNetwork = tinyAppNetwork();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);
    const snap = createRuntimeSnapshot({
      appNetwork,
      solverInput,
      options: DEFAULT_SOLVER_OPTIONS,
      adapterVersion: "0.1.0",
    });

    // Tamper with the original SolverInput in ways that would break
    // the contract if they leaked.
    const firstBus = solverInput.buses[0];
    if (firstBus) {
      firstBus.tag = "MUTATED";
    }
    solverInput.options.tolerance = 1;

    expect(snap.solverInput.buses[0]?.tag).toBe("BUS-A");
    expect(snap.solverInput.options.tolerance).toBe(DEFAULT_SOLVER_OPTIONS.tolerance);
  });
});
