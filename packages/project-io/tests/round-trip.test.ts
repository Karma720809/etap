import { describe, expect, it } from "vitest";
import { getDemoFixture } from "@power-system-study/fixtures";
import { loadProjectFile, serializeProjectFile } from "../src/index.js";

describe("project I/O round-trip", () => {
  it("load → serialize → load is idempotent and byte-stable", () => {
    const fixture = getDemoFixture();
    const firstSerialized = serializeProjectFile(fixture);

    const loadedOnce = loadProjectFile(firstSerialized);
    expect(loadedOnce.schemaErrors).toBeUndefined();
    expect(loadedOnce.project).toBeDefined();

    const secondSerialized = serializeProjectFile(loadedOnce.project!);
    expect(secondSerialized).toBe(firstSerialized);

    const thirdSerialized = serializeProjectFile(loadProjectFile(secondSerialized).project!);
    expect(thirdSerialized).toBe(firstSerialized);
  });

  it("preserves saved validation through round-trip even though runtime validation is authoritative", () => {
    const fixture = getDemoFixture();
    const serialized = serializeProjectFile(fixture);
    const loaded = loadProjectFile(serialized);

    expect(loaded.savedValidation).toEqual(fixture.validation);
    expect(loaded.runtimeValidation).toBeDefined();
    // Saved validation is reference-only; runtime validation is computed independently.
    expect(loaded.runtimeValidation).not.toBe(loaded.savedValidation);
  });
});
