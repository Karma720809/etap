// Stage 2 PR #3 — Solver Adapter Contract.
//
// Public surface:
//   - Types: SolverBus, SolverSource, SolverTransformer, SolverLine,
//            SolverLoad, SolverGeneratorPQ, SolverOptions, SolverInput,
//            SolverMetadata, SolverResult, SolverBusResult,
//            SolverBranchResult, SolverIssue, plus the supporting
//            unions (SolverSourceKind, SolverSourceRole, SolverAlgorithm,
//            SolverBranchKind, SolverIssueCode, SolverIssueSeverity,
//            SolverLoadOrigin, SolverResultStatus, SolverName,
//            SolverBusTopology).
//   - Constants: SOLVER_ADAPTER_VERSION, SOLVER_INPUT_VERSION,
//                DEFAULT_SOLVER_OPTIONS.
//   - Mapper: buildSolverInputFromAppNetwork(appNetwork, options).
//
// PR #3 deliberately does NOT export any "runSolver" / "executeLoadFlow"
// surface — that boundary is owned by Stage 2 PR #4 once a transport is
// chosen for the Python sidecar.

export * from "./types.js";
export {
  buildSolverInputFromAppNetwork,
  type BuildSolverInputOptions,
} from "./contract.js";
