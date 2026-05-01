import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";
import { hasInServiceSource, isProjectEmpty } from "./equipment-iter.js";

// I-NET-001 — empty project info.
// E-NET-001 — non-empty model with no in-service utility/generator source.
// E-NET-003 — equipment references missing bus internalId.
// E-NET-004 — diagram edge references missing node id.
// E-NET-005 — diagram node references missing equipment internalId.
export function validateConnectivity(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];

  if (isProjectEmpty(project)) {
    issues.push(makeIssue({ code: "I-NET-001" }));
    return issues;
  }

  if (!hasInServiceSource(project)) {
    issues.push(makeIssue({ code: "E-NET-001" }));
  }

  const busIds = new Set(project.equipment.buses.map((b) => b.internalId));

  function checkBusRef(field: string, busRef: string | null | undefined, internalId: string, tag: string) {
    if (busRef && !busIds.has(busRef)) {
      issues.push(makeIssue({
        code: "E-NET-003",
        equipmentInternalId: internalId,
        tag,
        field,
        message: `${field} '${busRef}' on ${tag} does not reference an existing bus`,
      }));
    }
  }

  for (const u of project.equipment.utilities) checkBusRef("connectedBus", u.connectedBus, u.internalId, u.tag);
  for (const g of project.equipment.generators) checkBusRef("connectedBus", g.connectedBus, g.internalId, g.tag);
  for (const t of project.equipment.transformers) {
    checkBusRef("fromBus", t.fromBus, t.internalId, t.tag);
    checkBusRef("toBus", t.toBus, t.internalId, t.tag);
  }
  for (const c of project.equipment.cables) {
    checkBusRef("fromBus", c.fromBus, c.internalId, c.tag);
    checkBusRef("toBus", c.toBus, c.internalId, c.tag);
  }
  for (const br of project.equipment.breakers) {
    checkBusRef("fromBus", br.fromBus, br.internalId, br.tag);
    checkBusRef("toBus", br.toBus, br.internalId, br.tag);
  }
  for (const sw of project.equipment.switches) {
    checkBusRef("fromBus", sw.fromBus, sw.internalId, sw.tag);
    checkBusRef("toBus", sw.toBus, sw.internalId, sw.tag);
  }
  for (const l of project.equipment.loads) checkBusRef("connectedBus", l.connectedBus, l.internalId, l.tag);
  for (const m of project.equipment.motors) checkBusRef("connectedBus", m.connectedBus, m.internalId, m.tag);

  // Diagram refs
  const nodeIds = new Set(project.diagram.nodes.map((n) => n.id));
  for (const edge of project.diagram.edges) {
    if (!nodeIds.has(edge.fromNodeId)) {
      issues.push(makeIssue({
        code: "E-NET-004",
        path: `diagram.edges.${edge.id}.fromNodeId`,
        message: `Diagram edge '${edge.id}' fromNodeId '${edge.fromNodeId}' does not reference an existing node`,
      }));
    }
    if (!nodeIds.has(edge.toNodeId)) {
      issues.push(makeIssue({
        code: "E-NET-004",
        path: `diagram.edges.${edge.id}.toNodeId`,
        message: `Diagram edge '${edge.id}' toNodeId '${edge.toNodeId}' does not reference an existing node`,
      }));
    }
  }

  const equipmentIds = new Set<string>();
  for (const list of [
    project.equipment.utilities,
    project.equipment.generators,
    project.equipment.buses,
    project.equipment.transformers,
    project.equipment.cables,
    project.equipment.breakers,
    project.equipment.switches,
    project.equipment.loads,
    project.equipment.motors,
    project.equipment.placeholders ?? [],
  ]) {
    for (const item of list) equipmentIds.add(item.internalId);
  }
  for (const node of project.diagram.nodes) {
    if (!equipmentIds.has(node.equipmentInternalId)) {
      issues.push(makeIssue({
        code: "E-NET-005",
        path: `diagram.nodes.${node.id}.equipmentInternalId`,
        message: `Diagram node '${node.id}' references missing equipment '${node.equipmentInternalId}'`,
      }));
    }
  }

  return issues;
}
