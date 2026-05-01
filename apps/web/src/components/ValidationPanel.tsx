import { useMemo, useState } from "react";
import { validateProject } from "@power-system-study/validation";
import type { ValidationSummary } from "@power-system-study/schemas";
import { useProjectState } from "../state/projectStore.js";

type ValidationIssue = ValidationSummary["issues"][number];

// Stage 1 PR #3 surfaces the runtime validation summary with code, severity,
// equipment/tag, field/path, and a short message. Saved validation in the
// project file is audit-only; runtime validation (computed here) is what the
// editor actually trusts. We re-state that distinction inline to satisfy AC19
// and to keep EPC reviewers from confusing the two when they open a JSON file.

type SeverityFilter = "all" | "error" | "warning" | "info";

const styles = {
  wrapper: { display: "flex", flexDirection: "column" as const, gap: 8, height: "100%" },
  header: { display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" as const },
  heading: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "#475569", margin: 0 },
  controls: { display: "flex", gap: 6, alignItems: "center" },
  filterButton: (active: boolean) => ({
    padding: "3px 8px",
    fontSize: 11,
    border: "1px solid #cbd5e1",
    borderRadius: 3,
    background: active ? "#1e293b" : "white",
    color: active ? "white" : "#1e293b",
    cursor: "pointer",
  }),
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" as const, gap: 4, overflowY: "auto" as const, flex: 1, minHeight: 80 },
  item: {
    padding: "6px 8px",
    borderRadius: 3,
    fontSize: 12,
    display: "grid",
    gridTemplateColumns: "78px 1fr",
    gap: 8,
    cursor: "pointer",
    alignItems: "start",
  },
  code: { fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 11, color: "#475569" },
  details: { display: "flex", flexDirection: "column" as const, gap: 2 },
  message: { lineHeight: 1.3 },
  meta: { fontSize: 11, color: "#475569" },
  bySeverity: {
    error: { background: "#fee2e2", color: "#991b1b" },
    warning: { background: "#fef3c7", color: "#92400e" },
    info: { background: "#dbeafe", color: "#1e40af" },
  } as const,
  audit: {
    fontSize: 11,
    color: "#475569",
    borderTop: "1px solid #e2e8f0",
    paddingTop: 6,
    lineHeight: 1.4,
  },
};

function statusBadge(status: ValidationSummary["status"]) {
  const color = status === "valid" ? "#16a34a" : status === "warning" ? "#ca8a04" : "#dc2626";
  return {
    background: color,
    color: "white",
    padding: "2px 8px",
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  };
}

function describeLocation(issue: ValidationIssue): string {
  const parts: string[] = [];
  if (issue.tag) parts.push(issue.tag);
  else if (issue.equipmentInternalId) parts.push(issue.equipmentInternalId);
  if (issue.field) parts.push(`· field: ${issue.field}`);
  if (issue.path && !issue.field) parts.push(`· at ${issue.path}`);
  return parts.join(" ");
}

export function ValidationPanel() {
  const { state, dispatch } = useProjectState();
  const [filter, setFilter] = useState<SeverityFilter>("all");

  const summary = useMemo<ValidationSummary>(
    () => validateProject(state.project),
    [state.project],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return summary.issues;
    return summary.issues.filter((i) => i.severity === filter);
  }, [summary.issues, filter]);

  const counts = useMemo(() => ({
    all: summary.issues.length,
    error: summary.issues.filter((i) => i.severity === "error").length,
    warning: summary.issues.filter((i) => i.severity === "warning").length,
    info: summary.issues.filter((i) => i.severity === "info").length,
  }), [summary.issues]);

  const savedSummary = state.project.validation;

  return (
    <div style={styles.wrapper} data-testid="validation-panel">
      <div style={styles.header}>
        <h2 style={styles.heading}>Runtime Validation</h2>
        <span style={statusBadge(summary.status)} data-testid="validation-status-badge">{summary.status}</span>
      </div>
      <div style={styles.controls}>
        {(["all", "error", "warning", "info"] as const).map((sev) => (
          <button
            key={sev}
            type="button"
            style={styles.filterButton(filter === sev)}
            onClick={() => setFilter(sev)}
            data-testid={`validation-filter-${sev}`}
          >
            {sev} ({counts[sev]})
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ fontSize: 12, color: "#64748b" }}>
          {summary.issues.length === 0 ? "No validation issues." : `No ${filter} issues.`}
        </div>
      ) : (
        <ul style={styles.list}>
          {filtered.map((issue, i) => {
            const sev = issue.severity as keyof typeof styles.bySeverity;
            const location = describeLocation(issue);
            return (
              <li
                key={`${issue.code}-${i}`}
                style={{ ...styles.item, ...styles.bySeverity[sev] }}
                onClick={() => issue.equipmentInternalId && dispatch({ type: "selectEquipment", internalId: issue.equipmentInternalId })}
                data-testid={`issue-${issue.code}`}
                data-severity={issue.severity}
              >
                <span style={styles.code}>{issue.code}</span>
                <span style={styles.details}>
                  <span style={styles.message}>{issue.message}</span>
                  {location ? <span style={styles.meta}>{location}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div style={styles.audit} data-testid="validation-audit-note">
        Runtime validation (above) is authoritative. The saved <code>validation</code> block in the
        project file is an audit reference only and is recomputed on load.{" "}
        {savedSummary
          ? `Last saved status: ${savedSummary.status} (${savedSummary.issues.length} issues at save time).`
          : "No saved validation reference yet."}
      </div>
    </div>
  );
}
