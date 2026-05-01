import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

function bus(internalId: string, tag: string) {
  return {
    internalId,
    tag,
    kind: "bus" as const,
    createdAt: NOW,
    updatedAt: NOW,
    vnKv: 0.4,
    voltageType: "AC" as const,
    topology: "3P4W" as const,
    minVoltagePct: 95,
    maxVoltagePct: 105,
  };
}

function utility(internalId: string, tag: string, connectedBus: string | null) {
  return {
    internalId,
    tag,
    kind: "utility" as const,
    createdAt: NOW,
    updatedAt: NOW,
    connectedBus,
    vnKv: 6.6,
    status: "in_service" as const,
  };
}

describe("E-NET-002 floating bus", () => {
  it("does NOT fire when there is no in-service source (E-NET-001 already covers it)", () => {
    const project = emptyProject();
    project.equipment.buses.push(bus("eq_bus_a", "BUS-A"), bus("eq_bus_b", "BUS-B"));
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-NET-002")).toBe(false);
  });

  it("does NOT fire when there are no branch elements (rule applies only after a branch path exists)", () => {
    const project = emptyProject();
    project.equipment.buses.push(bus("eq_bus_a", "BUS-A"), bus("eq_bus_b", "BUS-B"));
    project.equipment.utilities.push(utility("eq_util_1", "UTL-001", "eq_bus_a"));
    project.diagram.nodes.push(
      { id: "n_a", equipmentInternalId: "eq_bus_a", kind: "bus", position: { x: 0, y: 0 } },
      { id: "n_b", equipmentInternalId: "eq_bus_b", kind: "bus", position: { x: 100, y: 0 } },
      { id: "n_u", equipmentInternalId: "eq_util_1", kind: "utility", position: { x: -100, y: 0 } },
    );
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-NET-002")).toBe(false);
  });

  it("fires E-NET-002 for an isolated bus when a branch path exists elsewhere", () => {
    const project = emptyProject();
    project.equipment.buses.push(
      bus("eq_bus_mv", "BUS-MV"),
      bus("eq_bus_lv", "BUS-LV"),
      bus("eq_bus_island", "BUS-ISLAND"),
    );
    project.equipment.utilities.push(utility("eq_util_1", "UTL-001", "eq_bus_mv"));
    project.equipment.transformers.push({
      internalId: "eq_tr_1",
      tag: "TR-001",
      kind: "transformer",
      createdAt: NOW,
      updatedAt: NOW,
      fromBus: "eq_bus_mv",
      toBus: "eq_bus_lv",
      snMva: 1,
      vnHvKv: 6.6,
      vnLvKv: 0.4,
      vkPercent: 6,
      status: "in_service",
    });
    project.diagram.nodes.push(
      { id: "n_mv", equipmentInternalId: "eq_bus_mv", kind: "bus", position: { x: 0, y: 0 } },
      { id: "n_lv", equipmentInternalId: "eq_bus_lv", kind: "bus", position: { x: 200, y: 0 } },
      { id: "n_island", equipmentInternalId: "eq_bus_island", kind: "bus", position: { x: 400, y: 0 } },
      { id: "n_u", equipmentInternalId: "eq_util_1", kind: "utility", position: { x: -100, y: 0 } },
      { id: "n_tr", equipmentInternalId: "eq_tr_1", kind: "transformer", position: { x: 100, y: 0 } },
    );

    const result = validateProject(project);
    const floating = result.issues.filter((i) => i.code === "E-NET-002");
    expect(floating).toHaveLength(1);
    expect(floating[0]!.equipmentInternalId).toBe("eq_bus_island");
  });

  it("treats an open breaker as breaking the path so the downstream bus floats", () => {
    const project = emptyProject();
    project.equipment.buses.push(bus("eq_bus_lv", "BUS-LV"), bus("eq_bus_mtr", "BUS-MTR"));
    project.equipment.utilities.push(utility("eq_util_1", "UTL-001", "eq_bus_lv"));
    project.equipment.breakers.push({
      internalId: "eq_brk_1",
      tag: "BRK-001",
      kind: "breaker",
      createdAt: NOW,
      updatedAt: NOW,
      deviceType: "breaker",
      fromBus: "eq_bus_lv",
      toBus: "eq_bus_mtr",
      state: "open",
      ratedVoltageKv: 0.4,
      ratedCurrentA: 100,
      status: "in_service",
    });
    project.diagram.nodes.push(
      { id: "n_lv", equipmentInternalId: "eq_bus_lv", kind: "bus", position: { x: 0, y: 0 } },
      { id: "n_mtr", equipmentInternalId: "eq_bus_mtr", kind: "bus", position: { x: 200, y: 0 } },
      { id: "n_u", equipmentInternalId: "eq_util_1", kind: "utility", position: { x: -100, y: 0 } },
    );

    const result = validateProject(project);
    const floating = result.issues.filter((i) => i.code === "E-NET-002");
    expect(floating.map((i) => i.equipmentInternalId)).toContain("eq_bus_mtr");
  });

  it("a closed breaker on the same path does NOT cause floating", () => {
    const project = emptyProject();
    project.equipment.buses.push(bus("eq_bus_lv", "BUS-LV"), bus("eq_bus_mtr", "BUS-MTR"));
    project.equipment.utilities.push(utility("eq_util_1", "UTL-001", "eq_bus_lv"));
    project.equipment.breakers.push({
      internalId: "eq_brk_1",
      tag: "BRK-001",
      kind: "breaker",
      createdAt: NOW,
      updatedAt: NOW,
      deviceType: "breaker",
      fromBus: "eq_bus_lv",
      toBus: "eq_bus_mtr",
      state: "closed",
      ratedVoltageKv: 0.4,
      ratedCurrentA: 100,
      status: "in_service",
    });
    project.diagram.nodes.push(
      { id: "n_lv", equipmentInternalId: "eq_bus_lv", kind: "bus", position: { x: 0, y: 0 } },
      { id: "n_mtr", equipmentInternalId: "eq_bus_mtr", kind: "bus", position: { x: 200, y: 0 } },
      { id: "n_u", equipmentInternalId: "eq_util_1", kind: "utility", position: { x: -100, y: 0 } },
    );

    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-NET-002")).toBe(false);
  });
});
