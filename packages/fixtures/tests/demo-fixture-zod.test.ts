import { describe, expect, it } from "vitest";
import { PowerSystemProjectFileSchema } from "@power-system-study/schemas";
import { getDemoFixture } from "../src/index.js";

describe("demo fixture — Zod schema", () => {
  it("passes the canonical Zod schema", () => {
    const fixture = getDemoFixture();
    const parse = PowerSystemProjectFileSchema.safeParse(fixture);
    if (!parse.success) {
      // Print the first few issues for fast triage if this ever regresses.
      // eslint-disable-next-line no-console
      console.error(parse.error.issues.slice(0, 5));
    }
    expect(parse.success).toBe(true);
  });

  it("calculationSnapshots is reserved and present as an empty array", () => {
    const fixture = getDemoFixture();
    expect(fixture.calculationSnapshots).toEqual([]);
  });

  it("does NOT contain a calculationResults field", () => {
    const fixture = getDemoFixture() as unknown as Record<string, unknown>;
    expect("calculationResults" in fixture).toBe(false);
  });
});
