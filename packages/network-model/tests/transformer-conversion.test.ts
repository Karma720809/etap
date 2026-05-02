import { describe, expect, it } from "vitest";
import { buildAppNetwork } from "../src/index.js";
import {
  bus,
  cable,
  connEdge,
  minimalValidProject,
  node,
  transformer,
  utility,
} from "./test-helpers.js";

describe("buildAppNetwork — transformer-as-node conversion (S2-OQ-04)", () => {
  it("converts a transformer node with two bus connections into NetworkTransformerBranch", () => {
    const result = buildAppNetwork(minimalValidProject());
    expect(result.status).toBe("valid");
    if (result.network === null) return;
    const t = result.network.transformers[0];
    expect(t).toBeDefined();
    expect(t?.internalId).toBe("eq_tr_1");
    expect(t?.fromBusInternalId).toBe("eq_bus_mv");
    expect(t?.toBusInternalId).toBe("eq_bus_lv");
    expect(t?.snMva).toBe(2);
    expect(t?.vkPercent).toBe(6);
  });

  it("emits E-LF-002 when the transformer node has only one bus connection", () => {
    const project = minimalValidProject();
    // Drop the LV bus connection edge.
    project.diagram.edges = project.diagram.edges.filter((e) => e.id !== "e_tr_lv");
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(
      result.issues.some(
        (i) => i.code === "E-LF-002" && i.equipmentInternalId === "eq_tr_1",
      ),
    ).toBe(true);
  });

  it("emits E-LF-002 when the transformer node has three bus connections", () => {
    const project = minimalValidProject();
    // Add a third bus and a third connection edge to the transformer node.
    project.equipment.buses.push(bus({ internalId: "eq_bus_extra", tag: "BUS-EXTRA", vnKv: 6.6, topology: "3P3W" }));
    project.diagram.nodes.push(node({ id: "n_bus_extra", equipmentInternalId: "eq_bus_extra", kind: "bus" }));
    project.diagram.edges.push(connEdge({ id: "e_tr_extra", fromNodeId: "n_tr", toNodeId: "n_bus_extra" }));
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(
      result.issues.some((i) => i.code === "E-LF-002" && i.equipmentInternalId === "eq_tr_1"),
    ).toBe(true);
  });

  it("emits E-EQ-003 when the transformer's fromBus/toBus is missing", () => {
    const project = minimalValidProject();
    project.equipment.transformers[0]!.fromBus = null;
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(
      result.issues.some((i) => i.code === "E-EQ-003" && i.equipmentInternalId === "eq_tr_1"),
    ).toBe(true);
  });

  it("excludes the transformer when it is out_of_service (path broken, downstream floating)", () => {
    const project = minimalValidProject();
    project.equipment.transformers[0]!.status = "out_of_service";
    const result = buildAppNetwork(project);
    expect(result.network).toBeNull();
    // Both LV and motor terminal buses become unreachable — E-NET-002.
    const floating = result.issues.filter((i) => i.code === "E-NET-002").map((i) => i.equipmentInternalId);
    expect(floating).toEqual(expect.arrayContaining(["eq_bus_lv", "eq_bus_mtr"]));
  });

  it("does not modify the project's transformer representation", () => {
    const project = minimalValidProject();
    const before = JSON.stringify(project.equipment.transformers);
    buildAppNetwork(project);
    expect(JSON.stringify(project.equipment.transformers)).toBe(before);
  });

  it("emits W-NET-001 (warning) when the diagram bus connections disagree with fromBus/toBus", () => {
    const project = minimalValidProject();
    // Swap which buses the transformer node connects to in the diagram while
    // keeping equipment fromBus/toBus the same.
    project.equipment.buses.push(bus({ internalId: "eq_bus_phantom", tag: "BUS-PHANTOM", vnKv: 0.4, topology: "3P4W" }));
    project.diagram.nodes.push(node({ id: "n_bus_phantom", equipmentInternalId: "eq_bus_phantom", kind: "bus" }));
    // Replace the LV bus connection with one to the phantom bus.
    project.diagram.edges = project.diagram.edges.map((e) =>
      e.id === "e_tr_lv" ? connEdge({ id: e.id, fromNodeId: e.fromNodeId, toNodeId: "n_bus_phantom" }) : e,
    );
    const result = buildAppNetwork(project);
    // Build is still valid (warning, not error), but the LV bus is now floating.
    // We only care that the W-NET-001 warning was emitted.
    const warning = result.warnings.find(
      (w) => w.code === "W-NET-001" && w.equipmentInternalId === "eq_tr_1",
    );
    expect(warning).toBeDefined();
  });
});
