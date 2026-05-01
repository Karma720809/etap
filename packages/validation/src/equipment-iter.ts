import type { EquipmentCollections, PowerSystemProjectFile } from "@power-system-study/schemas";

// A union of every equipment record present in the project (lite type).
// We deliberately do NOT re-derive a giant union from z.infer here; tests just
// need iteration with internalId/tag/kind. Other fields are accessed via
// per-collection helpers below.
export interface AnyEquipmentLite {
  internalId: string;
  tag: string;
  kind: string;
}

export function iterateAllEquipment(eq: EquipmentCollections): AnyEquipmentLite[] {
  return [
    ...eq.utilities,
    ...eq.generators,
    ...eq.buses,
    ...eq.transformers,
    ...eq.cables,
    ...eq.breakers,
    ...eq.switches,
    ...eq.loads,
    ...eq.motors,
    ...(eq.placeholders ?? []),
  ];
}

export function isProjectEmpty(project: PowerSystemProjectFile): boolean {
  const eq = project.equipment;
  const equipmentTotal =
    eq.utilities.length +
    eq.generators.length +
    eq.buses.length +
    eq.transformers.length +
    eq.cables.length +
    eq.breakers.length +
    eq.switches.length +
    eq.loads.length +
    eq.motors.length +
    (eq.placeholders?.length ?? 0);
  return equipmentTotal === 0;
}

export function hasInServiceSource(project: PowerSystemProjectFile): boolean {
  const inServiceUtility = project.equipment.utilities.some((u) => u.status === "in_service");
  const inServiceGenerator = project.equipment.generators.some((g) => g.status === "in_service");
  return inServiceUtility || inServiceGenerator;
}
