import { describe, expect, it } from "vitest";
import { PowerSystemProjectFileSchema } from "@power-system-study/schemas";

const NOW = "2026-05-01T00:00:00+00:00";

const baseValidProject = {
  schemaVersion: "1.0.0",
  appVersion: "0.1.0-test",
  project: {
    projectId: "PJT",
    projectName: "P",
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
  },
  diagram: { nodes: [], edges: [] },
  scenarios: [],
  tagCounters: {},
};

describe("strict-mode rejects forbidden top-level keys", () => {
  it("calculationResults is not accepted as a top-level project file key", () => {
    const projectShape = {
      ...baseValidProject,
      calculationResults: { whatever: true },
    };
    const parse = PowerSystemProjectFileSchema.safeParse(projectShape);
    expect(parse.success).toBe(false);
  });

  it("an empty calculationSnapshots array is accepted (reserved Stage 1 placeholder)", () => {
    const projectShape = {
      ...baseValidProject,
      calculationSnapshots: [],
    };
    const parse = PowerSystemProjectFileSchema.safeParse(projectShape);
    expect(parse.success).toBe(true);
  });

  it("a non-empty calculationSnapshots array is rejected in Stage 1", () => {
    const projectShape = {
      ...baseValidProject,
      calculationSnapshots: [
        {
          snapshotId: "snap-1",
          createdAt: NOW,
          module: "load_flow",
          status: "placeholder_reserved",
        },
      ],
    };
    const parse = PowerSystemProjectFileSchema.safeParse(projectShape);
    expect(parse.success).toBe(false);
  });
});
