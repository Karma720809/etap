import { useMemo } from "react";
import { validateProject } from "@power-system-study/validation";
import type { ValidationSummary } from "@power-system-study/schemas";
import { useProjectState } from "../state/projectStore.js";

const styles = {
  wrapper: { display: "flex", flexDirection: "column" as const, gap: 8 },
  heading: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "#475569", margin: "0 0 6px" },
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" as const, gap: 4, maxHeight: 180, overflowY: "auto" as const },
  item: { padding: "6px 8px", borderRadius: 3, fontSize: 12, display: "flex", gap: 8, cursor: "pointer" },
  code: { fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 11, color: "#475569", minWidth: 78 },
  bySeverity: {
    error: { background: "#fee2e2", color: "#991b1b" },
    warning: { background: "#fef3c7", color: "#92400e" },
    info: { background: "#dbeafe", color: "#1e40af" },
  } as const,
};

function statusBadge(status: ValidationSummary["status"]) {
  const color = status === "valid" ? "#16a34a" : status === "warning" ? "#ca8a04" : "#dc2626";
  return { background: color, color: "white", padding: "2px 8px", borderRadius: 3, fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.5 };
}

export function ValidationPanel() {
  const { state, dispatch } = useProjectState();
  const summary = useMemo<ValidationSummary>(
    () => validateProject(state.project),
    [state.project],
  );

  return (
    <div style={styles.wrapper}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
        <h2 style={styles.heading}>Validation</h2>
        <span style={statusBadge(summary.status)}>{summary.status}</span>
      </div>
      {summary.issues.length === 0 ? (
        <div style={{ fontSize: 12, color: "#64748b" }}>No validation issues.</div>
      ) : (
        <ul style={styles.list}>
          {summary.issues.map((issue, i) => {
            const sev = issue.severity as keyof typeof styles.bySeverity;
            return (
              <li
                key={`${issue.code}-${i}`}
                style={{ ...styles.item, ...styles.bySeverity[sev] }}
                onClick={() => issue.equipmentInternalId && dispatch({ type: "selectEquipment", internalId: issue.equipmentInternalId })}
                data-testid={`issue-${issue.code}`}
              >
                <span style={styles.code}>{issue.code}</span>
                <span>{issue.message}</span>
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ fontSize: 11, color: "#64748b" }}>
        Calculations are not implemented in Stage 1. Load Flow / Voltage Drop / Short Circuit / Cable Sizing / Report Export are deferred.
      </div>
    </div>
  );
}
