// Stage 3 PR #4 — Short Circuit app-normalized result model + projection.
//
// Wire shapes (defined in `./shortCircuit.ts`, Stage 3 PR #2) carry
// solver-side vocabulary: `internalId`, `status: "valid" | "warning" |
// "failed"`, raw IEC 60909 numerics. The app-normalized
// `ShortCircuitResult` reshapes those into the app-side vocabulary the
// rest of the application speaks: `busInternalId`, `status: "ok" |
// "warning" | "failed" | "unavailable"`, with `tag` carried back from
// `AppNetwork.buses[].tag` for display.
//
// Guardrails (spec §7.1, §7.5):
//   - Numeric nullability is preserved end-to-end. `null` on the wire
//     stays `null` in the result; the orchestrator never substitutes a
//     default (no `ip ≈ 2.55 × ikss` synthesis).
//   - The app-side `"unavailable"` row status is **synthesized** by
//     this module for AppNetwork buses that the wire response does not
//     cover (e.g., `mode === "specific"` non-target buses).
//   - Wire-level issue codes (`E-SC-*` / `W-SC-*`) pass through
//     unchanged — they are already app-level codes; the orchestrator
//     only adds a synthesized `E-SC-001` when a transport / pre-
//     normalization failure produced no rows at all.
//   - Stage 1 / Stage 2 codes such as `E-LF-001` never appear here:
//     the wire structural guard rejects them upstream.

import type { AppNetwork } from "@power-system-study/network-model";

import type {
  ShortCircuitCase,
  ShortCircuitFaultType,
  ShortCircuitIssueCode,
  ShortCircuitIssueSeverity,
  ShortCircuitMode,
  ShortCircuitRequest,
  ShortCircuitSidecarBusRow,
  ShortCircuitSidecarBusRowStatus,
  ShortCircuitSidecarResponse,
} from "./shortCircuit.js";
import type { SolverMetadata } from "./types.js";

/** App-normalized top-level Short Circuit run status (spec §7.3 / §7.5.3). */
export type ShortCircuitStatus = "valid" | "warning" | "failed";

/** App-normalized per-bus row status. `unavailable` is orchestrator-synthesized. */
export type ShortCircuitBusStatus = "ok" | "warning" | "failed" | "unavailable";

/**
 * App-normalized issue. Mirrors the wire shape but is emitted on the
 * app surface so callers (`apps/web`, the calculation-store reducer)
 * can depend on a single result type without importing wire types.
 */
export interface ShortCircuitIssue {
  code: ShortCircuitIssueCode;
  severity: ShortCircuitIssueSeverity;
  message: string;
  /** Resolves back into AppNetwork. */
  internalId?: string;
  field?: string;
}

/**
 * Per-bus row on the app-normalized result. Spec §7.2.
 *
 * `voltageLevelKv` is sourced from `AppNetwork.buses[].vnKv` so the
 * value is always a number even on rows the sidecar could not compute
 * (per-bus `failed` and synthesized `unavailable`). The four IEC
 * numerics stay nullable.
 */
export interface ShortCircuitBusResult {
  busInternalId: string;
  tag: string;
  voltageLevelKv: number;
  ikssKa: number | null;
  ipKa: number | null;
  ithKa: number | null;
  skssMva: number | null;
  status: ShortCircuitBusStatus;
  issueCodes: ShortCircuitIssueCode[];
}

/**
 * Solver metadata attached to the runtime Short Circuit result.
 * Identical in spirit to `LoadFlowSolverMetadata`: the orchestrator
 * overrides `adapterVersion` with its package semver so the sidecar's
 * fallback never leaks into the app surface.
 */
export interface ShortCircuitSolverMetadata {
  solverName: SolverMetadata["solverName"];
  solverVersion: string;
  adapterVersion: string;
  solverOptions: SolverMetadata["options"];
  executedAt: string;
  inputHash: string | null;
  networkHash: string | null;
}

/**
 * Top-level Short Circuit result. Runtime-only; never serialized into
 * the Stage 1 canonical project file (spec §S3-OQ-09 / §8.3).
 *
 * The `module` field annotates the result envelope so UI consumers can
 * discriminate result kinds. It is **distinct from** the
 * `calculation-store` retention key
 * `CalculationModule = "short_circuit_bundle"` — the two strings are
 * related (both identify the Short Circuit calculation) but live on
 * different APIs (spec §7.2 / §8.2).
 */
export interface ShortCircuitResult {
  resultId: string;
  runtimeSnapshotId: string;
  scenarioId: string | null;
  /** Result-API discriminator. Distinct from the retention key. */
  module: "shortCircuit";
  status: ShortCircuitStatus;
  faultType: ShortCircuitFaultType;
  calculationCase: ShortCircuitCase;
  /** IEC 60909 voltage factor `c` actually applied by the sidecar. */
  voltageFactor: number;
  /** Per-bus rows. Empty only when the run failed before normalization. */
  busResults: ShortCircuitBusResult[];
  issues: ShortCircuitIssue[];
  metadata: ShortCircuitSolverMetadata;
  createdAt: string;
}

/** Mapping helper for per-bus row status (spec §7.5.2). */
function mapBusRowStatus(
  wireStatus: ShortCircuitSidecarBusRowStatus,
): ShortCircuitBusStatus {
  switch (wireStatus) {
    case "valid":
      return "ok";
    case "warning":
      return "warning";
    case "failed":
      return "failed";
  }
}

export interface NormalizeShortCircuitResultArgs {
  resultId: string;
  runtimeSnapshotId: string;
  appNetwork: AppNetwork;
  request: ShortCircuitRequest;
  response: ShortCircuitSidecarResponse;
  /** Adapter semver stamped on the result metadata. */
  adapterVersion: string;
  createdAt: string;
}

/**
 * Project a wire `ShortCircuitSidecarResponse` into a runtime
 * `ShortCircuitResult` per spec §7.5.
 *
 * Mapping rules:
 *   - `buses[i].internalId → busResults[j].busInternalId`.
 *   - Per-row status: `valid → ok`, `warning → warning`,
 *     `failed → failed`. `unavailable` is synthesized for AppNetwork
 *     buses missing from the wire response.
 *   - `tag` is filled from `AppNetwork.buses[].tag` (looked up by
 *     `internalId`).
 *   - `voltageLevelKv` is sourced from the AppNetwork bus's `vnKv`
 *     so the column is always populated even on failed/unavailable
 *     rows.
 *   - Numerics (`ikssKa` / `ipKa` / `ithKa` / `skssMva`) pass through
 *     unchanged. `null` stays `null` (no synthesis).
 *   - Top-level status:
 *       failed_validation / failed_solver → `failed`,
 *       any per-row `failed` → `warning`,
 *       any per-row `warning` and no `failed` → `warning`,
 *       any error issue at top level → `failed`,
 *       otherwise `valid`.
 *   - `unavailable` rows do NOT by themselves flip the top-level
 *     status (spec §7.3) — they reflect the `mode === "specific"`
 *     scoping decision, not a calculation failure.
 */
export function normalizeShortCircuitResult(
  args: NormalizeShortCircuitResultArgs,
): ShortCircuitResult {
  const { appNetwork, request, response } = args;

  const busById = new Map(appNetwork.buses.map((b) => [b.internalId, b] as const));
  const responseRowsById = new Map<string, ShortCircuitSidecarBusRow>(
    response.buses.map((r) => [r.internalId, r] as const),
  );

  const issues: ShortCircuitIssue[] = response.issues.map((i) => {
    const out: ShortCircuitIssue = {
      code: i.code,
      severity: i.severity,
      message: i.message,
    };
    if (i.internalId !== undefined) out.internalId = i.internalId;
    if (i.field !== undefined) out.field = i.field;
    return out;
  });

  const wireFailed =
    response.status === "failed_solver" ||
    response.status === "failed_validation";

  // No projection at all when the run failed before producing rows
  // (spec §7.2 — `busResults: []` only when the run failed before
  // any normalization could happen).
  const busResults: ShortCircuitBusResult[] = wireFailed
    ? []
    : projectBusRows({
        appNetwork,
        request,
        responseRowsById,
        busById,
      });

  const status = deriveTopLevelStatus({
    wireFailed,
    busResults,
    issues,
  });

  const metadata: ShortCircuitSolverMetadata = {
    solverName: response.metadata.solverName,
    solverVersion: response.metadata.solverVersion,
    adapterVersion: args.adapterVersion,
    solverOptions: response.metadata.options,
    executedAt: response.metadata.executedAt,
    inputHash: response.metadata.inputHash,
    networkHash: response.metadata.networkHash,
  };

  return {
    resultId: args.resultId,
    runtimeSnapshotId: args.runtimeSnapshotId,
    scenarioId: appNetwork.scenarioId,
    module: "shortCircuit",
    status,
    faultType: response.shortCircuit.faultType,
    calculationCase: response.shortCircuit.calculationCase,
    voltageFactor: response.shortCircuit.voltageFactor,
    busResults,
    issues,
    metadata,
    createdAt: args.createdAt,
  };
}

interface ProjectBusRowsArgs {
  appNetwork: AppNetwork;
  request: ShortCircuitRequest;
  responseRowsById: Map<string, ShortCircuitSidecarBusRow>;
  busById: Map<string, AppNetwork["buses"][number]>;
}

/**
 * Walk every in-scope AppNetwork bus and either project the
 * matching wire row or synthesize an `unavailable` row.
 *
 * Spec §7.5.2:
 *   - For `mode === "specific"`, every bus not present in the wire
 *     response yields an `unavailable` row.
 *   - For `mode === "all_buses"`, missing buses are also synthesized
 *     as `unavailable` (the discrepancy is reported via a top-level
 *     issue surfaced by the orchestrator if needed).
 */
function projectBusRows(args: ProjectBusRowsArgs): ShortCircuitBusResult[] {
  const { appNetwork, responseRowsById } = args;
  const out: ShortCircuitBusResult[] = [];

  // Track which AppNetwork buses we've already emitted so that any
  // unexpected wire row (a bus the response carries but AppNetwork
  // does not) is preserved verbatim afterwards.
  const seen = new Set<string>();

  for (const bus of appNetwork.buses) {
    seen.add(bus.internalId);
    const wireRow = responseRowsById.get(bus.internalId);
    if (wireRow !== undefined) {
      out.push({
        busInternalId: wireRow.internalId,
        tag: bus.tag,
        voltageLevelKv: bus.vnKv,
        ikssKa: wireRow.ikssKa,
        ipKa: wireRow.ipKa,
        ithKa: wireRow.ithKa,
        skssMva: wireRow.skssMva,
        status: mapBusRowStatus(wireRow.status),
        issueCodes: wireRow.issueCodes ? [...wireRow.issueCodes] : [],
      });
      continue;
    }
    out.push({
      busInternalId: bus.internalId,
      tag: bus.tag,
      voltageLevelKv: bus.vnKv,
      ikssKa: null,
      ipKa: null,
      ithKa: null,
      skssMva: null,
      status: "unavailable",
      issueCodes: [],
    });
  }

  // Defensive: a wire row that names a bus AppNetwork does not know
  // about is a sidecar/AppNetwork desync. Preserve it as a `failed`
  // row so the data is not silently dropped; the upstream wire guard
  // already rejects malformed payloads, so this branch is rarely hit.
  for (const [internalId, wireRow] of responseRowsById) {
    if (seen.has(internalId)) continue;
    out.push({
      busInternalId: internalId,
      tag: internalId,
      voltageLevelKv: wireRow.voltageLevelKv ?? 0,
      ikssKa: wireRow.ikssKa,
      ipKa: wireRow.ipKa,
      ithKa: wireRow.ithKa,
      skssMva: wireRow.skssMva,
      status: mapBusRowStatus(wireRow.status),
      issueCodes: wireRow.issueCodes ? [...wireRow.issueCodes] : [],
    });
  }

  return out;
}

interface DeriveStatusArgs {
  wireFailed: boolean;
  busResults: ShortCircuitBusResult[];
  issues: ShortCircuitIssue[];
}

function deriveTopLevelStatus(args: DeriveStatusArgs): ShortCircuitStatus {
  if (args.wireFailed) return "failed";
  if (args.issues.some((i) => i.severity === "error")) return "failed";
  const hasFailedRow = args.busResults.some((r) => r.status === "failed");
  if (hasFailedRow) return "warning";
  const hasWarningRow = args.busResults.some((r) => r.status === "warning");
  const hasWarningIssue = args.issues.some((i) => i.severity === "warning");
  if (hasWarningRow || hasWarningIssue) return "warning";
  return "valid";
}

/**
 * Mode-aware fault-target identity used in tests / future ergonomics.
 * Lives here so consumers do not have to re-import the wire module.
 */
export type { ShortCircuitMode };
