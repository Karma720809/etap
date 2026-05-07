// Stage 3 ED-PR-03 — Equipment Duty Check readiness wrapper.
//
// `evaluateDutyCheckReadiness()` decides whether a duty-check run can
// proceed. The wrapper is a pure function: it does NOT execute the
// orchestrator. Callers (the UI Run-button handler, automated test
// harness, future CLI) inspect the readiness result and either invoke
// `runDutyCheckForBundle()` or surface the structured `blocked_*`
// reason to the user.
//
// Readiness inputs (per ED-PR-03 brief + spec §4.6):
//   - Project / network readiness (e.g., the result of
//     `validateForCalculation()` — Stage 1). When the project is
//     `blocked_by_validation`, duty check inherits the block.
//   - Availability of an upstream `ShortCircuitRunBundle`. The duty
//     check has nothing to evaluate without one (spec §4.6 / ED-OQ-06).
//   - Whether the upstream SC retention record is currently `stale`.
//     Stale SC results are not auto-recomputed (spec §10.5 / Stage 2
//     S2-OQ-06 inherited), so duty check stays blocked until the user
//     re-runs Short Circuit.
//
// What the wrapper does NOT block on (per ED-OQ-02):
//   - Missing equipment rating fields. Those surface as per-row
//     `missing_rating` (W-DC-001) at orchestrator time; the run
//     proceeds and the user sees an explicit "no rating recorded"
//     cell rather than a blocked Run button.
//
// Issue codes are reused from the ED-PR-02 contract surface
// (`I-DC-002`, severity `info`). No new codes are introduced. There
// is no `E-DC-*` code in the contract — every blocked-readiness
// reason is structurally an info-level diagnostic that the UI
// surfaces alongside the `blocked_*` status, not a fatal error
// against the duty-check engine itself.

import type {
  RuntimeValidationSummary,
  ShortCircuitRunBundle,
} from "@power-system-study/solver-adapter";

import type { DutyCheckIssue } from "./types.js";

/**
 * Readiness-wrapper outcome.
 *
 *   - `ready_to_run` — every gating input is satisfied; the caller
 *     may invoke `runDutyCheckForBundle()` with the supplied SC
 *     bundle.
 *   - `blocked_by_upstream` — no `ShortCircuitRunBundle` is
 *     available, OR the available bundle's
 *     `ShortCircuitResult.status === "failed"`. Either way, duty
 *     check has no usable upstream context.
 *   - `blocked_by_stale_upstream` — an SC bundle is available but
 *     the retention slot has been marked stale (spec §10.5). The
 *     user must re-run Short Circuit before duty check.
 *   - `blocked_by_validation` — the project itself is not ready for
 *     calculation (the `projectValidation` summary reports
 *     `blocked_by_validation`).
 */
export type DutyCheckReadinessStatus =
  | "ready_to_run"
  | "blocked_by_upstream"
  | "blocked_by_stale_upstream"
  | "blocked_by_validation";

export interface EvaluateDutyCheckReadinessArgs {
  /** Most recent retained Short Circuit run bundle. `null` when none. */
  shortCircuit: ShortCircuitRunBundle | null;
  /** Whether the retained SC record is currently stale. Defaults to `false`. */
  shortCircuitStale?: boolean;
  /** Project-level readiness summary (e.g., from Stage 1 `validateForCalculation`). */
  projectValidation?: RuntimeValidationSummary;
}

export interface DutyCheckReadinessResult {
  status: DutyCheckReadinessStatus;
  /**
   * Issues describing why the wrapper blocked. Empty when
   * `status === "ready_to_run"`. Codes reused from the ED-PR-02
   * contract; no new diagnostic vocabulary is introduced here.
   */
  issues: DutyCheckIssue[];
  /**
   * SC bundle to feed `runDutyCheckForBundle()` when ready. `null`
   * for every blocked status — the caller MUST NOT invoke the
   * orchestrator with a partial / stale bundle even if one is
   * structurally available.
   */
  shortCircuit: ShortCircuitRunBundle | null;
  /**
   * Snapshot-shape validation summary for retention. The duty-check
   * orchestrator stamps this onto the resulting runtime snapshot so
   * the retention record audits the readiness signal that authorized
   * (or rejected) the run. Mirrors the Short Circuit pattern
   * (`makeDefaultValidationSummary()` in `shortCircuitRunner.ts`).
   */
  validationSummary: RuntimeValidationSummary;
}

const READINESS_BLOCK_BY_VALIDATION_MESSAGE =
  "Equipment Duty cannot run while project validation is blocked.";
const READINESS_BLOCK_BY_MISSING_UPSTREAM_MESSAGE =
  "No Short Circuit run available; Equipment Duty requires an upstream Short Circuit bundle.";
const READINESS_BLOCK_BY_FAILED_UPSTREAM_MESSAGE =
  "Upstream Short Circuit run failed; Equipment Duty cannot evaluate.";
const READINESS_BLOCK_BY_STALE_UPSTREAM_MESSAGE =
  "Upstream Short Circuit run is stale; re-run Short Circuit before Equipment Duty.";

/**
 * Decide whether a duty-check run can proceed. Pure function — no
 * side effects, no I/O, no clock reads.
 */
export function evaluateDutyCheckReadiness(
  args: EvaluateDutyCheckReadinessArgs,
): DutyCheckReadinessResult {
  // 1. Project-level validation gate. When the project itself is
  //    not ready for calculation, duty check inherits the block.
  if (
    args.projectValidation !== undefined &&
    args.projectValidation.status === "blocked_by_validation"
  ) {
    return blocked(
      "blocked_by_validation",
      READINESS_BLOCK_BY_VALIDATION_MESSAGE,
      args.projectValidation,
    );
  }

  // 2. SC bundle must exist. No bundle → no upstream fault numerics.
  if (args.shortCircuit === null) {
    return blocked(
      "blocked_by_upstream",
      READINESS_BLOCK_BY_MISSING_UPSTREAM_MESSAGE,
    );
  }

  // 3. Stale SC bundle blocks duty check (spec §10.5 — no
  //    auto-recompute). The user must re-run SC first.
  if (args.shortCircuitStale === true) {
    return blocked(
      "blocked_by_stale_upstream",
      READINESS_BLOCK_BY_STALE_UPSTREAM_MESSAGE,
    );
  }

  // 4. SC bundle exists but its run is `failed` → equivalent to
  //    upstream-missing. Duty check has nothing to evaluate.
  if (args.shortCircuit.shortCircuit.status === "failed") {
    return blocked(
      "blocked_by_upstream",
      READINESS_BLOCK_BY_FAILED_UPSTREAM_MESSAGE,
    );
  }

  return {
    status: "ready_to_run",
    issues: [],
    shortCircuit: args.shortCircuit,
    validationSummary: {
      status: args.projectValidation?.status ?? "ready_to_run",
      networkBuildStatus: args.projectValidation?.networkBuildStatus ?? "valid",
      issues: args.projectValidation?.issues.map((i) => ({ ...i })) ?? [],
    },
  };
}

function blocked(
  status: Exclude<DutyCheckReadinessStatus, "ready_to_run">,
  message: string,
  inheritedValidation?: RuntimeValidationSummary,
): DutyCheckReadinessResult {
  const issue: DutyCheckIssue = {
    code: "I-DC-002",
    severity: "info",
    message,
  };
  const validationSummary: RuntimeValidationSummary = inheritedValidation
    ? {
        status: inheritedValidation.status,
        networkBuildStatus: inheritedValidation.networkBuildStatus,
        issues: [
          ...inheritedValidation.issues.map((i) => ({ ...i })),
          {
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
          },
        ],
      }
    : {
        status: "blocked_by_validation",
        networkBuildStatus: "not_evaluated",
        issues: [
          {
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
          },
        ],
      };
  return {
    status,
    issues: [issue],
    shortCircuit: null,
    validationSummary,
  };
}
