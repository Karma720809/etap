import demoFixtureJson from "./stage_1_demo_fixture.json" with { type: "json" };
import type { PowerSystemProjectFile } from "@power-system-study/schemas";

// Static immutable demo fixture object. For mutable scenarios in tests, use getDemoFixture().
export const demoFixture = demoFixtureJson as PowerSystemProjectFile;

// Returns a fresh deep clone each call so test mutation does not pollute siblings.
export function getDemoFixture(): PowerSystemProjectFile {
  return JSON.parse(JSON.stringify(demoFixtureJson)) as PowerSystemProjectFile;
}
