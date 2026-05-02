import { describe, expect, it } from "vitest";
import { buildAppNetwork } from "../src/index.js";
import { branchChainEdge, cable, minimalValidProject, switchDevice } from "./test-helpers.js";

describe("buildAppNetwork — E-DIA-004 vs E-DIA-005 in branch_chain", () => {
  it("emits E-DIA-004 when a branch_chain references a non-existing equipment id", () => {
    const project = minimalValidProject();
    project.diagram.edges = project.diagram.edges.map((e) => {
      if (e.id !== "e_lv_to_mtr_chain") return e;
      return branchChainEdge({
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        branchEquipmentInternalIds: ["eq_does_not_exist", "eq_cbl_1"],
      });
    });
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(result.issues.some((i) => i.code === "E-DIA-004")).toBe(true);
    expect(result.issues.some((i) => i.code === "E-DIA-005")).toBe(false);
  });

  it("emits E-DIA-005 when a branch_chain references an existing equipment of unsupported kind", () => {
    const project = minimalValidProject();
    // Reference the transformer (an existing non-branch kind).
    project.diagram.edges = project.diagram.edges.map((e) => {
      if (e.id !== "e_lv_to_mtr_chain") return e;
      return branchChainEdge({
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        branchEquipmentInternalIds: ["eq_tr_1", "eq_cbl_1"],
      });
    });
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(result.issues.some((i) => i.code === "E-DIA-005")).toBe(true);
    expect(result.issues.some((i) => i.code === "E-DIA-004")).toBe(false);
  });
});

describe("buildAppNetwork — chain-disabling member downstream of a cable", () => {
  it("disables the entire chain when an open switch sits after a cable", () => {
    const project = minimalValidProject();
    // Replace the existing chain with [CBL, SW (open)].
    project.equipment.breakers = [];
    project.equipment.switches = [
      switchDevice({ internalId: "eq_sw_1", tag: "SW-1", fromBus: "eq_bus_lv", toBus: "eq_bus_mtr", state: "open" }),
    ];
    project.diagram.edges = project.diagram.edges.map((e) => {
      if (e.id !== "e_lv_to_mtr_chain") return e;
      return branchChainEdge({
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        branchEquipmentInternalIds: ["eq_cbl_1", "eq_sw_1"],
      });
    });
    const result = buildAppNetwork(project);
    expect(result.appNetwork).toBeNull();
    expect(result.issues.some((i) => i.code === "E-NET-002" && i.equipmentInternalId === "eq_bus_mtr")).toBe(true);
  });

  it("disables the entire chain when an out_of_service switch sits after a cable", () => {
    const project = minimalValidProject();
    project.equipment.breakers = [];
    project.equipment.switches = [
      switchDevice({
        internalId: "eq_sw_1",
        tag: "SW-1",
        fromBus: "eq_bus_lv",
        toBus: "eq_bus_mtr",
        state: "closed",
        status: "out_of_service",
      }),
    ];
    project.diagram.edges = project.diagram.edges.map((e) => {
      if (e.id !== "e_lv_to_mtr_chain") return e;
      return branchChainEdge({
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        branchEquipmentInternalIds: ["eq_cbl_1", "eq_sw_1"],
      });
    });
    const result = buildAppNetwork(project);
    expect(result.appNetwork).toBeNull();
    expect(result.issues.some((i) => i.code === "E-NET-002" && i.equipmentInternalId === "eq_bus_mtr")).toBe(true);
  });
});
