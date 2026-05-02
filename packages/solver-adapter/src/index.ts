// Stage 2 PR #4 / PR #5 — Solver Adapter public surface.
//
// PR #3 shipped contract types and the AppNetwork → SolverInput
// mapper. PR #4 added:
//   - SidecarTransport / StdioSidecarTransport (stdio JSON-Lines)
//   - LoadFlowResult, LoadFlowBus/Branch/EquipmentLoading/Issue types
//   - normalizeSolverResult(...) — solver projection → app result
//   - RuntimeCalculationSnapshot (runtime-only; never persisted)
//   - runLoadFlowForAppNetwork(...) — the orchestrator
// PR #5 adds:
//   - VoltageDropResult / VoltageDropBranchResult / VoltageDropIssue
//   - deriveVoltageDrop(loadFlow, appNetwork, options) — pure
//     derivation from a normalized Load Flow result.
//
// Stage 2 PR #5 deliberately does NOT export short-circuit, cable
// sizing, or report export — those remain Stage 3 / Stage 4 / Stage 5
// territory.

export * from "./types.js";
export {
  buildSolverInputFromAppNetwork,
  type BuildSolverInputOptions,
} from "./contract.js";
export {
  SidecarTransportError,
  isSidecarHealth,
  isSolverResult,
  type SidecarHealth,
  type SidecarTransport,
  type SidecarTransportOptions,
} from "./sidecarClient.js";
// Note: `StdioSidecarTransport` and the `DEFAULT_SIDECAR_*` path
// constants live in `./stdioSidecarTransport.js` (Node-only, imports
// `node:child_process`). Browser bundles (Vite) cannot resolve those
// imports, so the index intentionally does NOT re-export them. Node
// callers (CLI, integration tests, future desktop wrapper) import
// the file directly:
//   import { StdioSidecarTransport } from
//     "@power-system-study/solver-adapter/src/stdioSidecarTransport.js";
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
  type LoadFlowResultStatus,
  type LoadFlowSolverMetadata,
  type LoadFlowStatus,
  type NormalizeSolverResultArgs,
} from "./results.js";
export {
  createRuntimeSnapshot,
  type CreateRuntimeSnapshotInput,
  type RuntimeCalculationSnapshot,
  type RuntimeValidationIssue,
  type RuntimeValidationStatus,
  type RuntimeValidationSummary,
} from "./runtimeSnapshot.js";
export {
  runLoadFlowForAppNetwork,
  type LoadFlowRunBundle,
  type RunLoadFlowOptions,
} from "./loadFlow.js";
export {
  deriveVoltageDrop,
  DEFAULT_VOLTAGE_DROP_LIMIT_CABLE_PCT,
  DEFAULT_VOLTAGE_DROP_LIMIT_TRANSFORMER_PCT,
  type DeriveVoltageDropOptions,
  type VoltageDropBranchResult,
  type VoltageDropBranchStatus,
  type VoltageDropIssue,
  type VoltageDropIssueCode,
  type VoltageDropIssueSeverity,
  type VoltageDropResult,
  type VoltageDropStatus,
  type VoltageDropTotals,
} from "./voltageDrop.js";
