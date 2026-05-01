import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// E-DIA-001 — every transformer in equipment.transformers must have a matching diagram node
//             of kind "transformer" with equipmentInternalId == transformer.internalId.
// E-DIA-002 — no diagram edge may carry a transformer via equipmentInternalId; transformers
//             are diagram nodes, never edges.
export function validateTransformerAsNode(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const issues: BuiltValidationIssue[] = [];

  const transformerIds = new Set(project.equipment.transformers.map((t) => t.internalId));
  if (transformerIds.size === 0) return issues;

  const transformerNodeIds = new Set<string>();
  for (const node of project.diagram.nodes) {
    if (node.kind === "transformer" && transformerIds.has(node.equipmentInternalId)) {
      transformerNodeIds.add(node.equipmentInternalId);
    }
  }

  for (const transformer of project.equipment.transformers) {
    if (!transformerNodeIds.has(transformer.internalId)) {
      issues.push(makeIssue({
        code: "E-DIA-001",
        equipmentInternalId: transformer.internalId,
        tag: transformer.tag,
        message: `Transformer '${transformer.tag}' must be represented as a diagram node, but no transformer node references it`,
      }));
    }
  }

  for (const edge of project.diagram.edges) {
    if (edge.equipmentInternalId && transformerIds.has(edge.equipmentInternalId)) {
      issues.push(makeIssue({
        code: "E-DIA-002",
        path: `diagram.edges.${edge.id}.equipmentInternalId`,
        message: `Diagram edge '${edge.id}' equipmentInternalId points at a transformer; transformers must be diagram nodes`,
      }));
    }
  }

  return issues;
}
