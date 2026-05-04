import { describe, expect, it } from "vitest";
import { getDemoFixture } from "@power-system-study/fixtures";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import { loadProjectFile, serializeProjectFile } from "../src/index.js";

// Stage 3 ED-PR-01 — project-file round-trip behaviour for the optional
// Equipment Duty rating fields added to the Stage 1 canonical schema.
//
// Three guarantees under test:
//   1. The unchanged demo fixture (no duty fields) still load → serialize → load
//      cleanly, proving backward compatibility.
//   2. A project carrying duty fields round-trips load → serialize → load with
//      every numeric value preserved.
//   3. An equipment record that omits the duty fields after the round trip
//      still omits them (no spurious null injection).

function withDutyRatings(input: PowerSystemProjectFile): PowerSystemProjectFile {
  // Deep clone so the source fixture is not mutated — getDemoFixture already
  // clones, but we double-clone here to be explicit about test independence.
  const project = JSON.parse(JSON.stringify(input)) as PowerSystemProjectFile;

  project.project.shortCircuit = { defaultFaultClearingS: 0.5 };

  for (const bus of project.equipment.buses) {
    bus.shortTimeWithstandKa = 50;
    bus.shortTimeWithstandDurationS = 1;
    bus.peakWithstandKa = 105;
  }

  for (const cable of project.equipment.cables) {
    cable.shortCircuitKValue = 143;
  }

  for (const breaker of project.equipment.breakers) {
    breaker.interruptingCapacityKa = 50;
    breaker.peakWithstandKa = 105;
  }

  for (const sw of project.equipment.switches) {
    sw.shortTimeWithstandKa = 25;
    sw.shortTimeWithstandDurationS = 1;
    sw.peakWithstandKa = 52.5;
  }

  return project;
}

describe("ED-PR-01 round-trip behaviour for Equipment Duty rating fields", () => {
  it("existing demo fixture (no duty fields) still loads, serializes, and re-loads cleanly", () => {
    const fixture = getDemoFixture();
    const serialized = serializeProjectFile(fixture);
    const loaded = loadProjectFile(serialized);

    expect(loaded.schemaErrors).toBeUndefined();
    expect(loaded.project).toBeDefined();

    for (const bus of loaded.project!.equipment.buses) {
      expect(bus.shortTimeWithstandKa).toBeUndefined();
      expect(bus.shortTimeWithstandDurationS).toBeUndefined();
      expect(bus.peakWithstandKa).toBeUndefined();
    }
    for (const cable of loaded.project!.equipment.cables) {
      expect(cable.shortCircuitKValue).toBeUndefined();
    }
    for (const breaker of loaded.project!.equipment.breakers) {
      expect(breaker.interruptingCapacityKa).toBeUndefined();
      expect(breaker.peakWithstandKa).toBeUndefined();
    }
    expect(loaded.project!.project.shortCircuit).toBeUndefined();
  });

  it("populated duty fields survive load → serialize → load and remain byte-stable on repeat", () => {
    const populated = withDutyRatings(getDemoFixture());

    const firstSerialized = serializeProjectFile(populated);
    const firstLoaded = loadProjectFile(firstSerialized);
    expect(firstLoaded.schemaErrors).toBeUndefined();
    const firstProject = firstLoaded.project!;

    expect(firstProject.project.shortCircuit?.defaultFaultClearingS).toBe(0.5);

    for (const bus of firstProject.equipment.buses) {
      expect(bus.shortTimeWithstandKa).toBe(50);
      expect(bus.shortTimeWithstandDurationS).toBe(1);
      expect(bus.peakWithstandKa).toBe(105);
    }
    for (const cable of firstProject.equipment.cables) {
      expect(cable.shortCircuitKValue).toBe(143);
    }
    for (const breaker of firstProject.equipment.breakers) {
      expect(breaker.interruptingCapacityKa).toBe(50);
      expect(breaker.peakWithstandKa).toBe(105);
    }

    const secondSerialized = serializeProjectFile(firstProject);
    expect(secondSerialized).toBe(firstSerialized);

    const thirdSerialized = serializeProjectFile(loadProjectFile(secondSerialized).project!);
    expect(thirdSerialized).toBe(firstSerialized);
  });

  it("a project with duty fields populated on some equipment but not others preserves the absence", () => {
    const project = getDemoFixture();
    const targetBus = project.equipment.buses[0];
    if (!targetBus) {
      throw new Error("demo fixture must contain at least one bus for this test");
    }
    const targetBusId = targetBus.internalId;
    targetBus.shortTimeWithstandKa = 50;
    // intentionally leave shortTimeWithstandDurationS and peakWithstandKa absent

    const serialized = serializeProjectFile(project);
    const reloaded = loadProjectFile(serialized).project!;

    const reloadedTarget = reloaded.equipment.buses.find((b) => b.internalId === targetBusId);
    expect(reloadedTarget).toBeDefined();
    expect(reloadedTarget!.shortTimeWithstandKa).toBe(50);
    expect(reloadedTarget!.shortTimeWithstandDurationS).toBeUndefined();
    expect(reloadedTarget!.peakWithstandKa).toBeUndefined();

    // Other buses must remain free of duty fields.
    for (const bus of reloaded.equipment.buses) {
      if (bus.internalId === targetBusId) continue;
      expect(bus.shortTimeWithstandKa).toBeUndefined();
      expect(bus.shortTimeWithstandDurationS).toBeUndefined();
      expect(bus.peakWithstandKa).toBeUndefined();
    }
  });

  it("rejects a non-positive duty value at the schema boundary on save", () => {
    const project = getDemoFixture();
    if (project.equipment.cables.length === 0) {
      throw new Error("demo fixture must contain at least one cable for this test");
    }
    project.equipment.cables[0].shortCircuitKValue = 0;
    expect(() => serializeProjectFile(project)).toThrow();
  });

  it("rejects a null duty value at the schema boundary on save", () => {
    const project = getDemoFixture();
    if (project.equipment.breakers.length === 0) {
      throw new Error("demo fixture must contain at least one breaker for this test");
    }
    (project.equipment.breakers[0] as unknown as Record<string, unknown>).interruptingCapacityKa = null;
    expect(() => serializeProjectFile(project)).toThrow();
  });
});
