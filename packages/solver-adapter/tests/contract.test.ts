// Stage 2 PR #3 — Solver adapter contract tests.
//
// These tests exercise the AppNetwork → SolverInput mapper without
// invoking pandapower or any sidecar. They cover the contract behaviors
// promised by `docs/stage-2/solver_adapter_contract.md` §6.

import { describe, expect, it } from "vitest";
import { buildAppNetwork, type AppNetwork } from "@power-system-study/network-model";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import {
  buildSolverInputFromAppNetwork,
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_INPUT_VERSION,
  type SolverInput,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-05-02T00:00:00+00:00";

function minimalProject(): PowerSystemProjectFile {
  return {
    schemaVersion: "1.0.0",
    appVersion: "0.0.0-test",
    project: {
      projectId: "PJT-T",
      projectName: "T",
      standard: "IEC",
      frequencyHz: 60,
      createdAt: NOW,
      updatedAt: NOW,
    },
    equipment: {
      utilities: [
        {
          internalId: "eq_util_1",
          tag: "UTL-1",
          kind: "utility",
          tagSystem: "auto",
          createdAt: NOW,
          updatedAt: NOW,
          connectedBus: "eq_bus_mv",
          vnKv: 6.6,
          scLevelMva: 250,
          faultCurrentKa: null,
          xrRatio: 10,
          voltageFactor: 1,
          status: "in_service",
        },
      ],
      generators: [
        {
          internalId: "eq_gen_1",
          tag: "GEN-1",
          kind: "generator",
          tagSystem: "auto",
          createdAt: NOW,
          updatedAt: NOW,
          connectedBus: "eq_bus_lv",
          ratedMva: 1,
          ratedVoltageKv: 0.4,
          operatingMode: "grid_parallel_pq",
          pMw: 0.3,
          qMvar: 0.05,
          powerFactor: 0.9,
          voltageSetpointPu: null,
          xdSubtransientPu: null,
          status: "in_service",
        },
      ],
      buses: [
        {
          internalId: "eq_bus_mv",
          tag: "BUS-MV",
          kind: "bus",
          tagSystem: "auto",
          createdAt: NOW,
          updatedAt: NOW,
          vnKv: 6.6,
          voltageType: "AC",
          topology: "3P3W",
          minVoltagePct: 95,
          maxVoltagePct: 105,
          grounding: "TN-S",
        },
        {
          internalId: "eq_bus_lv",
          tag: "BUS-LV",
          kind: "bus",
          tagSystem: "auto",
          createdAt: NOW,
          updatedAt: NOW,
          vnKv: 0.4,
          voltageType: "AC",
          topology: "3P4W",
          minVoltagePct: 95,
          maxVoltagePct: 105,
          grounding: "TN-S",
        },
        {
          internalId: "eq_bus_mtr",
          tag: "BUS-MTR",
          kind: "bus",
          tagSystem: "auto",
          createdAt: NOW,
          updatedAt: NOW,
          vnKv: 0.4,
          voltageType: "AC",
          topology: "3P4W",
          minVoltagePct: 95,
          maxVoltagePct: 105,
          grounding: "TN-S",
        },
      ],
      transformers: [
        {
          internalId: "eq_tr_1",
          tag: "TR-1",
          kind: "transformer",
          tagSystem: "auto",
          createdAt: NOW,
          updatedAt: NOW,
          fromBus: "eq_bus_mv",
          toBus: "eq_bus_lv",
          snMva: 2,
          vnHvKv: 6.6,
          vnLvKv: 0.4,
          vkPercent: 6,
          vkrPercent: 1,
          xrRatio: null,
          vectorGroup: "Dyn11",
          tapPosition: 1,
          neutralTap: 0,
          tapStepPercent: 2.5,
          coolingType: "ONAN",
          loadingLimitPct: 100,
          status: "in_service",
        },
      ],
      cables: [
        {
          internalId: "eq_cbl_1",
          tag: "CBL-1",
          kind: "cable",
          tagSystem: "auto",
          createdAt: NOW,
          updatedAt: NOW,
          fromBus: "eq_bus_lv",
          toBus: "eq_bus_mtr",
          voltageGradeKv: 0.6,
          coreConfiguration: "3C+E",
          conductorMaterial: "Cu",
          insulationType: "XLPE",
          armourType: "SWA",
          conductorSizeMm2: 240,
          armourCsaMm2: 50,
          lengthM: 80,
          rOhmPerKm: 0.0754,
          xOhmPerKm: 0.08,
          ampacityA: 430,
          installationMethod: "tray",
          ambientTempC: 40,
          soilResistivityK_m_W: null,
          groupingCondition: "single circuit",
          loadedConductors: 3,
          status: "in_service",
        },
      ],
      breakers: [
        {
          internalId: "eq_brk_1",
          tag: "BRK-1",
          kind: "breaker",
          tagSystem: "auto",
          createdAt: NOW,
          updatedAt: NOW,
          deviceType: "breaker",
          fromBus: "eq_bus_lv",
          toBus: "eq_bus_mtr",
          state: "closed",
          ratedVoltageKv: 0.4,
          ratedCurrentA: 400,
          breakingCapacityKa: 50,
          makingCapacityKa: 105,
          tripUnitType: "MCCB",
          clearingTimeS: 0.1,
          upstreamEquipment: null,
          downstreamEquipment: null,
          status: "in_service",
        },
      ],
      switches: [],
      loads: [
        {
          internalId: "eq_ld_1",
          tag: "LD-1",
          kind: "load",
          tagSystem: "auto",
          createdAt: NOW,
          updatedAt: NOW,
          connectedBus: "eq_bus_lv",
          loadType: "static_load",
          kw: 100,
          kvar: null,
          powerFactor: 0.9,
          demandFactor: 1,
          status: "in_service",
        },
      ],
      motors: [
        {
          internalId: "eq_motor_1",
          tag: "M-1",
          kind: "motor",
          tagSystem: "auto",
          createdAt: NOW,
          updatedAt: NOW,
          connectedBus: "eq_bus_mtr",
          ratedKw: 250,
          ratedHp: null,
          ratedVoltageV: 400,
          efficiency: 0.95,
          powerFactor: 0.88,
          flaA: null,
          flaSource: "calculated",
          startingCurrentRatio: 6,
          startingPowerFactor: 0.3,
          startingMethod: "DOL",
          serviceFactor: 1,
          status: "in_service",
        },
      ],
      placeholders: [],
    },
    diagram: {
      nodes: [
        { id: "n_util", equipmentInternalId: "eq_util_1", kind: "utility", position: { x: 0, y: 0 } },
        { id: "n_gen", equipmentInternalId: "eq_gen_1", kind: "generator", position: { x: 0, y: 0 } },
        { id: "n_bus_mv", equipmentInternalId: "eq_bus_mv", kind: "bus", position: { x: 0, y: 0 } },
        { id: "n_tr", equipmentInternalId: "eq_tr_1", kind: "transformer", position: { x: 0, y: 0 } },
        { id: "n_bus_lv", equipmentInternalId: "eq_bus_lv", kind: "bus", position: { x: 0, y: 0 } },
        { id: "n_bus_mtr", equipmentInternalId: "eq_bus_mtr", kind: "bus", position: { x: 0, y: 0 } },
        { id: "n_load", equipmentInternalId: "eq_ld_1", kind: "load", position: { x: 0, y: 0 } },
        { id: "n_motor", equipmentInternalId: "eq_motor_1", kind: "motor", position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: "e_util_mv", fromNodeId: "n_util", toNodeId: "n_bus_mv", kind: "connection" },
        { id: "e_gen_lv", fromNodeId: "n_gen", toNodeId: "n_bus_lv", kind: "connection" },
        { id: "e_mv_tr", fromNodeId: "n_bus_mv", toNodeId: "n_tr", kind: "connection" },
        { id: "e_tr_lv", fromNodeId: "n_tr", toNodeId: "n_bus_lv", kind: "connection" },
        { id: "e_lv_load", fromNodeId: "n_bus_lv", toNodeId: "n_load", kind: "connection" },
        {
          id: "e_lv_to_mtr_chain",
          fromNodeId: "n_bus_lv",
          toNodeId: "n_bus_mtr",
          kind: "branch_chain",
          branchEquipmentInternalIds: ["eq_brk_1", "eq_cbl_1"],
        },
        { id: "e_mtr_motor", fromNodeId: "n_bus_mtr", toNodeId: "n_motor", kind: "connection" },
      ],
    },
    scenarios: [
      {
        schemaVersion: "1.0.0",
        scenarioId: "SCN-NORMAL",
        name: "Normal",
        inheritsFrom: null,
        overrides: [],
      },
    ],
    calculationSnapshots: [],
    tagCounters: {},
  };
}

function buildAppNetworkOrThrow(): AppNetwork {
  const result = buildAppNetwork(minimalProject());
  if (result.appNetwork === null) {
    throw new Error(
      `expected a valid AppNetwork; issues: ${JSON.stringify(result.issues)}`,
    );
  }
  return result.appNetwork;
}

// ---------------------------------------------------------------------------
// SolverInput shape
// ---------------------------------------------------------------------------

describe("SolverInput contract shape", () => {
  it("populates the wire version, scenarioId, frequency, and default options", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);

    expect(solverInput.inputVersion).toBe(SOLVER_INPUT_VERSION);
    expect(solverInput.scenarioId).toBe("SCN-NORMAL");
    expect(solverInput.frequencyHz).toBe(60);
    expect(solverInput.options).toEqual(DEFAULT_SOLVER_OPTIONS);
    expect(solverInput.options.enforceQLim).toBe(false);
  });

  it("respects a caller-provided SolverOptions override", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork, {
      options: { algorithm: "bfsw", tolerance: 1e-6, maxIter: 25, enforceQLim: false },
    });

    expect(solverInput.options).toEqual({
      algorithm: "bfsw",
      tolerance: 1e-6,
      maxIter: 25,
      enforceQLim: false,
    });
  });

  it("defaults options ARE NOT shared across calls (clones the default)", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const a = buildSolverInputFromAppNetwork(appNetwork);
    const b = buildSolverInputFromAppNetwork(appNetwork);
    expect(a.options).not.toBe(b.options);
    expect(a.options).toEqual(b.options);
  });
});

// ---------------------------------------------------------------------------
// AppNetwork → SolverInput mapping
// ---------------------------------------------------------------------------

describe("AppNetwork → SolverInput mapping", () => {
  it("maps every NetworkBus to a SolverBus and preserves internalId verbatim", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);

    expect(solverInput.buses.map((b) => b.internalId).sort()).toEqual(
      appNetwork.buses.map((b) => b.internalId).sort(),
    );

    for (const bus of solverInput.buses) {
      const original = appNetwork.buses.find((b) => b.internalId === bus.internalId);
      expect(original).toBeDefined();
      expect(bus.tag).toBe(original?.tag);
      expect(bus.vnKv).toBe(original?.vnKv);
      expect(bus.topology).toBe(original?.topology);
    }
  });

  it("maps the utility source as the single slack with internalId preserved", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);

    const slacks = solverInput.sources.filter((s) => s.role === "slack");
    expect(slacks).toHaveLength(1);

    const utility = slacks[0]!;
    expect(utility.internalId).toBe("eq_util_1");
    expect(utility.kind).toBe("utility");
    expect(utility.busInternalId).toBe("eq_bus_mv");
    expect(utility.scLevelMva).toBe(250);
    expect(utility.faultCurrentKa).toBeNull();
    expect(utility.xrRatio).toBe(10);
    expect(utility.voltageFactor).toBe(1);
    expect(utility.pMw).toBeNull();
    expect(utility.qMvar).toBeNull();
  });

  it("represents grid_parallel_pq generators as a PQ SolverSource AND a SolverGeneratorPQ entry", () => {
    // PR #2's buildAppNetwork emits PQ generators both into AppNetwork.sources
    // (with kind="generator_pq", role="pq") and into AppNetwork.generators.
    // The mapper must preserve both representations verbatim — Stage 2 PR #4
    // will decide whether the sidecar prefers the source-form or generator-form
    // for pandapower.
    const appNetwork = buildAppNetworkOrThrow();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);

    const pqSources = solverInput.sources.filter((s) => s.kind === "generator_pq");
    expect(pqSources).toHaveLength(1);
    expect(pqSources[0]?.internalId).toBe("eq_gen_1");
    expect(pqSources[0]?.role).toBe("pq");
    expect(pqSources[0]?.pMw).toBe(0.3);
    expect(pqSources[0]?.qMvar).toBe(0.05);

    expect(solverInput.generatorsPQ).toHaveLength(1);
    expect(solverInput.generatorsPQ[0]?.internalId).toBe("eq_gen_1");
  });

  it("maps the transformer with HV/LV bus assignment, tap, and vector group preserved", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);

    expect(solverInput.transformers).toHaveLength(1);
    const tx = solverInput.transformers[0]!;
    expect(tx.internalId).toBe("eq_tr_1");
    expect(tx.tag).toBe("TR-1");
    expect(tx.fromBusInternalId).toBe("eq_bus_mv");
    expect(tx.toBusInternalId).toBe("eq_bus_lv");
    expect(tx.snMva).toBe(2);
    expect(tx.vnHvKv).toBe(6.6);
    expect(tx.vnLvKv).toBe(0.4);
    expect(tx.vkPercent).toBe(6);
    expect(tx.vkrPercent).toBe(1);
    expect(tx.vectorGroup).toBe("Dyn11");
    expect(tx.tapPosition).toBe(1);
  });

  it("maps cables to SolverLine with R/X/length carried; branch_chain trace fields not exposed", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);

    expect(solverInput.lines).toHaveLength(1);
    const line = solverInput.lines[0]!;
    expect(line.internalId).toBe("eq_cbl_1");
    expect(line.tag).toBe("CBL-1");
    expect(line.fromBusInternalId).toBe("eq_bus_lv");
    expect(line.toBusInternalId).toBe("eq_bus_mtr");
    expect(line.lengthM).toBe(80);
    expect(line.rOhmPerKm).toBe(0.0754);
    expect(line.xOhmPerKm).toBe(0.08);
    // SolverLine MUST NOT expose branchChainEdgeId / branchChainOrderIndex —
    // those are app-side traceability metadata, not solver inputs.
    expect(line).not.toHaveProperty("branchChainEdgeId");
    expect(line).not.toHaveProperty("branchChainOrderIndex");
  });

  it("does not include closed breakers/switches as SolverLine elements (S2-OQ-02)", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);

    // The breaker in the chain is closed/in-service; it must remain a gate
    // in AppNetwork (PR #2) and NOT appear as a solver impedance element.
    expect(appNetwork.gates).toHaveLength(1);
    expect(appNetwork.gates[0]?.kind).toBe("breaker");

    const breakerInternalIds = appNetwork.gates.map((g) => g.internalId);
    for (const id of breakerInternalIds) {
      expect(solverInput.lines.some((l) => l.internalId === id)).toBe(false);
      expect(solverInput.transformers.some((t) => t.internalId === id)).toBe(false);
    }
    expect(solverInput.lines.map((l) => l.internalId)).toEqual(["eq_cbl_1"]);
  });

  it("does not include NetworkGateConnection ties as solver elements (spec §5.6)", () => {
    // Construct an AppNetwork by hand with a non-empty gateConnections array
    // — the buildAppNetwork output for this fixture has gateConnections=[],
    // but the contract mapper must still drop them if they ever appear.
    const appNetwork = buildAppNetworkOrThrow();
    const withGateTie: AppNetwork = {
      ...appNetwork,
      gateConnections: [
        {
          fromBusInternalId: "eq_bus_lv",
          toBusInternalId: "eq_bus_mtr",
          branchChainEdgeId: "e_synthetic_chain",
          gateInternalIds: ["eq_brk_1"],
        },
      ],
    };

    const solverInput = buildSolverInputFromAppNetwork(withGateTie);

    expect(solverInput.lines.some((l) => l.internalId === "e_synthetic_chain")).toBe(false);
    // Lines should be unchanged from the gate-free mapping.
    expect(solverInput.lines.map((l) => l.internalId)).toEqual(["eq_cbl_1"]);
  });

  it("maps loads and motors into SolverLoad with the correct origin", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);

    const load = solverInput.loads.find((l) => l.internalId === "eq_ld_1");
    expect(load).toBeDefined();
    expect(load?.origin).toBe("load");
    expect(load?.busInternalId).toBe("eq_bus_lv");
    expect(load?.pMw).toBeGreaterThan(0);

    const motor = solverInput.loads.find((l) => l.internalId === "eq_motor_1");
    expect(motor).toBeDefined();
    expect(motor?.origin).toBe("motor");
    expect(motor?.busInternalId).toBe("eq_bus_mtr");
  });

});

// ---------------------------------------------------------------------------
// Mutation safety
// ---------------------------------------------------------------------------

describe("buildSolverInputFromAppNetwork — mutation safety", () => {
  it("does not mutate the input AppNetwork", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const before = JSON.stringify(appNetwork);

    const result = buildSolverInputFromAppNetwork(appNetwork);
    // Touch the result to make sure the assertion above runs after the mapper.
    expect(result.buses.length).toBeGreaterThan(0);

    const after = JSON.stringify(appNetwork);
    expect(after).toBe(before);
  });

  it("does not alias AppNetwork arrays in SolverInput (cloned, not shared)", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const solverInput = buildSolverInputFromAppNetwork(appNetwork);

    expect(solverInput.buses).not.toBe(appNetwork.buses);
    expect(solverInput.transformers).not.toBe(appNetwork.transformers);
    expect(solverInput.lines).not.toBe(appNetwork.cables);
    expect(solverInput.sources).not.toBe(appNetwork.sources);
    expect(solverInput.generatorsPQ).not.toBe(appNetwork.generators);

    // Each element is a fresh object, not the same reference.
    for (let i = 0; i < solverInput.buses.length; i++) {
      expect(solverInput.buses[i]).not.toBe(appNetwork.buses[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// Out-of-scope guardrails
// ---------------------------------------------------------------------------

describe("PR #3 guardrails — no calculation outputs", () => {
  it("produces a SolverInput, not a SolverResult or any result fields", () => {
    const appNetwork = buildAppNetworkOrThrow();
    const solverInput: SolverInput = buildSolverInputFromAppNetwork(appNetwork);

    expect(solverInput).not.toHaveProperty("converged");
    expect(solverInput).not.toHaveProperty("buses.voltagePuPct");
    expect(solverInput).not.toHaveProperty("loadFlow");
    expect(solverInput).not.toHaveProperty("voltageDrop");
    expect(solverInput).not.toHaveProperty("calculationResults");
    expect(solverInput).not.toHaveProperty("calculationSnapshots");
  });

  it("does not introduce calculationSnapshots into the project file when run", () => {
    const project = minimalProject();
    const before = project.calculationSnapshots;
    const appNetwork = buildAppNetworkOrThrow();
    buildSolverInputFromAppNetwork(appNetwork);
    expect(project.calculationSnapshots).toBe(before);
    expect(project.calculationSnapshots).toEqual([]);
  });
});
