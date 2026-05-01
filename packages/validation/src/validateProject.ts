import type { PowerSystemProjectFile, ValidationSummary } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { summaryStatus } from "./issue.js";
import { validateIds } from "./validateIds.js";
import { validateConnectivity } from "./validateConnectivity.js";
import { validatePlaceholders } from "./validatePlaceholders.js";
import { validateBranchChains } from "./validateBranchChains.js";
import { validateTransformerAsNode } from "./validateTransformerAsNode.js";
import { validateDraft } from "./validateDraft.js";

// Stage 1 PR #1 runtime validation entry point. Returns a ValidationSummary
// that callers may treat as the authoritative state. The saved validation
// in the project file is audit reference only and is not consulted here.
export function validateProject(project: PowerSystemProjectFile): ValidationSummary {
  const issues: BuiltValidationIssue[] = [
    ...validateIds(project),
    ...validateConnectivity(project),
    ...validatePlaceholders(project),
    ...validateBranchChains(project),
    ...validateTransformerAsNode(project),
    ...validateDraft(project),
  ];
  return {
    status: summaryStatus(issues),
    issues,
  };
}
