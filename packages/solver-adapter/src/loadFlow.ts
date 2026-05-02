// Stage 2 PR #4 — Load Flow runner.
//
// `runLoadFlowForAppNetwork(appNetwork, options)` is the orchestrator
// that ties together:
//   1. SolverInput construction (`buildSolverInputFromAppNetwork`),
//   2. Runtime snapshot creation (`createRuntimeSnapshot`),
//   3. Sidecar invocation (`SidecarTransport.runLoadFlow`),
//   4. Result normalization (`normalizeSolverResult`).
//
// Guardrails enforced here:
//   - The orchestrator does NOT mutate the input AppNetwork.
//   - The runtime snapshot is in-memory only — never written to a
//     project file. The snapshot is a deep clone (per Stage 2 PR #4
//     review blocker 2) so later mutation of the caller's AppNetwork
//     cannot change the snapshot's contents.
//   - Pre-flight short-circuits (no buses, no slack, multiple slack)
//     return a `failed` LoadFlowResult with a structured issue
//     WITHOUT spawning the Python sidecar.
//   - Transport-level failures (non-zero exit, malformed JSON, IPC
//     timeout, missing metadata in the response) are mapped to
//     `E-LF-004 solver adapter failure` — never to fabricated voltages
//     or currents.
//
// Bundle shape: `LoadFlowRunBundle` exposes the runtime
// `LoadFlowResult` under the field name `loadFlow` plus a
// `voltageDrop` field hard-coded to `null` for PR #4 / PR #4.x.
// Stage 2 spec §S2-OQ-05 requires the result bundle to expose both
// modules under their canonical names; PR #5 will populate
// `voltageDrop`. Both fields are included now (rather than added
// later) so downstream consumers do not need to rename or widen their
// type when PR #5 lands.

import {
  type AppNetwork,
} from "@power-system-study/network-model";

import { buildSolverInputFromAppNetwork } from "./contract.js";
import {
  normalizeSolverResult,
  type LoadFlowIssue,
  type LoadFlowResult,
} from "./results.js";
import {
  createRuntimeSnapshot,
  type RuntimeCalculationSnapshot,
  type RuntimeValidationSummary,
} from "./runtimeSnapshot.js";
import {
  SidecarTransportError,
  StdioSidecarTransport,
  type SidecarTransport,
} from "./sidecarClient.js";
import {
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_ADAPTER_VERSION,
  type SolverInput,
  type SolverOptions,
  type SolverResult,
} from "./types.js";

export interface RunLoadFlowOptions {
  /** Override the per-call solver options (defaults to NR / 1e-8 / 50). */
  solverOptions?: SolverOptions;
  /** Inject a transport (used by tests; production uses StdioSidecarTransport). */
  transport?: SidecarTransport;
  /** Project id stamped on the runtime snapshot for traceability. */
  projectId?: string | null;
  /**
   * Validation/readiness summary captured by the caller BEFORE the
   * run was issued. The orchestrator stamps this on the runtime
   * snapshot so PR #6 retention can audit it. Defaults to a minimal
   * "not_evaluated" summary when the caller has no readiness signal
   * to share (e.g., direct adapter tests).
   */
  validation?: RuntimeValidationSummary;
  /** Override `Date.now()` for deterministic test ids. */
  now?: () => Date;
  /** Override the result id generator for deterministic tests. */
  generateResultId?: () => string;
  /** Override the snapshot id generator for deterministic tests. */
  generateSnapshotId?: () => string;
}

/**
 * Outcome of a Load Flow run: the runtime LoadFlowResult, the runtime
 * snapshot it references, the SolverInput sent to the sidecar, and a
 * placeholder for the Voltage Drop module landing in PR #5.
 *
 * This bundle is returned by-value and held by callers in memory.
 * Stage 2 does not persist any of these to disk.
 */
export interface LoadFlowRunBundle {
  /**
   * Runtime Load Flow result. Renamed from `result` ahead of PR #5
   * (Stage 2 cleanup) so the bundle's two modules are symmetric:
   * `loadFlow` here, `voltageDrop` below.
   */
  loadFlow: LoadFlowResult;
  snapshot: RuntimeCalculationSnapshot;
  solverInput: SolverInput;
  /**
   * Voltage Drop result. Always `null` in PR #4 / PR #4.x. Populated
   * by Stage 2 PR #5 from the same Load Flow run (spec §S2-OQ-05).
   */
  voltageDrop: null;
}

let __resultCounter = 0;
function defaultGenerateResultId(now: Date): string {
  __resultCounter += 1;
  const stamp = now.getTime().toString(36);
  const tail = __resultCounter.toString(36).padStart(2, "0");
  return `lfr_${stamp}_${tail}`;
}

/**
 * Run a balanced 3-phase Load Flow on an `AppNetwork`. Returns a
 * runtime LoadFlowResult bundled with the runtime snapshot that the
 * result references.
 */
export async function runLoadFlowForAppNetwork(
  appNetwork: AppNetwork,
  options: RunLoadFlowOptions = {},
): Promise<LoadFlowRunBundle> {
  const solverOptions = options.solverOptions ?? { ...DEFAULT_SOLVER_OPTIONS };
  const now = options.now ?? (() => new Date());
  const createdAtDate = now();
  const createdAt = createdAtDate.toISOString();

  const solverInput = buildSolverInputFromAppNetwork(appNetwork, {
    options: solverOptions,
  });

  const preflightIssue = preflightAppNetwork(appNetwork);
  const validation: RuntimeValidationSummary =
    options.validation ?? makeDefaultValidationSummary(preflightIssue);

  const snapshot = createRuntimeSnapshot({
    appNetwork,
    solverInput,
    projectId: options.projectId ?? null,
    options: solverOptions,
    adapterVersion: SOLVER_ADAPTER_VERSION,
    validation,
    now: () => createdAtDate,
    generateId: options.generateSnapshotId,
  });

  const resultId = (options.generateResultId ?? (() => defaultGenerateResultId(createdAtDate)))();

  if (preflightIssue !== null) {
    return makeFailureBundle({
      appNetwork,
      solverInput,
      snapshot,
      resultId,
      createdAt,
      issue: preflightIssue,
      // No sidecar spawn → no real solver metadata.
      solverOptions,
    });
  }

  const transport = options.transport ?? new StdioSidecarTransport();

  let solverResult: SolverResult;
  try {
    solverResult = await transport.runLoadFlow(solverInput);
  } catch (err) {
    const message =
      err instanceof SidecarTransportError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return makeFailureBundle({
      appNetwork,
      solverInput,
      snapshot,
      resultId,
      createdAt,
      issue: {
        code: "E-LF-004",
        severity: "error",
        message: `solver sidecar transport failure: ${message}`,
      },
      solverOptions,
    });
  }

  // Stamp the snapshot's solver version from the sidecar's metadata so
  // later consumers (PR #6 retention) can identify the engine.
  snapshot.solver.version = solverResult.metadata.solverVersion;

  const result = normalizeSolverResult({
    resultId,
    runtimeSnapshotId: snapshot.snapshotId,
    appNetwork,
    solverInput,
    solverResult,
    adapterVersion: SOLVER_ADAPTER_VERSION,
    createdAt,
  });

  return { loadFlow: result, snapshot, solverInput, voltageDrop: null };
}

interface FailureBundleArgs {
  appNetwork: AppNetwork;
  solverInput: SolverInput;
  snapshot: RuntimeCalculationSnapshot;
  resultId: string;
  createdAt: string;
  issue: LoadFlowIssue;
  solverOptions: SolverOptions;
}

function makeFailureBundle(args: FailureBundleArgs): LoadFlowRunBundle {
  const failedSolverResult: SolverResult = {
    status: "failed_solver",
    converged: false,
    metadata: {
      solverName: "pandapower",
      solverVersion: "unavailable",
      adapterVersion: SOLVER_ADAPTER_VERSION,
      options: args.solverOptions,
      executedAt: args.createdAt,
      inputHash: null,
      networkHash: null,
    },
    buses: [],
    branches: [],
    issues: [
      {
        code: args.issue.code,
        severity: args.issue.severity,
        message: args.issue.message,
        ...(args.issue.internalId !== undefined ? { internalId: args.issue.internalId } : {}),
        ...(args.issue.field !== undefined ? { field: args.issue.field } : {}),
      },
    ],
  };

  const result = normalizeSolverResult({
    resultId: args.resultId,
    runtimeSnapshotId: args.snapshot.snapshotId,
    appNetwork: args.appNetwork,
    solverInput: args.solverInput,
    solverResult: failedSolverResult,
    adapterVersion: SOLVER_ADAPTER_VERSION,
    createdAt: args.createdAt,
  });

  return {
    loadFlow: result,
    snapshot: args.snapshot,
    solverInput: args.solverInput,
    voltageDrop: null,
  };
}

/**
 * Cheap pre-flight checks performed BEFORE spawning the sidecar.
 * Returns the first blocking issue, or null if the network looks
 * solvable enough to hand off to pandapower.
 *
 * The intent is not to duplicate `validateForCalculation()` (Stage 1)
 * or topology extraction (`packages/network-model`); both have already
 * run by the time an AppNetwork reaches this orchestrator. This is a
 * defense-in-depth pre-flight: empty bus list / no-slack / multi-slack
 * are conditions where pandapower would either crash or produce a
 * meaningless result, so we short-circuit to a structured issue
 * without paying the spawn cost.
 */
function preflightAppNetwork(appNetwork: AppNetwork): LoadFlowIssue | null {
  if (appNetwork.buses.length === 0) {
    return {
      code: "E-LF-005",
      severity: "error",
      message: "AppNetwork has no buses; nothing for the solver to compute.",
    };
  }
  const slackCount = appNetwork.sources.filter((s) => s.role === "slack").length;
  if (slackCount === 0) {
    return {
      code: "E-LF-005",
      severity: "error",
      message:
        "AppNetwork has no slack source. Stage 2 MVP requires exactly one in-service utility (spec §6.2).",
    };
  }
  if (slackCount > 1) {
    return {
      code: "E-LF-005",
      severity: "error",
      message: `AppNetwork has ${slackCount} slack sources. Stage 2 MVP supports exactly one (spec §6.2; multi-utility deferred to S2-FU-03).`,
    };
  }
  return null;
}

function makeDefaultValidationSummary(
  preflightIssue: LoadFlowIssue | null,
): RuntimeValidationSummary {
  if (preflightIssue === null) {
    return {
      status: "ready_to_run",
      networkBuildStatus: "valid",
      issues: [],
    };
  }
  return {
    status: "blocked_by_validation",
    networkBuildStatus: "valid",
    issues: [
      {
        code: preflightIssue.code,
        severity: preflightIssue.severity,
        message: preflightIssue.message,
        ...(preflightIssue.internalId !== undefined
          ? { equipmentInternalId: preflightIssue.internalId }
          : {}),
        ...(preflightIssue.field !== undefined ? { field: preflightIssue.field } : {}),
      },
    ],
  };
}
