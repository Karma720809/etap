import { describe, expect, it } from "vitest";
import { loadProjectFile } from "../src/index.js";

describe("loadProjectFile warnings & errors visibility", () => {
  it("invalid JSON returns a schemaError and no project", () => {
    const result = loadProjectFile("{not json");
    expect(result.project).toBeUndefined();
    expect(result.schemaErrors).toBeDefined();
    expect(result.schemaErrors!.length).toBeGreaterThan(0);
    expect(result.schemaErrors![0]).toMatch(/Invalid JSON project file/);
  });

  it("non-object root returns a schemaError", () => {
    const result = loadProjectFile("[]");
    expect(result.project).toBeUndefined();
    expect(result.schemaErrors).toBeDefined();
    expect(result.schemaErrors![0]).toMatch(/root must be a JSON object/);
  });

  it("unknown top-level key produces a schema warning AND a strict-validation error (both surfaced)", () => {
    const projectWithExtraKey = {
      schemaVersion: "1.0.0",
      appVersion: "1.0.0-stage1",
      project: {
        projectId: "P1",
        projectName: "Test",
        standard: "IEC",
        frequencyHz: 60,
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z",
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
      },
      diagram: { nodes: [], edges: [] },
      scenarios: [],
      tagCounters: {},
      // Extra unknown key the schema must reject (and that the loader must warn about):
      unknownExtraKey: { something: "weird" },
    };

    const result = loadProjectFile(JSON.stringify(projectWithExtraKey));

    expect(result.schemaWarnings.some((w) => w.includes("unknownExtraKey"))).toBe(true);
    expect(result.schemaErrors).toBeDefined();
    expect(result.schemaErrors!.length).toBeGreaterThan(0);
  });

  it("schemaVersion mismatch is reported as a warning", () => {
    const result = loadProjectFile(JSON.stringify({
      schemaVersion: "0.9.0",
      appVersion: "x",
      project: {},
      equipment: {},
      diagram: {},
      scenarios: [],
      tagCounters: {},
    }));

    expect(result.schemaWarnings.some((w) => w.includes("schemaVersion"))).toBe(true);
  });
});
