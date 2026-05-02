import { describe, expect, it } from "vitest";
import { buildAppNetwork } from "../src/index.js";
import { generator, minimalValidProject, utility } from "./test-helpers.js";

describe("buildAppNetwork — source / slack policy (S2-OQ source rules)", () => {
  it("accepts exactly one in-service utility as the slack", () => {
    const result = buildAppNetwork(minimalValidProject());
    expect(result.status).toBe("valid");
    if (result.appNetwork === null) return;
    const slacks = result.appNetwork.sources.filter((s) => s.role === "slack");
    expect(slacks).toHaveLength(1);
    expect(slacks[0]?.internalId).toBe("eq_util_1");
  });

  it("emits E-LF-003 when two utilities are simultaneously in_service", () => {
    const project = minimalValidProject();
    project.equipment.utilities.push(
      utility({ internalId: "eq_util_2", tag: "UTL-2", connectedBus: "eq_bus_mv", vnKv: 6.6, status: "in_service" }),
    );
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(result.issues.some((i) => i.code === "E-LF-003")).toBe(true);
  });

  it("emits E-LF-003 + E-NET-001 when no in-service source exists", () => {
    const project = minimalValidProject();
    project.equipment.utilities = [];
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(result.issues.some((i) => i.code === "E-NET-001")).toBe(true);
    expect(result.issues.some((i) => i.code === "E-LF-003")).toBe(true);
  });

  it("includes a grid_parallel_pq generator as NetworkGeneratorPQ alongside the utility slack", () => {
    const project = minimalValidProject();
    project.equipment.generators = [
      generator({
        internalId: "eq_gen_1",
        tag: "GEN-1",
        connectedBus: "eq_bus_lv",
        operatingMode: "grid_parallel_pq",
        pMw: 0.5,
        qMvar: 0.1,
      }),
    ];
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.appNetwork === null) return;
    expect(result.appNetwork.generators).toHaveLength(1);
    expect(result.appNetwork.generators[0]?.busInternalId).toBe("eq_bus_lv");
    expect(result.appNetwork.generators[0]?.pMw).toBe(0.5);

    const sources = result.appNetwork.sources;
    expect(sources.find((s) => s.kind === "generator_pq")?.role).toBe("pq");
    expect(sources.find((s) => s.kind === "utility")?.role).toBe("slack");
  });

  it("emits E-LF-003 + W-GEN-001 for an in-service pv_voltage_control generator", () => {
    const project = minimalValidProject();
    // Replace the utility with a PV-mode generator so there is no other slack.
    project.equipment.utilities = [];
    project.equipment.generators = [
      generator({
        internalId: "eq_gen_pv",
        tag: "GEN-PV",
        connectedBus: "eq_bus_mv",
        operatingMode: "pv_voltage_control",
      }),
    ];
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(result.issues.some((i) => i.code === "E-LF-003")).toBe(true);
    expect(result.warnings.some((w) => w.code === "W-GEN-001")).toBe(true);
  });

  it("emits E-LF-003 for an in-service island_isochronous generator with no other slack", () => {
    const project = minimalValidProject();
    project.equipment.utilities = [];
    project.equipment.generators = [
      generator({
        internalId: "eq_gen_island",
        tag: "GEN-IS",
        connectedBus: "eq_bus_mv",
        operatingMode: "island_isochronous",
      }),
    ];
    const result = buildAppNetwork(project);
    expect(result.status).toBe("invalid");
    expect(result.issues.some((i) => i.code === "E-LF-003")).toBe(true);
  });

  it("ignores out-of-service generators silently", () => {
    const project = minimalValidProject();
    project.equipment.generators = [
      generator({
        internalId: "eq_gen_off",
        tag: "GEN-OFF",
        connectedBus: "eq_bus_mv",
        status: "out_of_service",
        operatingMode: "out_of_service",
      }),
    ];
    const result = buildAppNetwork(project);
    expect(result.status).toBe("valid");
    if (result.appNetwork === null) return;
    expect(result.appNetwork.generators).toHaveLength(0);
  });
});
