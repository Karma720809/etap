import { describe, expect, it } from "vitest";
import { validateProject } from "../src/index.js";
import { emptyProject } from "./test-builders.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("I-EQ-001 draft incomplete fields", () => {
  it("a freshly created bus with vnKv=null emits I-EQ-001 (info), not E-EQ-001 (error)", () => {
    const project = emptyProject();
    project.equipment.buses.push({
      internalId: "eq_bus_draft",
      tag: "BUS-DRAFT",
      kind: "bus",
      createdAt: NOW,
      updatedAt: NOW,
      vnKv: null,
      voltageType: "AC",
      topology: "3P4W",
      minVoltagePct: null,
      maxVoltagePct: null,
    });

    const result = validateProject(project);
    const drafts = result.issues.filter((i) => i.code === "I-EQ-001");
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    expect(drafts.every((i) => i.severity === "info")).toBe(true);
    // Stage 1 must NOT escalate to E-EQ-001 from draft state.
    expect(result.issues.some((i) => i.code.startsWith("E-EQ-"))).toBe(false);
  });
});
