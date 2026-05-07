// Stage 2 PR #6 — Runtime calculation store types.
//
// These types power the in-memory calculation result + snapshot store
// that lives alongside the project store in `apps/web`. They are the
// extracted shape of `apps/web/src/state/calculationStore.ts` from
// Stage 2 PR #5, factored into a runtime-only package so future
// surfaces (CLI, desktop, integration harness) can share the same
// retention rules without pulling in React.
//
// Guardrails honored (spec §10 / §17 / S2-OQ-06):
//   - Nothing in this package is serialized into the Stage 1 canonical
//     project file. Records hold the runtime `LoadFlowRunBundle`,
//     which itself owns a `RuntimeCalculationSnapshot`. The bundle and
//     snapshot are in-memory values; this package never opens a file
//     handle.
//   - Retention rules follow spec §9.5 / §10.5 / OQ-15:
//       * latest successful result per
//         `(scenarioId, module, subCase)`,
//       * latest failed validation/runtime snapshot for audit,
//       * stale flag flipped by project edits — no auto-recompute.
//   - The shape stays narrow on purpose. Stage 2 MVP does not need a
//     Map, an LRU, or a history buffer — `Record<string, …>` keyed by
//     the canonicalized retention key is enough and trivially
//     serializable in tests.

import type { DutyCheckRunBundle } from "@power-system-study/duty-check";
import type { NetworkBuildResult } from "@power-system-study/network-model";
import type {
  LoadFlowRunBundle,
  RuntimeCalculationSnapshot,
  ShortCircuitRunBundle,
} from "@power-system-study/solver-adapter";

/**
 * Top-level lifecycle of the active run, distinct from the per-record
 * stale flag tracked under retention. Mirrors the Stage 2 PR #5 store
 * vocabulary so the UI panel keeps the same surface after the package
 * extraction.
 */
export type CalculationLifecycle =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "stale";

/**
 * Canonical module identifier for retention. Stage 2 ships the Load
 * Flow + Voltage Drop bundle under `"load_flow_bundle"`; Stage 3 PR #4
 * adds `"short_circuit_bundle"` for the `ShortCircuitRunBundle`
 * retention slot (spec §8.2); Stage 3 ED-PR-03 adds
 * `"duty_check_bundle"` for the `DutyCheckRunBundle` retention slot
 * (Equipment Duty spec §4.6 / ED-OQ-06). Each value pairs with a
 * single bundle shape on `RuntimeCalculationRecord.bundle`:
 *   - `"load_flow_bundle"`     ↔ `LoadFlowRunBundle`
 *   - `"short_circuit_bundle"` ↔ `ShortCircuitRunBundle`
 *   - `"duty_check_bundle"`    ↔ `DutyCheckRunBundle`
 *
 * Note: `ShortCircuitResult.module = "shortCircuit"` and
 * `DutyCheckResult.module = "dutyCheck"` (the result-API fields)
 * are **distinct** from these retention keys; both identify the
 * same calculation but live on different APIs (spec §7.2 +
 * Equipment Duty spec §4.6).
 *
 * Future stages (Cable Sizing, report export) will widen this union
 * further when they actually land; the surface stays narrow on
 * purpose so unsupported module literals cannot reach this package's
 * API.
 */
export type CalculationModule =
  | "load_flow_bundle"
  | "short_circuit_bundle"
  | "duty_check_bundle";

/**
 * Discriminated union of runtime bundles supported by the retention
 * layer (spec §8.2 + Equipment Duty spec §4.6). The retention key's
 * `module` field is the discriminator:
 *   - Load Flow records carry a `LoadFlowRunBundle` (`loadFlow` field).
 *   - Short Circuit records carry a `ShortCircuitRunBundle`
 *     (`shortCircuit` field).
 *   - Equipment Duty records carry a `DutyCheckRunBundle`
 *     (`dutyCheck` field).
 *
 * Disk persistence remains deferred (S2-FU-07 / S3-FU-10 / Equipment
 * Duty spec §10); this union is purely an in-memory shape.
 */
export type RuntimeCalculationBundle =
  | LoadFlowRunBundle
  | ShortCircuitRunBundle
  | DutyCheckRunBundle;

/**
 * Retention key per spec §10.5: latest successful result is kept per
 * `(scenarioId, module, subCase)`. Stage 2 has no sub-cases yet, so
 * `subCase` defaults to `null`; the key shape is stable so adding
 * sub-cases later (e.g., per-fault-location short-circuit runs) does
 * not require reshaping the store.
 */
export interface RuntimeResultRetentionKey {
  /** `null` when no scenario is active (base case). Mirrors `AppNetwork.scenarioId`. */
  scenarioId: string | null;
  module: CalculationModule;
  /** Optional sub-case discriminator. `null` for Stage 2 MVP. */
  subCase: string | null;
}

/**
 * Retained successful run. The bundle owns its module-specific result
 * (Load Flow + derived Voltage Drop, or Short Circuit) plus the
 * runtime snapshot. The build is held alongside so the UI can surface
 * E-NET-* readiness diagnostics from the same run without rebuilding
 * the AppNetwork.
 *
 * Stage 3 PR #4 widens `bundle` to a discriminated union
 * (`LoadFlowRunBundle | ShortCircuitRunBundle`) so the same record
 * shape can hold either module's runtime bundle. The retention key's
 * `module` field discriminates the union (spec §8.2 / S3-OQ-10).
 */
export interface RuntimeCalculationRecord {
  /** Canonicalized retention key the record was stored under. */
  key: RuntimeResultRetentionKey;
  bundle: RuntimeCalculationBundle;
  /** Network build that produced the AppNetwork passed to the solver. */
  build: NetworkBuildResult | null;
  /** ISO timestamp when the record was retained. */
  recordedAt: string;
  /**
   * Stale flag. Spec §9.5: flipped to `true` after a project edit that
   * could affect the AppNetwork. The record is kept so the user can
   * still inspect the previous numbers; re-runs are explicit.
   */
  stale: boolean;
}

/** Why the snapshot was retained as the latest failed run. */
export type RuntimeSnapshotRetentionReason =
  | "validation_failure"
  | "runtime_failure";

/**
 * Retained snapshot from the latest failed run. Spec §10.5 keeps this
 * around so a user can audit what was sent to the solver when a run
 * fails, even after a successful re-run later. The bundle's snapshot
 * is captured by reference — the bundle itself already deep-clones
 * the AppNetwork / SolverInput, so the snapshot is independent of
 * later project mutation (Stage 2 PR #4 review blocker 2).
 */
export interface RuntimeSnapshotRecord {
  snapshot: RuntimeCalculationSnapshot;
  /** ISO timestamp when the snapshot was retained. */
  recordedAt: string;
  reason: RuntimeSnapshotRetentionReason;
  /**
   * Optional: the network build associated with the failed run, when
   * available. `null` when the failure was a pre-build error (e.g.,
   * no transport configured).
   */
  build: NetworkBuildResult | null;
  /** Top-level error message that accompanied the failure. */
  message: string;
}

/**
 * Full runtime calculation store shape. The `lifecycle` / `bundle` /
 * `build` / `lastRunAt` / `startError` fields mirror the Stage 2 PR #5
 * store and describe the **active** run; `retainedResults` and
 * `lastFailedSnapshot` are PR #6 retention slots.
 *
 * `bundle` is the latest active result (success OR failed loadFlow). It
 * is also the source of truth that the UI binds to. After the bundle
 * is retained, mutating the project flips `lifecycle` to `"stale"` and
 * the corresponding entry inside `retainedResults` flips its `stale`
 * flag too, so any consumer that iterates retained records sees the
 * same staleness signal.
 */
export interface CalculationStoreState {
  lifecycle: CalculationLifecycle;
  /**
   * Latest active Load Flow + Voltage Drop bundle (success or failed).
   * Stage 3 PR #4 keeps this slot narrow so the existing Stage 2 UI
   * (CalculationStatusPanel, DiagramCanvas) can keep reading
   * `bundle.loadFlow` / `bundle.voltageDrop` directly without
   * narrowing. Short Circuit retention still works through
   * `retainedResults`, which is the union-typed slot — the active
   * Short Circuit slot lands when Stage 3 PR #5 wires up the UI.
   */
  bundle: LoadFlowRunBundle | null;
  /** Network build for the active bundle. */
  build: NetworkBuildResult | null;
  /** ISO timestamp the latest run started or completed. */
  lastRunAt: string | null;
  /** Top-level error when the run could not start (e.g., no transport). */
  startError: string | null;
  /**
   * Retained successful records keyed by the canonicalized retention
   * key string. Stage 2 MVP only ever holds at most one entry per
   * `(scenarioId, module, subCase)` triple per spec §10.5.
   */
  retainedResults: Record<string, RuntimeCalculationRecord>;
  /** Latest failed snapshot for audit; `null` until a run fails. */
  lastFailedSnapshot: RuntimeSnapshotRecord | null;
}

export const initialCalculationStoreState: CalculationStoreState = {
  lifecycle: "idle",
  bundle: null,
  build: null,
  lastRunAt: null,
  startError: null,
  retainedResults: {},
  lastFailedSnapshot: null,
};
