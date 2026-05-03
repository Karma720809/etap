// Stage 3 PR #5 — ShortCircuitResultTable rendering tests.
//
// These tests construct hand-crafted `ShortCircuitResult` fixtures and
// render the standalone table component in isolation. They focus on
// the no-fake-numbers UI invariants:
//   - Null numerics render as an em dash (`—`), never `0`.
//   - Failed and unavailable rows are visually distinct via the
//     status badge, and never look like populated `ok` rows.
//   - The container hides itself when no `ShortCircuitResult` exists.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DEFAULT_SOLVER_OPTIONS,
  type ShortCircuitResult,
} from "@power-system-study/solver-adapter";

import { ShortCircuitResultTable } from "../src/components/ShortCircuitResultTable.js";

const NOW = "2026-05-02T00:00:00Z";

function makeResult(
  overrides: Partial<ShortCircuitResult> = {},
): ShortCircuitResult {
  return {
    resultId: "scr_t",
    runtimeSnapshotId: "snap_t",
    scenarioId: "SCN-N",
    module: "shortCircuit",
    status: "valid",
    faultType: "threePhase",
    calculationCase: "maximum",
    voltageFactor: 1,
    busResults: [
      {
        busInternalId: "eq_bus_mv",
        tag: "BUS-MV",
        voltageLevelKv: 6.6,
        ikssKa: 12.34,
        ipKa: 31.5,
        ithKa: 13,
        skssMva: 141.1,
        status: "ok",
        issueCodes: [],
      },
    ],
    issues: [],
    metadata: {
      solverName: "pandapower",
      solverVersion: "stub",
      adapterVersion: "0.0.0-test",
      solverOptions: { ...DEFAULT_SOLVER_OPTIONS },
      executedAt: NOW,
      inputHash: null,
      networkHash: null,
    },
    createdAt: NOW,
    ...overrides,
  };
}

describe("ShortCircuitResultTable — render gating", () => {
  it("renders nothing when no ShortCircuitResult exists", () => {
    render(<ShortCircuitResultTable result={null} />);
    expect(screen.queryByTestId("result-table-short-circuit")).toBeNull();
  });

  it("renders the table when a ShortCircuitResult is supplied", () => {
    render(<ShortCircuitResultTable result={makeResult()} />);
    expect(screen.getByTestId("result-table-short-circuit")).toBeTruthy();
    expect(screen.getByTestId("result-sc-bus-eq_bus_mv-status").textContent).toBe(
      "ok",
    );
  });
});

describe("ShortCircuitResultTable — null numerics render as em dash, never 0", () => {
  it("renders em dash for null Ip / Ith when computePeak/Thermal disabled", () => {
    const result = makeResult({
      busResults: [
        {
          busInternalId: "eq_bus_mv",
          tag: "BUS-MV",
          voltageLevelKv: 6.6,
          ikssKa: 12.34,
          ipKa: null,
          ithKa: null,
          skssMva: 141.1,
          status: "ok",
          issueCodes: [],
        },
      ],
    });
    render(<ShortCircuitResultTable result={result} />);
    const row = screen.getByTestId("result-sc-bus-eq_bus_mv");
    // No fabricated zeros: ip / ith cells must render the em dash.
    expect(row.textContent).toContain("—");
    expect(row.textContent).not.toMatch(/\b0\.000\b/);
    expect(row.textContent).toContain("12.340");
  });

  it("failed row renders all numerics as em dash and a distinct status badge", () => {
    const result = makeResult({
      status: "warning",
      busResults: [
        {
          busInternalId: "eq_bus_failed",
          tag: "BUS-F",
          voltageLevelKv: 6.6,
          ikssKa: null,
          ipKa: null,
          ithKa: null,
          skssMva: null,
          status: "failed",
          issueCodes: ["E-SC-001"],
        },
      ],
    });
    render(<ShortCircuitResultTable result={result} />);
    const row = screen.getByTestId("result-sc-bus-eq_bus_failed");
    expect(screen.getByTestId("result-sc-bus-eq_bus_failed-status").textContent).toBe(
      "failed",
    );
    // Numeric columns all render em dashes.
    const dashCount = (row.textContent ?? "").split("—").length - 1;
    expect(dashCount).toBeGreaterThanOrEqual(4); // ikss/ip/ith/skss
    // No fake zeros leaked into the row.
    expect(row.textContent).not.toMatch(/\b0\.000\b/);
    expect(row.textContent).not.toMatch(/\b0\.00\b/);
  });

  it("unavailable row renders distinctly and never as a populated ok row", () => {
    const result = makeResult({
      busResults: [
        {
          busInternalId: "eq_bus_unavail",
          tag: "BUS-U",
          voltageLevelKv: 0.4,
          ikssKa: null,
          ipKa: null,
          ithKa: null,
          skssMva: null,
          status: "unavailable",
          issueCodes: [],
        },
      ],
    });
    render(<ShortCircuitResultTable result={result} />);
    const badge = screen.getByTestId("result-sc-bus-eq_bus_unavail-status");
    expect(badge.textContent).toBe("unavailable");
    expect(badge.textContent).not.toBe("ok");
  });
});

describe("ShortCircuitResultTable — failed result with no rows", () => {
  it("shows the failed empty-state with the issue code and no bus rows", () => {
    const result = makeResult({
      status: "failed",
      busResults: [],
      issues: [
        {
          code: "E-SC-001",
          severity: "error",
          message: "solver sidecar transport failure: simulated",
        },
      ],
    });
    render(<ShortCircuitResultTable result={result} />);
    expect(screen.getByTestId("result-sc-failed").textContent).toContain("E-SC-001");
    // No row test ids leak into the DOM.
    expect(screen.queryByTestId(/result-sc-bus-/)).toBeNull();
  });
});
