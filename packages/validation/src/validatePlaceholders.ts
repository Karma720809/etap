import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// E-DIA-003 — placeholder.containedBusIds references a non-existent bus.
export function validatePlaceholders(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];
  const placeholders = project.equipment.placeholders ?? [];
  if (placeholders.length === 0) return issues;

  const busIds = new Set(project.equipment.buses.map((b) => b.internalId));
  for (const placeholder of placeholders) {
    for (const containedBusId of placeholder.containedBusIds) {
      if (!busIds.has(containedBusId)) {
        issues.push(makeIssue({
          code: "E-DIA-003",
          equipmentInternalId: placeholder.internalId,
          tag: placeholder.tag,
          field: "containedBusIds",
          message: `Placeholder '${placeholder.tag}' containedBusIds entry '${containedBusId}' does not reference an existing bus`,
        }));
      }
    }
  }
  return issues;
}
