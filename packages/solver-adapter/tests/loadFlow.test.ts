// Stage 2 PR #4 — runLoadFlowForAppNetwork orchestrator tests.
//
// These tests inject a mock SidecarTransport so the orchestrator can be
// exercised without spawning Python. They cover:
//   - happy path: SolverInput is built from the AppNetwork, the
//     transport is called, and the result is normalized;
//   - runtime snapshot is created and referenced from the result;
//   - input AppNetwork is not mutated;
//   - project-side data is untouched (no `calculationSnapshots` /
//     `calculationResults` populated);
//   - empty-network / no-slack short-circuit DOES NOT spawn the
//     transport;
//   - transport failure (thrown error) is mapped to E-LF-004 with
//     `status="failed"` and converged=false.

import { describe, expect, it } from "vitest";
import type { AppNetwork } from "@power-system-study/network-model";
import { buildAppNetwork } from "@power-system-study/network-model";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";

import { runLoadFlowForAppNetwork } from "../src/loadFlow.js";
import {
  SidecarTransportError,
  type SidecarTransport,
} from "../src/sidecarClient.js";
import {
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_INPUT_VERSION,
  type SolverInput,
  type SolverResult,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-05-02T00:00:00+00:00";
const NETWORK_MODEL_VERSION = "2.0.0-pr2" as const;

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
      generators: [],
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
          snMva: 1,
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
      cables: [],
      breakers: [],
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
          kw: 50,
          kvar: null,
          powerFactor: 0.9,
          demandFactor: 1,
          status: "in_service",
        },
      ],
      motors: [],
      placeholders: [],
    },
    diagram: {
      nodes: [
        { id: "n_util", equipmentInternalId: "eq_util_1", kind: "utility", position: { x: 0, y: 0 } },
        { id: "n_bus_mv", equipmentInternalId: "eq_bus_mv", kind: "bus", position: { x: 0, y: 0 } },
        { id: "n_tr", equipmentInternalId: "eq_tr_1", kind: "transformer", position: { x: 0, y: 0 } },
        { id: "n_bus_lv", equipmentInternalId: "eq_bus_lv", kind: "bus", position: { x: 0, y: 0 } },
        { id: "n_ld", equipmentInternalId: "eq_ld_1", kind: "load", position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: "e_util_mv", fromNodeId: "n_util", toNodeId: "n_bus_mv", kind: "connection" },
        { id: "e_mv_tr", fromNodeId: "n_bus_mv", toNodeId: "n_tr", kind: "connection" },
        { id: "e_tr_lv", fromNodeId: "n_tr", toNodeId: "n_bus_lv", kind: "connection" },
        { id: "e_lv_ld", fromNodeId: "n_bus_lv", toNodeId: "n_ld", kind: "connection" },
      ],
    },
    scenarios: [
      {
        schemaVersion: "1.0.0",
        scenarioId: "SCN-N",
        name: "Normal",
        inheritsFrom: null,
        overrides: [],
      },
    ],
    calculationSnapshots: [],
    tagCounters: {},
  };
}

function appNetworkOrThrow(project: PowerSystemProjectFile): AppNetwork {
  const built = buildAppNetwork(project);
  if (built.appNetwork === null) {
    throw new Error(
      `Expected a valid AppNetwork; issues: ${JSON.stringify(built.issues)}`,
    );
  }
  return built.appNetwork;
}

function fakeSuccessSolverResult(input: SolverInput): SolverResult {
  return {
    status: "succeeded",
    converged: true,
    metadata: {
      solverName: "pandapower",
      solverVersion: "fake-2.14.11",
      adapterVersion: "0.0.0-sidecar",
      options: input.options,
      executedAt: "2026-05-02T00:00:00Z",
      inputHash: null,
      networkHash: null,
    },
    buses: input.buses.map((b) => ({
      internalId: b.internalId,
      voltageKv: b.vnKv,
      voltagePuPct: 100,
      angleDeg: 0,
    })),
    branches: input.transformers.map((tx) => ({
      internalId: tx.internalId,
      branchKind: "transformer" as const,
      fromBusInternalId: tx.fromBusInternalId,
      toBusInternalId: tx.toBusInternalId,
      pMwFrom: 0.05,
      qMvarFrom: 0.02,
      pMwTo: -0.05,
      qMvarTo: -0.019,
      currentA: 4.5,
      loadingPct: 5,
      lossKw: 1.0,
    })),
    issues: [],
  };
}

class StubTransport implements SidecarTransport {
  public lastInput: SolverInput | null = null;
  public callCount = 0;

  constructor(private readonly responder: (input: SolverInput) => Promise<SolverResult> | SolverResult) {}

  async health() {
    return {
      sidecarName: "stub",
      sidecarVersion: "0.0.0",
      contractInputVersion: SOLVER_INPUT_VERSION,
      solverName: "pandapower",
      solverVersion: "stub",
      status: "ok" as const,
    };
  }

  async runLoadFlow(input: SolverInput): Promise<SolverResult> {
    this.callCount += 1;
    this.lastInput = input;
    return await this.responder(input);
  }
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("runLoadFlowForAppNetwork — happy path", () => {
  it("calls the transport with a SolverInput built from the AppNetwork and returns a normalized result", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(fakeSuccessSolverResult);

    const bundle = await runLoadFlowForAppNetwork(appNetwork, {
      transport,
      projectId: "PJT-T",
    });

    expect(transport.callCount).toBe(1);
    expect(transport.lastInput?.scenarioId).toBe("SCN-N");
    expect(transport.lastInput?.frequencyHz).toBe(60);
    expect(transport.lastInput?.transformers).toHaveLength(1);

    expect(bundle.loadFlow.status).toBe("valid");
    expect(bundle.loadFlow.converged).toBe(true);
    expect(bundle.loadFlow.busResults.map((b) => b.busInternalId)).toContain("eq_bus_mv");
    expect(bundle.loadFlow.busResults.map((b) => b.busInternalId)).toContain("eq_bus_lv");
    expect(bundle.loadFlow.branchResults).toHaveLength(1);
    expect(bundle.loadFlow.branchResults[0]?.branchKind).toBe("transformer");
    expect(bundle.loadFlow.metadata.solverName).toBe("pandapower");
    expect(bundle.loadFlow.metadata.solverVersion).toBe("fake-2.14.11");
  });

  it("creates a runtime snapshot referenced by the result", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(fakeSuccessSolverResult);

    const bundle = await runLoadFlowForAppNetwork(appNetwork, {
      transport,
      projectId: "PJT-T",
    });

    expect(bundle.snapshot.snapshotId).toBe(bundle.loadFlow.runtimeSnapshotId);
    expect(bundle.snapshot.scenarioId).toBe("SCN-N");
    expect(bundle.snapshot.projectId).toBe("PJT-T");
    // Stage 2 PR #4 review blocker 2: the snapshot stores the
    // AppNetwork by VALUE, not by reference. The cloned content must
    // equal the original but must not be the same object.
    expect(bundle.snapshot.appNetwork).not.toBe(appNetwork);
    expect(bundle.snapshot.appNetwork).toEqual(appNetwork);
    expect(bundle.snapshot.solver.name).toBe("pandapower");
    expect(bundle.snapshot.solver.version).toBe("fake-2.14.11");
    expect(bundle.snapshot.solver.options.enforceQLim).toBe(false);
  });

  it("does not mutate the AppNetwork or the originating project file", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(fakeSuccessSolverResult);

    const projectBefore = JSON.stringify(project);
    const networkBefore = JSON.stringify(appNetwork);
    const calculationSnapshotsRef = project.calculationSnapshots;

    await runLoadFlowForAppNetwork(appNetwork, { transport });

    expect(JSON.stringify(project)).toBe(projectBefore);
    expect(JSON.stringify(appNetwork)).toBe(networkBefore);
    // The Stage 1 canonical project file's `calculationSnapshots`
    // array reference must be identical: PR #4 must not write into it.
    expect(project.calculationSnapshots).toBe(calculationSnapshotsRef);
    expect(project.calculationSnapshots).toEqual([]);
    // The project file must not have grown a `calculationResults`
    // field either.
    expect(project).not.toHaveProperty("calculationResults");
  });

  it("respects caller-provided solverOptions", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(fakeSuccessSolverResult);

    const customOptions = {
      algorithm: "bfsw" as const,
      tolerance: 1e-6,
      maxIter: 25,
      enforceQLim: false as const,
    };

    const bundle = await runLoadFlowForAppNetwork(appNetwork, {
      transport,
      solverOptions: customOptions,
    });

    expect(transport.lastInput?.options).toEqual(customOptions);
    expect(bundle.snapshot.solver.options).toEqual(customOptions);
  });
});

// ---------------------------------------------------------------------------
// Pre-flight short-circuits
// ---------------------------------------------------------------------------

describe("runLoadFlowForAppNetwork — pre-flight short-circuit", () => {
  it("does NOT call the transport when the AppNetwork has no buses", async () => {
    const emptyNetwork: AppNetwork = {
      networkModelVersion: NETWORK_MODEL_VERSION,
      scenarioId: null,
      frequencyHz: 60,
      buses: [],
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
    const transport = new StubTransport(fakeSuccessSolverResult);

    const bundle = await runLoadFlowForAppNetwork(emptyNetwork, { transport });

    expect(transport.callCount).toBe(0);
    expect(bundle.loadFlow.status).toBe("failed");
    expect(bundle.loadFlow.issues[0]?.code).toBe("E-LF-005");
  });

  it("does NOT call the transport when the AppNetwork has multiple slack sources", async () => {
    // Spec §6.2 / S2-FU-03 defer multi-utility / multi-slack handling.
    // Pre-flight short-circuits to E-LF-005 without spawning Python.
    const multiSlack: AppNetwork = {
      networkModelVersion: NETWORK_MODEL_VERSION,
      scenarioId: null,
      frequencyHz: 60,
      buses: [
        { internalId: "eq_bus_a", tag: "BUS-A", vnKv: 6.6, topology: "3P3W", minVoltagePct: null, maxVoltagePct: null },
        { internalId: "eq_bus_b", tag: "BUS-B", vnKv: 6.6, topology: "3P3W", minVoltagePct: null, maxVoltagePct: null },
      ],
      sources: [
        { internalId: "eq_util_1", tag: "U1", kind: "utility", busInternalId: "eq_bus_a", vnKv: 6.6, scLevelMva: 250, faultCurrentKa: null, xrRatio: 10, voltageFactor: 1, role: "slack", pMw: null, qMvar: null },
        { internalId: "eq_util_2", tag: "U2", kind: "utility", busInternalId: "eq_bus_b", vnKv: 6.6, scLevelMva: 250, faultCurrentKa: null, xrRatio: 10, voltageFactor: 1, role: "slack", pMw: null, qMvar: null },
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
    const transport = new StubTransport(fakeSuccessSolverResult);

    const bundle = await runLoadFlowForAppNetwork(multiSlack, { transport });

    expect(transport.callCount).toBe(0);
    expect(bundle.loadFlow.status).toBe("failed");
    expect(bundle.loadFlow.issues[0]?.code).toBe("E-LF-005");
    // Snapshot still records the validation summary that authorized
    // (or in this case blocked) the run.
    expect(bundle.snapshot.validation.status).toBe("blocked_by_validation");
    expect(bundle.snapshot.validation.issues[0]?.code).toBe("E-LF-005");
  });

  it("does NOT call the transport when the AppNetwork has no slack source", async () => {
    const noSlack: AppNetwork = {
      networkModelVersion: NETWORK_MODEL_VERSION,
      scenarioId: null,
      frequencyHz: 60,
      buses: [
        {
          internalId: "eq_bus_a",
          tag: "BUS-A",
          vnKv: 6.6,
          topology: "3P3W",
          minVoltagePct: null,
          maxVoltagePct: null,
        },
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
    const transport = new StubTransport(fakeSuccessSolverResult);

    const bundle = await runLoadFlowForAppNetwork(noSlack, { transport });

    expect(transport.callCount).toBe(0);
    expect(bundle.loadFlow.status).toBe("failed");
    expect(bundle.loadFlow.issues[0]?.code).toBe("E-LF-005");
  });
});

// ---------------------------------------------------------------------------
// Transport failure
// ---------------------------------------------------------------------------

describe("runLoadFlowForAppNetwork — transport failure", () => {
  it("converts a metadata-null sidecar response into a structured E-LF-004 (review blocker 1)", async () => {
    // The transport guard rejects metadata-null responses; the
    // orchestrator must catch the rejection and emit a real
    // LoadFlowResult with metadata + an E-LF-004 issue, rather than
    // throwing or crashing in normalization.
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(() => {
      throw new SidecarTransportError(
        "solver sidecar response did not match SolverResult shape",
        { exitCode: 0, stdout: "{}", stderr: "" },
      );
    });

    const bundle = await runLoadFlowForAppNetwork(appNetwork, { transport });

    expect(bundle.loadFlow.status).toBe("failed");
    expect(bundle.loadFlow.issues[0]?.code).toBe("E-LF-004");
    // Metadata is always present, never null — both for downstream
    // consumers and for type safety.
    expect(bundle.loadFlow.metadata).toBeDefined();
    expect(bundle.loadFlow.metadata.solverName).toBe("pandapower");
    expect(bundle.loadFlow.metadata.adapterVersion).toBeTypeOf("string");
    // No fabricated numbers.
    expect(bundle.loadFlow.busResults).toEqual([]);
    expect(bundle.loadFlow.branchResults).toEqual([]);
    expect(bundle.loadFlow.totalGenerationMw).toBe(0);
    expect(bundle.loadFlow.totalLoadMw).toBe(0);
    expect(bundle.loadFlow.totalLossesMw).toBe(0);
  });

  it("maps SidecarTransportError to E-LF-004 without inventing voltages", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(() => {
      throw new SidecarTransportError("simulated crash", {
        exitCode: 1,
        stdout: "",
        stderr: "boom",
      });
    });

    const bundle = await runLoadFlowForAppNetwork(appNetwork, { transport });

    expect(bundle.loadFlow.status).toBe("failed");
    expect(bundle.loadFlow.converged).toBe(false);
    expect(bundle.loadFlow.issues[0]?.code).toBe("E-LF-004");
    expect(bundle.loadFlow.busResults).toEqual([]);
    expect(bundle.loadFlow.branchResults).toEqual([]);
  });

  it("maps a generic Error to E-LF-004 too", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(() => {
      throw new Error("network unreachable");
    });

    const bundle = await runLoadFlowForAppNetwork(appNetwork, { transport });

    expect(bundle.loadFlow.status).toBe("failed");
    expect(bundle.loadFlow.issues[0]?.code).toBe("E-LF-004");
    expect(bundle.loadFlow.issues[0]?.message).toContain("network unreachable");
  });
});

// ---------------------------------------------------------------------------
// Snapshot identity
// ---------------------------------------------------------------------------

describe("runLoadFlowForAppNetwork — bundle shape", () => {
  it("returns loadFlow + voltageDrop: null on the bundle (spec §S2-OQ-05)", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(fakeSuccessSolverResult);

    const bundle = await runLoadFlowForAppNetwork(appNetwork, { transport });

    // Stage 2 cleanup: the bundle uses the spec's module names —
    // `loadFlow` (LoadFlowResult) and `voltageDrop` (null until PR #5).
    expect("loadFlow" in bundle).toBe(true);
    expect(bundle.loadFlow).toBeDefined();
    expect("voltageDrop" in bundle).toBe(true);
    expect(bundle.voltageDrop).toBeNull();
    // The legacy `result` field has been removed; assert it is gone so
    // future regressions do not silently reintroduce it.
    expect("result" in bundle).toBe(false);
  });

  it("includes runtime totals, per-row status, and a non-null metadata object on the result", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(fakeSuccessSolverResult);

    const bundle = await runLoadFlowForAppNetwork(appNetwork, { transport });

    expect(bundle.loadFlow.metadata).toBeDefined();
    expect(bundle.loadFlow.metadata.solverName).toBe("pandapower");
    expect(typeof bundle.loadFlow.totalGenerationMw).toBe("number");
    expect(typeof bundle.loadFlow.totalLoadMw).toBe("number");
    expect(typeof bundle.loadFlow.totalLossesMw).toBe("number");
    for (const bus of bundle.loadFlow.busResults) {
      expect(bus.status).toBeDefined();
    }
    for (const br of bundle.loadFlow.branchResults) {
      expect(br.status).toBeDefined();
    }
  });
});

describe("runLoadFlowForAppNetwork — snapshot identity", () => {
  it("two runs produce different snapshotIds and different resultIds", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(fakeSuccessSolverResult);

    const a = await runLoadFlowForAppNetwork(appNetwork, { transport });
    const b = await runLoadFlowForAppNetwork(appNetwork, { transport });

    expect(a.snapshot.snapshotId).not.toBe(b.snapshot.snapshotId);
    expect(a.loadFlow.resultId).not.toBe(b.loadFlow.resultId);
  });
});
