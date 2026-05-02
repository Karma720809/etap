// Stage 3 PR #2 — Short Circuit contract / sidecar wire types.
//
// Authoritative TypeScript shape of the Short Circuit contract surface
// (`docs/stage-3/stage_3_short_circuit_mvp_spec.md` §5.3, §6.3, §11).
// The contract is solver-agnostic by design: pandapower element names
// must NOT appear here. The Python sidecar mirrors these shapes in
// `services/solver-sidecar/src/contracts.py`.
//
// Stage 3 PR #2 ships contract / sidecar-wire types only:
//   - request envelope (`ShortCircuitRequest`)
//   - sidecar response wire shape (`ShortCircuitSidecarResponse`)
//   - issue codes (`ShortCircuitIssueCode`)
// Real solver execution, the orchestrator
// (`runShortCircuitForAppNetwork`), the app-normalized result model
// (`ShortCircuitResult` / `ShortCircuitBusResult` /
// `ShortCircuitRunBundle`), runtime snapshot retention, and any UI
// wiring are deliberately out of scope here:
//   - PR #3 lands the sidecar `run_short_circuit` command and the
//     transport call.
//   - PR #4 lands the orchestrator + app-normalized result + retention.
//   - PR #5 lands the UI surfaces.

import type { SolverInput, SolverMetadata, SolverResultStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Sidecar command identifier
// ---------------------------------------------------------------------------

/**
 * The sidecar command name used over the stdio JSON-Lines transport.
 * The TypeScript adapter only carries the constant in PR #2; the
 * Python dispatcher and the transport call land in PR #3.
 */
export const SHORT_CIRCUIT_COMMAND = "run_short_circuit" as const;
export type ShortCircuitCommand = typeof SHORT_CIRCUIT_COMMAND;

// ---------------------------------------------------------------------------
// Request types — see spec §5.3
// ---------------------------------------------------------------------------

/** IEC 60909 fault type. MVP supports `"threePhase"` only (S3-OQ-03). */
export type ShortCircuitFaultType = "threePhase";

/** IEC 60909 calculation case. MVP supports `"maximum"` only (S3-OQ-02). */
export type ShortCircuitCase = "maximum";

/**
 * Whether to fault every in-scope bus or only the listed fault targets.
 * Mirrors the wire shape in spec §5.3.
 */
export type ShortCircuitMode = "all_buses" | "specific";

/**
 * A single fault target. Per S3-OQ-04, the target identity is the
 * Stage 1 canonical `Bus.internalId` — never a display tag.
 */
export interface ShortCircuitFaultTarget {
  /** Stage 1 `Bus.internalId`, preserved verbatim from `AppNetwork`. */
  busInternalId: string;
}

/**
 * Short Circuit calculation options sent over the wire.
 *
 * Note: the IEC 60909 voltage factor (`cmax` / `cmin`) is **not** an
 * option on the request envelope — for the MVP it is implicit in the
 * combination `calculationCase: "maximum"` + per-source
 * `SolverSource.voltageFactor`. The effective numeric `voltageFactor`
 * the sidecar applied is reported back on the response (see
 * `ShortCircuitSidecarMetadataBlock`).
 */
export interface ShortCircuitOptions {
  /** IEC 60909 fault type. MVP supports `"threePhase"` only. */
  faultType: ShortCircuitFaultType;
  /** IEC 60909 calculation case. MVP supports `"maximum"` only. */
  calculationCase: ShortCircuitCase;
  /** Compute peak short-circuit current `ip` per IEC 60909. */
  computePeak: boolean;
  /** Compute thermal-equivalent current `Ith` per IEC 60909. */
  computeThermal: boolean;
}

export const DEFAULT_SHORT_CIRCUIT_OPTIONS: ShortCircuitOptions = {
  faultType: "threePhase",
  calculationCase: "maximum",
  computePeak: true,
  computeThermal: true,
};

/**
 * Wire-format envelope sent to the sidecar's `run_short_circuit`
 * command. The Stage 2 `SolverInput` is reused verbatim — topology,
 * sources, transformers, lines, loads all come from there
 * (S3-OQ-07).
 *
 * - When `mode === "specific"`, `faultTargets` MUST be non-empty; an
 *   empty array maps to `E-SC-005` in PR #3.
 * - When `mode === "all_buses"`, `faultTargets` MAY be empty; the
 *   sidecar faults every in-scope `SolverBus`.
 */
export interface ShortCircuitRequest {
  solverInput: SolverInput;
  mode: ShortCircuitMode;
  faultTargets: ShortCircuitFaultTarget[];
  shortCircuitOptions: ShortCircuitOptions;
}

// ---------------------------------------------------------------------------
// Issue codes — see spec §11
// ---------------------------------------------------------------------------

export type ShortCircuitErrorCode =
  | "E-SC-001"
  | "E-SC-002"
  | "E-SC-003"
  | "E-SC-004"
  | "E-SC-005"
  | "E-SC-006";

export type ShortCircuitWarningCode = "W-SC-001" | "W-SC-002" | "W-SC-003";

export type ShortCircuitIssueCode = ShortCircuitErrorCode | ShortCircuitWarningCode;

export type ShortCircuitIssueSeverity = "error" | "warning";

/**
 * Wire-level issue carried on the sidecar response. The orchestrator
 * (PR #4) projects this onto the app-normalized `ShortCircuitIssue`
 * type; PR #2 only defines the wire shape.
 */
export interface ShortCircuitWireIssue {
  code: ShortCircuitIssueCode;
  severity: ShortCircuitIssueSeverity;
  message: string;
  /** Resolves back into `AppNetwork`. */
  internalId?: string;
  field?: string;
}

// ---------------------------------------------------------------------------
// Sidecar response (wire) types — see spec §6.3
// ---------------------------------------------------------------------------

/**
 * Per-bus row status as emitted by the sidecar. Note the wire
 * vocabulary `"valid" | "warning" | "failed"` is intentionally
 * different from the app-side `"ok" | "warning" | "failed" |
 * "unavailable"`; the app-side `"unavailable"` is synthesized by the
 * orchestrator (PR #4) for buses that were not in the fault target
 * set, so it never appears on the wire.
 */
export type ShortCircuitSidecarBusRowStatus = "valid" | "warning" | "failed";

/**
 * One per-bus row on the sidecar response (`buses[i]`).
 *
 * Numeric fields are nullable end-to-end (spec §7.1):
 * - `voltageLevelKv`: bus nominal voltage, may be null only when the
 *   sidecar could not compute it (per-row `failed`).
 * - `ikssKa`: initial symmetrical short-circuit current; null on
 *   per-row failure or pandapower NaN.
 * - `ipKa`: peak; null when `computePeak === false` or pandapower NaN.
 * - `ithKa`: thermal-equivalent; null when `computeThermal === false`
 *   or pandapower NaN.
 * - `skssMva`: initial symmetrical short-circuit apparent power; null
 *   on per-row failure or pandapower NaN.
 *
 * `issueCodes` is wire-level only — it carries `E-SC-*` / `W-SC-*`
 * codes attached to this row, not human-readable messages.
 */
export interface ShortCircuitSidecarBusRow {
  /** Stage 1 `Bus.internalId`, preserved verbatim. */
  internalId: string;
  voltageLevelKv: number | null;
  ikssKa: number | null;
  ipKa: number | null;
  ithKa: number | null;
  skssMva: number | null;
  status: ShortCircuitSidecarBusRowStatus;
  issueCodes?: ShortCircuitIssueCode[];
}

/**
 * The `shortCircuit` block on the response envelope (spec §6.3 / §6.4).
 * Records what the sidecar actually applied so retention consumers
 * (PR #4) can store it without re-deriving from inputs.
 */
export interface ShortCircuitSidecarMetadataBlock {
  calculationCase: ShortCircuitCase;
  faultType: ShortCircuitFaultType;
  computePeak: boolean;
  computeThermal: boolean;
  /** Effective IEC 60909 voltage factor applied by the sidecar. */
  voltageFactor: number;
}

/** Reuses the Stage 2 `SolverResultStatus` vocabulary on the wire. */
export type ShortCircuitSidecarResponseStatus = SolverResultStatus;

/**
 * Full sidecar response envelope (one JSON line on stdout) for
 * `run_short_circuit`. Mirrors spec §6.3.
 */
export interface ShortCircuitSidecarResponse {
  status: ShortCircuitSidecarResponseStatus;
  metadata: SolverMetadata;
  shortCircuit: ShortCircuitSidecarMetadataBlock;
  buses: ShortCircuitSidecarBusRow[];
  issues: ShortCircuitWireIssue[];
}

// ---------------------------------------------------------------------------
// Structural guards
// ---------------------------------------------------------------------------

const NUMERIC_BUS_FIELDS = ["voltageLevelKv", "ikssKa", "ipKa", "ithKa", "skssMva"] as const;

const ALLOWED_TOP_LEVEL_STATUSES: ReadonlySet<ShortCircuitSidecarResponseStatus> = new Set([
  "succeeded",
  "failed_validation",
  "failed_solver",
]);

const ALLOWED_BUS_ROW_STATUSES: ReadonlySet<ShortCircuitSidecarBusRowStatus> = new Set([
  "valid",
  "warning",
  "failed",
]);

const ALLOWED_ISSUE_SEVERITIES: ReadonlySet<ShortCircuitIssueSeverity> = new Set([
  "error",
  "warning",
]);

const ALLOWED_FAULT_TYPES: ReadonlySet<ShortCircuitFaultType> = new Set(["threePhase"]);

const ALLOWED_CALCULATION_CASES: ReadonlySet<ShortCircuitCase> = new Set(["maximum"]);

function isNullableFiniteNumber(value: unknown): boolean {
  if (value === null) return true;
  return typeof value === "number" && Number.isFinite(value);
}

function isMetadataShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta.solverName === "string" &&
    typeof meta.solverVersion === "string" &&
    typeof meta.adapterVersion === "string" &&
    typeof meta.executedAt === "string" &&
    typeof meta.options === "object" &&
    meta.options !== null
  );
}

function isShortCircuitMetadataBlock(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const sc = value as Record<string, unknown>;
  if (
    typeof sc.computePeak !== "boolean" ||
    typeof sc.computeThermal !== "boolean" ||
    typeof sc.voltageFactor !== "number" ||
    !Number.isFinite(sc.voltageFactor as number)
  ) {
    return false;
  }
  if (
    typeof sc.calculationCase !== "string" ||
    !ALLOWED_CALCULATION_CASES.has(sc.calculationCase as ShortCircuitCase)
  ) {
    return false;
  }
  if (
    typeof sc.faultType !== "string" ||
    !ALLOWED_FAULT_TYPES.has(sc.faultType as ShortCircuitFaultType)
  ) {
    return false;
  }
  return true;
}

function isShortCircuitSidecarBusRow(value: unknown): value is ShortCircuitSidecarBusRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.internalId !== "string" || row.internalId.length === 0) return false;
  if (
    typeof row.status !== "string" ||
    !ALLOWED_BUS_ROW_STATUSES.has(row.status as ShortCircuitSidecarBusRowStatus)
  ) {
    return false;
  }
  for (const field of NUMERIC_BUS_FIELDS) {
    if (!(field in row) || !isNullableFiniteNumber(row[field])) {
      return false;
    }
  }
  if ("issueCodes" in row && row.issueCodes !== undefined) {
    if (!Array.isArray(row.issueCodes)) return false;
    for (const code of row.issueCodes) {
      if (typeof code !== "string" || code.length === 0) return false;
    }
  }
  return true;
}

function isShortCircuitWireIssue(value: unknown): value is ShortCircuitWireIssue {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Record<string, unknown>;
  if (typeof issue.code !== "string" || issue.code.length === 0) return false;
  if (typeof issue.message !== "string") return false;
  if (
    typeof issue.severity !== "string" ||
    !ALLOWED_ISSUE_SEVERITIES.has(issue.severity as ShortCircuitIssueSeverity)
  ) {
    return false;
  }
  if ("internalId" in issue && issue.internalId !== undefined && typeof issue.internalId !== "string") {
    return false;
  }
  if ("field" in issue && issue.field !== undefined && typeof issue.field !== "string") {
    return false;
  }
  return true;
}

/**
 * Strict structural check on a `ShortCircuitSidecarResponse`.
 *
 * The orchestrator (PR #4) treats a `false` return as a transport
 * failure and synthesizes an `E-SC-001` issue rather than passing
 * malformed data to result normalization, so this guard MUST reject
 * any wire payload that does not match the contract exactly:
 *
 *   - top-level `status` is one of `"succeeded"`,
 *     `"failed_validation"`, `"failed_solver"`;
 *   - `metadata` is a Stage 2 `SolverMetadata` shape;
 *   - `shortCircuit.calculationCase === "maximum"`,
 *     `shortCircuit.faultType === "threePhase"`,
 *     `computePeak` / `computeThermal` are booleans, and
 *     `voltageFactor` is a finite number;
 *   - every entry of `buses` carries a non-empty string `internalId`,
 *     a row status from `"valid" | "warning" | "failed"` (the app-side
 *     `"unavailable"` is orchestrator-synthesized and MUST NOT appear
 *     on the wire), and `voltageLevelKv` / `ikssKa` / `ipKa` / `ithKa`
 *     / `skssMva` each present as either a finite number or `null`;
 *   - every entry of `issues` carries `code: string`,
 *     `severity: "error" | "warning"`, and `message: string`.
 *
 * `issueCodes` on a bus row is the only optional field; when present
 * it must be an array of non-empty strings.
 */
export function isShortCircuitSidecarResponse(
  value: unknown,
): value is ShortCircuitSidecarResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (
    typeof v.status !== "string" ||
    !ALLOWED_TOP_LEVEL_STATUSES.has(v.status as ShortCircuitSidecarResponseStatus)
  ) {
    return false;
  }

  if (!isMetadataShape(v.metadata)) return false;
  if (!isShortCircuitMetadataBlock(v.shortCircuit)) return false;

  if (!Array.isArray(v.buses)) return false;
  for (const row of v.buses) {
    if (!isShortCircuitSidecarBusRow(row)) return false;
  }

  if (!Array.isArray(v.issues)) return false;
  for (const issue of v.issues) {
    if (!isShortCircuitWireIssue(issue)) return false;
  }

  return true;
}
