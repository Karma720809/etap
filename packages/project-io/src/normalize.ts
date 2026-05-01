import type { PowerSystemProjectFile } from "@power-system-study/schemas";

// Stable string compare for sort. Equipment internalIds and node/edge IDs are strings.
function byString<T>(key: (item: T) => string) {
  return (a: T, b: T) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}

// Returns a deep-cloned project with deterministic collection ordering.
// Equipment arrays are sorted by internalId. Diagram nodes/edges by id.
// Scenarios by scenarioId. calculationSnapshots by snapshotId. validation.issues
// by (code, equipmentInternalId).
//
// IMPORTANT: branchEquipmentInternalIds preserves upstream→downstream order
// and is NEVER reordered.
export function normalizeProjectFile(project: PowerSystemProjectFile): PowerSystemProjectFile {
  // Structured deep clone via JSON round-trip. The schema only allows
  // JSON-serializable values, so this is safe and avoids any lib dependency.
  const cloned = JSON.parse(JSON.stringify(project)) as PowerSystemProjectFile;

  const eq = cloned.equipment;
  eq.utilities.sort(byString((u) => u.internalId));
  eq.generators.sort(byString((g) => g.internalId));
  eq.buses.sort(byString((b) => b.internalId));
  eq.transformers.sort(byString((t) => t.internalId));
  eq.cables.sort(byString((c) => c.internalId));
  eq.breakers.sort(byString((br) => br.internalId));
  eq.switches.sort(byString((s) => s.internalId));
  eq.loads.sort(byString((l) => l.internalId));
  eq.motors.sort(byString((m) => m.internalId));
  if (eq.placeholders) {
    eq.placeholders.sort(byString((p) => p.internalId));
  }

  cloned.diagram.nodes.sort(byString((n) => n.id));
  cloned.diagram.edges.sort(byString((e) => e.id));

  cloned.scenarios.sort(byString((s) => s.scenarioId));

  if (cloned.calculationSnapshots) {
    cloned.calculationSnapshots.sort(byString((s) => s.snapshotId));
  }

  if (cloned.validation) {
    cloned.validation.issues.sort((a, b) => {
      const ck = a.code.localeCompare(b.code);
      if (ck !== 0) return ck;
      const ai = a.equipmentInternalId ?? "";
      const bi = b.equipmentInternalId ?? "";
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });
  }

  return cloned;
}
