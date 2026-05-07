// Stage 3 ED-PR-02 — `@power-system-study/duty-check` public surface.
//
// Type-only contract surface for the Equipment Duty Check engine.
// ED-PR-02 ships only the contract; the orchestrator, readiness
// wrapper, retention slot, and UI land in ED-PR-03..04 and consume
// these types unchanged.

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
