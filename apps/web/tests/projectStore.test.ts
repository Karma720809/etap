import { describe, expect, it } from "vitest";
import { initialAppState, projectReducer } from "../src/state/projectStore.js";
import { serializeProjectFile, loadProjectFile } from "@power-system-study/project-io";

const NOW = "2026-05-01T00:00:00+00:00";

describe("projectReducer", () => {
  it("addEquipment creates internalId + tag and selects the new item", () => {
    const before = initialAppState(NOW);
    const after = projectReducer(before, { type: "addEquipment", kind: "bus", now: NOW });

    expect(after.project.equipment.buses).toHaveLength(1);
    const created = after.project.equipment.buses[0]!;
    expect(created.internalId).toMatch(/^eq_bus_\d{3}$/);
    expect(created.tag).toBe("BUS-001");
    expect(after.selectedInternalId).toBe(created.internalId);
    expect(after.isDirty).toBe(true);
  });

  it("updateEquipment changes tag without changing internalId", () => {
    let state = initialAppState(NOW);
    state = projectReducer(state, { type: "addEquipment", kind: "bus", now: NOW });
    const created = state.project.equipment.buses[0]!;
    const originalInternalId = created.internalId;

    state = projectReducer(state, {
      type: "updateEquipment",
      internalId: originalInternalId,
      patch: { tag: "BUS-MV-001" },
      now: NOW,
    });

    const after = state.project.equipment.buses[0]!;
    expect(after.internalId).toBe(originalInternalId);
    expect(after.tag).toBe("BUS-MV-001");
  });

  it("updateEquipment refuses to overwrite internalId, kind, or createdAt", () => {
    let state = initialAppState(NOW);
    state = projectReducer(state, { type: "addEquipment", kind: "bus", now: NOW });
    const created = state.project.equipment.buses[0]!;
    const originalCreatedAt = created.createdAt;

    state = projectReducer(state, {
      type: "updateEquipment",
      internalId: created.internalId,
      patch: { internalId: "eq_bus_HIJACK", kind: "motor", createdAt: "1970-01-01T00:00:00Z", vnKv: 6.6 },
      now: NOW,
    });

    const after = state.project.equipment.buses[0]!;
    expect(after.internalId).toBe(created.internalId);
    expect(after.kind).toBe("bus");
    expect(after.createdAt).toBe(originalCreatedAt);
    expect(after.vnKv).toBe(6.6);
  });

  it("transformer creation puts the equipment in equipment.transformers AND adds a transformer diagram node", () => {
    let state = initialAppState(NOW);
    state = projectReducer(state, { type: "addEquipment", kind: "transformer", now: NOW });
    expect(state.project.equipment.transformers).toHaveLength(1);
    expect(state.project.diagram.nodes).toHaveLength(1);
    expect(state.project.diagram.nodes[0]!.kind).toBe("transformer");
    expect(state.project.diagram.edges).toHaveLength(0);
  });

  it("creating cable / breaker / switch never produces a connection or branch_chain edge in PR #2", () => {
    let state = initialAppState(NOW);
    state = projectReducer(state, { type: "addEquipment", kind: "cable", now: NOW });
    state = projectReducer(state, { type: "addEquipment", kind: "breaker", now: NOW });
    state = projectReducer(state, { type: "addEquipment", kind: "switch", now: NOW });
    expect(state.project.diagram.edges).toHaveLength(0);
    // Branch_chain policy: connection edges must NOT carry branchEquipmentInternalIds.
    // We assert no edge of any kind was implicitly created.
  });

  it("serialization remains deterministic after edits", () => {
    let state = initialAppState(NOW);
    state = projectReducer(state, { type: "addEquipment", kind: "bus", now: NOW });
    state = projectReducer(state, { type: "addEquipment", kind: "transformer", now: NOW });
    state = projectReducer(state, { type: "updateEquipment", internalId: state.project.equipment.buses[0]!.internalId, patch: { tag: "BUS-MAIN" }, now: NOW });

    const first = serializeProjectFile(state.project);
    const reloaded = loadProjectFile(first);
    expect(reloaded.schemaErrors).toBeUndefined();
    const second = serializeProjectFile(reloaded.project!);
    expect(second).toBe(first);
  });

  it("replaceProject resets selection and dirty flag", () => {
    let state = initialAppState(NOW);
    state = projectReducer(state, { type: "addEquipment", kind: "bus", now: NOW });
    expect(state.isDirty).toBe(true);

    state = projectReducer(state, { type: "replaceProject", project: initialAppState(NOW).project });
    expect(state.selectedInternalId).toBeNull();
    expect(state.isDirty).toBe(false);
  });
});
