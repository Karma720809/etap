import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// E-EQ-002 — numeric value must be positive when entered.
//
// Stage 1 policy:
// - A null value is "not entered" and falls under I-EQ-001 (draft).
// - A non-null value <= 0 fires E-EQ-002.
// - We only check fields where the spec §11.5 says "must be > 0 if entered".
//   Range-bounded fields (efficiency, powerFactor, demandFactor, motor service factor)
//   follow distinct upper/lower-bound rules and are NOT handled here in PR #2.
//
// TODO (PR #3): add range validation for efficiency / powerFactor / starting PF
// (must be > 0 AND ≤ 1) and demandFactor (≥ 0, ≤ 1) — distinct codes are not yet
// allocated in the Rev D code table; needs a spec decision before implementation.
function emitIfNonPositive(
  out: BuiltValidationIssue[],
  internalId: string,
  tag: string,
  field: string,
  value: number | null | undefined,
): void {
  if (value === null || value === undefined) return;
  if (Number.isFinite(value) && value > 0) return;
  out.push(makeIssue({
    code: "E-EQ-002",
    equipmentInternalId: internalId,
    tag,
    field,
    message: `${tag}: '${field}' must be greater than 0 (got ${value})`,
  }));
}

export function validateNumericPositive(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];

  for (const b of project.equipment.buses) {
    emitIfNonPositive(issues, b.internalId, b.tag, "vnKv", b.vnKv);
  }
  for (const u of project.equipment.utilities) {
    emitIfNonPositive(issues, u.internalId, u.tag, "vnKv", u.vnKv);
    emitIfNonPositive(issues, u.internalId, u.tag, "scLevelMva", u.scLevelMva);
    emitIfNonPositive(issues, u.internalId, u.tag, "faultCurrentKa", u.faultCurrentKa);
    emitIfNonPositive(issues, u.internalId, u.tag, "xrRatio", u.xrRatio);
    emitIfNonPositive(issues, u.internalId, u.tag, "voltageFactor", u.voltageFactor);
  }
  for (const g of project.equipment.generators) {
    emitIfNonPositive(issues, g.internalId, g.tag, "ratedMva", g.ratedMva);
    emitIfNonPositive(issues, g.internalId, g.tag, "ratedVoltageKv", g.ratedVoltageKv);
  }
  for (const t of project.equipment.transformers) {
    emitIfNonPositive(issues, t.internalId, t.tag, "snMva", t.snMva);
    emitIfNonPositive(issues, t.internalId, t.tag, "vnHvKv", t.vnHvKv);
    emitIfNonPositive(issues, t.internalId, t.tag, "vnLvKv", t.vnLvKv);
    emitIfNonPositive(issues, t.internalId, t.tag, "vkPercent", t.vkPercent);
    emitIfNonPositive(issues, t.internalId, t.tag, "vkrPercent", t.vkrPercent);
    emitIfNonPositive(issues, t.internalId, t.tag, "xrRatio", t.xrRatio);
  }
  for (const c of project.equipment.cables) {
    emitIfNonPositive(issues, c.internalId, c.tag, "voltageGradeKv", c.voltageGradeKv);
    emitIfNonPositive(issues, c.internalId, c.tag, "conductorSizeMm2", c.conductorSizeMm2);
    emitIfNonPositive(issues, c.internalId, c.tag, "lengthM", c.lengthM);
    emitIfNonPositive(issues, c.internalId, c.tag, "ampacityA", c.ampacityA);
  }
  for (const br of project.equipment.breakers) {
    emitIfNonPositive(issues, br.internalId, br.tag, "ratedVoltageKv", br.ratedVoltageKv);
    emitIfNonPositive(issues, br.internalId, br.tag, "ratedCurrentA", br.ratedCurrentA);
    emitIfNonPositive(issues, br.internalId, br.tag, "breakingCapacityKa", br.breakingCapacityKa);
    emitIfNonPositive(issues, br.internalId, br.tag, "makingCapacityKa", br.makingCapacityKa);
    emitIfNonPositive(issues, br.internalId, br.tag, "clearingTimeS", br.clearingTimeS);
  }
  for (const sw of project.equipment.switches) {
    emitIfNonPositive(issues, sw.internalId, sw.tag, "ratedVoltageKv", sw.ratedVoltageKv);
    emitIfNonPositive(issues, sw.internalId, sw.tag, "ratedCurrentA", sw.ratedCurrentA);
  }
  for (const l of project.equipment.loads) {
    emitIfNonPositive(issues, l.internalId, l.tag, "kw", l.kw);
  }
  for (const m of project.equipment.motors) {
    emitIfNonPositive(issues, m.internalId, m.tag, "ratedKw", m.ratedKw);
    emitIfNonPositive(issues, m.internalId, m.tag, "ratedHp", m.ratedHp);
    emitIfNonPositive(issues, m.internalId, m.tag, "ratedVoltageV", m.ratedVoltageV);
    emitIfNonPositive(issues, m.internalId, m.tag, "flaA", m.flaA);
  }

  return issues;
}
