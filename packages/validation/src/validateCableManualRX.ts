import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// W-CBL-001 — Stage 1 audit hint: when a cable carries a manually entered
// rOhmPerKm or xOhmPerKm value, surface a warning so the EPC reviewer is reminded
// that Stage 4 cable-library values must not silently override these inputs.
//
// This is informational guidance, not an error. Stage 4 will introduce a richer
// "source" metadata field; for Stage 1 we just flag the presence of explicit R/X.
export function validateCableManualRX(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];
  for (const c of project.equipment.cables) {
    const hasR = c.rOhmPerKm !== null && c.rOhmPerKm !== undefined;
    const hasX = c.xOhmPerKm !== null && c.xOhmPerKm !== undefined;
    if (!hasR && !hasX) continue;
    issues.push(makeIssue({
      code: "W-CBL-001",
      equipmentInternalId: c.internalId,
      tag: c.tag,
      field: hasR && hasX ? "rOhmPerKm,xOhmPerKm" : hasR ? "rOhmPerKm" : "xOhmPerKm",
      message: `Cable '${c.tag}': manual R/X impedance entered — verify against vendor cable data when Stage 4 sizing arrives.`,
    }));
  }
  return issues;
}
