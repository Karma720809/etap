import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject, projectWithBus } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("E-EQ-003 / E-EQ-004 / E-EQ-005 — branch from/to identical buses", () => {
  it("E-EQ-003 fires when transformer fromBus === toBus", () => {
    const project = projectWithBus("eq_bus_only");
    project.equipment.transformers.push({
      internalId: "eq_tr_1",
      tag: "TR-001",
      kind: "transformer",
      createdAt: NOW,
      updatedAt: NOW,
      fromBus: "eq_bus_only",
      toBus: "eq_bus_only",
      snMva: 1,
      vnHvKv: 6.6,
      vnLvKv: 0.4,
      vkPercent: 6,
      status: "in_service",
    });
    project.diagram.nodes.push({
      id: "node_tr_1",
      equipmentInternalId: "eq_tr_1",
      kind: "transformer",
      position: { x: 0, y: 0 },
    });
    const result = validateProject(project);
    const eq003 = result.issues.filter((i) => i.code === "E-EQ-003");
    expect(eq003).toHaveLength(1);
    expect(eq003[0]!.equipmentInternalId).toBe("eq_tr_1");
  });

  it("E-EQ-004 fires for cable identical buses; E-EQ-005 fires for breaker/switch identical buses", () => {
    const project = projectWithBus("eq_bus_only");
    project.equipment.cables.push({
      internalId: "eq_cbl_1",
      tag: "CBL-001",
      kind: "cable",
      createdAt: NOW,
      updatedAt: NOW,
      fromBus: "eq_bus_only",
      toBus: "eq_bus_only",
      voltageGradeKv: 0.6,
      conductorMaterial: "Cu",
      conductorSizeMm2: 50,
      lengthM: 10,
      status: "in_service",
    });
    project.equipment.breakers.push({
      internalId: "eq_brk_1",
      tag: "BRK-001",
      kind: "breaker",
      createdAt: NOW,
      updatedAt: NOW,
      deviceType: "breaker",
      fromBus: "eq_bus_only",
      toBus: "eq_bus_only",
      state: "closed",
      ratedVoltageKv: 0.4,
      ratedCurrentA: 100,
      status: "in_service",
    });
    project.equipment.switches.push({
      internalId: "eq_sw_1",
      tag: "SW-001",
      kind: "switch",
      createdAt: NOW,
      updatedAt: NOW,
      fromBus: "eq_bus_only",
      toBus: "eq_bus_only",
      state: "closed",
      status: "in_service",
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-EQ-004" && i.equipmentInternalId === "eq_cbl_1")).toBe(true);
    expect(result.issues.filter((i) => i.code === "E-EQ-005").map((i) => i.equipmentInternalId).sort())
      .toEqual(["eq_brk_1", "eq_sw_1"]);
  });

  it("does NOT fire when fromBus or toBus is null (draft territory)", () => {
    const project = emptyProject();
    project.equipment.cables.push({
      internalId: "eq_cbl_draft",
      tag: "CBL-DRAFT",
      kind: "cable",
      createdAt: NOW,
      updatedAt: NOW,
      fromBus: null,
      toBus: null,
      voltageGradeKv: null,
      conductorMaterial: "unknown",
      conductorSizeMm2: null,
      lengthM: null,
      status: "in_service",
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-EQ-004")).toBe(false);
  });
});
