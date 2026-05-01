import { describe, expect, it } from "vitest";
import { validateProject } from "@power-system-study/validation";
import { getDemoFixture } from "../src/index.js";

describe("demo fixture — runtime validation", () => {
  it("passes runtime validation with no errors", () => {
    const fixture = getDemoFixture();
    const result = validateProject(fixture);
    if (result.status === "error") {
      // eslint-disable-next-line no-console
      console.error("Demo fixture runtime validation issues:", result.issues);
    }
    // The demo cable has manually entered rOhmPerKm/xOhmPerKm to demonstrate a
    // realistic feeder, so PR #3's W-CBL-001 audit hint is expected here. Any
    // other warning/error would indicate a regression.
    const unexpected = result.issues.filter((i) => i.code !== "W-CBL-001");
    expect(unexpected).toEqual([]);
    expect(result.status).not.toBe("error");
  });
});
