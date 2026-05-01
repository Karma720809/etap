import type {
  EquipmentCollections,
  PowerSystemProjectFile,
} from "@power-system-study/schemas";
import type { EquipmentKind } from "./equipment-kind.js";
import { kindToInternalIdToken } from "./ids.js";
import { nextAutoTagFor, type TagCounters } from "./tag-counters.js";

// Equipment factories produce canonical Rev D shapes only:
// - canonical field names (connectedBus, status, fromBus, toBus)
// - immutable internalId minted from existing project state (deterministic)
// - suggested editable tag from monotonic tagCounters
// - diagram node added for kinds that render as nodes (every kind except cable/breaker/switch)
//
// Branch equipment (cable, breaker, switch) is canonical project-collection data only;
// branch_chain edges that visualize those items are constructed separately when the user
// builds a feeder, and PR #2 leaves that interaction to a later iteration.

const NODE_LAYOUT = {
  defaultColumnX: 200,
  rowSpacing: 120,
  initialY: 80,
};

function iterateAll(eq: EquipmentCollections): { internalId: string }[] {
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

function nextInternalIdForKind(eq: EquipmentCollections, kind: EquipmentKind): string {
  const token = kindToInternalIdToken(kind);
  const prefix = `eq_${token}_`;
  let max = 0;
  for (const item of iterateAll(eq)) {
    if (item.internalId.startsWith(prefix)) {
      const tail = item.internalId.slice(prefix.length);
      const n = Number(tail);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function nextDiagramNodeId(diagram: PowerSystemProjectFile["diagram"], internalId: string): string {
  const candidate = `node_${internalId.replace(/^eq_/, "")}`;
  const taken = new Set(diagram.nodes.map((n) => n.id));
  if (!taken.has(candidate)) return candidate;
  let i = 2;
  while (taken.has(`${candidate}_${i}`)) i += 1;
  return `${candidate}_${i}`;
}

function pickNodePosition(diagram: PowerSystemProjectFile["diagram"]): { x: number; y: number } {
  return {
    x: NODE_LAYOUT.defaultColumnX,
    y: NODE_LAYOUT.initialY + diagram.nodes.length * NODE_LAYOUT.rowSpacing,
  };
}

// Kinds that render as branch elements (not standalone diagram nodes).
const BRANCH_ONLY_KINDS = new Set<EquipmentKind>(["cable", "breaker", "switch"]);

export interface CreatedEquipment {
  project: PowerSystemProjectFile;
  internalId: string;
  tag: string;
}

interface BuildContext {
  internalId: string;
  tag: string;
  now: string;
}

function buildBus(ctx: BuildContext) {
  return {
    internalId: ctx.internalId,
    tag: ctx.tag,
    kind: "bus" as const,
    tagSystem: "auto" as const,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    vnKv: null,
    voltageType: "AC" as const,
    topology: "3P3W" as const,
    minVoltagePct: 95,
    maxVoltagePct: 105,
    grounding: "unknown" as const,
  };
}

function buildUtility(ctx: BuildContext) {
  return {
    internalId: ctx.internalId,
    tag: ctx.tag,
    kind: "utility" as const,
    tagSystem: "auto" as const,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    connectedBus: null,
    vnKv: null,
    scLevelMva: null,
    faultCurrentKa: null,
    xrRatio: null,
    voltageFactor: null,
    status: "in_service" as const,
  };
}

function buildGenerator(ctx: BuildContext) {
  return {
    internalId: ctx.internalId,
    tag: ctx.tag,
    kind: "generator" as const,
    tagSystem: "auto" as const,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    connectedBus: null,
    ratedMva: null,
    ratedVoltageKv: null,
    operatingMode: "out_of_service" as const,
    pMw: null,
    qMvar: null,
    powerFactor: null,
    voltageSetpointPu: null,
    xdSubtransientPu: null,
    status: "out_of_service" as const,
  };
}

function buildTransformer(ctx: BuildContext) {
  return {
    internalId: ctx.internalId,
    tag: ctx.tag,
    kind: "transformer" as const,
    tagSystem: "auto" as const,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    fromBus: null,
    toBus: null,
    snMva: null,
    vnHvKv: null,
    vnLvKv: null,
    vkPercent: null,
    vkrPercent: null,
    xrRatio: null,
    vectorGroup: null,
    tapPosition: null,
    neutralTap: null,
    tapStepPercent: null,
    coolingType: null,
    loadingLimitPct: null,
    status: "in_service" as const,
  };
}

function buildCable(ctx: BuildContext) {
  return {
    internalId: ctx.internalId,
    tag: ctx.tag,
    kind: "cable" as const,
    tagSystem: "auto" as const,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    fromBus: null,
    toBus: null,
    voltageGradeKv: null,
    coreConfiguration: null,
    conductorMaterial: "unknown" as const,
    insulationType: "unknown" as const,
    armourType: "unknown" as const,
    conductorSizeMm2: null,
    armourCsaMm2: null,
    lengthM: null,
    rOhmPerKm: null,
    xOhmPerKm: null,
    ampacityA: null,
    installationMethod: "unknown" as const,
    ambientTempC: null,
    soilResistivityK_m_W: null,
    groupingCondition: null,
    loadedConductors: null,
    status: "in_service" as const,
  };
}

function buildBreaker(ctx: BuildContext) {
  return {
    internalId: ctx.internalId,
    tag: ctx.tag,
    kind: "breaker" as const,
    tagSystem: "auto" as const,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deviceType: "breaker" as const,
    fromBus: null,
    toBus: null,
    state: "closed" as const,
    ratedVoltageKv: null,
    ratedCurrentA: null,
    breakingCapacityKa: null,
    makingCapacityKa: null,
    tripUnitType: null,
    clearingTimeS: null,
    upstreamEquipment: null,
    downstreamEquipment: null,
    status: "in_service" as const,
  };
}

function buildSwitch(ctx: BuildContext) {
  return {
    internalId: ctx.internalId,
    tag: ctx.tag,
    kind: "switch" as const,
    tagSystem: "auto" as const,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    fromBus: null,
    toBus: null,
    state: "closed" as const,
    normalState: "closed" as const,
    ratedVoltageKv: null,
    ratedCurrentA: null,
    status: "in_service" as const,
  };
}

function buildLoad(ctx: BuildContext) {
  return {
    internalId: ctx.internalId,
    tag: ctx.tag,
    kind: "load" as const,
    tagSystem: "auto" as const,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    connectedBus: null,
    loadType: "static_load" as const,
    kw: null,
    kvar: null,
    powerFactor: null,
    demandFactor: null,
    status: "in_service" as const,
  };
}

function buildMotor(ctx: BuildContext) {
  return {
    internalId: ctx.internalId,
    tag: ctx.tag,
    kind: "motor" as const,
    tagSystem: "auto" as const,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    connectedBus: null,
    ratedKw: null,
    ratedHp: null,
    ratedVoltageV: null,
    efficiency: null,
    powerFactor: null,
    flaA: null,
    flaSource: "calculated" as const,
    startingCurrentRatio: null,
    startingPowerFactor: null,
    startingMethod: "DOL" as const,
    serviceFactor: null,
    status: "in_service" as const,
  };
}

function buildPlaceholder(ctx: BuildContext, kind: "mcc_placeholder" | "switchgear_placeholder") {
  return {
    internalId: ctx.internalId,
    tag: ctx.tag,
    kind,
    tagSystem: "auto" as const,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    containedBusIds: [] as string[],
  };
}

// Adds the new equipment record to the correct project collection without mutating
// the input project. Returns the updated equipment slice.
function appendToCollections(
  collections: EquipmentCollections,
  kind: EquipmentKind,
  ctx: BuildContext,
): EquipmentCollections {
  switch (kind) {
    case "bus":
      return { ...collections, buses: [...collections.buses, buildBus(ctx)] };
    case "utility":
      return { ...collections, utilities: [...collections.utilities, buildUtility(ctx)] };
    case "generator":
      return { ...collections, generators: [...collections.generators, buildGenerator(ctx)] };
    case "transformer":
      return { ...collections, transformers: [...collections.transformers, buildTransformer(ctx)] };
    case "cable":
      return { ...collections, cables: [...collections.cables, buildCable(ctx)] };
    case "breaker":
      return { ...collections, breakers: [...collections.breakers, buildBreaker(ctx)] };
    case "switch":
      return { ...collections, switches: [...collections.switches, buildSwitch(ctx)] };
    case "load":
      return { ...collections, loads: [...collections.loads, buildLoad(ctx)] };
    case "motor":
      return { ...collections, motors: [...collections.motors, buildMotor(ctx)] };
    case "mcc_placeholder":
    case "switchgear_placeholder":
      return {
        ...collections,
        placeholders: [...(collections.placeholders ?? []), buildPlaceholder(ctx, kind)],
      };
  }
}

export interface CreateEquipmentOptions {
  /** Override the timestamp; defaults to new Date().toISOString(). */
  now?: string;
}

/**
 * Creates a new equipment item of the given kind and returns a project copy that
 * already includes its diagram representation per the Stage 1 transformer-as-node
 * and branch-only policies. Pure (no input mutation).
 */
export function createEquipment(
  project: PowerSystemProjectFile,
  kind: EquipmentKind,
  options: CreateEquipmentOptions = {},
): CreatedEquipment {
  const now = options.now ?? new Date().toISOString();
  const internalId = nextInternalIdForKind(project.equipment, kind);
  const { counters: nextTagCounters, tag } = nextAutoTagFor(
    project.tagCounters as TagCounters,
    kind,
  );
  const ctx: BuildContext = { internalId, tag, now };
  const equipment = appendToCollections(project.equipment, kind, ctx);

  let diagram = project.diagram;
  if (!BRANCH_ONLY_KINDS.has(kind)) {
    const nodeId = nextDiagramNodeId(diagram, internalId);
    diagram = {
      ...diagram,
      nodes: [
        ...diagram.nodes,
        {
          id: nodeId,
          equipmentInternalId: internalId,
          kind,
          position: pickNodePosition(diagram),
        },
      ],
    };
  }

  const updated: PowerSystemProjectFile = {
    ...project,
    project: { ...project.project, updatedAt: now },
    equipment,
    diagram,
    tagCounters: nextTagCounters,
  };

  return { project: updated, internalId, tag };
}
