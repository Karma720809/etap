import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("W-ID-001 duplicate tag", () => {
  it("flags duplicate tags as warning, not error", () => {
    const project = emptyProject();
    project.equipment.buses.push(
      {
        internalId: "eq_bus_001",
        tag: "BUS-DUPLICATE",
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
        internalId: "eq_bus_002",
        tag: "BUS-DUPLICATE",
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
    const dupTagIssues = result.issues.filter((i) => i.code === "W-ID-001");
    expect(dupTagIssues.length).toBeGreaterThanOrEqual(1);
    expect(dupTagIssues.every((i) => i.severity === "warning")).toBe(true);
  });

  it("user-edited sub-prefix tags are not flagged unless duplicated", () => {
    const project = emptyProject();
    project.equipment.buses.push(
      {
        internalId: "eq_bus_mv",
        tag: "BUS-MV-001",
        kind: "bus",
        createdAt: NOW,
        updatedAt: NOW,
        vnKv: 6.6,
        voltageType: "AC",
        topology: "3P3W",
        minVoltagePct: 95,
        maxVoltagePct: 105,
      },
      {
        internalId: "eq_bus_lv",
        tag: "BUS-LV-001",
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
    // Diagram nodes for the buses (otherwise we'd hit other rules' noise; we only care about W-ID-001 here).
    project.diagram.nodes.push(
      { id: "n1", equipmentInternalId: "eq_bus_mv", kind: "bus", position: { x: 0, y: 0 } },
      { id: "n2", equipmentInternalId: "eq_bus_lv", kind: "bus", position: { x: 200, y: 0 } },
    );

    const result = validateProject(project);
    const dupTagIssues = result.issues.filter((i) => i.code === "W-ID-001");
    expect(dupTagIssues).toHaveLength(0);
  });
});
