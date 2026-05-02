// Stage 2 PR #3 — Pure AppNetwork → SolverInput mapper.
//
// This file is the only public mapping between the app-side
// `AppNetwork` (PR #2) and the solver-side `SolverInput` (this PR).
// It does NOT call pandapower, does NOT produce a SolverResult, does
// NOT create CalculationSnapshots, and does NOT mutate the input.
//
// Mapping rules and rationale live in
// `docs/stage-2/solver_adapter_contract.md` §3.

import type {
  AppNetwork,
  NetworkBus,
  NetworkCableBranch,
  NetworkGeneratorPQ,
  NetworkLoad,
  NetworkMotor,
  NetworkSource,
  NetworkTransformerBranch,
} from "@power-system-study/network-model";
import {
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_INPUT_VERSION,
  type SolverBus,
  type SolverGeneratorPQ,
  type SolverInput,
  type SolverLine,
  type SolverLoad,
  type SolverOptions,
  type SolverSource,
  type SolverTransformer,
} from "./types.js";

export interface BuildSolverInputOptions {
  /**
   * Solver options to record on `SolverInput.options`. Defaults to
   * `DEFAULT_SOLVER_OPTIONS` (Newton-Raphson, tol 1e-8, maxIter 50,
   * enforceQLim disabled per Stage 2 spec §6.2).
   */
  options?: SolverOptions;
}

/**
 * Pure conversion from AppNetwork to SolverInput. The AppNetwork is
 * read-only; the returned SolverInput owns its own arrays.
 *
 * Stage 2 PR #3 rule reminders:
 *   - Closed/in-service breakers and switches are gates, not solver
 *     elements (S2-OQ-02). They are intentionally omitted here.
 *   - Gate-only branch_chain ties (`NetworkGateConnection`) carry zero
 *     impedance (spec §5.6) and are intentionally omitted here.
 *   - Motors are represented as PQ loads with `origin: "motor"` per
 *     spec §6.2.
 *   - `internalId` is preserved verbatim on every solver-side element.
 */
export function buildSolverInputFromAppNetwork(
  appNetwork: AppNetwork,
  options: BuildSolverInputOptions = {},
): SolverInput {
  return {
    inputVersion: SOLVER_INPUT_VERSION,
    scenarioId: appNetwork.scenarioId,
    frequencyHz: appNetwork.frequencyHz,
    buses: appNetwork.buses.map(mapBus),
    sources: appNetwork.sources.map(mapSource),
    transformers: appNetwork.transformers.map(mapTransformer),
    lines: appNetwork.cables.map(mapCable),
    loads: [
      ...appNetwork.loads.map(mapLoad),
      ...appNetwork.motors.map(mapMotor),
    ],
    generatorsPQ: appNetwork.generators.map(mapGeneratorPQ),
    options: options.options ?? { ...DEFAULT_SOLVER_OPTIONS },
  };
}

function mapBus(bus: NetworkBus): SolverBus {
  return {
    internalId: bus.internalId,
    tag: bus.tag,
    vnKv: bus.vnKv,
    // AppNetwork.NetworkBus may carry any Stage 1 topology code, but
    // unsupported topologies (1P*/DC*) raise E-LF-002 in PR #2 and the
    // build short-circuits before this mapper runs. Narrowing here is
    // safe: any AppNetwork that reaches the adapter has only 3P3W/3P4W.
    topology: bus.topology as SolverBus["topology"],
  };
}

function mapSource(source: NetworkSource): SolverSource {
  return {
    internalId: source.internalId,
    tag: source.tag,
    kind: source.kind,
    busInternalId: source.busInternalId,
    vnKv: source.vnKv,
    scLevelMva: source.scLevelMva,
    faultCurrentKa: source.faultCurrentKa,
    xrRatio: source.xrRatio,
    voltageFactor: source.voltageFactor,
    role: source.role,
    pMw: source.pMw,
    qMvar: source.qMvar,
  };
}

function mapTransformer(tx: NetworkTransformerBranch): SolverTransformer {
  return {
    internalId: tx.internalId,
    tag: tx.tag,
    fromBusInternalId: tx.fromBusInternalId,
    toBusInternalId: tx.toBusInternalId,
    snMva: tx.snMva,
    vnHvKv: tx.vnHvKv,
    vnLvKv: tx.vnLvKv,
    vkPercent: tx.vkPercent,
    vkrPercent: tx.vkrPercent,
    xrRatio: tx.xrRatio,
    vectorGroup: tx.vectorGroup,
    tapPosition: tx.tapPosition,
  };
}

function mapCable(cable: NetworkCableBranch): SolverLine {
  return {
    internalId: cable.internalId,
    tag: cable.tag,
    fromBusInternalId: cable.fromBusInternalId,
    toBusInternalId: cable.toBusInternalId,
    lengthM: cable.lengthM,
    rOhmPerKm: cable.rOhmPerKm,
    xOhmPerKm: cable.xOhmPerKm,
  };
}

function mapLoad(load: NetworkLoad): SolverLoad {
  return {
    internalId: load.internalId,
    tag: load.tag,
    busInternalId: load.busInternalId,
    pMw: load.pMw,
    qMvar: load.qMvar,
    origin: "load",
  };
}

function mapMotor(motor: NetworkMotor): SolverLoad {
  return {
    internalId: motor.internalId,
    tag: motor.tag,
    busInternalId: motor.busInternalId,
    pMw: motor.pMw,
    qMvar: motor.qMvar,
    origin: "motor",
  };
}

function mapGeneratorPQ(gen: NetworkGeneratorPQ): SolverGeneratorPQ {
  return {
    internalId: gen.internalId,
    tag: gen.tag,
    busInternalId: gen.busInternalId,
    pMw: gen.pMw,
    qMvar: gen.qMvar,
  };
}
