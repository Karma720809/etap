import type { EquipmentKind } from "@power-system-study/core-model";
import { useProjectState } from "../state/projectStore.js";

interface PaletteItem {
  kind: EquipmentKind;
  label: string;
  hint?: string;
}

const ITEMS: PaletteItem[] = [
  { kind: "utility", label: "Utility / Grid Source" },
  { kind: "generator", label: "Generator" },
  { kind: "bus", label: "Bus" },
  { kind: "transformer", label: "Transformer", hint: "rendered as node" },
  { kind: "cable", label: "Cable", hint: "branch element" },
  { kind: "breaker", label: "Breaker", hint: "branch element" },
  { kind: "switch", label: "Switch", hint: "branch element" },
  { kind: "load", label: "Load" },
  { kind: "motor", label: "Motor" },
  { kind: "mcc_placeholder", label: "MCC Placeholder" },
  { kind: "switchgear_placeholder", label: "Switchgear Placeholder" },
];

const styles = {
  wrapper: { display: "flex", flexDirection: "column" as const, gap: 4 },
  heading: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "#475569", margin: "0 0 6px" },
  button: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 4,
    background: "white",
    cursor: "pointer",
    fontSize: 13,
    textAlign: "left" as const,
  },
  hint: { fontSize: 11, color: "#64748b", marginTop: 2 },
};

export function EquipmentPalette() {
  const { dispatch } = useProjectState();
  return (
    <div style={styles.wrapper}>
      <h2 style={styles.heading}>Equipment Palette</h2>
      {ITEMS.map((item) => (
        <button
          key={item.kind}
          type="button"
          style={styles.button}
          onClick={() => dispatch({ type: "addEquipment", kind: item.kind })}
          data-testid={`palette-${item.kind}`}
        >
          <span>{item.label}</span>
          {item.hint ? <span style={styles.hint}>{item.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}
