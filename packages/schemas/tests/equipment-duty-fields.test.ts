import { describe, expect, it } from "vitest";
import {
  BusSchema,
  CableSchema,
  ProtectiveDeviceSchema,
  SwitchDeviceSchema,
  ProjectMetadataSchema,
  ProjectShortCircuitDefaultsSchema,
} from "../src/index.js";

// Stage 3 ED-PR-01 — schema-only smoke tests for the optional Equipment Duty
// rating fields defined in the Stage 3 Equipment Duty spec (ED-OQ-01 / ED-OQ-04).
//
// Scope: prove the canonical Stage 1 schema accepts the new optional fields,
// preserves backward compatibility by allowing them to be absent, and rejects
// non-positive or null values (rating fields are not nullable — absence is the
// "missing rating" signal).
//
// These tests do NOT exercise any runtime / orchestrator / sidecar / UI code.

const ISO = "2026-05-01T00:00:00+09:00";

const baseAuditFields = {
  createdAt: ISO,
  updatedAt: ISO,
};

const baseBus = {
  internalId: "eq_bus_demo_001",
  tag: "BUS-DEMO-001",
  kind: "bus" as const,
  vnKv: 0.4,
  voltageType: "AC" as const,
  topology: "3P4W" as const,
  minVoltagePct: 95,
  maxVoltagePct: 105,
  ...baseAuditFields,
};

const baseCable = {
  internalId: "eq_cbl_demo_001",
  tag: "CBL-DEMO-001",
  kind: "cable" as const,
  fromBus: "eq_bus_demo_001",
  toBus: "eq_bus_demo_002",
  voltageGradeKv: 0.6,
  conductorMaterial: "Cu" as const,
  conductorSizeMm2: 240,
  lengthM: 80,
  status: "in_service" as const,
  ...baseAuditFields,
};

const baseSwitch = {
  internalId: "eq_sw_demo_001",
  tag: "SW-DEMO-001",
  kind: "switch" as const,
  fromBus: "eq_bus_demo_001",
  toBus: "eq_bus_demo_002",
  state: "closed" as const,
  status: "in_service" as const,
  ...baseAuditFields,
};

const baseBreaker = {
  internalId: "eq_brk_demo_001",
  tag: "BRK-DEMO-001",
  kind: "breaker" as const,
  deviceType: "breaker" as const,
  fromBus: "eq_bus_demo_001",
  toBus: "eq_bus_demo_002",
  state: "closed" as const,
  ratedVoltageKv: 0.4,
  ratedCurrentA: 400,
  status: "in_service" as const,
  ...baseAuditFields,
};

const baseProjectMetadata = {
  projectId: "PJT-DEMO-ED-001",
  projectName: "ED-PR-01 schema test",
  standard: "IEC" as const,
  frequencyHz: 60 as const,
  createdAt: ISO,
  updatedAt: ISO,
};

describe("ED-PR-01 Bus duty fields", () => {
  it("accepts a Bus with no Equipment Duty fields (existing project shape)", () => {
    const result = BusSchema.safeParse(baseBus);
    expect(result.success).toBe(true);
  });

  it("accepts a Bus carrying all three Equipment Duty fields with positive values", () => {
    const result = BusSchema.safeParse({
      ...baseBus,
      shortTimeWithstandKa: 50,
      shortTimeWithstandDurationS: 1,
      peakWithstandKa: 105,
    });
    expect(result.success).toBe(true);
  });

  it.each([
    "shortTimeWithstandKa",
    "shortTimeWithstandDurationS",
    "peakWithstandKa",
  ] as const)("rejects a Bus where %s is zero", (field) => {
    const result = BusSchema.safeParse({ ...baseBus, [field]: 0 });
    expect(result.success).toBe(false);
  });

  it.each([
    "shortTimeWithstandKa",
    "shortTimeWithstandDurationS",
    "peakWithstandKa",
  ] as const)("rejects a Bus where %s is negative", (field) => {
    const result = BusSchema.safeParse({ ...baseBus, [field]: -1 });
    expect(result.success).toBe(false);
  });

  it.each([
    "shortTimeWithstandKa",
    "shortTimeWithstandDurationS",
    "peakWithstandKa",
  ] as const)("rejects a Bus where %s is null (absence is the missing-rating signal)", (field) => {
    const result = BusSchema.safeParse({ ...baseBus, [field]: null });
    expect(result.success).toBe(false);
  });
});

describe("ED-PR-01 Cable duty fields", () => {
  it("accepts a Cable with no shortCircuitKValue (existing project shape)", () => {
    const result = CableSchema.safeParse(baseCable);
    expect(result.success).toBe(true);
  });

  it("accepts a Cable carrying a positive shortCircuitKValue (e.g., 143 for Cu/PVC)", () => {
    const result = CableSchema.safeParse({ ...baseCable, shortCircuitKValue: 143 });
    expect(result.success).toBe(true);
  });

  it("rejects a Cable where shortCircuitKValue is zero", () => {
    const result = CableSchema.safeParse({ ...baseCable, shortCircuitKValue: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a Cable where shortCircuitKValue is null", () => {
    const result = CableSchema.safeParse({ ...baseCable, shortCircuitKValue: null });
    expect(result.success).toBe(false);
  });

});

describe("ED-PR-01 Switch duty fields", () => {
  it("accepts a Switch with no Equipment Duty fields", () => {
    const result = SwitchDeviceSchema.safeParse(baseSwitch);
    expect(result.success).toBe(true);
  });

  it("accepts a Switch carrying all three Equipment Duty fields", () => {
    const result = SwitchDeviceSchema.safeParse({
      ...baseSwitch,
      shortTimeWithstandKa: 25,
      shortTimeWithstandDurationS: 1,
      peakWithstandKa: 52.5,
    });
    expect(result.success).toBe(true);
  });

  it.each([
    "shortTimeWithstandKa",
    "shortTimeWithstandDurationS",
    "peakWithstandKa",
  ] as const)("rejects a Switch where %s is zero", (field) => {
    const result = SwitchDeviceSchema.safeParse({ ...baseSwitch, [field]: 0 });
    expect(result.success).toBe(false);
  });
});

describe("ED-PR-01 Breaker duty fields", () => {
  it("accepts a Breaker with no Equipment Duty fields", () => {
    const result = ProtectiveDeviceSchema.safeParse(baseBreaker);
    expect(result.success).toBe(true);
  });

  it("accepts a Breaker carrying interruptingCapacityKa and peakWithstandKa", () => {
    const result = ProtectiveDeviceSchema.safeParse({
      ...baseBreaker,
      interruptingCapacityKa: 50,
      peakWithstandKa: 105,
    });
    expect(result.success).toBe(true);
  });

  it.each(["interruptingCapacityKa", "peakWithstandKa"] as const)(
    "rejects a Breaker where %s is zero",
    (field) => {
      const result = ProtectiveDeviceSchema.safeParse({ ...baseBreaker, [field]: 0 });
      expect(result.success).toBe(false);
    },
  );
});

describe("ED-PR-01 ProjectMetadata.shortCircuit.defaultFaultClearingS", () => {
  it("accepts a project with no shortCircuit block", () => {
    const result = ProjectMetadataSchema.safeParse(baseProjectMetadata);
    expect(result.success).toBe(true);
  });

  it("accepts a project with shortCircuit.defaultFaultClearingS set to a positive value", () => {
    const result = ProjectMetadataSchema.safeParse({
      ...baseProjectMetadata,
      shortCircuit: { defaultFaultClearingS: 0.5 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty shortCircuit block (defaultFaultClearingS itself is optional)", () => {
    const result = ProjectMetadataSchema.safeParse({
      ...baseProjectMetadata,
      shortCircuit: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects shortCircuit.defaultFaultClearingS = 0", () => {
    const result = ProjectShortCircuitDefaultsSchema.safeParse({ defaultFaultClearingS: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys inside shortCircuit (strict block)", () => {
    const result = ProjectMetadataSchema.safeParse({
      ...baseProjectMetadata,
      shortCircuit: { defaultFaultClearingS: 0.5, somethingElse: true },
    });
    expect(result.success).toBe(false);
  });
});

// Forbidden-alias coverage. The complete alias names defined as off-limits by
// ED-OQ-01 must NOT be silently accepted by the canonical strict schemas. We
// build each alias key from fragments at runtime so the contiguous alias
// strings never appear as literal source tokens in this test file (the
// canonical-drift test enforces the same rule against the schema sources).
//
// Rendered test names use the fragment array, so Vitest does not splice the
// contiguous alias into reporter output either.
describe("ED-PR-01 forbidden alias names are not silently accepted", () => {
  const aliasCases = [
    {
      schemaName: "BusSchema",
      schema: BusSchema,
      base: baseBus,
      fragments: ["bus", "Peak", "Withstand", "Ka"] as const,
    },
    {
      schemaName: "ProtectiveDeviceSchema",
      schema: ProtectiveDeviceSchema,
      base: baseBreaker,
      fragments: ["breaker", "Making", "Ka"] as const,
    },
    {
      schemaName: "CableSchema",
      schema: CableSchema,
      base: baseCable,
      fragments: ["cable", "Short", "Circuit", "K", "Value"] as const,
    },
  ];

  for (const { schemaName, schema, base, fragments } of aliasCases) {
    const aliasKey = fragments.join("");
    it(`${schemaName} rejects alias key built from fragments [${fragments.join(" + ")}]`, () => {
      const result = schema.safeParse({ ...base, [aliasKey]: 1 });
      expect(result.success).toBe(false);
    });
  }
});
