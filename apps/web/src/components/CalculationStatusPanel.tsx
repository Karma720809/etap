import { useMemo } from "react";
import type { ValidationSummary } from "@power-system-study/schemas";

// Stage 1 calculation modules are not implemented. This panel materializes the
// AC18 placeholder state for each calculation surface defined by spec §13:
//
//   loadFlow / voltageDrop / shortCircuit / cableSizing / report
//
// Each module is rendered in one of two disabled states:
//   - "not_implemented"        → Stage 1 has no engine wired yet (default)
//   - "disabled_by_validation" → runtime validation reports at least one error
//
// We never produce numeric output, never run a solver, and the buttons are
// intentionally non-interactive. This makes the AC17/AC18 contract literal:
// users see a clear Stage 1 notice and can audit which validation issues are
// gating future calculation runs.
type CalculationModuleId = "loadFlow" | "voltageDrop" | "shortCircuit" | "cableSizing" | "report";

type CalculationStatusValue = "not_implemented" | "disabled_by_validation";

interface CalculationModuleDescriptor {
  id: CalculationModuleId;
  label: string;
  futureStage: string;
}

const MODULES: CalculationModuleDescriptor[] = [
  { id: "loadFlow", label: "Load Flow", futureStage: "Stage 2" },
  { id: "voltageDrop", label: "Voltage Drop", futureStage: "Stage 2" },
  { id: "shortCircuit", label: "Short Circuit", futureStage: "Stage 3" },
  { id: "cableSizing", label: "Cable Sizing", futureStage: "Stage 4" },
  { id: "report", label: "Report Export", futureStage: "Stage 5" },
];

const styles = {
  wrapper: { display: "flex", flexDirection: "column" as const, gap: 12 },
  notice: {
    padding: "8px 10px",
    background: "#eef2ff",
    border: "1px solid #c7d2fe",
    borderRadius: 4,
    color: "#3730a3",
    fontSize: 12,
    lineHeight: 1.4,
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
  button: {
    marginTop: 4,
    padding: "4px 8px",
    border: "1px solid #cbd5e1",
    borderRadius: 3,
    background: "#e2e8f0",
    color: "#64748b",
    fontSize: 12,
    cursor: "not-allowed" as const,
  },
  errorList: {
    margin: 0,
    paddingLeft: 16,
    fontSize: 11,
    color: "#7f1d1d",
    maxHeight: 80,
    overflowY: "auto" as const,
  },
};

export interface CalculationStatusPanelProps {
  validation: ValidationSummary;
}

export function CalculationStatusPanel({ validation }: CalculationStatusPanelProps) {
  const errorIssues = useMemo(
    () => validation.issues.filter((i) => i.severity === "error"),
    [validation.issues],
  );
  const hasErrors = errorIssues.length > 0;
  const status: CalculationStatusValue = hasErrors ? "disabled_by_validation" : "not_implemented";

  return (
    <div style={styles.wrapper} data-testid="calculation-status-panel">
      <div style={styles.notice} data-testid="calc-status-stage1-notice">
        Calculations are not implemented in Stage 1. Load Flow, Voltage Drop, Short Circuit,
        Cable Sizing, and Report Export are deferred to later stages and never produce numeric
        results from this build.
      </div>
      <ul style={styles.list}>
        {MODULES.map((mod) => (
          <li key={mod.id} style={styles.item} data-testid={`calc-module-${mod.id}`}>
            <span style={styles.itemLabel}>{mod.label}</span>
            <span style={styles.itemStatus} data-testid={`calc-module-${mod.id}-status`}>{status}</span>
            <span style={styles.itemHint}>
              {hasErrors
                ? `Disabled — fix ${errorIssues.length} validation error${errorIssues.length === 1 ? "" : "s"} first.`
                : `Not implemented in Stage 1 (planned for ${mod.futureStage}).`}
            </span>
            <button type="button" style={styles.button} disabled aria-disabled="true">
              Run (disabled)
            </button>
          </li>
        ))}
      </ul>
      {hasErrors ? (
        <div>
          <div style={{ fontSize: 11, color: "#7f1d1d", marginBottom: 4 }}>
            Validation errors blocking future calculation modules:
          </div>
          <ul style={styles.errorList}>
            {errorIssues.slice(0, 8).map((issue, i) => (
              <li key={`${issue.code}-${i}`}>
                <code>{issue.code}</code> — {issue.message}
              </li>
            ))}
            {errorIssues.length > 8 ? <li>… and {errorIssues.length - 8} more in the Validation tab.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
