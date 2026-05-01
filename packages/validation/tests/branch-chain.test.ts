import { describe, expect, it } from "vitest";
import { PowerSystemProjectFileSchema } from "@power-system-study/schemas";
import { validateProject } from "../src/index.js";
import { projectWithBus } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("branch_chain runtime checks", () => {
  it("E-DIA-004 — branch_chain edge references missing equipment internalId", () => {
    const project = projectWithBus("eq_bus_001");
    project.diagram.nodes.push({
      id: "node_other",
      equipmentInternalId: "eq_bus_001",
      kind: "bus",
      position: { x: 200, y: 0 },
    });
    project.diagram.edges.push({
      id: "edge_branch_bad_ref",
      fromNodeId: "node_eq_bus_001",
      toNodeId: "node_other",
      kind: "branch_chain",
      branchEquipmentInternalIds: ["eq_does_not_exist"],
    });

    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-DIA-004")).toBe(true);
  });

  it("E-DIA-005 — branch_chain edge references equipment that isn't breaker/cable/switch", () => {
    const project = projectWithBus("eq_bus_001");
    project.equipment.motors.push({
      internalId: "eq_motor_001",
      tag: "M-001",
      kind: "motor",
      createdAt: NOW,
      updatedAt: NOW,
      connectedBus: "eq_bus_001",
      ratedKw: 250,
      ratedVoltageV: 400,
      flaSource: "calculated",
      startingMethod: "DOL",
      status: "in_service",
    });
    project.diagram.nodes.push({
      id: "node_other",
      equipmentInternalId: "eq_bus_001",
      kind: "bus",
      position: { x: 200, y: 0 },
    });
    project.diagram.edges.push({
      id: "edge_branch_motor",
      fromNodeId: "node_eq_bus_001",
      toNodeId: "node_other",
      kind: "branch_chain",
      branchEquipmentInternalIds: ["eq_motor_001"],
    });

    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-DIA-005")).toBe(true);
  });
});

describe("Zod-level schema enforcement of edge rules", () => {
  it("rejects connection edge that carries branchEquipmentInternalIds", () => {
    const projectShape = projectWithBus("eq_bus_001");
    projectShape.diagram.nodes.push({
      id: "node_other",
      equipmentInternalId: "eq_bus_001",
      kind: "bus",
      position: { x: 200, y: 0 },
    });
    projectShape.diagram.edges.push({
      id: "edge_bad_connection",
      fromNodeId: "node_eq_bus_001",
      toNodeId: "node_other",
      kind: "connection",
      // Forbidden:
      branchEquipmentInternalIds: ["whatever"],
    });

    const parse = PowerSystemProjectFileSchema.safeParse(projectShape);
    expect(parse.success).toBe(false);
  });

  it("rejects branch_chain edge that has no branchEquipmentInternalIds", () => {
    const projectShape = projectWithBus("eq_bus_001");
    projectShape.diagram.nodes.push({
      id: "node_other",
      equipmentInternalId: "eq_bus_001",
      kind: "bus",
      position: { x: 200, y: 0 },
    });
    projectShape.diagram.edges.push({
      id: "edge_bad_branch_chain",
      fromNodeId: "node_eq_bus_001",
      toNodeId: "node_other",
      kind: "branch_chain",
      // Forbidden: branch_chain without branchEquipmentInternalIds
    });

    const parse = PowerSystemProjectFileSchema.safeParse(projectShape);
    expect(parse.success).toBe(false);
  });
});
