import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// E-EQ-003 / E-EQ-004 / E-EQ-005 — branch equipment (transformer / cable / breaker / switch)
// must reference two *different* buses. Stage 1 fires only when both endpoints are
// non-null and equal. Stage 1 keeps "missing endpoint" in I-EQ-001 (draft) so a
// freshly created branch does not immediately flash an error.
//
// Calculation-readiness escalation (E-EQ-001 + missing endpoints) lives in
// validateForCalculation.ts and is not run by runtime validateProject().
function emitIfIdentical(
  out: BuiltValidationIssue[],
  code: "E-EQ-003" | "E-EQ-004" | "E-EQ-005",
  internalId: string,
  tag: string,
  fromBus: string | null,
  toBus: string | null,
  kindLabel: string,
): void {
  if (fromBus !== null && toBus !== null && fromBus === toBus) {
    out.push(makeIssue({
      code,
      equipmentInternalId: internalId,
      tag,
      field: "fromBus",
      message: `${kindLabel} '${tag}': fromBus and toBus reference the same bus '${fromBus}'`,
    }));
  }
}

export function validateBranchEndpoints(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];

  for (const t of project.equipment.transformers) {
    emitIfIdentical(issues, "E-EQ-003", t.internalId, t.tag, t.fromBus, t.toBus, "Transformer");
  }
  for (const c of project.equipment.cables) {
    emitIfIdentical(issues, "E-EQ-004", c.internalId, c.tag, c.fromBus, c.toBus, "Cable");
  }
  for (const br of project.equipment.breakers) {
    emitIfIdentical(issues, "E-EQ-005", br.internalId, br.tag, br.fromBus, br.toBus, "Breaker");
  }
  for (const sw of project.equipment.switches) {
    emitIfIdentical(issues, "E-EQ-005", sw.internalId, sw.tag, sw.fromBus, sw.toBus, "Switch");
  }

  return issues;
}
