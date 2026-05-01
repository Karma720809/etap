import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("W-EQ-002 — non-3P topology", () => {
  it("fires for a 1P2W bus and stays silent for 3P3W / 3P4W", () => {
    const project = emptyProject();
    project.equipment.buses.push({
      internalId: "eq_bus_3p4w",
      tag: "BUS-3P4W",
      kind: "bus",
      createdAt: NOW,
      updatedAt: NOW,
      vnKv: 0.4,
      voltageType: "AC",
      topology: "3P4W",
      minVoltagePct: 95,
      maxVoltagePct: 105,
    });
    project.equipment.buses.push({
      internalId: "eq_bus_1p2w",
      tag: "BUS-1P2W",
      kind: "bus",
      createdAt: NOW,
      updatedAt: NOW,
      vnKv: 0.23,
      voltageType: "AC",
      topology: "1P2W",
      minVoltagePct: 95,
      maxVoltagePct: 105,
    });
    const result = validateProject(project);
    const heaters = result.issues.filter((i) => i.code === "W-EQ-002");
    expect(heaters).toHaveLength(1);
    expect(heaters[0]!.equipmentInternalId).toBe("eq_bus_1p2w");
    expect(heaters[0]!.severity).toBe("warning");
  });
});
