// Stage 3 ED-PR-02 — Equipment Duty Check contract / result model.
//
// Type-only surface for the Equipment Duty Check engine. ED-PR-02
// ships the contract (TypeScript types + structural guards + helpers
// for typed result objects) without orchestrator, readiness wrapper,
// retention, sidecar, or UI wiring. Those land in ED-PR-03..05.
//
// Reading order (spec context for the type shapes here):
//   - `docs/stage-3/stage_3_equipment_duty_spec.md` §3 (OQ table) and
//     §5 (illustrative result-model sketch). The shapes below carry
//     the OQ decisions forward into a stable contract surface so the
//     orchestrator (ED-PR-03) and UI (ED-PR-04) can connect without
//     re-shaping the contract.
//
// Naming guardrails (spec §4.1, ED-OQ-01 / ED-OQ-04):
//   - The Stage 1 schema fields `Breaker.interruptingCapacityKa`,
//     `Breaker.peakWithstandKa`, `Switch.shortTimeWithstandKa` /
//     `peakWithstandKa`, `Bus.shortTimeWithstandKa` /
//     `peakWithstandKa`, and `Cable.shortCircuitKValue` are the
//     authoritative rating-field names. The contract here references
//     those concepts via the `criterion` discriminator below; it does
//     NOT introduce flat compound aliases such as `breakerMakingKa`,
//     `busPeakWithstandKa`, or `cableShortCircuitKValue` as discrete
//     fields, so there is exactly one source of truth for each rating
//     name.
//
// Scope guardrails (ED-PR-02 task brief):
//   - Contract / type surface only. Nothing in this file evaluates
//     duty, computes utilization, or fabricates numeric values.
//   - The status vocabulary (`pass | fail | missing_rating |
//     not_applicable | not_evaluated`) is the per-row outcome
//     vocabulary. Threshold-banded "warning" output (spec §4.5
//     ED-OQ-05) is expressed via `utilizationPct` plus orchestrator-
//     and UI-side derivation; the contract stays binary on the
//     pass/fail axis so callers cannot conflate "duty within rating
//     but close" with "duty exceeds rating".
//   - No project-file persistence. `DutyCheckResult` is a runtime
//     shape; the type-level retention slot in `calculation-store`
//     is widened in ED-PR-03, not here.

import type {
  RuntimeCalculationSnapshot,
  ShortCircuitRunBundle,
} from "@power-system-study/solver-adapter";

// ---------------------------------------------------------------------------
// Equipment categories (ED-OQ-01, ED-OQ-04)
// ---------------------------------------------------------------------------

/**
 * Equipment categories that participate in Equipment Duty Check. These
 * are the four Stage 1 `EquipmentKind` values that carry rating fields
 * comparable against IEC 60909 fault numerics: breaker (interrupt /
 * peak), switch (short-time withstand / peak), bus i.e. busbar
 * (short-time withstand / peak), and cable (thermal withstand).
 *
 * Switchgear assemblies, motors, generators, transformers, loads, and
 * placeholder kinds are out of scope for MVP duty check (spec §4.1
 * ED-OQ-01 + §7 non-goals).
 */
export type DutyCheckEquipmentKind = "breaker" | "switch" | "bus" | "cable";

/** Canonical list mirroring the `DutyCheckEquipmentKind` union. */
export const DUTY_CHECK_EQUIPMENT_KINDS = [
  "breaker",
  "switch",
  "bus",
  "cable",
] as const satisfies readonly DutyCheckEquipmentKind[];

// ---------------------------------------------------------------------------
// Criterion discriminator (ED-OQ-03 / ED-OQ-04 basis matrix)
// ---------------------------------------------------------------------------

/**
 * The specific rating criterion being checked on one row. The criterion
 * is the discriminator that pairs `dutyValue` with the corresponding
 * Stage 1 schema rating field (spec §4.1 / §4.3 / §4.4):
 *
 *   - `breakerInterrupting`         vs `Breaker.interruptingCapacityKa`
 *   - `breakerPeak`                 vs `Breaker.peakWithstandKa`
 *   - `switchShortTimeWithstand`    vs `Switch.shortTimeWithstandKa`
 *   - `switchPeak`                  vs `Switch.peakWithstandKa`
 *   - `busShortTimeWithstand`       vs `Bus.shortTimeWithstandKa`
 *   - `busPeak`                     vs `Bus.peakWithstandKa`
 *   - `cableThermalWithstand`       vs derived I²t from
 *                                       `Cable.shortCircuitKValue` and
 *                                       `Cable.crossSectionMm2`
 *
 * The unit of `dutyValue` / `ratingValue` / `marginValue` on the
 * `DutyCheckEquipmentResult` is determined by the criterion — kA RMS
 * symmetrical for `*ShortTimeWithstand` and `breakerInterrupting`,
 * kA peak for `*Peak`, A²·s for `cableThermalWithstand`. Consumers
 * read the unit off the criterion rather than off a separate field.
 */
export type DutyCheckCriterion =
  | "breakerInterrupting"
  | "breakerPeak"
  | "switchShortTimeWithstand"
  | "switchPeak"
  | "busShortTimeWithstand"
  | "busPeak"
  | "cableThermalWithstand";

/** Canonical list mirroring the `DutyCheckCriterion` union. */
export const DUTY_CHECK_CRITERIA = [
  "breakerInterrupting",
  "breakerPeak",
  "switchShortTimeWithstand",
  "switchPeak",
  "busShortTimeWithstand",
  "busPeak",
  "cableThermalWithstand",
] as const satisfies readonly DutyCheckCriterion[];

// ---------------------------------------------------------------------------
// Per-row status vocabulary
// ---------------------------------------------------------------------------

/**
 * Per-row Equipment Duty Check status. Five values, each with a
 * distinct reason for being present:
 *
 *   - `pass`            — duty was computed and is at or below rating.
 *   - `fail`            — duty was computed and exceeds rating.
 *   - `missing_rating`  — equipment lacks the rating field for this
 *                         criterion (`W-DC-001`). The row is emitted
 *                         so the user sees an explicit "no rating
 *                         recorded" cell rather than a silent drop.
 *   - `not_applicable`  — the criterion does not apply to this
 *                         equipment / configuration (e.g., a breaker
 *                         row whose `peakWithstandKa` is intentionally
 *                         absent). Distinct from `missing_rating`:
 *                         absent peak rating on a breaker is opt-out,
 *                         not a data gap.
 *   - `not_evaluated`   — orchestrator did not evaluate this row in
 *                         the run that produced the result (e.g.,
 *                         pre-orchestrator placeholder). Distinct
 *                         from `missing_rating`: data may be
 *                         complete; the run simply did not reach
 *                         this row.
 *
 * Threshold-banded "warning" semantics (spec §4.5 ED-OQ-05) are
 * deliberately NOT a status value: a row whose utilization sits in
 * the 90–100 % band is a `pass` whose `utilizationPct` lets the UI
 * render a warning badge. Keeping pass/fail binary on the status
 * axis prevents future PRs from conflating "close to rating" with
 * "over rating" in retention or in serialized snapshots.
 */
export type DutyCheckStatus =
  | "pass"
  | "fail"
  | "missing_rating"
  | "not_applicable"
  | "not_evaluated";

/** Canonical list mirroring the `DutyCheckStatus` union. */
export const DUTY_CHECK_STATUSES = [
  "pass",
  "fail",
  "missing_rating",
  "not_applicable",
  "not_evaluated",
] as const satisfies readonly DutyCheckStatus[];

/**
 * Whether the basis used to derive `dutyValue` is fully computed from
 * explicit project inputs (`verified`) or relied on a fallback /
 * project-level default (`provisional`). Per spec §4.3 / §4.4 the
 * provisional rows always carry a `W-DC-002` (Ik'' fallback) or
 * `W-DC-003` (default `faultClearingS`) issue code so the audit trail
 * records the reason.
 */
export type DutyCheckVerdictBasis = "verified" | "provisional";

/** Canonical list mirroring the `DutyCheckVerdictBasis` union. */
export const DUTY_CHECK_VERDICT_BASES = [
  "verified",
  "provisional",
] as const satisfies readonly DutyCheckVerdictBasis[];

// ---------------------------------------------------------------------------
// Top-level run status
// ---------------------------------------------------------------------------

/**
 * Top-level `DutyCheckResult.status`. Mirrors the Short Circuit run
 * status vocabulary (`valid | warning | failed`) so the runtime
 * `CalculationStatusPanel` can render duty results with the same
 * machinery (spec §4.2 ED-OQ-02 + §4.5 ED-OQ-05):
 *
 *   - `valid`   — every row is `pass` and no top-level issue has
 *                 severity `warning`.
 *   - `warning` — at least one row is `missing_rating`,
 *                 `not_applicable`, `not_evaluated`, or `pass` with a
 *                 `provisional` verdict basis or threshold-band
 *                 warning, AND no row is `fail` AND no top-level
 *                 issue has severity `error` (none in MVP).
 *   - `failed`  — at least one row is `fail`, OR the upstream
 *                 `ShortCircuitResult.status === "failed"`, OR the
 *                 readiness wrapper rejected the run.
 *
 * The exact derivation lives in the orchestrator (ED-PR-03); the
 * contract here only declares the literal alphabet.
 */
export type DutyCheckRunStatus = "valid" | "warning" | "failed";

/** Canonical list mirroring the `DutyCheckRunStatus` union. */
export const DUTY_CHECK_RUN_STATUSES = [
  "valid",
  "warning",
  "failed",
] as const satisfies readonly DutyCheckRunStatus[];

// ---------------------------------------------------------------------------
// Diagnostic codes
// ---------------------------------------------------------------------------

/**
 * Equipment Duty Check diagnostic / reason codes.
 *
 * Warning codes (spec §6, ED-OQ-02 / ED-OQ-03 / ED-OQ-04):
 *   - `W-DC-001` — equipment rating field missing on a ratable
 *                  element. Pairs with `status: "missing_rating"`.
 *   - `W-DC-002` — breaker interrupting duty derived from `Ik''`
 *                  fallback rather than `Ib`. Pairs with
 *                  `verdictBasis: "provisional"` on a `pass`/`fail`
 *                  row.
 *   - `W-DC-003` — thermal / cable-withstand duty computed using the
 *                  project-level default `faultClearingS` rather than
 *                  per-zone protection clearing time. Pairs with
 *                  `verdictBasis: "provisional"` on a `pass`/`fail`
 *                  row.
 *
 * Info codes (this PR, ED-PR-02 contract surface):
 *   - `I-DC-001` — criterion not applicable for this equipment /
 *                  configuration. Pairs with
 *                  `status: "not_applicable"`.
 *   - `I-DC-002` — row present but not yet evaluated by the
 *                  orchestrator. Pairs with
 *                  `status: "not_evaluated"`.
 *
 * No `E-DC-*` codes in MVP: every duty failure mode is per-row
 * (`fail`) or upstream (e.g., a `ShortCircuitResult.status === "failed"`
 * already surfaces the upstream error). See spec §6.
 */
export type DutyCheckWarningCode = "W-DC-001" | "W-DC-002" | "W-DC-003";
export type DutyCheckInfoCode = "I-DC-001" | "I-DC-002";
export type DutyCheckIssueCode = DutyCheckWarningCode | DutyCheckInfoCode;

/** Severity of a `DutyCheckIssue`. Mirrors Stage 3 Short Circuit. */
export type DutyCheckIssueSeverity = "warning" | "info";

/**
 * Canonical list of valid Equipment Duty Check issue codes (warnings
 * first, then info). Single source of truth for the structural guard
 * (`isDutyCheckIssueCode`) and any consumer that needs to iterate the
 * contract codes. The `satisfies readonly DutyCheckIssueCode[]` clause
 * makes the compiler reject this list if a code is added to or removed
 * from the unions without updating this constant — keeping the runtime
 * set in lockstep with the type-level set.
 */
export const DUTY_CHECK_ISSUE_CODES = [
  "W-DC-001",
  "W-DC-002",
  "W-DC-003",
  "I-DC-001",
  "I-DC-002",
] as const satisfies readonly DutyCheckIssueCode[];

/**
 * App-level Equipment Duty Check issue. Mirrors the Stage 3 Short
 * Circuit `ShortCircuitIssue` shape so consumers can iterate
 * `result.issues` with one type contract regardless of module.
 */
export interface DutyCheckIssue {
  code: DutyCheckIssueCode;
  severity: DutyCheckIssueSeverity;
  message: string;
  /** Resolves back into AppNetwork (equipment internalId or bus internalId). */
  internalId?: string;
  field?: string;
}

// ---------------------------------------------------------------------------
// Per-row equipment result
// ---------------------------------------------------------------------------

/**
 * One per-equipment / per-criterion row on a `DutyCheckResult`. A
 * single equipment may emit multiple rows (e.g., a breaker emits one
 * `breakerInterrupting` row and, when applicable, one `breakerPeak`
 * row); each row is independently statused.
 *
 * Numeric nullability invariants (spec §4.2 ED-OQ-02 +
 * §S3-OQ-02 "no fake numbers"):
 *
 *   - `dutyValue`   — `null` whenever the orchestrator did not
 *                     compute a duty for this row. Always `null` for
 *                     `not_evaluated` and `not_applicable`. Always
 *                     `null` for `missing_rating` rows when the
 *                     missing rating is the only blocker the
 *                     orchestrator chose to short-circuit on; may
 *                     carry a value for `missing_rating` rows where
 *                     the duty was nonetheless computed for audit.
 *                     The orchestrator never substitutes `0` for a
 *                     missing computation.
 *   - `ratingValue` — `null` for `missing_rating`. Otherwise the
 *                     equipment's rating in the criterion's natural
 *                     unit (kA RMS sym for `*Interrupting` /
 *                     `*ShortTimeWithstand`; kA peak for `*Peak`;
 *                     A²·s for `cableThermalWithstand`).
 *   - `utilizationPct` — `dutyValue / ratingValue × 100` when both
 *                     are non-null and `ratingValue > 0`. `null`
 *                     otherwise. Cable thermal rows use the spec
 *                     square-root form; the contract only stores the
 *                     final percentage.
 *   - `marginValue` — `ratingValue − dutyValue` in the criterion's
 *                     natural unit when both are non-null. `null`
 *                     otherwise.
 */
export interface DutyCheckEquipmentResult {
  /** Stage 1 canonical equipment internalId. Resolves back into AppNetwork. */
  equipmentInternalId: string;
  equipmentKind: DutyCheckEquipmentKind;
  /** Discriminates which rating criterion is being checked. */
  criterion: DutyCheckCriterion;
  /**
   * Stage 1 canonical bus internalId for the bus whose fault current
   * drives this row's duty. `null` when the row is `not_evaluated`,
   * `not_applicable`, or `missing_rating` and no driving bus was
   * resolved.
   */
  faultBusInternalId: string | null;
  /**
   * Result identity of the upstream `ShortCircuitResult` that
   * supplied the fault current numerics for this row. Resolves back
   * into `retainedResults["short_circuit_bundle"].bundle.shortCircuit.resultId`.
   * `null` when the row was emitted before any upstream result was
   * consumed (e.g., orchestrator placeholder for a `not_evaluated`
   * row).
   */
  shortCircuitResultId: string | null;
  /**
   * Optional fault-case sub-discriminator for future per-fault-target
   * sub-cases (ED-FU-07). MVP always emits `null`; the contract
   * carries the field so future PRs can extend without reshaping.
   */
  faultCaseId: string | null;
  /**
   * Computed duty in the criterion's natural unit (see
   * `DutyCheckCriterion`). `null` when the orchestrator did not
   * compute a duty for this row.
   */
  dutyValue: number | null;
  /**
   * Equipment rating in the criterion's natural unit. `null` for
   * `missing_rating` rows.
   */
  ratingValue: number | null;
  /** dutyValue / ratingValue × 100. `null` when not computable. */
  utilizationPct: number | null;
  /** ratingValue − dutyValue in the criterion's natural unit. `null` when not computable. */
  marginValue: number | null;
  status: DutyCheckStatus;
  verdictBasis: DutyCheckVerdictBasis;
  /** Diagnostic / reason codes attached to this row. May be empty for `pass`. */
  issueCodes: DutyCheckIssueCode[];
}

// ---------------------------------------------------------------------------
// Run options + metadata
// ---------------------------------------------------------------------------

/**
 * Per-run Equipment Duty Check options. The orchestrator (ED-PR-03)
 * snapshots the resolved values onto `DutyCheckResult.metadata.options`
 * so retention can replay the exact basis defaults without consulting
 * project state.
 *
 * MVP options are basis overrides only. Fields are optional; absence
 * means "use the spec-defined default" (spec §4.3 / §4.4):
 *
 *   - `tminS` defaults to 0.05 s (IEC 60909-0 minimum delay).
 *   - `faultClearingS` defaults to 0.5 s (project-level default for
 *     thermal / cable-withstand duty until per-zone protection
 *     coordination ships, ED-FU-04).
 */
export interface DutyCheckOptions {
  /** Override `tmin` for breaker `Ib` derivation (s). */
  tminS?: number;
  /** Override the project-level default fault clearing time (s). */
  faultClearingS?: number;
}

/**
 * Basis defaults that were actually used for the run. Recorded on
 * `DutyCheckResult.metadata.basis` so audit consumers (UI tooltip,
 * future report exporter) can show the exact `tmin` / `t_clearing`
 * values without re-deriving them from project state at display time.
 */
export interface DutyCheckResultMetadataBasis {
  /** Effective `tmin` used for breaker `Ib` derivation (s). */
  tminS: number;
  /** Effective project-level fault clearing time (s). */
  faultClearingS: number;
}

/**
 * Solver metadata attached to `DutyCheckResult`. Mirrors the Stage 2
 * `LoadFlowSolverMetadata` / Stage 3 `ShortCircuitSolverMetadata`
 * shape so retention consumers can iterate result metadata with one
 * common contract — but pins `solverName` to the literal
 * `"duty-check"` because Equipment Duty has no sidecar engine
 * (spec §5 note + §4.6 ED-OQ-06: pure TypeScript over an
 * already-normalized `ShortCircuitResult`).
 *
 * `inputHash` / `networkHash` are reserved for future deduplication
 * (mirrors the Stage 2 `appNetworkHash` / `solverInputHash` reservation);
 * MVP leaves them `null`.
 */
export interface DutyCheckSolverMetadata {
  solverName: "duty-check";
  /** Semver of `@power-system-study/duty-check`. */
  solverVersion: string;
  /** Semver of the surrounding adapter package. */
  adapterVersion: string;
  /** ISO timestamp the run executed. */
  executedAt: string;
  /** Hash of the input bundle. `null` for MVP. */
  inputHash: string | null;
  /** Hash of the AppNetwork the run consumed. `null` for MVP. */
  networkHash: string | null;
  /** Snapshot of the run options (post-default resolution). */
  options: DutyCheckOptions;
  /** Basis defaults the run actually consumed. */
  basis: DutyCheckResultMetadataBasis;
}

// ---------------------------------------------------------------------------
// Top-level result + run bundle
// ---------------------------------------------------------------------------

/**
 * Top-level Equipment Duty Check result. Runtime-only; never
 * serialized into the Stage 1 canonical project file (spec §4.6 +
 * §10 guardrails).
 *
 * The `module` field annotates the result envelope so UI consumers
 * can discriminate result kinds. It is **distinct from** the
 * `calculation-store` retention key
 * `CalculationModule = "duty_check_bundle"` (added in ED-PR-03) —
 * the two strings are related (both identify the Equipment Duty
 * calculation) but live on different APIs, mirroring the
 * Short Circuit `module: "shortCircuit"` vs
 * `"short_circuit_bundle"` split (spec §7.2 / §8.2).
 */
export interface DutyCheckResult {
  resultId: string;
  runtimeSnapshotId: string;
  scenarioId: string | null;
  /** Result-API discriminator. Distinct from the retention key. */
  module: "dutyCheck";
  status: DutyCheckRunStatus;
  /**
   * Resolves back to the upstream `ShortCircuitResult.resultId` that
   * supplied the per-bus fault numerics consumed by every per-row
   * computation. `null` when the run was emitted without consuming an
   * upstream result (e.g., readiness rejected the run before
   * orchestration started).
   */
  sourceShortCircuitResultId: string | null;
  /** Per-equipment / per-criterion rows. */
  equipmentResults: DutyCheckEquipmentResult[];
  /** Top-level issues. May be empty when every row is `pass`. */
  issues: DutyCheckIssue[];
  metadata: DutyCheckSolverMetadata;
  createdAt: string;
}

/**
 * Outcome of an Equipment Duty Check run.
 *
 * Held by-value in memory. Equipment Duty does not persist any of
 * these to disk (spec §10 guardrails inherited from Stage 2 §S2-FU-07
 * and Stage 3 §S3-OQ-09). The bundle pairs the runtime
 * `DutyCheckResult` with the `RuntimeCalculationSnapshot` it was
 * produced over and the `ShortCircuitRunBundle` whose result the duty
 * check consumed — so retention keeps the cross-module link explicit
 * without reaching back into the Short Circuit retention slot at
 * read time.
 */
export interface DutyCheckRunBundle {
  dutyCheck: DutyCheckResult;
  snapshot: RuntimeCalculationSnapshot;
  /** The Short Circuit run whose result this duty check consumed. */
  shortCircuit: ShortCircuitRunBundle;
}

// ---------------------------------------------------------------------------
// Structural guards (helpers for typed result objects)
// ---------------------------------------------------------------------------

const DUTY_CHECK_EQUIPMENT_KIND_SET: ReadonlySet<DutyCheckEquipmentKind> = new Set(
  DUTY_CHECK_EQUIPMENT_KINDS,
);

const DUTY_CHECK_CRITERION_SET: ReadonlySet<DutyCheckCriterion> = new Set(
  DUTY_CHECK_CRITERIA,
);

const DUTY_CHECK_STATUS_SET: ReadonlySet<DutyCheckStatus> = new Set(
  DUTY_CHECK_STATUSES,
);

const DUTY_CHECK_VERDICT_BASIS_SET: ReadonlySet<DutyCheckVerdictBasis> = new Set(
  DUTY_CHECK_VERDICT_BASES,
);

const DUTY_CHECK_RUN_STATUS_SET: ReadonlySet<DutyCheckRunStatus> = new Set(
  DUTY_CHECK_RUN_STATUSES,
);

const DUTY_CHECK_ISSUE_CODE_SET: ReadonlySet<DutyCheckIssueCode> = new Set(
  DUTY_CHECK_ISSUE_CODES,
);

/**
 * Pairing table between a row's `criterion` and the equipment kind it
 * applies to. Used by `isDutyCheckEquipmentResult` to reject rows
 * whose criterion does not match the declared equipment kind (e.g.,
 * a `cableThermalWithstand` row tagged `equipmentKind: "breaker"`).
 *
 * Exported so orchestrator (ED-PR-03) and UI (ED-PR-04) can iterate
 * the legal pairings without re-deriving them from the criterion
 * string.
 */
export const DUTY_CHECK_CRITERION_TO_EQUIPMENT_KIND: {
  readonly [K in DutyCheckCriterion]: DutyCheckEquipmentKind;
} = {
  breakerInterrupting: "breaker",
  breakerPeak: "breaker",
  switchShortTimeWithstand: "switch",
  switchPeak: "switch",
  busShortTimeWithstand: "bus",
  busPeak: "bus",
  cableThermalWithstand: "cable",
};

export function isDutyCheckEquipmentKind(
  value: unknown,
): value is DutyCheckEquipmentKind {
  return (
    typeof value === "string" &&
    DUTY_CHECK_EQUIPMENT_KIND_SET.has(value as DutyCheckEquipmentKind)
  );
}

export function isDutyCheckCriterion(
  value: unknown,
): value is DutyCheckCriterion {
  return (
    typeof value === "string" &&
    DUTY_CHECK_CRITERION_SET.has(value as DutyCheckCriterion)
  );
}

export function isDutyCheckStatus(value: unknown): value is DutyCheckStatus {
  return (
    typeof value === "string" &&
    DUTY_CHECK_STATUS_SET.has(value as DutyCheckStatus)
  );
}

export function isDutyCheckVerdictBasis(
  value: unknown,
): value is DutyCheckVerdictBasis {
  return (
    typeof value === "string" &&
    DUTY_CHECK_VERDICT_BASIS_SET.has(value as DutyCheckVerdictBasis)
  );
}

export function isDutyCheckRunStatus(
  value: unknown,
): value is DutyCheckRunStatus {
  return (
    typeof value === "string" &&
    DUTY_CHECK_RUN_STATUS_SET.has(value as DutyCheckRunStatus)
  );
}

export function isDutyCheckIssueCode(
  value: unknown,
): value is DutyCheckIssueCode {
  return (
    typeof value === "string" &&
    DUTY_CHECK_ISSUE_CODE_SET.has(value as DutyCheckIssueCode)
  );
}

function isFiniteOrNull(value: unknown): boolean {
  if (value === null) return true;
  return typeof value === "number" && Number.isFinite(value);
}

function isStringOrNull(value: unknown): boolean {
  return value === null || typeof value === "string";
}

export function isDutyCheckIssue(value: unknown): value is DutyCheckIssue {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Record<string, unknown>;
  if (!isDutyCheckIssueCode(issue.code)) return false;
  if (typeof issue.message !== "string") return false;
  if (issue.severity !== "warning" && issue.severity !== "info") return false;
  if (
    "internalId" in issue &&
    issue.internalId !== undefined &&
    typeof issue.internalId !== "string"
  ) {
    return false;
  }
  if (
    "field" in issue &&
    issue.field !== undefined &&
    typeof issue.field !== "string"
  ) {
    return false;
  }
  return true;
}

const NUMERIC_ROW_FIELDS = [
  "dutyValue",
  "ratingValue",
  "utilizationPct",
  "marginValue",
] as const;

/**
 * Strict structural check on a `DutyCheckEquipmentResult`. Used by
 * `isDutyCheckResult` and exported so retention / UI tests can assert
 * row shape independently of the envelope.
 *
 * Rejects rows whose `criterion` does not pair with the declared
 * `equipmentKind` per `DUTY_CHECK_CRITERION_TO_EQUIPMENT_KIND` so the
 * contract cannot quietly admit a `cableThermalWithstand` row tagged
 * `equipmentKind: "breaker"`.
 */
export function isDutyCheckEquipmentResult(
  value: unknown,
): value is DutyCheckEquipmentResult {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.equipmentInternalId !== "string" || row.equipmentInternalId.length === 0) {
    return false;
  }
  if (!isDutyCheckEquipmentKind(row.equipmentKind)) return false;
  if (!isDutyCheckCriterion(row.criterion)) return false;
  if (
    DUTY_CHECK_CRITERION_TO_EQUIPMENT_KIND[row.criterion as DutyCheckCriterion] !==
    row.equipmentKind
  ) {
    return false;
  }
  if (!isStringOrNull(row.faultBusInternalId)) return false;
  if (!isStringOrNull(row.shortCircuitResultId)) return false;
  if (!isStringOrNull(row.faultCaseId)) return false;
  for (const field of NUMERIC_ROW_FIELDS) {
    if (!(field in row) || !isFiniteOrNull(row[field])) return false;
  }
  if (!isDutyCheckStatus(row.status)) return false;
  if (!isDutyCheckVerdictBasis(row.verdictBasis)) return false;
  if (!Array.isArray(row.issueCodes)) return false;
  for (const code of row.issueCodes) {
    if (!isDutyCheckIssueCode(code)) return false;
  }
  return true;
}

function isDutyCheckOptions(value: unknown): value is DutyCheckOptions {
  if (typeof value !== "object" || value === null) return false;
  const opts = value as Record<string, unknown>;
  if (
    "tminS" in opts &&
    opts.tminS !== undefined &&
    !(typeof opts.tminS === "number" && Number.isFinite(opts.tminS))
  ) {
    return false;
  }
  if (
    "faultClearingS" in opts &&
    opts.faultClearingS !== undefined &&
    !(typeof opts.faultClearingS === "number" && Number.isFinite(opts.faultClearingS))
  ) {
    return false;
  }
  return true;
}

function isDutyCheckResultMetadataBasis(
  value: unknown,
): value is DutyCheckResultMetadataBasis {
  if (typeof value !== "object" || value === null) return false;
  const basis = value as Record<string, unknown>;
  return (
    typeof basis.tminS === "number" &&
    Number.isFinite(basis.tminS) &&
    typeof basis.faultClearingS === "number" &&
    Number.isFinite(basis.faultClearingS)
  );
}

function isDutyCheckSolverMetadata(
  value: unknown,
): value is DutyCheckSolverMetadata {
  if (typeof value !== "object" || value === null) return false;
  const meta = value as Record<string, unknown>;
  if (meta.solverName !== "duty-check") return false;
  if (typeof meta.solverVersion !== "string") return false;
  if (typeof meta.adapterVersion !== "string") return false;
  if (typeof meta.executedAt !== "string") return false;
  if (!isStringOrNull(meta.inputHash)) return false;
  if (!isStringOrNull(meta.networkHash)) return false;
  if (!isDutyCheckOptions(meta.options)) return false;
  if (!isDutyCheckResultMetadataBasis(meta.basis)) return false;
  return true;
}

/**
 * Strict structural check on a `DutyCheckResult` envelope. The
 * orchestrator (ED-PR-03) treats a `false` return as a malformed
 * runtime payload and refuses to retain it; this guard MUST reject
 * any envelope that does not match the contract exactly:
 *
 *   - `module` is the literal `"dutyCheck"`.
 *   - `status` is one of `"valid" | "warning" | "failed"`.
 *   - `resultId` / `runtimeSnapshotId` / `createdAt` are non-empty
 *     strings; `scenarioId` / `sourceShortCircuitResultId` are
 *     `string | null`.
 *   - `equipmentResults` is an array of structurally-valid rows
 *     (see `isDutyCheckEquipmentResult`).
 *   - `issues` is an array of structurally-valid issues.
 *   - `metadata` matches `DutyCheckSolverMetadata`, including the
 *     `"duty-check"` solver-name pin.
 */
export function isDutyCheckResult(value: unknown): value is DutyCheckResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.resultId !== "string" || v.resultId.length === 0) return false;
  if (typeof v.runtimeSnapshotId !== "string" || v.runtimeSnapshotId.length === 0) {
    return false;
  }
  if (!isStringOrNull(v.scenarioId)) return false;
  if (v.module !== "dutyCheck") return false;
  if (!isDutyCheckRunStatus(v.status)) return false;
  if (!isStringOrNull(v.sourceShortCircuitResultId)) return false;
  if (!Array.isArray(v.equipmentResults)) return false;
  for (const row of v.equipmentResults) {
    if (!isDutyCheckEquipmentResult(row)) return false;
  }
  if (!Array.isArray(v.issues)) return false;
  for (const issue of v.issues) {
    if (!isDutyCheckIssue(issue)) return false;
  }
  if (!isDutyCheckSolverMetadata(v.metadata)) return false;
  if (typeof v.createdAt !== "string" || v.createdAt.length === 0) return false;
  return true;
}
