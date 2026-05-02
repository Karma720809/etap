// Stage 2 PR #5 — runtime CalculationStore guardrail tests.
//
// These tests pin two PR #5 invariants:
//
//   1. The runtime LoadFlowRunBundle is held outside the
//      `PowerSystemProjectFile`. Running a calculation must not grow
//      the project file with a `calculationResults` field, must not
//      populate `calculationSnapshots`, and must serialize to the
//      same JSON whether or not a run has happened.
//   2. When the underlying project changes after a run, the bundle
//      is marked stale (status === "stale") so the user knows to
//      re-run; we never auto-recompute.

import { describe, expect, it } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { getDemoFixture } from "@power-system-study/fixtures";
import { serializeProjectFile } from "@power-system-study/project-io";
import {
  SOLVER_INPUT_VERSION,
  type SidecarHealth,
  type SidecarTransport,
  type SolverInput,
  type SolverResult,
} from "@power-system-study/solver-adapter";
import type { ValidationSummary } from "@power-system-study/schemas";

import {
  CalculationProvider,
  useCalculation,
} from "../src/state/calculationStore.js";
import {
  ProjectProvider,
  useProjectState,
} from "../src/state/projectStore.js";

const VALID_SUMMARY: ValidationSummary = { status: "valid", issues: [] };

function fakeSolverResult(input: SolverInput): SolverResult {
  return {
    status: "succeeded",
    converged: true,
    metadata: {
      solverName: "pandapower",
      solverVersion: "stub",
      adapterVersion: "stub",
      options: input.options,
      executedAt: "2026-05-02T00:00:00Z",
      inputHash: null,
      networkHash: null,
    },
    buses: input.buses.map((b) => ({
      internalId: b.internalId,
      voltageKv: b.vnKv * 0.99,
      voltagePuPct: 99,
      angleDeg: 0,
    })),
    branches: input.transformers.map((tx) => ({
      internalId: tx.internalId,
      branchKind: "transformer" as const,
      fromBusInternalId: tx.fromBusInternalId,
      toBusInternalId: tx.toBusInternalId,
      pMwFrom: 0.05,
      qMvarFrom: 0.02,
      pMwTo: -0.0499,
      qMvarTo: -0.0199,
      currentA: 4.5,
      loadingPct: 5,
      lossKw: 0.1,
    })),
    issues: [],
  };
}

class StubTransport implements SidecarTransport {
  async health(): Promise<SidecarHealth> {
    return {
      sidecarName: "stub",
      sidecarVersion: "0.0.0",
      contractInputVersion: SOLVER_INPUT_VERSION,
      solverName: "pandapower",
      solverVersion: "stub",
      status: "ok",
    };
  }
  async runLoadFlow(input: SolverInput): Promise<SolverResult> {
    return fakeSolverResult(input);
  }
}

interface Captured {
  serializedBefore: string;
  serializedAfter: string | null;
  hasBundle: boolean;
  calcStatus: string;
  staleAfterEdit: boolean;
}

function CaptureHarness({
  capture,
  triggerEdit,
}: {
  capture: Captured;
  triggerEdit: { current: boolean };
}) {
  const { state: project, dispatch: projectDispatch } = useProjectState();
  const { state: calc, runCalculation } = useCalculation();

  useEffect(() => {
    capture.serializedBefore = serializeProjectFile(project.project);
  }, [capture, project.project]);

  useEffect(() => {
    capture.hasBundle = calc.bundle !== null;
    capture.calcStatus = calc.lifecycle;
    if (calc.bundle !== null && triggerEdit.current === false) {
      // Snapshot the post-run serialization once the bundle settles.
      capture.serializedAfter = serializeProjectFile(project.project);
    }
    if (calc.lifecycle === "stale") {
      capture.staleAfterEdit = true;
    }
  }, [calc.bundle, calc.lifecycle, capture, project.project, triggerEdit]);

  return (
    <div>
      <button
        type="button"
        data-testid="harness-run"
        onClick={() => void runCalculation()}
      />
      <button
        type="button"
        data-testid="harness-edit"
        onClick={() =>
          projectDispatch({ type: "addEquipment", kind: "bus", now: "2026-05-02T00:00:00Z" })
        }
      />
    </div>
  );
}

describe("CalculationStore — runtime-only guardrail", () => {
  it("does not add calculationResults to the project file after a successful run", async () => {
    const transport = new StubTransport();
    const captured: Captured = {
      serializedBefore: "",
      serializedAfter: null,
      hasBundle: false,
      calcStatus: "idle",
      staleAfterEdit: false,
    };
    const triggerEdit = { current: false };

    const { getByTestId } = render(
      <ProjectProvider
        initial={{ project: getDemoFixture(), selectedInternalId: null, isDirty: false }}
      >
        <CalculationProvider validation={VALID_SUMMARY} transport={transport}>
          <CaptureHarness capture={captured} triggerEdit={triggerEdit} />
        </CalculationProvider>
      </ProjectProvider>,
    );

    expect(captured.serializedBefore).not.toBe("");

    await act(async () => {
      (getByTestId("harness-run") as HTMLButtonElement).click();
    });
    await waitFor(() => expect(captured.hasBundle).toBe(true));

    // Stage 1 schema unchanged — no calculationResults growth, and
    // calculationSnapshots stays the empty array per spec §10.
    expect(captured.serializedAfter).not.toBeNull();
    const parsed = JSON.parse(captured.serializedAfter!);
    expect(parsed).not.toHaveProperty("calculationResults");
    expect(parsed.calculationSnapshots).toEqual([]);

    // The serialized JSON before and after the run must be identical.
    expect(captured.serializedAfter).toBe(captured.serializedBefore);
  });

  it("marks the runtime result as 'stale' after the project changes", async () => {
    const transport = new StubTransport();
    const captured: Captured = {
      serializedBefore: "",
      serializedAfter: null,
      hasBundle: false,
      calcStatus: "idle",
      staleAfterEdit: false,
    };
    const triggerEdit = { current: false };

    const { getByTestId } = render(
      <ProjectProvider
        initial={{ project: getDemoFixture(), selectedInternalId: null, isDirty: false }}
      >
        <CalculationProvider validation={VALID_SUMMARY} transport={transport}>
          <CaptureHarness capture={captured} triggerEdit={triggerEdit} />
        </CalculationProvider>
      </ProjectProvider>,
    );

    await act(async () => {
      (getByTestId("harness-run") as HTMLButtonElement).click();
    });
    await waitFor(() => expect(captured.hasBundle).toBe(true));
    expect(captured.calcStatus).toBe("succeeded");

    triggerEdit.current = true;
    await act(async () => {
      (getByTestId("harness-edit") as HTMLButtonElement).click();
    });
    await waitFor(() => expect(captured.staleAfterEdit).toBe(true));
  });
});
