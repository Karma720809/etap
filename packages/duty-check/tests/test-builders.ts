// Stage 3 ED-PR-03 — shared test fixtures for duty-check tests.
//
// Hand-rolled minimal `PowerSystemProjectFile` and
// `ShortCircuitRunBundle` shapes. We build these by hand rather than
// driving the full Stage 1 / Stage 2 pipelines so the duty-check
// orchestrator tests stay focused on the contract surface — the
// inputs are not exercised by the mappers / build / sidecar layers
// during a run, only their typed fields are read.

import type { AppNetwork } from "@power-system-study/network-model";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import {
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_INPUT_VERSION,
  type RuntimeCalculationSnapshot,
  type ShortCircuitResult,
  type ShortCircuitRunBundle,
  type SolverInput,
} from "@power-system-study/solver-adapter";

export const TEST_NOW = "2026-05-07T00:00:00.000Z";

export function emptyProject(): PowerSystemProjectFile {
  return {
    schemaVersion: "1.0.0",
    appVersion: "0.1.0-test",
    project: {
      projectId: "PJT-DUTY-TEST",
      projectName: "Duty Check Test Project",
      standard: "IEC",
      frequencyHz: 60,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    },
    equipment: {
      utilities: [],
      generators: [],
      buses: [],
      transformers: [],
      cables: [],
      breakers: [],
      switches: [],
      loads: [],
      motors: [],
      placeholders: [],
    },
    diagram: { nodes: [], edges: [] },
    scenarios: [],
    calculationSnapshots: [],
    tagCounters: {},
  };
}

export interface DutyCheckTestProjectOptions {
  /** Add a breaker with `interruptingCapacityKa` populated. */
  withRatedBreaker?: boolean;
  /** Add a breaker missing `interruptingCapacityKa`. */
  withMissingRatingBreaker?: boolean;
  /** Add a breaker that opts out of `peakWithstandKa`. */
  withPeakOptOutBreaker?: boolean;
  /** Add a switch missing `shortTimeWithstandKa`. */
  withMissingRatingSwitch?: boolean;
  /** Add a bus missing every rating. */
  withMissingRatingBus?: boolean;
  /** Add a cable missing `shortCircuitKValue`. */
  withMissingRatingCable?: boolean;
  /** Add a cable carrying `shortCircuitKValue`. */
  withRatedCable?: boolean;
  /** Add an out-of-service breaker (must be skipped by the orchestrator). */
  withOutOfServiceBreaker?: boolean;
}

/**
 * Build a project carrying just enough equipment for the orchestrator
 * tests to exercise per-row status branches. Each piece of equipment
 * is opt-in via `options` so individual tests can shape the input.
 */
export function projectWithDutyEquipment(
  options: DutyCheckTestProjectOptions = {},
): PowerSystemProjectFile {
  const project = emptyProject();
  if (options.withRatedBreaker) {
    project.equipment.breakers.push({
      internalId: "eq_brk_rated",
      tag: "BRK-R",
      kind: "breaker",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      deviceType: "breaker",
      fromBus: "eq_bus_a",
      toBus: "eq_bus_b",
      state: "closed",
      ratedVoltageKv: 0.4,
      ratedCurrentA: 100,
      interruptingCapacityKa: 25,
      peakWithstandKa: 52.5,
      status: "in_service",
    });
  }
  if (options.withMissingRatingBreaker) {
    project.equipment.breakers.push({
      internalId: "eq_brk_miss",
      tag: "BRK-M",
      kind: "breaker",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      deviceType: "breaker",
      fromBus: "eq_bus_a",
      toBus: "eq_bus_b",
      state: "closed",
      ratedVoltageKv: 0.4,
      ratedCurrentA: 100,
      // interruptingCapacityKa and peakWithstandKa intentionally absent.
      status: "in_service",
    });
  }
  if (options.withPeakOptOutBreaker) {
    project.equipment.breakers.push({
      internalId: "eq_brk_optout",
      tag: "BRK-O",
      kind: "breaker",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      deviceType: "breaker",
      fromBus: "eq_bus_a",
      toBus: "eq_bus_b",
      state: "closed",
      ratedVoltageKv: 0.4,
      ratedCurrentA: 100,
      interruptingCapacityKa: 25,
      // peakWithstandKa intentionally absent → opt-out per ED-OQ-03.
      status: "in_service",
    });
  }
  if (options.withMissingRatingSwitch) {
    project.equipment.switches.push({
      internalId: "eq_sw_miss",
      tag: "SW-M",
      kind: "switch",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      fromBus: "eq_bus_a",
      toBus: "eq_bus_b",
      state: "closed",
      ratedVoltageKv: 0.4,
      ratedCurrentA: 100,
      status: "in_service",
    });
  }
  if (options.withMissingRatingBus) {
    project.equipment.buses.push({
      internalId: "eq_bus_miss",
      tag: "BUS-M",
      kind: "bus",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      vnKv: 0.4,
      voltageType: "AC",
      topology: "3P4W",
      minVoltagePct: 95,
      maxVoltagePct: 105,
    });
  }
  if (options.withMissingRatingCable) {
    project.equipment.cables.push({
      internalId: "eq_cbl_miss",
      tag: "CBL-M",
      kind: "cable",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      fromBus: "eq_bus_a",
      toBus: "eq_bus_b",
      voltageGradeKv: 0.6,
      conductorMaterial: "Cu",
      conductorSizeMm2: 240,
      lengthM: 50,
      status: "in_service",
    });
  }
  if (options.withRatedCable) {
    project.equipment.cables.push({
      internalId: "eq_cbl_rated",
      tag: "CBL-R",
      kind: "cable",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      fromBus: "eq_bus_a",
      toBus: "eq_bus_b",
      voltageGradeKv: 0.6,
      conductorMaterial: "Cu",
      conductorSizeMm2: 240,
      lengthM: 50,
      shortCircuitKValue: 143,
      status: "in_service",
    });
  }
  if (options.withOutOfServiceBreaker) {
    project.equipment.breakers.push({
      internalId: "eq_brk_oos",
      tag: "BRK-X",
      kind: "breaker",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      deviceType: "breaker",
      fromBus: "eq_bus_a",
      toBus: "eq_bus_b",
      state: "open",
      ratedVoltageKv: 0.4,
      ratedCurrentA: 100,
      interruptingCapacityKa: 25,
      status: "out_of_service",
    });
  }
  return project;
}

export function emptyAppNetwork(scenarioId: string | null): AppNetwork {
  return {
    networkModelVersion: "2.0.0-pr2",
    scenarioId,
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
}

export function emptySolverInput(scenarioId: string | null): SolverInput {
  return {
    inputVersion: SOLVER_INPUT_VERSION,
    scenarioId,
    frequencyHz: 60,
    buses: [],
    sources: [],
    transformers: [],
    lines: [],
    loads: [],
    generatorsPQ: [],
    options: { ...DEFAULT_SOLVER_OPTIONS },
  };
}

export function fakeSnapshot(
  scenarioId: string | null,
  id = "snap_dc_test",
): RuntimeCalculationSnapshot {
  return {
    snapshotId: id,
    projectId: "PJT-DUTY-TEST",
    scenarioId,
    createdAt: TEST_NOW,
    appNetwork: emptyAppNetwork(scenarioId),
    solverInput: emptySolverInput(scenarioId),
    validation: {
      status: "ready_to_run",
      networkBuildStatus: "valid",
      issues: [],
    },
    solver: {
      name: "pandapower",
      version: "fake-2.14.11",
      options: { ...DEFAULT_SOLVER_OPTIONS },
    },
    adapterVersion: "0.0.0-test",
    appNetworkHash: null,
    solverInputHash: null,
  };
}

export function fakeShortCircuitResult(
  scenarioId: string | null,
  status: "valid" | "warning" | "failed",
  resultId = "scr_dc_test",
): ShortCircuitResult {
  return {
    resultId,
    runtimeSnapshotId: "snap_dc_test",
    scenarioId,
    module: "shortCircuit",
    status,
    faultType: "threePhase",
    calculationCase: "maximum",
    voltageFactor: 1,
    busResults: [],
    issues:
      status === "failed"
        ? [
            {
              code: "E-SC-001",
              severity: "error",
              message: "solver sidecar transport failure: simulated",
            },
          ]
        : [],
    metadata: {
      solverName: "pandapower",
      solverVersion: "fake-2.14.10",
      adapterVersion: "0.0.0-test",
      solverOptions: { ...DEFAULT_SOLVER_OPTIONS },
      executedAt: TEST_NOW,
      inputHash: null,
      networkHash: null,
    },
    createdAt: TEST_NOW,
  };
}

export function fakeShortCircuitBundle(
  scenarioId: string | null,
  status: "valid" | "warning" | "failed" = "valid",
  snapshotId = "snap_dc_test",
): ShortCircuitRunBundle {
  return {
    shortCircuit: fakeShortCircuitResult(scenarioId, status),
    snapshot: fakeSnapshot(scenarioId, snapshotId),
    solverInput: emptySolverInput(scenarioId),
    request: {
      solverInput: emptySolverInput(scenarioId),
      mode: "all_buses",
      faultTargets: [],
      shortCircuitOptions: {
        faultType: "threePhase",
        calculationCase: "maximum",
        computePeak: true,
        computeThermal: true,
      },
    },
  };
}
