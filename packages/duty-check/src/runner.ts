// Stage 3 ED-PR-03 — Equipment Duty Check orchestrator (contract-level).
//
// `runDutyCheckForBundle()` produces a `DutyCheckRunBundle` from an
// upstream `ShortCircuitRunBundle` plus the Stage 1 project file used
// to inspect rating fields. ED-PR-03 keeps the orchestrator at the
// **contract / wiring level** — it does NOT compute breaker duty,
// peak duty, thermal withstand, I²t, or pass/fail margins. Real
// engineering formulas land in a follow-up PR (post-ED-PR-04 in the
// spec breakdown). This PR's orchestrator emits structured rows whose
// status is one of `not_evaluated` (`I-DC-002`), `missing_rating`
// (`W-DC-001`), or `not_applicable` (`I-DC-001`) per the ED-PR-02
// contract surface.
//
// Guardrails enforced (per ED-PR-03 brief + spec §10):
//   - The orchestrator MUST NOT mutate the SC bundle, AppNetwork, or
//     the project file.
//   - Numeric duty / rating / utilization / margin fields stay `null`
//     for every row this PR emits. No fake numbers, no zero
//     placeholders.
//   - When the upstream `ShortCircuitResult.status === "failed"`, the
//     duty bundle returns a `failed` `DutyCheckResult` with no rows
//     and a single info-level top-level issue noting the upstream
//     failure (no per-row fabrication).
//   - The runtime snapshot is reused from the SC bundle — duty check
//     ran against exactly that AppNetwork. The snapshot is not
//     re-cloned to avoid quietly diverging from the SC run.
//   - The project file is read-only. Nothing in the runtime bundle
//     references the project file directly; only the runtime snapshot
//     and the SC bundle are retained by reference.

import type {
  RuntimeCalculationSnapshot,
  RuntimeValidationSummary,
  ShortCircuitRunBundle,
} from "@power-system-study/solver-adapter";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";

import type {
  DutyCheckCriterion,
  DutyCheckEquipmentKind,
  DutyCheckEquipmentResult,
  DutyCheckIssue,
  DutyCheckIssueCode,
  DutyCheckOptions,
  DutyCheckResult,
  DutyCheckRunBundle,
  DutyCheckRunStatus,
  DutyCheckSolverMetadata,
  DutyCheckStatus,
} from "./types.js";

/** Default `tmin` used for breaker `Ib` derivation per ED-OQ-03 (s). */
export const DEFAULT_DUTY_TMIN_S = 0.05;

/** Default project-level fault clearing time per ED-OQ-03 / ED-OQ-04 (s). */
export const DEFAULT_DUTY_FAULT_CLEARING_S = 0.5;

/**
 * Semver of `@power-system-study/duty-check`. Stamped onto
 * `DutyCheckResult.metadata.solverVersion` / `adapterVersion` so
 * retention consumers can identify which engine produced the bundle
 * without re-reading the package manifest at run time.
 */
export const DUTY_CHECK_VERSION = "0.1.0";

export interface RunDutyCheckOptions {
  /**
   * Stage 1 project file. Used to inspect equipment rating fields
   * when the orchestrator decides per-row status (`missing_rating`
   * vs `not_applicable` vs `not_evaluated`). Optional: when omitted,
   * every emitted row is `not_evaluated` — the orchestrator does not
   * fabricate ratings or invent rows.
   */
  project?: PowerSystemProjectFile;
  /** Per-run duty-check options (defaults per ED-OQ-03 / ED-OQ-04). */
  options?: DutyCheckOptions;
  /**
   * Validation summary captured by the readiness wrapper. Stamped on
   * the result snapshot so retention can audit the readiness signal
   * that authorized the run. The orchestrator itself does not gate on
   * this value; gating is the readiness wrapper's job.
   */
  validation?: RuntimeValidationSummary;
  /** Override `Date.now()` for deterministic ids in tests. */
  now?: () => Date;
  /** Override the result id generator for deterministic tests. */
  generateResultId?: () => string;
}

let __resultCounter = 0;
function defaultGenerateResultId(now: Date): string {
  __resultCounter += 1;
  const stamp = now.getTime().toString(36);
  const tail = __resultCounter.toString(36).padStart(2, "0");
  return `dcr_${stamp}_${tail}`;
}

/**
 * Run the Equipment Duty Check over a normalized `ShortCircuitRunBundle`.
 *
 * The duty check is pure TypeScript — there is no sidecar engine
 * (spec §4.6 / ED-OQ-06). The orchestrator does not spawn a process,
 * does not write to disk, and does not consult the project file
 * after extracting rating fields.
 */
export function runDutyCheckForBundle(
  shortCircuit: ShortCircuitRunBundle,
  args: RunDutyCheckOptions = {},
): DutyCheckRunBundle {
  const now = args.now ?? (() => new Date());
  const createdAtDate = now();
  const createdAt = createdAtDate.toISOString();
  const options = args.options ?? {};
  const tminS = options.tminS ?? DEFAULT_DUTY_TMIN_S;
  const faultClearingS =
    options.faultClearingS ?? DEFAULT_DUTY_FAULT_CLEARING_S;

  // Reuse the SC bundle's snapshot. The duty check ran against
  // exactly that AppNetwork — re-cloning would risk silent
  // divergence from the SC inputs.
  const snapshot: RuntimeCalculationSnapshot = applyValidation(
    shortCircuit.snapshot,
    args.validation,
  );

  const upstreamResultId = shortCircuit.shortCircuit.resultId;
  const upstreamFailed = shortCircuit.shortCircuit.status === "failed";

  const equipmentResults: DutyCheckEquipmentResult[] = upstreamFailed
    ? []
    : enumerateRows(args.project ?? null, upstreamResultId);

  const issues: DutyCheckIssue[] = [];
  if (upstreamFailed) {
    // No row fabrication when the upstream SC run failed — the duty
    // check reports a top-level info issue and an empty
    // `equipmentResults`. Per ED-OQ-02 the run-level status is
    // `failed` because the upstream is failed.
    issues.push({
      code: "I-DC-002",
      severity: "info",
      message:
        "Upstream Short Circuit run failed; Equipment Duty did not evaluate any equipment.",
    });
  }

  const status = computeRunStatus(equipmentResults, upstreamFailed);

  const metadata: DutyCheckSolverMetadata = {
    solverName: "duty-check",
    solverVersion: DUTY_CHECK_VERSION,
    adapterVersion: DUTY_CHECK_VERSION,
    executedAt: createdAt,
    inputHash: null,
    networkHash: null,
    options: { ...options },
    basis: { tminS, faultClearingS },
  };

  const resultId = (
    args.generateResultId ?? (() => defaultGenerateResultId(createdAtDate))
  )();

  const dutyCheck: DutyCheckResult = {
    resultId,
    runtimeSnapshotId: snapshot.snapshotId,
    scenarioId: snapshot.scenarioId,
    module: "dutyCheck",
    status,
    sourceShortCircuitResultId: upstreamFailed ? null : upstreamResultId,
    equipmentResults,
    issues,
    metadata,
    createdAt,
  };

  return { dutyCheck, snapshot, shortCircuit };
}

function applyValidation(
  snapshot: RuntimeCalculationSnapshot,
  validation: RuntimeValidationSummary | undefined,
): RuntimeCalculationSnapshot {
  if (validation === undefined) return snapshot;
  return {
    ...snapshot,
    validation: {
      status: validation.status,
      networkBuildStatus: validation.networkBuildStatus,
      issues: validation.issues.map((i) => ({ ...i })),
    },
  };
}

function computeRunStatus(
  rows: DutyCheckEquipmentResult[],
  upstreamFailed: boolean,
): DutyCheckRunStatus {
  if (upstreamFailed) return "failed";
  let hasNonPass = false;
  for (const row of rows) {
    if (row.status === "fail") return "failed";
    if (row.status !== "pass") hasNonPass = true;
  }
  return hasNonPass ? "warning" : "valid";
}

// ---------------------------------------------------------------------------
// Row enumeration
// ---------------------------------------------------------------------------

/**
 * Enumerate per-equipment / per-criterion duty rows from the project.
 *
 * Without a project file, the orchestrator emits no rows: it has no
 * authoritative source for equipment rating fields and refuses to
 * fabricate them. The caller is expected to pass the project file.
 *
 * In-service status: out-of-service equipment is skipped (a duty
 * check on a de-energized device is uninformative). The SC bundle's
 * AppNetwork only carries closed gates for the same reason
 * (S2-OQ-02).
 */
function enumerateRows(
  project: PowerSystemProjectFile | null,
  shortCircuitResultId: string,
): DutyCheckEquipmentResult[] {
  if (project === null) return [];
  const rows: DutyCheckEquipmentResult[] = [];

  for (const breaker of project.equipment.breakers) {
    if (breaker.status !== "in_service") continue;
    rows.push(
      makeRow({
        equipmentInternalId: breaker.internalId,
        equipmentKind: "breaker",
        criterion: "breakerInterrupting",
        ratingPresent: isRatingPresent(breaker.interruptingCapacityKa),
        peakOptOut: false,
        shortCircuitResultId,
      }),
    );
    rows.push(
      makeRow({
        equipmentInternalId: breaker.internalId,
        equipmentKind: "breaker",
        criterion: "breakerPeak",
        ratingPresent: isRatingPresent(breaker.peakWithstandKa),
        // Peak rating absent on a breaker is an opt-out per
        // ED-OQ-03, not a data gap → emits `not_applicable` /
        // I-DC-001 rather than `missing_rating` / W-DC-001.
        peakOptOut: true,
        shortCircuitResultId,
      }),
    );
  }

  for (const sw of project.equipment.switches) {
    if (sw.status !== "in_service") continue;
    rows.push(
      makeRow({
        equipmentInternalId: sw.internalId,
        equipmentKind: "switch",
        criterion: "switchShortTimeWithstand",
        ratingPresent: isRatingPresent(sw.shortTimeWithstandKa),
        peakOptOut: false,
        shortCircuitResultId,
      }),
    );
    rows.push(
      makeRow({
        equipmentInternalId: sw.internalId,
        equipmentKind: "switch",
        criterion: "switchPeak",
        ratingPresent: isRatingPresent(sw.peakWithstandKa),
        peakOptOut: true,
        shortCircuitResultId,
      }),
    );
  }

  for (const bus of project.equipment.buses) {
    rows.push(
      makeRow({
        equipmentInternalId: bus.internalId,
        equipmentKind: "bus",
        criterion: "busShortTimeWithstand",
        ratingPresent: isRatingPresent(bus.shortTimeWithstandKa),
        peakOptOut: false,
        shortCircuitResultId,
      }),
    );
    rows.push(
      makeRow({
        equipmentInternalId: bus.internalId,
        equipmentKind: "bus",
        criterion: "busPeak",
        ratingPresent: isRatingPresent(bus.peakWithstandKa),
        peakOptOut: true,
        shortCircuitResultId,
      }),
    );
  }

  for (const cable of project.equipment.cables) {
    if (cable.status !== "in_service") continue;
    rows.push(
      makeRow({
        equipmentInternalId: cable.internalId,
        equipmentKind: "cable",
        criterion: "cableThermalWithstand",
        ratingPresent: isRatingPresent(cable.shortCircuitKValue),
        peakOptOut: false,
        shortCircuitResultId,
      }),
    );
  }

  return rows;
}

function isRatingPresent(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

interface MakeRowArgs {
  equipmentInternalId: string;
  equipmentKind: DutyCheckEquipmentKind;
  criterion: DutyCheckCriterion;
  ratingPresent: boolean;
  /** True when the criterion is opt-out-by-absence (peak rows). */
  peakOptOut: boolean;
  shortCircuitResultId: string;
}

function makeRow(args: MakeRowArgs): DutyCheckEquipmentResult {
  let status: DutyCheckStatus;
  const issueCodes: DutyCheckIssueCode[] = [];
  if (!args.ratingPresent) {
    if (args.peakOptOut) {
      status = "not_applicable";
      issueCodes.push("I-DC-001");
    } else {
      status = "missing_rating";
      issueCodes.push("W-DC-001");
    }
  } else {
    status = "not_evaluated";
    issueCodes.push("I-DC-002");
  }
  return {
    equipmentInternalId: args.equipmentInternalId,
    equipmentKind: args.equipmentKind,
    criterion: args.criterion,
    // No driving bus is resolved at the contract-level orchestrator;
    // the engineering basis lands in a follow-up PR. `null` is
    // legal per the contract for non-pass/fail rows.
    faultBusInternalId: null,
    shortCircuitResultId: args.shortCircuitResultId,
    faultCaseId: null,
    dutyValue: null,
    ratingValue: null,
    utilizationPct: null,
    marginValue: null,
    status,
    // Every row emitted by ED-PR-03 is `provisional` because no
    // verified comparison was performed. The engineering basis PR
    // promotes computed rows to `verified` per ED-OQ-03.
    verdictBasis: "provisional",
    issueCodes,
  };
}

