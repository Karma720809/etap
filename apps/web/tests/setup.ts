import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Ensures each test runs against a fresh DOM. Without this, repeated render()
// calls in the same describe() block leak markup from earlier tests and break
// getByTestId on shared identifiers.
afterEach(() => {
  cleanup();
});
