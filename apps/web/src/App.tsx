import { useMemo, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import { getDemoFixture } from "@power-system-study/fixtures";
import { loadProjectFile, serializeProjectFile } from "@power-system-study/project-io";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";

const fontStack =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const styles = {
  shell: { fontFamily: fontStack, color: "#0d1421", padding: 16, display: "flex", flexDirection: "column" as const, gap: 16 },
  header: { display: "flex", alignItems: "baseline", gap: 12, justifyContent: "space-between" as const, flexWrap: "wrap" as const },
  badge: (color: string) => ({ background: color, color: "white", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.5 }),
  panel: { border: "1px solid #d8dee5", borderRadius: 6, padding: 12 },
  countTable: { borderCollapse: "collapse" as const, fontSize: 13 },
  td: { padding: "4px 12px 4px 0" },
  canvas: { height: 360, border: "1px solid #d8dee5", borderRadius: 6 },
  saveButton: { padding: "6px 12px", borderRadius: 4, border: "1px solid #2563eb", background: "#2563eb", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  small: { fontSize: 12, color: "#5f6c7b" },
};

function statusColor(status: string): string {
  if (status === "valid") return "#166534";
  if (status === "warning") return "#92400e";
  return "#9f1239";
}

function buildReactFlowGraph(project: PowerSystemProjectFile): { nodes: Node[]; edges: Edge[] } {
  const tagByEquipmentId = new Map<string, string>();
  const all = [
    ...project.equipment.utilities,
    ...project.equipment.generators,
    ...project.equipment.buses,
    ...project.equipment.transformers,
    ...project.equipment.cables,
    ...project.equipment.breakers,
    ...project.equipment.switches,
    ...project.equipment.loads,
    ...project.equipment.motors,
    ...(project.equipment.placeholders ?? []),
  ];
  for (const eq of all) tagByEquipmentId.set(eq.internalId, eq.tag);

  const nodes: Node[] = project.diagram.nodes.map((n) => ({
    id: n.id,
    position: { x: n.position.x, y: n.position.y },
    data: { label: `${tagByEquipmentId.get(n.equipmentInternalId) ?? n.equipmentInternalId}\n[${n.kind}]` },
    style: {
      width: n.width ?? 160,
      height: n.height ?? 48,
      whiteSpace: "pre-line",
      fontSize: 11,
      borderRadius: n.kind === "bus" ? 0 : 6,
      border: n.kind === "transformer" ? "2px solid #2563eb" : "1px solid #94a3b8",
      background: n.kind === "transformer" ? "#dbeafe" : "white",
    },
  }));

  const edges: Edge[] = project.diagram.edges.map((e) => {
    const branchTags = (e.branchEquipmentInternalIds ?? [])
      .map((id) => tagByEquipmentId.get(id) ?? id)
      .join(" → ");
    const label = e.kind === "branch_chain"
      ? branchTags || (e.label ?? "branch_chain")
      : e.label ?? "";
    return {
      id: e.id,
      source: e.fromNodeId,
      target: e.toNodeId,
      label,
      type: "default",
      animated: e.kind === "branch_chain",
      style: e.kind === "branch_chain" ? { stroke: "#9333ea", strokeWidth: 2 } : { stroke: "#475569" },
      labelStyle: { fontSize: 10 },
    };
  });

  return { nodes, edges };
}

export function App() {
  const [project] = useState<PowerSystemProjectFile>(() => getDemoFixture());

  const runtime = useMemo(() => loadProjectFile(serializeProjectFile(project)), [project]);
  const runtimeStatus = runtime.runtimeValidation?.status ?? "valid";

  const counts = useMemo(() => {
    const eq = project.equipment;
    return [
      { label: "Utilities", n: eq.utilities.length },
      { label: "Generators", n: eq.generators.length },
      { label: "Buses", n: eq.buses.length },
      { label: "Transformers", n: eq.transformers.length },
      { label: "Cables", n: eq.cables.length },
      { label: "Breakers", n: eq.breakers.length },
      { label: "Switches", n: eq.switches.length },
      { label: "Loads", n: eq.loads.length },
      { label: "Motors", n: eq.motors.length },
      { label: "Placeholders", n: eq.placeholders?.length ?? 0 },
    ];
  }, [project]);

  const { nodes, edges } = useMemo(() => buildReactFlowGraph(project), [project]);

  const handleSave = () => {
    const text = serializeProjectFile(project);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.project.projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.shell}>
      <div style={styles.header}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18 }}>{project.project.projectName}</h1>
          <div style={styles.small}>
            {project.project.standard} · {project.project.frequencyHz} Hz · schema {project.schemaVersion}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={styles.badge(statusColor(runtimeStatus))}>{runtimeStatus}</span>
          <button type="button" style={styles.saveButton} onClick={handleSave}>
            Save JSON
          </button>
        </div>
      </div>

      <div style={styles.panel}>
        <strong style={{ fontSize: 13 }}>Equipment counts</strong>
        <table style={styles.countTable}>
          <tbody>
            {counts.map((c) => (
              <tr key={c.label}>
                <td style={styles.td}>{c.label}</td>
                <td style={styles.td}>{c.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.canvas}>
        <ReactFlow nodes={nodes} edges={edges} fitView panOnDrag zoomOnScroll proOptions={{ hideAttribution: true }}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <div style={styles.small}>
        Stage 1 PR #1 — read-only foundation. Calculations, palette, and property panel arrive in PR #2 / PR #3.
      </div>
    </div>
  );
}
