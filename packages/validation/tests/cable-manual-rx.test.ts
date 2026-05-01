import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("W-CBL-001 — cable manual R/X audit hint", () => {
  it("fires when cable has rOhmPerKm or xOhmPerKm entered", () => {
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
      lengthM: 10,
      rOhmPerKm: 0.0754,
      xOhmPerKm: 0.08,
      status: "in_service",
    });
    const result = validateProject(project);
    const issues = result.issues.filter((i) => i.code === "W-CBL-001");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("warning");
  });

  it("stays silent when neither R nor X is entered", () => {
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
      lengthM: 10,
      status: "in_service",
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "W-CBL-001")).toBe(false);
  });
});
