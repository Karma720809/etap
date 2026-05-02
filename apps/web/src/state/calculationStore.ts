// Stage 2 PR #5 — Runtime Calculation store.
//
// Holds the runtime LoadFlowRunBundle (Load Flow + Voltage Drop) and
// the run lifecycle status. The store is **runtime-only** by design:
//
//   - Nothing here is serialized into the canonical project file.
//     The project store (`projectStore.ts`) owns
//     `PowerSystemProjectFile` only; results live in this separate
//     store so a result can never accidentally leak into the saved
//     JSON. Spec §10 / §17 / S2-OQ-06 guardrail.
//   - Stale tracking is best-effort: when the project changes, the
//     store marks the latest result `stale=true` and `status="stale"`.
//     We do not re-run automatically; the user re-runs explicitly.
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
import type { ValidationSummary } from "@power-system-study/schemas";

import { useProjectState } from "./projectStore.js";

export type CalculationLifecycle =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "stale";

export interface CalculationStoreState {
  lifecycle: CalculationLifecycle;
  bundle: LoadFlowRunBundle | null;
  /** Last network-build result (used to surface E-NET-* readiness issues). */
  build: NetworkBuildResult | null;
  /** ISO timestamp the latest run started or completed. */
  lastRunAt: string | null;
  /** Top-level error message when the run could not start (e.g., no transport). */
  startError: string | null;
}

export const initialCalculationState: CalculationStoreState = {
  lifecycle: "idle",
  bundle: null,
  build: null,
  lastRunAt: null,
  startError: null,
};

type CalculationAction =
  | { type: "runStarted"; at: string }
  | { type: "runFinished"; bundle: LoadFlowRunBundle; build: NetworkBuildResult; at: string }
  | { type: "runFailed"; message: string; at: string }
  | { type: "markStale" }
  | { type: "reset" };

function calculationReducer(
  state: CalculationStoreState,
  action: CalculationAction,
): CalculationStoreState {
  switch (action.type) {
    case "runStarted":
      return { ...state, lifecycle: "running", lastRunAt: action.at, startError: null };
    case "runFinished":
      return {
        lifecycle: action.bundle.loadFlow.status === "failed" ? "failed" : "succeeded",
        bundle: action.bundle,
        build: action.build,
        lastRunAt: action.at,
        startError: null,
      };
    case "runFailed":
      return {
        ...state,
        lifecycle: "failed",
        startError: action.message,
        lastRunAt: action.at,
      };
    case "markStale":
      if (state.bundle === null || state.lifecycle === "stale") return state;
      return { ...state, lifecycle: "stale" };
    case "reset":
      return initialCalculationState;
  }
}

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
  const [state, dispatch] = useReducer(calculationReducer, initialCalculationState);
  const lastProjectRef = useRef(projectState.project);
  const nowFn = now ?? (() => new Date().toISOString());

  // Stale tracking: when the project ref changes, mark the result stale.
  // We do not auto-rerun. Cosmetic-only edits still flip the project ref,
  // but PR #5 keeps the policy conservative — re-runs are cheap on small
  // networks and the user has explicit Run control.
  if (lastProjectRef.current !== projectState.project) {
    lastProjectRef.current = projectState.project;
    if (state.bundle !== null && state.lifecycle !== "stale") {
      // Defer to next render via dispatch; calling dispatch in render is
      // safe in React when the action is idempotent and the reducer is
      // pure, but we follow the framework rule and dispatch via effect-
      // like handler. Use queueMicrotask to avoid the warning.
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
      const build = buildAppNetwork(projectState.project);
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
        });
        return;
      }
      const bundle = await runLoadFlowForAppNetwork(build.appNetwork, {
        transport,
        projectId: projectState.project.project.projectId,
      });
      dispatch({ type: "runFinished", bundle, build, at: nowFn() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: "runFailed", message, at: nowFn() });
    }
  }, [transport, projectState.project, nowFn]);

  const resetCalculation = useCallback(() => {
    dispatch({ type: "reset" });
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
