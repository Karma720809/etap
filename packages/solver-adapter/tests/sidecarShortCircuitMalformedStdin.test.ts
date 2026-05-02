// Stage 3 PR #3 — Python sidecar smoke test for the malformed-stdin
// path of `run_short_circuit`.
//
// This test spawns the real Python entry point
// (`main.py run_short_circuit`) with a non-JSON stdin and asserts
// that the sidecar:
//
//   - exits 0 (the malformed-input path is a structured response, not a
//     transport-level crash);
//   - emits a `ShortCircuitSidecarResponse`-shaped payload that
//     satisfies the strict structural guard
//     (`isShortCircuitSidecarResponse`) — including a non-null
//     `metadata` object and the pinned `shortCircuit` block;
//   - reports `status: "failed_validation"` with an `E-SC-005` issue
//     on the top-level `issues` array (never a fake success).
//
// pandapower is NOT required for this path because the dispatcher in
// `main.py` rejects the malformed body before importing the
// short-circuit module. The same skip rules as the Load Flow smoke
// (`sidecarMalformedStdin.test.ts`) apply.

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { isShortCircuitSidecarResponse } from "../src/shortCircuit.js";
import { DEFAULT_SIDECAR_SCRIPT_PATH } from "../src/stdioSidecarTransport.js";

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

describeSmoke("Python sidecar — run_short_circuit malformed-stdin smoke", () => {
  it("returns a structurally valid ShortCircuitSidecarResponse on garbled JSON stdin", () => {
    const result = spawnSync(
      PYTHON,
      [DEFAULT_SIDECAR_SCRIPT_PATH, "run_short_circuit"],
      {
        input: "not json at all\n",
        encoding: "utf-8",
        timeout: 30_000,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout.trim());

    // The wire payload MUST satisfy the TS structural guard so it would
    // NOT be rejected by `StdioSidecarTransport.runShortCircuit`. The
    // guard requires the pinned `shortCircuit` metadata block plus a
    // non-null `metadata` object.
    expect(isShortCircuitSidecarResponse(parsed)).toBe(true);

    expect(parsed.status).toBe("failed_validation");
    expect(parsed.buses).toEqual([]);
    expect(parsed.issues[0]?.code).toBe("E-SC-005");
    expect(parsed.shortCircuit.calculationCase).toBe("maximum");
    expect(parsed.shortCircuit.faultType).toBe("threePhase");
  });

  it("rejects an `unknown` command with a non-zero exit code", () => {
    // Defensive coverage of the dispatcher itself: the sidecar must
    // not silently accept commands that it does not implement.
    const result = spawnSync(
      PYTHON,
      [DEFAULT_SIDECAR_SCRIPT_PATH, "run_short_circuit_v2"],
      {
        input: "",
        encoding: "utf-8",
        timeout: 30_000,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/unknown command/);
  });
});
