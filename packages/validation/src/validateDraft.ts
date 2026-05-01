import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// I-EQ-001 — draft equipment with required field still null/missing.
// Stage 1 emits this as INFO so newly created blank equipment doesn't immediately
// raise calculation-blocking errors. PR #2 introduces calculation-readiness validation
// that may escalate to E-EQ-001.
//
// Required-field policy (Stage 1, draft level):
//   utility:    vnKv
//   generator:  ratedMva, ratedVoltageKv
//   bus:        vnKv
//   transformer: snMva, vnHvKv, vnLvKv, vkPercent
//   cable:      voltageGradeKv, conductorSizeMm2, lengthM
//   breaker:    ratedVoltageKv, ratedCurrentA
//   switch:     (none required at draft level)
//   load:       kw
//   motor:      ratedKw, ratedVoltageV
function emitNullField(
  out: BuiltValidationIssue[],
  internalId: string,
  tag: string,
  field: string,
  value: unknown,
): void {
  if (value === null || value === undefined) {
    out.push(makeIssue({
      code: "I-EQ-001",
      equipmentInternalId: internalId,
      tag,
      field,
      message: `${tag}: required field '${field}' is missing (draft)`,
    }));
  }
}

export function validateDraft(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];

  for (const u of project.equipment.utilities) {
    emitNullField(issues, u.internalId, u.tag, "vnKv", u.vnKv);
  }
  for (const g of project.equipment.generators) {
    emitNullField(issues, g.internalId, g.tag, "ratedMva", g.ratedMva);
    emitNullField(issues, g.internalId, g.tag, "ratedVoltageKv", g.ratedVoltageKv);
  }
  for (const b of project.equipment.buses) {
    emitNullField(issues, b.internalId, b.tag, "vnKv", b.vnKv);
  }
  for (const t of project.equipment.transformers) {
    emitNullField(issues, t.internalId, t.tag, "snMva", t.snMva);
    emitNullField(issues, t.internalId, t.tag, "vnHvKv", t.vnHvKv);
    emitNullField(issues, t.internalId, t.tag, "vnLvKv", t.vnLvKv);
    emitNullField(issues, t.internalId, t.tag, "vkPercent", t.vkPercent);
  }
  for (const c of project.equipment.cables) {
    emitNullField(issues, c.internalId, c.tag, "voltageGradeKv", c.voltageGradeKv);
    emitNullField(issues, c.internalId, c.tag, "conductorSizeMm2", c.conductorSizeMm2);
    emitNullField(issues, c.internalId, c.tag, "lengthM", c.lengthM);
  }
  for (const br of project.equipment.breakers) {
    emitNullField(issues, br.internalId, br.tag, "ratedVoltageKv", br.ratedVoltageKv);
    emitNullField(issues, br.internalId, br.tag, "ratedCurrentA", br.ratedCurrentA);
  }
  for (const l of project.equipment.loads) {
    emitNullField(issues, l.internalId, l.tag, "kw", l.kw);
  }
  for (const m of project.equipment.motors) {
    emitNullField(issues, m.internalId, m.tag, "ratedKw", m.ratedKw);
    emitNullField(issues, m.internalId, m.tag, "ratedVoltageV", m.ratedVoltageV);
  }

  return issues;
}
