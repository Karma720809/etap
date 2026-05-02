import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node, type NodeMouseHandler } from "reactflow";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type {
  LoadFlowBranchResult,
  LoadFlowBusResult,
  VoltageDropBranchResult,
} from "@power-system-study/solver-adapter";
import { useProjectState } from "../state/projectStore.js";
import { useCalculation } from "../state/calculationStore.js";

// Stage 2 PR #5 — diagram overlay.
//
// When a runtime LoadFlowRunBundle exists, the canvas appends real
// numeric labels to bus and branch elements:
//   - Bus nodes: "<tag> · <V%> %"
//   - Branch edges (cables): the original tag list plus "<I A> · <VD%>"
//     where each value is omitted with an em-dash if not present.
// We never render an overlay before a real result exists. The
// underlying ReactFlow node/edge identities are unchanged so the user
// can still pan, zoom, and select equipment.

interface OverlayMaps {
  busById: Map<string, LoadFlowBusResult>;
  branchById: Map<string, LoadFlowBranchResult>;
  vdById: Map<string, VoltageDropBranchResult>;
}

function buildOverlayMaps(
  loadFlow: { busResults: LoadFlowBusResult[]; branchResults: LoadFlowBranchResult[] } | null,
  voltageDrop: { branchResults: VoltageDropBranchResult[] } | null,
): OverlayMaps {
  const busById = new Map<string, LoadFlowBusResult>();
  const branchById = new Map<string, LoadFlowBranchResult>();
  const vdById = new Map<string, VoltageDropBranchResult>();
  if (loadFlow) {
    for (const b of loadFlow.busResults) busById.set(b.busInternalId, b);
    for (const br of loadFlow.branchResults) branchById.set(br.branchInternalId, br);
  }
  if (voltageDrop) {
    for (const v of voltageDrop.branchResults) vdById.set(v.branchInternalId, v);
  }
  return { busById, branchById, vdById };
}

function busOverlay(node: { equipmentInternalId: string; kind: string }, overlays: OverlayMaps): string | null {
  if (node.kind !== "bus") return null;
  const bus = overlays.busById.get(node.equipmentInternalId);
  if (!bus || !Number.isFinite(bus.voltagePuPct)) return null;
  return `${bus.voltagePuPct.toFixed(1)}% pu`;
}

function branchOverlay(equipmentIds: string[], overlays: OverlayMaps): string | null {
  if (equipmentIds.length === 0) return null;
  const parts: string[] = [];
  for (const id of equipmentIds) {
    const branch = overlays.branchById.get(id);
    if (!branch) continue;
    const i = Number.isFinite(branch.currentA) ? `${branch.currentA.toFixed(1)} A` : null;
    const loading = branch.loadingPct !== null && Number.isFinite(branch.loadingPct)
      ? `${branch.loadingPct.toFixed(1)}% load`
      : null;
    const vd = overlays.vdById.get(id);
    const drop =
      vd && vd.voltageDropPct !== null && Number.isFinite(vd.voltageDropPct)
        ? `${vd.voltageDropPct.toFixed(2)}% VD`
        : null;
    const segments = [i, loading, drop].filter((x): x is string => x !== null);
    if (segments.length > 0) {
      parts.push(`${id}: ${segments.join(" · ")}`);
    }
  }
  return parts.length === 0 ? null : parts.join("\n");
}

function buildReactFlowGraph(
  project: PowerSystemProjectFile,
  selectedInternalId: string | null,
  overlays: OverlayMaps,
): { nodes: Node[]; edges: Edge[] } {
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
    const overlayLabel = busOverlay(n, overlays);
    const tag = tagByEquipmentId.get(n.equipmentInternalId) ?? n.equipmentInternalId;
    const label = overlayLabel
      ? `${tag}\n[${n.kind}]\n${overlayLabel}`
      : `${tag}\n[${n.kind}]`;
    return {
      id: n.id,
      position: { x: n.position.x, y: n.position.y },
      data: { label, equipmentInternalId: n.equipmentInternalId },
      style: {
        width: n.width ?? 160,
        height: (n.height ?? 48) + (overlayLabel ? 16 : 0),
        whiteSpace: "pre-line",
        fontSize: 11,
        borderRadius: n.kind === "bus" ? 0 : 6,
        border: isSelected ? "2px solid #f59e0b" : n.kind === "transformer" ? "2px solid #2563eb" : "1px solid #94a3b8",
        background: n.kind === "transformer" ? "#dbeafe" : "white",
      },
    };
  });

  const edges: Edge[] = project.diagram.edges.map((e) => {
    const equipmentIds = e.branchEquipmentInternalIds ?? [];
    const branchTags = equipmentIds
      .map((id) => tagByEquipmentId.get(id) ?? id)
      .join(" → ");
    const overlay = branchOverlay(equipmentIds, overlays);
    const baseLabel = e.kind === "branch_chain"
      ? branchTags || (e.label ?? "branch_chain")
      : e.label ?? "";
    const label = overlay ? `${baseLabel}\n${overlay}` : baseLabel;
    return {
      id: e.id,
      source: e.fromNodeId,
      target: e.toNodeId,
      label,
      type: "default",
      animated: e.kind === "branch_chain",
      style: e.kind === "branch_chain" ? { stroke: "#9333ea", strokeWidth: 2 } : { stroke: "#475569" },
      labelStyle: { fontSize: 10, whiteSpace: "pre-line" } as React.CSSProperties,
    };
  });

  return { nodes, edges };
}

export function DiagramCanvas() {
  const { state, dispatch } = useProjectState();
  const { state: calcState } = useCalculation();
  const overlays = useMemo(
    () =>
      buildOverlayMaps(
        calcState.bundle?.loadFlow ?? null,
        calcState.bundle?.voltageDrop ?? null,
      ),
    [calcState.bundle],
  );
  const { nodes, edges } = useMemo(
    () => buildReactFlowGraph(state.project, state.selectedInternalId, overlays),
    [state.project, state.selectedInternalId, overlays],
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
