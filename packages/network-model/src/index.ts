// Stage 2 PR #2 — AppNetwork model + topology extraction.
//
// Public surface:
//   - Types: AppNetwork, NetworkBus, NetworkSource, NetworkGeneratorPQ,
//            NetworkTransformerBranch, NetworkCableBranch, NetworkGate,
//            NetworkLoad, NetworkMotor, NetworkTopologyEdge, NetworkBuildIssue,
//            NetworkBuildResult, NetworkBuildStatus, NetworkIssueSeverity.
//   - Function: buildAppNetwork(project) -> NetworkBuildResult.
//   - Codes: NETWORK_BUILD_CODES, NetworkBuildCode.
//   - Constant: NETWORK_MODEL_VERSION.

export * from "./types.js";
export * from "./codes.js";
export { buildAppNetwork } from "./buildAppNetwork.js";
export type { Topology } from "./topology.js";
export { SUPPORTED_BUS_TOPOLOGIES, isSupportedBusTopology } from "./topology.js";
