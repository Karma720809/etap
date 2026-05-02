import { describe, expect, it } from "vitest";
import { buildAppNetwork } from "../src/index.js";
import {
  branchChainEdge,
  breaker,
  bus,
  emptyProject,
  node,
  switchDevice,
  utility,
} from "./test-helpers.js";

// Build a two-bus project where BUS-A is sourced by a utility and BUS-B is
// reachable from BUS-A only via a gate-only branch_chain. Different scenarios
// vary which gate(s) are present and their state/status.
type GateMember =
  | { kind: "breaker"; internalId: string; state: "open" | "closed"; status: "in_service" | "out_of_service" }
  | { kind: "switch"; internalId: string; state: "open" | "closed"; status: "in_service" | "out_of_service" };

function gateOnlyChainProject(members: GateMember[]) {
  const project = emptyProject();
  project.equipment.utilities = [
    utility({ internalId: "eq_util_1", tag: "UTL-1", connectedBus: "eq_bus_a", vnKv: 0.4 }),
  ];
  project.equipment.buses = [
    bus({ internalId: "eq_bus_a", tag: "BUS-A", vnKv: 0.4, topology: "3P4W" }),
    bus({ internalId: "eq_bus_b", tag: "BUS-B", vnKv: 0.4, topology: "3P4W" }),
  ];
  for (const m of members) {
    if (m.kind === "breaker") {
      project.equipment.breakers.push(
        breaker({
          internalId: m.internalId,
          tag: m.internalId.toUpperCase(),
          fromBus: "eq_bus_a",
          toBus: "eq_bus_b",
          state: m.state,
          status: m.status,
        }),
      );
    } else {
      project.equipment.switches.push(
        switchDevice({
          internalId: m.internalId,
          tag: m.internalId.toUpperCase(),
          fromBus: "eq_bus_a",
          toBus: "eq_bus_b",
          state: m.state,
          status: m.status,
        }),
      );
    }
  }
  project.diagram.nodes = [
    node({ id: "n_util", equipmentInternalId: "eq_util_1", kind: "utility" }),
    node({ id: "n_bus_a", equipmentInternalId: "eq_bus_a", kind: "bus" }),
    node({ id: "n_bus_b", equipmentInternalId: "eq_bus_b", kind: "bus" }),
  ];
  project.diagram.edges = [
    { id: "e_util_a", fromNodeId: "n_util", toNodeId: "n_bus_a", kind: "connection" },
    branchChainEdge({
      id: "e_a_to_b",
      fromNodeId: "n_bus_a",
      toNodeId: "n_bus_b",
      branchEquipmentInternalIds: members.map((m) => m.internalId),
    }),
  ];
  project.scenarios = [
    {
      schemaVersion: "1.0.0",
      scenarioId: "SCN-1",
      name: "S",
      inheritsFrom: null,
      overrides: [],
    },
  ];
  return project;
}

describe("buildAppNetwork — gate-only branch_chain (spec §5.6)", () => {
  it("ties endpoints electrically when a closed breaker-only chain is enabled", () => {
    const project = gateOnlyChainProject([
      { kind: "breaker", internalId: "eq_brk_1", state: "closed", status: "in_service" },
    ]);
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.appNetwork === null) return;
    expect(result.issues.some((i) => i.code === "E-NET-002")).toBe(false);

    // No NetworkCableBranch should be produced.
    expect(result.appNetwork.cables).toHaveLength(0);
    // Gate is preserved for traceability.
    expect(result.appNetwork.gates).toHaveLength(1);
    expect(result.appNetwork.gates[0]?.kind).toBe("breaker");
    // gateConnections records the bus↔bus tie.
    expect(result.appNetwork.gateConnections).toHaveLength(1);
    expect(result.appNetwork.gateConnections[0]?.fromBusInternalId).toBe("eq_bus_a");
    expect(result.appNetwork.gateConnections[0]?.toBusInternalId).toBe("eq_bus_b");
    expect(result.appNetwork.gateConnections[0]?.branchChainEdgeId).toBe("e_a_to_b");
    expect(result.appNetwork.gateConnections[0]?.gateInternalIds).toEqual(["eq_brk_1"]);
  });

  it("ties endpoints electrically when a closed switch-only chain is enabled", () => {
    const project = gateOnlyChainProject([
      { kind: "switch", internalId: "eq_sw_1", state: "closed", status: "in_service" },
    ]);
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.appNetwork === null) return;
    expect(result.issues.some((i) => i.code === "E-NET-002")).toBe(false);
    expect(result.appNetwork.cables).toHaveLength(0);
    expect(result.appNetwork.gates).toHaveLength(1);
    expect(result.appNetwork.gates[0]?.kind).toBe("switch");
    expect(result.appNetwork.gateConnections).toHaveLength(1);
  });

  it("preserves branchEquipmentInternalIds order in gateConnection.gateInternalIds", () => {
    const project = gateOnlyChainProject([
      { kind: "switch", internalId: "eq_sw_a", state: "closed", status: "in_service" },
      { kind: "breaker", internalId: "eq_brk_b", state: "closed", status: "in_service" },
      { kind: "switch", internalId: "eq_sw_c", state: "closed", status: "in_service" },
    ]);
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.appNetwork === null) return;
    expect(result.appNetwork.gateConnections[0]?.gateInternalIds).toEqual([
      "eq_sw_a",
      "eq_brk_b",
      "eq_sw_c",
    ]);
  });

  it("does NOT tie endpoints when the only switch in the chain is open", () => {
    const project = gateOnlyChainProject([
      { kind: "switch", internalId: "eq_sw_1", state: "open", status: "in_service" },
    ]);
    const result = buildAppNetwork(project);
    expect(result.appNetwork).toBeNull();
    expect(result.issues.some((i) => i.code === "E-NET-002" && i.equipmentInternalId === "eq_bus_b")).toBe(true);
  });

  it("does NOT tie endpoints when the only breaker in the chain is open", () => {
    const project = gateOnlyChainProject([
      { kind: "breaker", internalId: "eq_brk_1", state: "open", status: "in_service" },
    ]);
    const result = buildAppNetwork(project);
    expect(result.appNetwork).toBeNull();
    expect(result.issues.some((i) => i.code === "E-NET-002" && i.equipmentInternalId === "eq_bus_b")).toBe(true);
  });

  it("does NOT tie endpoints when a gate is closed but out_of_service", () => {
    const project = gateOnlyChainProject([
      { kind: "breaker", internalId: "eq_brk_1", state: "closed", status: "out_of_service" },
    ]);
    const result = buildAppNetwork(project);
    expect(result.appNetwork).toBeNull();
    expect(result.issues.some((i) => i.code === "E-NET-002" && i.equipmentInternalId === "eq_bus_b")).toBe(true);
  });

  it("disables a multi-gate chain if any single member is open", () => {
    const project = gateOnlyChainProject([
      { kind: "switch", internalId: "eq_sw_a", state: "closed", status: "in_service" },
      { kind: "breaker", internalId: "eq_brk_b", state: "open", status: "in_service" },
      { kind: "switch", internalId: "eq_sw_c", state: "closed", status: "in_service" },
    ]);
    const result = buildAppNetwork(project);
    expect(result.appNetwork).toBeNull();
    expect(result.issues.some((i) => i.code === "E-NET-002")).toBe(true);
  });
});
