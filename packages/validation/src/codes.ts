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
// Codes deliberately deferred to PR #2 or later:
//   E-NET-002 floating bus (graph reachability)
//   E-EQ-001  required-field escalation for calculation-readiness/import
//   E-EQ-002  non-positive required numeric
//   E-EQ-003..005  branch equipment from/to bus errors
//   W-NET-001 branch chain endpoint vs equipment from/to mismatch
//   W-EQ-002  non-3P topology
//   W-EQ-003  transformer %R vs X/R inconsistency
//   W-EQ-004  motor kW vs HP inconsistency
//   W-CBL-001 cable manual R/X audit hint

export type ValidationSeverity = "error" | "warning" | "info";

export const STAGE1_VALIDATION_CODES = {
  "E-ID-001": { severity: "error" as ValidationSeverity, message: "Duplicate internalId" },
  "W-ID-001": { severity: "warning" as ValidationSeverity, message: "Duplicate tag" },
  "I-NET-001": { severity: "info" as ValidationSeverity, message: "Project is empty; add a source and a bus to begin." },
  "E-NET-001": { severity: "error" as ValidationSeverity, message: "Electrical model has no in-service utility or generator source." },
  "E-NET-003": { severity: "error" as ValidationSeverity, message: "Equipment references a non-existent bus internalId" },
  "E-NET-004": { severity: "error" as ValidationSeverity, message: "Diagram edge references a missing node id" },
  "E-NET-005": { severity: "error" as ValidationSeverity, message: "Diagram node references missing equipment internalId" },
  "I-EQ-001": { severity: "info" as ValidationSeverity, message: "Draft equipment has missing required fields" },
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
