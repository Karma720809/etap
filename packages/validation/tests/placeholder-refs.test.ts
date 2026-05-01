import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { projectWithBus } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("E-DIA-003 placeholder containedBusIds reference check", () => {
  it("flags a placeholder whose containedBusIds points at a non-existent bus", () => {
    const project = projectWithBus("eq_bus_001");
    project.equipment.placeholders!.push({
      internalId: "eq_mcc_001",
      tag: "MCC-001",
      kind: "mcc_placeholder",
      createdAt: NOW,
      updatedAt: NOW,
      containedBusIds: ["eq_bus_001", "eq_bus_does_not_exist"],
    });

    const result = validateProject(project);
    const dia003 = result.issues.filter((i) => i.code === "E-DIA-003");
    expect(dia003).toHaveLength(1);
    expect(dia003[0]!.message).toContain("eq_bus_does_not_exist");
  });

  it("does not flag when all containedBusIds reference existing buses", () => {
    const project = projectWithBus("eq_bus_001");
    project.equipment.placeholders!.push({
      internalId: "eq_swgr_001",
      tag: "SWGR-001",
      kind: "switchgear_placeholder",
      createdAt: NOW,
      updatedAt: NOW,
      containedBusIds: ["eq_bus_001"],
    });

    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-DIA-003")).toBe(false);
  });
});
