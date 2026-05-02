// Test helpers for buildAppNetwork tests. We keep helpers local to the
// network-model package — they are intentionally not exported from
// `src/index.ts` because they are not part of the public API surface.

import type { PowerSystemProjectFile } from "@power-system-study/schemas";

const NOW = "2026-05-01T00:00:00+00:00";

export function emptyProject(): PowerSystemProjectFile {
  return {
    schemaVersion: "1.0.0",
    appVersion: "0.0.0-test",
    project: {
      projectId: "PJT-T",
      projectName: "T",
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

interface BusOpts {
  internalId?: string;
  tag?: string;
  vnKv?: number | null;
  topology?: "3P3W" | "3P4W" | "1P2W" | "1P3W" | "DC2W" | "DC3W";
  minVoltagePct?: number | null;
  maxVoltagePct?: number | null;
}
export function bus(o: BusOpts = {}): PowerSystemProjectFile["equipment"]["buses"][number] {
  return {
    internalId: o.internalId ?? "eq_bus_1",
    tag: o.tag ?? "BUS-1",
    kind: "bus",
    tagSystem: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    vnKv: o.vnKv ?? 0.4,
    voltageType: "AC",
    topology: o.topology ?? "3P4W",
    minVoltagePct: o.minVoltagePct ?? 95,
    maxVoltagePct: o.maxVoltagePct ?? 105,
    grounding: "TN-S",
  };
}

interface UtilityOpts {
  internalId?: string;
  tag?: string;
  connectedBus?: string | null;
  vnKv?: number | null;
  status?: "in_service" | "out_of_service";
}
export function utility(o: UtilityOpts = {}): PowerSystemProjectFile["equipment"]["utilities"][number] {
  return {
    internalId: o.internalId ?? "eq_util_1",
    tag: o.tag ?? "UTL-1",
    kind: "utility",
    tagSystem: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    connectedBus: o.connectedBus ?? null,
    vnKv: o.vnKv ?? 6.6,
    scLevelMva: 250,
    faultCurrentKa: null,
    xrRatio: 10,
    voltageFactor: 1,
    status: o.status ?? "in_service",
  };
}

interface GeneratorOpts {
  internalId?: string;
  tag?: string;
  connectedBus?: string | null;
  status?: "in_service" | "out_of_service";
  operatingMode?: "out_of_service" | "grid_parallel_pq" | "pv_voltage_control" | "island_isochronous";
  pMw?: number | null;
  qMvar?: number | null;
}
export function generator(o: GeneratorOpts = {}): PowerSystemProjectFile["equipment"]["generators"][number] {
  return {
    internalId: o.internalId ?? "eq_gen_1",
    tag: o.tag ?? "GEN-1",
    kind: "generator",
    tagSystem: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    connectedBus: o.connectedBus ?? null,
    ratedMva: 1,
    ratedVoltageKv: 0.4,
    operatingMode: o.operatingMode ?? "grid_parallel_pq",
    pMw: o.pMw ?? 0.5,
    qMvar: o.qMvar ?? 0.1,
    powerFactor: 0.9,
    voltageSetpointPu: null,
    xdSubtransientPu: null,
    status: o.status ?? "in_service",
  };
}

interface TransformerOpts {
  internalId?: string;
  tag?: string;
  fromBus?: string | null;
  toBus?: string | null;
  status?: "in_service" | "out_of_service";
}
export function transformer(o: TransformerOpts = {}): PowerSystemProjectFile["equipment"]["transformers"][number] {
  return {
    internalId: o.internalId ?? "eq_tr_1",
    tag: o.tag ?? "TR-1",
    kind: "transformer",
    tagSystem: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    fromBus: o.fromBus ?? null,
    toBus: o.toBus ?? null,
    snMva: 2,
    vnHvKv: 6.6,
    vnLvKv: 0.4,
    vkPercent: 6,
    vkrPercent: 1,
    xrRatio: null,
    vectorGroup: "Dyn11",
    tapPosition: 0,
    neutralTap: 0,
    tapStepPercent: 2.5,
    coolingType: "ONAN",
    loadingLimitPct: 100,
    status: o.status ?? "in_service",
  };
}

interface CableOpts {
  internalId?: string;
  tag?: string;
  fromBus?: string | null;
  toBus?: string | null;
  status?: "in_service" | "out_of_service";
}
export function cable(o: CableOpts = {}): PowerSystemProjectFile["equipment"]["cables"][number] {
  return {
    internalId: o.internalId ?? "eq_cbl_1",
    tag: o.tag ?? "CBL-1",
    kind: "cable",
    tagSystem: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    fromBus: o.fromBus ?? null,
    toBus: o.toBus ?? null,
    voltageGradeKv: 0.6,
    coreConfiguration: "3C+E",
    conductorMaterial: "Cu",
    insulationType: "XLPE",
    armourType: "SWA",
    conductorSizeMm2: 240,
    armourCsaMm2: 50,
    lengthM: 80,
    rOhmPerKm: 0.0754,
    xOhmPerKm: 0.08,
    ampacityA: 430,
    installationMethod: "tray",
    ambientTempC: 40,
    soilResistivityK_m_W: null,
    groupingCondition: "single circuit",
    loadedConductors: 3,
    status: o.status ?? "in_service",
  };
}

interface BreakerOpts {
  internalId?: string;
  tag?: string;
  fromBus?: string | null;
  toBus?: string | null;
  state?: "open" | "closed";
  status?: "in_service" | "out_of_service";
}
export function breaker(o: BreakerOpts = {}): PowerSystemProjectFile["equipment"]["breakers"][number] {
  return {
    internalId: o.internalId ?? "eq_brk_1",
    tag: o.tag ?? "BRK-1",
    kind: "breaker",
    tagSystem: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    deviceType: "breaker",
    fromBus: o.fromBus ?? null,
    toBus: o.toBus ?? null,
    state: o.state ?? "closed",
    ratedVoltageKv: 0.4,
    ratedCurrentA: 400,
    breakingCapacityKa: 50,
    makingCapacityKa: 105,
    tripUnitType: "MCCB",
    clearingTimeS: 0.1,
    upstreamEquipment: null,
    downstreamEquipment: null,
    status: o.status ?? "in_service",
  };
}

interface SwitchOpts {
  internalId?: string;
  tag?: string;
  fromBus?: string | null;
  toBus?: string | null;
  state?: "open" | "closed";
  status?: "in_service" | "out_of_service";
}
export function switchDevice(o: SwitchOpts = {}): PowerSystemProjectFile["equipment"]["switches"][number] {
  return {
    internalId: o.internalId ?? "eq_sw_1",
    tag: o.tag ?? "SW-1",
    kind: "switch",
    tagSystem: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    fromBus: o.fromBus ?? null,
    toBus: o.toBus ?? null,
    state: o.state ?? "closed",
    normalState: "closed",
    ratedVoltageKv: 0.4,
    ratedCurrentA: 400,
    status: o.status ?? "in_service",
  };
}

interface LoadOpts {
  internalId?: string;
  tag?: string;
  connectedBus?: string | null;
  kw?: number | null;
  kvar?: number | null;
  powerFactor?: number | null;
  demandFactor?: number | null;
  status?: "in_service" | "out_of_service";
}
export function load(o: LoadOpts = {}): PowerSystemProjectFile["equipment"]["loads"][number] {
  return {
    internalId: o.internalId ?? "eq_ld_1",
    tag: o.tag ?? "LD-1",
    kind: "load",
    tagSystem: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    connectedBus: o.connectedBus ?? null,
    loadType: "static_load",
    kw: o.kw ?? 100,
    kvar: o.kvar ?? null,
    powerFactor: o.powerFactor ?? 0.9,
    demandFactor: o.demandFactor ?? 1,
    status: o.status ?? "in_service",
  };
}

interface MotorOpts {
  internalId?: string;
  tag?: string;
  connectedBus?: string | null;
  ratedKw?: number | null;
  ratedVoltageV?: number | null;
  efficiency?: number | null;
  powerFactor?: number | null;
  status?: "in_service" | "out_of_service";
}
export function motor(o: MotorOpts = {}): PowerSystemProjectFile["equipment"]["motors"][number] {
  return {
    internalId: o.internalId ?? "eq_motor_1",
    tag: o.tag ?? "M-1",
    kind: "motor",
    tagSystem: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    connectedBus: o.connectedBus ?? null,
    ratedKw: o.ratedKw ?? 250,
    ratedHp: null,
    ratedVoltageV: o.ratedVoltageV ?? 400,
    efficiency: o.efficiency ?? 0.95,
    powerFactor: o.powerFactor ?? 0.88,
    flaA: null,
    flaSource: "calculated",
    startingCurrentRatio: 6,
    startingPowerFactor: 0.3,
    startingMethod: "DOL",
    serviceFactor: 1,
    status: o.status ?? "in_service",
  };
}

interface ConnEdgeOpts {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string;
}
export function connEdge(o: ConnEdgeOpts): PowerSystemProjectFile["diagram"]["edges"][number] {
  return {
    id: o.id,
    fromNodeId: o.fromNodeId,
    toNodeId: o.toNodeId,
    kind: "connection",
    label: o.label,
  };
}

interface BranchEdgeOpts {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  branchEquipmentInternalIds: string[];
  label?: string;
}
export function branchChainEdge(o: BranchEdgeOpts): PowerSystemProjectFile["diagram"]["edges"][number] {
  return {
    id: o.id,
    fromNodeId: o.fromNodeId,
    toNodeId: o.toNodeId,
    kind: "branch_chain",
    branchEquipmentInternalIds: o.branchEquipmentInternalIds,
    label: o.label,
  };
}

interface NodeOpts {
  id: string;
  equipmentInternalId: string;
  kind: PowerSystemProjectFile["diagram"]["nodes"][number]["kind"];
  x?: number;
  y?: number;
}
export function node(o: NodeOpts): PowerSystemProjectFile["diagram"]["nodes"][number] {
  return {
    id: o.id,
    equipmentInternalId: o.equipmentInternalId,
    kind: o.kind,
    position: { x: o.x ?? 0, y: o.y ?? 0 },
  };
}

/**
 * Builds a minimal valid project: utility → MV bus → transformer → LV bus →
 * [breaker, cable] branch_chain → motor terminal bus → motor.
 */
export function minimalValidProject(): PowerSystemProjectFile {
  const project = emptyProject();
  project.equipment.utilities = [
    utility({ internalId: "eq_util_1", tag: "UTL-1", connectedBus: "eq_bus_mv", vnKv: 6.6 }),
  ];
  project.equipment.buses = [
    bus({ internalId: "eq_bus_mv", tag: "BUS-MV", vnKv: 6.6, topology: "3P3W" }),
    bus({ internalId: "eq_bus_lv", tag: "BUS-LV", vnKv: 0.4, topology: "3P4W" }),
    bus({ internalId: "eq_bus_mtr", tag: "BUS-MTR", vnKv: 0.4, topology: "3P4W" }),
  ];
  project.equipment.transformers = [
    transformer({ internalId: "eq_tr_1", tag: "TR-1", fromBus: "eq_bus_mv", toBus: "eq_bus_lv" }),
  ];
  project.equipment.cables = [
    cable({ internalId: "eq_cbl_1", tag: "CBL-1", fromBus: "eq_bus_lv", toBus: "eq_bus_mtr" }),
  ];
  project.equipment.breakers = [
    breaker({ internalId: "eq_brk_1", tag: "BRK-1", fromBus: "eq_bus_lv", toBus: "eq_bus_mtr" }),
  ];
  project.equipment.motors = [
    motor({ internalId: "eq_motor_1", tag: "M-1", connectedBus: "eq_bus_mtr" }),
  ];
  project.diagram.nodes = [
    node({ id: "n_util", equipmentInternalId: "eq_util_1", kind: "utility" }),
    node({ id: "n_bus_mv", equipmentInternalId: "eq_bus_mv", kind: "bus" }),
    node({ id: "n_tr", equipmentInternalId: "eq_tr_1", kind: "transformer" }),
    node({ id: "n_bus_lv", equipmentInternalId: "eq_bus_lv", kind: "bus" }),
    node({ id: "n_bus_mtr", equipmentInternalId: "eq_bus_mtr", kind: "bus" }),
    node({ id: "n_motor", equipmentInternalId: "eq_motor_1", kind: "motor" }),
  ];
  project.diagram.edges = [
    connEdge({ id: "e_util_mv", fromNodeId: "n_util", toNodeId: "n_bus_mv" }),
    connEdge({ id: "e_mv_tr", fromNodeId: "n_bus_mv", toNodeId: "n_tr" }),
    connEdge({ id: "e_tr_lv", fromNodeId: "n_tr", toNodeId: "n_bus_lv" }),
    branchChainEdge({
      id: "e_lv_to_mtr_chain",
      fromNodeId: "n_bus_lv",
      toNodeId: "n_bus_mtr",
      branchEquipmentInternalIds: ["eq_brk_1", "eq_cbl_1"],
    }),
    connEdge({ id: "e_mtr_motor", fromNodeId: "n_bus_mtr", toNodeId: "n_motor" }),
  ];
  project.scenarios = [
    {
      schemaVersion: "1.0.0",
      scenarioId: "SCN-NORMAL",
      name: "Normal",
      inheritsFrom: null,
      overrides: [],
    },
  ];
  return project;
}
