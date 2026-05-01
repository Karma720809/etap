import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";
import { iterateAllEquipment } from "./equipment-iter.js";

// E-ID-001 — duplicate internalId across the entire project.
// W-ID-001 — duplicate tag (Stage 1 default: warning).
export function validateIds(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];

  const all = iterateAllEquipment(project.equipment);

  const seenIds = new Map<string, number>();
  for (const eq of all) {
    seenIds.set(eq.internalId, (seenIds.get(eq.internalId) ?? 0) + 1);
  }
  for (const [internalId, count] of seenIds) {
    if (count > 1) {
      issues.push(makeIssue({
        code: "E-ID-001",
        equipmentInternalId: internalId,
        message: `Duplicate internalId '${internalId}' appears ${count} times`,
      }));
    }
  }

  const seenTags = new Map<string, string[]>();
  for (const eq of all) {
    const list = seenTags.get(eq.tag) ?? [];
    list.push(eq.internalId);
    seenTags.set(eq.tag, list);
  }
  for (const [tag, owners] of seenTags) {
    if (owners.length > 1) {
      for (const owner of owners) {
        issues.push(makeIssue({
          code: "W-ID-001",
          equipmentInternalId: owner,
          tag,
          message: `Duplicate tag '${tag}' appears on ${owners.length} equipment items`,
        }));
      }
    }
  }

  return issues;
}
