// Stage 3 PR #5 — Short Circuit result table.
//
// Renders the runtime `ShortCircuitResult` per spec §9.2. Rows are
// keyed by `busInternalId`, displaying `tag`, `voltageLevelKv`,
// `Ik''`, `ip`, `Ith`, `Sk''`, and a per-row status badge.
//
// Guardrails (spec §S3-OQ-02 / §9.5):
//   - The table renders only when a real `ShortCircuitResult` exists.
//   - Null numeric cells render as an explicit em dash, never `0`.
//   - Failed / unavailable rows are visually distinct from `ok` rows
//     via the status badge palette and an explicit empty-cell pattern.
//   - Test ids namespace as `result-sc-bus-<id>-status` to avoid
//     collision with the Stage 2 Load Flow `result-bus-<id>-status`
//     pattern (spec §9.2).

import type {
  ShortCircuitBusResult,
  ShortCircuitResult,
} from "@power-system-study/solver-adapter";

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
  badge: (status: string) => {
    const palette: Record<string, { bg: string; fg: string }> = {
      ok: { bg: "#dcfce7", fg: "#15803d" },
      warning: { bg: "#fef3c7", fg: "#92400e" },
      failed: { bg: "#fee2e2", fg: "#991b1b" },
      unavailable: { bg: "#e2e8f0", fg: "#475569" },
    };
    const c = palette[status] ?? palette.unavailable!;
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
};

const EM_DASH = "—";

function fmt(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EM_DASH;
  }
  return value.toFixed(digits);
}

export interface ShortCircuitResultTableProps {
  result: ShortCircuitResult | null;
}

export function ShortCircuitResultTable({ result }: ShortCircuitResultTableProps) {
  if (!result) return null;
  return (
    <div style={styles.section} data-testid="result-table-short-circuit">
      <div style={styles.sectionHeader}>
        <span>Short Circuit — Bus Results</span>
        <span style={{ color: "#64748b", fontWeight: 400 }}>
          {result.busResults.length} bus(es) · {summarizeStatus(result.status)}
        </span>
      </div>
      {result.status === "failed" && result.busResults.length === 0 ? (
        <div style={styles.empty} data-testid="result-sc-failed">
          Short Circuit unavailable —{" "}
          {result.issues.map((i) => i.code).join(", ") ||
            "no rows produced by the solver"}
          .
        </div>
      ) : result.busResults.length === 0 ? (
        <div style={styles.empty}>No bus rows in the result.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Bus</th>
              <th style={styles.th}>kV</th>
              <th style={styles.th}>Ik&apos;&apos; (kA)</th>
              <th style={styles.th}>ip (kA)</th>
              <th style={styles.th}>Ith (kA)</th>
              <th style={styles.th}>Sk&apos;&apos; (MVA)</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {result.busResults.map((row) => (
              <ShortCircuitRow key={row.busInternalId} row={row} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ShortCircuitRow({ row }: { row: ShortCircuitBusResult }) {
  // The result row uses a single `data-testid` namespace so the
  // failed / unavailable rows can be discovered alongside the
  // populated rows without colliding with the Stage 2 Load Flow
  // `result-bus-<id>` ids.
  return (
    <tr data-testid={`result-sc-bus-${row.busInternalId}`}>
      <td style={styles.tdLeft}>{row.tag || row.busInternalId}</td>
      <td style={styles.td}>{fmt(row.voltageLevelKv, 3)}</td>
      <td style={styles.td}>{fmt(row.ikssKa, 3)}</td>
      <td style={styles.td}>{fmt(row.ipKa, 3)}</td>
      <td style={styles.td}>{fmt(row.ithKa, 3)}</td>
      <td style={styles.td}>{fmt(row.skssMva, 2)}</td>
      <td style={styles.tdLeft}>
        <span
          style={styles.badge(row.status)}
          data-testid={`result-sc-bus-${row.busInternalId}-status`}
        >
          {row.status}
        </span>
      </td>
    </tr>
  );
}

function summarizeStatus(status: ShortCircuitResult["status"]): string {
  switch (status) {
    case "valid":
      return "valid";
    case "warning":
      return "warning";
    case "failed":
      return "failed";
  }
}
