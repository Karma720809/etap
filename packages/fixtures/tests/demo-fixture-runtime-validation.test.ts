import { describe, expect, it } from "vitest";
import { validateProject } from "@power-system-study/validation";
import { getDemoFixture } from "../src/index.js";

describe("demo fixture — runtime validation", () => {
  it("passes runtime validation with status='valid' (no errors, no warnings)", () => {
    const fixture = getDemoFixture();
    const result = validateProject(fixture);
    if (result.status !== "valid") {
      // eslint-disable-next-line no-console
      console.error("Demo fixture runtime validation issues:", result.issues);
    }
    expect(result.issues).toEqual([]);
    expect(result.status).toBe("valid");
  });
});
