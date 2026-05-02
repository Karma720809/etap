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
//     only defines the snapshot's shape and a small factory.
//   - Snapshots reference the post-override `AppNetwork` by value
//     (not by mutating it). Callers must treat the snapshot as
//     read-only.
//
// This file deliberately avoids importing solver internals (pandapower,
// the sidecar transport) — it is a value type plus a pure factory.

import type { AppNetwork } from "@power-system-study/network-model";

import type { SolverOptions } from "./types.js";

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
  /** The post-override AppNetwork the solver actually saw. */
  appNetwork: AppNetwork;
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
  projectId?: string | null;
  options: SolverOptions;
  adapterVersion: string;
  /** Override for tests; defaults to `Date.now()`-based ids. */
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
 * Pure factory for a runtime snapshot. Does not mutate the input
 * AppNetwork. Does not write anything to disk. Does not interact with
 * the project file.
 */
export function createRuntimeSnapshot(
  input: CreateRuntimeSnapshotInput,
): RuntimeCalculationSnapshot {
  const now = (input.now ?? (() => new Date()))();
  const createdAt = now.toISOString();
  const snapshotId = (input.generateId ?? (() => defaultGenerateId(input.appNetwork.scenarioId, now)))();
  return {
    snapshotId,
    projectId: input.projectId ?? null,
    scenarioId: input.appNetwork.scenarioId,
    createdAt,
    appNetwork: input.appNetwork,
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
