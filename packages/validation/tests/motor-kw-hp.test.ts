import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("W-EQ-004 — motor kW vs HP consistency", () => {
  it("stays silent when kW = HP × 0.7457", () => {
    const project = emptyProject();
    project.equipment.motors.push({
      internalId: "eq_motor_1",
      tag: "M-001",
      kind: "motor",
      createdAt: NOW,
      updatedAt: NOW,
      connectedBus: null,
      ratedKw: 74.57,
      ratedHp: 100,
      ratedVoltageV: 400,
      flaSource: "calculated",
      startingMethod: "DOL",
      status: "in_service",
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-EQ-004")).toBe(false);
  });

  it("fires when kW disagrees with HP beyond tolerance", () => {
    const project = emptyProject();
    project.equipment.motors.push({
      internalId: "eq_motor_1",
      tag: "M-001",
      kind: "motor",
      createdAt: NOW,
      updatedAt: NOW,
      connectedBus: null,
      ratedKw: 100, // user typed kW into the HP slot or vice versa
      ratedHp: 100,
      ratedVoltageV: 400,
      flaSource: "calculated",
      startingMethod: "DOL",
      status: "in_service",
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-EQ-004")).toBe(true);
  });

  it("stays silent when only one of kW/HP is entered", () => {
    const project = emptyProject();
    project.equipment.motors.push({
      internalId: "eq_motor_1",
      tag: "M-001",
      kind: "motor",
      createdAt: NOW,
      updatedAt: NOW,
      connectedBus: null,
      ratedKw: 75,
      ratedHp: null,
      ratedVoltageV: 400,
      flaSource: "calculated",
      startingMethod: "DOL",
      status: "in_service",
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-EQ-004")).toBe(false);
  });
});
