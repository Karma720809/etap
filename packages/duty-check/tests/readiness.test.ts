// Stage 3 ED-PR-03 — readiness wrapper behavior tests.
//
// These tests exercise `evaluateDutyCheckReadiness()` over the four
// status branches the wrapper recognizes (`ready_to_run`,
// `blocked_by_upstream`, `blocked_by_stale_upstream`,
// `blocked_by_validation`) and confirm:
//   - No upstream SC bundle → blocked_by_upstream.
//   - Stale upstream SC bundle → blocked_by_stale_upstream.
//   - Failed upstream SC bundle → blocked_by_upstream.
//   - Project validation in `blocked_by_validation` → blocked_by_validation.
//   - Ready inputs → ready_to_run + the SC bundle is forwarded.
//   - Missing equipment ratings are NEVER a readiness blocker
//     (they surface as per-row missing_rating at orchestrator time).

import { describe, expect, it } from "vitest";

import { evaluateDutyCheckReadiness } from "../src/index.js";
import { fakeShortCircuitBundle } from "./test-builders.js";

describe("evaluateDutyCheckReadiness — blocked branches", () => {
  it("returns blocked_by_upstream when no Short Circuit bundle is supplied", () => {
    const result = evaluateDutyCheckReadiness({ shortCircuit: null });
    expect(result.status).toBe("blocked_by_upstream");
    expect(result.shortCircuit).toBeNull();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe("I-DC-002");
    expect(result.issues[0]?.severity).toBe("info");
  });

  it("returns blocked_by_stale_upstream when the SC bundle is marked stale", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const result = evaluateDutyCheckReadiness({
      shortCircuit: sc,
      shortCircuitStale: true,
    });
    expect(result.status).toBe("blocked_by_stale_upstream");
    expect(result.shortCircuit).toBeNull();
    expect(result.issues[0]?.message).toContain("stale");
  });

  it("returns blocked_by_upstream when the SC run itself failed", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "failed");
    const result = evaluateDutyCheckReadiness({ shortCircuit: sc });
    expect(result.status).toBe("blocked_by_upstream");
    expect(result.shortCircuit).toBeNull();
    expect(result.issues[0]?.message).toContain("failed");
  });

  it("returns blocked_by_validation when the project is blocked, regardless of SC availability", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const result = evaluateDutyCheckReadiness({
      shortCircuit: sc,
      projectValidation: {
        status: "blocked_by_validation",
        networkBuildStatus: "invalid",
        issues: [
          {
            code: "E-EQ-001",
            severity: "error",
            message: "missing required field",
          },
        ],
      },
    });
    expect(result.status).toBe("blocked_by_validation");
    expect(result.shortCircuit).toBeNull();
    // The wrapper preserves the upstream issues on the validation
    // summary so retention can audit the readiness signal.
    expect(result.validationSummary.issues.some((i) => i.code === "E-EQ-001")).toBe(true);
    expect(result.validationSummary.issues.some((i) => i.code === "I-DC-002")).toBe(true);
  });
});

describe("evaluateDutyCheckReadiness — ready branch", () => {
  it("forwards the SC bundle when every gating input passes", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const result = evaluateDutyCheckReadiness({
      shortCircuit: sc,
      projectValidation: {
        status: "ready_to_run",
        networkBuildStatus: "valid",
        issues: [],
      },
    });
    expect(result.status).toBe("ready_to_run");
    expect(result.shortCircuit).toBe(sc);
    expect(result.issues).toEqual([]);
    expect(result.validationSummary.status).toBe("ready_to_run");
  });

  it("treats `ran_with_warnings` upstream validation as ready (warnings are not blocks)", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "warning");
    const result = evaluateDutyCheckReadiness({
      shortCircuit: sc,
      projectValidation: {
        status: "ran_with_warnings",
        networkBuildStatus: "valid",
        issues: [
          {
            code: "W-EQ-001",
            severity: "warning",
            message: "non-fatal hint",
          },
        ],
      },
    });
    expect(result.status).toBe("ready_to_run");
    expect(result.shortCircuit).toBe(sc);
    expect(result.validationSummary.status).toBe("ran_with_warnings");
  });

  it("does NOT block on missing equipment ratings (per ED-OQ-02 — they surface per-row)", () => {
    // The readiness wrapper never inspects equipment rating fields;
    // by design, a project with no ratings is still ready to run.
    // This test pins the contract by passing a ready-shaped project
    // validation and confirming the wrapper does not gate.
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const result = evaluateDutyCheckReadiness({
      shortCircuit: sc,
      projectValidation: {
        status: "ready_to_run",
        networkBuildStatus: "valid",
        issues: [],
      },
    });
    expect(result.status).toBe("ready_to_run");
  });
});

describe("evaluateDutyCheckReadiness — purity", () => {
  it("does not mutate the input args", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    const projectValidation = {
      status: "ready_to_run" as const,
      networkBuildStatus: "valid" as const,
      issues: [],
    };
    const before = JSON.stringify({ sc, projectValidation });
    evaluateDutyCheckReadiness({
      shortCircuit: sc,
      projectValidation,
    });
    expect(JSON.stringify({ sc, projectValidation })).toBe(before);
  });
});
