import { useMemo } from "react";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import { useProjectState } from "../state/projectStore.js";
import { BusForm, GeneratorForm, GenericPlaceholderForm, MotorForm, TransformerForm, UtilityForm } from "./forms/Forms.js";

const styles = {
  wrapper: { display: "flex", flexDirection: "column" as const, gap: 12 },
  heading: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "#475569", margin: "0 0 6px" },
  empty: { color: "#64748b", fontSize: 13 },
};

function findEquipment(project: PowerSystemProjectFile, internalId: string) {
  const eq = project.equipment;
  return (
    eq.utilities.find((x) => x.internalId === internalId) ??
    eq.generators.find((x) => x.internalId === internalId) ??
    eq.buses.find((x) => x.internalId === internalId) ??
    eq.transformers.find((x) => x.internalId === internalId) ??
    eq.cables.find((x) => x.internalId === internalId) ??
    eq.breakers.find((x) => x.internalId === internalId) ??
    eq.switches.find((x) => x.internalId === internalId) ??
    eq.loads.find((x) => x.internalId === internalId) ??
    eq.motors.find((x) => x.internalId === internalId) ??
    (eq.placeholders ?? []).find((x) => x.internalId === internalId) ??
    null
  );
}

export function PropertyPanel() {
  const { state, dispatch } = useProjectState();
  const buses = useMemo(
    () => state.project.equipment.buses.map((b) => ({ internalId: b.internalId, tag: b.tag })),
    [state.project.equipment.buses],
  );

  if (!state.selectedInternalId) {
    return (
      <div style={styles.wrapper}>
        <h2 style={styles.heading}>Properties</h2>
        <p style={styles.empty}>Select an equipment item from the diagram or palette to edit it.</p>
      </div>
    );
  }

  const equipment = findEquipment(state.project, state.selectedInternalId);
  if (!equipment) {
    return (
      <div style={styles.wrapper}>
        <h2 style={styles.heading}>Properties</h2>
        <p style={styles.empty}>Selected equipment is no longer present.</p>
      </div>
    );
  }

  const internalId = equipment.internalId;
  const onPatch = (patch: Record<string, unknown>) => dispatch({ type: "updateEquipment", internalId, patch });

  let body;
  switch (equipment.kind) {
    case "bus":
      body = <BusForm value={equipment} buses={buses} onPatch={onPatch} />;
      break;
    case "utility":
      body = <UtilityForm value={equipment} buses={buses} onPatch={onPatch} />;
      break;
    case "transformer":
      body = <TransformerForm value={equipment} buses={buses} onPatch={onPatch} />;
      break;
    case "motor":
      body = <MotorForm value={equipment} buses={buses} onPatch={onPatch} />;
      break;
    case "generator":
      body = <GeneratorForm value={equipment} buses={buses} onPatch={onPatch} />;
      break;
    default:
      body = <GenericPlaceholderForm value={equipment} onPatch={onPatch} />;
  }

  return (
    <div style={styles.wrapper}>
      <h2 style={styles.heading}>Properties — {equipment.tag}</h2>
      {body}
    </div>
  );
}
