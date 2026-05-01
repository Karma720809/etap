import { useMemo } from "react";
import type { EquipmentKind } from "@power-system-study/core-model";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import { useProjectState } from "../state/projectStore.js";

// Stage 1 PR #3 left-sidebar Project Tree (Spec §9.2). Equipment is grouped by
// kind into the buckets the spec calls out (Sources covers utility+generator,
// Placeholders covers MCC + SWGR). Selecting a leaf dispatches selectEquipment
// so the right-side property panel and the diagram both update.

interface TreeRow {
  internalId: string;
  tag: string;
  name?: string | null;
}

interface TreeGroup {
  id: string;
  label: string;
  rows: TreeRow[];
}

const styles = {
  wrapper: { display: "flex", flexDirection: "column" as const, gap: 8 },
  heading: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "#475569", margin: 0 },
  group: { display: "flex", flexDirection: "column" as const, gap: 2 },
  groupLabel: { fontSize: 11, color: "#1e293b", fontWeight: 600, padding: "4px 0", borderBottom: "1px solid #e2e8f0" },
  empty: { fontSize: 11, color: "#94a3b8", padding: "2px 8px" },
  row: (selected: boolean) => ({
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 3,
    cursor: "pointer",
    background: selected ? "#dbeafe" : "transparent",
    color: selected ? "#1e3a8a" : "#0f172a",
    border: selected ? "1px solid #93c5fd" : "1px solid transparent",
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  }),
  rowMeta: { fontSize: 10, color: "#64748b", fontFamily: "ui-monospace, SFMono-Regular, monospace" },
};

function buildGroups(project: PowerSystemProjectFile): TreeGroup[] {
  const eq = project.equipment;
  const sourceRows = [
    ...eq.utilities.map((u) => ({ internalId: u.internalId, tag: u.tag, name: u.name ?? null, kind: "utility" as EquipmentKind })),
    ...eq.generators.map((g) => ({ internalId: g.internalId, tag: g.tag, name: g.name ?? null, kind: "generator" as EquipmentKind })),
  ];
  const placeholderRows = (eq.placeholders ?? []).map((p) => ({
    internalId: p.internalId,
    tag: p.tag,
    name: p.name ?? null,
  }));
  return [
    { id: "sources", label: `Sources (${sourceRows.length})`, rows: sourceRows },
    { id: "buses", label: `Buses (${eq.buses.length})`, rows: eq.buses.map((b) => ({ internalId: b.internalId, tag: b.tag, name: b.name ?? null })) },
    { id: "transformers", label: `Transformers (${eq.transformers.length})`, rows: eq.transformers.map((t) => ({ internalId: t.internalId, tag: t.tag, name: t.name ?? null })) },
    { id: "cables", label: `Cables (${eq.cables.length})`, rows: eq.cables.map((c) => ({ internalId: c.internalId, tag: c.tag, name: c.name ?? null })) },
    { id: "breakers", label: `Breakers / Protective Devices (${eq.breakers.length})`, rows: eq.breakers.map((br) => ({ internalId: br.internalId, tag: br.tag, name: br.name ?? null })) },
    { id: "switches", label: `Switches (${eq.switches.length})`, rows: eq.switches.map((sw) => ({ internalId: sw.internalId, tag: sw.tag, name: sw.name ?? null })) },
    { id: "loads", label: `Loads (${eq.loads.length})`, rows: eq.loads.map((l) => ({ internalId: l.internalId, tag: l.tag, name: l.name ?? null })) },
    { id: "motors", label: `Motors (${eq.motors.length})`, rows: eq.motors.map((m) => ({ internalId: m.internalId, tag: m.tag, name: m.name ?? null })) },
    { id: "placeholders", label: `Placeholders (${placeholderRows.length})`, rows: placeholderRows },
  ];
}

export function ProjectTree() {
  const { state, dispatch } = useProjectState();
  const groups = useMemo(() => buildGroups(state.project), [state.project]);

  const totalEquipment = useMemo(
    () => groups.reduce((acc, g) => acc + g.rows.length, 0),
    [groups],
  );

  return (
    <div style={styles.wrapper} data-testid="project-tree">
      <h2 style={styles.heading}>Project Tree</h2>
      {totalEquipment === 0 ? (
        <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
          No equipment yet. Switch to the Palette tab to add Stage 1 equipment.
        </p>
      ) : null}
      {groups.map((group) => (
        <div key={group.id} style={styles.group} data-testid={`tree-group-${group.id}`}>
          <span style={styles.groupLabel}>{group.label}</span>
          {group.rows.length === 0 ? (
            <span style={styles.empty}>—</span>
          ) : (
            group.rows.map((row) => {
              const selected = state.selectedInternalId === row.internalId;
              return (
                <div
                  key={row.internalId}
                  role="button"
                  tabIndex={0}
                  style={styles.row(selected)}
                  onClick={() => dispatch({ type: "selectEquipment", internalId: row.internalId })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      dispatch({ type: "selectEquipment", internalId: row.internalId });
                    }
                  }}
                  data-testid={`tree-item-${row.internalId}`}
                >
                  <span>{row.tag}{row.name ? ` — ${row.name}` : ""}</span>
                  <span style={styles.rowMeta}>{row.internalId}</span>
                </div>
              );
            })
          )}
        </div>
      ))}
    </div>
  );
}
