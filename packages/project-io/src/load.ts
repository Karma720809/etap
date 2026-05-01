import {
  loadProjectFile as canonicalLoad,
  type LoadedProjectFile,
  type PowerSystemProjectFile,
  type ValidationSummary,
} from "@power-system-study/schemas";
import { validateProject } from "@power-system-study/validation";

// Stage 1 loader wraps the canonical loader and adds an authoritative runtime validation pass.
// Saved validation (audit-only) and runtime validation (authoritative) are both surfaced
// so the caller can show the truth and avoid trusting stale saved state.
export interface StageOneLoadResult extends LoadedProjectFile {
  /** Authoritative validation computed fresh after a successful schema parse. */
  runtimeValidation?: ValidationSummary;
}

export function loadProjectFile(jsonText: string): StageOneLoadResult {
  const result = canonicalLoad(jsonText);

  if (!result.project) {
    return result;
  }

  const runtimeValidation = validateProject(result.project);
  return { ...result, runtimeValidation };
}

// Convenience helper exposed for callers that already have a parsed object.
export function validateLoadedProject(project: PowerSystemProjectFile): ValidationSummary {
  return validateProject(project);
}
