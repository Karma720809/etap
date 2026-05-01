import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { projectWithBus } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

function addTransformer(project: ReturnType<typeof projectWithBus>, internalId = "eq_tr_001") {
  project.equipment.buses.push({
    internalId: "eq_bus_lv",
    tag: "BUS-LV",
    kind: "bus",
    createdAt: NOW,
    updatedAt: NOW,
    vnKv: 0.4,
    voltageType: "AC",
    topology: "3P4W",
    minVoltagePct: 95,
    maxVoltagePct: 105,
  });
  project.diagram.nodes.push({
    id: "node_eq_bus_lv",
    equipmentInternalId: "eq_bus_lv",
    kind: "bus",
    position: { x: 400, y: 0 },
  });
  project.equipment.transformers.push({
    internalId,
    tag: "TR-001",
    kind: "transformer",
    createdAt: NOW,
    updatedAt: NOW,
    fromBus: "eq_bus_001",
    toBus: "eq_bus_lv",
    snMva: 1,
    vnHvKv: 6.6,
    vnLvKv: 0.4,
    vkPercent: 6,
    status: "in_service",
  });
  return project;
}

describe("E-DIA-001 / E-DIA-002 transformer-as-node enforcement", () => {
  it("E-DIA-001 — flags a transformer that has no diagram node", () => {
    const project = addTransformer(projectWithBus("eq_bus_001"));
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-DIA-001")).toBe(true);
  });

  it("E-DIA-002 — flags a diagram edge that carries a transformer via equipmentInternalId", () => {
    const project = addTransformer(projectWithBus("eq_bus_001"));
    // Add the proper transformer node so E-DIA-001 doesn't fire,
    project.diagram.nodes.push({
      id: "node_tr_001",
      equipmentInternalId: "eq_tr_001",
      kind: "transformer",
      position: { x: 200, y: 0 },
    });
    // ...and then maliciously also reference the transformer via an edge.
    project.diagram.edges.push({
      id: "edge_carrying_transformer",
      fromNodeId: "node_eq_bus_001",
      toNodeId: "node_eq_bus_lv",
      kind: "connection",
      equipmentInternalId: "eq_tr_001",
    });

    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-DIA-002")).toBe(true);
    // E-DIA-001 must NOT fire because the transformer has a proper node:
    expect(result.issues.some((i) => i.code === "E-DIA-001")).toBe(false);
  });

  it("does not fire when the transformer is correctly represented as a node", () => {
    const project = addTransformer(projectWithBus("eq_bus_001"));
    project.diagram.nodes.push({
      id: "node_tr_001",
      equipmentInternalId: "eq_tr_001",
      kind: "transformer",
      position: { x: 200, y: 0 },
    });

    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-DIA-001")).toBe(false);
    expect(result.issues.some((i) => i.code === "E-DIA-002")).toBe(false);
  });
});
