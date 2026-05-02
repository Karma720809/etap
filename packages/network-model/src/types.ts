// Stage 2 App Standard Network Model (`AppNetwork`).
//
// This is the app-layer calculation model produced from the Stage 1 canonical
// project file by `buildAppNetwork()`. It is intentionally separate from the
// canonical project file, the React Flow diagram model, and any solver model
// (e.g., pandapower). PR #2 builds the topology layer only — no solver, no
// result snapshots, no calculation results.
//
// Stage 2 OQ decisions reflected in this file:
//   S2-OQ-01 — only electrically meaningful elements become solver branches:
//              cables → NetworkCableBranch; breakers/switches → gates only.
//   S2-OQ-02 — closed/in-service breaker/switch is a topology gate, not a
//              solver impedance element.
//   S2-OQ-03 — open or out-of-service breaker/switch breaks the topology path
//              and the path's cable is excluded from AppNetwork.
//   S2-OQ-04 — transformer remains a node in the project file; it is converted
//              to a calculation branch only inside this package.
//   S2-OQ-05 — type names avoid "load_flow"/"voltage_drop" lock-in so the
//              shared result bundle (PR #4) can plug in cleanly.
//   S2-OQ-06 — no real CalculationSnapshot is created here. AppNetwork is an
//              in-memory object only.
//
// Field naming uses Stage 1 canonical names (`internalId`, `tag`, `vnKv`,
// `fromBus`/`toBus`, `connectedBus`, `status`). PRD §8 illustrative names
// (`bus`, `inService`) are not reintroduced.

import type { Topology } from "./topology.js";

/** Stage 2 AppNetwork schema version. Ticks when the model shape changes. */
export const NETWORK_MODEL_VERSION = "2.0.0-pr2" as const;

export type NetworkBuildStatus = "valid" | "invalid";

export type NetworkIssueSeverity = "error" | "warning" | "info";

/** Issue raised during AppNetwork construction. */
export interface NetworkBuildIssue {
  code: string;
  severity: NetworkIssueSeverity;
  message: string;
  /** Equipment internalId most relevant to the issue (when applicable). */
  equipmentInternalId?: string;
  /** Diagram edge id most relevant to the issue (when applicable). */
  diagramEdgeId?: string;
  /** Field name on the equipment that triggered the issue. */
  field?: string;
  /** Free-form path used for cross-project traceability. */
  path?: string;
}

export interface NetworkBus {
  /** Stage 1 Bus.internalId. */
  internalId: string;
  tag: string;
  vnKv: number;
  topology: Topology;
  minVoltagePct: number | null;
  maxVoltagePct: number | null;
}

export type NetworkSourceKind = "utility" | "generator_pq";
export type NetworkSourceRole = "slack" | "pq";

export interface NetworkSource {
  internalId: string;
  tag: string;
  kind: NetworkSourceKind;
  busInternalId: string;
  vnKv: number | null;
  scLevelMva: number | null;
  faultCurrentKa: number | null;
  xrRatio: number | null;
  voltageFactor: number | null;
  role: NetworkSourceRole;
  /** Active power injection for grid-parallel PQ generators; null for utilities. */
  pMw: number | null;
  /** Reactive power injection for grid-parallel PQ generators; null for utilities. */
  qMvar: number | null;
}

export interface NetworkGeneratorPQ {
  /** Stage 1 Generator.internalId. */
  internalId: string;
  tag: string;
  busInternalId: string;
  pMw: number | null;
  qMvar: number | null;
}

export interface NetworkTransformerBranch {
  /** Stage 1 Transformer.internalId — preserved across the node→branch conversion. */
  internalId: string;
  tag: string;
  /** HV bus (= Transformer.fromBus). */
  fromBusInternalId: string;
  /** LV bus (= Transformer.toBus). */
  toBusInternalId: string;
  snMva: number | null;
  vnHvKv: number | null;
  vnLvKv: number | null;
  vkPercent: number | null;
  vkrPercent: number | null;
  xrRatio: number | null;
  vectorGroup: string | null;
  tapPosition: number | null;
}

export interface NetworkCableBranch {
  /** Stage 1 Cable.internalId. */
  internalId: string;
  tag: string;
  fromBusInternalId: string;
  toBusInternalId: string;
  lengthM: number | null;
  rOhmPerKm: number | null;
  xOhmPerKm: number | null;
  /**
   * Position of the cable inside its branch_chain (0-indexed). Useful for UI
   * attribution and debugging; never used as a solver input.
   */
  branchChainOrderIndex: number | null;
  /**
   * Diagram branch_chain edge id this cable came from.
   * Cables that are referenced outside of any branch_chain are not produced
   * by buildAppNetwork in PR #2 — they require a branch_chain edge to be
   * topologically reachable.
   */
  branchChainEdgeId: string | null;
}

export type NetworkGateKind = "breaker" | "switch";

export interface NetworkGate {
  /** Stage 1 ProtectiveDevice.internalId or SwitchDevice.internalId. */
  internalId: string;
  tag: string;
  kind: NetworkGateKind;
  fromBusInternalId: string;
  toBusInternalId: string;
  /**
   * Gates are only included when the path is enabled. Stored for UI/result
   * attribution per S2-OQ-02; they contribute zero impedance to any solver.
   */
  state: "closed";
  /** 0-indexed position within its branch_chain. */
  branchChainOrderIndex: number | null;
  branchChainEdgeId: string | null;
}

export interface NetworkLoad {
  /** Stage 1 Load.internalId. */
  internalId: string;
  tag: string;
  busInternalId: string;
  /**
   * Active power in MW computed from Stage 1 `kw`. May be 0 when `kw` is
   * missing or non-positive — Stage 1 validation already raises E-EQ-001 /
   * E-EQ-002 in those cases; AppNetwork carries zeros to keep the model
   * topologically complete without inventing values.
   */
  pMw: number;
  /** Reactive power in MVAr derived from `kvar` if present, otherwise from `powerFactor`. */
  qMvar: number;
  demandFactor: number | null;
}

export interface NetworkMotor {
  /** Stage 1 Motor.internalId. */
  internalId: string;
  tag: string;
  busInternalId: string;
  /**
   * Steady-state PQ representation of the motor for Stage 2 Load Flow
   * (motor starting voltage drop is out of scope per spec §6.4).
   */
  pMw: number;
  qMvar: number;
}

/**
 * Topology edge connecting a piece of bus-attached equipment to its bus
 * (utility, generator, load, motor) or recording the transformer↔bus edges
 * that were resolved during transformer-as-node conversion.
 *
 * Branch elements (cables, gates) are not represented here — they live in
 * `cables` / `gates` with explicit endpoints.
 */
export type NetworkTopologyEdgeKind = "source" | "load" | "motor" | "generator" | "transformer";

export interface NetworkTopologyEdge {
  /** Stage 1 diagram edge id; null for synthetic edges. */
  diagramEdgeId: string | null;
  kind: NetworkTopologyEdgeKind;
  busInternalId: string;
  /** Bus-attached equipment internalId (or transformer for transformer↔bus). */
  equipmentInternalId: string;
}

/**
 * Bus↔bus reachability tie produced by an enabled gate-only `branch_chain`
 * (per Stage 2 spec §5.6 — no cable, no transformer, only closed/in-service
 * breakers and switches). The connection collapses to a direct topological
 * link between the two endpoints. It carries zero impedance; the solver must
 * not treat it as a line/branch element. PR #2 surfaces it for floating-bus
 * reachability and traceability only; merging the two `NetworkBus` records
 * into a single solver bus is deferred to a later Stage 2 PR.
 */
export interface NetworkGateConnection {
  fromBusInternalId: string;
  toBusInternalId: string;
  /** Diagram branch_chain edge that produced this connection. */
  branchChainEdgeId: string;
  /** Ordered breaker / switch internalIds taken from `branchEquipmentInternalIds`. */
  gateInternalIds: string[];
}

export interface AppNetwork {
  /**
   * Monotonic version of the AppNetwork shape. Ticks when the in-memory model
   * changes in a way that affects downstream snapshots (PR #4 onward).
   */
  networkModelVersion: typeof NETWORK_MODEL_VERSION;
  /**
   * Scenario this AppNetwork was built from. PR #2 does not apply scenario
   * overrides yet — the field is populated from the project's first scenario
   * (or null when the project has none) for forward traceability.
   */
  scenarioId: string | null;
  /** Frequency from project metadata. */
  frequencyHz: 50 | 60;
  buses: NetworkBus[];
  sources: NetworkSource[];
  generators: NetworkGeneratorPQ[];
  transformers: NetworkTransformerBranch[];
  cables: NetworkCableBranch[];
  /**
   * Closed/in-service gates kept for traceability (S2-OQ-02). Gates contribute
   * zero impedance to any solver and are never required for Stage 2 PR #2.
   */
  gates: NetworkGate[];
  /**
   * Direct bus↔bus ties produced by enabled gate-only branch_chains (spec §5.6).
   * These carry zero impedance and are used by topology reachability checks
   * (e.g., floating-bus detection) but never as solver impedance elements.
   */
  gateConnections: NetworkGateConnection[];
  loads: NetworkLoad[];
  motors: NetworkMotor[];
  /** Topology edges resolved during build (sources, loads, motors, transformer node→branch). */
  topologyEdges: NetworkTopologyEdge[];
}

/**
 * Result of `buildAppNetwork()`. `appNetwork` is non-null iff
 * `status === "valid"` (i.e., no `error`-severity issue was raised).
 *
 * The field name follows the Stage 2 spec §4 (`appNetwork`). `issues` collects
 * blocking errors and `warnings` collects non-blocking diagnostics; the spec's
 * single mixed-severity `issues` view can be derived as
 * `[...issues, ...warnings]` if needed.
 */
export interface NetworkBuildResult {
  status: NetworkBuildStatus;
  appNetwork: AppNetwork | null;
  /** Blocking issues (severity "error"). Non-empty implies `status === "invalid"`. */
  issues: NetworkBuildIssue[];
  /** Non-blocking warnings and info diagnostics raised during build. */
  warnings: NetworkBuildIssue[];
}
