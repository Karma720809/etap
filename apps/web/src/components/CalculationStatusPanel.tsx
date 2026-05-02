// Stage 2 PR #5 — Calculation status + run controls.
//
// This panel is now the user's entry point to the Stage 2 calculation
// flow. It surfaces:
//
//   - Module status for Load Flow + Voltage Drop (driven by the
//     runtime CalculationStore, no more "not_implemented" placeholder).
//   - A "Run Load Flow / Voltage Drop" button that builds the
//     AppNetwork from the current project, calls the solver adapter
//     orchestrator, and stores the resulting bundle in runtime state.
//     Disabled when the validation summary contains errors or when no
//     solver transport is configured.
//   - The structured issue list from the latest bundle (Load Flow
//     issues + Voltage Drop issues), plus any blocking validation
//     errors so the user can see exactly why the Run button is locked
//     down.
//   - The result tables (Load Flow buses / branches / Voltage Drop)
//     when a successful run has produced a result. We never render
//     numeric placeholders before a real run — that was the AC18
//     guardrail in Stage 1 and PR #5 must keep it.
//
// Short Circuit / Cable Sizing / Report Export remain Stage 3+
// territory. They appear in the module list as `not_implemented` so
// the UI keeps visibility on what is and isn't shipped, but their
// rows have no Run buttons.

import { useMemo } from "react";
import type { ValidationSummary } from "@power-system-study/schemas";
import type {
  LoadFlowIssue,
  VoltageDropIssue,
} from "@power-system-study/solver-adapter";

import { useCalculation } from "../state/calculationStore.js";
import { ResultTables } from "./ResultTables.js";

type StageModuleId = "loadFlow" | "voltageDrop" | "shortCircuit" | "cableSizing" | "report";

type ModuleDescriptor = {
  id: StageModuleId;
  label: string;
  futureStage: string | null;
};

const STAGE_MODULES: ModuleDescriptor[] = [
  { id: "loadFlow", label: "Load Flow", futureStage: null },
  { id: "voltageDrop", label: "Voltage Drop", futureStage: null },
  { id: "shortCircuit", label: "Short Circuit", futureStage: "Stage 3" },
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
  const { state, canRun, disabledReason, runCalculation } = useCalculation();

  const errorIssues = useMemo(
    () => validation.issues.filter((i) => i.severity === "error"),
    [validation.issues],
  );

  const moduleStatuses = useMemo(() => {
    const lfStatus = computeModuleStatus("loadFlow", state, errorIssues.length > 0);
    const vdStatus = computeModuleStatus("voltageDrop", state, errorIssues.length > 0);
    return { loadFlow: lfStatus, voltageDrop: vdStatus };
  }, [state, errorIssues.length]);

  const lifecycle = state.lifecycle;
  const bundle = state.bundle;

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
        {lifecycle === "stale" ? (
          <span style={styles.staleBadge} data-testid="calc-stale-badge">
            Stale — re-run for latest inputs
          </span>
        ) : null}
        {disabledReason ? (
          <span style={{ fontSize: 12, color: "#64748b" }} data-testid="calc-disabled-reason">
            {disabledReason}
          </span>
        ) : null}
      </div>

      {state.startError ? (
        <div style={styles.notice("error")} data-testid="calc-start-error">
          {state.startError}
        </div>
      ) : null}

      <ul style={styles.list}>
        {STAGE_MODULES.map((mod) => {
          const status =
            mod.id === "loadFlow"
              ? moduleStatuses.loadFlow
              : mod.id === "voltageDrop"
                ? moduleStatuses.voltageDrop
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

      {bundle ? (
        <ResultTables
          loadFlow={bundle.loadFlow}
          voltageDrop={bundle.voltageDrop}
        />
      ) : null}
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

function computeModuleStatus(
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
  // voltageDrop
  if (state.bundle.voltageDrop === null) return "ready_to_run";
  return state.bundle.voltageDrop.status === "valid"
    ? "succeeded"
    : state.bundle.voltageDrop.status === "warning"
      ? "warning"
      : "failed";
}

function describeModuleHint(
  mod: ModuleDescriptor,
  status: StageModuleStatus,
  errorCount: number,
): string {
  if (mod.futureStage) {
    return `Not implemented in Stage 2 (planned for ${mod.futureStage}).`;
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
