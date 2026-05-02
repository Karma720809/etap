import { describe, expect, it } from "vitest";
import { buildAppNetwork } from "../src/index.js";
import { bus, emptyProject, generator, minimalValidProject, node, utility } from "./test-helpers.js";

describe("buildAppNetwork — bus + source with no loads is valid", () => {
  it("accepts a project with utility + bus and no loads/motors", () => {
    const project = emptyProject();
    project.equipment.utilities = [
      utility({ internalId: "eq_util_1", tag: "UTL-1", connectedBus: "eq_bus_a" }),
    ];
    project.equipment.buses = [bus({ internalId: "eq_bus_a", tag: "BUS-A", vnKv: 0.4, topology: "3P4W" })];
    project.diagram.nodes = [
      node({ id: "n_util", equipmentInternalId: "eq_util_1", kind: "utility" }),
      node({ id: "n_bus_a", equipmentInternalId: "eq_bus_a", kind: "bus" }),
    ];
    project.diagram.edges = [
      { id: "e_util_a", fromNodeId: "n_util", toNodeId: "n_bus_a", kind: "connection" },
    ];
    project.scenarios = [
      { schemaVersion: "1.0.0", scenarioId: "S", name: "S", inheritsFrom: null, overrides: [] },
    ];
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.appNetwork === null) return;
    expect(result.appNetwork.loads).toHaveLength(0);
    expect(result.appNetwork.motors).toHaveLength(0);
    expect(result.appNetwork.buses).toHaveLength(1);
    expect(result.issues).toEqual([]);
  });
});

describe("buildAppNetwork — PV / island generator policy alongside a valid utility slack", () => {
  it("blocks the build when an in-service pv_voltage_control generator is present alongside a utility slack", () => {
    const project = minimalValidProject();
    project.equipment.generators = [
      generator({
        internalId: "eq_gen_pv",
        tag: "GEN-PV",
        connectedBus: "eq_bus_lv",
        operatingMode: "pv_voltage_control",
      }),
    ];
    const result = buildAppNetwork(project);
    // Policy: PV / island generators are unsupported in Stage 2 MVP regardless
    // of whether another valid slack exists. They emit W-GEN-001 (warning) and
    // E-LF-003 (blocking).
    expect(result.status).toBe("invalid");
    expect(result.issues.some((i) => i.code === "E-LF-003" && i.equipmentInternalId === "eq_gen_pv")).toBe(true);
    expect(result.warnings.some((w) => w.code === "W-GEN-001" && w.equipmentInternalId === "eq_gen_pv")).toBe(true);
  });

  it("blocks the build when an in-service island_isochronous generator is present alongside a utility slack", () => {
    const project = minimalValidProject();
    project.equipment.generators = [
      generator({
        internalId: "eq_gen_island",
        tag: "GEN-IS",
        connectedBus: "eq_bus_lv",
        operatingMode: "island_isochronous",
      }),
    ];
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(result.issues.some((i) => i.code === "E-LF-003" && i.equipmentInternalId === "eq_gen_island")).toBe(true);
  });

  it("accepts a grid_parallel_pq generator alongside a utility slack", () => {
    const project = minimalValidProject();
    project.equipment.generators = [
      generator({
        internalId: "eq_gen_pq",
        tag: "GEN-PQ",
        connectedBus: "eq_bus_lv",
        operatingMode: "grid_parallel_pq",
        pMw: 0.2,
        qMvar: 0.05,
      }),
    ];
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.appNetwork === null) return;
    expect(result.appNetwork.generators).toHaveLength(1);
    expect(result.appNetwork.generators[0]?.internalId).toBe("eq_gen_pq");
  });
});
