import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// Tolerance for cross-checking declared %X derived two different ways.
// IEC 60076 typical %R values are well below 1% on ≥1 MVA units; a 5% relative
// tolerance leaves room for rounding and per-unit conversions while still
// catching transposed entries (e.g. user typed %R into the X/R slot).
const REL_TOLERANCE = 0.05;

// W-EQ-003 — when a transformer declares both %R (vkrPercent) and X/R, the
// implied %X computed from R*X/R should match the %X derived from sqrt(Z² - R²).
// If they disagree beyond REL_TOLERANCE, warn so the user reviews their inputs.
export function validateTransformerImpedance(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];
  for (const t of project.equipment.transformers) {
    const z = t.vkPercent;
    const r = t.vkrPercent ?? null;
    const xr = t.xrRatio ?? null;
    if (z === null || r === null || xr === null) continue;
    if (!Number.isFinite(z) || !Number.isFinite(r) || !Number.isFinite(xr)) continue;
    if (z <= 0 || r <= 0 || xr <= 0) continue;
    if (r > z) {
      issues.push(makeIssue({
        code: "W-EQ-003",
        equipmentInternalId: t.internalId,
        tag: t.tag,
        field: "vkrPercent",
        message: `Transformer '${t.tag}': %R (${r}) exceeds %Z (${z}); inputs are physically inconsistent.`,
      }));
      continue;
    }
    const xFromZR = Math.sqrt(z * z - r * r);
    const xFromXR = r * xr;
    const denominator = Math.max(Math.abs(xFromZR), Math.abs(xFromXR), 1e-9);
    const relErr = Math.abs(xFromZR - xFromXR) / denominator;
    if (relErr > REL_TOLERANCE) {
      issues.push(makeIssue({
        code: "W-EQ-003",
        equipmentInternalId: t.internalId,
        tag: t.tag,
        field: "xrRatio",
        message: `Transformer '${t.tag}': %X from sqrt(Z²-R²) = ${xFromZR.toFixed(3)} disagrees with R·(X/R) = ${xFromXR.toFixed(3)} by ${(relErr * 100).toFixed(1)}%.`,
      }));
    }
  }
  return issues;
}
