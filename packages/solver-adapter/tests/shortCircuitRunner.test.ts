// Stage 3 PR #4 — runShortCircuitForAppNetwork orchestrator tests.
//
// These tests inject a stub SidecarTransport so the orchestrator can be
// exercised without spawning Python. They cover:
//   - happy path: SolverInput + ShortCircuitRequest are built, transport
//     is called, response is normalized, bundle is returned;
//   - runtime snapshot is created and referenced from the result;
//   - input AppNetwork is not mutated, project-side data is untouched;
//   - pre-flight short-circuits (no slack / multi-slack) DO NOT spawn
//     the transport and surface an `E-SC-006` issue;
//   - transport failure (thrown error) maps to `E-SC-001` with
//     `status="failed"`, busResults=[], and no fabricated numerics;
//   - mode='specific' with empty targets short-circuits to `E-SC-005`.

import { describe, expect, it } from "vitest";
import type { AppNetwork } from "@power-system-study/network-model";
import { buildAppNetwork } from "@power-system-study/network-model";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";

import {
  runShortCircuitForAppNetwork,
  SidecarTransportError,
  SOLVER_INPUT_VERSION,
  type ShortCircuitRequest,
  type ShortCircuitSidecarResponse,
  type SidecarTransport,
} from "../src/index.js";

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
      loads: [],
      motors: [],
      placeholders: [],
    },
    diagram: {
      nodes: [
        { id: "n_util", equipmentInternalId: "eq_util_1", kind: "utility", position: { x: 0, y: 0 } },
        { id: "n_bus_mv", equipmentInternalId: "eq_bus_mv", kind: "bus", position: { x: 0, y: 0 } },
        { id: "n_tr", equipmentInternalId: "eq_tr_1", kind: "transformer", position: { x: 0, y: 0 } },
        { id: "n_bus_lv", equipmentInternalId: "eq_bus_lv", kind: "bus", position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: "e_util_mv", fromNodeId: "n_util", toNodeId: "n_bus_mv", kind: "connection" },
        { id: "e_mv_tr", fromNodeId: "n_bus_mv", toNodeId: "n_tr", kind: "connection" },
        { id: "e_tr_lv", fromNodeId: "n_tr", toNodeId: "n_bus_lv", kind: "connection" },
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

function fakeSuccessResponse(request: ShortCircuitRequest): ShortCircuitSidecarResponse {
  return {
    status: "succeeded",
    metadata: {
      solverName: "pandapower",
      solverVersion: "fake-2.14.10",
      adapterVersion: "0.0.0-sidecar",
      options: request.solverInput.options,
      executedAt: "2026-05-02T00:00:00Z",
      inputHash: null,
      networkHash: null,
    },
    shortCircuit: {
      calculationCase: "maximum",
      faultType: "threePhase",
      computePeak: request.shortCircuitOptions.computePeak,
      computeThermal: request.shortCircuitOptions.computeThermal,
      voltageFactor: 1,
    },
    buses: request.solverInput.buses.map((b) => ({
      internalId: b.internalId,
      voltageLevelKv: b.vnKv,
      ikssKa: 12.34,
      ipKa: 31.5,
      ithKa: 13,
      skssMva: 141.1,
      status: "valid" as const,
    })),
    issues: [],
  };
}

class StubTransport implements SidecarTransport {
  public lastRequest: ShortCircuitRequest | null = null;
  public callCount = 0;

  constructor(
    private readonly responder: (
      request: ShortCircuitRequest,
    ) => Promise<ShortCircuitSidecarResponse> | ShortCircuitSidecarResponse,
  ) {}

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

  async runLoadFlow(): Promise<never> {
    throw new Error("StubTransport.runLoadFlow not implemented for SC tests");
  }

  async runShortCircuit(
    request: ShortCircuitRequest,
  ): Promise<ShortCircuitSidecarResponse> {
    this.callCount += 1;
    this.lastRequest = request;
    return await this.responder(request);
  }
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("runShortCircuitForAppNetwork — happy path", () => {
  it("calls the transport with a ShortCircuitRequest and returns a normalized bundle", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(fakeSuccessResponse);

    const bundle = await runShortCircuitForAppNetwork(appNetwork, {
      transport,
      projectId: "PJT-T",
    });

    expect(transport.callCount).toBe(1);
    expect(transport.lastRequest?.mode).toBe("all_buses");
    expect(transport.lastRequest?.shortCircuitOptions.faultType).toBe("threePhase");
    expect(transport.lastRequest?.shortCircuitOptions.calculationCase).toBe("maximum");
    expect(transport.lastRequest?.solverInput.buses.length).toBe(2);

    expect(bundle.shortCircuit.module).toBe("shortCircuit");
    expect(bundle.shortCircuit.status).toBe("valid");
    expect(bundle.shortCircuit.busResults).toHaveLength(2);
    expect(bundle.shortCircuit.busResults.map((b) => b.busInternalId).sort()).toEqual(
      ["eq_bus_lv", "eq_bus_mv"],
    );
    expect(bundle.shortCircuit.metadata.solverName).toBe("pandapower");
    expect(bundle.shortCircuit.metadata.solverVersion).toBe("fake-2.14.10");
    // The bundle wires the request through for retention/audit.
    expect(bundle.request).toBe(transport.lastRequest);
  });

  it("creates a runtime snapshot referenced by the result", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(fakeSuccessResponse);

    const bundle = await runShortCircuitForAppNetwork(appNetwork, {
      transport,
      projectId: "PJT-T",
    });

    expect(bundle.snapshot.snapshotId).toBe(bundle.shortCircuit.runtimeSnapshotId);
    expect(bundle.snapshot.scenarioId).toBe("SCN-N");
    expect(bundle.snapshot.projectId).toBe("PJT-T");
    // Snapshot must clone the AppNetwork by VALUE — mutating the caller
    // after the run cannot disturb the snapshot's contents.
    expect(bundle.snapshot.appNetwork).not.toBe(appNetwork);
    expect(bundle.snapshot.appNetwork).toEqual(appNetwork);
    expect(bundle.snapshot.solver.version).toBe("fake-2.14.10");
  });

  it("does not mutate the AppNetwork or the originating project file", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(fakeSuccessResponse);

    const projectBefore = JSON.stringify(project);
    const networkBefore = JSON.stringify(appNetwork);
    const calculationSnapshotsRef = project.calculationSnapshots;

    await runShortCircuitForAppNetwork(appNetwork, { transport });

    expect(JSON.stringify(project)).toBe(projectBefore);
    expect(JSON.stringify(appNetwork)).toBe(networkBefore);
    // Stage 1 canonical project file's `calculationSnapshots` array
    // reference must be identical: PR #4 must not write into it.
    expect(project.calculationSnapshots).toBe(calculationSnapshotsRef);
    expect(project.calculationSnapshots).toEqual([]);
    expect(project).not.toHaveProperty("calculationResults");
  });

  it("supports mode='specific' with explicit fault targets", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport((req) => ({
      ...fakeSuccessResponse(req),
      buses: [
        {
          internalId: "eq_bus_mv",
          voltageLevelKv: 6.6,
          ikssKa: 12.34,
          ipKa: 31.5,
          ithKa: 13,
          skssMva: 141.1,
          status: "valid" as const,
        },
      ],
    }));

    const bundle = await runShortCircuitForAppNetwork(appNetwork, {
      transport,
      mode: "specific",
      faultTargets: [{ busInternalId: "eq_bus_mv" }],
    });

    expect(transport.lastRequest?.mode).toBe("specific");
    expect(transport.lastRequest?.faultTargets).toEqual([{ busInternalId: "eq_bus_mv" }]);
    // eq_bus_lv must come back as orchestrator-synthesized "unavailable".
    const lv = bundle.shortCircuit.busResults.find((b) => b.busInternalId === "eq_bus_lv");
    expect(lv?.status).toBe("unavailable");
    expect(lv?.ikssKa).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pre-flight short-circuits
// ---------------------------------------------------------------------------

describe("runShortCircuitForAppNetwork — pre-flight short-circuit", () => {
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
    const transport = new StubTransport(fakeSuccessResponse);

    const bundle = await runShortCircuitForAppNetwork(noSlack, { transport });

    expect(transport.callCount).toBe(0);
    expect(bundle.shortCircuit.status).toBe("failed");
    expect(bundle.shortCircuit.issues[0]?.code).toBe("E-SC-006");
    expect(bundle.shortCircuit.busResults).toEqual([]);
    expect(bundle.snapshot.validation.status).toBe("blocked_by_validation");
    expect(bundle.snapshot.validation.issues[0]?.code).toBe("E-SC-006");
  });

  it("does NOT call the transport when the AppNetwork has multiple slack sources", async () => {
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
    const transport = new StubTransport(fakeSuccessResponse);

    const bundle = await runShortCircuitForAppNetwork(multiSlack, { transport });

    expect(transport.callCount).toBe(0);
    expect(bundle.shortCircuit.status).toBe("failed");
    expect(bundle.shortCircuit.issues[0]?.code).toBe("E-SC-006");
  });

  it("does NOT call the transport when mode='specific' but faultTargets is empty", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(fakeSuccessResponse);

    const bundle = await runShortCircuitForAppNetwork(appNetwork, {
      transport,
      mode: "specific",
      faultTargets: [],
    });

    expect(transport.callCount).toBe(0);
    expect(bundle.shortCircuit.status).toBe("failed");
    expect(bundle.shortCircuit.issues[0]?.code).toBe("E-SC-005");
    // No fabricated numbers.
    expect(bundle.shortCircuit.busResults).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Transport failure
// ---------------------------------------------------------------------------

describe("runShortCircuitForAppNetwork — transport failure", () => {
  it("maps SidecarTransportError to E-SC-001 without inventing fault currents", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(() => {
      throw new SidecarTransportError("simulated crash", {
        exitCode: 1,
        stdout: "",
        stderr: "boom",
      });
    });

    const bundle = await runShortCircuitForAppNetwork(appNetwork, { transport });

    expect(bundle.shortCircuit.status).toBe("failed");
    expect(bundle.shortCircuit.issues[0]?.code).toBe("E-SC-001");
    expect(bundle.shortCircuit.issues[0]?.severity).toBe("error");
    // No fabricated numerics.
    expect(bundle.shortCircuit.busResults).toEqual([]);
    // Metadata is always present.
    expect(bundle.shortCircuit.metadata.solverName).toBe("pandapower");
    expect(bundle.shortCircuit.metadata.adapterVersion).toBeTypeOf("string");
  });

  it("maps a generic Error from the transport to E-SC-001 as well", async () => {
    const project = minimalProject();
    const appNetwork = appNetworkOrThrow(project);
    const transport = new StubTransport(() => {
      throw new Error("network unreachable");
    });

    const bundle = await runShortCircuitForAppNetwork(appNetwork, { transport });

    expect(bundle.shortCircuit.status).toBe("failed");
    expect(bundle.shortCircuit.issues[0]?.code).toBe("E-SC-001");
    expect(bundle.shortCircuit.busResults).toEqual([]);
  });
});
