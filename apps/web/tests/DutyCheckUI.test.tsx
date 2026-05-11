// Stage 3 ED-PR-04 — Equipment Duty UI tests.
//
// Pins the four UI invariants required by the ED-PR-04 brief:
//   1. The Run Equipment Duty button is disabled while readiness is
//      blocked (no SC bundle, stale SC, validation error).
//   2. The blocked reason is surfaced as visible text from the
//      readiness wrapper's structured issue.
//   3. Running Equipment Duty after a successful SC run stores a
//      `duty_check_bundle` retention record (calculation-store wiring
//      from ED-PR-03 still in effect).
//   4. The result table renders rows from the ED-PR-02 contract and
//      shows null numerics as `—` (em dash) — never `0`.
//
// Plus the spec §10 isolation guardrail: project serialization is
// identical before and after a Duty Check run (ED-PR-01..04 must
// keep the canonical project file untouched).

import { describe, expect, it } from "vitest";
import { useEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { getDemoFixture } from "@power-system-study/fixtures";
import { serializeProjectFile } from "@power-system-study/project-io";
import {
  SOLVER_INPUT_VERSION,
  type ShortCircuitRequest,
  type ShortCircuitSidecarResponse,
  type SidecarHealth,
  type SidecarTransport,
  type SolverInput,
  type SolverResult,
} from "@power-system-study/solver-adapter";
import type { ValidationSummary } from "@power-system-study/schemas";

import { CalculationStatusPanel } from "../src/components/CalculationStatusPanel.js";
import {
  CalculationProvider,
  useCalculation,
} from "../src/state/calculationStore.js";
import {
  ProjectProvider,
  useProjectState,
} from "../src/state/projectStore.js";

// ED-PR-05 closeout — two carryover UI tests pin the stale-upstream
// and failed-upstream `calc-dc-disabled-reason` paths flagged in
// PR #23's Codex non-blocking review. The readiness wrapper
// (`packages/duty-check/src/readiness.ts`) already routes both
// states through the same `dutyCheckDisabledReason` surface as the
// no-bundle case covered above; these tests are tests-only — no UI
// behavior change is required.

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
  async runShortCircuit(
    request: ShortCircuitRequest,
  ): Promise<ShortCircuitSidecarResponse> {
    return fakeSuccessShortCircuitResponse(request);
  }
}

// ED-PR-05 carryover — a stub that returns a wire-level
// `failed_solver` SC response so the orchestrator normalizes
// `bundle.shortCircuit.status` to `"failed"`. The duty-check
// readiness wrapper then routes the upstream-failed message
// through `dutyCheckDisabledReason`. No transport-level throw —
// the wire status itself drives the failure.
class FailedShortCircuitTransport implements SidecarTransport {
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
  async runShortCircuit(
    request: ShortCircuitRequest,
  ): Promise<ShortCircuitSidecarResponse> {
    return {
      status: "failed_solver",
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
      buses: [],
      issues: [
        {
          code: "E-SC-002",
          severity: "error",
          message: "Sidecar solver reported a fatal error (stub).",
        },
      ],
    };
  }
}

function renderPanel(opts: {
  validation: ValidationSummary;
  transport?: SidecarTransport | null;
}) {
  return render(
    <ProjectProvider
      initial={{
        project: getDemoFixture(),
        selectedInternalId: null,
        isDirty: false,
      }}
    >
      <CalculationProvider
        validation={opts.validation}
        transport={opts.transport ?? null}
      >
        <CalculationStatusPanel validation={opts.validation} />
      </CalculationProvider>
    </ProjectProvider>,
  );
}

describe("CalculationStatusPanel — Equipment Duty gating (ED-PR-04)", () => {
  it("Run Equipment Duty is disabled when no SC bundle has been produced (blocked_by_upstream)", () => {
    renderPanel({ validation: VALID_SUMMARY, transport: new StubTransport() });
    const button = screen.getByTestId("calc-run-dc-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    // The disabled-reason text comes from the readiness wrapper's
    // structured issue ("No Short Circuit run available; …").
    expect(screen.getByTestId("calc-dc-disabled-reason").textContent).toMatch(
      /Short Circuit/i,
    );
    // The module status reflects the upstream block.
    expect(
      screen.getByTestId("calc-module-equipmentDuty-status").textContent,
    ).toBe("blocked_by_upstream");
  });

  it("Run Equipment Duty is disabled while validation has errors (blocked_by_validation)", () => {
    renderPanel({ validation: ERROR_SUMMARY, transport: new StubTransport() });
    const button = screen.getByTestId("calc-run-dc-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(
      screen.getByTestId("calc-module-equipmentDuty-status").textContent,
    ).toBe("disabled_by_validation");
  });

  it("Run Equipment Duty enables after a successful Short Circuit run (ready_to_run)", async () => {
    renderPanel({ validation: VALID_SUMMARY, transport: new StubTransport() });
    const scButton = screen.getByTestId("calc-run-sc-button") as HTMLButtonElement;
    await act(async () => {
      scButton.click();
    });
    await waitFor(() => {
      expect(screen.queryByTestId("result-table-short-circuit")).not.toBeNull();
    });
    const dcButton = screen.getByTestId("calc-run-dc-button") as HTMLButtonElement;
    expect(dcButton.disabled).toBe(false);
    // The disabled-reason chip is gone once readiness clears.
    expect(screen.queryByTestId("calc-dc-disabled-reason")).toBeNull();
    expect(
      screen.getByTestId("calc-module-equipmentDuty-status").textContent,
    ).toBe("ready_to_run");
  });
});

describe("CalculationStatusPanel — Equipment Duty result table (ED-PR-04)", () => {
  it("renders rows from the ED-PR-02 contract and shows null numerics as em dashes (never 0)", async () => {
    renderPanel({ validation: VALID_SUMMARY, transport: new StubTransport() });
    // Establish SC readiness first.
    await act(async () => {
      (screen.getByTestId("calc-run-sc-button") as HTMLButtonElement).click();
    });
    await waitFor(() => {
      expect(screen.queryByTestId("result-table-short-circuit")).not.toBeNull();
    });
    // Now Equipment Duty.
    await act(async () => {
      (screen.getByTestId("calc-run-dc-button") as HTMLButtonElement).click();
    });
    await waitFor(() => {
      expect(screen.queryByTestId("result-table-duty-check")).not.toBeNull();
    });

    // The demo fixture carries breakers / switches / buses / cables;
    // ED-PR-03 emits a `not_evaluated` / `missing_rating` /
    // `not_applicable` row per criterion. We don't pin a specific
    // rowcount (fixture changes are routine) — instead we pin:
    //   - at least one row exists,
    //   - every numeric cell renders as `—`, never `0`,
    //   - the visible status badges are from the contract vocabulary.
    const table = screen.getByTestId("result-table-duty-check");
    const rowEls = table.querySelectorAll("[data-testid^='result-dc-row-']");
    // Rows include status / duty / rating / util / margin sub-cells,
    // so we filter to the parent `<tr>` ids only.
    const rowIds = new Set<string>();
    rowEls.forEach((el) => {
      const id = el.getAttribute("data-testid")!;
      // Strip `-status`, `-duty`, etc. suffixes.
      const m = id.match(/^result-dc-row-(.+?)(?:-(?:status|duty|rating|util|margin|issues|issue-.+))?$/);
      if (m) rowIds.add(`result-dc-row-${m[1]}`);
    });
    expect(rowIds.size).toBeGreaterThan(0);

    for (const rowId of rowIds) {
      // Every numeric cell on every row is `—` — ED-PR-03 never
      // emits computed duty / rating / util / margin numerics.
      const duty = screen.getByTestId(`${rowId}-duty`).textContent ?? "";
      const rating = screen.getByTestId(`${rowId}-rating`).textContent ?? "";
      const util = screen.getByTestId(`${rowId}-util`).textContent ?? "";
      const margin = screen.getByTestId(`${rowId}-margin`).textContent ?? "";
      for (const cell of [duty, rating, util, margin]) {
        expect(cell.trim()).toBe("—");
        expect(cell.trim()).not.toBe("0");
        expect(cell.trim()).not.toBe("0.000");
      }
      const status = screen.getByTestId(`${rowId}-status`).textContent ?? "";
      // The contract status vocabulary — pinned explicitly so a new
      // future status would force the test to update.
      expect([
        "pass",
        "fail",
        "missing_rating",
        "not_applicable",
        "not_evaluated",
      ]).toContain(status.trim());
    }
  });
});

describe("CalculationStore — Equipment Duty serialization isolation (ED-PR-04)", () => {
  it("project serialization is identical before and after a Duty Check run", async () => {
    interface Captured {
      before: string;
      after: string | null;
      hasDcBundle: boolean;
      hasDutyRetention: boolean;
    }
    const captured: Captured = {
      before: "",
      after: null,
      hasDcBundle: false,
      hasDutyRetention: false,
    };

    function Harness() {
      const { state: project } = useProjectState();
      const { state: calc, dutyCheck, runShortCircuit, runDutyCheck } =
        useCalculation();

      useEffect(() => {
        if (captured.before === "") {
          captured.before = serializeProjectFile(project.project);
        }
      }, [project.project]);
      useEffect(() => {
        captured.hasDcBundle = dutyCheck.bundle !== null;
        if (dutyCheck.bundle !== null) {
          captured.after = serializeProjectFile(project.project);
        }
        for (const k of Object.keys(calc.retainedResults)) {
          if (k.startsWith("duty_check_bundle::")) {
            captured.hasDutyRetention = true;
          }
        }
      }, [calc.retainedResults, dutyCheck.bundle, project.project]);

      return (
        <div>
          <button
            type="button"
            data-testid="harness-run-sc"
            onClick={() => void runShortCircuit()}
          />
          <button
            type="button"
            data-testid="harness-run-dc"
            onClick={() => runDutyCheck()}
          />
        </div>
      );
    }

    const { getByTestId } = render(
      <ProjectProvider
        initial={{
          project: getDemoFixture(),
          selectedInternalId: null,
          isDirty: false,
        }}
      >
        <CalculationProvider
          validation={VALID_SUMMARY}
          transport={new StubTransport()}
        >
          <Harness />
        </CalculationProvider>
      </ProjectProvider>,
    );

    expect(captured.before).not.toBe("");
    await act(async () => {
      (getByTestId("harness-run-sc") as HTMLButtonElement).click();
    });
    await act(async () => {
      (getByTestId("harness-run-dc") as HTMLButtonElement).click();
    });
    await waitFor(() => expect(captured.hasDcBundle).toBe(true));

    // The Duty Check bundle is retained in the calculation-store
    // under the duty_check_bundle key (ED-PR-03 wiring).
    expect(captured.hasDutyRetention).toBe(true);

    // Spec §10 / Equipment Duty spec §4.6: the canonical project
    // file is unchanged after a Duty Check run. No
    // calculationResults growth, no calculationSnapshots populated.
    expect(captured.after).not.toBeNull();
    const parsed = JSON.parse(captured.after!);
    expect(parsed).not.toHaveProperty("calculationResults");
    expect(parsed.calculationSnapshots).toEqual([]);
    expect(captured.after).toBe(captured.before);
  });
});

// ED-PR-05 carryover: explicit UI tests for the stale-SC and
// failed-SC `dutyCheckDisabledReason` paths (PR #23 Codex
// non-blocking review). Both paths are already wired through the
// ED-PR-03 readiness wrapper; these tests pin the user-facing text
// on the `calc-dc-disabled-reason` chip and the module status
// rendered in the Equipment Duty row.
describe("CalculationStatusPanel — Equipment Duty stale upstream (ED-PR-05 carryover)", () => {
  it("disables Run Equipment Duty with the stale-upstream message after a project edit invalidates the SC bundle", async () => {
    // Harness exposes the project dispatch so the test can flip the
    // SC retention slot to stale via a project ref change. The panel
    // itself does the surfacing.
    function StaleHarness() {
      const { dispatch: projectDispatch } = useProjectState();
      return (
        <>
          <CalculationStatusPanel validation={VALID_SUMMARY} />
          <button
            type="button"
            data-testid="harness-edit"
            onClick={() =>
              projectDispatch({
                type: "addEquipment",
                kind: "bus",
                now: "2026-05-02T00:00:00Z",
              })
            }
          />
        </>
      );
    }

    render(
      <ProjectProvider
        initial={{
          project: getDemoFixture(),
          selectedInternalId: null,
          isDirty: false,
        }}
      >
        <CalculationProvider
          validation={VALID_SUMMARY}
          transport={new StubTransport()}
        >
          <StaleHarness />
        </CalculationProvider>
      </ProjectProvider>,
    );

    // Establish a successful SC run so an SC bundle is retained and
    // the readiness wrapper would otherwise return `ready_to_run`.
    await act(async () => {
      (screen.getByTestId("calc-run-sc-button") as HTMLButtonElement).click();
    });
    await waitFor(() => {
      expect(screen.queryByTestId("result-table-short-circuit")).not.toBeNull();
    });
    const dcButton = screen.getByTestId("calc-run-dc-button") as HTMLButtonElement;
    expect(dcButton.disabled).toBe(false);

    // Mutate the project — the calculation store dispatches
    // `markStale` + `scMarkStale` on the next render, flipping the
    // React-side SC lifecycle to `"stale"`. The readiness wrapper
    // then returns `blocked_by_stale_upstream` with its dedicated
    // message.
    await act(async () => {
      (screen.getByTestId("harness-edit") as HTMLButtonElement).click();
    });

    await waitFor(() => {
      // The SC stale badge appears once the lifecycle flips — use it
      // as the synchronization signal so the duty-check readiness
      // memo has consumed the new lifecycle.
      expect(screen.queryByTestId("calc-sc-stale-badge")).not.toBeNull();
    });

    const dcButtonStale = screen.getByTestId(
      "calc-run-dc-button",
    ) as HTMLButtonElement;
    expect(dcButtonStale.disabled).toBe(true);

    const reason = screen.getByTestId("calc-dc-disabled-reason").textContent ?? "";
    expect(reason).toMatch(/stale/i);
    expect(reason).toMatch(/re-?run Short Circuit/i);

    // The Equipment Duty module status cell collapses both
    // `blocked_by_upstream` and `blocked_by_stale_upstream` into the
    // single `blocked_by_upstream` literal (panel intentionally —
    // the precise reason is on the disabled-reason chip).
    expect(
      screen.getByTestId("calc-module-equipmentDuty-status").textContent,
    ).toBe("blocked_by_upstream");
  });
});

describe("CalculationStatusPanel — Equipment Duty failed upstream (ED-PR-05 carryover)", () => {
  it("disables Run Equipment Duty with the upstream-failed message when the SC run resolves to status=failed", async () => {
    renderPanel({
      validation: VALID_SUMMARY,
      transport: new FailedShortCircuitTransport(),
    });

    // Equipment Duty is initially blocked because no SC run has
    // happened — same `blocked_by_upstream` surface as the existing
    // no-bundle test, just the starting state.
    expect(
      (screen.getByTestId("calc-run-dc-button") as HTMLButtonElement).disabled,
    ).toBe(true);

    // Fire the SC run. The wire response is `failed_solver`, so the
    // orchestrator normalizes the bundle to
    // `shortCircuit.status === "failed"`. The React store retains
    // the failed bundle on the SC slot (`dispatchSc({ scFailed,
    // bundle })`), so `shortCircuit.bundle !== null` on the next
    // render — the readiness wrapper's branch-4 check
    // (`args.shortCircuit.shortCircuit.status === "failed"`) is the
    // one that fires here, not branch-2 (`shortCircuit === null`).
    await act(async () => {
      (screen.getByTestId("calc-run-sc-button") as HTMLButtonElement).click();
    });

    await waitFor(() => {
      // The SC start-error notice appears once the failure routes
      // through `dispatchSc({ scFailed, ... })`.
      expect(screen.queryByTestId("calc-sc-start-error")).not.toBeNull();
    });

    const dcButton = screen.getByTestId("calc-run-dc-button") as HTMLButtonElement;
    expect(dcButton.disabled).toBe(true);

    const reason = screen.getByTestId("calc-dc-disabled-reason").textContent ?? "";
    expect(reason).toMatch(/Short Circuit run failed/i);
    expect(reason).toMatch(/Equipment Duty cannot evaluate/i);

    expect(
      screen.getByTestId("calc-module-equipmentDuty-status").textContent,
    ).toBe("blocked_by_upstream");
  });
});
