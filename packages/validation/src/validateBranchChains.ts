import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// E-DIA-004 — branch_chain edge references a missing equipment internalId.
// E-DIA-005 — branch_chain edge references equipment whose kind is not breaker/cable/switch.
//
// Note: the canonical Zod schema already rejects:
//   - branch_chain edges with no/empty branchEquipmentInternalIds (superRefine)
//   - connection edges that include branchEquipmentInternalIds (superRefine)
// so this runtime check covers the remaining structural cases.
export function validateBranchChains(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];

  const equipmentByInternalId = new Map<string, string>();
  for (const breaker of project.equipment.breakers) equipmentByInternalId.set(breaker.internalId, "breaker");
  for (const cable of project.equipment.cables) equipmentByInternalId.set(cable.internalId, "cable");
  for (const swDevice of project.equipment.switches) equipmentByInternalId.set(swDevice.internalId, "switch");

  const allEquipmentKinds = new Map<string, string>();
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
    for (const item of list) allEquipmentKinds.set(item.internalId, item.kind);
  }

  for (const edge of project.diagram.edges) {
    if (edge.kind !== "branch_chain") continue;
    const ids = edge.branchEquipmentInternalIds ?? [];
    for (const refId of ids) {
      const refKind = allEquipmentKinds.get(refId);
      if (refKind === undefined) {
        issues.push(makeIssue({
          code: "E-DIA-004",
          path: `diagram.edges.${edge.id}.branchEquipmentInternalIds`,
          message: `branch_chain edge '${edge.id}' references missing equipment '${refId}'`,
        }));
        continue;
      }
      if (!equipmentByInternalId.has(refId)) {
        issues.push(makeIssue({
          code: "E-DIA-005",
          path: `diagram.edges.${edge.id}.branchEquipmentInternalIds`,
          message: `branch_chain edge '${edge.id}' references '${refId}' (kind=${refKind}); only breaker/cable/switch are valid branch chain entries`,
        }));
      }
    }
  }

  return issues;
}
