import { kindToTagPrefix } from "./ids.js";
import type { EquipmentKind } from "./equipment-kind.js";

export type TagCounters = Record<string, number>;

// Stage 1 policy:
// - tagCounters track default auto-tag prefixes (UTL, GEN, BUS, TR, CBL, BRK, SW, LOAD, M, MCC, SWGR).
// - User-edited sub-prefix tags (e.g. "BUS-MV-001") are allowed but are NOT tracked separately.
// - The duplicate-tag validator (W-ID-001) is the safety mechanism.
// - Counters are monotonic; never decremented when equipment is deleted; never reused.

export function advanceCounter(counters: TagCounters, prefix: string): { counters: TagCounters; nextValue: number } {
  const current = counters[prefix] ?? 0;
  const nextValue = current + 1;
  return { counters: { ...counters, [prefix]: nextValue }, nextValue };
}

export function nextAutoTagFor(counters: TagCounters, kind: EquipmentKind): {
  counters: TagCounters;
  tag: string;
} {
  const prefix = kindToTagPrefix(kind);
  const { counters: nextCounters, nextValue } = advanceCounter(counters, prefix);
  const tag = `${prefix}-${String(nextValue).padStart(3, "0")}`;
  return { counters: nextCounters, tag };
}
