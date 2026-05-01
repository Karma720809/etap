import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject } from "./test-builders.js";

describe("E-ID-001 duplicate internalId", () => {
  it("flags two buses sharing the same internalId", () => {
    const project = emptyProject();
    const NOW = "2026-05-01T00:00:00+00:00";
    project.equipment.buses.push(
      {
        internalId: "eq_bus_dup",
        tag: "BUS-001",
        kind: "bus",
        createdAt: NOW,
        updatedAt: NOW,
        vnKv: 0.4,
        voltageType: "AC",
        topology: "3P4W",
        minVoltagePct: 95,
        maxVoltagePct: 105,
      },
      {
        internalId: "eq_bus_dup",
        tag: "BUS-002",
        kind: "bus",
        createdAt: NOW,
        updatedAt: NOW,
        vnKv: 0.4,
        voltageType: "AC",
        topology: "3P4W",
        minVoltagePct: 95,
        maxVoltagePct: 105,
      },
    );

    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-ID-001")).toBe(true);
    expect(result.status).toBe("error");
  });
});
