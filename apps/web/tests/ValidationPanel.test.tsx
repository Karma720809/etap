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

  it("each issue row shows severity, code, message, and field/path metadata as visible text (AC19)", () => {
    let state = initialAppState(NOW);
    state = projectReducer(state, { type: "addEquipment", kind: "bus", now: NOW });
    render(
      <ProjectProvider initial={state}>
        <ValidationPanel />
      </ProjectProvider>,
    );

    // I-EQ-001 (info, draft) carries equipmentInternalId + tag + field, so the
    // location strip should render the tag and the field name.
    const draftRow = screen.getByTestId("issue-I-EQ-001");
    const draftSeverity = screen.getByTestId("issue-I-EQ-001-severity");
    const draftCode = screen.getByTestId("issue-I-EQ-001-code");
    const draftMessage = screen.getByTestId("issue-I-EQ-001-message");
    const draftLocation = screen.getByTestId("issue-I-EQ-001-location");
    expect(draftRow.textContent).toMatch(/info/i);
    expect(draftSeverity.textContent?.trim().toLowerCase()).toBe("info");
    expect(draftCode.textContent).toBe("I-EQ-001");
    expect(draftMessage.textContent).toMatch(/required field 'vnKv' is missing/i);
    expect(draftLocation.textContent).toMatch(/BUS-001/);
    expect(draftLocation.textContent).toMatch(/field: vnKv/);

    // E-NET-001 has no equipmentInternalId; severity + code + message must
    // still all render as user-visible text.
    const sourceRow = screen.getByTestId("issue-E-NET-001");
    const sourceSeverity = screen.getByTestId("issue-E-NET-001-severity");
    const sourceCode = screen.getByTestId("issue-E-NET-001-code");
    const sourceMessage = screen.getByTestId("issue-E-NET-001-message");
    expect(sourceRow.textContent).toMatch(/error/i);
    expect(sourceSeverity.textContent?.trim().toLowerCase()).toBe("error");
    expect(sourceCode.textContent).toBe("E-NET-001");
    expect(sourceMessage.textContent?.length ?? 0).toBeGreaterThan(0);
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
