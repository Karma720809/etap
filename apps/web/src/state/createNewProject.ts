import type { PowerSystemProjectFile } from "@power-system-study/schemas";

const APP_VERSION = "0.2.0-stage1-pr2";

export interface NewProjectOptions {
  projectId?: string;
  projectName?: string;
  now?: string;
}

// Builds an empty Stage 1 Rev D project file. The schema requires non-empty
// projectId/projectName, ISO timestamps, and the documented top-level keys.
export function createNewProject(options: NewProjectOptions = {}): PowerSystemProjectFile {
  const now = options.now ?? new Date().toISOString();
  return {
    schemaVersion: "1.0.0",
    appVersion: APP_VERSION,
    project: {
      projectId: options.projectId ?? "PJT-NEW",
      projectName: options.projectName ?? "Untitled Power Study",
      standard: "IEC",
      frequencyHz: 60,
      defaultVoltageLevelsKv: [6.6, 0.4],
      defaultAmbientTempC: 40,
      createdAt: now,
      updatedAt: now,
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
    diagram: {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    scenarios: [],
    calculationSnapshots: [],
    tagCounters: {},
  };
}
