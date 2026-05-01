import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

function buildBranchChainProject(branchFromBus: string | null, branchToBus: string | null) {
  const project = emptyProject();
  project.equipment.utilities.push({
    internalId: "eq_util_1",
    tag: "UTL-001",
    kind: "utility",
    createdAt: NOW,
    updatedAt: NOW,
    connectedBus: "eq_bus_a",
    vnKv: 6.6,
    status: "in_service",
  });
  for (const id of ["eq_bus_a", "eq_bus_b"]) {
    project.equipment.buses.push({
      internalId: id,
      tag: id,
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
      id: `node_${id}`,
      equipmentInternalId: id,
      kind: "bus",
      position: { x: 0, y: 0 },
    });
  }
  project.equipment.cables.push({
    internalId: "eq_cbl_1",
    tag: "CBL-001",
    kind: "cable",
    createdAt: NOW,
    updatedAt: NOW,
    fromBus: branchFromBus,
    toBus: branchToBus,
    voltageGradeKv: 0.6,
    conductorMaterial: "Cu",
    conductorSizeMm2: 50,
    lengthM: 10,
    status: "in_service",
  });
  project.diagram.edges.push({
    id: "edge_chain",
    fromNodeId: "node_eq_bus_a",
    toNodeId: "node_eq_bus_b",
    kind: "branch_chain",
    branchEquipmentInternalIds: ["eq_cbl_1"],
  });
  return project;
}

describe("W-NET-001 — branch_chain endpoint mismatch", () => {
  it("fires when contained equipment fromBus disagrees with chain endpoint nodes", () => {
    const project = buildBranchChainProject("eq_bus_other", "eq_bus_b");
    project.equipment.buses.push({
      internalId: "eq_bus_other",
      tag: "BUS-OTHER",
      kind: "bus",
      createdAt: NOW,
      updatedAt: NOW,
      vnKv: 0.4,
      voltageType: "AC",
      topology: "3P4W",
      minVoltagePct: 95,
      maxVoltagePct: 105,
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-NET-001")).toBe(true);
  });

  it("stays silent when contained equipment matches chain endpoints", () => {
    const project = buildBranchChainProject("eq_bus_a", "eq_bus_b");
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-NET-001")).toBe(false);
  });

  it("stays silent when contained equipment endpoints are null (draft)", () => {
    const project = buildBranchChainProject(null, null);
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-NET-001")).toBe(false);
  });
});
