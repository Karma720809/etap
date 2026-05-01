import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node, type NodeMouseHandler } from "reactflow";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import { useProjectState } from "../state/projectStore.js";

function buildReactFlowGraph(project: PowerSystemProjectFile, selectedInternalId: string | null): { nodes: Node[]; edges: Edge[] } {
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

  const nodes: Node[] = project.diagram.nodes.map((n) => {
    const isSelected = n.equipmentInternalId === selectedInternalId;
    return {
      id: n.id,
      position: { x: n.position.x, y: n.position.y },
      data: { label: `${tagByEquipmentId.get(n.equipmentInternalId) ?? n.equipmentInternalId}\n[${n.kind}]`, equipmentInternalId: n.equipmentInternalId },
      style: {
        width: n.width ?? 160,
        height: n.height ?? 48,
        whiteSpace: "pre-line",
        fontSize: 11,
        borderRadius: n.kind === "bus" ? 0 : 6,
        border: isSelected ? "2px solid #f59e0b" : n.kind === "transformer" ? "2px solid #2563eb" : "1px solid #94a3b8",
        background: n.kind === "transformer" ? "#dbeafe" : "white",
      },
    };
  });

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

export function DiagramCanvas() {
  const { state, dispatch } = useProjectState();
  const { nodes, edges } = useMemo(
    () => buildReactFlowGraph(state.project, state.selectedInternalId),
    [state.project, state.selectedInternalId],
  );

  const onNodeClick: NodeMouseHandler = (_event, node) => {
    const internalId = (node.data as { equipmentInternalId?: string } | undefined)?.equipmentInternalId ?? null;
    dispatch({ type: "selectEquipment", internalId });
  };

  if (state.project.diagram.nodes.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b", fontSize: 13 }}>
        Diagram is empty. Use the palette on the left to add equipment.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      panOnDrag
      zoomOnScroll
      onNodeClick={onNodeClick}
      onPaneClick={() => dispatch({ type: "selectEquipment", internalId: null })}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
