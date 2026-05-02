// Stage 2 PR #2 — AppNetwork topology extraction.
//
// `buildAppNetwork(project)` is a pure function that converts a Stage 1
// canonical project file into an AppNetwork (or a NetworkBuildResult that
// explains why the network is invalid). It does not mutate the input project.
//
// What this layer does NOT do (deferred to later Stage 2 PRs):
//   - solver execution (PR #3 / PR #4)
//   - voltage / current / loading results (PR #4 / PR #5)
//   - calculation snapshots / result bundles (PR #4+, runtime-only)
//   - scenario override merging (planned for PR #3+)
//
// All field accesses use Stage 1 canonical names. No PRD §8 illustrative names
// (`bus`, `inService`) are reintroduced. The Stage 1 project schema is
// untouched.

import type {
  EquipmentCollections,
  PowerSystemProjectFile,
} from "@power-system-study/schemas";
import {
  NETWORK_MODEL_VERSION,
  type AppNetwork,
  type NetworkBuildIssue,
  type NetworkBuildResult,
  type NetworkBus,
  type NetworkCableBranch,
  type NetworkGate,
  type NetworkGeneratorPQ,
  type NetworkIssueSeverity,
  type NetworkLoad,
  type NetworkMotor,
  type NetworkSource,
  type NetworkTopologyEdge,
  type NetworkTransformerBranch,
} from "./types.js";
import {
  defaultMessageFor,
  severityOf,
  type NetworkBuildCode,
} from "./codes.js";
import { isSupportedBusTopology, type Topology } from "./topology.js";

type Utility = EquipmentCollections["utilities"][number];
type Generator = EquipmentCollections["generators"][number];
type Bus = EquipmentCollections["buses"][number];
type Transformer = EquipmentCollections["transformers"][number];
type Cable = EquipmentCollections["cables"][number];
type Breaker = EquipmentCollections["breakers"][number];
type SwitchDevice = EquipmentCollections["switches"][number];
type Load = EquipmentCollections["loads"][number];
type Motor = EquipmentCollections["motors"][number];

type DiagramEdge = PowerSystemProjectFile["diagram"]["edges"][number];

interface IssueInput {
  code: NetworkBuildCode;
  message?: string;
  equipmentInternalId?: string;
  diagramEdgeId?: string;
  field?: string;
  path?: string;
}

function makeIssue(input: IssueInput): NetworkBuildIssue {
  const issue: NetworkBuildIssue = {
    code: input.code,
    severity: severityOf(input.code),
    message: input.message ?? defaultMessageFor(input.code),
  };
  if (input.equipmentInternalId !== undefined) issue.equipmentInternalId = input.equipmentInternalId;
  if (input.diagramEdgeId !== undefined) issue.diagramEdgeId = input.diagramEdgeId;
  if (input.field !== undefined) issue.field = input.field;
  if (input.path !== undefined) issue.path = input.path;
  return issue;
}

interface IssueCollector {
  /** Severity-error issues that block AppNetwork construction. */
  errors: NetworkBuildIssue[];
  /** Severity-warning / -info issues collected during construction. */
  warnings: NetworkBuildIssue[];
}

function pushIssue(collector: IssueCollector, issue: NetworkBuildIssue): void {
  if (issue.severity === "error") {
    collector.errors.push(issue);
  } else {
    collector.warnings.push(issue);
  }
}

function tagOf(internalId: string, byId: Map<string, { tag: string }>): string {
  return byId.get(internalId)?.tag ?? internalId;
}

function tan(pf: number): number {
  // pf in [0, 1]; tan(acos(pf)) = sqrt(1 - pf^2) / pf
  if (!Number.isFinite(pf) || pf <= 0 || pf > 1) return 0;
  const sin = Math.sqrt(Math.max(0, 1 - pf * pf));
  return sin / pf;
}

function deriveLoadPQ(load: Load): { pMw: number; qMvar: number } {
  const kw = load.kw ?? 0;
  const pMw = kw > 0 ? kw / 1000 : 0;
  const kvar = load.kvar;
  if (kvar !== null && kvar !== undefined && Number.isFinite(kvar)) {
    return { pMw, qMvar: kvar / 1000 };
  }
  const pf = load.powerFactor ?? null;
  if (pf !== null && Number.isFinite(pf) && pf > 0 && pf <= 1) {
    return { pMw, qMvar: pMw * tan(pf) };
  }
  return { pMw, qMvar: 0 };
}

function deriveMotorPQ(motor: Motor): { pMw: number; qMvar: number } {
  const ratedKw = motor.ratedKw ?? 0;
  const efficiency = motor.efficiency ?? null;
  // Steady-state input power = shaft power / efficiency.
  // Treat efficiency = null/<=0 as 1.0 to avoid division by zero — Stage 1
  // already raises E-EQ-001/E-EQ-002 for missing/non-positive efficiency.
  const eff = efficiency !== null && Number.isFinite(efficiency) && efficiency > 0 ? efficiency : 1;
  const pMw = ratedKw > 0 ? ratedKw / 1000 / eff : 0;
  const pf = motor.powerFactor ?? null;
  const qMvar = pf !== null && Number.isFinite(pf) && pf > 0 && pf <= 1 ? pMw * tan(pf) : 0;
  return { pMw, qMvar };
}

function collectBuses(
  project: PowerSystemProjectFile,
  collector: IssueCollector,
): { buses: NetworkBus[]; busIds: Set<string> } {
  const buses: NetworkBus[] = [];
  const busIds = new Set<string>();
  for (const b of project.equipment.buses) {
    const topology = b.topology as Topology;
    if (!isSupportedBusTopology(topology)) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-LF-002",
          equipmentInternalId: b.internalId,
          field: "topology",
          message: `Bus '${b.tag}' has unsupported topology '${topology}' for Stage 2 Load Flow (3P3W / 3P4W only)`,
        }),
      );
      // Continue collecting other diagnostics; the build will fail because
      // of the error pushed above.
      continue;
    }
    if (b.vnKv === null || !Number.isFinite(b.vnKv) || b.vnKv <= 0) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-EQ-001",
          equipmentInternalId: b.internalId,
          field: "vnKv",
          message: `Bus '${b.tag}': vnKv must be positive for AppNetwork construction`,
        }),
      );
      continue;
    }
    busIds.add(b.internalId);
    buses.push({
      internalId: b.internalId,
      tag: b.tag,
      vnKv: b.vnKv,
      topology,
      minVoltagePct: b.minVoltagePct,
      maxVoltagePct: b.maxVoltagePct,
    });
  }
  return { buses, busIds };
}

function collectSources(
  project: PowerSystemProjectFile,
  busIds: Set<string>,
  collector: IssueCollector,
): { sources: NetworkSource[]; generators: NetworkGeneratorPQ[]; sourceEdges: NetworkTopologyEdge[] } {
  const utilities = project.equipment.utilities.filter((u) => u.status === "in_service");
  const sources: NetworkSource[] = [];
  const generators: NetworkGeneratorPQ[] = [];
  const sourceEdges: NetworkTopologyEdge[] = [];

  // Utility selection — Stage 2 MVP supports exactly one in-service utility
  // (S2-OQ-03 / spec §4.3). Two or more raise E-LF-003.
  if (utilities.length > 1) {
    const sorted = [...utilities].sort((a, b) => a.internalId.localeCompare(b.internalId));
    const chosen = sorted[0]!;
    pushIssue(
      collector,
      makeIssue({
        code: "E-LF-003",
        message: `Stage 2 MVP supports exactly one in-service utility; found ${utilities.length} (${utilities.map((u) => u.tag).join(", ")})`,
        equipmentInternalId: chosen.internalId,
        field: "status",
      }),
    );
  }
  const chosenUtility: Utility | null = utilities.length === 1
    ? (utilities[0] ?? null)
    : utilities.length > 1
      ? ([...utilities].sort((a, b) => a.internalId.localeCompare(b.internalId))[0] ?? null)
      : null;

  for (const u of utilities) {
    if (u.connectedBus === null) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-EQ-001",
          equipmentInternalId: u.internalId,
          field: "connectedBus",
          message: `Utility '${u.tag}': connectedBus is required for AppNetwork construction`,
        }),
      );
      continue;
    }
    if (!busIds.has(u.connectedBus)) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-NET-003",
          equipmentInternalId: u.internalId,
          field: "connectedBus",
          message: `Utility '${u.tag}': connectedBus '${u.connectedBus}' does not reference an active bus`,
        }),
      );
      continue;
    }
    if (chosenUtility && u.internalId !== chosenUtility.internalId) {
      // Already raised E-LF-003 above; do not duplicate.
      continue;
    }
    sources.push({
      internalId: u.internalId,
      tag: u.tag,
      kind: "utility",
      busInternalId: u.connectedBus,
      vnKv: u.vnKv,
      scLevelMva: u.scLevelMva ?? null,
      faultCurrentKa: u.faultCurrentKa ?? null,
      xrRatio: u.xrRatio ?? null,
      voltageFactor: u.voltageFactor ?? null,
      role: "slack",
      pMw: null,
      qMvar: null,
    });
    sourceEdges.push({
      diagramEdgeId: null,
      kind: "source",
      busInternalId: u.connectedBus,
      equipmentInternalId: u.internalId,
    });
  }

  // Generators.
  const inServiceGens = project.equipment.generators.filter((g) => g.status === "in_service");
  for (const g of inServiceGens) {
    if (g.operatingMode === "out_of_service") {
      // Defensive: status in_service but operatingMode out_of_service is
      // contradictory. Treat as non-generator and warn.
      pushIssue(
        collector,
        makeIssue({
          code: "W-GEN-001",
          equipmentInternalId: g.internalId,
          field: "operatingMode",
          message: `Generator '${g.tag}': in_service status with operatingMode='out_of_service' is contradictory; excluded from AppNetwork`,
        }),
      );
      continue;
    }
    if (g.operatingMode !== "grid_parallel_pq") {
      // PV / island modes are unsupported in Stage 2 — emit W-GEN-001 + E-LF-003.
      pushIssue(
        collector,
        makeIssue({
          code: "W-GEN-001",
          equipmentInternalId: g.internalId,
          field: "operatingMode",
          message: `Generator '${g.tag}' operating mode '${g.operatingMode}' is not supported by Stage 2 Load Flow`,
        }),
      );
      pushIssue(
        collector,
        makeIssue({
          code: "E-LF-003",
          equipmentInternalId: g.internalId,
          field: "operatingMode",
          message: `Generator '${g.tag}' uses unsupported operating mode '${g.operatingMode}'; only grid_parallel_pq is supported in Stage 2 MVP`,
        }),
      );
      continue;
    }
    if (g.connectedBus === null) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-EQ-001",
          equipmentInternalId: g.internalId,
          field: "connectedBus",
          message: `Generator '${g.tag}': connectedBus is required for AppNetwork construction`,
        }),
      );
      continue;
    }
    if (!busIds.has(g.connectedBus)) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-NET-003",
          equipmentInternalId: g.internalId,
          field: "connectedBus",
          message: `Generator '${g.tag}': connectedBus '${g.connectedBus}' does not reference an active bus`,
        }),
      );
      continue;
    }
    const pMw = g.pMw ?? null;
    const qMvar = g.qMvar ?? null;
    generators.push({
      internalId: g.internalId,
      tag: g.tag,
      busInternalId: g.connectedBus,
      pMw,
      qMvar,
    });
    sources.push({
      internalId: g.internalId,
      tag: g.tag,
      kind: "generator_pq",
      busInternalId: g.connectedBus,
      vnKv: g.ratedVoltageKv ?? null,
      scLevelMva: null,
      faultCurrentKa: null,
      xrRatio: null,
      voltageFactor: null,
      role: "pq",
      pMw,
      qMvar,
    });
    sourceEdges.push({
      diagramEdgeId: null,
      kind: "generator",
      busInternalId: g.connectedBus,
      equipmentInternalId: g.internalId,
    });
  }

  // Source-missing policy. The Stage 2 spec §4.3 requires at least one
  // in-service slack-eligible source. Empty projects use I-NET-001 instead.
  const inServiceUtilCount = utilities.length;
  const inServiceGenCount = inServiceGens.filter((g) => g.operatingMode === "grid_parallel_pq").length;
  const projectIsEmpty = isProjectEmpty(project);
  if (projectIsEmpty) {
    pushIssue(collector, makeIssue({ code: "I-NET-001" }));
    pushIssue(
      collector,
      makeIssue({
        code: "E-LF-003",
        message: "Stage 2 Load Flow requires an in-service utility or generator source; project is empty",
      }),
    );
  } else if (inServiceUtilCount === 0 && inServiceGenCount === 0) {
    pushIssue(collector, makeIssue({ code: "E-NET-001" }));
    pushIssue(
      collector,
      makeIssue({
        code: "E-LF-003",
        message: "Stage 2 Load Flow requires an in-service utility or generator source",
      }),
    );
  } else if (inServiceUtilCount === 0 && sources.every((s) => s.role !== "slack")) {
    // Only PQ generators present, no utility slack; PQ-only is not a valid
    // slack assignment in Stage 2 MVP.
    pushIssue(
      collector,
      makeIssue({
        code: "E-LF-003",
        message: "Stage 2 Load Flow requires an in-service utility slack; only PQ generators are present",
      }),
    );
  }

  return { sources, generators, sourceEdges };
}

function isProjectEmpty(project: PowerSystemProjectFile): boolean {
  const eq = project.equipment;
  return (
    eq.utilities.length === 0 &&
    eq.generators.length === 0 &&
    eq.buses.length === 0 &&
    eq.transformers.length === 0 &&
    eq.cables.length === 0 &&
    eq.breakers.length === 0 &&
    eq.switches.length === 0 &&
    eq.loads.length === 0 &&
    eq.motors.length === 0 &&
    (eq.placeholders?.length ?? 0) === 0
  );
}

function collectTransformers(
  project: PowerSystemProjectFile,
  busIds: Set<string>,
  collector: IssueCollector,
): { transformers: NetworkTransformerBranch[]; transformerEdges: NetworkTopologyEdge[] } {
  const transformers: NetworkTransformerBranch[] = [];
  const transformerEdges: NetworkTopologyEdge[] = [];

  const nodesByEquipment = new Map<string, string>();
  for (const node of project.diagram.nodes) {
    nodesByEquipment.set(node.equipmentInternalId, node.id);
  }

  // Map each diagram node id to its bus equipmentInternalId, when the node is a bus.
  const nodeToBus = new Map<string, string>();
  for (const node of project.diagram.nodes) {
    if (node.kind === "bus") nodeToBus.set(node.id, node.equipmentInternalId);
  }

  for (const t of project.equipment.transformers) {
    if (t.status === "out_of_service") {
      // S2-OQ-03 — out-of-service transformer breaks the topology path; not
      // included in AppNetwork. No issue at this layer; downstream
      // floating-bus detection will surface E-NET-002 if needed.
      continue;
    }
    if (t.fromBus === null || t.toBus === null) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-EQ-003",
          equipmentInternalId: t.internalId,
          field: t.fromBus === null ? "fromBus" : "toBus",
          message: `Transformer '${t.tag}': both fromBus and toBus must be set for AppNetwork construction`,
        }),
      );
      continue;
    }
    if (t.fromBus === t.toBus) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-EQ-003",
          equipmentInternalId: t.internalId,
          field: "fromBus",
          message: `Transformer '${t.tag}': fromBus and toBus must be different`,
        }),
      );
      continue;
    }
    if (!busIds.has(t.fromBus) || !busIds.has(t.toBus)) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-NET-003",
          equipmentInternalId: t.internalId,
          field: !busIds.has(t.fromBus) ? "fromBus" : "toBus",
          message: `Transformer '${t.tag}': fromBus/toBus must reference active buses`,
        }),
      );
      continue;
    }
    // Cross-check: the transformer's diagram node must touch exactly two
    // bus-side connection edges, and those bus-side endpoints should match
    // fromBus / toBus. Mismatch is W-NET-001 (warning); a wrong number of
    // bus-side connection edges is E-LF-002 (blocking) per spec §4.3.
    const transformerNodeId = nodesByEquipment.get(t.internalId);
    if (transformerNodeId !== undefined) {
      const busNeighborIds = new Set<string>();
      const matchingEdgeIds: string[] = [];
      for (const edge of project.diagram.edges) {
        if (edge.kind !== "connection") continue;
        if (edge.fromNodeId === transformerNodeId) {
          const other = nodeToBus.get(edge.toNodeId);
          if (other !== undefined) {
            busNeighborIds.add(other);
            matchingEdgeIds.push(edge.id);
          }
        } else if (edge.toNodeId === transformerNodeId) {
          const other = nodeToBus.get(edge.fromNodeId);
          if (other !== undefined) {
            busNeighborIds.add(other);
            matchingEdgeIds.push(edge.id);
          }
        }
      }
      if (busNeighborIds.size !== 2) {
        pushIssue(
          collector,
          makeIssue({
            code: "E-LF-002",
            equipmentInternalId: t.internalId,
            message: `Transformer '${t.tag}' diagram node has ${busNeighborIds.size} bus-side connection edge(s); exactly 2 are required for transformer-as-node conversion`,
          }),
        );
        continue;
      }
      const expected = new Set<string>([t.fromBus, t.toBus]);
      const sameSet = busNeighborIds.size === expected.size && [...busNeighborIds].every((id) => expected.has(id));
      if (!sameSet) {
        pushIssue(
          collector,
          makeIssue({
            code: "W-NET-001",
            equipmentInternalId: t.internalId,
            message: `Transformer '${t.tag}' diagram bus-side connections (${[...busNeighborIds].join(", ")}) disagree with equipment fromBus/toBus (${t.fromBus}, ${t.toBus})`,
          }),
        );
      }
      for (const edgeId of matchingEdgeIds) {
        const edge = project.diagram.edges.find((e) => e.id === edgeId);
        const otherNode = edge ? (edge.fromNodeId === transformerNodeId ? edge.toNodeId : edge.fromNodeId) : undefined;
        const busInternalId = otherNode ? nodeToBus.get(otherNode) : undefined;
        if (busInternalId === undefined) continue;
        transformerEdges.push({
          diagramEdgeId: edgeId,
          kind: "transformer",
          busInternalId,
          equipmentInternalId: t.internalId,
        });
      }
    }

    transformers.push({
      internalId: t.internalId,
      tag: t.tag,
      fromBusInternalId: t.fromBus,
      toBusInternalId: t.toBus,
      snMva: t.snMva,
      vnHvKv: t.vnHvKv,
      vnLvKv: t.vnLvKv,
      vkPercent: t.vkPercent,
      vkrPercent: t.vkrPercent ?? null,
      xrRatio: t.xrRatio ?? null,
      vectorGroup: t.vectorGroup ?? null,
      tapPosition: t.tapPosition ?? null,
    });
  }
  return { transformers, transformerEdges };
}

interface BranchChainContext {
  cables: Map<string, Cable>;
  breakers: Map<string, Breaker>;
  switches: Map<string, SwitchDevice>;
  busNodeIdToBusId: Map<string, string>;
}

function buildBranchChainContext(project: PowerSystemProjectFile): BranchChainContext {
  const cables = new Map<string, Cable>();
  const breakers = new Map<string, Breaker>();
  const switches = new Map<string, SwitchDevice>();
  for (const c of project.equipment.cables) cables.set(c.internalId, c);
  for (const b of project.equipment.breakers) breakers.set(b.internalId, b);
  for (const s of project.equipment.switches) switches.set(s.internalId, s);
  const busNodeIdToBusId = new Map<string, string>();
  for (const node of project.diagram.nodes) {
    if (node.kind === "bus") busNodeIdToBusId.set(node.id, node.equipmentInternalId);
  }
  return { cables, breakers, switches, busNodeIdToBusId };
}

function convertBranchChainEdge(
  edge: DiagramEdge,
  ctx: BranchChainContext,
  busIds: Set<string>,
  collector: IssueCollector,
): { cables: NetworkCableBranch[]; gates: NetworkGate[] } {
  const out = { cables: [] as NetworkCableBranch[], gates: [] as NetworkGate[] };
  const upstreamBusId = ctx.busNodeIdToBusId.get(edge.fromNodeId);
  const downstreamBusId = ctx.busNodeIdToBusId.get(edge.toNodeId);
  if (upstreamBusId === undefined || downstreamBusId === undefined) {
    // Endpoints are not bus nodes — Stage 1 already raises E-NET-004 / similar.
    pushIssue(
      collector,
      makeIssue({
        code: "E-LF-002",
        diagramEdgeId: edge.id,
        message: `branch_chain edge '${edge.id}' endpoints are not bus nodes; cannot convert to AppNetwork`,
      }),
    );
    return out;
  }
  if (!busIds.has(upstreamBusId) || !busIds.has(downstreamBusId)) {
    pushIssue(
      collector,
      makeIssue({
        code: "E-NET-003",
        diagramEdgeId: edge.id,
        message: `branch_chain edge '${edge.id}' endpoints reference non-active buses`,
      }),
    );
    return out;
  }

  const ids = edge.branchEquipmentInternalIds ?? [];

  // First pass: classify every member; reject unsupported equipment kinds and
  // missing references with a blocking issue. This mirrors the Stage 1
  // E-DIA-005 / E-DIA-004 codes for callers that bypass validateProject.
  type Member =
    | { kind: "cable"; index: number; cable: Cable }
    | { kind: "breaker"; index: number; breaker: Breaker }
    | { kind: "switch"; index: number; switchDevice: SwitchDevice };
  const members: Member[] = [];
  let pathBlocked = false;
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index]!;
    const cable = ctx.cables.get(id);
    if (cable !== undefined) {
      members.push({ kind: "cable", index, cable });
      continue;
    }
    const breaker = ctx.breakers.get(id);
    if (breaker !== undefined) {
      members.push({ kind: "breaker", index, breaker });
      continue;
    }
    const switchDevice = ctx.switches.get(id);
    if (switchDevice !== undefined) {
      members.push({ kind: "switch", index, switchDevice });
      continue;
    }
    pushIssue(
      collector,
      makeIssue({
        code: "E-DIA-005",
        diagramEdgeId: edge.id,
        message: `branch_chain edge '${edge.id}': member '${id}' is missing or not a breaker/cable/switch`,
      }),
    );
    pathBlocked = true;
  }
  if (pathBlocked) return out;

  // Second pass: enforce S2-OQ-03 — the entire chain must be enabled for any
  // cable inside it to become a NetworkCableBranch.
  let chainEnabled = true;
  for (const m of members) {
    if (m.kind === "cable") {
      if (m.cable.status === "out_of_service") {
        chainEnabled = false;
        break;
      }
    } else if (m.kind === "breaker") {
      if (m.breaker.status === "out_of_service" || m.breaker.state === "open") {
        chainEnabled = false;
        break;
      }
    } else {
      if (m.switchDevice.status === "out_of_service" || m.switchDevice.state === "open") {
        chainEnabled = false;
        break;
      }
    }
  }
  if (!chainEnabled) {
    // Path is broken; do not emit cables or gates. Floating-bus detection (if
    // implemented later in this builder, or by validateProject) will report
    // any downstream consequences.
    return out;
  }

  for (const m of members) {
    if (m.kind === "cable") {
      // Endpoint mismatch warning per Stage 1 W-NET-001.
      const fromMismatch = m.cable.fromBus !== null && m.cable.fromBus !== upstreamBusId;
      const toMismatch = m.cable.toBus !== null && m.cable.toBus !== downstreamBusId;
      if (fromMismatch || toMismatch) {
        pushIssue(
          collector,
          makeIssue({
            code: "W-NET-001",
            equipmentInternalId: m.cable.internalId,
            diagramEdgeId: edge.id,
            message: `Cable '${m.cable.tag}' endpoints (${m.cable.fromBus ?? "null"} → ${m.cable.toBus ?? "null"}) disagree with branch_chain '${edge.id}' (${upstreamBusId} → ${downstreamBusId})`,
          }),
        );
      }
      out.cables.push({
        internalId: m.cable.internalId,
        tag: m.cable.tag,
        fromBusInternalId: upstreamBusId,
        toBusInternalId: downstreamBusId,
        lengthM: m.cable.lengthM,
        rOhmPerKm: m.cable.rOhmPerKm ?? null,
        xOhmPerKm: m.cable.xOhmPerKm ?? null,
        branchChainOrderIndex: m.index,
        branchChainEdgeId: edge.id,
      });
    } else {
      const internalId = m.kind === "breaker" ? m.breaker.internalId : m.switchDevice.internalId;
      const tag = m.kind === "breaker" ? m.breaker.tag : m.switchDevice.tag;
      const fromBus = m.kind === "breaker" ? m.breaker.fromBus : m.switchDevice.fromBus;
      const toBus = m.kind === "breaker" ? m.breaker.toBus : m.switchDevice.toBus;
      const fromMismatch = fromBus !== null && fromBus !== upstreamBusId;
      const toMismatch = toBus !== null && toBus !== downstreamBusId;
      if (fromMismatch || toMismatch) {
        pushIssue(
          collector,
          makeIssue({
            code: "W-NET-001",
            equipmentInternalId: internalId,
            diagramEdgeId: edge.id,
            message: `${m.kind} '${tag}' endpoints (${fromBus ?? "null"} → ${toBus ?? "null"}) disagree with branch_chain '${edge.id}' (${upstreamBusId} → ${downstreamBusId})`,
          }),
        );
      }
      out.gates.push({
        internalId,
        tag,
        kind: m.kind,
        fromBusInternalId: upstreamBusId,
        toBusInternalId: downstreamBusId,
        state: "closed",
        branchChainOrderIndex: m.index,
        branchChainEdgeId: edge.id,
      });
    }
  }
  return out;
}

function convertBranchChains(
  project: PowerSystemProjectFile,
  busIds: Set<string>,
  collector: IssueCollector,
): { cables: NetworkCableBranch[]; gates: NetworkGate[] } {
  const ctx = buildBranchChainContext(project);
  const cables: NetworkCableBranch[] = [];
  const gates: NetworkGate[] = [];
  for (const edge of project.diagram.edges) {
    if (edge.kind !== "branch_chain") continue;
    const result = convertBranchChainEdge(edge, ctx, busIds, collector);
    cables.push(...result.cables);
    gates.push(...result.gates);
  }
  return { cables, gates };
}

function collectLoadsAndMotors(
  project: PowerSystemProjectFile,
  busIds: Set<string>,
  collector: IssueCollector,
): { loads: NetworkLoad[]; motors: NetworkMotor[]; loadEdges: NetworkTopologyEdge[] } {
  const loads: NetworkLoad[] = [];
  const motors: NetworkMotor[] = [];
  const loadEdges: NetworkTopologyEdge[] = [];

  for (const l of project.equipment.loads) {
    if (l.status === "out_of_service") continue;
    if (l.connectedBus === null) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-EQ-001",
          equipmentInternalId: l.internalId,
          field: "connectedBus",
          message: `Load '${l.tag}': connectedBus is required for AppNetwork construction`,
        }),
      );
      continue;
    }
    if (!busIds.has(l.connectedBus)) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-NET-003",
          equipmentInternalId: l.internalId,
          field: "connectedBus",
          message: `Load '${l.tag}': connectedBus '${l.connectedBus}' does not reference an active bus`,
        }),
      );
      continue;
    }
    const { pMw, qMvar } = deriveLoadPQ(l);
    loads.push({
      internalId: l.internalId,
      tag: l.tag,
      busInternalId: l.connectedBus,
      pMw,
      qMvar,
      demandFactor: l.demandFactor ?? null,
    });
    loadEdges.push({
      diagramEdgeId: null,
      kind: "load",
      busInternalId: l.connectedBus,
      equipmentInternalId: l.internalId,
    });
  }

  for (const m of project.equipment.motors) {
    if (m.status === "out_of_service") continue;
    if (m.connectedBus === null) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-EQ-001",
          equipmentInternalId: m.internalId,
          field: "connectedBus",
          message: `Motor '${m.tag}': connectedBus is required for AppNetwork construction`,
        }),
      );
      continue;
    }
    if (!busIds.has(m.connectedBus)) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-NET-003",
          equipmentInternalId: m.internalId,
          field: "connectedBus",
          message: `Motor '${m.tag}': connectedBus '${m.connectedBus}' does not reference an active bus`,
        }),
      );
      continue;
    }
    const { pMw, qMvar } = deriveMotorPQ(m);
    motors.push({
      internalId: m.internalId,
      tag: m.tag,
      busInternalId: m.connectedBus,
      pMw,
      qMvar,
    });
    loadEdges.push({
      diagramEdgeId: null,
      kind: "motor",
      busInternalId: m.connectedBus,
      equipmentInternalId: m.internalId,
    });
  }

  return { loads, motors, loadEdges };
}

function detectFloatingBuses(
  buses: NetworkBus[],
  sources: NetworkSource[],
  transformers: NetworkTransformerBranch[],
  cables: NetworkCableBranch[],
  collector: IssueCollector,
): void {
  if (buses.length === 0 || sources.length === 0) return;
  const adjacency = new Map<string, Set<string>>();
  for (const b of buses) adjacency.set(b.internalId, new Set());
  function link(a: string, b: string): void {
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  }
  for (const t of transformers) link(t.fromBusInternalId, t.toBusInternalId);
  for (const c of cables) link(c.fromBusInternalId, c.toBusInternalId);

  const seeds = new Set<string>();
  for (const s of sources) seeds.add(s.busInternalId);
  const reachable = new Set<string>();
  const queue: string[] = [];
  for (const seed of seeds) {
    if (!reachable.has(seed)) {
      reachable.add(seed);
      queue.push(seed);
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adjacency.get(cur) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  for (const b of buses) {
    if (!reachable.has(b.internalId)) {
      pushIssue(
        collector,
        makeIssue({
          code: "E-NET-002",
          equipmentInternalId: b.internalId,
          message: `Floating bus '${b.tag}': not reachable from any in-service source via the AppNetwork branches`,
        }),
      );
    }
  }
}

/**
 * Pure topology extraction: Stage 1 project file → Stage 2 AppNetwork.
 *
 * The input project is never mutated. When any blocking issue is raised, the
 * returned `network` is `null` and `status === "invalid"`.
 */
export function buildAppNetwork(project: PowerSystemProjectFile): NetworkBuildResult {
  const collector: IssueCollector = { errors: [], warnings: [] };

  const { buses, busIds } = collectBuses(project, collector);
  const { sources, generators, sourceEdges } = collectSources(project, busIds, collector);
  const { transformers, transformerEdges } = collectTransformers(project, busIds, collector);
  const { cables, gates } = convertBranchChains(project, busIds, collector);
  const { loads, motors, loadEdges } = collectLoadsAndMotors(project, busIds, collector);
  detectFloatingBuses(buses, sources, transformers, cables, collector);

  const topologyEdges: NetworkTopologyEdge[] = [
    ...sourceEdges,
    ...transformerEdges,
    ...loadEdges,
  ];

  const status: "valid" | "invalid" = collector.errors.length === 0 ? "valid" : "invalid";
  if (status === "invalid") {
    return {
      status: "invalid",
      network: null,
      issues: collector.errors,
      warnings: collector.warnings,
    };
  }

  const scenarioId = project.scenarios[0]?.scenarioId ?? null;
  const network: AppNetwork = {
    networkModelVersion: NETWORK_MODEL_VERSION,
    scenarioId,
    frequencyHz: project.project.frequencyHz,
    buses,
    sources,
    generators,
    transformers,
    cables,
    gates,
    loads,
    motors,
    topologyEdges,
  };

  return {
    status: "valid",
    network,
    issues: [],
    warnings: collector.warnings,
  };
}

// Helpers exported for unit tests (they exercise small, deterministic slices).
export const __internals = {
  isProjectEmpty,
  deriveLoadPQ,
  deriveMotorPQ,
};

// Re-export utility types referenced inside the public surface.
export type { NetworkIssueSeverity };
