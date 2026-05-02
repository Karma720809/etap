// Stage 2 PR #4 — Load Flow result types and normalization.
//
// This module turns the solver-shaped `SolverResult` (defined in
// `types.ts`, mirrored in `services/solver-sidecar/src/contracts.py`)
// into the app-shaped `LoadFlowResult` consumed by the rest of the
// application. Spec §9 defines the inner spec types (BusResult,
// BranchResult, EquipmentLoadingResult); PR #4 wraps those into a
// runtime-only result that also carries identity, metadata, and an
// overall status.
//
// Guardrails honored:
//   - The result is runtime-only. It is never written to the Stage 1
//     canonical project file.
//   - `internalId` is preserved verbatim from the solver back to the
//     LoadFlowResult. No solver indices (pandapower row ids) leak.
//   - Branches are reattributed using `AppNetwork.cables` and
//     `AppNetwork.transformers` so that the result's `branchKind` uses
//     the spec's `cable | transformer` vocabulary instead of the
//     solver's `line | transformer`.
//   - Issues are mapped through the spec's code/severity vocabulary
//     unchanged; the sidecar already emits documented codes
//     (`E-LF-001` / `E-LF-004` / `E-LF-005` / `W-LF-001..003`).

import type { AppNetwork } from "@power-system-study/network-model";

import type {
  SolverInput,
  SolverIssue,
  SolverIssueCode,
  SolverIssueSeverity,
  SolverMetadata,
  SolverOptions,
  SolverResult,
} from "./types.js";

/** Overall status of a Load Flow run, distinct from the solver's view. */
export type LoadFlowStatus = "valid" | "warning" | "failed";

export type LoadFlowBranchKind = "cable" | "transformer";

/** Per-bus result row. Spec §9 BusResult plus tag projection. */
export interface LoadFlowBusResult {
  busInternalId: string;
  tag: string;
  voltageKv: number;
  voltagePuPct: number;
  angleDeg: number;
}

/** Per-branch result row. Spec §9 BranchResult, app vocabulary. */
export interface LoadFlowBranchResult {
  branchInternalId: string;
  /** Spec §9 vocabulary: `"cable" | "transformer"`. */
  branchKind: LoadFlowBranchKind;
  /** Source equipment internalId in the AppNetwork (= branchInternalId for cables/transformers). */
  sourceEquipmentInternalId: string;
  fromBusInternalId: string;
  toBusInternalId: string;
  fromBusTag: string | null;
  toBusTag: string | null;
  pMwFrom: number;
  qMvarFrom: number;
  pMwTo: number;
  qMvarTo: number;
  /** Magnitude of branch current in amps (from-side for transformers, line for cables). */
  currentA: number;
  /** Branch loading vs rating where available. Null when no rating. */
  loadingPct: number | null;
  lossKw: number;
}

/** Loading roll-up for a load or motor connected to a bus. */
export interface LoadFlowEquipmentLoadingResult {
  equipmentInternalId: string;
  tag: string;
  busInternalId: string;
  origin: "load" | "motor";
  pMw: number;
  qMvar: number;
}

export type LoadFlowIssueSeverity = SolverIssueSeverity;
export type LoadFlowIssueCode = SolverIssueCode;

/** Issue surfaced on the runtime LoadFlowResult. Mirrors `SolverIssue`. */
export interface LoadFlowIssue {
  code: LoadFlowIssueCode;
  severity: LoadFlowIssueSeverity;
  message: string;
  internalId?: string;
  field?: string;
}

/** Solver metadata attached to the runtime result. */
export interface LoadFlowSolverMetadata {
  solverName: SolverMetadata["solverName"];
  solverVersion: string;
  adapterVersion: string;
  solverOptions: SolverOptions;
  executedAt: string;
  inputHash: string | null;
  networkHash: string | null;
}

/**
 * Top-level Load Flow result. Runtime-only; never serialized into the
 * Stage 1 canonical project file (spec §10 / §17 / S2-OQ-06).
 */
export interface LoadFlowResult {
  /** Unique per call. */
  resultId: string;
  /** Reference to the runtime snapshot the result was computed from. */
  runtimeSnapshotId: string;
  scenarioId: string | null;
  createdAt: string;
  status: LoadFlowStatus;
  converged: boolean;
  busResults: LoadFlowBusResult[];
  branchResults: LoadFlowBranchResult[];
  loadResults: LoadFlowEquipmentLoadingResult[];
  motorResults: LoadFlowEquipmentLoadingResult[];
  issues: LoadFlowIssue[];
  metadata: LoadFlowSolverMetadata;
}

export interface NormalizeSolverResultArgs {
  resultId: string;
  runtimeSnapshotId: string;
  appNetwork: AppNetwork;
  solverInput: SolverInput;
  solverResult: SolverResult;
  /**
   * Adapter version stamped on the result. Defaults to the solver's
   * own metadata; callers (the orchestrator) pass the package semver
   * here so the sidecar's fallback never leaks into the app result.
   */
  adapterVersion: string;
  createdAt: string;
}

/**
 * Project a SolverResult into a runtime LoadFlowResult.
 *
 * Mapping rules:
 *   - SolverBusResult.internalId is matched against AppNetwork.buses
 *     to recover `tag` for display.
 *   - SolverBranchResult.branchKind="line" maps to
 *     LoadFlowBranchResult.branchKind="cable" — the rest of the app
 *     uses the spec's "cable" vocabulary, never "line".
 *   - Loads / motors carry only the input PQ values (pre-solver). The
 *     loading-vs-rating column is null for PR #4; PR #5 will wire
 *     equipment ratings through the contract.
 *   - status: any error issue → "failed"; non-converged → "failed";
 *     warnings (W-LF-*) → "warning"; otherwise "valid".
 */
export function normalizeSolverResult(
  args: NormalizeSolverResultArgs,
): LoadFlowResult {
  const { appNetwork, solverInput, solverResult } = args;

  const busTagById = new Map(appNetwork.buses.map((b) => [b.internalId, b.tag] as const));
  const cableInternalIds = new Set(appNetwork.cables.map((c) => c.internalId));
  const transformerInternalIds = new Set(
    appNetwork.transformers.map((t) => t.internalId),
  );

  const busResults: LoadFlowBusResult[] = solverResult.buses.map((b) => ({
    busInternalId: b.internalId,
    tag: busTagById.get(b.internalId) ?? b.internalId,
    voltageKv: b.voltageKv,
    voltagePuPct: b.voltagePuPct,
    angleDeg: b.angleDeg,
  }));

  const branchResults: LoadFlowBranchResult[] = solverResult.branches.map((br) => {
    const branchKind: LoadFlowBranchKind = mapBranchKind(
      br.branchKind,
      br.internalId,
      cableInternalIds,
      transformerInternalIds,
    );
    return {
      branchInternalId: br.internalId,
      branchKind,
      sourceEquipmentInternalId: br.internalId,
      fromBusInternalId: br.fromBusInternalId,
      toBusInternalId: br.toBusInternalId,
      fromBusTag: busTagById.get(br.fromBusInternalId) ?? null,
      toBusTag: busTagById.get(br.toBusInternalId) ?? null,
      pMwFrom: br.pMwFrom,
      qMvarFrom: br.qMvarFrom,
      pMwTo: br.pMwTo,
      qMvarTo: br.qMvarTo,
      currentA: br.currentA,
      loadingPct: br.loadingPct,
      lossKw: br.lossKw,
    };
  });

  const loadResults: LoadFlowEquipmentLoadingResult[] = [];
  const motorResults: LoadFlowEquipmentLoadingResult[] = [];
  for (const sl of solverInput.loads) {
    const tag =
      sl.origin === "load"
        ? appNetwork.loads.find((l) => l.internalId === sl.internalId)?.tag
        : appNetwork.motors.find((m) => m.internalId === sl.internalId)?.tag;
    const row: LoadFlowEquipmentLoadingResult = {
      equipmentInternalId: sl.internalId,
      tag: tag ?? sl.tag,
      busInternalId: sl.busInternalId,
      origin: sl.origin,
      pMw: sl.pMw,
      qMvar: sl.qMvar,
    };
    if (sl.origin === "load") {
      loadResults.push(row);
    } else {
      motorResults.push(row);
    }
  }

  const issues: LoadFlowIssue[] = solverResult.issues.map(toLoadFlowIssue);

  const metadata: LoadFlowSolverMetadata = {
    solverName: solverResult.metadata.solverName,
    solverVersion: solverResult.metadata.solverVersion,
    adapterVersion: args.adapterVersion,
    solverOptions: solverResult.metadata.options,
    executedAt: solverResult.metadata.executedAt,
    inputHash: solverResult.metadata.inputHash,
    networkHash: solverResult.metadata.networkHash,
  };

  const status = deriveStatus(solverResult);

  return {
    resultId: args.resultId,
    runtimeSnapshotId: args.runtimeSnapshotId,
    scenarioId: appNetwork.scenarioId,
    createdAt: args.createdAt,
    status,
    converged: solverResult.converged,
    busResults,
    branchResults,
    loadResults,
    motorResults,
    issues,
    metadata,
  };
}

function mapBranchKind(
  solverKind: "transformer" | "line",
  internalId: string,
  cableIds: Set<string>,
  transformerIds: Set<string>,
): LoadFlowBranchKind {
  if (solverKind === "transformer") return "transformer";
  // Solver kind is "line"; in the Stage 2 contract every solver line
  // came from an AppNetwork cable. Verify against the cable set as a
  // safety check; if the id is unknown, fall back to "cable" rather
  // than inventing a "transformer" attribution.
  if (cableIds.has(internalId)) return "cable";
  if (transformerIds.has(internalId)) return "transformer";
  return "cable";
}

function toLoadFlowIssue(issue: SolverIssue): LoadFlowIssue {
  const out: LoadFlowIssue = {
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
  };
  if (issue.internalId !== undefined) out.internalId = issue.internalId;
  if (issue.field !== undefined) out.field = issue.field;
  return out;
}

function deriveStatus(solverResult: SolverResult): LoadFlowStatus {
  if (
    solverResult.status === "failed_solver" ||
    solverResult.status === "failed_validation"
  ) {
    return "failed";
  }
  if (!solverResult.converged) {
    return "failed";
  }
  const hasError = solverResult.issues.some((i) => i.severity === "error");
  if (hasError) return "failed";
  const hasWarning = solverResult.issues.some((i) => i.severity === "warning");
  return hasWarning ? "warning" : "valid";
}
