import { describe, expect, it } from "vitest";
import { getDemoFixture } from "../src/index.js";

describe("demo fixture — branch chain ordering (AC22)", () => {
  it("the LV feeder branch_chain edge contains BRK-001 then CBL-001 in that order", () => {
    const fixture = getDemoFixture();
    const branchEdge = fixture.diagram.edges.find((e) => e.kind === "branch_chain");
    expect(branchEdge, "fixture must have a branch_chain edge").toBeDefined();
    expect(branchEdge!.branchEquipmentInternalIds).toEqual(["eq_brk_001", "eq_cbl_001"]);

    // Map back to tags for human-readable order check.
    const breaker = fixture.equipment.breakers.find((b) => b.internalId === "eq_brk_001");
    const cable = fixture.equipment.cables.find((c) => c.internalId === "eq_cbl_001");
    expect(breaker?.tag).toBe("BRK-001");
    expect(cable?.tag).toBe("CBL-001");
  });

  it("connection edges in the demo fixture do NOT carry branchEquipmentInternalIds", () => {
    const fixture = getDemoFixture();
    for (const edge of fixture.diagram.edges) {
      if (edge.kind === "connection") {
        expect(edge.branchEquipmentInternalIds).toBeUndefined();
      }
    }
  });
});
