import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { initialAppState, ProjectProvider, projectReducer } from "../src/state/projectStore.js";
import { ValidationPanel } from "../src/components/ValidationPanel.js";

const NOW = "2026-05-01T00:00:00+00:00";

describe("ValidationPanel", () => {
  it("renders the empty-project I-NET-001 info row by default", () => {
    render(
      <ProjectProvider>
        <ValidationPanel />
      </ProjectProvider>,
    );
    const row = screen.getByTestId("issue-I-NET-001");
    expect(row).toBeTruthy();
    expect(row.getAttribute("data-severity")).toBe("info");
  });

  it("renders runtime issues including draft I-EQ-001 after adding a bus", () => {
    let state = initialAppState(NOW);
    state = projectReducer(state, { type: "addEquipment", kind: "bus", now: NOW });
    render(
      <ProjectProvider initial={state}>
        <ValidationPanel />
      </ProjectProvider>,
    );
    expect(screen.getByTestId("issue-I-EQ-001")).toBeTruthy();
    expect(screen.getByTestId("validation-status-badge").textContent).toBe("error");
  });

  it("severity filter narrows the visible issue list", () => {
    let state = initialAppState(NOW);
    state = projectReducer(state, { type: "addEquipment", kind: "bus", now: NOW });
    render(
      <ProjectProvider initial={state}>
        <ValidationPanel />
      </ProjectProvider>,
    );
    fireEvent.click(screen.getByTestId("validation-filter-info"));
    expect(screen.getByTestId("issue-I-EQ-001")).toBeTruthy();
    expect(screen.queryByTestId("issue-E-NET-001")).toBeNull();
  });

  it("renders the saved-vs-runtime audit note", () => {
    render(
      <ProjectProvider>
        <ValidationPanel />
      </ProjectProvider>,
    );
    const note = screen.getByTestId("validation-audit-note");
    expect(note.textContent).toMatch(/audit reference/i);
  });
});
