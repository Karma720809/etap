// Stage 1 PR #1 validation codes.
//
// Codes from Rev D MVP spec table (lines 1110+):
//   E-ID-001  duplicate internalId (error)
//   W-ID-001  duplicate tag (warning, default)
//   I-NET-001 empty project (info)
//   E-NET-001 non-empty model has no in-service source (error)
//   E-NET-003 equipment references missing bus (error)
//   E-NET-004 diagram edge references missing node (error)
//   E-NET-005 diagram node references missing equipment (error)
//   I-EQ-001  draft equipment has missing required field (info)
//
// Stage-1 implementation-specific codes (not in Rev D code table; documented in
// docs/stage-1-implementation-notes.md as transformer-as-node enforcement):
//   E-DIA-001 transformer in equipment.transformers has no matching diagram node
//   E-DIA-002 a diagram edge's equipmentInternalId points at a transformer
//             (transformers must be diagram nodes, not edges)
//   E-DIA-003 placeholder.containedBusIds references a non-existent bus
//   E-DIA-004 branch_chain edge references missing equipment internalId
//   E-DIA-005 branch_chain edge references equipment whose kind is not breaker/cable/switch
//
// Codes added in PR #2:
//   E-NET-002 floating bus (graph reachability)
//   E-EQ-002  non-positive numeric value (entered but ≤ 0)
//
// Codes added in PR #3:
//   E-EQ-001  required-field escalation for calculation-readiness/import
//             (NOT raised by runtime validateProject(); use validateForCalculation())
//   E-EQ-003  transformer fromBus/toBus identical (or both missing in calc-readiness)
//   E-EQ-004  cable fromBus/toBus identical (or both missing in calc-readiness)
//   E-EQ-005  switch/breaker fromBus/toBus identical (or both missing in calc-readiness)
//   W-NET-001 branch_chain endpoint nodes disagree with equipment from/to bus
//   W-EQ-002  non-3P topology — outside Stage 2+ integrated calculation MVP
//   W-EQ-003  transformer %R and X/R appear inconsistent with %Z
//   W-EQ-004  motor kW vs HP appear inconsistent (kW = HP × 0.7457)
//   W-CBL-001 cable manual R/X entered — Stage 4 audit hint

export type ValidationSeverity = "error" | "warning" | "info";

export const STAGE1_VALIDATION_CODES = {
  "E-ID-001": { severity: "error" as ValidationSeverity, message: "Duplicate internalId" },
  "W-ID-001": { severity: "warning" as ValidationSeverity, message: "Duplicate tag" },
  "I-NET-001": { severity: "info" as ValidationSeverity, message: "Project is empty; add a source and a bus to begin." },
  "E-NET-001": { severity: "error" as ValidationSeverity, message: "Electrical model has no in-service utility or generator source." },
  "E-NET-002": { severity: "error" as ValidationSeverity, message: "Floating bus: not reachable from any in-service source path" },
  "E-NET-003": { severity: "error" as ValidationSeverity, message: "Equipment references a non-existent bus internalId" },
  "E-NET-004": { severity: "error" as ValidationSeverity, message: "Diagram edge references a missing node id" },
  "E-NET-005": { severity: "error" as ValidationSeverity, message: "Diagram node references missing equipment internalId" },
  "W-NET-001": { severity: "warning" as ValidationSeverity, message: "Branch chain endpoint nodes disagree with the contained equipment fromBus/toBus" },
  "I-EQ-001": { severity: "info" as ValidationSeverity, message: "Draft equipment has missing required fields" },
  "E-EQ-001": { severity: "error" as ValidationSeverity, message: "Required field missing for calculation-readiness or import" },
  "E-EQ-002": { severity: "error" as ValidationSeverity, message: "Numeric field must be positive" },
  "E-EQ-003": { severity: "error" as ValidationSeverity, message: "Transformer fromBus and toBus must be different existing buses" },
  "E-EQ-004": { severity: "error" as ValidationSeverity, message: "Cable fromBus and toBus must be different existing buses" },
  "E-EQ-005": { severity: "error" as ValidationSeverity, message: "Breaker/switch fromBus and toBus must be different existing buses" },
  "W-EQ-002": { severity: "warning" as ValidationSeverity, message: "Non-3P topology is outside the integrated Stage 2+ calculation MVP" },
  "W-EQ-003": { severity: "warning" as ValidationSeverity, message: "Transformer %R and X/R are inconsistent with %Z" },
  "W-EQ-004": { severity: "warning" as ValidationSeverity, message: "Motor kW and HP appear inconsistent" },
  "W-CBL-001": { severity: "warning" as ValidationSeverity, message: "Cable R/X manually entered — verify against vendor data in later stages" },
  "E-DIA-001": { severity: "error" as ValidationSeverity, message: "Transformer is missing its diagram node (must be represented as a node, not an edge)" },
  "E-DIA-002": { severity: "error" as ValidationSeverity, message: "Diagram edge points at a transformer; transformers must be diagram nodes" },
  "E-DIA-003": { severity: "error" as ValidationSeverity, message: "Placeholder containedBusIds references a non-existent bus" },
  "E-DIA-004": { severity: "error" as ValidationSeverity, message: "branch_chain edge references missing equipment internalId" },
  "E-DIA-005": { severity: "error" as ValidationSeverity, message: "branch_chain equipment is not a breaker, cable, or switch" },
} as const;

export type ValidationCode = keyof typeof STAGE1_VALIDATION_CODES;

export function severityOf(code: ValidationCode): ValidationSeverity {
  return STAGE1_VALIDATION_CODES[code].severity;
}

export function defaultMessageFor(code: ValidationCode): string {
  return STAGE1_VALIDATION_CODES[code].message;
}
