import { describe, expect, it } from "vitest";
import { validateForCalculation, validateProject } from "../src/index.js";
import { emptyProject } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("E-EQ-001 — calculation-readiness escalation", () => {
  it("validateProject() keeps draft missing-required-field as I-EQ-001", () => {
    const project = emptyProject();
    project.equipment.buses.push({
      internalId: "eq_bus_1",
      tag: "BUS-1",
      kind: "bus",
      createdAt: NOW,
      updatedAt: NOW,
      vnKv: null,
      voltageType: "AC",
      topology: "3P4W",
      minVoltagePct: 95,
      maxVoltagePct: 105,
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "I-EQ-001" && i.field === "vnKv")).toBe(true);
    expect(result.issues.some((i) => i.code === "E-EQ-001")).toBe(false);
  });

  it("validateForCalculation() escalates I-EQ-001 to E-EQ-001", () => {
    const project = emptyProject();
    project.equipment.buses.push({
      internalId: "eq_bus_1",
      tag: "BUS-1",
      kind: "bus",
      createdAt: NOW,
      updatedAt: NOW,
      vnKv: null,
      voltageType: "AC",
      topology: "3P4W",
      minVoltagePct: 95,
      maxVoltagePct: 105,
    });
    const result = validateForCalculation(project);
    expect(result.issues.some((i) => i.code === "E-EQ-001" && i.field === "vnKv")).toBe(true);
    expect(result.issues.some((i) => i.code === "I-EQ-001")).toBe(false);
    expect(result.status).toBe("error");
  });

  it("validateForCalculation() also adds E-EQ-003/4/5 for branch equipment with missing endpoint", () => {
    const project = emptyProject();
    project.equipment.cables.push({
      internalId: "eq_cbl_1",
      tag: "CBL-001",
      kind: "cable",
      createdAt: NOW,
      updatedAt: NOW,
      fromBus: null,
      toBus: null,
      voltageGradeKv: 0.6,
      conductorMaterial: "Cu",
      conductorSizeMm2: 240,
      lengthM: 50,
      status: "in_service",
    });
    const result = validateForCalculation(project);
    expect(result.issues.some((i) => i.code === "E-EQ-004")).toBe(true);
  });
});
