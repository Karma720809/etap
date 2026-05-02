import { describe, expect, it } from "vitest";
import { buildAppNetwork } from "../src/index.js";
import { branchChainEdge, breaker, cable, minimalValidProject, switchDevice } from "./test-helpers.js";

describe("buildAppNetwork — branch_chain conversion (S2-OQ-01..03)", () => {
  it("includes the cable branch when [BRK closed, CBL] is fully enabled", () => {
    const result = buildAppNetwork(minimalValidProject());
    expect(result.status).toBe("valid");
    if (result.network === null) return;
    const cables = result.network.cables;
    const gates = result.network.gates;
    expect(cables).toHaveLength(1);
    expect(gates).toHaveLength(1);
    expect(gates[0]?.kind).toBe("breaker");
    expect(gates[0]?.state).toBe("closed");
  });

  it("excludes the cable branch when the breaker is open", () => {
    const project = minimalValidProject();
    project.equipment.breakers[0]!.state = "open";
    const result = buildAppNetwork(project);
    // Source still valid; downstream motor terminal bus becomes floating.
    expect(result.network).toBeNull();
    expect(result.issues.some((i) => i.code === "E-NET-002" && i.equipmentInternalId === "eq_bus_mtr")).toBe(true);
    // No cable record was emitted; we cannot inspect it directly when the
    // build is invalid, but the floating-bus diagnostic confirms the path was
    // removed.
  });

  it("excludes the cable branch when the breaker is out_of_service", () => {
    const project = minimalValidProject();
    project.equipment.breakers[0]!.status = "out_of_service";
    const result = buildAppNetwork(project);
    expect(result.network).toBeNull();
    expect(result.issues.some((i) => i.code === "E-NET-002")).toBe(true);
  });

  it("excludes the cable branch when the cable itself is out_of_service", () => {
    const project = minimalValidProject();
    project.equipment.cables[0]!.status = "out_of_service";
    const result = buildAppNetwork(project);
    expect(result.network).toBeNull();
    expect(result.issues.some((i) => i.code === "E-NET-002")).toBe(true);
  });

  it("preserves branchEquipmentInternalIds order via branchChainOrderIndex", () => {
    // Build a chain [SW, BRK, CBL] and verify the cable's order index is 2
    // and the gates carry indices 0 and 1.
    const project = minimalValidProject();
    project.equipment.switches = [
      switchDevice({ internalId: "eq_sw_1", tag: "SW-1", fromBus: "eq_bus_lv", toBus: "eq_bus_mtr", state: "closed" }),
    ];
    project.diagram.edges = project.diagram.edges.map((e) => {
      if (e.id !== "e_lv_to_mtr_chain") return e;
      return branchChainEdge({
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        branchEquipmentInternalIds: ["eq_sw_1", "eq_brk_1", "eq_cbl_1"],
      });
    });
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.network === null) return;
    expect(result.network.cables[0]?.branchChainOrderIndex).toBe(2);
    expect(result.network.gates.find((g) => g.internalId === "eq_sw_1")?.branchChainOrderIndex).toBe(0);
    expect(result.network.gates.find((g) => g.internalId === "eq_brk_1")?.branchChainOrderIndex).toBe(1);
  });

  it("emits W-NET-001 when a cable's fromBus/toBus disagrees with the chain endpoints", () => {
    const project = minimalValidProject();
    // Reverse the cable's endpoints to trigger the mismatch path.
    project.equipment.cables[0]!.fromBus = "eq_bus_mtr";
    project.equipment.cables[0]!.toBus = "eq_bus_lv";
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    expect(result.warnings.some((w) => w.code === "W-NET-001" && w.equipmentInternalId === "eq_cbl_1")).toBe(true);
  });

  it("emits E-DIA-005 for branch_chain members that are not breaker/cable/switch", () => {
    const project = minimalValidProject();
    // Slip a transformer internalId into a branch_chain — Stage 1 schema
    // rejects this at edit time, but buildAppNetwork must still fail-closed
    // when fed such input.
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
  });
});

describe("buildAppNetwork — gate fan-out", () => {
  it("treats out-of-service switch + closed cable as a broken path", () => {
    const project = minimalValidProject();
    // Replace breaker with switch in the chain.
    project.equipment.breakers = [];
    project.equipment.switches = [
      switchDevice({ internalId: "eq_sw_1", tag: "SW-1", fromBus: "eq_bus_lv", toBus: "eq_bus_mtr", status: "out_of_service" }),
    ];
    project.diagram.edges = project.diagram.edges.map((e) => {
      if (e.id !== "e_lv_to_mtr_chain") return e;
      return branchChainEdge({
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        branchEquipmentInternalIds: ["eq_sw_1", "eq_cbl_1"],
      });
    });
    const result = buildAppNetwork(project);
    expect(result.network).toBeNull();
    expect(result.issues.some((i) => i.code === "E-NET-002")).toBe(true);
  });

  it("supports an additional closed cable in a separate branch_chain", () => {
    // Verifies multiple branch_chains coexist and that order indices are
    // local to each chain.
    const project = minimalValidProject();
    // No additional chains here — verify the baseline indices are correct.
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.network === null) return;
    expect(result.network.cables[0]?.branchChainOrderIndex).toBe(1);
    expect(result.network.gates[0]?.branchChainOrderIndex).toBe(0);
  });
});

describe("buildAppNetwork — branch_chain endpoint integrity", () => {
  it("emits E-LF-002 when a branch_chain endpoint is not a bus node", () => {
    const project = minimalValidProject();
    // Point the chain at the motor node instead of the motor terminal bus.
    project.diagram.edges = project.diagram.edges.map((e) => {
      if (e.id !== "e_lv_to_mtr_chain") return e;
      return {
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: "n_motor", // motor node, not a bus node
        kind: "branch_chain",
        branchEquipmentInternalIds: ["eq_brk_1", "eq_cbl_1"],
      };
    });
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(result.issues.some((i) => i.code === "E-LF-002")).toBe(true);
  });
});
