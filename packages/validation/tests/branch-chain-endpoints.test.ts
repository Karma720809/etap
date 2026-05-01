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
  it("fires when contained equipment fromBus references a bus outside the chain endpoints", () => {
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

  it("stays silent when contained equipment matches chain endpoints in the same direction", () => {
    const project = buildBranchChainProject("eq_bus_a", "eq_bus_b");
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-NET-001")).toBe(false);
  });

  it("stays silent when contained equipment endpoints are null (draft)", () => {
    const project = buildBranchChainProject(null, null);
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-NET-001")).toBe(false);
  });

  it("fires when contained equipment fromBus/toBus are reversed relative to the chain direction", () => {
    // Spec §4.8 makes branch_chain ordering load-bearing for Stage 2+ network
    // conversion, so a branch_chain BUS-A → BUS-B with a cable declared as
    // fromBus=BUS-B / toBus=BUS-A must NOT pass: it would silently feed the
    // calculation pipeline a reversed orientation. W-NET-001 covers this case.
    const project = buildBranchChainProject("eq_bus_b", "eq_bus_a");
    const result = validateProject(project);
    const reversal = result.issues.filter((i) => i.code === "W-NET-001");
    expect(reversal).toHaveLength(1);
    expect(reversal[0]!.equipmentInternalId).toBe("eq_cbl_1");
  });

  it("fires when only fromBus is reversed (toBus null)", () => {
    const project = buildBranchChainProject("eq_bus_b", null);
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-NET-001")).toBe(true);
  });

  it("fires when only toBus is reversed (fromBus null)", () => {
    const project = buildBranchChainProject(null, "eq_bus_a");
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-NET-001")).toBe(true);
  });

  it("preserves branchEquipmentInternalIds order regardless of W-NET-001 outcome", () => {
    // The validator must never reorder branch entries — Stage 2+ relies on the
    // original upstream-to-downstream order (Spec §4.8 / §6.2).
    const project = buildBranchChainProject("eq_bus_b", "eq_bus_a");
    project.equipment.breakers.push({
      internalId: "eq_brk_1",
      tag: "BRK-001",
      kind: "breaker",
      createdAt: NOW,
      updatedAt: NOW,
      deviceType: "breaker",
      fromBus: "eq_bus_a",
      toBus: "eq_bus_b",
      state: "closed",
      ratedVoltageKv: 0.4,
      ratedCurrentA: 100,
      status: "in_service",
    });
    const edge = project.diagram.edges[0]!;
    edge.branchEquipmentInternalIds = ["eq_brk_1", "eq_cbl_1"];
    validateProject(project);
    expect(edge.branchEquipmentInternalIds).toEqual(["eq_brk_1", "eq_cbl_1"]);
  });
});
