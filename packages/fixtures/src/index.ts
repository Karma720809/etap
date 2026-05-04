import demoFixtureJson from "./stage_1_demo_fixture.json" with { type: "json" };
import type { PowerSystemProjectFile } from "@power-system-study/schemas";

// Static immutable demo fixture object. For mutable scenarios in tests, use getDemoFixture().
export const demoFixture = demoFixtureJson as PowerSystemProjectFile;

// Returns a fresh deep clone each call so test mutation does not pollute siblings.
export function getDemoFixture(): PowerSystemProjectFile {
  return JSON.parse(JSON.stringify(demoFixtureJson)) as PowerSystemProjectFile;
}

// ---------------------------------------------------------------------------
// Stage 3 Short Circuit Golden Case GC-SC-01 — see the Node-only subpath
// `@power-system-study/fixtures/golden-cases/gc-sc-01` for the loader and
// `parseGoldenCasePercentTolerance` helper. The root entrypoint stays
// browser-safe (no `node:fs` / `node:path` / `node:url` imports) so
// `apps/web` can keep importing the demo fixture from this module.
// ---------------------------------------------------------------------------
