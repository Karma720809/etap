// Stage 2 PR #6 — Calculation store reducer.
//
// Pure reducer that owns the calculation lifecycle plus the PR #6
// retention rules (latest successful per key, latest failed snapshot
// for audit, stale flip on project edit). The reducer is React-free
// — `apps/web` wraps it in `useReducer`, but a CLI / desktop / test
// harness can drive it directly.
//
// Design choices:
//   - Action vocabulary follows the spec §10.5 narration:
//       runStarted   — solver call about to fire
//       runSucceeded — bundle returned, loadFlow.status !== "failed"
//       runFailed    — pre-bundle error OR loadFlow.status === "failed"
//       markStale    — project edit invalidates the latest result
//       clearResults — user discards retained state
//   - Every action carries `at` so the reducer never reads a clock.
//     Tests pin timestamps, the orchestrator passes
//     `new Date().toISOString()`.
//   - `runFailed` accepts an optional bundle/build/snapshot trio so
//     the orchestrator can hand over the snapshot from a failed
//     `LoadFlowRunBundle` (loadFlow.status === "failed" still ships a
//     real snapshot per spec §10.2). When neither is supplied — the
//     pre-bundle "no transport" path — only the active lifecycle is
//     updated; nothing is retained.

import type { NetworkBuildResult } from "@power-system-study/network-model";
import type {
  LoadFlowRunBundle,
  RuntimeCalculationSnapshot,
} from "@power-system-study/solver-adapter";

import {
  makeCalculationRecord,
  makeFailedSnapshotRecord,
  markAllRetainedStale,
  retainResult,
} from "./retention.js";
import type {
  CalculationStoreState,
  RuntimeSnapshotRetentionReason,
} from "./types.js";

export type CalculationAction =
  | { type: "runStarted"; at: string }
  | {
      type: "runSucceeded";
      bundle: LoadFlowRunBundle;
      build: NetworkBuildResult;
      at: string;
    }
  | {
      type: "runFailed";
      at: string;
      message: string;
      /**
       * Bundle returned by the orchestrator when the failure was a
       * solver-level outcome (`loadFlow.status === "failed"`). Omitted
       * when the failure happened before the solver was called (e.g.,
       * no transport configured, network build invalid).
       */
      bundle?: LoadFlowRunBundle;
      build?: NetworkBuildResult | null;
      /**
       * Optional explicit snapshot override. Defaults to
       * `bundle.snapshot` when a bundle is provided. Useful when a
       * caller has a snapshot from a path that did not produce a
       * full bundle.
       */
      snapshot?: RuntimeCalculationSnapshot;
      reason?: RuntimeSnapshotRetentionReason;
    }
  | { type: "markStale" }
  | { type: "clearResults" };

export function calculationReducer(
  state: CalculationStoreState,
  action: CalculationAction,
): CalculationStoreState {
  switch (action.type) {
    case "runStarted":
      return {
        ...state,
        lifecycle: "running",
        lastRunAt: action.at,
        startError: null,
      };

    case "runSucceeded": {
      // Spec §10.2: the bundle's loadFlow may still report status
      // "warning" — that's a successful run with non-fatal issues.
      // Only "failed" routes through `runFailed`.
      const failed = action.bundle.loadFlow.status === "failed";
      if (failed) {
        // Defensive: the orchestrator should dispatch `runFailed` for
        // failed loadFlows. Treat a misrouted dispatch as a failure
        // rather than silently retain a failed bundle as a success.
        return applyRunFailed(state, {
          type: "runFailed",
          at: action.at,
          message: firstErrorMessage(action.bundle) ?? "Load Flow failed.",
          bundle: action.bundle,
          build: action.build,
          reason: "runtime_failure",
        });
      }
      const record = makeCalculationRecord({
        bundle: action.bundle,
        build: action.build,
        recordedAt: action.at,
      });
      return {
        ...state,
        lifecycle: "succeeded",
        bundle: action.bundle,
        build: action.build,
        lastRunAt: action.at,
        startError: null,
        retainedResults: retainResult(state.retainedResults, record),
      };
    }

    case "runFailed":
      return applyRunFailed(state, action);

    case "markStale": {
      const nextRetained = markAllRetainedStale(state.retainedResults);
      const lifecycleNeedsFlip =
        state.bundle !== null && state.lifecycle !== "stale";
      if (!lifecycleNeedsFlip && nextRetained === state.retainedResults) {
        return state;
      }
      return {
        ...state,
        lifecycle: lifecycleNeedsFlip ? "stale" : state.lifecycle,
        retainedResults: nextRetained,
      };
    }

    case "clearResults":
      return {
        lifecycle: "idle",
        bundle: null,
        build: null,
        lastRunAt: null,
        startError: null,
        retainedResults: {},
        lastFailedSnapshot: null,
      };
  }
}

function applyRunFailed(
  state: CalculationStoreState,
  action: Extract<CalculationAction, { type: "runFailed" }>,
): CalculationStoreState {
  const snapshot = action.snapshot ?? action.bundle?.snapshot ?? null;
  const lastFailedSnapshot = snapshot
    ? makeFailedSnapshotRecord({
        snapshot,
        recordedAt: action.at,
        reason: action.reason ?? "runtime_failure",
        build: action.build ?? null,
        message: action.message,
      })
    : state.lastFailedSnapshot;

  return {
    ...state,
    lifecycle: "failed",
    // When a failed bundle is supplied, surface it so the UI can show
    // the structured failure issues instead of a blank result panel.
    // Pre-bundle failures leave the previous bundle in place — the
    // start-error string is the user-visible signal in that path.
    ...(action.bundle !== undefined ? { bundle: action.bundle } : {}),
    ...(action.build !== undefined ? { build: action.build } : {}),
    lastRunAt: action.at,
    startError: action.message,
    lastFailedSnapshot,
  };
}

function firstErrorMessage(bundle: LoadFlowRunBundle): string | null {
  for (const issue of bundle.loadFlow.issues) {
    if (issue.severity === "error") {
      return `${issue.code}: ${issue.message}`;
    }
  }
  return null;
}
