import { describe, expect, it } from "vitest";
import { kindToTagPrefix, nextAutoTagFor, advanceCounter } from "../src/index.js";

// Stage 1 default tag prefixes per stage_1_one_line_diagram_mvp_spec_rev_d.md.
// Locking these in a test prevents silent drift if anyone reorders or renames a kind.
const EXPECTED_PREFIXES = {
  utility: "UTL",
  generator: "GEN",
  bus: "BUS",
  transformer: "TR",
  cable: "CBL",
  breaker: "BRK",
  switch: "SW",
  load: "LD",
  motor: "M",
  mcc_placeholder: "MCC",
  switchgear_placeholder: "SWGR",
} as const;

describe("kindToTagPrefix", () => {
  it("returns LD for load (Stage 1 spec uses LD, not LOAD)", () => {
    expect(kindToTagPrefix("load")).toBe("LD");
  });

  it.each(Object.entries(EXPECTED_PREFIXES))(
    "kind=%s → prefix=%s",
    (kind, expected) => {
      expect(kindToTagPrefix(kind as keyof typeof EXPECTED_PREFIXES)).toBe(expected);
    },
  );
});

describe("nextAutoTagFor", () => {
  it("emits LD-001 for the first auto-tagged load", () => {
    const { tag, counters } = nextAutoTagFor({}, "load");
    expect(tag).toBe("LD-001");
    expect(counters).toEqual({ LD: 1 });
  });

  it("monotonically increments and never reuses numbers", () => {
    let counters = {};
    const r1 = nextAutoTagFor(counters, "bus");
    const r2 = nextAutoTagFor(r1.counters, "bus");
    const r3 = nextAutoTagFor(r2.counters, "bus");
    expect(r1.tag).toBe("BUS-001");
    expect(r2.tag).toBe("BUS-002");
    expect(r3.tag).toBe("BUS-003");
    expect(r3.counters).toEqual({ BUS: 3 });
  });
});

describe("advanceCounter", () => {
  it("treats a missing prefix as 0 and returns 1", () => {
    const { counters, nextValue } = advanceCounter({}, "TR");
    expect(nextValue).toBe(1);
    expect(counters).toEqual({ TR: 1 });
  });
});
