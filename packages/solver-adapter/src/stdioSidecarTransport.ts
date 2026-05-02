// Stage 2 PR #5 — Node-only stdio sidecar transport.
// Stage 3 PR #3 — `runShortCircuit` implementation added.
//
// The real Node implementation of `SidecarTransport` was extracted
// out of `sidecarClient.ts` so the contract types remain importable
// from browser bundles (Vite). Anything in this file is Node-only:
// it imports `node:child_process`, `node:path`, and `node:url`. The
// orchestrator (`loadFlow.ts` / future `shortCircuitRunner.ts`)
// lazy-imports this file on the first call when no transport is
// injected, which keeps it out of the browser dependency graph.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SHORT_CIRCUIT_COMMAND,
  isShortCircuitSidecarResponse,
  type ShortCircuitRequest,
  type ShortCircuitSidecarResponse,
} from "./shortCircuit.js";
import {
  SidecarTransportError,
  isSidecarHealth,
  isSolverResult,
  type SidecarHealth,
  type SidecarTransport,
  type SidecarTransportOptions,
} from "./sidecarClient.js";
import type { SolverInput, SolverResult } from "./types.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Default location of the Python sidecar entry point relative to this
 * package. Resolves to `<repo>/services/solver-sidecar/src/main.py`.
 */
export const DEFAULT_SIDECAR_SCRIPT_PATH = resolve(
  moduleDir,
  "..",
  "..",
  "..",
  "services",
  "solver-sidecar",
  "src",
  "main.py",
);

export const DEFAULT_PYTHON_EXECUTABLE = "python3";

interface InvokeResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function spawnSidecar(
  command: string,
  args: string[],
  stdin: string | null,
  timeoutMs: number,
): Promise<InvokeResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      rejectPromise(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        rejectPromise(
          new SidecarTransportError(
            `solver sidecar timed out after ${timeoutMs}ms`,
            { exitCode: code, stdout, stderr },
          ),
        );
        return;
      }
      resolvePromise({ exitCode: code, stdout, stderr });
    });

    if (stdin !== null) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

function parseFirstJsonLine(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    throw new SidecarTransportError(
      "solver sidecar produced no output on stdout",
      { exitCode: 0, stdout, stderr: "" },
    );
  }
  // The sidecar writes one JSON value followed by a newline. Some
  // shells / wrappers may append extra trailing whitespace; parse the
  // entire trimmed stdout as a single JSON value to stay tolerant.
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const firstLine = trimmed.split("\n", 1)[0] ?? trimmed;
    try {
      return JSON.parse(firstLine);
    } catch {
      throw new SidecarTransportError(
        `solver sidecar emitted unparseable JSON: ${(err as Error).message}`,
        { exitCode: 0, stdout, stderr: "" },
      );
    }
  }
}

/**
 * Real stdio JSON-Lines transport. One short-lived child process per
 * call; no warm pool, no daemon.
 */
export class StdioSidecarTransport implements SidecarTransport {
  private readonly pythonExecutable: string;
  private readonly sidecarScriptPath: string;
  private readonly timeoutMs: number;

  constructor(options: SidecarTransportOptions = {}) {
    this.pythonExecutable = options.pythonExecutable ?? DEFAULT_PYTHON_EXECUTABLE;
    this.sidecarScriptPath = options.sidecarScriptPath ?? DEFAULT_SIDECAR_SCRIPT_PATH;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async health(): Promise<SidecarHealth> {
    const result = await spawnSidecar(
      this.pythonExecutable,
      [this.sidecarScriptPath, "health"],
      null,
      this.timeoutMs,
    );
    if (result.exitCode !== 0) {
      throw new SidecarTransportError(
        `solver sidecar health exited ${result.exitCode}`,
        result,
      );
    }
    const parsed = parseFirstJsonLine(result.stdout);
    if (!isSidecarHealth(parsed)) {
      throw new SidecarTransportError(
        "solver sidecar health payload missing required fields",
        result,
      );
    }
    return parsed;
  }

  async runLoadFlow(input: SolverInput): Promise<SolverResult> {
    const requestLine = JSON.stringify(input) + "\n";
    const result = await spawnSidecar(
      this.pythonExecutable,
      [this.sidecarScriptPath, "run_load_flow"],
      requestLine,
      this.timeoutMs,
    );
    if (result.exitCode !== 0) {
      throw new SidecarTransportError(
        `solver sidecar run_load_flow exited ${result.exitCode}`,
        result,
      );
    }
    const parsed = parseFirstJsonLine(result.stdout);
    if (!isSolverResult(parsed)) {
      throw new SidecarTransportError(
        "solver sidecar response did not match SolverResult shape",
        result,
      );
    }
    return parsed;
  }

  /**
   * Stage 3 PR #3 — wire-only Short Circuit transport call. Mirrors
   * `runLoadFlow`: spawn the sidecar with the `run_short_circuit`
   * command, write a single-line JSON request to stdin, parse the
   * single-line JSON response from stdout, and reject any payload
   * that fails the strict `isShortCircuitSidecarResponse` guard so
   * the future orchestrator (PR #4) can map the rejection into
   * `E-SC-001` rather than letting a malformed wire shape reach
   * normalization.
   */
  async runShortCircuit(
    request: ShortCircuitRequest,
  ): Promise<ShortCircuitSidecarResponse> {
    const requestLine = JSON.stringify(request) + "\n";
    const result = await spawnSidecar(
      this.pythonExecutable,
      [this.sidecarScriptPath, SHORT_CIRCUIT_COMMAND],
      requestLine,
      this.timeoutMs,
    );
    if (result.exitCode !== 0) {
      throw new SidecarTransportError(
        `solver sidecar ${SHORT_CIRCUIT_COMMAND} exited ${result.exitCode}`,
        result,
      );
    }
    const parsed = parseFirstJsonLine(result.stdout);
    if (!isShortCircuitSidecarResponse(parsed)) {
      throw new SidecarTransportError(
        "solver sidecar response did not match ShortCircuitSidecarResponse shape",
        result,
      );
    }
    return parsed;
  }
}
