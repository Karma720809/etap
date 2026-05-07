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
//     `validateForCalculation()` — Stage 1). The wrapper inherits the
//     block whenever the supplied `RuntimeValidationSummary` is not
//     ready, including:
//       * `status === "blocked_by_validation"` — explicit block;
//       * `status === "not_evaluated"` — readiness has not been run,
//         so duty check cannot trust the project state;
//       * `networkBuildStatus === "invalid"` — the AppNetwork failed
//         to build, so equipment / topology may be incoherent.
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
 *     calculation. Triggered whenever the supplied
 *     `projectValidation` is not ready: `status` is
 *     `"blocked_by_validation"` or `"not_evaluated"`, OR
 *     `networkBuildStatus` is `"invalid"`.
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
const READINESS_BLOCK_BY_NOT_EVALUATED_MESSAGE =
  "Equipment Duty cannot run while project validation has not been evaluated.";
const READINESS_BLOCK_BY_INVALID_NETWORK_MESSAGE =
  "Equipment Duty cannot run while the AppNetwork build is invalid.";
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
  // 1. Project-level validation gate. The wrapper inherits the block
  //    whenever the supplied summary reports a not-ready signal.
  //    The probe checks both `status` and `networkBuildStatus`
  //    because a project can be `ready_to_run` overall while still
  //    failing the AppNetwork build (e.g., a topology gap that the
  //    schema-level validators do not catch).
  if (args.projectValidation !== undefined) {
    const validationBlock = projectValidationBlock(args.projectValidation);
    if (validationBlock !== null) {
      return blocked(
        "blocked_by_validation",
        validationBlock,
        args.projectValidation,
      );
    }
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

/**
 * Probe a `RuntimeValidationSummary` for any not-ready signal that
 * should block the duty-check run. Returns the user-facing block
 * message when a block applies, or `null` when the project is ready.
 *
 * Probe order matters for the message — the most specific signal
 * wins so the UI surfaces the actionable reason:
 *   1. `status === "blocked_by_validation"` (explicit block).
 *   2. `networkBuildStatus === "invalid"` (build gap; user must fix
 *      topology before re-running validation).
 *   3. `status === "not_evaluated"` (validation has not been run).
 *
 * `ran_with_warnings` is intentionally NOT a block — Stage 2 / Stage
 * 3 readiness treats warnings as informational; the duty check
 * inherits that policy.
 */
function projectValidationBlock(
  validation: RuntimeValidationSummary,
): string | null {
  if (validation.status === "blocked_by_validation") {
    return READINESS_BLOCK_BY_VALIDATION_MESSAGE;
  }
  if (validation.networkBuildStatus === "invalid") {
    return READINESS_BLOCK_BY_INVALID_NETWORK_MESSAGE;
  }
  if (validation.status === "not_evaluated") {
    return READINESS_BLOCK_BY_NOT_EVALUATED_MESSAGE;
  }
  return null;
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
