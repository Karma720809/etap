// Stage 2 PR #5 — Voltage Drop result derivation.
//
// Per spec §7.1, Voltage Drop in Stage 2 MVP is **derived** from the
// same Load Flow run that produced the bus voltages and branch flows.
// There is no separate solver invocation. This module owns the pure
// derivation function plus the runtime result types.
//
// Guardrails honored:
//   - The result is runtime-only; never serialized into the Stage 1
//     project file (spec §10 / S2-OQ-06).
//   - `internalId` is preserved verbatim from `LoadFlowResult`/
//     `AppNetwork` back into every per-branch row.
//   - The branch vocabulary stays app-side (`cable | transformer`); no
//     pandapower vocabulary leaks here.
//   - Voltage Drop is never fabricated. When an endpoint voltage is
//     missing or a bus is absent from the Load Flow, the row is marked
//     `unavailable` and emits `E-VD-002` rather than inventing values.
//   - When the Load Flow itself is failed/invalid, derivation emits a
//     single `E-VD-001` issue and returns a `failed` result with no
//     branch rows (spec §7.4).
//
// The derivation is pure — no I/O, no clocks (createdAt is provided by
// the caller), no random IDs. Tests can pin every field.
//
// Direction (sending vs receiving) follows the spec §7.1 rule: the
// upstream end is the side with positive real-power inflow. We use
// `pMwFrom` from the `LoadFlowBranchResult`: when `pMwFrom >= 0`, the
// "from" bus is sending; otherwise the "to" bus is sending. This keeps
// `voltageDropPct` non-negative under physical, dissipative branches
// regardless of the canonical `fromBus`/`toBus` orientation.

import type { AppNetwork } from "@power-system-study/network-model";

import type {
  LoadFlowBranchKind,
  LoadFlowBranchResult,
  LoadFlowBusResult,
  LoadFlowResult,
} from "./results.js";

/** Default Voltage Drop limits (spec §7.2). */
export const DEFAULT_VOLTAGE_DROP_LIMIT_CABLE_PCT = 3.0;
export const DEFAULT_VOLTAGE_DROP_LIMIT_TRANSFORMER_PCT = 5.0;

/** Top-level Voltage Drop result status, mirrors `LoadFlowStatus`. */
export type VoltageDropStatus = "valid" | "warning" | "failed";

/**
 * Per-branch Voltage Drop row status. Spec §7.3.1 defines `ok |
 * warning | violation`; PR #5 adds `unavailable` to honor the
 * "no fake outputs" guardrail when an endpoint voltage is missing
 * (E-VD-002 input missing).
 */
export type VoltageDropBranchStatus =
  | "ok"
  | "warning"
  | "violation"
  | "unavailable";

/** Issue severity for Voltage Drop, identical to Load Flow's vocabulary. */
export type VoltageDropIssueSeverity = "error" | "warning";

/** Voltage Drop issue codes (spec §11). */
export type VoltageDropIssueCode =
  | "E-VD-001"
  | "E-VD-002"
  | "W-VD-001"
  | "W-VD-002";

export interface VoltageDropIssue {
  code: VoltageDropIssueCode;
  severity: VoltageDropIssueSeverity;
  message: string;
  /** Source equipment internalId (cable or transformer) when applicable. */
  internalId?: string;
  field?: string;
}

/** Per-branch derived Voltage Drop row. App vocabulary; runtime-only. */
export interface VoltageDropBranchResult {
  branchInternalId: string;
  /** Same identity as `branchInternalId` for cables/transformers. */
  sourceEquipmentInternalId: string;
  branchKind: LoadFlowBranchKind;
  fromBusInternalId: string;
  toBusInternalId: string;
  fromBusTag: string | null;
  toBusTag: string | null;
  /** Bus chosen as the upstream end based on real-power flow direction. */
  sendingBusInternalId: string | null;
  /** Bus chosen as the downstream end based on real-power flow direction. */
  receivingBusInternalId: string | null;
  /** Per-unit voltage at the sending bus (e.g., 0.99). Null when missing. */
  sendingEndVoltagePu: number | null;
  /** Per-unit voltage at the receiving bus. Null when missing. */
  receivingEndVoltagePu: number | null;
  /** Magnitude in volts at the sending bus (kV * 1000). Null when missing. */
  sendingEndVoltageV: number | null;
  /** Magnitude in volts at the receiving bus. Null when missing. */
  receivingEndVoltageV: number | null;
  /** Per-unit drop = sendingEndVoltagePu − receivingEndVoltagePu. */
  voltageDropPu: number | null;
  /** Volts drop = sendingEndVoltageV − receivingEndVoltageV. */
  voltageDropV: number | null;
  /** Percent drop = voltageDropV / sendingEndVoltageV * 100 (spec §7.1). */
  voltageDropPct: number | null;
  /** Limit used to classify the row (spec §7.2 defaults). */
  limitPct: number;
  status: VoltageDropBranchStatus;
  /** Issue codes attributed to this branch (E-VD-002 / W-VD-001 / W-VD-002). */
  issueCodes: VoltageDropIssueCode[];
}

/** Roll-up summary for the Voltage Drop result. */
export interface VoltageDropTotals {
  branchCount: number;
  okCount: number;
  warningCount: number;
  violationCount: number;
  unavailableCount: number;
  /** Largest per-branch drop %; null when no branch has a numeric drop. */
  maxVoltageDropPct: number | null;
}

/** Top-level Voltage Drop result, runtime-only. Spec §9 / §S2-OQ-05. */
export interface VoltageDropResult {
  /** Unique per derivation. */
  resultId: string;
  /** `LoadFlowResult.resultId` the derivation read its voltages from. */
  sourceLoadFlowResultId: string;
  /** Mirrors `LoadFlowResult.runtimeSnapshotId` for cross-module traceability. */
  runtimeSnapshotId: string;
  scenarioId: string | null;
  createdAt: string;
  status: VoltageDropStatus;
  branchResults: VoltageDropBranchResult[];
  issues: VoltageDropIssue[];
  totals: VoltageDropTotals;
  /**
   * Limits actually used for this run. Surface for the UI so the
   * "limit %" column is auditable without re-deriving the defaults.
   */
  limits: {
    cablePct: number;
    transformerPct: number;
  };
}

/** Options for `deriveVoltageDrop`. */
export interface DeriveVoltageDropOptions {
  /** Result identity. Caller-provided so tests can pin it. */
  resultId: string;
  /** Per-branch limit override for cables. Defaults to spec §7.2. */
  cableLimitPct?: number;
  /** Per-branch limit override for transformers. Defaults to spec §7.2. */
  transformerLimitPct?: number;
  /** ISO timestamp stamped on the result. */
  createdAt: string;
}

/**
 * Derive Voltage Drop from a normalized Load Flow result and the
 * AppNetwork that produced it.
 *
 * Spec §7 / §9 rules:
 *   - No second solver run; bus voltages and branch flow signs come
 *     directly from `loadFlow`.
 *   - Direction (sending vs receiving) follows the sign of `pMwFrom`.
 *   - Status uses spec §7.3.1 mapping with W-VD-002 in the 0.9 ≤ x ≤ 1
 *     band and W-VD-001 above the limit.
 *   - When `loadFlow.status === "failed"`, the derivation returns a
 *     failed result with E-VD-001 and no branches (spec §7.4).
 *   - When an endpoint voltage is missing (no Load Flow row for the
 *     bus), the branch row is `unavailable` and emits E-VD-002.
 */
export function deriveVoltageDrop(
  loadFlow: LoadFlowResult,
  appNetwork: AppNetwork,
  options: DeriveVoltageDropOptions,
): VoltageDropResult {
  const cableLimitPct = options.cableLimitPct ?? DEFAULT_VOLTAGE_DROP_LIMIT_CABLE_PCT;
  const transformerLimitPct =
    options.transformerLimitPct ?? DEFAULT_VOLTAGE_DROP_LIMIT_TRANSFORMER_PCT;

  // Spec §7.4: derivation cannot run when Load Flow is invalid.
  if (loadFlow.status === "failed") {
    return {
      resultId: options.resultId,
      sourceLoadFlowResultId: loadFlow.resultId,
      runtimeSnapshotId: loadFlow.runtimeSnapshotId,
      scenarioId: loadFlow.scenarioId,
      createdAt: options.createdAt,
      status: "failed",
      branchResults: [],
      issues: [
        {
          code: "E-VD-001",
          severity: "error",
          message:
            "Voltage Drop unavailable because the underlying Load Flow result is invalid (spec §7.4 / E-VD-001).",
        },
      ],
      totals: {
        branchCount: 0,
        okCount: 0,
        warningCount: 0,
        violationCount: 0,
        unavailableCount: 0,
        maxVoltageDropPct: null,
      },
      limits: { cablePct: cableLimitPct, transformerPct: transformerLimitPct },
    };
  }

  const busById = new Map<string, LoadFlowBusResult>(
    loadFlow.busResults.map((b) => [b.busInternalId, b] as const),
  );
  // Tag fallbacks pulled from the AppNetwork — `LoadFlowBusResult.tag`
  // already mirrors these, but we keep the AppNetwork lookup so tests
  // that hand-roll Load Flow results without tags still produce useful
  // table rows.
  const networkBusById = new Map(
    appNetwork.buses.map((b) => [b.internalId, b] as const),
  );

  const branchResults: VoltageDropBranchResult[] = [];
  const issues: VoltageDropIssue[] = [];

  for (const branch of loadFlow.branchResults) {
    const limitPct = branch.branchKind === "transformer" ? transformerLimitPct : cableLimitPct;

    // Direction from real-power flow: positive `pMwFrom` ⇒ sending = "from".
    const sendingIsFrom = branch.pMwFrom >= 0;
    const sendingBusId = sendingIsFrom ? branch.fromBusInternalId : branch.toBusInternalId;
    const receivingBusId = sendingIsFrom ? branch.toBusInternalId : branch.fromBusInternalId;

    const sendingBus = busById.get(sendingBusId);
    const receivingBus = busById.get(receivingBusId);

    if (
      sendingBus === undefined ||
      receivingBus === undefined ||
      !Number.isFinite(sendingBus.voltageKv) ||
      !Number.isFinite(receivingBus.voltageKv) ||
      sendingBus.voltageKv <= 0
    ) {
      const missing = sendingBus === undefined ? sendingBusId : receivingBusId;
      const issue: VoltageDropIssue = {
        code: "E-VD-002",
        severity: "error",
        message:
          `Voltage Drop input missing on branch '${branch.branchInternalId}': ` +
          `no Load Flow voltage for bus '${missing}' (spec §7 / E-VD-002).`,
        internalId: branch.branchInternalId,
      };
      issues.push(issue);
      branchResults.push(
        unavailableBranchRow(branch, networkBusById, limitPct, ["E-VD-002"]),
      );
      continue;
    }

    const sendingEndVoltagePu = sendingBus.voltagePuPct / 100;
    const receivingEndVoltagePu = receivingBus.voltagePuPct / 100;
    const sendingEndVoltageV = sendingBus.voltageKv * 1000;
    const receivingEndVoltageV = receivingBus.voltageKv * 1000;
    const voltageDropPu = sendingEndVoltagePu - receivingEndVoltagePu;
    const voltageDropV = sendingEndVoltageV - receivingEndVoltageV;
    // Spec §7.1: voltageDropPct = voltageDropV / sendingEndVoltageV * 100.
    const voltageDropPct = (voltageDropV / sendingEndVoltageV) * 100;
    const status = classifyDropStatus(voltageDropPct, limitPct);

    const issueCodes: VoltageDropIssueCode[] = [];
    if (status === "violation") {
      issueCodes.push("W-VD-001");
      issues.push({
        code: "W-VD-001",
        severity: "warning",
        message:
          `Voltage drop on branch '${branch.branchInternalId}' is ${voltageDropPct.toFixed(2)}% ` +
          `(limit ${limitPct.toFixed(2)}%).`,
        internalId: branch.branchInternalId,
      });
    } else if (status === "warning") {
      issueCodes.push("W-VD-002");
      issues.push({
        code: "W-VD-002",
        severity: "warning",
        message:
          `Voltage drop on branch '${branch.branchInternalId}' is ${voltageDropPct.toFixed(2)}% — ` +
          `within 90–100% of the ${limitPct.toFixed(2)}% limit.`,
        internalId: branch.branchInternalId,
      });
    }

    branchResults.push({
      branchInternalId: branch.branchInternalId,
      sourceEquipmentInternalId: branch.sourceEquipmentInternalId,
      branchKind: branch.branchKind,
      fromBusInternalId: branch.fromBusInternalId,
      toBusInternalId: branch.toBusInternalId,
      fromBusTag:
        branch.fromBusTag ?? networkBusById.get(branch.fromBusInternalId)?.tag ?? null,
      toBusTag:
        branch.toBusTag ?? networkBusById.get(branch.toBusInternalId)?.tag ?? null,
      sendingBusInternalId: sendingBusId,
      receivingBusInternalId: receivingBusId,
      sendingEndVoltagePu,
      receivingEndVoltagePu,
      sendingEndVoltageV,
      receivingEndVoltageV,
      voltageDropPu,
      voltageDropV,
      voltageDropPct,
      limitPct,
      status,
      issueCodes,
    });
  }

  const totals = computeTotals(branchResults);
  const status: VoltageDropStatus = deriveOverallStatus(branchResults, issues);

  return {
    resultId: options.resultId,
    sourceLoadFlowResultId: loadFlow.resultId,
    runtimeSnapshotId: loadFlow.runtimeSnapshotId,
    scenarioId: loadFlow.scenarioId,
    createdAt: options.createdAt,
    status,
    branchResults,
    issues,
    totals,
    limits: { cablePct: cableLimitPct, transformerPct: transformerLimitPct },
  };
}

function classifyDropStatus(
  voltageDropPct: number,
  limitPct: number,
): VoltageDropBranchStatus {
  if (!Number.isFinite(voltageDropPct) || !Number.isFinite(limitPct) || limitPct <= 0) {
    return "ok";
  }
  // Spec §7.1 expects voltageDropPct >= 0 for dissipative branches with
  // direction picked from real-power flow. Treat negative drops (e.g.,
  // capacitive rise on a lightly loaded cable) as |drop| against the
  // limit so the table still classifies them honestly.
  const magnitude = Math.abs(voltageDropPct);
  if (magnitude > limitPct) return "violation";
  if (magnitude > 0.9 * limitPct) return "warning";
  return "ok";
}

function unavailableBranchRow(
  branch: LoadFlowBranchResult,
  networkBusById: Map<string, { tag: string }>,
  limitPct: number,
  issueCodes: VoltageDropIssueCode[],
): VoltageDropBranchResult {
  return {
    branchInternalId: branch.branchInternalId,
    sourceEquipmentInternalId: branch.sourceEquipmentInternalId,
    branchKind: branch.branchKind,
    fromBusInternalId: branch.fromBusInternalId,
    toBusInternalId: branch.toBusInternalId,
    fromBusTag:
      branch.fromBusTag ?? networkBusById.get(branch.fromBusInternalId)?.tag ?? null,
    toBusTag:
      branch.toBusTag ?? networkBusById.get(branch.toBusInternalId)?.tag ?? null,
    sendingBusInternalId: null,
    receivingBusInternalId: null,
    sendingEndVoltagePu: null,
    receivingEndVoltagePu: null,
    sendingEndVoltageV: null,
    receivingEndVoltageV: null,
    voltageDropPu: null,
    voltageDropV: null,
    voltageDropPct: null,
    limitPct,
    status: "unavailable",
    issueCodes,
  };
}

function computeTotals(rows: VoltageDropBranchResult[]): VoltageDropTotals {
  let okCount = 0;
  let warningCount = 0;
  let violationCount = 0;
  let unavailableCount = 0;
  let maxVoltageDropPct: number | null = null;
  for (const r of rows) {
    switch (r.status) {
      case "ok":
        okCount += 1;
        break;
      case "warning":
        warningCount += 1;
        break;
      case "violation":
        violationCount += 1;
        break;
      case "unavailable":
        unavailableCount += 1;
        break;
    }
    if (r.voltageDropPct !== null && Number.isFinite(r.voltageDropPct)) {
      const magnitude = Math.abs(r.voltageDropPct);
      if (maxVoltageDropPct === null || magnitude > maxVoltageDropPct) {
        maxVoltageDropPct = magnitude;
      }
    }
  }
  return {
    branchCount: rows.length,
    okCount,
    warningCount,
    violationCount,
    unavailableCount,
    maxVoltageDropPct,
  };
}

function deriveOverallStatus(
  rows: VoltageDropBranchResult[],
  issues: VoltageDropIssue[],
): VoltageDropStatus {
  // Errors at the overall level only come from E-VD-001 (handled in the
  // failed-LF early return). Per-branch E-VD-002 reduces to a row-level
  // `unavailable`; the run as a whole is still "warning" because the
  // user has actionable signal (other branches may have results, and at
  // least one row is non-ok).
  if (issues.some((i) => i.severity === "error")) return "warning";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  if (rows.some((r) => r.status !== "ok")) return "warning";
  return "valid";
}
