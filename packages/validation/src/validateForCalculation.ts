import type { PowerSystemProjectFile, ValidationSummary } from "@power-system-study/schemas";
import type { ValidationCode, ValidationSeverity } from "./codes.js";
import { defaultMessageFor, severityOf } from "./codes.js";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue, summaryStatus } from "./issue.js";
import { validateProject } from "./validateProject.js";

// Calculation-readiness / import validation pass.
//
// Stage 1 keeps `validateProject()` editor-friendly: missing required fields are
// reported as I-EQ-001 (info) so a freshly created blank piece of equipment does
// not flash an error. When a project is about to feed a calculation engine, or
// when an external file is imported, callers should use this stricter pass — it
// runs the same rules and additionally:
//
//   - Escalates I-EQ-001 → E-EQ-001 (required field missing).
//   - Escalates "branch equipment with at least one missing endpoint" to E-EQ-003,
//     E-EQ-004, or E-EQ-005, since calculation needs both endpoints resolved.
//
// Runtime UI continues to call validateProject(); validateForCalculation() is
// intentionally a separate function so we never accidentally fail-closed on draft
// edits.
type SchemaValidationIssue = ValidationSummary["issues"][number];

function escalateDraftToReadiness(issue: SchemaValidationIssue): BuiltValidationIssue {
  if (issue.code !== "I-EQ-001") {
    // The runtime validator only emits known ValidationCode values; the schema-level
    // union widens to `string`. This narrow cast keeps the rest of the type chain honest.
    return { ...issue, code: issue.code as ValidationCode };
  }
  const code: ValidationCode = "E-EQ-001";
  const severity: ValidationSeverity = severityOf(code);
  const message = issue.message
    ? issue.message.replace("(draft)", "(calculation-readiness)")
    : defaultMessageFor(code);
  const next: BuiltValidationIssue = { code, severity, message };
  if (issue.equipmentInternalId !== undefined) next.equipmentInternalId = issue.equipmentInternalId;
  if (issue.tag !== undefined) next.tag = issue.tag;
  if (issue.field !== undefined) next.field = issue.field;
  if (issue.path !== undefined) next.path = issue.path;
  return next;
}

function missingEndpointIssues(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const out: BuiltValidationIssue[] = [];
  function emit(code: "E-EQ-003" | "E-EQ-004" | "E-EQ-005", internalId: string, tag: string, fromBus: string | null, toBus: string | null, kindLabel: string) {
    if (fromBus === null || toBus === null) {
      out.push(makeIssue({
        code,
        equipmentInternalId: internalId,
        tag,
        field: fromBus === null ? "fromBus" : "toBus",
        message: `${kindLabel} '${tag}': both fromBus and toBus must be set for calculation-readiness`,
      }));
    }
  }
  for (const t of project.equipment.transformers) emit("E-EQ-003", t.internalId, t.tag, t.fromBus, t.toBus, "Transformer");
  for (const c of project.equipment.cables) emit("E-EQ-004", c.internalId, c.tag, c.fromBus, c.toBus, "Cable");
  for (const br of project.equipment.breakers) emit("E-EQ-005", br.internalId, br.tag, br.fromBus, br.toBus, "Breaker");
  for (const sw of project.equipment.switches) emit("E-EQ-005", sw.internalId, sw.tag, sw.fromBus, sw.toBus, "Switch");
  return out;
}

export function validateForCalculation(project: PowerSystemProjectFile): ValidationSummary {
  const draft = validateProject(project);
  const escalated = draft.issues.map(escalateDraftToReadiness);
  const additional = missingEndpointIssues(project);
  const issues = [...escalated, ...additional];
  return {
    status: summaryStatus(issues),
    issues,
  };
}
