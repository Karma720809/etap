import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { initialAppState, ProjectProvider, projectReducer } from "../src/state/projectStore.js";
import { PropertyPanel } from "../src/components/PropertyPanel.js";

const NOW = "2026-05-01T00:00:00+00:00";

function preselectedBusState() {
  let state = initialAppState(NOW);
  state = projectReducer(state, { type: "addEquipment", kind: "bus", now: NOW });
  return state;
}

describe("PropertyPanel — internalId / tag policy", () => {
  it("renders internalId as a read-only code element and a tag input that is editable", () => {
    const state = preselectedBusState();
    render(
      <ProjectProvider initial={state}>
        <PropertyPanel />
      </ProjectProvider>,
    );

    const tagInput = screen.getByTestId("field-tag") as HTMLInputElement;
    expect(tagInput.tagName).toBe("INPUT");
    expect(tagInput.readOnly).toBe(false);
    expect(tagInput.value).toBe("BUS-001");

    // internalId is shown but as read-only <code>, not as an editable input.
    const internalId = state.project.equipment.buses[0]!.internalId;
    expect(screen.getByText(internalId)).toBeTruthy();
    // No input field carries the internalId value.
    const allInputs = screen.queryAllByDisplayValue(internalId);
    expect(allInputs).toHaveLength(0);
  });

  it("typing into the tag input dispatches updateEquipment but never mutates internalId", () => {
    const state = preselectedBusState();
    render(
      <ProjectProvider initial={state}>
        <PropertyPanel />
      </ProjectProvider>,
    );
    const tagInput = screen.getByTestId("field-tag") as HTMLInputElement;
    fireEvent.change(tagInput, { target: { value: "BUS-MV-MAIN" } });
    expect((screen.getByTestId("field-tag") as HTMLInputElement).value).toBe("BUS-MV-MAIN");
  });
});
