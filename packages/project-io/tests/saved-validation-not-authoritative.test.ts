import { describe, expect, it } from "vitest";
import { getDemoFixture } from "@power-system-study/fixtures";
import { loadProjectFile, serializeProjectFile } from "../src/index.js";

describe("saved validation is audit-only; runtime validation is authoritative", () => {
  it("a stale saved validation that claims status='valid' does not override runtime validation", () => {
    // Take a fixture and corrupt its connectivity (a bus reference becomes dangling)
    // while leaving the saved validation block untouched at status='valid'.
    const corrupt = getDemoFixture();
    const motor = corrupt.equipment.motors[0]!;
    motor.connectedBus = "eq_bus_does_not_exist";
    // Saved validation block is still status='valid' from the original fixture.

    const serialized = serializeProjectFile(corrupt);
    const loaded = loadProjectFile(serialized);

    expect(loaded.savedValidation?.status).toBe("valid");
    // Runtime validation must surface the dangling bus reference, regardless
    // of what the saved validation block claims.
    expect(loaded.runtimeValidation).toBeDefined();
    expect(loaded.runtimeValidation!.status).not.toBe("valid");
    expect(loaded.runtimeValidation!.issues.some((i) => i.code === "E-NET-003")).toBe(true);
  });
});
