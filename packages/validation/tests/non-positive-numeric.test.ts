import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("E-EQ-002 non-positive numeric value", () => {
  it("fires when bus.vnKv is entered as 0", () => {
    const project = emptyProject();
    project.equipment.buses.push({
      internalId: "eq_bus_1",
      tag: "BUS-001",
      kind: "bus",
      createdAt: NOW,
      updatedAt: NOW,
      vnKv: 0,
      voltageType: "AC",
      topology: "3P4W",
      minVoltagePct: 95,
      maxVoltagePct: 105,
    });
    const result = validateProject(project);
    const issues = result.issues.filter((i) => i.code === "E-EQ-002");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe("vnKv");
    expect(issues[0]!.severity).toBe("error");
  });

  it("fires for a negative transformer rating but stays silent on null draft fields", () => {
    const project = emptyProject();
    project.equipment.buses.push({
      internalId: "eq_bus_a",
      tag: "BUS-A",
      kind: "bus",
      createdAt: NOW,
      updatedAt: NOW,
      vnKv: 6.6,
      voltageType: "AC",
      topology: "3P3W",
      minVoltagePct: 95,
      maxVoltagePct: 105,
    });
    project.equipment.transformers.push({
      internalId: "eq_tr_1",
      tag: "TR-001",
      kind: "transformer",
      createdAt: NOW,
      updatedAt: NOW,
      fromBus: "eq_bus_a",
      toBus: null,
      snMva: -2,
      vnHvKv: null,
      vnLvKv: null,
      vkPercent: null,
      status: "in_service",
    });
    const result = validateProject(project);
    const eq002 = result.issues.filter((i) => i.code === "E-EQ-002");
    expect(eq002.map((i) => i.field)).toEqual(["snMva"]);
    // Null fields still emit I-EQ-001 (draft) — they must NOT escalate to E-EQ-002.
    const ieq = result.issues.filter((i) => i.code === "I-EQ-001" && i.field === "vnHvKv");
    expect(ieq.length).toBeGreaterThan(0);
  });

  it("does NOT fire on a freshly created (all-null) draft equipment", () => {
    const project = emptyProject();
    project.equipment.motors.push({
      internalId: "eq_motor_1",
      tag: "M-001",
      kind: "motor",
      createdAt: NOW,
      updatedAt: NOW,
      connectedBus: null,
      ratedKw: null,
      ratedHp: null,
      ratedVoltageV: null,
      flaSource: "calculated",
      startingMethod: "DOL",
      status: "in_service",
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-EQ-002")).toBe(false);
  });

  it("fires for a non-positive cable length", () => {
    const project = emptyProject();
    project.equipment.buses.push({
      internalId: "eq_bus_a",
      tag: "BUS-A",
      kind: "bus",
      createdAt: NOW,
      updatedAt: NOW,
      vnKv: 0.4,
      voltageType: "AC",
      topology: "3P4W",
      minVoltagePct: 95,
      maxVoltagePct: 105,
    });
    project.equipment.cables.push({
      internalId: "eq_cbl_1",
      tag: "CBL-001",
      kind: "cable",
      createdAt: NOW,
      updatedAt: NOW,
      fromBus: "eq_bus_a",
      toBus: null,
      voltageGradeKv: null,
      conductorMaterial: "Cu",
      conductorSizeMm2: null,
      lengthM: -10,
      status: "in_service",
    });
    const result = validateProject(project);
    const eq002 = result.issues.filter((i) => i.code === "E-EQ-002");
    expect(eq002.some((i) => i.field === "lengthM")).toBe(true);
  });
});
