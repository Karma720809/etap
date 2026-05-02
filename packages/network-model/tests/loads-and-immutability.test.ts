import { describe, expect, it } from "vitest";
import { buildAppNetwork } from "../src/index.js";
import { load, minimalValidProject, motor } from "./test-helpers.js";

describe("buildAppNetwork — loads and motors", () => {
  it("collects in-service motors as steady-state PQ loads", () => {
    const result = buildAppNetwork(minimalValidProject());
    expect(result.status).toBe("valid");
    if (result.network === null) return;
    expect(result.network.motors).toHaveLength(1);
    const m = result.network.motors[0]!;
    expect(m.busInternalId).toBe("eq_bus_mtr");
    // pMw should be ratedKw / efficiency / 1000 = 250 / 0.95 / 1000 ≈ 0.2632
    expect(m.pMw).toBeCloseTo(250 / 0.95 / 1000, 6);
    expect(m.qMvar).toBeGreaterThan(0);
  });

  it("derives load PQ from kvar when present and falls back to power factor", () => {
    const project = minimalValidProject();
    project.equipment.loads = [
      load({ internalId: "eq_ld_1", tag: "LD-1", connectedBus: "eq_bus_lv", kw: 100, kvar: 30, powerFactor: null }),
      load({ internalId: "eq_ld_2", tag: "LD-2", connectedBus: "eq_bus_lv", kw: 200, kvar: null, powerFactor: 0.8 }),
    ];
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.network === null) return;
    const ld1 = result.network.loads.find((l) => l.internalId === "eq_ld_1")!;
    const ld2 = result.network.loads.find((l) => l.internalId === "eq_ld_2")!;
    expect(ld1.pMw).toBeCloseTo(0.1, 6);
    expect(ld1.qMvar).toBeCloseTo(0.03, 6);
    expect(ld2.pMw).toBeCloseTo(0.2, 6);
    // 0.8 pf -> tan(acos(0.8)) = 0.75
    expect(ld2.qMvar).toBeCloseTo(0.2 * 0.75, 6);
  });

  it("excludes out-of-service loads and motors", () => {
    const project = minimalValidProject();
    project.equipment.loads = [
      load({ internalId: "eq_ld_1", connectedBus: "eq_bus_lv", status: "out_of_service" }),
    ];
    project.equipment.motors[0]!.status = "out_of_service";
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.network === null) return;
    expect(result.network.loads).toHaveLength(0);
    expect(result.network.motors).toHaveLength(0);
  });

  it("emits E-NET-003 when a load points at a non-existent bus", () => {
    const project = minimalValidProject();
    project.equipment.loads = [load({ internalId: "eq_ld_1", connectedBus: "eq_bus_does_not_exist" })];
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(
      result.issues.some((i) => i.code === "E-NET-003" && i.equipmentInternalId === "eq_ld_1"),
    ).toBe(true);
  });
});

describe("buildAppNetwork — immutability and guardrails", () => {
  it("does not mutate the input project", () => {
    const project = minimalValidProject();
    const before = JSON.parse(JSON.stringify(project));
    buildAppNetwork(project);
    expect(project).toEqual(before);
  });

  it("does not write into project.calculationSnapshots", () => {
    const project = minimalValidProject();
    expect(project.calculationSnapshots ?? []).toHaveLength(0);
    buildAppNetwork(project);
    expect(project.calculationSnapshots ?? []).toHaveLength(0);
  });

  it("does not introduce any pandapower-named fields on the AppNetwork", () => {
    const result = buildAppNetwork(minimalValidProject());
    if (result.network === null) return;
    const json = JSON.stringify(result.network);
    expect(json.toLowerCase()).not.toContain("pandapower");
    expect(json).not.toContain('"bus":'); // PRD §8 illustrative name guardrail
    expect(json).not.toContain('"inService"');
  });
});
