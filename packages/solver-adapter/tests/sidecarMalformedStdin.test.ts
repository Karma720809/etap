// Stage 2 PR #4 review blocker 1 — Python sidecar smoke test for the
// malformed-stdin path.
//
// This test spawns the real Python entry point (`main.py run_load_flow`)
// with a non-JSON stdin and asserts that the response includes a
// non-null `metadata` object. It does NOT require pandapower to be
// installed — `load_flow.py` only imports pandapower lazily inside the
// success path.
//
// The test skips automatically when:
//   - the integration env disables Python smokes (RUN_SIDECAR_SMOKE=0), or
//   - spawning `python3` fails (e.g., CI without Python).
//
// We do NOT gate on `RUN_SIDECAR_INTEGRATION` because this path needs
// only the `json` stdlib module, which every Python ≥3.0 ships.

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIDECAR_SCRIPT_PATH,
  isSolverResult,
} from "../src/sidecarClient.js";

const PYTHON = process.env.SOLVER_PYTHON ?? "python3";
const SHOULD_SKIP = process.env.RUN_SIDECAR_SMOKE === "0" || !pythonAvailable();

function pythonAvailable(): boolean {
  try {
    const result = spawnSync(PYTHON, ["-c", "print('ok')"], { encoding: "utf-8" });
    return result.status === 0 && result.stdout.trim() === "ok";
  } catch {
    return false;
  }
}

const describeSmoke = SHOULD_SKIP ? describe.skip : describe;

describeSmoke("Python sidecar — malformed-stdin smoke (review blocker 1)", () => {
  it("returns a SolverResult with a non-null metadata object on garbled JSON stdin", () => {
    const result = spawnSync(
      PYTHON,
      [DEFAULT_SIDECAR_SCRIPT_PATH, "run_load_flow"],
      {
        input: "not json at all\n",
        encoding: "utf-8",
        timeout: 30_000,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout.trim());
    // metadata MUST be an object with the required SolverMetadata
    // fields. The TypeScript guard rejects metadata-null and the
    // sidecar must satisfy the guard.
    expect(parsed.metadata).not.toBeNull();
    expect(typeof parsed.metadata).toBe("object");
    expect(typeof parsed.metadata.solverName).toBe("string");
    expect(typeof parsed.metadata.solverVersion).toBe("string");
    expect(typeof parsed.metadata.adapterVersion).toBe("string");
    expect(typeof parsed.metadata.executedAt).toBe("string");
    expect(typeof parsed.metadata.options).toBe("object");

    // The whole payload must satisfy the TS guard so it would NOT be
    // rejected by `StdioSidecarTransport.runLoadFlow`.
    expect(isSolverResult(parsed)).toBe(true);

    // It is structurally a failure with E-LF-005 — never a fake success.
    expect(parsed.status).toBe("failed_validation");
    expect(parsed.issues[0]?.code).toBe("E-LF-005");
  });
});
