import type { EquipmentKind } from "./equipment-kind.js";

const KIND_TO_PREFIX: Record<EquipmentKind, string> = {
  utility: "UTL",
  generator: "GEN",
  bus: "BUS",
  transformer: "TR",
  cable: "CBL",
  breaker: "BRK",
  switch: "SW",
  load: "LOAD",
  motor: "M",
  mcc_placeholder: "MCC",
  switchgear_placeholder: "SWGR",
};

const KIND_TO_INTERNAL_ID_TOKEN: Record<EquipmentKind, string> = {
  utility: "util",
  generator: "gen",
  bus: "bus",
  transformer: "tr",
  cable: "cbl",
  breaker: "brk",
  switch: "sw",
  load: "load",
  motor: "motor",
  mcc_placeholder: "mcc",
  switchgear_placeholder: "swgr",
};

export function kindToTagPrefix(kind: EquipmentKind): string {
  return KIND_TO_PREFIX[kind];
}

export function kindToInternalIdToken(kind: EquipmentKind): string {
  return KIND_TO_INTERNAL_ID_TOKEN[kind];
}

let internalIdCounter = 0;

// Stage 1 ID generator: deterministic prefix + monotonically increasing index.
// Real IDs are minted once per equipment instance and never re-minted.
export function newInternalId(kind: EquipmentKind, index = ++internalIdCounter): string {
  return `eq_${KIND_TO_INTERNAL_ID_TOKEN[kind]}_${String(index).padStart(3, "0")}`;
}

export function formatAutoTag(prefix: string, counterValue: number, pad = 3): string {
  return `${prefix}-${String(counterValue).padStart(pad, "0")}`;
}
