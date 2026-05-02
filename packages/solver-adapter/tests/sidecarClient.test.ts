// Stage 2 PR #4 — Sidecar transport tests.
//
// These tests do NOT spawn a real Python interpreter. They drive the
// stdio JSON-Lines transport against a tiny Bash helper script that
// emits prebaked stdout/stderr and exit codes. The intent is to
// exercise:
//   - request serialization (JSON-Lines stdin)
//   - successful response parsing
//   - non-zero exit handling (mapped to SidecarTransportError)
//   - malformed JSON handling
//   - structured failed_solver responses being passed through
//
// A second integration test in `loadFlow.integration.test.ts` exercises
// the real Python sidecar; it is skipped unless RUN_SIDECAR_INTEGRATION=1.

import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  SidecarTransportError,
  isSolverResult,
} from "../src/sidecarClient.js";
import { StdioSidecarTransport } from "../src/stdioSidecarTransport.js";
import {
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_INPUT_VERSION,
  type SolverInput,
  type SolverResult,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "solver-sidecar-tests-"));
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

/**
 * Write a tiny shell script that emulates the sidecar's CLI: it accepts
 * the same `health` / `run_load_flow` argv we use in production, then
 * prints whatever the test asks. This avoids the test depending on
 * Python being installed.
 */
function makeFakeSidecar(scriptBody: string): {
  pythonExecutable: string;
  sidecarScriptPath: string;
} {
  const scriptPath = join(tmpRoot, `fake-${Math.random().toString(36).slice(2)}.sh`);
  writeFileSync(scriptPath, scriptBody, "utf-8");
  chmodSync(scriptPath, 0o755);
  return {
    // The "python executable" is the shell script itself; the real
    // sidecar script path is passed as argv[1] but the script ignores
    // it. This lets us drive the same StdioSidecarTransport API.
    pythonExecutable: "/bin/bash",
    sidecarScriptPath: scriptPath,
  };
}

function minimalSolverInput(): SolverInput {
  return {
    inputVersion: SOLVER_INPUT_VERSION,
    scenarioId: "SCN-T",
    frequencyHz: 60,
    buses: [{ internalId: "eq_bus_1", tag: "BUS-1", vnKv: 6.6, topology: "3P3W" }],
    sources: [
      {
        internalId: "eq_util_1",
        tag: "UTL-1",
        kind: "utility",
        busInternalId: "eq_bus_1",
        vnKv: 6.6,
        scLevelMva: 250,
        faultCurrentKa: null,
        xrRatio: 10,
        voltageFactor: 1,
        role: "slack",
        pMw: null,
        qMvar: null,
      },
    ],
    transformers: [],
    lines: [],
    loads: [],
    generatorsPQ: [],
    options: { ...DEFAULT_SOLVER_OPTIONS },
  };
}

// ---------------------------------------------------------------------------
// Successful response parsing
// ---------------------------------------------------------------------------

describe("StdioSidecarTransport.runLoadFlow — success path", () => {
  it("forwards stdout JSON straight through when the sidecar succeeds", async () => {
    const fakeResult: SolverResult = {
      status: "succeeded",
      converged: true,
      metadata: {
        solverName: "pandapower",
        solverVersion: "fake-1.2.3",
        adapterVersion: "0.1.0",
        options: { ...DEFAULT_SOLVER_OPTIONS },
        executedAt: "2026-05-02T00:00:00Z",
        inputHash: null,
        networkHash: null,
      },
      buses: [
        {
          internalId: "eq_bus_1",
          voltageKv: 6.6,
          voltagePuPct: 100,
          angleDeg: 0,
        },
      ],
      branches: [],
      issues: [],
    };

    const fake = makeFakeSidecar(
      `#!/bin/bash
# Drain stdin so the parent's write pipe closes cleanly.
cat > /dev/null
echo '${JSON.stringify(fakeResult)}'
`,
    );
    const transport = new StdioSidecarTransport(fake);

    const out = await transport.runLoadFlow(minimalSolverInput());

    expect(isSolverResult(out)).toBe(true);
    expect(out.status).toBe("succeeded");
    expect(out.buses[0]?.internalId).toBe("eq_bus_1");
    expect(out.metadata.solverVersion).toBe("fake-1.2.3");
  });

  it("passes through structured failed_solver responses unchanged", async () => {
    // The sidecar returns failed_solver when pandapower is missing or
    // the network cannot be built. The transport must not turn this
    // into a thrown error — that would force callers to invent
    // synthetic issues.
    const fakeResult: SolverResult = {
      status: "failed_solver",
      converged: false,
      metadata: {
        solverName: "pandapower",
        solverVersion: "unavailable",
        adapterVersion: "0.1.0",
        options: { ...DEFAULT_SOLVER_OPTIONS },
        executedAt: "2026-05-02T00:00:00Z",
        inputHash: null,
        networkHash: null,
      },
      buses: [],
      branches: [],
      issues: [
        {
          code: "E-LF-004",
          severity: "error",
          message: "pandapower unavailable",
        },
      ],
    };

    const fake = makeFakeSidecar(
      `#!/bin/bash
cat > /dev/null
echo '${JSON.stringify(fakeResult)}'
`,
    );
    const transport = new StdioSidecarTransport(fake);

    const out = await transport.runLoadFlow(minimalSolverInput());
    expect(out.status).toBe("failed_solver");
    expect(out.issues[0]?.code).toBe("E-LF-004");
  });
});

// ---------------------------------------------------------------------------
// Failure modes
// ---------------------------------------------------------------------------

describe("StdioSidecarTransport.runLoadFlow — failure path", () => {
  it("throws SidecarTransportError when the sidecar exits non-zero", async () => {
    const fake = makeFakeSidecar(
      `#!/bin/bash
cat > /dev/null
echo "boom" >&2
exit 7
`,
    );
    const transport = new StdioSidecarTransport(fake);

    await expect(transport.runLoadFlow(minimalSolverInput())).rejects.toBeInstanceOf(
      SidecarTransportError,
    );
  });

  it("throws SidecarTransportError when stdout is not valid JSON", async () => {
    const fake = makeFakeSidecar(
      `#!/bin/bash
cat > /dev/null
printf 'not json at all'
`,
    );
    const transport = new StdioSidecarTransport(fake);

    await expect(transport.runLoadFlow(minimalSolverInput())).rejects.toBeInstanceOf(
      SidecarTransportError,
    );
  });

  it("throws SidecarTransportError when stdout JSON has metadata=null (review blocker 1)", async () => {
    // Stage 2 PR #4 review blocker 1: a SolverResult with `metadata:
    // null` would later crash `normalizeSolverResult`. The transport
    // guard rejects it so the orchestrator can convert the rejection
    // into a structured `E-LF-004` failure instead of letting the bad
    // shape reach normalization.
    const fake = makeFakeSidecar(
      `#!/bin/bash
cat > /dev/null
echo '{"status":"failed_validation","converged":false,"metadata":null,"buses":[],"branches":[],"issues":[{"code":"E-LF-005","severity":"error","message":"x"}]}'
`,
    );
    const transport = new StdioSidecarTransport(fake);

    await expect(transport.runLoadFlow(minimalSolverInput())).rejects.toBeInstanceOf(
      SidecarTransportError,
    );
  });

  it("throws SidecarTransportError when stdout JSON metadata is missing required fields", async () => {
    const fake = makeFakeSidecar(
      `#!/bin/bash
cat > /dev/null
echo '{"status":"failed_solver","converged":false,"metadata":{"solverName":"pandapower"},"buses":[],"branches":[],"issues":[]}'
`,
    );
    const transport = new StdioSidecarTransport(fake);

    await expect(transport.runLoadFlow(minimalSolverInput())).rejects.toBeInstanceOf(
      SidecarTransportError,
    );
  });

  it("throws SidecarTransportError when stdout JSON is missing required fields", async () => {
    const fake = makeFakeSidecar(
      `#!/bin/bash
cat > /dev/null
echo '{"status":"succeeded"}'
`,
    );
    const transport = new StdioSidecarTransport(fake);

    await expect(transport.runLoadFlow(minimalSolverInput())).rejects.toBeInstanceOf(
      SidecarTransportError,
    );
  });
});

// ---------------------------------------------------------------------------
// Health command
// ---------------------------------------------------------------------------

describe("StdioSidecarTransport.health", () => {
  it("parses a well-formed health payload", async () => {
    const fake = makeFakeSidecar(
      `#!/bin/bash
echo '{"sidecarName":"x","sidecarVersion":"0.0.1","contractInputVersion":"1.0.0","solverName":"pandapower","solverVersion":"unavailable","status":"ok"}'
`,
    );
    const transport = new StdioSidecarTransport(fake);

    const out = await transport.health();
    expect(out.status).toBe("ok");
    expect(out.contractInputVersion).toBe("1.0.0");
  });

  it("rejects a malformed health payload", async () => {
    const fake = makeFakeSidecar(
      `#!/bin/bash
echo '{"status":"weird"}'
`,
    );
    const transport = new StdioSidecarTransport(fake);

    await expect(transport.health()).rejects.toBeInstanceOf(SidecarTransportError);
  });
});

// ---------------------------------------------------------------------------
// Request serialization invariants
// ---------------------------------------------------------------------------

describe("StdioSidecarTransport — request serialization", () => {
  it("writes the SolverInput JSON to stdin exactly once", async () => {
    // The fake sidecar echoes its stdin to a sentinel file we can
    // inspect; this verifies that the transport sends a single JSON
    // payload terminated by a newline (the JSON-Lines wire format).
    const sentinel = join(tmpRoot, `stdin-${Date.now()}.json`);
    const fake = makeFakeSidecar(
      `#!/bin/bash
cat > ${JSON.stringify(sentinel)}
echo '{"status":"succeeded","converged":true,"metadata":{"solverName":"pandapower","solverVersion":"x","adapterVersion":"0.1.0","options":{"algorithm":"nr","tolerance":1e-8,"maxIter":50,"enforceQLim":false},"executedAt":"2026-05-02T00:00:00Z","inputHash":null,"networkHash":null},"buses":[],"branches":[],"issues":[]}'
`,
    );
    const transport = new StdioSidecarTransport(fake);

    const input = minimalSolverInput();
    await transport.runLoadFlow(input);

    const { readFileSync } = await import("node:fs");
    const stdinBody = readFileSync(sentinel, "utf-8");
    // Must be a single line of JSON terminated by a newline.
    expect(stdinBody.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(stdinBody.trim());
    expect(parsed.inputVersion).toBe(SOLVER_INPUT_VERSION);
    expect(parsed.scenarioId).toBe("SCN-T");
    expect(parsed.options.enforceQLim).toBe(false);
  });
});
