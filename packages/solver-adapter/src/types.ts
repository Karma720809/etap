// Stage 2 PR #3 — Solver Adapter Contract types.
//
// Authoritative TypeScript shape of the solver adapter boundary
// (`stage_2_load_flow_voltage_drop_spec.md` §8 — A2 input / A3 output).
// The contract is solver-agnostic by design: pandapower element
// names must NOT appear here. The Python sidecar mirrors these
// shapes in `services/solver-sidecar/src/contracts.py`.
//
// Stage 2 PR #3 ships the contract types and the
// `AppNetwork → SolverInput` mapper only. Real solver execution,
// `BusResult` / `BranchResult` per spec §9, runtime
// `CalculationSnapshot` instances, and any disk persistence are
// deferred to PR #4 / PR #5 / PR #6.

/** Adapter package semver — surfaced through `SolverMetadata.adapterVersion`. */
export const SOLVER_ADAPTER_VERSION = "0.1.0" as const;

/**
 * Wire-format version of `SolverInput`. Ticks when the contract shape
 * changes in a backward-incompatible way. Stage 2 starts at "1.0.0".
 */
export const SOLVER_INPUT_VERSION = "1.0.0" as const;

export type SolverBusTopology = "3P3W" | "3P4W";

export type SolverSourceKind = "utility" | "generator_pq";
export type SolverSourceRole = "slack" | "pq";

export interface SolverBus {
  /** Stage 1 Bus.internalId — preserved verbatim from AppNetwork. */
  internalId: string;
  tag: string;
  vnKv: number;
  topology: SolverBusTopology;
}

export interface SolverSource {
  /** Stage 1 Utility.internalId or Generator.internalId. */
  internalId: string;
  tag: string;
  kind: SolverSourceKind;
  busInternalId: string;
  vnKv: number | null;
  scLevelMva: number | null;
  faultCurrentKa: number | null;
  xrRatio: number | null;
  voltageFactor: number | null;
  role: SolverSourceRole;
  /** PQ generator only; null on utilities. */
  pMw: number | null;
  qMvar: number | null;
}

export interface SolverTransformer {
  /** Stage 1 Transformer.internalId, preserved across the node→branch conversion. */
  internalId: string;
  tag: string;
  /** HV bus. */
  fromBusInternalId: string;
  /** LV bus. */
  toBusInternalId: string;
  snMva: number | null;
  vnHvKv: number | null;
  vnLvKv: number | null;
  vkPercent: number | null;
  vkrPercent: number | null;
  xrRatio: number | null;
  vectorGroup: string | null;
  tapPosition: number | null;
}

export interface SolverLine {
  /** Stage 1 Cable.internalId. */
  internalId: string;
  tag: string;
  fromBusInternalId: string;
  toBusInternalId: string;
  lengthM: number | null;
  rOhmPerKm: number | null;
  xOhmPerKm: number | null;
}

export type SolverLoadOrigin = "load" | "motor";

export interface SolverLoad {
  /** Stage 1 Load.internalId or Motor.internalId. */
  internalId: string;
  tag: string;
  busInternalId: string;
  pMw: number;
  qMvar: number;
  origin: SolverLoadOrigin;
}

export interface SolverGeneratorPQ {
  /** Stage 1 Generator.internalId. */
  internalId: string;
  tag: string;
  busInternalId: string;
  pMw: number | null;
  qMvar: number | null;
}

export type SolverAlgorithm = "nr" | "bfsw";

export interface SolverOptions {
  algorithm: SolverAlgorithm;
  tolerance: number;
  maxIter: number;
  /** Stage 2 hard-pins this to false — PV mode is unsupported. */
  enforceQLim: false;
}

export const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  algorithm: "nr",
  tolerance: 1e-8,
  maxIter: 50,
  enforceQLim: false,
};

export interface SolverInput {
  inputVersion: typeof SOLVER_INPUT_VERSION;
  /** Mirrors `AppNetwork.scenarioId`. */
  scenarioId: string | null;
  frequencyHz: 50 | 60;
  buses: SolverBus[];
  sources: SolverSource[];
  transformers: SolverTransformer[];
  lines: SolverLine[];
  loads: SolverLoad[];
  generatorsPQ: SolverGeneratorPQ[];
  options: SolverOptions;
}

export type SolverName = "pandapower";

/**
 * Metadata recorded on every solver invocation. Consumed by the result
 * store starting in Stage 2 PR #4 — Stage 2 PR #3 only defines the shape.
 */
export interface SolverMetadata {
  solverName: SolverName;
  /** Exact solver library version reported by the sidecar. */
  solverVersion: string;
  /** semver of `@power-system-study/solver-adapter`. */
  adapterVersion: string;
  options: SolverOptions;
  /** ISO-8601 UTC timestamp set by the sidecar. */
  executedAt: string;
  /** SHA-256 of the canonical SolverInput JSON when hashing is enabled. */
  inputHash: string | null;
  /** SHA-256 of the canonical AppNetwork JSON when hashing is enabled. */
  networkHash: string | null;
}

export type SolverResultStatus = "succeeded" | "failed_validation" | "failed_solver";

export type SolverIssueCode =
  | "E-LF-001"
  | "E-LF-004"
  | "E-LF-005"
  | "W-LF-001"
  | "W-LF-002"
  | "W-LF-003";

export type SolverIssueSeverity = "error" | "warning";

export interface SolverIssue {
  code: SolverIssueCode;
  severity: SolverIssueSeverity;
  message: string;
  /** Resolves back into AppNetwork. */
  internalId?: string;
  field?: string;
}

export interface SolverBusResult {
  /** = SolverBus.internalId. */
  internalId: string;
  voltageKv: number;
  voltagePuPct: number;
  angleDeg: number;
}

export type SolverBranchKind = "transformer" | "line";

export interface SolverBranchResult {
  /** = SolverTransformer.internalId or SolverLine.internalId. */
  internalId: string;
  branchKind: SolverBranchKind;
  fromBusInternalId: string;
  toBusInternalId: string;
  pMwFrom: number;
  qMvarFrom: number;
  pMwTo: number;
  qMvarTo: number;
  currentA: number;
  /** null when no rating is available — Stage 2 spec §9.2 BranchResult. */
  loadingPct: number | null;
  lossKw: number;
}

export interface SolverResult {
  status: SolverResultStatus;
  converged: boolean;
  metadata: SolverMetadata;
  buses: SolverBusResult[];
  branches: SolverBranchResult[];
  issues: SolverIssue[];
}
