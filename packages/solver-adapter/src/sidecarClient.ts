// Stage 2 PR #4 — TypeScript client for the Python solver sidecar.
//
// The client owns the TS side of the stdio JSON-Lines transport
// (`solver_adapter_hosting_decision.md` §4 / spec §16). It does NOT
// own the orchestrator that turns an `AppNetwork` into a normalized
// Load Flow result — that lives in `loadFlow.ts`. The client is
// intentionally decoupled into a transport interface so that
// orchestrator tests can inject a mock without spawning Python.
//
// Stage 2 PR #4 wire format:
//   - One process per call. The adapter spawns
//       python3 <sidecarScriptPath> run_load_flow
//     writes one JSON line (the `SolverInput`) to stdin, closes stdin,
//     reads stdout to EOF, and parses it as a single JSON value.
//   - The sidecar exits 0 on a structured response (succeeded,
//     failed_validation, or failed_solver). A non-zero exit means the
//     transport itself failed and we must not invent a SolverResult —
//     it is mapped to `E-LF-004` instead (see `runLoadFlow` in
//     `loadFlow.ts`).
//
// Why one-shot rather than a long-lived daemon? Spec §16 / hosting
// decision §6: keep the MVP transport minimal. A long-lived process,
// graceful restart, request-id correlation, and lifecycle teardown
// are all deferred to a later PR. Spawn-per-call is honest and
// trivially testable.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

/** Health-check payload returned by the sidecar's `health` command. */
export interface SidecarHealth {
  sidecarName: string;
  sidecarVersion: string;
  contractInputVersion: string;
  solverName: string;
  /** "unavailable" when pandapower is not installed in the sidecar. */
  solverVersion: string;
  status: "ok";
}

export interface SidecarTransportOptions {
  /** Path to the Python interpreter. Defaults to `python3`. */
  pythonExecutable?: string;
  /** Path to `services/solver-sidecar/src/main.py`. */
  sidecarScriptPath?: string;
  /**
   * Hard timeout per call. Defaults to 60s — enough for cold pandapower
   * import + a small Load Flow. Exceeded calls map to `E-LF-004`.
   */
  timeoutMs?: number;
}

/**
 * Single-call transport surface. The orchestrator owns either a
 * `StdioSidecarTransport` (production) or a stub (unit tests).
 */
export interface SidecarTransport {
  health(): Promise<SidecarHealth>;
  runLoadFlow(input: SolverInput): Promise<SolverResult>;
}

/** Raised when the sidecar exits non-zero or returns malformed output. */
export class SidecarTransportError extends Error {
  override readonly name = "SidecarTransportError";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;

  constructor(
    message: string,
    args: { exitCode: number | null; stdout: string; stderr: string },
  ) {
    super(message);
    this.exitCode = args.exitCode;
    this.stdout = args.stdout;
    this.stderr = args.stderr;
  }
}

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
}

/** Minimal structural check on the health payload. */
export function isSidecarHealth(value: unknown): value is SidecarHealth {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sidecarName === "string" &&
    typeof v.sidecarVersion === "string" &&
    typeof v.contractInputVersion === "string" &&
    typeof v.solverName === "string" &&
    typeof v.solverVersion === "string" &&
    v.status === "ok"
  );
}

/**
 * Minimal structural check on a SolverResult. Field-level normalization
 * lives in `results.ts`; this guard only rejects payloads that are not
 * even shaped like a `SolverResult` (e.g., raw error strings, plain
 * arrays, or missing the required arrays).
 */
export function isSolverResult(value: unknown): value is SolverResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.status === "string" &&
    typeof v.converged === "boolean" &&
    Array.isArray(v.buses) &&
    Array.isArray(v.branches) &&
    Array.isArray(v.issues)
  );
}
