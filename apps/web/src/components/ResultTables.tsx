// Stage 2 PR #5 — Runtime result tables.
//
// Renders three tables that consume the runtime LoadFlowRunBundle:
//   1. Load Flow bus results (voltage %, voltage kV, angle, status)
//   2. Load Flow branch results (kind, from/to, current A, loading %,
//      P/Q flow, status)
//   3. Voltage Drop branch results (sending %, receiving %, drop %,
//      limit %, status)
//
// Guardrail: the tables ONLY render real numeric values that came
// from the solver (or the derived voltage-drop function). When a
// value is missing, they render an explicit em-dash, not a fabricated
// number — and the row's status reflects the missing input. The
// container hides itself entirely when no run has produced a result
// yet, so users never see empty placeholder rows.

import type {
  LoadFlowBranchResult,
  LoadFlowBusResult,
  LoadFlowResult,
  VoltageDropBranchResult,
  VoltageDropResult,
} from "@power-system-study/solver-adapter";

const styles = {
  wrapper: { display: "flex", flexDirection: "column" as const, gap: 12 },
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
      violation: { bg: "#fee2e2", fg: "#991b1b" },
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

function fmt(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function fmtSigned(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return (value >= 0 ? "+" : "") + value.toFixed(digits);
}

export interface ResultTablesProps {
  loadFlow: LoadFlowResult | null;
  voltageDrop: VoltageDropResult | null;
}

export function ResultTables({ loadFlow, voltageDrop }: ResultTablesProps) {
  if (!loadFlow) return null;
  return (
    <div style={styles.wrapper} data-testid="result-tables">
      <BusTable buses={loadFlow.busResults} />
      <BranchTable branches={loadFlow.branchResults} />
      <VoltageDropTable result={voltageDrop} />
    </div>
  );
}

function BusTable({ buses }: { buses: LoadFlowBusResult[] }) {
  return (
    <div style={styles.section} data-testid="result-table-buses">
      <div style={styles.sectionHeader}>
        <span>Load Flow — Bus Results</span>
        <span style={{ color: "#64748b", fontWeight: 400 }}>{buses.length} bus(es)</span>
      </div>
      {buses.length === 0 ? (
        <div style={styles.empty}>No bus rows in the result.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Bus</th>
              <th style={styles.th}>Voltage %</th>
              <th style={styles.th}>kV</th>
              <th style={styles.th}>Angle °</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {buses.map((b) => (
              <tr key={b.busInternalId} data-testid={`result-bus-${b.busInternalId}`}>
                <td style={styles.tdLeft}>{b.tag}</td>
                <td style={styles.td}>{fmt(b.voltagePuPct, 2)}</td>
                <td style={styles.td}>{fmt(b.voltageKv, 4)}</td>
                <td style={styles.td}>{fmtSigned(b.angleDeg, 2)}</td>
                <td style={styles.tdLeft}>
                  <span style={styles.badge(b.status)} data-testid={`result-bus-${b.busInternalId}-status`}>
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BranchTable({ branches }: { branches: LoadFlowBranchResult[] }) {
  return (
    <div style={styles.section} data-testid="result-table-branches">
      <div style={styles.sectionHeader}>
        <span>Load Flow — Branch Results</span>
        <span style={{ color: "#64748b", fontWeight: 400 }}>{branches.length} branch(es)</span>
      </div>
      {branches.length === 0 ? (
        <div style={styles.empty}>No branch rows in the result.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Branch</th>
              <th style={styles.th}>Kind</th>
              <th style={styles.th}>From</th>
              <th style={styles.th}>To</th>
              <th style={styles.th}>I (A)</th>
              <th style={styles.th}>Loading %</th>
              <th style={styles.th}>P (MW) from</th>
              <th style={styles.th}>Q (MVAr) from</th>
              <th style={styles.th}>Loss (kW)</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((br) => (
              <tr key={br.branchInternalId} data-testid={`result-branch-${br.branchInternalId}`}>
                <td style={styles.tdLeft}>{br.branchInternalId}</td>
                <td style={styles.tdLeft}>{br.branchKind}</td>
                <td style={styles.tdLeft}>{br.fromBusTag ?? br.fromBusInternalId}</td>
                <td style={styles.tdLeft}>{br.toBusTag ?? br.toBusInternalId}</td>
                <td style={styles.td}>{fmt(br.currentA, 2)}</td>
                <td style={styles.td}>{br.loadingPct === null ? "—" : fmt(br.loadingPct, 1)}</td>
                <td style={styles.td}>{fmtSigned(br.pMwFrom, 4)}</td>
                <td style={styles.td}>{fmtSigned(br.qMvarFrom, 4)}</td>
                <td style={styles.td}>{fmt(br.lossKw, 2)}</td>
                <td style={styles.tdLeft}>
                  <span style={styles.badge(br.status)} data-testid={`result-branch-${br.branchInternalId}-status`}>
                    {br.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VoltageDropTable({ result }: { result: VoltageDropResult | null }) {
  return (
    <div style={styles.section} data-testid="result-table-voltage-drop">
      <div style={styles.sectionHeader}>
        <span>Voltage Drop</span>
        <span style={{ color: "#64748b", fontWeight: 400 }}>
          {result ? `${result.branchResults.length} branch(es)` : "not derived"}
        </span>
      </div>
      {!result ? (
        <div style={styles.empty}>Voltage Drop derivation is disabled for this run.</div>
      ) : result.status === "failed" ? (
        <div style={styles.empty} data-testid="result-vd-failed">
          Voltage Drop unavailable — {result.issues.map((i) => i.code).join(", ") || "load flow invalid"}.
        </div>
      ) : result.branchResults.length === 0 ? (
        <div style={styles.empty}>No branch rows derived from the load flow.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Branch</th>
              <th style={styles.th}>Kind</th>
              <th style={styles.th}>Sending</th>
              <th style={styles.th}>Receiving</th>
              <th style={styles.th}>V_send %</th>
              <th style={styles.th}>V_recv %</th>
              <th style={styles.th}>Drop %</th>
              <th style={styles.th}>Limit %</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {result.branchResults.map((vd) => (
              <VoltageDropRow key={vd.branchInternalId} row={vd} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VoltageDropRow({ row }: { row: VoltageDropBranchResult }) {
  return (
    <tr data-testid={`result-vd-${row.branchInternalId}`}>
      <td style={styles.tdLeft}>{row.branchInternalId}</td>
      <td style={styles.tdLeft}>{row.branchKind}</td>
      <td style={styles.tdLeft}>
        {row.sendingBusInternalId
          ? row.sendingBusInternalId === row.fromBusInternalId
            ? row.fromBusTag ?? row.fromBusInternalId
            : row.toBusTag ?? row.toBusInternalId
          : "—"}
      </td>
      <td style={styles.tdLeft}>
        {row.receivingBusInternalId
          ? row.receivingBusInternalId === row.fromBusInternalId
            ? row.fromBusTag ?? row.fromBusInternalId
            : row.toBusTag ?? row.toBusInternalId
          : "—"}
      </td>
      <td style={styles.td}>
        {row.sendingEndVoltagePu === null ? "—" : (row.sendingEndVoltagePu * 100).toFixed(2)}
      </td>
      <td style={styles.td}>
        {row.receivingEndVoltagePu === null ? "—" : (row.receivingEndVoltagePu * 100).toFixed(2)}
      </td>
      <td style={styles.td}>{fmt(row.voltageDropPct, 2)}</td>
      <td style={styles.td}>{row.limitPct.toFixed(2)}</td>
      <td style={styles.tdLeft}>
        <span style={styles.badge(row.status)} data-testid={`result-vd-${row.branchInternalId}-status`}>
          {row.status}
        </span>
      </td>
    </tr>
  );
}
