import { describe, expect, it } from "vitest";
import { buildAppNetwork, NETWORK_MODEL_VERSION } from "../src/index.js";
import { emptyProject, minimalValidProject } from "./test-helpers.js";

describe("buildAppNetwork — happy path", () => {
  it("builds a valid AppNetwork from the minimal utility→TR→cable→motor topology", () => {
    const result = buildAppNetwork(minimalValidProject());
    expect(result.status).toBe("valid");
    expect(result.appNetwork).not.toBeNull();
    if (result.appNetwork === null) return;

    expect(result.appNetwork.networkModelVersion).toBe(NETWORK_MODEL_VERSION);
    expect(result.appNetwork.frequencyHz).toBe(60);
    expect(result.appNetwork.scenarioId).toBe("SCN-NORMAL");

    expect(result.appNetwork.buses.map((b) => b.internalId).sort()).toEqual([
      "eq_bus_lv",
      "eq_bus_mtr",
      "eq_bus_mv",
    ]);

    expect(result.appNetwork.sources).toHaveLength(1);
    expect(result.appNetwork.sources[0]?.kind).toBe("utility");
    expect(result.appNetwork.sources[0]?.role).toBe("slack");
    expect(result.appNetwork.sources[0]?.busInternalId).toBe("eq_bus_mv");

    expect(result.appNetwork.transformers).toHaveLength(1);
    expect(result.appNetwork.transformers[0]?.fromBusInternalId).toBe("eq_bus_mv");
    expect(result.appNetwork.transformers[0]?.toBusInternalId).toBe("eq_bus_lv");

    expect(result.appNetwork.cables).toHaveLength(1);
    expect(result.appNetwork.cables[0]?.internalId).toBe("eq_cbl_1");
    expect(result.appNetwork.cables[0]?.fromBusInternalId).toBe("eq_bus_lv");
    expect(result.appNetwork.cables[0]?.toBusInternalId).toBe("eq_bus_mtr");
    expect(result.appNetwork.cables[0]?.branchChainEdgeId).toBe("e_lv_to_mtr_chain");
    expect(result.appNetwork.cables[0]?.branchChainOrderIndex).toBe(1);

    expect(result.appNetwork.gates).toHaveLength(1);
    expect(result.appNetwork.gates[0]?.kind).toBe("breaker");
    expect(result.appNetwork.gates[0]?.state).toBe("closed");
    expect(result.appNetwork.gates[0]?.branchChainOrderIndex).toBe(0);

    expect(result.appNetwork.motors).toHaveLength(1);
    expect(result.appNetwork.motors[0]?.busInternalId).toBe("eq_bus_mtr");

    expect(result.issues).toEqual([]);
  });

  it("does not produce any calculation results or snapshots", () => {
    const result = buildAppNetwork(minimalValidProject());
    expect(result.status).toBe("valid");
    if (result.appNetwork === null) return;
    expect(result.appNetwork).not.toHaveProperty("calculationResults");
    expect(result.appNetwork).not.toHaveProperty("calculationSnapshots");
    expect(result.appNetwork).not.toHaveProperty("loadFlow");
    expect(result.appNetwork).not.toHaveProperty("voltageDrop");
  });
});

describe("buildAppNetwork — empty / source-missing", () => {
  it("emits I-NET-001 + E-LF-003 for an empty project", () => {
    const result = buildAppNetwork(emptyProject());
    expect(result.status).toBe("invalid");
    expect(result.appNetwork).toBeNull();
    expect(result.issues.some((i) => i.code === "E-LF-003")).toBe(true);
    expect(result.warnings.some((w) => w.code === "I-NET-001")).toBe(true);
  });

  it("emits E-NET-001 + E-LF-003 when buses exist but no in-service source", () => {
    const project = minimalValidProject();
    project.equipment.utilities = [];
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(result.issues.some((i) => i.code === "E-NET-001")).toBe(true);
    expect(result.issues.some((i) => i.code === "E-LF-003")).toBe(true);
  });
});
