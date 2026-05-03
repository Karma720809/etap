// Stage 3 PR #4 — Short Circuit orchestrator.
//
// `runShortCircuitForAppNetwork(appNetwork, options)` ties together:
//   1. SolverInput construction (`buildSolverInputFromAppNetwork`),
//   2. Runtime snapshot creation (`createRuntimeSnapshot`),
//   3. Short Circuit request envelope (mode + targets + options),
//   4. Sidecar invocation (`SidecarTransport.runShortCircuit`),
//   5. Result normalization (`normalizeShortCircuitResult`),
//   6. Bundling everything in a `ShortCircuitRunBundle`.
//
// Guardrails enforced here (spec §7.5, §8.1, §S3-OQ-09):
//   - The orchestrator MUST NOT mutate the input AppNetwork. The
//     runtime snapshot deep-clones AppNetwork and SolverInput.
//   - The runtime snapshot lives in memory only — never written to a
//     project file. The bundle is held by-value by the caller.
//   - Pre-flight short-circuits (no slack / multi-slack) return a
//     `failed` ShortCircuitResult with `E-SC-006` WITHOUT spawning the
//     Python sidecar. Mirrors the Stage 2 Load Flow pre-flight.
//   - Transport-level failures (non-zero exit, malformed JSON, IPC
//     timeout, structural-guard rejection) are mapped to `E-SC-001`
//     with `busResults: []` — never to fabricated currents.
//   - Numeric nullability is preserved end-to-end (no `0.0` defaults).
//
// Bundle shape: `ShortCircuitRunBundle` exposes the runtime
// `ShortCircuitResult` under the field name `shortCircuit`, plus the
// snapshot, the SolverInput, and the original `ShortCircuitRequest`
// for retention/audit (spec §7.2).

import { type AppNetwork } from "@power-system-study/network-model";

import { buildSolverInputFromAppNetwork } from "./contract.js";
import {
  DEFAULT_SHORT_CIRCUIT_OPTIONS,
  type ShortCircuitFaultTarget,
  type ShortCircuitMode,
  type ShortCircuitOptions,
  type ShortCircuitRequest,
  type ShortCircuitSidecarResponse,
} from "./shortCircuit.js";
import {
  normalizeShortCircuitResult,
  type ShortCircuitIssue,
  type ShortCircuitResult,
} from "./shortCircuitResults.js";
import {
  createRuntimeSnapshot,
  type RuntimeCalculationSnapshot,
  type RuntimeValidationSummary,
} from "./runtimeSnapshot.js";
import {
  SidecarTransportError,
  type SidecarTransport,
} from "./sidecarClient.js";
import {
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_ADAPTER_VERSION,
  type SolverInput,
  type SolverOptions,
} from "./types.js";

export interface RunShortCircuitOptions {
  /** Override the per-call solver options (defaults to NR / 1e-8 / 50). */
  solverOptions?: SolverOptions;
  /** Override the per-call Short Circuit options (defaults to S3-OQ-02 / S3-OQ-03). */
  shortCircuitOptions?: ShortCircuitOptions;
  /** Inject a transport (used by tests; production uses StdioSidecarTransport). */
  transport?: SidecarTransport;
  /** Project id stamped on the runtime snapshot for traceability. */
  projectId?: string | null;
  /** Validation/readiness summary captured BEFORE the run was issued. */
  validation?: RuntimeValidationSummary;
  /**
   * Fault target mode. Defaults to `"all_buses"` per spec §9.4 — every
   * in-scope bus is faulted when no explicit target list is supplied.
   */
  mode?: ShortCircuitMode;
  /**
   * Fault targets. Required when `mode === "specific"`; ignored when
   * `mode === "all_buses"` (passed through to the wire as a hint per
   * spec §5.3 / S3-ADP-03).
   */
  faultTargets?: ShortCircuitFaultTarget[];
  /** Override `Date.now()` for deterministic test ids. */
  now?: () => Date;
  /** Override the result id generator for deterministic tests. */
  generateResultId?: () => string;
  /** Override the snapshot id generator for deterministic tests. */
  generateSnapshotId?: () => string;
}

/**
 * Outcome of a Short Circuit run: the runtime ShortCircuitResult, the
 * runtime snapshot it references, the SolverInput sent to the sidecar,
 * and the wire request that produced the result.
 *
 * Held by-value by callers in memory. Stage 3 does not persist any of
 * these to disk (spec §S3-OQ-09).
 */
export interface ShortCircuitRunBundle {
  shortCircuit: ShortCircuitResult;
  snapshot: RuntimeCalculationSnapshot;
  solverInput: SolverInput;
  /** The exact request envelope the orchestrator sent to the sidecar. */
  request: ShortCircuitRequest;
}

let __resultCounter = 0;
function defaultGenerateResultId(now: Date): string {
  __resultCounter += 1;
  const stamp = now.getTime().toString(36);
  const tail = __resultCounter.toString(36).padStart(2, "0");
  return `scr_${stamp}_${tail}`;
}

/**
 * Run an IEC 60909 maximum 3-phase Short Circuit on an `AppNetwork`.
 * Returns a runtime `ShortCircuitRunBundle`.
 */
export async function runShortCircuitForAppNetwork(
  appNetwork: AppNetwork,
  options: RunShortCircuitOptions = {},
): Promise<ShortCircuitRunBundle> {
  const solverOptions = options.solverOptions ?? { ...DEFAULT_SOLVER_OPTIONS };
  const shortCircuitOptions =
    options.shortCircuitOptions ?? { ...DEFAULT_SHORT_CIRCUIT_OPTIONS };
  const mode: ShortCircuitMode = options.mode ?? "all_buses";
  const faultTargets: ShortCircuitFaultTarget[] = options.faultTargets ?? [];

  const now = options.now ?? (() => new Date());
  const createdAtDate = now();
  const createdAt = createdAtDate.toISOString();

  const solverInput = buildSolverInputFromAppNetwork(appNetwork, {
    options: solverOptions,
  });

  const request: ShortCircuitRequest = {
    solverInput,
    mode,
    faultTargets,
    shortCircuitOptions,
  };

  const preflightIssue = preflightAppNetwork(appNetwork, mode, faultTargets);
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

  const resultId = (
    options.generateResultId ?? (() => defaultGenerateResultId(createdAtDate))
  )();

  if (preflightIssue !== null) {
    return makeFailureBundle({
      snapshot,
      solverInput,
      request,
      resultId,
      createdAt,
      issue: preflightIssue,
      shortCircuitOptions,
      solverOptions,
      executedAt: createdAt,
    });
  }

  const transport = options.transport ?? (await defaultTransport());

  let response: ShortCircuitSidecarResponse;
  try {
    response = await transport.runShortCircuit(request);
  } catch (err) {
    const message =
      err instanceof SidecarTransportError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return makeFailureBundle({
      snapshot,
      solverInput,
      request,
      resultId,
      createdAt,
      issue: {
        code: "E-SC-001",
        severity: "error",
        message: `solver sidecar transport failure: ${message}`,
      },
      shortCircuitOptions,
      solverOptions,
      executedAt: createdAt,
    });
  }

  // Stamp the snapshot's solver version from the wire metadata so
  // retention consumers can identify the engine.
  snapshot.solver.version = response.metadata.solverVersion;

  const result = normalizeShortCircuitResult({
    resultId,
    runtimeSnapshotId: snapshot.snapshotId,
    appNetwork,
    request,
    response,
    adapterVersion: SOLVER_ADAPTER_VERSION,
    createdAt,
  });

  return { shortCircuit: result, snapshot, solverInput, request };
}

interface FailureBundleArgs {
  snapshot: RuntimeCalculationSnapshot;
  solverInput: SolverInput;
  request: ShortCircuitRequest;
  resultId: string;
  createdAt: string;
  issue: ShortCircuitIssue;
  shortCircuitOptions: ShortCircuitOptions;
  solverOptions: SolverOptions;
  executedAt: string;
}

function makeFailureBundle(args: FailureBundleArgs): ShortCircuitRunBundle {
  const result: ShortCircuitResult = {
    resultId: args.resultId,
    runtimeSnapshotId: args.snapshot.snapshotId,
    scenarioId: args.snapshot.scenarioId,
    module: "shortCircuit",
    status: "failed",
    faultType: args.shortCircuitOptions.faultType,
    calculationCase: args.shortCircuitOptions.calculationCase,
    voltageFactor: 1,
    busResults: [],
    issues: [args.issue],
    metadata: {
      solverName: "pandapower",
      solverVersion: "unavailable",
      adapterVersion: SOLVER_ADAPTER_VERSION,
      solverOptions: args.solverOptions,
      executedAt: args.executedAt,
      inputHash: null,
      networkHash: null,
    },
    createdAt: args.createdAt,
  };
  return {
    shortCircuit: result,
    snapshot: args.snapshot,
    solverInput: args.solverInput,
    request: args.request,
  };
}

/**
 * Lazy default-transport factory. Mirrors `loadFlow.ts` so the
 * orchestrator stays importable from browser bundles that hand-roll a
 * transport (PR #5 UI run path) and from Node tests that pass a stub.
 */
async function defaultTransport(): Promise<SidecarTransport> {
  const path = "./stdioSidecarTransport.js";
  const mod = (await import(/* @vite-ignore */ path)) as typeof import("./stdioSidecarTransport.js");
  return new mod.StdioSidecarTransport();
}

/**
 * Pre-flight checks performed BEFORE spawning the sidecar.
 *
 * - Empty bus list / no slack / multiple slack sources are conditions
 *   where pandapower would either crash or produce a meaningless
 *   result, so we short-circuit to a structured `E-SC-006` issue (per
 *   spec §11.3 the Stage 2 multi-slack guard maps to `E-SC-006` in
 *   Stage 3, not `E-LF-005`) without paying the spawn cost.
 * - `mode === "specific"` with empty `faultTargets` is rejected with
 *   `E-SC-005` (spec §11.1) before the sidecar is spawned.
 *
 * Returns the first blocking issue, or `null` if the network looks
 * solvable enough to hand off to pandapower.
 */
function preflightAppNetwork(
  appNetwork: AppNetwork,
  mode: ShortCircuitMode,
  faultTargets: ShortCircuitFaultTarget[],
): ShortCircuitIssue | null {
  if (appNetwork.buses.length === 0) {
    return {
      code: "E-SC-006",
      severity: "error",
      message: "AppNetwork has no buses; nothing for the solver to compute.",
    };
  }
  const slackCount = appNetwork.sources.filter((s) => s.role === "slack").length;
  if (slackCount === 0) {
    return {
      code: "E-SC-006",
      severity: "error",
      message:
        "AppNetwork has no slack source. Stage 3 MVP requires exactly one in-service utility (spec §6.2).",
    };
  }
  if (slackCount > 1) {
    return {
      code: "E-SC-006",
      severity: "error",
      message: `AppNetwork has ${slackCount} slack sources. Stage 3 MVP supports exactly one (spec §11.3; multi-utility deferred to S2-FU-03).`,
    };
  }
  if (mode === "specific" && faultTargets.length === 0) {
    return {
      code: "E-SC-005",
      severity: "error",
      message: "mode='specific' requires at least one faultTargets entry.",
      field: "faultTargets",
    };
  }
  if (mode === "specific") {
    const knownBusIds = new Set(appNetwork.buses.map((b) => b.internalId));
    for (const target of faultTargets) {
      if (!knownBusIds.has(target.busInternalId)) {
        return {
          code: "E-SC-005",
          severity: "error",
          message: `faultTarget busInternalId ${JSON.stringify(target.busInternalId)} not present in AppNetwork.buses.`,
          internalId: target.busInternalId,
          field: "faultTargets[].busInternalId",
        };
      }
    }
  }
  return null;
}

function makeDefaultValidationSummary(
  preflightIssue: ShortCircuitIssue | null,
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
