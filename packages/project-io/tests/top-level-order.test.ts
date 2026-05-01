import { describe, expect, it } from "vitest";
import { STAGE1_TOP_LEVEL_KEY_ORDER } from "@power-system-study/schemas";
import { getDemoFixture } from "@power-system-study/fixtures";
import { serializeProjectFile } from "../src/index.js";

describe("deterministic top-level ordering", () => {
  it("serialized JSON top-level keys appear in the documented order", () => {
    const fixture = getDemoFixture();
    const serialized = serializeProjectFile(fixture);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    const actualOrder = Object.keys(parsed);

    const expected = STAGE1_TOP_LEVEL_KEY_ORDER.filter((k) => k in parsed);
    expect(actualOrder).toEqual(expected);
  });

  it("top-level key order is exactly the documented Stage 1 order", () => {
    expect(STAGE1_TOP_LEVEL_KEY_ORDER).toEqual([
      "schemaVersion",
      "appVersion",
      "project",
      "equipment",
      "diagram",
      "scenarios",
      "calculationSnapshots",
      "tagCounters",
      "validation",
    ]);
  });
});
