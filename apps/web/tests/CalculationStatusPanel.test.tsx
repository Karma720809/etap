// Stage 2 PR #5 — CalculationStatusPanel + run path tests.
//
// The panel is now wired to the runtime CalculationStore. Tests below
// inject a stub SidecarTransport so the panel can drive a real run
// path without spawning Python. They also pin the AC18 guardrail —
// no fake numeric output before a successful run — which PR #5 must
// preserve.

import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { getDemoFixture } from "@power-system-study/fixtures";
import type {
  SidecarHealth,
  SidecarTransport,
  SolverInput,
  SolverResult,
} from "@power-system-study/solver-adapter";
import { SOLVER_INPUT_VERSION } from "@power-system-study/solver-adapter";
import type { ValidationSummary } from "@power-system-study/schemas";

import { CalculationStatusPanel } from "../src/components/CalculationStatusPanel.js";
import { ProjectProvider } from "../src/state/projectStore.js";
import { CalculationProvider } from "../src/state/calculationStore.js";

const VALID_SUMMARY: ValidationSummary = { status: "valid", issues: [] };
const ERROR_SUMMARY: ValidationSummary = {
  status: "error",
  issues: [
    {
      code: "E-NET-001",
      severity: "error",
      message: "Electrical model has no in-service utility or generator source.",
    },
  ],
};

function fakeSuccessSolverResult(input: SolverInput): SolverResult {
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
      angleDeg: -0.5,
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
    return fakeSuccessSolverResult(input);
  }
  async runShortCircuit(): Promise<never> {
    // Stage 3 PR #3 — UI panel tests do not exercise Short Circuit.
    throw new Error("StubTransport.runShortCircuit not implemented for panel tests");
  }
}

function renderPanel(opts: { validation: ValidationSummary; transport?: SidecarTransport | null }) {
  return render(
    <ProjectProvider>
      <CalculationProvider validation={opts.validation} transport={opts.transport ?? null}>
        <CalculationStatusPanel validation={opts.validation} />
      </CalculationProvider>
    </ProjectProvider>,
  );
}

const STAGE_MODULES = ["loadFlow", "voltageDrop", "shortCircuit", "cableSizing", "report"] as const;

describe("CalculationStatusPanel — gating", () => {
  it("disables Run when no transport is configured and shows the reason", () => {
    renderPanel({ validation: VALID_SUMMARY });
    const button = screen.getByTestId("calc-run-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByTestId("calc-disabled-reason").textContent).toMatch(/transport/i);
  });

  it("flips every Stage 2 module status to disabled_by_validation when there are validation errors", () => {
    renderPanel({ validation: ERROR_SUMMARY, transport: new StubTransport() });
    expect(screen.getByTestId("calc-module-loadFlow-status").textContent).toBe("disabled_by_validation");
    expect(screen.getByTestId("calc-module-voltageDrop-status").textContent).toBe("disabled_by_validation");
    const button = screen.getByTestId("calc-run-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByTestId("calc-validation-block").textContent).toMatch(/E-NET-001/);
  });

  it("shows the Stage 3+ modules as not_implemented even when the run is enabled", () => {
    renderPanel({ validation: VALID_SUMMARY, transport: new StubTransport() });
    for (const id of ["shortCircuit", "cableSizing", "report"] as const) {
      expect(screen.getByTestId(`calc-module-${id}-status`).textContent).toBe("not_implemented");
    }
    // Sanity: Stage 2 modules are not "not_implemented" when readiness is clean.
    expect(screen.getByTestId("calc-module-loadFlow-status").textContent).toBe("ready_to_run");
    expect(screen.getByTestId("calc-module-voltageDrop-status").textContent).toBe("ready_to_run");
  });

  it("does not render numeric result values before a run completes (AC18 guardrail)", () => {
    renderPanel({ validation: VALID_SUMMARY, transport: new StubTransport() });
    expect(screen.queryByTestId("result-tables")).toBeNull();
    expect(screen.queryByTestId("result-table-buses")).toBeNull();
  });

  it("never renders five all-stage placeholders post-PR #5 (only S3+ are placeholders)", () => {
    renderPanel({ validation: VALID_SUMMARY, transport: new StubTransport() });
    let placeholderCount = 0;
    for (const id of STAGE_MODULES) {
      if (screen.getByTestId(`calc-module-${id}-status`).textContent === "not_implemented") {
        placeholderCount += 1;
      }
    }
    expect(placeholderCount).toBe(3); // shortCircuit / cableSizing / report
  });
});

describe("CalculationStatusPanel — run path", () => {
  it("runs the load flow against the demo fixture and renders Load Flow / Voltage Drop tables", async () => {
    // The demo fixture is a Stage 1 valid project, so readiness clears
    // and the Run button is enabled with the stub transport injected.
    const transport = new StubTransport();
    render(
      <ProjectProvider
        initial={{
          project: getDemoFixture(),
          selectedInternalId: null,
          isDirty: false,
        }}
      >
        <CalculationProvider validation={VALID_SUMMARY} transport={transport}>
          <CalculationStatusPanel validation={VALID_SUMMARY} />
        </CalculationProvider>
      </ProjectProvider>,
    );

    const button = screen.getByTestId("calc-run-button") as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    await act(async () => {
      button.click();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("result-tables")).not.toBeNull();
    });
    expect(screen.getByTestId("result-table-buses")).toBeTruthy();
    expect(screen.getByTestId("result-table-branches")).toBeTruthy();
    expect(screen.getByTestId("result-table-voltage-drop")).toBeTruthy();
    // Voltage Drop derived (not failed) → no E-VD-001 placeholder.
    expect(screen.queryByTestId("result-vd-failed")).toBeNull();
  });
});
