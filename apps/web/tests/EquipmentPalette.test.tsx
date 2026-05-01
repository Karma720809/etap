import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectProvider } from "../src/state/projectStore.js";
import { EquipmentPalette } from "../src/components/EquipmentPalette.js";

const STAGE1_KINDS = [
  "utility",
  "generator",
  "bus",
  "transformer",
  "cable",
  "breaker",
  "switch",
  "load",
  "motor",
  "mcc_placeholder",
  "switchgear_placeholder",
] as const;

describe("EquipmentPalette", () => {
  it("renders one button per Stage 1 equipment kind (11 total)", () => {
    render(
      <ProjectProvider>
        <EquipmentPalette />
      </ProjectProvider>,
    );

    for (const kind of STAGE1_KINDS) {
      expect(screen.getByTestId(`palette-${kind}`)).toBeTruthy();
    }
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(STAGE1_KINDS.length);
  });
});
