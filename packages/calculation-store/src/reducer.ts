// Stage 2 PR #6 — Calculation store reducer.
// Stage 3 PR #4 — widened to handle `ShortCircuitRunBundle` retention
// alongside the existing `LoadFlowRunBundle`.
//
// Pure reducer that owns the calculation lifecycle plus the retention
// rules (latest successful per key, latest failed snapshot for audit,
// stale flip on project edit). The reducer is React-free — `apps/web`
// wraps it in `useReducer`, but a CLI / desktop / test harness can
// drive it directly.
//
// Design choices:
//   - Action vocabulary follows the spec §10.5 narration:
//       runStarted   — solver call about to fire
//       runSucceeded — bundle returned, top-level status !== "failed"
//       runFailed    — pre-bundle error OR bundle status === "failed"
//       markStale    — project edit invalidates the latest result
//       clearResults — user discards retained state
//   - Every action carries `at` so the reducer never reads a clock.
//     Tests pin timestamps, the orchestrator passes
//     `new Date().toISOString()`.
//   - `runFailed` accepts an optional bundle/build/snapshot trio so
//     the orchestrator can hand over the snapshot from a failed
//     bundle (failed runs still ship a real snapshot per spec §10.2).
//     When neither is supplied — the pre-bundle "no transport" path —
//     only the active lifecycle is updated; nothing is retained.
//   - The bundle's discriminator (`loadFlow` vs `shortCircuit`) drives
//     both the failed-status check and the retention key derivation.

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
  RuntimeCalculationBundle,
  RuntimeSnapshotRetentionReason,
} from "./types.js";

/**
 * Narrowing helper: the active store slot
 * `CalculationStoreState.bundle` keeps the Stage 2 narrow type
 * (`LoadFlowRunBundle | null`) so the existing UI does not have to
 * narrow on every read. Stage 3 Short Circuit bundles flow through
 * the action vocabulary into `retainedResults` (the union-typed slot)
 * but do not occupy this active slot until Stage 3 PR #5 wires up
 * dedicated SC UI.
 */
function isLoadFlowBundle(
  bundle: RuntimeCalculationBundle,
): bundle is LoadFlowRunBundle {
  return "loadFlow" in bundle;
}

export type CalculationAction =
  | { type: "runStarted"; at: string }
  | {
      type: "runSucceeded";
      bundle: RuntimeCalculationBundle;
      build: NetworkBuildResult;
      at: string;
    }
  | {
      type: "runFailed";
      at: string;
      message: string;
      /**
       * Bundle returned by the orchestrator when the failure was a
       * solver-level outcome (top-level `status === "failed"`). Omitted
       * when the failure happened before the solver was called (e.g.,
       * no transport configured, network build invalid).
       */
      bundle?: RuntimeCalculationBundle;
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
      // Spec §10.2 / §7.5.3: a non-failed top-level status ("valid" /
      // "warning") is a successful run with possibly non-fatal issues.
      // Only "failed" routes through `runFailed`.
      const failed = isBundleFailed(action.bundle);
      if (failed) {
        // Defensive: the orchestrator should dispatch `runFailed` for
        // failed bundles. Treat a misrouted dispatch as a failure
        // rather than silently retain a failed bundle as a success.
        return applyRunFailed(state, {
          type: "runFailed",
          at: action.at,
          message:
            firstErrorMessage(action.bundle) ??
            defaultFailedMessage(action.bundle),
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
      // The active `bundle` slot is narrow (LoadFlowRunBundle | null)
      // so that the Stage 2 UI continues to read `bundle.loadFlow`
      // without narrowing. Short Circuit successes are retained but do
      // not displace the active LF slot — Stage 3 PR #5 will introduce
      // the dedicated active slot for SC.
      const activeSlot = isLoadFlowBundle(action.bundle)
        ? { bundle: action.bundle, build: action.build }
        : {};
      return {
        ...state,
        lifecycle: "succeeded",
        ...activeSlot,
        lastRunAt: action.at,
        startError: null,
        retainedResults: retainResult(state.retainedResults, record),
      };
    }

    case "runFailed":
      return applyRunFailed(state, action);

    case "markStale": {
      // Stage 3 PR #4 — intentional asymmetry between
      // `state.lifecycle` and `retainedResults` staleness:
      //
      // The top-level `state.lifecycle` is tied to the LF-narrow active
      // `state.bundle` slot. It only flips to `"stale"` when the active
      // LF panel currently shows a result (i.e., `state.bundle !== null`).
      // A short-circuit-only success leaves the active LF slot at
      // `null` (Stage 3 PR #5 wires up the dedicated SC active slot),
      // so `state.lifecycle` legitimately stays at `"succeeded"` after
      // a project edit even though the retained SC record's stale flag
      // flips. The retained-records flag is the source of truth for
      // staleness in the multi-module retention world; the lifecycle
      // is the LF-active-slot signal until PR #5 introduces a parallel
      // SC lifecycle slot.
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

  // Same narrow-slot rule as `runSucceeded`: only Load Flow bundles
  // displace the Stage 2 active `bundle` slot. Failed Short Circuit
  // bundles still land on `lastFailedSnapshot` for audit, but leave
  // the active LF panel untouched.
  const activeOverride =
    action.bundle !== undefined && isLoadFlowBundle(action.bundle)
      ? { bundle: action.bundle }
      : {};
  return {
    ...state,
    lifecycle: "failed",
    // When a failed Load Flow bundle is supplied, surface it so the UI
    // can show the structured failure issues instead of a blank result
    // panel. Pre-bundle failures leave the previous bundle in place —
    // the start-error string is the user-visible signal in that path.
    ...activeOverride,
    ...(action.build !== undefined ? { build: action.build } : {}),
    lastRunAt: action.at,
    startError: action.message,
    lastFailedSnapshot,
  };
}

/**
 * Discriminator helper: read the top-level status off whichever
 * runtime bundle was supplied. Mirrors the in-memory shapes returned
 * by `runLoadFlowForAppNetwork()`, `runShortCircuitForAppNetwork()`,
 * and `runDutyCheckForBundle()` — the calculation-store package
 * itself does not import the bundle types directly to keep the
 * dependency surface narrow.
 *
 * The duty-check bundle carries both `dutyCheck` AND `shortCircuit`
 * (the latter is the upstream SC bundle it consumed), so the probe
 * order matters: `dutyCheck` first, then `loadFlow`, then
 * `shortCircuit` as the residual.
 */
function isBundleFailed(bundle: RuntimeCalculationBundle): boolean {
  if ("dutyCheck" in bundle) {
    return bundle.dutyCheck.status === "failed";
  }
  if ("loadFlow" in bundle) {
    return bundle.loadFlow.status === "failed";
  }
  return bundle.shortCircuit.status === "failed";
}

function firstErrorMessage(bundle: RuntimeCalculationBundle): string | null {
  const issues = bundleIssues(bundle);
  for (const issue of issues) {
    if (issue.severity === "error") {
      return `${issue.code}: ${issue.message}`;
    }
  }
  return null;
}

function bundleIssues(
  bundle: RuntimeCalculationBundle,
): ReadonlyArray<{ code: string; severity: string; message: string }> {
  if ("dutyCheck" in bundle) return bundle.dutyCheck.issues;
  if ("loadFlow" in bundle) return bundle.loadFlow.issues;
  return bundle.shortCircuit.issues;
}

function defaultFailedMessage(bundle: RuntimeCalculationBundle): string {
  if ("dutyCheck" in bundle) return "Equipment Duty failed.";
  if ("loadFlow" in bundle) return "Load Flow failed.";
  return "Short Circuit failed.";
}
