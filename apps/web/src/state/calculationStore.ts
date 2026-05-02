// Stage 2 PR #5 — Runtime Calculation store wiring (PR #6 refactor).
//
// PR #5 introduced this React-side store that holds the runtime
// `LoadFlowRunBundle` outside the canonical project file. PR #6
// extracts the type / reducer / retention rules into
// `@power-system-study/calculation-store` so the same logic can be
// reused outside React. This file now only owns the React glue:
// provider, transport injection, project-edit stale detection, and
// the readiness-driven `disabledReason` text.
//
// Guardrails preserved (spec §10 / §17 / S2-OQ-06):
//   - The runtime bundle is held outside `PowerSystemProjectFile`.
//     The serialized JSON does not grow `calculationResults`, and the
//     project file's `calculationSnapshots` array stays empty.
//   - Stale tracking is best-effort: when the project ref changes,
//     the store dispatches `markStale`. We do not auto-rerun.
//   - The transport that talks to the Python sidecar is **injected**
//     at the React root. In tests we inject a stub. In a real desktop
//     build the StdioSidecarTransport from solver-adapter is the
//     intended choice. In a plain browser build no transport is
//     configured and the Run button disables itself with a clear
//     message — this PR does not ship a browser↔sidecar bridge.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
  createElement,
} from "react";
import {
  buildAppNetwork,
  type NetworkBuildResult,
} from "@power-system-study/network-model";
import {
  runLoadFlowForAppNetwork,
  type LoadFlowRunBundle,
  type SidecarTransport,
} from "@power-system-study/solver-adapter";
import {
  calculationReducer,
  initialCalculationStoreState,
  type CalculationAction,
  type CalculationLifecycle,
  type CalculationStoreState,
} from "@power-system-study/calculation-store";
import type { ValidationSummary } from "@power-system-study/schemas";

import { useProjectState } from "./projectStore.js";

// Re-export the runtime types from the calculation-store package so
// existing imports in components / tests keep working without a
// downstream rename. This file is the React adapter for the
// underlying runtime store.
export type {
  CalculationAction,
  CalculationLifecycle,
  CalculationStoreState,
};
export { initialCalculationStoreState as initialCalculationState };

export interface CalculationContextValue {
  state: CalculationStoreState;
  /** True when readiness allows the user to click Run. */
  canRun: boolean;
  /** Reason the Run button is disabled, when applicable. */
  disabledReason: string | null;
  /** Trigger the Run path. Resolves once the bundle settles or the run errors out. */
  runCalculation: () => Promise<void>;
  resetCalculation: () => void;
}

const CalculationContext = createContext<CalculationContextValue | null>(null);

export interface CalculationProviderProps {
  children: ReactNode;
  /**
   * Validation summary to consult for readiness gating. Provided by
   * the parent (the bottom panel computes it once per render and
   * passes it both to ValidationPanel and here).
   */
  validation: ValidationSummary;
  /**
   * Solver transport. When omitted, the Run button is disabled with
   * an explanation. Tests inject a stub transport; a desktop wrapper
   * would inject `new StdioSidecarTransport()`.
   */
  transport?: SidecarTransport | null;
  /** Stable timestamp generator for tests. Defaults to `() => new Date().toISOString()`. */
  now?: () => string;
}

export function CalculationProvider({
  children,
  validation,
  transport,
  now,
}: CalculationProviderProps) {
  const { state: projectState } = useProjectState();
  const [state, dispatch] = useReducer(
    calculationReducer,
    initialCalculationStoreState,
  );
  const lastProjectRef = useRef(projectState.project);
  const nowFn = now ?? (() => new Date().toISOString());

  // Stale tracking: when the project ref changes, mark the result
  // stale. Cosmetic-only edits still flip the project ref, but we
  // keep the policy conservative — re-runs are cheap on small
  // networks and the user has explicit Run control.
  if (lastProjectRef.current !== projectState.project) {
    lastProjectRef.current = projectState.project;
    if (state.bundle !== null && state.lifecycle !== "stale") {
      // Defer to next render; calling dispatch in render is safe in
      // React when the reducer is pure and the action is idempotent,
      // but we follow the framework rule and dispatch via
      // queueMicrotask to avoid the warning.
      queueMicrotask(() => dispatch({ type: "markStale" }));
    }
  }

  const errorIssues = useMemo(
    () => validation.issues.filter((i) => i.severity === "error"),
    [validation.issues],
  );
  const hasValidationErrors = errorIssues.length > 0;

  const disabledReason = useMemo<string | null>(() => {
    if (state.lifecycle === "running") return "A calculation run is already in progress.";
    if (hasValidationErrors) {
      const n = errorIssues.length;
      return `Fix ${n} validation error${n === 1 ? "" : "s"} before running.`;
    }
    if (!transport) {
      return "Solver transport is not configured in this build. Wire a SidecarTransport to enable runs.";
    }
    return null;
  }, [state.lifecycle, hasValidationErrors, errorIssues.length, transport]);

  const canRun = disabledReason === null;

  const runCalculation = useCallback(async () => {
    if (!transport) {
      dispatch({
        type: "runFailed",
        message: "No solver transport configured.",
        at: nowFn(),
      });
      return;
    }
    dispatch({ type: "runStarted", at: nowFn() });
    try {
      const build: NetworkBuildResult = buildAppNetwork(projectState.project);
      if (build.appNetwork === null) {
        // Network construction failed before the sidecar would have been
        // called. Surface the first network issue as the run-start error
        // so the UI shows a real diagnostic instead of silently doing
        // nothing.
        const first = build.issues[0];
        dispatch({
          type: "runFailed",
          message: first
            ? `${first.code}: ${first.message}`
            : "AppNetwork construction failed.",
          at: nowFn(),
          build,
          reason: "validation_failure",
        });
        return;
      }
      const bundle: LoadFlowRunBundle = await runLoadFlowForAppNetwork(
        build.appNetwork,
        {
          transport,
          projectId: projectState.project.project.projectId,
        },
      );
      const at = nowFn();
      // Spec §10.2: a failed loadFlow still ships a real bundle with
      // a real snapshot. Route through `runFailed` so the snapshot
      // gets retained for audit (PR #6 retention rule §10.5).
      if (bundle.loadFlow.status === "failed") {
        const firstError = bundle.loadFlow.issues.find((i) => i.severity === "error");
        dispatch({
          type: "runFailed",
          at,
          message: firstError
            ? `${firstError.code}: ${firstError.message}`
            : "Load Flow failed.",
          bundle,
          build,
          reason: "runtime_failure",
        });
      } else {
        dispatch({ type: "runSucceeded", bundle, build, at });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: "runFailed", message, at: nowFn() });
    }
  }, [transport, projectState.project, nowFn]);

  const resetCalculation = useCallback(() => {
    dispatch({ type: "clearResults" });
  }, []);

  const value = useMemo<CalculationContextValue>(
    () => ({ state, canRun, disabledReason, runCalculation, resetCalculation }),
    [state, canRun, disabledReason, runCalculation, resetCalculation],
  );

  return createElement(CalculationContext.Provider, { value }, children);
}

export function useCalculation(): CalculationContextValue {
  const ctx = useContext(CalculationContext);
  if (!ctx) {
    throw new Error("useCalculation must be used inside CalculationProvider");
  }
  return ctx;
}

export type CalculationDispatch = Dispatch<CalculationAction>;
