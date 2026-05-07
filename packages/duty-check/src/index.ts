// Stage 3 ED-PR-02 / ED-PR-03 — `@power-system-study/duty-check`
// public surface.
//
// ED-PR-02 shipped the contract / type surface (status enums,
// criterion discriminator, structural guards). ED-PR-03 adds the
// orchestrator (`runDutyCheckForBundle`) and the readiness wrapper
// (`evaluateDutyCheckReadiness`). The orchestrator is contract-level
// only — it emits `not_evaluated` / `missing_rating` / `not_applicable`
// rows from the available project + Short Circuit context and never
// fabricates duty / rating / utilization / margin numerics. Real
// engineering formulas land in a follow-up PR.

export {
  DUTY_CHECK_CRITERIA,
  DUTY_CHECK_CRITERION_TO_EQUIPMENT_KIND,
  DUTY_CHECK_EQUIPMENT_KINDS,
  DUTY_CHECK_ISSUE_CODES,
  DUTY_CHECK_RUN_STATUSES,
  DUTY_CHECK_STATUSES,
  DUTY_CHECK_VERDICT_BASES,
  isDutyCheckCriterion,
  isDutyCheckEquipmentKind,
  isDutyCheckEquipmentResult,
  isDutyCheckIssue,
  isDutyCheckIssueCode,
  isDutyCheckResult,
  isDutyCheckRunStatus,
  isDutyCheckStatus,
  isDutyCheckVerdictBasis,
  type DutyCheckCriterion,
  type DutyCheckEquipmentKind,
  type DutyCheckEquipmentResult,
  type DutyCheckInfoCode,
  type DutyCheckIssue,
  type DutyCheckIssueCode,
  type DutyCheckIssueSeverity,
  type DutyCheckOptions,
  type DutyCheckResult,
  type DutyCheckResultMetadataBasis,
  type DutyCheckRunBundle,
  type DutyCheckRunStatus,
  type DutyCheckSolverMetadata,
  type DutyCheckStatus,
  type DutyCheckVerdictBasis,
  type DutyCheckWarningCode,
} from "./types.js";

export {
  DEFAULT_DUTY_FAULT_CLEARING_S,
  DEFAULT_DUTY_TMIN_S,
  DUTY_CHECK_VERSION,
  runDutyCheckForBundle,
  type RunDutyCheckOptions,
} from "./runner.js";

export {
  evaluateDutyCheckReadiness,
  type DutyCheckReadinessResult,
  type DutyCheckReadinessStatus,
  type EvaluateDutyCheckReadinessArgs,
} from "./readiness.js";
