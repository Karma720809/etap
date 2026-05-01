import { describe, expect, it } from "vitest";
import {
  createEquipment,
  type EquipmentKind,
  PowerSystemProjectFileSchema,
} from "../src/index.js";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";

const NOW = "2026-05-01T00:00:00+00:00";

function emptyProject(): PowerSystemProjectFile {
  return {
    schemaVersion: "1.0.0",
    appVersion: "0.0.0-test",
    project: {
      projectId: "PJT-T",
      projectName: "T",
      standard: "IEC",
      frequencyHz: 60,
      createdAt: NOW,
      updatedAt: NOW,
    },
    equipment: {
      utilities: [],
      generators: [],
      buses: [],
      transformers: [],
      cables: [],
      breakers: [],
      switches: [],
      loads: [],
      motors: [],
      placeholders: [],
    },
    diagram: { nodes: [], edges: [] },
    scenarios: [],
    calculationSnapshots: [],
    tagCounters: {},
  };
}

const ALL_KINDS: EquipmentKind[] = [
  "utility", "generator", "bus", "transformer", "cable",
  "breaker", "switch", "load", "motor", "mcc_placeholder", "switchgear_placeholder",
];

describe("createEquipment factory", () => {
  it.each(ALL_KINDS)("creates a %s with internalId, suggested tag, and schema-valid record", (kind) => {
    const start = emptyProject();
    const { project, internalId, tag } = createEquipment(start, kind, { now: NOW });

    expect(internalId).toMatch(/^eq_/);
    expect(tag).toMatch(/^[A-Z]+-\d{3}$/);
    expect(start).not.toBe(project);

    const parsed = PowerSystemProjectFileSchema.safeParse(project);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error?.issues, null, 2)).toBe(true);
  });

  it("transformer is added to equipment.transformers AND the diagram nodes (never as an edge)", () => {
    const { project, internalId } = createEquipment(emptyProject(), "transformer", { now: NOW });
    expect(project.equipment.transformers).toHaveLength(1);
    expect(project.equipment.transformers[0]!.internalId).toBe(internalId);
    expect(project.diagram.nodes).toHaveLength(1);
    expect(project.diagram.nodes[0]!.kind).toBe("transformer");
    expect(project.diagram.nodes[0]!.equipmentInternalId).toBe(internalId);
    expect(project.diagram.edges).toHaveLength(0);
  });

  it("branch-only equipment (cable, breaker, switch) does NOT auto-create a diagram node", () => {
    let p = emptyProject();
    for (const kind of ["cable", "breaker", "switch"] as EquipmentKind[]) {
      p = createEquipment(p, kind, { now: NOW }).project;
    }
    expect(p.diagram.nodes).toHaveLength(0);
    expect(p.diagram.edges).toHaveLength(0);
    expect(p.equipment.cables).toHaveLength(1);
    expect(p.equipment.breakers).toHaveLength(1);
    expect(p.equipment.switches).toHaveLength(1);
  });

  it("connection edges are not introduced for connection-style equipment (palette PR #2 leaves wiring to the user)", () => {
    let p = emptyProject();
    p = createEquipment(p, "utility", { now: NOW }).project;
    p = createEquipment(p, "bus", { now: NOW }).project;
    p = createEquipment(p, "motor", { now: NOW }).project;
    expect(p.diagram.edges).toHaveLength(0);
  });

  it("monotonically increments tag counters and never reuses numbers", () => {
    let p = emptyProject();
    const r1 = createEquipment(p, "bus", { now: NOW });
    p = r1.project;
    const r2 = createEquipment(p, "bus", { now: NOW });
    p = r2.project;
    const r3 = createEquipment(p, "bus", { now: NOW });
    p = r3.project;

    expect(r1.tag).toBe("BUS-001");
    expect(r2.tag).toBe("BUS-002");
    expect(r3.tag).toBe("BUS-003");
    expect(p.tagCounters.BUS).toBe(3);
  });

  it("internalIds are unique and use canonical eq_<token>_NNN form", () => {
    let p = emptyProject();
    const ids = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const r = createEquipment(p, "bus", { now: NOW });
      ids.add(r.internalId);
      p = r.project;
    }
    expect(ids.size).toBe(5);
    for (const id of ids) expect(id).toMatch(/^eq_bus_\d{3}$/);
  });

  it("placeholder kinds populate equipment.placeholders, not other collections", () => {
    const r = createEquipment(emptyProject(), "mcc_placeholder", { now: NOW });
    expect(r.project.equipment.placeholders).toHaveLength(1);
    expect(r.project.equipment.placeholders![0]!.kind).toBe("mcc_placeholder");
    expect(r.project.equipment.placeholders![0]!.containedBusIds).toEqual([]);
  });

  it("default utility status is in_service so freshly added grid sources don't immediately trigger E-NET-001", () => {
    const r = createEquipment(emptyProject(), "utility", { now: NOW });
    expect(r.project.equipment.utilities[0]!.status).toBe("in_service");
  });
});
