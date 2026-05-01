import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

function pushBus(project: ReturnType<typeof emptyProject>, internalId: string) {
  project.equipment.buses.push({
    internalId,
    tag: internalId,
    kind: "bus",
    createdAt: NOW,
    updatedAt: NOW,
    vnKv: 0.4,
    voltageType: "AC",
    topology: "3P4W",
    minVoltagePct: 95,
    maxVoltagePct: 105,
  });
}

describe("W-EQ-003 — transformer %R vs X/R consistency", () => {
  it("stays silent when %R, X/R, %Z agree", () => {
    const project = emptyProject();
    pushBus(project, "eq_bus_a");
    pushBus(project, "eq_bus_b");
    project.equipment.transformers.push({
      internalId: "eq_tr_1",
      tag: "TR-001",
      kind: "transformer",
      createdAt: NOW,
      updatedAt: NOW,
      fromBus: "eq_bus_a",
      toBus: "eq_bus_b",
      snMva: 2,
      vnHvKv: 6.6,
      vnLvKv: 0.4,
      vkPercent: 6,
      vkrPercent: 1,
      // sqrt(36-1) ≈ 5.916; X/R = 5.916 → R*X/R ≈ 5.916. consistent.
      xrRatio: 5.916,
      status: "in_service",
    });
    project.diagram.nodes.push({
      id: "node_tr",
      equipmentInternalId: "eq_tr_1",
      kind: "transformer",
      position: { x: 0, y: 0 },
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-EQ-003")).toBe(false);
  });

  it("fires when X/R disagrees with %R and %Z", () => {
    const project = emptyProject();
    pushBus(project, "eq_bus_a");
    pushBus(project, "eq_bus_b");
    project.equipment.transformers.push({
      internalId: "eq_tr_1",
      tag: "TR-001",
      kind: "transformer",
      createdAt: NOW,
      updatedAt: NOW,
      fromBus: "eq_bus_a",
      toBus: "eq_bus_b",
      snMva: 2,
      vnHvKv: 6.6,
      vnLvKv: 0.4,
      vkPercent: 6,
      vkrPercent: 1,
      xrRatio: 20, // way off; sqrt(36-1)=5.916 vs 1*20=20.
      status: "in_service",
    });
    project.diagram.nodes.push({
      id: "node_tr",
      equipmentInternalId: "eq_tr_1",
      kind: "transformer",
      position: { x: 0, y: 0 },
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-EQ-003")).toBe(true);
  });

  it("fires when %R exceeds %Z (physically impossible)", () => {
    const project = emptyProject();
    pushBus(project, "eq_bus_a");
    pushBus(project, "eq_bus_b");
    project.equipment.transformers.push({
      internalId: "eq_tr_1",
      tag: "TR-001",
      kind: "transformer",
      createdAt: NOW,
      updatedAt: NOW,
      fromBus: "eq_bus_a",
      toBus: "eq_bus_b",
      snMva: 2,
      vnHvKv: 6.6,
      vnLvKv: 0.4,
      vkPercent: 5,
      vkrPercent: 7,
      xrRatio: 0.5,
      status: "in_service",
    });
    project.diagram.nodes.push({
      id: "node_tr",
      equipmentInternalId: "eq_tr_1",
      kind: "transformer",
      position: { x: 0, y: 0 },
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-EQ-003")).toBe(true);
  });
});
