// Stage 3 ED-PR-04 — Equipment Duty result table.
//
// Renders the runtime `DutyCheckResult` produced by ED-PR-03's
// orchestrator. Rows are keyed by `(equipmentInternalId, criterion)`
// so an equipment that emits both a primary and a peak row is
// rendered as two distinct lines. Per the Equipment Duty contract
// (ED-PR-02 §4.2), null numeric cells render as an explicit em dash —
// the table never substitutes `0` for an unevaluated duty / rating /
// utilization / margin.
//
// Statuses (ED-PR-02 contract surface):
//   pass | fail | missing_rating | not_applicable | not_evaluated
//
// ED-PR-03 only emits `missing_rating` / `not_applicable` /
// `not_evaluated` rows — `pass` / `fail` belong to the future
// engineering-formula PR. The table supports rendering them anyway
// so it does not need a follow-up reshaping when the formulas land.

import type {
  DutyCheckEquipmentResult,
  DutyCheckIssueCode,
  DutyCheckResult,
  DutyCheckStatus,
} from "@power-system-study/duty-check";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";

const styles = {
  section: {
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    background: "white",
    overflow: "hidden" as const,
  },
  sectionHeader: {
    padding: "6px 10px",
    background: "#f1f5f9",
    fontSize: 12,
    fontWeight: 600,
    color: "#1e293b",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 12,
  },
  th: {
    textAlign: "left" as const,
    padding: "4px 8px",
    background: "#f8fafc",
    color: "#475569",
    fontWeight: 600,
    borderBottom: "1px solid #e2e8f0",
  },
  td: {
    padding: "4px 8px",
    borderBottom: "1px solid #f1f5f9",
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    color: "#0f172a",
  },
  tdLeft: {
    padding: "4px 8px",
    borderBottom: "1px solid #f1f5f9",
    color: "#0f172a",
  },
  empty: { padding: "8px 10px", color: "#64748b", fontSize: 12 },
  badge: (status: DutyCheckStatus) => {
    const palette: Record<DutyCheckStatus, { bg: string; fg: string }> = {
      pass: { bg: "#dcfce7", fg: "#15803d" },
      fail: { bg: "#fee2e2", fg: "#991b1b" },
      missing_rating: { bg: "#fef3c7", fg: "#92400e" },
      not_applicable: { bg: "#e2e8f0", fg: "#475569" },
      not_evaluated: { bg: "#e0e7ff", fg: "#3730a3" },
    };
    const c = palette[status]!;
    return {
      display: "inline-block",
      padding: "1px 6px",
      borderRadius: 3,
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
      background: c.bg,
      color: c.fg,
    };
  },
  codeBadge: (code: string) => {
    const isWarning = code.startsWith("W-");
    const palette = isWarning
      ? { bg: "#fef3c7", fg: "#92400e" }
      : { bg: "#e0e7ff", fg: "#3730a3" };
    return {
      display: "inline-block",
      padding: "1px 6px",
      borderRadius: 3,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.5,
      background: palette.bg,
      color: palette.fg,
      marginRight: 4,
      fontFamily: "ui-monospace, SFMono-Regular, monospace",
    };
  },
  codeList: { display: "flex", flexWrap: "wrap" as const, gap: 2 },
};

const EM_DASH = "—";

function fmt(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EM_DASH;
  }
  return value.toFixed(digits);
}

export interface DutyCheckResultTableProps {
  result: DutyCheckResult | null;
  /**
   * Project file used to resolve `equipmentInternalId` → display tag.
   * Optional: when omitted, the table falls back to the internalId.
   */
  project?: PowerSystemProjectFile;
}

export function DutyCheckResultTable({
  result,
  project,
}: DutyCheckResultTableProps) {
  if (!result) return null;
  const tagByInternalId = buildTagLookup(project);
  return (
    <div style={styles.section} data-testid="result-table-duty-check">
      <div style={styles.sectionHeader}>
        <span>Equipment Duty — Per-row Results</span>
        <span style={{ color: "#64748b", fontWeight: 400 }}>
          {result.equipmentResults.length} row(s) · {summarizeStatus(result.status)}
        </span>
      </div>
      {result.status === "failed" && result.equipmentResults.length === 0 ? (
        <div style={styles.empty} data-testid="result-dc-failed">
          Equipment Duty unavailable —{" "}
          {result.issues.map((i) => i.code).join(", ") ||
            "no rows produced by the orchestrator"}
          .
        </div>
      ) : result.equipmentResults.length === 0 ? (
        <div style={styles.empty} data-testid="result-dc-empty">
          No equipment rows in the result.
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Equipment</th>
              <th style={styles.th}>Kind</th>
              <th style={styles.th}>Criterion</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Issues</th>
              <th style={styles.th}>Duty</th>
              <th style={styles.th}>Rating</th>
              <th style={styles.th}>Util %</th>
              <th style={styles.th}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {result.equipmentResults.map((row, i) => (
              <DutyCheckRow
                key={`${row.equipmentInternalId}-${row.criterion}-${i}`}
                row={row}
                tag={tagByInternalId[row.equipmentInternalId] ?? null}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DutyCheckRow({
  row,
  tag,
}: {
  row: DutyCheckEquipmentResult;
  tag: string | null;
}) {
  const display = tag ?? row.equipmentInternalId;
  const rowKey = `${row.equipmentInternalId}-${row.criterion}`;
  return (
    <tr data-testid={`result-dc-row-${rowKey}`}>
      <td style={styles.tdLeft}>{display}</td>
      <td style={styles.tdLeft}>{row.equipmentKind}</td>
      <td style={styles.tdLeft}>{row.criterion}</td>
      <td style={styles.tdLeft}>
        <span
          style={styles.badge(row.status)}
          data-testid={`result-dc-row-${rowKey}-status`}
        >
          {row.status}
        </span>
      </td>
      <td style={styles.tdLeft}>
        <RowIssueCodes rowKey={rowKey} codes={row.issueCodes} />
      </td>
      <td style={styles.td} data-testid={`result-dc-row-${rowKey}-duty`}>
        {fmt(row.dutyValue, 3)}
      </td>
      <td style={styles.td} data-testid={`result-dc-row-${rowKey}-rating`}>
        {fmt(row.ratingValue, 3)}
      </td>
      <td style={styles.td} data-testid={`result-dc-row-${rowKey}-util`}>
        {fmt(row.utilizationPct, 1)}
      </td>
      <td style={styles.td} data-testid={`result-dc-row-${rowKey}-margin`}>
        {fmt(row.marginValue, 3)}
      </td>
    </tr>
  );
}

function RowIssueCodes({
  rowKey,
  codes,
}: {
  rowKey: string;
  codes: readonly DutyCheckIssueCode[];
}) {
  if (codes.length === 0) {
    return (
      <span
        style={{
          color: "#94a3b8",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
        }}
        data-testid={`result-dc-row-${rowKey}-issues`}
      >
        {EM_DASH}
      </span>
    );
  }
  return (
    <span
      style={styles.codeList}
      data-testid={`result-dc-row-${rowKey}-issues`}
    >
      {codes.map((code, i) => (
        <span
          key={`${code}-${i}`}
          style={styles.codeBadge(code)}
          data-testid={`result-dc-row-${rowKey}-issue-${code}`}
        >
          {code}
        </span>
      ))}
    </span>
  );
}

function summarizeStatus(status: DutyCheckResult["status"]): string {
  switch (status) {
    case "valid":
      return "valid";
    case "warning":
      return "warning";
    case "failed":
      return "failed";
  }
}

function buildTagLookup(
  project: PowerSystemProjectFile | undefined,
): Record<string, string> {
  if (!project) return {};
  const out: Record<string, string> = {};
  const eq = project.equipment;
  for (const e of [
    ...eq.breakers,
    ...eq.switches,
    ...eq.buses,
    ...eq.cables,
  ]) {
    if (e.tag) out[e.internalId] = e.tag;
  }
  return out;
}
