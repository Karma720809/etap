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
  ShortCircuitRequest,
  ShortCircuitSidecarResponse,
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

function fakeSuccessShortCircuitResponse(
  request: ShortCircuitRequest,
): ShortCircuitSidecarResponse {
  return {
    status: "succeeded",
    metadata: {
      solverName: "pandapower",
      solverVersion: "stub",
      adapterVersion: "stub",
      options: request.solverInput.options,
      executedAt: "2026-05-02T00:00:00Z",
      inputHash: null,
      networkHash: null,
    },
    shortCircuit: {
      calculationCase: "maximum",
      faultType: "threePhase",
      computePeak: request.shortCircuitOptions.computePeak,
      computeThermal: request.shortCircuitOptions.computeThermal,
      voltageFactor: 1,
    },
    buses: request.solverInput.buses.map((b) => ({
      internalId: b.internalId,
      voltageLevelKv: b.vnKv,
      ikssKa: 12.34,
      ipKa: 31.5,
      ithKa: 13.0,
      skssMva: 141.1,
      status: "valid" as const,
    })),
    issues: [],
  };
}

class StubTransport implements SidecarTransport {
  public scCallCount = 0;
  public lfCallCount = 0;
  constructor(
    private readonly scResponder?: (
      request: ShortCircuitRequest,
    ) => Promise<ShortCircuitSidecarResponse> | ShortCircuitSidecarResponse,
  ) {}
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
    this.lfCallCount += 1;
    return fakeSuccessSolverResult(input);
  }
  async runShortCircuit(
    request: ShortCircuitRequest,
  ): Promise<ShortCircuitSidecarResponse> {
    this.scCallCount += 1;
    if (this.scResponder) return this.scResponder(request);
    return fakeSuccessShortCircuitResponse(request);
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

  it("shows Stage 4+ modules as not_implemented; Stage 3 Short Circuit graduates to ready_to_run", () => {
    // Stage 3 PR #5 wires the Short Circuit module into the panel,
    // so it no longer shows as `not_implemented`. Cable Sizing and
    // Report Export remain placeholders for Stage 4 / Stage 5.
    renderPanel({ validation: VALID_SUMMARY, transport: new StubTransport() });
    for (const id of ["cableSizing", "report"] as const) {
      expect(screen.getByTestId(`calc-module-${id}-status`).textContent).toBe("not_implemented");
    }
    // Sanity: Stage 2 + Stage 3 modules are not "not_implemented".
    expect(screen.getByTestId("calc-module-loadFlow-status").textContent).toBe("ready_to_run");
    expect(screen.getByTestId("calc-module-voltageDrop-status").textContent).toBe("ready_to_run");
    expect(screen.getByTestId("calc-module-shortCircuit-status").textContent).toBe("ready_to_run");
  });

  it("does not render numeric result values before a run completes (AC18 guardrail)", () => {
    renderPanel({ validation: VALID_SUMMARY, transport: new StubTransport() });
    expect(screen.queryByTestId("result-tables")).toBeNull();
    expect(screen.queryByTestId("result-table-buses")).toBeNull();
    // Stage 3 PR #5 — no Short Circuit table before a real SC run.
    expect(screen.queryByTestId("result-table-short-circuit")).toBeNull();
  });

  it("renders only Stage 4+ placeholders post-Stage-3-PR-#5", () => {
    renderPanel({ validation: VALID_SUMMARY, transport: new StubTransport() });
    let placeholderCount = 0;
    for (const id of STAGE_MODULES) {
      if (screen.getByTestId(`calc-module-${id}-status`).textContent === "not_implemented") {
        placeholderCount += 1;
      }
    }
    expect(placeholderCount).toBe(2); // cableSizing / report only
  });
});

describe("CalculationStatusPanel — Short Circuit gating (Stage 3 PR #5)", () => {
  it("disables Run Short Circuit when no transport is configured", () => {
    renderPanel({ validation: VALID_SUMMARY });
    const button = screen.getByTestId("calc-run-sc-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("flips Short Circuit module to disabled_by_validation when there are validation errors", () => {
    renderPanel({ validation: ERROR_SUMMARY, transport: new StubTransport() });
    expect(screen.getByTestId("calc-module-shortCircuit-status").textContent).toBe(
      "disabled_by_validation",
    );
    const button = screen.getByTestId("calc-run-sc-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("Short Circuit module is ready_to_run when transport + validation pass", () => {
    renderPanel({ validation: VALID_SUMMARY, transport: new StubTransport() });
    expect(screen.getByTestId("calc-module-shortCircuit-status").textContent).toBe(
      "ready_to_run",
    );
    const button = screen.getByTestId("calc-run-sc-button") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});

describe("CalculationStatusPanel — Short Circuit run path (Stage 3 PR #5)", () => {
  it("Run Short Circuit triggers the SC orchestrator only — does not call runLoadFlow", async () => {
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

    const scButton = screen.getByTestId("calc-run-sc-button") as HTMLButtonElement;
    await act(async () => {
      scButton.click();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("result-table-short-circuit")).not.toBeNull();
    });
    expect(transport.scCallCount).toBe(1);
    expect(transport.lfCallCount).toBe(0);
    // Stage 2 LF/VD tables remain absent since SC ran in isolation.
    expect(screen.queryByTestId("result-tables")).toBeNull();
    expect(
      screen.getByTestId("calc-module-shortCircuit-status").textContent,
    ).toBe("succeeded");
  });

  it("failed Short Circuit surfaces the structured E-SC-* issue and does not show fake numbers", async () => {
    const transport = new StubTransport((request) => ({
      status: "failed_solver" as const,
      metadata: {
        solverName: "pandapower" as const,
        solverVersion: "stub",
        adapterVersion: "stub",
        options: request.solverInput.options,
        executedAt: "2026-05-02T00:00:00Z",
        inputHash: null,
        networkHash: null,
      },
      shortCircuit: {
        calculationCase: "maximum" as const,
        faultType: "threePhase" as const,
        computePeak: true,
        computeThermal: true,
        voltageFactor: 1,
      },
      buses: [],
      issues: [
        {
          code: "E-SC-001" as const,
          severity: "error" as const,
          message: "pandapower calc_sc raised: simulated",
        },
      ],
    }));
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

    const scButton = screen.getByTestId("calc-run-sc-button") as HTMLButtonElement;
    await act(async () => {
      scButton.click();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("result-sc-failed")).not.toBeNull();
    });
    expect(
      screen.getByTestId("calc-module-shortCircuit-status").textContent,
    ).toBe("failed");
    expect(screen.getByTestId("calc-sc-issue-E-SC-001")).toBeTruthy();
    // No fake numbers: the failed empty state mentions the code and
    // does not render a populated row.
    expect(screen.queryByTestId(/result-sc-bus-/)).toBeNull();
  });

  it("LF run path still works after PR #5 (does not call runShortCircuit)", async () => {
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

    const lfButton = screen.getByTestId("calc-run-button") as HTMLButtonElement;
    await act(async () => {
      lfButton.click();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("result-tables")).not.toBeNull();
    });
    expect(transport.lfCallCount).toBe(1);
    expect(transport.scCallCount).toBe(0);
    // SC table absent — the LF Run button must not implicitly run SC.
    expect(screen.queryByTestId("result-table-short-circuit")).toBeNull();
    expect(
      screen.getByTestId("calc-module-shortCircuit-status").textContent,
    ).toBe("ready_to_run");
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
