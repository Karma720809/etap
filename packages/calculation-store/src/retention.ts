// Stage 2 PR #6 — Retention helpers.
// Stage 3 PR #4 — widened to support `ShortCircuitRunBundle` retention.
//
// Pure helpers used by the reducer (and exposed for ad-hoc callers
// such as integration tests). Nothing in here reaches for I/O or a
// clock — timestamps are passed in by the caller.

import type {
  RuntimeCalculationSnapshot,
} from "@power-system-study/solver-adapter";

import type {
  CalculationModule,
  RuntimeCalculationBundle,
  RuntimeCalculationRecord,
  RuntimeResultRetentionKey,
  RuntimeSnapshotRecord,
  RuntimeSnapshotRetentionReason,
} from "./types.js";

/**
 * Module identifier for the Load Flow + Voltage Drop bundle.
 * Both modules ride the same `LoadFlowRunBundle` (spec §S2-OQ-05) so
 * Stage 2 MVP retains the bundle as a unit under this single key.
 */
export const LOAD_FLOW_BUNDLE_MODULE: CalculationModule = "load_flow_bundle";

/**
 * Module identifier for the Short Circuit bundle (Stage 3 PR #4 / spec
 * §8.2). Distinct from the result-API discriminator
 * `ShortCircuitResult.module = "shortCircuit"` (spec §7.2): both
 * identify the Short Circuit calculation but live on different APIs.
 */
export const SHORT_CIRCUIT_BUNDLE_MODULE: CalculationModule =
  "short_circuit_bundle";

/**
 * Build the canonical retention key string used to index
 * `CalculationStoreState.retainedResults`. Stable, JSON-safe, and
 * stringifiable so test snapshots compare cleanly.
 *
 * Format: `<module>::<scenarioId|"_">::<subCase|"_">` — colons are
 * disallowed in scenarioId / subCase elsewhere in the spec, so the
 * delimiter is unambiguous.
 */
export function retentionKeyToString(key: RuntimeResultRetentionKey): string {
  const scenario = key.scenarioId ?? "_";
  const subCase = key.subCase ?? "_";
  return `${key.module}::${scenario}::${subCase}`;
}

/**
 * Type-narrowing predicate: a runtime bundle is a Short Circuit bundle
 * when it carries the `shortCircuit` field (the discriminator on the
 * runtime side; the calculation-store has no other way to tell two
 * bundles apart without importing the `ShortCircuitRunBundle` type
 * itself).
 *
 * This is the same shape `runShortCircuitForAppNetwork()` returns
 * (spec §7.2). The reducer uses it to derive the retention key when
 * the caller did not pass an explicit `module`.
 */
function isShortCircuitBundle(
  bundle: RuntimeCalculationBundle,
): bundle is Extract<RuntimeCalculationBundle, { shortCircuit: unknown }> {
  return (
    typeof (bundle as { shortCircuit?: unknown }).shortCircuit === "object" &&
    (bundle as { shortCircuit?: unknown }).shortCircuit !== null
  );
}

/**
 * Default module for a runtime bundle. Stage 3 PR #4 derives the
 * module from the bundle's discriminator so callers can omit the
 * explicit `module` argument when retaining a freshly produced run.
 */
function defaultModuleForBundle(
  bundle: RuntimeCalculationBundle,
): CalculationModule {
  return isShortCircuitBundle(bundle)
    ? SHORT_CIRCUIT_BUNDLE_MODULE
    : LOAD_FLOW_BUNDLE_MODULE;
}

/**
 * Derive the canonical retention key for a runtime bundle. The
 * `module` defaults to whichever module discriminator the bundle
 * carries (`LoadFlowRunBundle` → `"load_flow_bundle"`,
 * `ShortCircuitRunBundle` → `"short_circuit_bundle"`); callers may
 * override it for sub-case retention in a later stage.
 */
export function deriveRetentionKey(
  bundle: RuntimeCalculationBundle,
  module: CalculationModule = defaultModuleForBundle(bundle),
  subCase: string | null = null,
): RuntimeResultRetentionKey {
  return {
    scenarioId: bundle.snapshot.scenarioId,
    module,
    subCase,
  };
}

/**
 * Build a fresh `RuntimeCalculationRecord` ready to be inserted into
 * `retainedResults`. The record is born non-stale — `markStale()`
 * flips it later when the project changes.
 */
export function makeCalculationRecord(args: {
  bundle: RuntimeCalculationBundle;
  build: RuntimeCalculationRecord["build"];
  recordedAt: string;
  module?: CalculationModule;
  subCase?: string | null;
}): RuntimeCalculationRecord {
  const key = deriveRetentionKey(
    args.bundle,
    args.module ?? defaultModuleForBundle(args.bundle),
    args.subCase ?? null,
  );
  return {
    key,
    bundle: args.bundle,
    build: args.build,
    recordedAt: args.recordedAt,
    stale: false,
  };
}

/**
 * Replace (or insert) the retained record for the given key. Spec
 * §10.5: Stage 2 MVP keeps at most one successful result per key, so
 * any prior record under the same key is dropped.
 */
export function retainResult(
  retainedResults: Record<string, RuntimeCalculationRecord>,
  record: RuntimeCalculationRecord,
): Record<string, RuntimeCalculationRecord> {
  return {
    ...retainedResults,
    [retentionKeyToString(record.key)]: record,
  };
}

/**
 * Build a fresh `RuntimeSnapshotRecord` for the latest failed run.
 * The snapshot is captured by reference; the bundle that produced it
 * already deep-cloned the AppNetwork / SolverInput so subsequent
 * mutation of the caller's data does not change the stored record.
 */
export function makeFailedSnapshotRecord(args: {
  snapshot: RuntimeCalculationSnapshot;
  recordedAt: string;
  reason: RuntimeSnapshotRetentionReason;
  build: RuntimeSnapshotRecord["build"];
  message: string;
}): RuntimeSnapshotRecord {
  return {
    snapshot: args.snapshot,
    recordedAt: args.recordedAt,
    reason: args.reason,
    build: args.build,
    message: args.message,
  };
}

/**
 * Mark every retained record stale. Called by the reducer when a
 * project edit fires `markStale` — Stage 2 MVP does not currently
 * track per-scenario invalidation because every project edit
 * replaces the project ref wholesale, but the helper is shaped so a
 * later precision pass can mark just one key.
 *
 * Returns the same record map reference when nothing changed, so
 * callers can use `===` to short-circuit downstream re-renders.
 */
export function markAllRetainedStale(
  retainedResults: Record<string, RuntimeCalculationRecord>,
): Record<string, RuntimeCalculationRecord> {
  let touched = false;
  const next: Record<string, RuntimeCalculationRecord> = {};
  for (const [k, rec] of Object.entries(retainedResults)) {
    if (rec.stale) {
      next[k] = rec;
      continue;
    }
    next[k] = { ...rec, stale: true };
    touched = true;
  }
  return touched ? next : retainedResults;
}
