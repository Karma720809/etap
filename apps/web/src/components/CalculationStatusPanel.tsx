// Stage 2 PR #5 — Calculation status + run controls.
// Stage 3 PR #5 — Short Circuit module wiring.
//
// This panel is the user's entry point to the calculation flow. It
// surfaces:
//
//   - Module status for Load Flow + Voltage Drop + Short Circuit
//     (driven by the runtime CalculationStore — the LF / VD pair
//     reads from the LF-narrow `state.bundle` slot, the SC module
//     reads from the parallel React-side `shortCircuit` slot per
//     spec §8.2.1).
//   - A "Run Load Flow / Voltage Drop" button that builds the
//     AppNetwork from the current project, calls the solver adapter
//     orchestrator, and stores the resulting bundle in runtime state.
//   - A separate "Run Short Circuit" button that fires the Stage 3
//     orchestrator. The two buttons are deliberately separate so the
//     user can tell which solver run is being kicked off (spec §9.4
//     Stage 3 PR #5 Run-button contract).
//   - The structured issue list from the latest LF/VD bundle and the
//     latest SC result.
//   - The Load Flow / Voltage Drop result tables and the Short
//     Circuit result table when each module has produced a real
//     result. We never render numeric placeholders before a real
//     run — that was the AC18 guardrail in Stage 1 and PR #5 must
//     keep it.
//
// Cable Sizing / Report Export remain Stage 4+ territory. They appear
// in the module list as `not_implemented` so the UI keeps visibility
// on what is and isn't shipped.

import { useMemo } from "react";
import type { ValidationSummary } from "@power-system-study/schemas";
import type {
  LoadFlowIssue,
  ShortCircuitIssue,
  ShortCircuitResult,
  VoltageDropIssue,
} from "@power-system-study/solver-adapter";

import { useCalculation } from "../state/calculationStore.js";
import { ResultTables } from "./ResultTables.js";
import { ShortCircuitResultTable } from "./ShortCircuitResultTable.js";

type StageModuleId = "loadFlow" | "voltageDrop" | "shortCircuit" | "cableSizing" | "report";

type ModuleDescriptor = {
  id: StageModuleId;
  label: string;
  futureStage: string | null;
};

const STAGE_MODULES: ModuleDescriptor[] = [
  { id: "loadFlow", label: "Load Flow", futureStage: null },
  { id: "voltageDrop", label: "Voltage Drop", futureStage: null },
  { id: "shortCircuit", label: "Short Circuit", futureStage: null },
  { id: "cableSizing", label: "Cable Sizing", futureStage: "Stage 4" },
  { id: "report", label: "Report Export", futureStage: "Stage 5" },
];

const styles = {
  wrapper: { display: "flex", flexDirection: "column" as const, gap: 12 },
  controlsRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap" as const,
  },
  runButton: (enabled: boolean) => ({
    padding: "6px 14px",
    borderRadius: 4,
    border: enabled ? "1px solid #2563eb" : "1px solid #cbd5e1",
    background: enabled ? "#2563eb" : "#e2e8f0",
    color: enabled ? "white" : "#64748b",
    fontSize: 13,
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed" as const,
  }),
  notice: (variant: "info" | "warn" | "error") => {
    const palette = {
      info: { bg: "#eef2ff", border: "#c7d2fe", fg: "#3730a3" },
      warn: { bg: "#fef3c7", border: "#fde68a", fg: "#92400e" },
      error: { bg: "#fee2e2", border: "#fecaca", fg: "#991b1b" },
    } as const;
    return {
      padding: "8px 10px",
      background: palette[variant].bg,
      border: `1px solid ${palette[variant].border}`,
      color: palette[variant].fg,
      borderRadius: 4,
      fontSize: 12,
      lineHeight: 1.4,
    };
  },
  list: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, listStyle: "none", margin: 0, padding: 0 },
  item: {
    border: "1px solid #cbd5e1",
    borderRadius: 4,
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    background: "#f8fafc",
    color: "#475569",
  },
  itemLabel: { fontSize: 13, fontWeight: 600, color: "#1e293b" },
  itemStatus: { fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, monospace" },
  itemHint: { fontSize: 11 },
  issueList: {
    margin: 0,
    paddingLeft: 16,
    fontSize: 11,
    maxHeight: 160,
    overflowY: "auto" as const,
  },
  staleBadge: {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 3,
    background: "#fde68a",
    color: "#92400e",
    fontWeight: 700,
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
};

export interface CalculationStatusPanelProps {
  validation: ValidationSummary;
}

export function CalculationStatusPanel({ validation }: CalculationStatusPanelProps) {
  const {
    state,
    shortCircuit,
    canRun,
    disabledReason,
    canRunShortCircuit,
    shortCircuitDisabledReason,
    runCalculation,
    runShortCircuit,
  } = useCalculation();

  const errorIssues = useMemo(
    () => validation.issues.filter((i) => i.severity === "error"),
    [validation.issues],
  );
  const hasValidationErrors = errorIssues.length > 0;

  const moduleStatuses = useMemo(() => {
    const lfStatus = computeLoadFlowModuleStatus("loadFlow", state, hasValidationErrors);
    const vdStatus = computeLoadFlowModuleStatus("voltageDrop", state, hasValidationErrors);
    const scStatus = computeShortCircuitModuleStatus(shortCircuit, hasValidationErrors);
    return { loadFlow: lfStatus, voltageDrop: vdStatus, shortCircuit: scStatus };
  }, [state, shortCircuit, hasValidationErrors]);

  const lifecycle = state.lifecycle;
  const bundle = state.bundle;
  const scResult = shortCircuit.bundle?.shortCircuit ?? null;

  return (
    <div style={styles.wrapper} data-testid="calculation-status-panel">
      <div style={styles.controlsRow}>
        <button
          type="button"
          style={styles.runButton(canRun)}
          onClick={() => void runCalculation()}
          disabled={!canRun}
          aria-disabled={!canRun}
          data-testid="calc-run-button"
        >
          {lifecycle === "running" ? "Running…" : "Run Load Flow / Voltage Drop"}
        </button>
        <button
          type="button"
          style={styles.runButton(canRunShortCircuit)}
          onClick={() => void runShortCircuit()}
          disabled={!canRunShortCircuit}
          aria-disabled={!canRunShortCircuit}
          data-testid="calc-run-sc-button"
        >
          {shortCircuit.lifecycle === "running"
            ? "Running Short Circuit…"
            : "Run Short Circuit"}
        </button>
        {lifecycle === "stale" ? (
          <span style={styles.staleBadge} data-testid="calc-stale-badge">
            Stale — re-run for latest inputs
          </span>
        ) : null}
        {shortCircuit.lifecycle === "stale" ? (
          <span style={styles.staleBadge} data-testid="calc-sc-stale-badge">
            SC Stale — re-run for latest inputs
          </span>
        ) : null}
        {disabledReason ? (
          <span style={{ fontSize: 12, color: "#64748b" }} data-testid="calc-disabled-reason">
            {disabledReason}
          </span>
        ) : null}
        {shortCircuitDisabledReason && shortCircuitDisabledReason !== disabledReason ? (
          <span
            style={{ fontSize: 12, color: "#64748b" }}
            data-testid="calc-sc-disabled-reason"
          >
            {shortCircuitDisabledReason}
          </span>
        ) : null}
      </div>

      {state.startError ? (
        <div style={styles.notice("error")} data-testid="calc-start-error">
          {state.startError}
        </div>
      ) : null}

      {shortCircuit.startError ? (
        <div style={styles.notice("error")} data-testid="calc-sc-start-error">
          {shortCircuit.startError}
        </div>
      ) : null}

      <ul style={styles.list}>
        {STAGE_MODULES.map((mod) => {
          const status =
            mod.id === "loadFlow"
              ? moduleStatuses.loadFlow
              : mod.id === "voltageDrop"
                ? moduleStatuses.voltageDrop
                : mod.id === "shortCircuit"
                  ? moduleStatuses.shortCircuit
                  : "not_implemented";
          return (
            <li key={mod.id} style={styles.item} data-testid={`calc-module-${mod.id}`}>
              <span style={styles.itemLabel}>{mod.label}</span>
              <span
                style={styles.itemStatus}
                data-testid={`calc-module-${mod.id}-status`}
              >
                {status}
              </span>
              <span style={styles.itemHint}>{describeModuleHint(mod, status, errorIssues.length)}</span>
            </li>
          );
        })}
      </ul>

      {errorIssues.length > 0 ? (
        <div style={styles.notice("warn")} data-testid="calc-validation-block">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {errorIssues.length} validation error{errorIssues.length === 1 ? "" : "s"} blocking the run:
          </div>
          <ul style={styles.issueList}>
            {errorIssues.slice(0, 8).map((issue, i) => (
              <li key={`${issue.code}-${i}`}>
                <code>{issue.code}</code> — {issue.message}
              </li>
            ))}
            {errorIssues.length > 8 ? (
              <li>… and {errorIssues.length - 8} more in the Validation tab.</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {bundle ? (
        <BundleIssues
          loadFlowIssues={bundle.loadFlow.issues}
          voltageDropIssues={bundle.voltageDrop?.issues ?? []}
        />
      ) : null}

      {scResult ? <ShortCircuitIssues issues={scResult.issues} /> : null}

      {bundle ? (
        <ResultTables
          loadFlow={bundle.loadFlow}
          voltageDrop={bundle.voltageDrop}
        />
      ) : null}

      <ShortCircuitResultTable result={scResult} />
    </div>
  );
}

type StageModuleStatus =
  | "not_implemented"
  | "disabled_by_validation"
  | "ready_to_run"
  | "running"
  | "succeeded"
  | "failed"
  | "warning"
  | "stale";

function computeLoadFlowModuleStatus(
  module: "loadFlow" | "voltageDrop",
  state: ReturnType<typeof useCalculation>["state"],
  hasValidationErrors: boolean,
): StageModuleStatus {
  if (hasValidationErrors) return "disabled_by_validation";
  if (state.lifecycle === "running") return "running";
  if (state.lifecycle === "stale") return "stale";
  if (state.bundle === null) return "ready_to_run";
  if (module === "loadFlow") {
    return state.bundle.loadFlow.status === "valid"
      ? "succeeded"
      : state.bundle.loadFlow.status === "warning"
        ? "warning"
        : "failed";
  }
  if (state.bundle.voltageDrop === null) return "ready_to_run";
  return state.bundle.voltageDrop.status === "valid"
    ? "succeeded"
    : state.bundle.voltageDrop.status === "warning"
      ? "warning"
      : "failed";
}

function computeShortCircuitModuleStatus(
  shortCircuit: ReturnType<typeof useCalculation>["shortCircuit"],
  hasValidationErrors: boolean,
): StageModuleStatus {
  // PR #16 review (non-blocking no-transport consistency): the
  // existing `StageModuleStatus` enum has no
  // `disabled_not_configured` literal, and the LF/VD module mirrors
  // the same convention — when the transport is null but readiness is
  // clean, the module status stays `ready_to_run` and the disabled
  // Run button + `calc-sc-disabled-reason` text carry the actual
  // user-visible signal. We deliberately keep SC aligned with LF so
  // the panel behaves consistently across modules; widening the enum
  // is deferred (would also touch LF/VD which this PR must not
  // disturb).
  if (hasValidationErrors) return "disabled_by_validation";
  switch (shortCircuit.lifecycle) {
    case "idle":
      return "ready_to_run";
    case "running":
      return "running";
    case "stale":
      return "stale";
    case "succeeded":
      return "succeeded";
    case "warning":
      return "warning";
    case "failed":
      return "failed";
  }
}

function describeModuleHint(
  mod: ModuleDescriptor,
  status: StageModuleStatus,
  errorCount: number,
): string {
  if (mod.futureStage) {
    return `Not implemented in Stage 3 (planned for ${mod.futureStage}).`;
  }
  switch (status) {
    case "disabled_by_validation":
      return `Disabled — fix ${errorCount} validation error${errorCount === 1 ? "" : "s"} first.`;
    case "running":
      return "Solver run in progress…";
    case "ready_to_run":
      return "Ready to run.";
    case "succeeded":
      return "Last run succeeded.";
    case "warning":
      return "Last run completed with warnings.";
    case "failed":
      return "Last run failed — see the issue list below.";
    case "stale":
      return "Inputs changed after the last run. Click Run for fresh results.";
    default:
      return "";
  }
}

function BundleIssues({
  loadFlowIssues,
  voltageDropIssues,
}: {
  loadFlowIssues: readonly LoadFlowIssue[];
  voltageDropIssues: readonly VoltageDropIssue[];
}) {
  const total = loadFlowIssues.length + voltageDropIssues.length;
  if (total === 0) return null;
  return (
    <div style={styles.notice("warn")} data-testid="calc-result-issues">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        Run produced {total} issue{total === 1 ? "" : "s"}:
      </div>
      <ul style={styles.issueList}>
        {loadFlowIssues.map((issue, i) => (
          <li key={`lf-${issue.code}-${i}`} data-testid={`calc-issue-${issue.code}`}>
            <code>{issue.code}</code> — {issue.message}
          </li>
        ))}
        {voltageDropIssues.map((issue, i) => (
          <li key={`vd-${issue.code}-${i}`} data-testid={`calc-issue-${issue.code}`}>
            <code>{issue.code}</code> — {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShortCircuitIssues({
  issues,
}: {
  issues: ShortCircuitResult["issues"];
}) {
  if (issues.length === 0) return null;
  return (
    <div style={styles.notice("warn")} data-testid="calc-sc-result-issues">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        Short Circuit produced {issues.length} issue{issues.length === 1 ? "" : "s"}:
      </div>
      <ul style={styles.issueList}>
        {issues.map((issue: ShortCircuitIssue, i: number) => (
          <li key={`sc-${issue.code}-${i}`} data-testid={`calc-sc-issue-${issue.code}`}>
            <code>{issue.code}</code> — {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
