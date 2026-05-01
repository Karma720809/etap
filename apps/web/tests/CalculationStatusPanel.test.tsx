import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalculationStatusPanel } from "../src/components/CalculationStatusPanel.js";

const VALID_SUMMARY = { status: "valid" as const, issues: [] };
const ERROR_SUMMARY = {
  status: "error" as const,
  issues: [
    { code: "E-NET-001", severity: "error" as const, message: "Electrical model has no in-service utility or generator source." },
  ],
};

const STAGE1_MODULES = ["loadFlow", "voltageDrop", "shortCircuit", "cableSizing", "report"] as const;

describe("CalculationStatusPanel", () => {
  it("renders the Stage 1 not-implemented notice and one card per calculation module", () => {
    render(<CalculationStatusPanel validation={VALID_SUMMARY} />);
    expect(screen.getByTestId("calc-status-stage1-notice").textContent).toMatch(/not implemented in Stage 1/i);
    for (const id of STAGE1_MODULES) {
      const card = screen.getByTestId(`calc-module-${id}`);
      expect(card).toBeTruthy();
      const status = screen.getByTestId(`calc-module-${id}-status`);
      expect(status.textContent).toBe("not_implemented");
    }
  });

  it("flips every module status to disabled_by_validation when an error is present", () => {
    render(<CalculationStatusPanel validation={ERROR_SUMMARY} />);
    for (const id of STAGE1_MODULES) {
      const status = screen.getByTestId(`calc-module-${id}-status`);
      expect(status.textContent).toBe("disabled_by_validation");
    }
  });

  it("never renders a numeric calculation result", () => {
    render(<CalculationStatusPanel validation={VALID_SUMMARY} />);
    const panel = screen.getByTestId("calculation-status-panel");
    // No bare numbers should appear inside any module card; all numeric "result" surfaces are absent.
    expect(panel.textContent).not.toMatch(/MW|kW|Mvar|p\.u\.|kA|Hz/);
  });
});
