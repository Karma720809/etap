import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// W-NET-001 — a branch_chain edge connects two diagram bus-nodes, and every
// piece of equipment in the chain should declare the same upstream/downstream
// bus pair. If a referenced cable/breaker/switch carries a non-null fromBus or
// toBus that disagrees with the chain endpoints, raise a Stage 1 warning.
// Stage 2+ may escalate this to an error.
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
    const fromBusId = nodeBusInternalId.get(edge.fromNodeId);
    const toBusId = nodeBusInternalId.get(edge.toNodeId);
    if (fromBusId === undefined || toBusId === undefined) continue;
    const expectedPair = new Set([fromBusId, toBusId]);

    for (const branchId of edge.branchEquipmentInternalIds ?? []) {
      const branch = branchById.get(branchId);
      if (!branch) continue;
      const declared = [branch.fromBus, branch.toBus].filter((b): b is string => b !== null);
      if (declared.length === 0) continue;
      const matches = declared.every((b) => expectedPair.has(b));
      if (!matches) {
        issues.push(makeIssue({
          code: "W-NET-001",
          equipmentInternalId: branch.internalId,
          tag: branch.tag,
          path: `diagram.edges.${edge.id}.branchEquipmentInternalIds`,
          message: `Branch chain '${edge.id}' connects [${fromBusId}, ${toBusId}] but ${branch.kind} '${branch.tag}' declares fromBus='${branch.fromBus ?? "null"}', toBus='${branch.toBus ?? "null"}'`,
        }));
      }
    }
  }

  return issues;
}
