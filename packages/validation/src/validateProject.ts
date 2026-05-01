import type { PowerSystemProjectFile, ValidationSummary } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { summaryStatus } from "./issue.js";
import { validateIds } from "./validateIds.js";
import { validateConnectivity } from "./validateConnectivity.js";
import { validatePlaceholders } from "./validatePlaceholders.js";
import { validateBranchChains } from "./validateBranchChains.js";
import { validateTransformerAsNode } from "./validateTransformerAsNode.js";
import { validateDraft } from "./validateDraft.js";
import { validateFloatingBus } from "./validateFloatingBus.js";
import { validateNumericPositive } from "./validateNumericPositive.js";
import { validateBranchEndpoints } from "./validateBranchEndpoints.js";
import { validateBranchChainEndpoints } from "./validateBranchChainEndpoints.js";
import { validateNon3PTopology } from "./validateNon3PTopology.js";
import { validateTransformerImpedance } from "./validateTransformerImpedance.js";
import { validateMotorKwHp } from "./validateMotorKwHp.js";
import { validateCableManualRX } from "./validateCableManualRX.js";

// Stage 1 runtime validation entry point. Returns a ValidationSummary that the
// UI may treat as the authoritative state. The saved validation in the project
// file is audit reference only and is not consulted here.
//
// Editor-friendly policy: missing required fields stay at info (I-EQ-001).
// Calculation-readiness escalation is provided separately via
// validateForCalculation() so a freshly created blank record does not flash an
// error before the user has filled it in.
export function validateProject(project: PowerSystemProjectFile): ValidationSummary {
  const issues: BuiltValidationIssue[] = [
    ...validateIds(project),
    ...validateConnectivity(project),
    ...validateFloatingBus(project),
    ...validatePlaceholders(project),
    ...validateBranchChains(project),
    ...validateBranchChainEndpoints(project),
    ...validateBranchEndpoints(project),
    ...validateTransformerAsNode(project),
    ...validateDraft(project),
    ...validateNumericPositive(project),
    ...validateNon3PTopology(project),
    ...validateTransformerImpedance(project),
    ...validateMotorKwHp(project),
    ...validateCableManualRX(project),
  ];
  return {
    status: summaryStatus(issues),
    issues,
  };
}
