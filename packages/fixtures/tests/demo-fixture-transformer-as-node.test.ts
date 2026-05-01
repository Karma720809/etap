import { describe, expect, it } from "vitest";
import { getDemoFixture } from "../src/index.js";

describe("demo fixture — transformer-as-node policy (AC21)", () => {
  it("the transformer in equipment.transformers has a matching diagram node with kind='transformer'", () => {
    const fixture = getDemoFixture();
    const transformers = fixture.equipment.transformers;
    expect(transformers.length).toBeGreaterThan(0);

    for (const t of transformers) {
      const node = fixture.diagram.nodes.find(
        (n) => n.kind === "transformer" && n.equipmentInternalId === t.internalId,
      );
      expect(node, `transformer ${t.tag} (${t.internalId}) must have a diagram node`).toBeDefined();
    }
  });

  it("no diagram edge carries a transformer via equipmentInternalId", () => {
    const fixture = getDemoFixture();
    const transformerIds = new Set(fixture.equipment.transformers.map((t) => t.internalId));

    for (const edge of fixture.diagram.edges) {
      if (edge.equipmentInternalId) {
        expect(
          transformerIds.has(edge.equipmentInternalId),
          `edge ${edge.id} must not carry a transformer via equipmentInternalId`,
        ).toBe(false);
      }
    }
  });

  it("transformer connects to MV and LV buses through connection edges (not branch_chain)", () => {
    const fixture = getDemoFixture();
    const transformerNodeIds = fixture.diagram.nodes
      .filter((n) => n.kind === "transformer")
      .map((n) => n.id);

    const trAdjacentEdges = fixture.diagram.edges.filter(
      (e) => transformerNodeIds.includes(e.fromNodeId) || transformerNodeIds.includes(e.toNodeId),
    );

    for (const edge of trAdjacentEdges) {
      expect(edge.kind).toBe("connection");
      expect(edge.branchEquipmentInternalIds).toBeUndefined();
    }
  });
});
