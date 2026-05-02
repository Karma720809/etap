// Stage 2 PR #6 — `@power-system-study/calculation-store` public surface.
//
// Runtime-only store package extracted from
// `apps/web/src/state/calculationStore.ts` (Stage 2 PR #5). Houses:
//
//   - Runtime types (CalculationStoreState, CalculationLifecycle,
//     RuntimeCalculationRecord, RuntimeResultRetentionKey,
//     RuntimeSnapshotRecord).
//   - The pure reducer + action vocabulary
//     (`calculationReducer`, `CalculationAction`).
//   - Retention helpers (`deriveRetentionKey`, `retentionKeyToString`,
//     `retainResult`, `markAllRetainedStale`, …).
//
// Stage 2 guardrails honored:
//   - Nothing here writes to disk or to the Stage 1 canonical project
//     file. The package depends on `solver-adapter` and
//     `network-model` for *types only*; it is safe to import from a
//     browser bundle as well as Node tests.
//   - The retention rules are spec-§9.5 / §10.5 / OQ-15: latest
//     successful per `(scenarioId, module, subCase)` and latest
//     failed snapshot for audit. Disk persistence remains deferred
//     (S2-FU-07).

export {
  initialCalculationStoreState,
  type CalculationLifecycle,
  type CalculationModule,
  type CalculationStoreState,
  type RuntimeCalculationRecord,
  type RuntimeResultRetentionKey,
  type RuntimeSnapshotRecord,
  type RuntimeSnapshotRetentionReason,
} from "./types.js";

export {
  calculationReducer,
  type CalculationAction,
} from "./reducer.js";

export {
  LOAD_FLOW_BUNDLE_MODULE,
  deriveRetentionKey,
  makeCalculationRecord,
  makeFailedSnapshotRecord,
  markAllRetainedStale,
  retainResult,
  retentionKeyToString,
} from "./retention.js";
