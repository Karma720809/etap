import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject, projectWithBus } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("connectivity rules", () => {
  it("I-NET-001 — empty project produces info, NOT a hard E-NET-001 error", () => {
    const project = emptyProject();
    const result = validateProject(project);

    expect(result.issues.some((i) => i.code === "I-NET-001")).toBe(true);
    expect(result.issues.some((i) => i.code === "E-NET-001")).toBe(false);
    expect(result.status).not.toBe("error");
  });

  it("E-NET-001 — non-empty model with no in-service source raises an error", () => {
    const project = projectWithBus("eq_bus_001");
    const result = validateProject(project);

    expect(result.issues.some((i) => i.code === "E-NET-001")).toBe(true);
    expect(result.issues.some((i) => i.code === "I-NET-001")).toBe(false);
  });

  it("E-NET-003 — equipment references a missing bus internalId", () => {
    const project = emptyProject();
    project.equipment.utilities.push({
      internalId: "eq_util_1",
      tag: "UTL-001",
      kind: "utility",
      createdAt: NOW,
      updatedAt: NOW,
      connectedBus: "eq_bus_does_not_exist",
      vnKv: 6.6,
      status: "in_service",
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-NET-003")).toBe(true);
  });

  it("E-NET-004 — diagram edge references a missing node id", () => {
    const project = projectWithBus("eq_bus_001");
    project.diagram.edges.push({
      id: "edge_dangling",
      fromNodeId: "node_eq_bus_001",
      toNodeId: "node_does_not_exist",
      kind: "connection",
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-NET-004")).toBe(true);
  });

  it("E-NET-005 — diagram node references missing equipment internalId", () => {
    const project = emptyProject();
    project.equipment.utilities.push({
      internalId: "eq_util_1",
      tag: "UTL-001",
      kind: "utility",
      createdAt: NOW,
      updatedAt: NOW,
      connectedBus: null,
      vnKv: 6.6,
      status: "in_service",
    });
    project.diagram.nodes.push({
      id: "node_dangling",
      equipmentInternalId: "eq_does_not_exist",
      kind: "bus",
      position: { x: 0, y: 0 },
    });
    const result = validateProject(project);
    expect(result.issues.some((i) => i.code === "E-NET-005")).toBe(true);
  });
});
