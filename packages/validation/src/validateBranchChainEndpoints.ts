import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// W-NET-001 — a branch_chain edge connects two diagram bus-nodes from upstream
// (fromNodeId) to downstream (toNodeId), and every piece of contained branch
// equipment must declare the same direction. Spec §4.8 makes branch_chain
// ordering load-bearing for Stage 2+ network conversion, so this check is
// directional: equipment.fromBus must match the chain's upstream bus and
// equipment.toBus must match the chain's downstream bus. Reversed orientation
// is itself a W-NET-001 finding even when the equipment touches the right two
// buses.
//
// Null endpoints stay in I-EQ-001 (draft) territory and are not reported here.
// branchEquipmentInternalIds is never reordered.
export function validateBranchChainEndpoints(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];

  const nodeBusInternalId = new Map<string, string>();
  for (const node of project.diagram.nodes) {
    if (node.kind === "bus") {
      nodeBusInternalId.set(node.id, node.equipmentInternalId);
    }
  }

  type BranchEndpointHolder = { internalId: string; tag: string; kind: string; fromBus: string | null; toBus: string | null };
  const branchById = new Map<string, BranchEndpointHolder>();
  for (const c of project.equipment.cables) branchById.set(c.internalId, { internalId: c.internalId, tag: c.tag, kind: c.kind, fromBus: c.fromBus, toBus: c.toBus });
  for (const br of project.equipment.breakers) branchById.set(br.internalId, { internalId: br.internalId, tag: br.tag, kind: br.kind, fromBus: br.fromBus, toBus: br.toBus });
  for (const sw of project.equipment.switches) branchById.set(sw.internalId, { internalId: sw.internalId, tag: sw.tag, kind: sw.kind, fromBus: sw.fromBus, toBus: sw.toBus });

  for (const edge of project.diagram.edges) {
    if (edge.kind !== "branch_chain") continue;
    const upstreamBusId = nodeBusInternalId.get(edge.fromNodeId);
    const downstreamBusId = nodeBusInternalId.get(edge.toNodeId);
    if (upstreamBusId === undefined || downstreamBusId === undefined) continue;

    for (const branchId of edge.branchEquipmentInternalIds ?? []) {
      const branch = branchById.get(branchId);
      if (!branch) continue;
      const fromMismatch = branch.fromBus !== null && branch.fromBus !== "" && branch.fromBus !== upstreamBusId;
      const toMismatch = branch.toBus !== null && branch.toBus !== "" && branch.toBus !== downstreamBusId;
      if (!fromMismatch && !toMismatch) continue;
      issues.push(makeIssue({
        code: "W-NET-001",
        equipmentInternalId: branch.internalId,
        tag: branch.tag,
        path: `diagram.edges.${edge.id}.branchEquipmentInternalIds`,
        message: `Branch chain '${edge.id}' runs ${upstreamBusId} → ${downstreamBusId} but ${branch.kind} '${branch.tag}' declares fromBus='${branch.fromBus ?? "null"}', toBus='${branch.toBus ?? "null"}'`,
      }));
    }
  }

  return issues;
}
