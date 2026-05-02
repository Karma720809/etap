import { describe, expect, it } from "vitest";
import { getDemoFixture } from "@power-system-study/fixtures";
import { buildAppNetwork } from "../src/index.js";

describe("buildAppNetwork — Stage 1 demo fixture", () => {
  it("produces a valid AppNetwork for the canonical demo fixture", () => {
    const project = getDemoFixture();
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.appNetwork === null) return;

    // Buses
    const busIds = result.appNetwork.buses.map((b) => b.internalId).sort();
    expect(busIds).toEqual(["eq_bus_lv_001", "eq_bus_mtr_001", "eq_bus_mv_001"]);

    // One utility source as slack
    expect(result.appNetwork.sources).toHaveLength(1);
    expect(result.appNetwork.sources[0]?.internalId).toBe("eq_util_001");
    expect(result.appNetwork.sources[0]?.role).toBe("slack");
    expect(result.appNetwork.sources[0]?.busInternalId).toBe("eq_bus_mv_001");

    // Transformer node converted into a calculation branch
    expect(result.appNetwork.transformers).toHaveLength(1);
    const t = result.appNetwork.transformers[0]!;
    expect(t.internalId).toBe("eq_tr_001");
    expect(t.fromBusInternalId).toBe("eq_bus_mv_001");
    expect(t.toBusInternalId).toBe("eq_bus_lv_001");

    // BRK-001 → CBL-001 produces one cable branch when the breaker is closed/in-service
    expect(result.appNetwork.cables).toHaveLength(1);
    expect(result.appNetwork.cables[0]?.internalId).toBe("eq_cbl_001");
    expect(result.appNetwork.cables[0]?.branchChainEdgeId).toBe("edge_lv_branch_chain_to_motor_bus");
    expect(result.appNetwork.cables[0]?.branchChainOrderIndex).toBe(1);

    // Closed breaker is recorded as a gate
    expect(result.appNetwork.gates).toHaveLength(1);
    expect(result.appNetwork.gates[0]?.kind).toBe("breaker");
    expect(result.appNetwork.gates[0]?.internalId).toBe("eq_brk_001");

    // Motor collected as a steady-state PQ load
    expect(result.appNetwork.motors).toHaveLength(1);
    expect(result.appNetwork.motors[0]?.internalId).toBe("eq_motor_001");
    expect(result.appNetwork.motors[0]?.busInternalId).toBe("eq_bus_mtr_001");

    // Stage 1 demo has no loads
    expect(result.appNetwork.loads).toHaveLength(0);

    // No calculation results / snapshots leak through
    expect(result.appNetwork).not.toHaveProperty("calculationResults");
    expect(project.calculationSnapshots ?? []).toHaveLength(0);
  });

  it("does not mutate the demo fixture", () => {
    const project = getDemoFixture();
    const before = JSON.stringify(project);
    buildAppNetwork(project);
    expect(JSON.stringify(project)).toBe(before);
  });
});
