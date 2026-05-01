import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

const STAGE2_INTEGRATED_TOPOLOGIES = new Set(["3P3W", "3P4W"]);

// W-EQ-002 — only 3P3W and 3P4W are within the integrated Stage 2+ calculation MVP.
// Stage 1 raises a warning so users see the limitation early, without blocking edits.
export function validateNon3PTopology(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];
  for (const bus of project.equipment.buses) {
    if (!STAGE2_INTEGRATED_TOPOLOGIES.has(bus.topology)) {
      issues.push(makeIssue({
        code: "W-EQ-002",
        equipmentInternalId: bus.internalId,
        tag: bus.tag,
        field: "topology",
        message: `Bus '${bus.tag}': topology '${bus.topology}' is outside the Stage 2+ integrated calculation scope (3P3W / 3P4W).`,
      }));
    }
  }
  return issues;
}
