// Stage 2 PR #5 — Runtime Calculation store wiring (PR #6 refactor).
// Stage 3 PR #5 — added a parallel Short Circuit active slot + run path.
//
// PR #5 introduced this React-side store that holds the runtime
// `LoadFlowRunBundle` outside the canonical project file. PR #6
// extracts the type / reducer / retention rules into
// `@power-system-study/calculation-store` so the same logic can be
// reused outside React. This file owns the React glue: provider,
// transport injection, project-edit stale detection, and the
// readiness-driven `disabledReason` text.
//
// Stage 3 PR #5 adds a Short Circuit active slot. The underlying
// `calculation-store` reducer's `state.bundle` slot is intentionally
// LF-narrow (spec §8.2.1) — Short Circuit successes still flow
// through `runSucceeded` so the calculation-store reducer retains
// them under the `short_circuit_bundle` key, but they do not displace
// the active LF slot. The React layer keeps its own SC lifecycle
// state so the panel and result table can render Short Circuit
// without the underlying store package growing a second active slot.
//
// Guardrails preserved (spec §10 / §17 / S2-OQ-06 / S3-OQ-09):
//   - The runtime bundles are held outside `PowerSystemProjectFile`.
//     The serialized JSON does not grow `calculationResults`, and the
//     project file's `calculationSnapshots` array stays empty.
//   - Stale tracking is best-effort: when the project ref changes,
//     the store dispatches `markStale` and flips the React-side SC
//     lifecycle to `"stale"`. We do not auto-rerun.
//   - The transport that talks to the Python sidecar is **injected**
//     at the React root. In tests we inject a stub. In a real desktop
//     build the StdioSidecarTransport from solver-adapter is the
//     intended choice. In a plain browser build no transport is
//     configured and the Run buttons disable themselves with a clear
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
  runShortCircuitForAppNetwork,
  type LoadFlowRunBundle,
  type RuntimeValidationSummary,
  type ShortCircuitRunBundle,
  type SidecarTransport,
} from "@power-system-study/solver-adapter";
import {
  calculationReducer,
  initialCalculationStoreState,
  type CalculationAction,
  type CalculationLifecycle,
  type CalculationStoreState,
} from "@power-system-study/calculation-store";
import {
  evaluateDutyCheckReadiness,
  runDutyCheckForBundle,
  type DutyCheckReadinessResult,
  type DutyCheckRunBundle,
} from "@power-system-study/duty-check";
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

/**
 * Lifecycle of the React-side Short Circuit active slot. Mirrors the
 * `CalculationLifecycle` vocabulary used for Load Flow but tracks the
 * SC run independently (spec §8.2.1 — the SC active slot is a React-
 * side parallel of the LF-narrow store slot).
 */
export type ShortCircuitLifecycle =
  | "idle"
  | "running"
  | "succeeded"
  | "warning"
  | "failed"
  | "stale";

/** React-side Short Circuit active state. Held outside the project file. */
export interface ShortCircuitState {
  lifecycle: ShortCircuitLifecycle;
  /** Latest active SC bundle. `null` until a real run has happened. */
  bundle: ShortCircuitRunBundle | null;
  /** Network build for the active SC bundle. */
  build: NetworkBuildResult | null;
  /** Top-level error when the SC run could not start (e.g., no transport). */
  startError: string | null;
  /** ISO timestamp of the latest SC run. */
  lastRunAt: string | null;
}

const initialShortCircuitState: ShortCircuitState = {
  lifecycle: "idle",
  bundle: null,
  build: null,
  startError: null,
  lastRunAt: null,
};

type ShortCircuitAction =
  | { type: "scStarted"; at: string }
  | {
      type: "scSucceeded";
      bundle: ShortCircuitRunBundle;
      build: NetworkBuildResult;
      at: string;
      /** Top-level SC status: "valid" | "warning" → succeeded/warning lifecycle. */
      finalStatus: "valid" | "warning";
    }
  | {
      type: "scFailed";
      at: string;
      message: string;
      bundle?: ShortCircuitRunBundle;
      build?: NetworkBuildResult | null;
    }
  | { type: "scMarkStale" }
  | { type: "scClear" };

function shortCircuitReducer(
  state: ShortCircuitState,
  action: ShortCircuitAction,
): ShortCircuitState {
  switch (action.type) {
    case "scStarted":
      return {
        ...state,
        lifecycle: "running",
        lastRunAt: action.at,
        startError: null,
      };
    case "scSucceeded":
      return {
        ...state,
        lifecycle: action.finalStatus === "warning" ? "warning" : "succeeded",
        bundle: action.bundle,
        build: action.build,
        startError: null,
        lastRunAt: action.at,
      };
    case "scFailed":
      return {
        ...state,
        lifecycle: "failed",
        ...(action.bundle !== undefined ? { bundle: action.bundle } : {}),
        ...(action.build !== undefined ? { build: action.build } : {}),
        startError: action.message,
        lastRunAt: action.at,
      };
    case "scMarkStale":
      // Only flip to stale when there was an active SC bundle to mark
      // as stale. Idempotent — already-stale state is preserved.
      if (state.bundle === null || state.lifecycle === "stale") return state;
      return { ...state, lifecycle: "stale" };
    case "scClear":
      return initialShortCircuitState;
  }
}

/**
 * Lifecycle of the React-side Duty Check active slot. Mirrors the
 * Short Circuit slot: Equipment Duty has no sidecar, so the run
 * itself is synchronous, but the slot still tracks idle / running /
 * succeeded / warning / failed / stale so the UI can render a
 * consistent module status (Equipment Duty spec §4.6).
 */
export type DutyCheckLifecycle =
  | "idle"
  | "running"
  | "succeeded"
  | "warning"
  | "failed"
  | "stale";

/** React-side Duty Check active state. Held outside the project file. */
export interface DutyCheckState {
  lifecycle: DutyCheckLifecycle;
  /** Latest active duty bundle. `null` until a real run has happened. */
  bundle: DutyCheckRunBundle | null;
  /** Top-level error when the duty run could not start (e.g., readiness blocked). */
  startError: string | null;
  /** ISO timestamp of the latest duty run. */
  lastRunAt: string | null;
}

const initialDutyCheckState: DutyCheckState = {
  lifecycle: "idle",
  bundle: null,
  startError: null,
  lastRunAt: null,
};

type DutyCheckAction =
  | { type: "dcStarted"; at: string }
  | {
      type: "dcSucceeded";
      bundle: DutyCheckRunBundle;
      at: string;
      finalStatus: "valid" | "warning";
    }
  | {
      type: "dcFailed";
      at: string;
      message: string;
      bundle?: DutyCheckRunBundle;
    }
  | { type: "dcMarkStale" }
  | { type: "dcClear" };

function dutyCheckReducer(
  state: DutyCheckState,
  action: DutyCheckAction,
): DutyCheckState {
  switch (action.type) {
    case "dcStarted":
      return {
        ...state,
        lifecycle: "running",
        lastRunAt: action.at,
        startError: null,
      };
    case "dcSucceeded":
      return {
        ...state,
        lifecycle: action.finalStatus === "warning" ? "warning" : "succeeded",
        bundle: action.bundle,
        startError: null,
        lastRunAt: action.at,
      };
    case "dcFailed":
      return {
        ...state,
        lifecycle: "failed",
        ...(action.bundle !== undefined ? { bundle: action.bundle } : {}),
        startError: action.message,
        lastRunAt: action.at,
      };
    case "dcMarkStale":
      if (state.bundle === null || state.lifecycle === "stale") return state;
      return { ...state, lifecycle: "stale" };
    case "dcClear":
      return initialDutyCheckState;
  }
}

export interface CalculationContextValue {
  state: CalculationStoreState;
  /** React-side Short Circuit active slot (spec §8.2.1). */
  shortCircuit: ShortCircuitState;
  /** React-side Equipment Duty active slot (Equipment Duty spec §4.6). */
  dutyCheck: DutyCheckState;
  /** Readiness result for Equipment Duty (computed each render). */
  dutyCheckReadiness: DutyCheckReadinessResult;
  /** True when readiness allows the user to click Run Load Flow / Voltage Drop. */
  canRun: boolean;
  /** Reason the Load Flow Run button is disabled, when applicable. */
  disabledReason: string | null;
  /** True when readiness allows the user to click Run Short Circuit. */
  canRunShortCircuit: boolean;
  /** Reason the Short Circuit Run button is disabled, when applicable. */
  shortCircuitDisabledReason: string | null;
  /** True when readiness allows the user to click Run Equipment Duty. */
  canRunDutyCheck: boolean;
  /** Reason the Equipment Duty Run button is disabled, when applicable. */
  dutyCheckDisabledReason: string | null;
  /** Trigger the Load Flow + Voltage Drop run. */
  runCalculation: () => Promise<void>;
  /** Trigger the Short Circuit run (Stage 3 PR #5). */
  runShortCircuit: () => Promise<void>;
  /** Trigger the Equipment Duty run (Stage 3 ED-PR-04). */
  runDutyCheck: () => void;
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
   * Solver transport. When omitted, the Run buttons are disabled with
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
  const [shortCircuit, dispatchSc] = useReducer(
    shortCircuitReducer,
    initialShortCircuitState,
  );
  const [dutyCheck, dispatchDc] = useReducer(
    dutyCheckReducer,
    initialDutyCheckState,
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
    // Stage 3 PR #5: parallel SC stale tracking. The calculation-
    // store reducer's `markStale` already flips the retained SC
    // record's stale flag (spec §8.2.1); the SC active slot lives in
    // React state and needs its own stale flip so the UI panel
    // surfaces a stale badge for the SC module.
    if (shortCircuit.bundle !== null && shortCircuit.lifecycle !== "stale") {
      queueMicrotask(() => {
        dispatch({ type: "markStale" });
        dispatchSc({ type: "scMarkStale" });
      });
    }
    // ED-PR-04: parallel Duty Check stale tracking. The runtime
    // calculation-store reducer's `markStale` already flips the
    // retained duty-check record's stale flag (Equipment Duty spec
    // §4.6 / §10.5); the React-side active slot needs its own flip
    // so the panel surfaces a stale badge for the duty module.
    if (dutyCheck.bundle !== null && dutyCheck.lifecycle !== "stale") {
      queueMicrotask(() => {
        dispatch({ type: "markStale" });
        dispatchDc({ type: "dcMarkStale" });
      });
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

  const shortCircuitDisabledReason = useMemo<string | null>(() => {
    if (shortCircuit.lifecycle === "running") return "A Short Circuit run is already in progress.";
    if (state.lifecycle === "running") return "A calculation run is already in progress.";
    if (hasValidationErrors) {
      const n = errorIssues.length;
      return `Fix ${n} validation error${n === 1 ? "" : "s"} before running.`;
    }
    if (!transport) {
      return "Solver transport is not configured in this build. Wire a SidecarTransport to enable runs.";
    }
    return null;
  }, [
    shortCircuit.lifecycle,
    state.lifecycle,
    hasValidationErrors,
    errorIssues.length,
    transport,
  ]);

  const canRunShortCircuit = shortCircuitDisabledReason === null;

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

  const runShortCircuit = useCallback(async () => {
    if (!transport) {
      dispatchSc({
        type: "scFailed",
        message: "No solver transport configured.",
        at: nowFn(),
      });
      return;
    }
    const startedAt = nowFn();
    dispatchSc({ type: "scStarted", at: startedAt });
    // Mirror the LF reducer's "running" lifecycle so the LF Run button
    // also disables while SC is in flight (a single sidecar transport
    // serves both modules; concurrent calls would race the stdio).
    dispatch({ type: "runStarted", at: startedAt });
    try {
      const build: NetworkBuildResult = buildAppNetwork(projectState.project);
      if (build.appNetwork === null) {
        const first = build.issues[0];
        const message = first
          ? `${first.code}: ${first.message}`
          : "AppNetwork construction failed.";
        const failedAt = nowFn();
        dispatchSc({
          type: "scFailed",
          message,
          at: failedAt,
        });
        // The LF reducer needs to leave the "running" lifecycle.
        // Pre-bundle failure path: no bundle, just a startError.
        dispatch({
          type: "runFailed",
          at: failedAt,
          message,
          build,
          reason: "validation_failure",
        });
        return;
      }
      const bundle: ShortCircuitRunBundle = await runShortCircuitForAppNetwork(
        build.appNetwork,
        {
          transport,
          projectId: projectState.project.project.projectId,
        },
      );
      const at = nowFn();
      const status = bundle.shortCircuit.status;
      if (status === "failed") {
        const firstError = bundle.shortCircuit.issues.find(
          (i) => i.severity === "error",
        );
        const message = firstError
          ? `${firstError.code}: ${firstError.message}`
          : "Short Circuit failed.";
        dispatchSc({
          type: "scFailed",
          at,
          message,
          bundle,
          build,
        });
        // Route the failed SC bundle through the calculation-store
        // reducer so its snapshot is retained on `lastFailedSnapshot`
        // (spec §8.2 retention rules apply to SC the same as LF).
        dispatch({
          type: "runFailed",
          at,
          message,
          bundle,
          build,
          reason: "runtime_failure",
        });
      } else {
        dispatchSc({
          type: "scSucceeded",
          at,
          bundle,
          build,
          finalStatus: status,
        });
        // The calculation-store reducer retains the SC bundle under
        // the `short_circuit_bundle` key but does NOT displace the
        // active LF slot (see spec §8.2.1 + reducer comment in
        // packages/calculation-store/src/reducer.ts). Lifecycle on
        // `state` reverts to "succeeded" if there was a prior LF
        // bundle, or stays "succeeded" / falls through.
        dispatch({ type: "runSucceeded", bundle, build, at });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const at = nowFn();
      dispatchSc({ type: "scFailed", message, at });
      dispatch({ type: "runFailed", message, at });
    }
  }, [transport, projectState.project, nowFn]);

  // ED-PR-04: Equipment Duty readiness gate. We translate the
  // editor-facing `ValidationSummary` into the orchestrator's
  // `RuntimeValidationSummary` shape and ask the duty-check
  // readiness wrapper to decide. The wrapper is the single source
  // of truth for the four block reasons (`blocked_by_validation`,
  // `blocked_by_upstream`, `blocked_by_stale_upstream`,
  // `ready_to_run`) per Equipment Duty spec §4.6 / ED-PR-03 brief.
  const dutyCheckReadiness = useMemo<DutyCheckReadinessResult>(() => {
    const projectValidation: RuntimeValidationSummary = {
      status: hasValidationErrors
        ? "blocked_by_validation"
        : validation.status === "warning"
          ? "ran_with_warnings"
          : "ready_to_run",
      networkBuildStatus: hasValidationErrors ? "invalid" : "valid",
      issues: validation.issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        message: i.message,
      })),
    };
    return evaluateDutyCheckReadiness({
      shortCircuit: shortCircuit.bundle,
      shortCircuitStale: shortCircuit.lifecycle === "stale",
      projectValidation,
    });
  }, [
    validation.status,
    validation.issues,
    hasValidationErrors,
    shortCircuit.bundle,
    shortCircuit.lifecycle,
  ]);

  const dutyCheckDisabledReason = useMemo<string | null>(() => {
    if (dutyCheck.lifecycle === "running")
      return "An Equipment Duty run is already in progress.";
    if (state.lifecycle === "running")
      return "A calculation run is already in progress.";
    if (shortCircuit.lifecycle === "running")
      return "A Short Circuit run is already in progress.";
    if (dutyCheckReadiness.status !== "ready_to_run") {
      return dutyCheckReadiness.issues[0]?.message ?? "Equipment Duty is blocked.";
    }
    return null;
  }, [
    dutyCheck.lifecycle,
    state.lifecycle,
    shortCircuit.lifecycle,
    dutyCheckReadiness,
  ]);

  const canRunDutyCheck = dutyCheckDisabledReason === null;

  const runDutyCheck = useCallback(() => {
    if (dutyCheckReadiness.status !== "ready_to_run" || dutyCheckReadiness.shortCircuit === null) {
      const message =
        dutyCheckReadiness.issues[0]?.message ??
        "Equipment Duty cannot run: readiness blocked.";
      const failedAt = nowFn();
      dispatchDc({ type: "dcFailed", message, at: failedAt });
      return;
    }
    const startedAt = nowFn();
    dispatchDc({ type: "dcStarted", at: startedAt });
    try {
      const bundle = runDutyCheckForBundle(dutyCheckReadiness.shortCircuit, {
        project: projectState.project,
        validation: dutyCheckReadiness.validationSummary,
        now: () => new Date(startedAt),
      });
      const at = nowFn();
      const status = bundle.dutyCheck.status;
      if (status === "failed") {
        const firstError = bundle.dutyCheck.issues.find(
          (i) => i.severity === "warning",
        );
        const message = firstError
          ? `${firstError.code}: ${firstError.message}`
          : "Equipment Duty failed.";
        dispatchDc({ type: "dcFailed", at, message, bundle });
        // Route the failed duty bundle through the calculation-store
        // reducer so its snapshot is retained on `lastFailedSnapshot`
        // (Equipment Duty spec §4.6 retention rules).
        dispatch({
          type: "runFailed",
          at,
          message,
          bundle,
          build: null,
          reason: "runtime_failure",
        });
      } else {
        dispatchDc({
          type: "dcSucceeded",
          at,
          bundle,
          finalStatus: status,
        });
        // The calculation-store reducer retains the duty bundle under
        // the `duty_check_bundle` key; it does NOT displace the
        // LF-narrow active slot (Equipment Duty spec §4.6 active-slot
        // asymmetry). The build is reused from the upstream SC run —
        // duty check does not rebuild the AppNetwork (Equipment Duty
        // spec §4.6 / ED-OQ-06: pure TypeScript over the SC bundle).
        const reusedBuild =
          shortCircuit.build ??
          ({
            status: "valid",
            appNetwork: bundle.snapshot.appNetwork,
            issues: [],
            warnings: [],
          } as NetworkBuildResult);
        dispatch({ type: "runSucceeded", bundle, build: reusedBuild, at });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const at = nowFn();
      dispatchDc({ type: "dcFailed", message, at });
    }
  }, [dutyCheckReadiness, projectState.project, shortCircuit.build, nowFn]);

  const resetCalculation = useCallback(() => {
    dispatch({ type: "clearResults" });
    dispatchSc({ type: "scClear" });
    dispatchDc({ type: "dcClear" });
  }, []);

  const value = useMemo<CalculationContextValue>(
    () => ({
      state,
      shortCircuit,
      dutyCheck,
      dutyCheckReadiness,
      canRun,
      disabledReason,
      canRunShortCircuit,
      shortCircuitDisabledReason,
      canRunDutyCheck,
      dutyCheckDisabledReason,
      runCalculation,
      runShortCircuit,
      runDutyCheck,
      resetCalculation,
    }),
    [
      state,
      shortCircuit,
      dutyCheck,
      dutyCheckReadiness,
      canRun,
      disabledReason,
      canRunShortCircuit,
      shortCircuitDisabledReason,
      canRunDutyCheck,
      dutyCheckDisabledReason,
      runCalculation,
      runShortCircuit,
      runDutyCheck,
      resetCalculation,
    ],
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
