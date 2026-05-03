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
 *   - `mode === "all_buses"` completeness check: any AppNetwork bus
 *     missing from the wire response yields a synthesized `E-SC-001`
 *     issue. Top-level status becomes `"failed"`. Partial wire rows
 *     still ship in `busResults` for diagnostic value.
 *   - Unknown wire rows (wire `internalId` not in AppNetwork) are NOT
 *     emitted as bus rows; a synthesized `E-SC-001` issue names the
 *     unknown id and top-level status becomes `"failed"`. The result
 *     type's `voltageLevelKv: number` invariant is preserved — no
 *     `null → 0` substitution ever happens.
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
  const projection = wireFailed
    ? { rows: [] as ShortCircuitBusResult[], syntheticIssues: [] as ShortCircuitIssue[] }
    : projectBusRows({
        appNetwork,
        request,
        responseRowsById,
        busById,
      });

  // Synthetic issues (response-completeness / unknown-bus diagnostics)
  // are appended AFTER the wire issues so the wire vocabulary stays
  // first when consumers iterate. They are still error-severity so the
  // top-level status flips to `failed` per the fail-closed rule
  // (spec §7.5.2 / §S3-OQ-02).
  const allIssues: ShortCircuitIssue[] = [
    ...issues,
    ...projection.syntheticIssues,
  ];
  const busResults = projection.rows;

  const status = deriveTopLevelStatus({
    wireFailed,
    busResults,
    issues: allIssues,
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
    issues: allIssues,
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
 * Walk every in-scope AppNetwork bus and either project the matching
 * wire row or synthesize an `unavailable` row, then validate the wire
 * response's completeness against `request.mode`.
 *
 * Spec §7.5.2 — mode-aware semantics:
 *   - `mode === "specific"`: AppNetwork buses missing from the wire
 *     response are synthesized as `unavailable` rows (non-targeted
 *     buses) without a top-level issue. Per spec §7.3, `unavailable`
 *     rows do NOT flip the top-level status.
 *   - `mode === "all_buses"`: every in-scope AppNetwork bus is
 *     implicitly targeted. A missing wire row is a sidecar response
 *     completeness mismatch — the orchestrator emits an `unavailable`
 *     row for the missing bus AND a structured top-level `E-SC-001`
 *     issue noting the discrepancy (spec §11.1 — "malformed sidecar
 *     response" applies). The error severity flips the top-level
 *     status to `"failed"` per the fail-closed rule (§S3-OQ-02), so
 *     incomplete `all_buses` output is never reported as `"valid"`.
 *
 * Unknown wire bus rows (Blocker 2 fix):
 *   - A wire row whose `internalId` is NOT in AppNetwork is a
 *     sidecar/AppNetwork desync that the wire structural guard cannot
 *     catch (the guard only validates shape). These rows are NOT
 *     normalized into `busResults` — fabricating a row would either
 *     require inventing `voltageLevelKv` (the result type is
 *     `number`, not `number | null`) or substituting a fake `0`,
 *     either of which violates the §S3-OQ-02 no-fake-numbers rule.
 *   - Instead, a structured `E-SC-001` issue is emitted naming the
 *     unknown `internalId` so the user can audit the desync, and the
 *     top-level status flips to `"failed"`.
 */
function projectBusRows(args: ProjectBusRowsArgs): {
  rows: ShortCircuitBusResult[];
  syntheticIssues: ShortCircuitIssue[];
} {
  const { appNetwork, request, responseRowsById } = args;
  const rows: ShortCircuitBusResult[] = [];
  const syntheticIssues: ShortCircuitIssue[] = [];

  const seen = new Set<string>();

  for (const bus of appNetwork.buses) {
    seen.add(bus.internalId);
    const wireRow = responseRowsById.get(bus.internalId);
    if (wireRow !== undefined) {
      rows.push({
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
    // Missing wire row for this AppNetwork bus.
    rows.push({
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
    if (request.mode === "all_buses") {
      // Spec §7.5.2: in `all_buses` mode every bus is implicitly
      // targeted. A missing row is a response completeness mismatch.
      syntheticIssues.push({
        code: "E-SC-001",
        severity: "error",
        message: `Sidecar response is incomplete: bus ${JSON.stringify(bus.internalId)} expected for mode='all_buses' but missing from response.`,
        internalId: bus.internalId,
      });
    }
  }

  // Unknown wire row (internalId not in AppNetwork). Do NOT fabricate
  // a normal app bus row — `voltageLevelKv` cannot be invented and we
  // must not substitute `0` for `null`. Surface the desync via a
  // structured issue and drop the row.
  for (const [internalId] of responseRowsById) {
    if (seen.has(internalId)) continue;
    syntheticIssues.push({
      code: "E-SC-001",
      severity: "error",
      message: `Sidecar response references unknown bus internalId ${JSON.stringify(internalId)} not present in AppNetwork.`,
      internalId,
    });
  }

  return { rows, syntheticIssues };
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
