import type { PowerSystemProjectFile } from "@power-system-study/schemas";

const NOW = "2026-05-01T00:00:00+00:00";

export function emptyProject(): PowerSystemProjectFile {
  return {
    schemaVersion: "1.0.0",
    appVersion: "0.1.0-test",
    project: {
      projectId: "PJT-TEST",
      projectName: "Test Project",
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

export function projectWithBus(busId: string, tag = "BUS-001"): PowerSystemProjectFile {
  const project = emptyProject();
  project.equipment.buses.push({
    internalId: busId,
    tag,
    kind: "bus",
    createdAt: NOW,
    updatedAt: NOW,
    vnKv: 0.4,
    voltageType: "AC",
    topology: "3P4W",
    minVoltagePct: 95,
    maxVoltagePct: 105,
  });
  project.diagram.nodes.push({
    id: `node_${busId}`,
    equipmentInternalId: busId,
    kind: "bus",
    position: { x: 0, y: 0 },
  });
  return project;
}
