import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// 1 mechanical horsepower = 0.7457 kW (NEMA / IEEE convention).
// IEC 60034 uses 0.7355 kW/HP for metric horsepower; both conventions sit within
// a 3% spread, so we treat anything beyond 5% as an inconsistency rather than a
// nameplate convention difference.
const KW_PER_HP = 0.7457;
const REL_TOLERANCE = 0.05;

// W-EQ-004 — when both ratedKw and ratedHp are entered, the implied conversion
// (1 hp = 0.7457 kW) should hold to within REL_TOLERANCE. If not, warn so the
// user reconciles the nameplate before later calculation stages run on it.
export function validateMotorKwHp(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];
  for (const m of project.equipment.motors) {
    const kw = m.ratedKw;
    const hp = m.ratedHp ?? null;
    if (kw === null || hp === null) continue;
    if (!Number.isFinite(kw) || !Number.isFinite(hp)) continue;
    if (kw <= 0 || hp <= 0) continue;
    const expectedKw = hp * KW_PER_HP;
    const denominator = Math.max(kw, expectedKw, 1e-9);
    const relErr = Math.abs(kw - expectedKw) / denominator;
    if (relErr > REL_TOLERANCE) {
      issues.push(makeIssue({
        code: "W-EQ-004",
        equipmentInternalId: m.internalId,
        tag: m.tag,
        field: "ratedKw",
        message: `Motor '${m.tag}': ratedKw=${kw} disagrees with ratedHp=${hp} (≈${expectedKw.toFixed(2)} kW) by ${(relErr * 100).toFixed(1)}%.`,
      }));
    }
  }
  return issues;
}
