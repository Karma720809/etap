// Stage 2 PR #4 — Solver Adapter public surface.
//
// PR #3 shipped contract types and the AppNetwork → SolverInput
// mapper. PR #4 adds:
//   - SidecarTransport / StdioSidecarTransport (stdio JSON-Lines)
//   - LoadFlowResult, LoadFlowBus/Branch/EquipmentLoading/Issue types
//   - normalizeSolverResult(...) — solver projection → app result
//   - RuntimeCalculationSnapshot (runtime-only; never persisted)
//   - runLoadFlowForAppNetwork(...) — the orchestrator
//
// Stage 2 PR #4 deliberately does NOT export voltage-drop computation,
// short-circuit, cable sizing, or report export — those remain Stage
// 2 PR #5 / Stage 3 / Stage 4 / Stage 5 territory.

export * from "./types.js";
export {
  buildSolverInputFromAppNetwork,
  type BuildSolverInputOptions,
} from "./contract.js";
export {
  StdioSidecarTransport,
  SidecarTransportError,
  isSidecarHealth,
  isSolverResult,
  DEFAULT_SIDECAR_SCRIPT_PATH,
  DEFAULT_PYTHON_EXECUTABLE,
  type SidecarHealth,
  type SidecarTransport,
  type SidecarTransportOptions,
} from "./sidecarClient.js";
export {
  normalizeSolverResult,
  type LoadFlowBranchKind,
  type LoadFlowBranchResult,
  type LoadFlowBusResult,
  type LoadFlowEquipmentLoadingResult,
  type LoadFlowIssue,
  type LoadFlowIssueCode,
  type LoadFlowIssueSeverity,
  type LoadFlowResult,
  type LoadFlowSolverMetadata,
  type LoadFlowStatus,
  type NormalizeSolverResultArgs,
} from "./results.js";
export {
  createRuntimeSnapshot,
  type CreateRuntimeSnapshotInput,
  type RuntimeCalculationSnapshot,
} from "./runtimeSnapshot.js";
export {
  runLoadFlowForAppNetwork,
  type LoadFlowRunBundle,
  type RunLoadFlowOptions,
} from "./loadFlow.js";
