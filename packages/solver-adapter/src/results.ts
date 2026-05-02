// Stage 2 PR #4 — Load Flow result types and normalization.
//
// This module turns the solver-shaped `SolverResult` (defined in
// `types.ts`, mirrored in `services/solver-sidecar/src/contracts.py`)
// into the app-shaped `LoadFlowResult` consumed by the rest of the
// application. Spec §9 defines the inner spec types (BusResult,
// BranchResult, EquipmentLoadingResult); PR #4 wraps those into a
// runtime-only result that also carries identity, metadata, totals,
// per-row status, and an overall status.
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
//
// Stage 2 PR #4 review blocker 3: each bus/branch/equipment row carries
// a row-level status, and the result carries `totalGenerationMw`,
// `totalLoadMw`, and `totalLossesMw` derived from solver output. The
// row statuses use the spec's `ok | warning | violation` vocabulary
// (spec §9.2 / §7.3). The top-level `status` (failed/warning/valid)
// remains the run-level summary used by callers that just want one
// signal.

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

/**
 * Row-level result status. Mirrors spec §9.2 `ResultStatus` vocabulary
 * (`ok | warning | violation`) used by bus voltage-band, branch
 * loading, and equipment loading classifications.
 */
export type LoadFlowResultStatus = "ok" | "warning" | "violation";

/** Per-bus result row. Spec §9 BusResult plus tag projection. */
export interface LoadFlowBusResult {
  busInternalId: string;
  tag: string;
  voltageKv: number;
  voltagePuPct: number;
  angleDeg: number;
  /**
   * Voltage-band status from the bus's `minVoltagePct` / `maxVoltagePct`
   * (spec §7.3.2). When the bus has no band entered, defaults to "ok".
   */
  status: LoadFlowResultStatus;
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
  /**
   * Loading status derived from `loadingPct` (spec §11 W-LF-003 / §9.2
   * `ResultStatus`). When `loadingPct` is null (no rating wired in
   * PR #4), defaults to "ok".
   */
  status: LoadFlowResultStatus;
}

/** Loading roll-up for a load or motor connected to a bus. */
export interface LoadFlowEquipmentLoadingResult {
  equipmentInternalId: string;
  tag: string;
  busInternalId: string;
  origin: "load" | "motor";
  pMw: number;
  qMvar: number;
  /**
   * Equipment loading vs rating where available. Null in PR #4 — the
   * SolverInput contract does not yet carry equipment ratings.
   */
  loadingPct: number | null;
  status: LoadFlowResultStatus;
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
  /** Sum of slack-side active power across all branches feeding from sources. */
  totalGenerationMw: number;
  /**
   * Sum of `pMw` across `loadResults` and `motorResults` — the input-side
   * load total. Per spec §9.2 this is the demand side of the energy
   * balance equation.
   */
  totalLoadMw: number;
  /** Sum of branch losses (lines + transformers). */
  totalLossesMw: number;
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
 *     to recover `tag` and the voltage band (`minVoltagePct` /
 *     `maxVoltagePct`) for status classification.
 *   - SolverBranchResult.branchKind="line" maps to
 *     LoadFlowBranchResult.branchKind="cable" — the rest of the app
 *     uses the spec's "cable" vocabulary, never "line".
 *   - Branch and equipment status use the loading vs 100% threshold
 *     from spec §11 W-LF-003 (loading > 100% → violation; ≥ 90% →
 *     warning).
 *   - Loads / motors carry only the input PQ values (pre-solver). The
 *     loading-vs-rating column is null for PR #4; PR #5 will wire
 *     equipment ratings through the contract.
 *   - Top-level `status`: any error issue → "failed"; non-converged →
 *     "failed"; warnings (W-LF-*) OR any non-ok row → "warning";
 *     otherwise "valid".
 *   - Totals: `totalLossesMw` sums every branch's `lossKw / 1000`;
 *     `totalLoadMw` sums load + motor `pMw`; `totalGenerationMw` is
 *     the slack-side power flowing from each branch whose
 *     `fromBusInternalId` is attached to a slack source. Failed runs
 *     return zeros for all totals.
 */
export function normalizeSolverResult(
  args: NormalizeSolverResultArgs,
): LoadFlowResult {
  const { appNetwork, solverInput, solverResult } = args;

  const busById = new Map(appNetwork.buses.map((b) => [b.internalId, b] as const));
  const cableInternalIds = new Set(appNetwork.cables.map((c) => c.internalId));
  const transformerInternalIds = new Set(
    appNetwork.transformers.map((t) => t.internalId),
  );
  const slackBusIds = new Set(
    appNetwork.sources
      .filter((s) => s.role === "slack")
      .map((s) => s.busInternalId),
  );

  const busResults: LoadFlowBusResult[] = solverResult.buses.map((b) => {
    const bus = busById.get(b.internalId);
    return {
      busInternalId: b.internalId,
      tag: bus?.tag ?? b.internalId,
      voltageKv: b.voltageKv,
      voltagePuPct: b.voltagePuPct,
      angleDeg: b.angleDeg,
      status: classifyBusVoltage(b.voltagePuPct, bus?.minVoltagePct ?? null, bus?.maxVoltagePct ?? null),
    };
  });

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
      fromBusTag: busById.get(br.fromBusInternalId)?.tag ?? null,
      toBusTag: busById.get(br.toBusInternalId)?.tag ?? null,
      pMwFrom: br.pMwFrom,
      qMvarFrom: br.qMvarFrom,
      pMwTo: br.pMwTo,
      qMvarTo: br.qMvarTo,
      currentA: br.currentA,
      loadingPct: br.loadingPct,
      lossKw: br.lossKw,
      status: classifyLoading(br.loadingPct),
    };
  });

  const loadResults: LoadFlowEquipmentLoadingResult[] = [];
  const motorResults: LoadFlowEquipmentLoadingResult[] = [];
  for (const sl of solverInput.loads) {
    const tag =
      sl.origin === "load"
        ? appNetwork.loads.find((l) => l.internalId === sl.internalId)?.tag
        : appNetwork.motors.find((m) => m.internalId === sl.internalId)?.tag;
    // Equipment loading-vs-rating is null in PR #4 — ratings are not
    // yet part of the SolverInput contract. PR #5 will wire them.
    const loadingPct: number | null = null;
    const row: LoadFlowEquipmentLoadingResult = {
      equipmentInternalId: sl.internalId,
      tag: tag ?? sl.tag,
      busInternalId: sl.busInternalId,
      origin: sl.origin,
      pMw: sl.pMw,
      qMvar: sl.qMvar,
      loadingPct,
      status: classifyLoading(loadingPct),
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

  const isFailed =
    solverResult.status === "failed_solver" ||
    solverResult.status === "failed_validation" ||
    !solverResult.converged ||
    issues.some((i) => i.severity === "error");

  const totals = isFailed
    ? { totalGenerationMw: 0, totalLoadMw: 0, totalLossesMw: 0 }
    : computeTotals(branchResults, loadResults, motorResults, slackBusIds);

  const status = deriveStatus({ isFailed, busResults, branchResults, issues });

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
    totalGenerationMw: totals.totalGenerationMw,
    totalLoadMw: totals.totalLoadMw,
    totalLossesMw: totals.totalLossesMw,
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

function classifyBusVoltage(
  voltagePuPct: number,
  minPct: number | null,
  maxPct: number | null,
): LoadFlowResultStatus {
  // Spec §7.3.2: bus band status compares per-unit voltage % against
  // the bus's `minVoltagePct` / `maxVoltagePct` band. Without an
  // entered band the default is "ok" — spec §10.1 keeps these warnings
  // off by default.
  if (minPct !== null && voltagePuPct < minPct) return "warning";
  if (maxPct !== null && voltagePuPct > maxPct) return "warning";
  return "ok";
}

function classifyLoading(loadingPct: number | null): LoadFlowResultStatus {
  // Spec §11 W-LF-003 raises a warning at >100% loading. The 90%
  // band-near-limit shoulder mirrors the spec §7.3.1 voltage-drop
  // status so result tables across modules feel consistent.
  if (loadingPct === null || !Number.isFinite(loadingPct)) return "ok";
  if (loadingPct > 100) return "violation";
  if (loadingPct >= 90) return "warning";
  return "ok";
}

function computeTotals(
  branchResults: LoadFlowBranchResult[],
  loadResults: LoadFlowEquipmentLoadingResult[],
  motorResults: LoadFlowEquipmentLoadingResult[],
  slackBusIds: Set<string>,
): { totalGenerationMw: number; totalLoadMw: number; totalLossesMw: number } {
  let totalLossesMw = 0;
  let totalGenerationMw = 0;
  for (const br of branchResults) {
    totalLossesMw += br.lossKw / 1000;
    if (slackBusIds.has(br.fromBusInternalId)) {
      totalGenerationMw += br.pMwFrom;
    }
  }
  let totalLoadMw = 0;
  for (const r of loadResults) totalLoadMw += r.pMw;
  for (const r of motorResults) totalLoadMw += r.pMw;
  return { totalGenerationMw, totalLoadMw, totalLossesMw };
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

interface DeriveStatusArgs {
  isFailed: boolean;
  busResults: LoadFlowBusResult[];
  branchResults: LoadFlowBranchResult[];
  issues: LoadFlowIssue[];
}

function deriveStatus(args: DeriveStatusArgs): LoadFlowStatus {
  if (args.isFailed) return "failed";
  const hasWarningIssue = args.issues.some((i) => i.severity === "warning");
  const hasNonOkBus = args.busResults.some((b) => b.status !== "ok");
  const hasNonOkBranch = args.branchResults.some((b) => b.status !== "ok");
  if (hasWarningIssue || hasNonOkBus || hasNonOkBranch) return "warning";
  return "valid";
}
