// Stage 2 PR #4 — Runtime CalculationSnapshot.
//
// Per spec §10 / S2-OQ-06 the **first real** CalculationSnapshot is
// allowed in PR #4, but it must remain runtime-only:
//
//   - Snapshots are NEVER serialized into the Stage 1 canonical project
//     file. The project file's `calculationSnapshots` array stays
//     empty for the entirety of Stage 2.
//   - Snapshots live in memory alongside the result bundle. PR #6 will
//     introduce retention rules in `packages/calculation-store`; PR #4
//     keeps the type and factory in `packages/solver-adapter` until the
//     store package lands (see solver_adapter_contract.md §5.4 follow-up
//     note).
//   - Snapshots capture the post-override `AppNetwork` and the
//     `SolverInput` BY VALUE — Stage 2 PR #4 review blocker 2 fix.
//     Mutating the original `AppNetwork` after snapshot creation must
//     not change the snapshot's stored network.
//
// Spec §10 also requires the snapshot to carry the validation /
// readiness summary that authorized the run. PR #4 does not own
// `validateForCalculation()` (Stage 1 / Stage 2 PR #5 owns the full
// readiness pipeline), so the runtime snapshot stores a small
// `RuntimeValidationSummary` shape that the orchestrator populates
// from whatever readiness signal the caller had at run time. Empty
// issues + status "ready_to_run" is the default when the orchestrator
// is invoked without an explicit readiness payload.
//
// This file deliberately avoids importing solver internals (pandapower,
// the sidecar transport) — it is a value type plus a pure factory.

import type { AppNetwork } from "@power-system-study/network-model";

import type { SolverInput, SolverOptions } from "./types.js";

/**
 * Validation/readiness summary captured on a runtime snapshot. Mirrors
 * the spec's `CalculationReadinessResult` shape narrowly: PR #4 records
 * the bare minimum (status + the issues used to permit/block the run)
 * so PR #6's retention layer can audit failed runs without depending
 * on the Stage 1 ValidationSummary structure.
 */
export type RuntimeValidationStatus =
  | "ready_to_run"
  | "blocked_by_validation"
  | "ran_with_warnings"
  | "not_evaluated";

export interface RuntimeValidationIssue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  equipmentInternalId?: string;
  field?: string;
}

export interface RuntimeValidationSummary {
  /** Status the orchestrator observed at the moment of the run. */
  status: RuntimeValidationStatus;
  /** Network-build status from `packages/network-model`, when known. */
  networkBuildStatus: "valid" | "invalid" | "not_evaluated";
  /** Issues used to permit / block the run. */
  issues: RuntimeValidationIssue[];
}

/**
 * Runtime calculation snapshot. Captures the post-override AppNetwork
 * passed to the solver, plus the solver metadata that identifies which
 * engine produced the result.
 *
 * Disk persistence is **not** allowed in Stage 2 (S2-FU-07). If a
 * future stage persists snapshots to disk, it must do so through a new
 * project-file schema version or a sidecar result-store schema, never
 * by silently writing into the Stage 1 canonical schema.
 */
export interface RuntimeCalculationSnapshot {
  /** Stable identity for this snapshot. Format: `snap_<scenarioId|"none">_<timestamp>`. */
  snapshotId: string;
  /** Optional projectId for cross-project traceability. */
  projectId: string | null;
  /** Mirrors `AppNetwork.scenarioId`. */
  scenarioId: string | null;
  createdAt: string;
  /**
   * Deep copy of the post-override AppNetwork the solver saw. Mutating
   * the caller's AppNetwork after snapshot creation does not affect
   * this field.
   */
  appNetwork: AppNetwork;
  /**
   * Deep copy of the SolverInput sent to the sidecar. Stored alongside
   * the AppNetwork so that PR #6 retention can replay the exact
   * request payload without rebuilding it.
   */
  solverInput: SolverInput;
  /** Validation/readiness summary that authorized the run (spec §10). */
  validation: RuntimeValidationSummary;
  solver: {
    name: "pandapower";
    /** Filled from `SolverMetadata.solverVersion` after the run. */
    version: string | null;
    options: SolverOptions;
  };
  /** semver of `@power-system-study/solver-adapter`. */
  adapterVersion: string;
  /**
   * SHA-256 of the canonical AppNetwork JSON. PR #4 leaves this as
   * `null`; the field is reserved for the byte-stable serializer that
   * lands alongside snapshot deduplication (S2-FU-04).
   */
  appNetworkHash: string | null;
  /**
   * SHA-256 of the canonical SolverInput JSON. Same TODO as
   * `appNetworkHash`.
   */
  solverInputHash: string | null;
}

export interface CreateRuntimeSnapshotInput {
  appNetwork: AppNetwork;
  solverInput: SolverInput;
  projectId?: string | null;
  options: SolverOptions;
  adapterVersion: string;
  /**
   * Validation summary captured before the run was issued. The
   * orchestrator usually populates this from
   * `CalculationReadinessResult` once Stage 2 PR #5 ships the
   * readiness wrapper; for PR #4 a minimal default is fine.
   */
  validation?: RuntimeValidationSummary;
  /** Override for tests; defaults to `new Date()`. */
  now?: () => Date;
  /** Override for tests; defaults to a counter-backed id. */
  generateId?: () => string;
}

let __snapshotCounter = 0;

function defaultGenerateId(scenarioId: string | null, now: Date): string {
  __snapshotCounter += 1;
  const tag = scenarioId ?? "none";
  const stamp = now.getTime().toString(36);
  // Short tail keeps multiple snapshots created within the same ms unique.
  const tail = __snapshotCounter.toString(36).padStart(2, "0");
  return `snap_${tag}_${stamp}_${tail}`;
}

/**
 * Deep clone helper. Uses `structuredClone` when available
 * (Node 17+ / browsers ≥ 2023); falls back to a JSON round-trip on
 * older runtimes. AppNetwork and SolverInput are pure JSON-shaped
 * values (no Date / Map / Set), so the JSON fallback is safe.
 */
function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

const DEFAULT_VALIDATION_SUMMARY: RuntimeValidationSummary = {
  status: "not_evaluated",
  networkBuildStatus: "not_evaluated",
  issues: [],
};

/**
 * Pure factory for a runtime snapshot. Does not mutate the input
 * AppNetwork. Does not write anything to disk. Does not interact with
 * the project file.
 *
 * Stage 2 PR #4 review blocker 2: the AppNetwork and SolverInput are
 * deep-cloned so that the snapshot is independent of subsequent
 * mutation of the caller's data structures.
 */
export function createRuntimeSnapshot(
  input: CreateRuntimeSnapshotInput,
): RuntimeCalculationSnapshot {
  const now = (input.now ?? (() => new Date()))();
  const createdAt = now.toISOString();
  const snapshotId = (input.generateId ?? (() => defaultGenerateId(input.appNetwork.scenarioId, now)))();
  const validation: RuntimeValidationSummary = input.validation
    ? {
        status: input.validation.status,
        networkBuildStatus: input.validation.networkBuildStatus,
        issues: input.validation.issues.map((i) => ({ ...i })),
      }
    : { ...DEFAULT_VALIDATION_SUMMARY };
  return {
    snapshotId,
    projectId: input.projectId ?? null,
    scenarioId: input.appNetwork.scenarioId,
    createdAt,
    appNetwork: deepClone(input.appNetwork),
    solverInput: deepClone(input.solverInput),
    validation,
    solver: {
      name: "pandapower",
      version: null,
      options: { ...input.options },
    },
    adapterVersion: input.adapterVersion,
    // Hashes are TODO once a byte-stable serializer lands. PR #4 keeps
    // them null rather than emitting unstable, non-canonical values.
    appNetworkHash: null,
    solverInputHash: null,
  };
}
