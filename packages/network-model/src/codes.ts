// Stage 2 NetworkBuild issue codes used by `buildAppNetwork()`.
//
// PR #2 introduces only the minimum set required for AppNetwork construction:
//
//   E-LF-002  Unsupported topology in AppNetwork (e.g., 1P/DC bus, transformer
//             winding voltage mismatch, transformer node has wrong bus connections).
//   E-LF-003  Source / slack invalid: no in-service slack-eligible source, two
//             or more in-service utilities, or only generator is in an
//             unsupported mode (PV / island).
//
// Stage 1 codes (E-NET-*, E-EQ-*, W-NET-*, etc.) are surfaced through the
// existing validators; PR #2 does not duplicate that logic. When a Stage 1
// code is more specific than a Stage 2 code (e.g., E-NET-003 missing bus,
// E-EQ-003/004 identical from/to bus), buildAppNetwork emits a
// NetworkBuildIssue with the Stage 1 code and lets the existing validator
// retain authority over editor-time messages.
//
// PR #4 will introduce solver-related codes (E-LF-001 non-convergence,
// E-LF-004 adapter failure, E-LF-005 result unavailable). PR #5 will
// introduce result-bundle codes (E-VD-001/002, W-LF-001..003, W-VD-001/002).
// None of those are raised here.

import type { NetworkIssueSeverity } from "./types.js";

export type NetworkBuildCode =
  | "E-LF-002"
  | "E-LF-003"
  | "E-NET-001"
  | "E-NET-002"
  | "E-NET-003"
  | "E-EQ-001"
  | "E-EQ-003"
  | "E-EQ-004"
  | "E-EQ-005"
  | "E-DIA-005"
  | "W-NET-001"
  | "W-GEN-001"
  | "I-NET-001";

export const NETWORK_BUILD_CODES: Record<NetworkBuildCode, { severity: NetworkIssueSeverity; message: string }> = {
  "E-LF-002": { severity: "error", message: "Unsupported topology for Stage 2 Load Flow" },
  "E-LF-003": { severity: "error", message: "Source / slack invalid for Stage 2 Load Flow" },
  "E-NET-001": { severity: "error", message: "Electrical model has no in-service utility or generator source" },
  "E-NET-002": { severity: "error", message: "Floating bus: not reachable from any in-service source path" },
  "E-NET-003": { severity: "error", message: "Equipment references a non-existent bus internalId" },
  "E-EQ-001": { severity: "error", message: "Required field missing for AppNetwork construction" },
  "E-EQ-003": { severity: "error", message: "Transformer fromBus and toBus must be different existing buses" },
  "E-EQ-004": { severity: "error", message: "Cable fromBus and toBus must be different existing buses" },
  "E-EQ-005": { severity: "error", message: "Breaker/switch fromBus and toBus must be different existing buses" },
  "E-DIA-005": { severity: "error", message: "branch_chain equipment is not a breaker, cable, or switch" },
  "W-NET-001": { severity: "warning", message: "Branch chain endpoint nodes disagree with the contained equipment fromBus/toBus" },
  "W-GEN-001": { severity: "warning", message: "Generator operating mode is not supported by Stage 2 Load Flow" },
  "I-NET-001": { severity: "info", message: "Project is empty; add a source and a bus to begin." },
};

export function severityOf(code: NetworkBuildCode): NetworkIssueSeverity {
  return NETWORK_BUILD_CODES[code].severity;
}

export function defaultMessageFor(code: NetworkBuildCode): string {
  return NETWORK_BUILD_CODES[code].message;
}
