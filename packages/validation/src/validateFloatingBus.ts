import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import type { BuiltValidationIssue } from "./issue.js";
import { makeIssue } from "./issue.js";

// E-NET-002 — bus exists in the project but cannot be reached from any in-service
// source via in-service branch equipment.
//
// Reachability uses the canonical engineering model (utility/generator connectedBus,
// transformer/cable/breaker/switch fromBus/toBus), not the diagram. Diagram edges
// are visual only and do not gate connectivity.
//
// Branch equipment gates path traversal:
//   - transformer / cable: traversable iff status === "in_service"
//   - breaker / switch:    traversable iff status === "in_service" AND state === "closed"
//
// The check is skipped when the project has no in-service source — E-NET-001 already
// covers that case — and when there are no branch elements connecting buses, since
// the spec only requires the floating-bus check after at least one branch path exists.
export function validateFloatingBus(project: PowerSystemProjectFile): BuiltValidationIssue[] {
  const buses = project.equipment.buses;
  if (buses.length === 0) return [];

  const busIds = new Set(buses.map((b) => b.internalId));

  const sourceAttachedBuses = new Set<string>();
  for (const u of project.equipment.utilities) {
    if (u.status !== "in_service") continue;
    if (u.connectedBus && busIds.has(u.connectedBus)) sourceAttachedBuses.add(u.connectedBus);
  }
  for (const g of project.equipment.generators) {
    if (g.status !== "in_service") continue;
    if (g.connectedBus && busIds.has(g.connectedBus)) sourceAttachedBuses.add(g.connectedBus);
  }
  if (sourceAttachedBuses.size === 0) return [];

  const adjacency = new Map<string, Set<string>>();
  for (const id of busIds) adjacency.set(id, new Set<string>());
  function link(a: string | null, b: string | null) {
    if (!a || !b) return;
    if (!busIds.has(a) || !busIds.has(b)) return;
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }

  // The spec requires "at least one branch path exists" before E-NET-002 applies.
  // We count any branch entity that has both endpoints assigned, regardless of state,
  // so that an open breaker counts as an attempted branch path. Only in-service AND
  // closed branches actually link buses for reachability.
  let branchCount = 0;
  for (const t of project.equipment.transformers) {
    if (!t.fromBus || !t.toBus || t.fromBus === t.toBus) continue;
    branchCount += 1;
    if (t.status === "in_service") link(t.fromBus, t.toBus);
  }
  for (const c of project.equipment.cables) {
    if (!c.fromBus || !c.toBus || c.fromBus === c.toBus) continue;
    branchCount += 1;
    if (c.status === "in_service") link(c.fromBus, c.toBus);
  }
  for (const br of project.equipment.breakers) {
    if (!br.fromBus || !br.toBus || br.fromBus === br.toBus) continue;
    branchCount += 1;
    if (br.status === "in_service" && br.state === "closed") link(br.fromBus, br.toBus);
  }
  for (const sw of project.equipment.switches) {
    if (!sw.fromBus || !sw.toBus || sw.fromBus === sw.toBus) continue;
    branchCount += 1;
    if (sw.status === "in_service" && sw.state === "closed") link(sw.fromBus, sw.toBus);
  }

  if (branchCount === 0) return [];

  const reachable = new Set<string>();
  const queue: string[] = [];
  for (const seed of sourceAttachedBuses) {
    reachable.add(seed);
    queue.push(seed);
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adjacency.get(cur) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  const issues: BuiltValidationIssue[] = [];
  for (const bus of buses) {
    if (!reachable.has(bus.internalId)) {
      issues.push(makeIssue({
        code: "E-NET-002",
        equipmentInternalId: bus.internalId,
        tag: bus.tag,
        message: `Floating bus '${bus.tag}': not reachable from any in-service source path`,
      }));
    }
  }
  return issues;
}
