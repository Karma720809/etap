// Stage 2 PR #4 — Solver sidecar transport contract (browser-safe).
// Stage 2 PR #5 — split: this file no longer imports `node:*`.
//
// The sidecar transport is the boundary between the TypeScript
// solver adapter and the Python solver process. The contract types
// live here so the orchestrator and any UI code can depend on them
// without pulling in `node:child_process`. The real stdio
// implementation lives in `stdioSidecarTransport.ts` and is loaded
// lazily — Node-only call sites import it directly; browser bundles
// (Vite) get the contract types and inject their own transport at
// the React root.
//
// Stage 2 PR #4 wire format:
//   - One process per call. The Node implementation spawns
//       python3 <sidecarScriptPath> run_load_flow
//     writes one JSON line (the `SolverInput`) to stdin, closes stdin,
//     reads stdout to EOF, and parses it as a single JSON value.
//   - The sidecar exits 0 on a structured response (succeeded,
//     failed_validation, or failed_solver). A non-zero exit means the
//     transport itself failed and we must not invent a SolverResult —
//     it is mapped to `E-LF-004` instead (see `runLoadFlow` in
//     `loadFlow.ts`).

import type { SolverInput, SolverResult } from "./types.js";

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
 * even shaped like a `SolverResult`.
 *
 * Stage 2 PR #4 review blocker 1 hardening: `metadata` is REQUIRED to
 * be an object (not null, not missing). A response with `metadata:
 * null` would later crash result normalization, so the transport layer
 * rejects it and the orchestrator converts the rejection into a
 * structured `E-LF-004` issue rather than letting the bad shape reach
 * normalization.
 */
export function isSolverResult(value: unknown): value is SolverResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.status !== "string" ||
    typeof v.converged !== "boolean" ||
    !Array.isArray(v.buses) ||
    !Array.isArray(v.branches) ||
    !Array.isArray(v.issues)
  ) {
    return false;
  }
  if (typeof v.metadata !== "object" || v.metadata === null) {
    return false;
  }
  const meta = v.metadata as Record<string, unknown>;
  return (
    typeof meta.solverName === "string" &&
    typeof meta.solverVersion === "string" &&
    typeof meta.adapterVersion === "string" &&
    typeof meta.executedAt === "string" &&
    typeof meta.options === "object" &&
    meta.options !== null
  );
}
