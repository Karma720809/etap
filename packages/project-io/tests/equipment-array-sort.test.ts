import { describe, expect, it } from "vitest";
import { getDemoFixture } from "@power-system-study/fixtures";
import { serializeProjectFile } from "../src/index.js";

describe("deterministic equipment-array ordering", () => {
  it("equipment arrays are serialized in internalId order even after caller-side reordering", () => {
    const fixture = getDemoFixture();
    // Reverse the buses to simulate caller-side reordering; serializer must restore canonical order.
    fixture.equipment.buses.reverse();

    const serialized = serializeProjectFile(fixture);
    const parsed = JSON.parse(serialized) as {
      equipment: { buses: Array<{ internalId: string }> };
    };

    const ids = parsed.equipment.buses.map((b) => b.internalId);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("branchEquipmentInternalIds order is preserved (load-bearing upstream→downstream)", () => {
    const fixture = getDemoFixture();
    const serialized = serializeProjectFile(fixture);
    const parsed = JSON.parse(serialized) as {
      diagram: { edges: Array<{ kind: string; branchEquipmentInternalIds?: string[] }> };
    };
    const branchEdge = parsed.diagram.edges.find((e) => e.kind === "branch_chain");
    expect(branchEdge?.branchEquipmentInternalIds).toEqual(["eq_brk_001", "eq_cbl_001"]);
  });
});
