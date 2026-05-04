// Stage 3 PR #7 — GC-SC-01 executable Golden Case at the orchestrator layer.
//
// This file is the orchestrator-layer half of the GC-SC-01 integration.
// It does three things:
//
//   1. (Always) loads the GC-SC-01 support-package artifact through the
//      fixtures-package loader, builds an AppNetwork from its
//      `input.projectFile`, and asserts the network is structurally
//      runnable (slack source present, LV fault target reachable, no
//      validation errors).
//
//   2. (Always) drives `runShortCircuitForAppNetwork` with a stub
//      transport that replays the documented hand-calc reference values.
//      This proves the loader → orchestrator → comparison pipeline is
//      wired end-to-end and that the documented tolerance bands accept
//      the documented expected numerics — without running pandapower.
//
//   3. (Opt-in `RUN_GOLDEN_CASE_VERIFICATION=1` + `RUN_SIDECAR_INTEGRATION=1`)
//      runs the real Python sidecar against the GC-SC-01 fixture and
//      compares per-bus `Ik''` and `ip` against the artifact's documented
//      reference within the artifact's documented tolerance. The
//      hand-calc assumes the simplified-IEC option set
//      (`voltageFactorC = 1.0`, `applyKt = false`, `applyKg = false`,
//      motor / generator excluded — see hand-calc note §11). The current
//      sidecar does not pin pandapower's `case="max"` voltage factor to
//      1.0, so this strict comparison is gated behind a separate flag
//      until S3-OQ-08 alignment ships — see the Stage 3 closeout §4.1
//      for the residual gap.
//
// What this file is NOT:
//   - It does NOT modify the static support-package artifact in
//     `docs/stage-1-baseline/...`. The artifact remains the
//     authoritative document; this test consumes it via the loader.
//   - It does NOT fabricate expected values. Every numeric comparison
//     reads `gc.expected.*` and `gc.tolerance.*` straight off the
//     artifact (task instruction: "Do not invent or fake expected
//     values").
//   - It does NOT promote GC-SC-01 to a "verified" Stage 3 acceptance
//     owner. Promotion requires the strict comparison test to pass
//     under the documented assumption set; until then GC-SC-01 ships as
//     `provisional` per spec §3.3.

import { describe, expect, it } from "vitest";
import { buildAppNetwork } from "@power-system-study/network-model";
import {
  getGoldenCaseGcSc01,
  parseGoldenCasePercentTolerance,
} from "@power-system-study/fixtures";

import {
  runShortCircuitForAppNetwork,
  SOLVER_INPUT_VERSION,
  type ShortCircuitRequest,
  type ShortCircuitSidecarResponse,
  type SidecarTransport,
} from "../src/index.js";
import {
  StdioSidecarTransport,
  DEFAULT_SIDECAR_SCRIPT_PATH,
} from "../src/stdioSidecarTransport.js";

const SHOULD_RUN_SIDECAR = process.env.RUN_SIDECAR_INTEGRATION === "1";
const SHOULD_RUN_GOLDEN = process.env.RUN_GOLDEN_CASE_VERIFICATION === "1";
const PYTHON = process.env.SOLVER_PYTHON ?? "python3";

const FAULT_BUS_INTERNAL_ID = "eq_bus_lv_001";

// ---------------------------------------------------------------------------
// Layer 1 — AppNetwork build (always runs)
// ---------------------------------------------------------------------------

describe("GC-SC-01 — AppNetwork build from fixture", () => {
  it("builds a valid AppNetwork from the artifact's project file", () => {
    const gc = getGoldenCaseGcSc01();
    const result = buildAppNetwork(gc.input.projectFile);

    if (result.status !== "valid") {
      // eslint-disable-next-line no-console
      console.error("buildAppNetwork issues:", result.issues);
    }
    expect(result.status).toBe("valid");
    expect(result.appNetwork).not.toBeNull();
  });

  it("exposes the slack utility, MV bus, transformer, and LV fault target", () => {
    const gc = getGoldenCaseGcSc01();
    const built = buildAppNetwork(gc.input.projectFile);
    expect(built.appNetwork).not.toBeNull();
    const network = built.appNetwork!;

    const slacks = network.sources.filter((s) => s.role === "slack");
    expect(slacks).toHaveLength(1);
    expect(slacks[0]?.scLevelMva).toBe(250);
    expect(slacks[0]?.xrRatio).toBe(10);
    expect(slacks[0]?.voltageFactor).toBe(1);

    expect(network.transformers).toHaveLength(1);
    const tr = network.transformers[0];
    expect(tr?.snMva).toBe(2);
    expect(tr?.vkPercent).toBe(6);
    expect(tr?.vkrPercent).toBe(1);

    const faultBus = network.buses.find(
      (b) => b.internalId === FAULT_BUS_INTERNAL_ID,
    );
    expect(faultBus).toBeDefined();
    expect(faultBus?.vnKv).toBe(0.4);
    expect(faultBus?.topology === "3P3W" || faultBus?.topology === "3P4W").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — orchestrator + comparison harness with stubbed sidecar
//
// Verifies the loader → orchestrator → tolerance-comparison pipeline is
// wired end-to-end without running pandapower. The stub returns the
// documented hand-calc values exactly so the comparison passes; this
// confirms the harness itself is correct. Layer 3 then re-uses the same
// comparison against the real sidecar.
// ---------------------------------------------------------------------------

interface ToleranceComparisonInput {
  ikssKa: number | null;
  ipKa: number | null;
}

interface ToleranceComparisonReference {
  ikssKA: number;
  ipKA: number;
  ikssTolerance: number;
  ipTolerance: number;
}

function relativeError(actual: number, expected: number): number {
  if (expected === 0) {
    throw new Error("relativeError: documented expected value must not be zero");
  }
  return Math.abs(actual - expected) / Math.abs(expected);
}

function assertFaultBusWithinTolerance(
  actual: ToleranceComparisonInput,
  reference: ToleranceComparisonReference,
): void {
  expect(actual.ikssKa).not.toBeNull();
  expect(actual.ipKa).not.toBeNull();
  const ikssErr = relativeError(actual.ikssKa as number, reference.ikssKA);
  const ipErr = relativeError(actual.ipKa as number, reference.ipKA);
  expect(ikssErr).toBeLessThanOrEqual(reference.ikssTolerance);
  expect(ipErr).toBeLessThanOrEqual(reference.ipTolerance);
}

class ReferenceReplayTransport implements SidecarTransport {
  public lastRequest: ShortCircuitRequest | null = null;
  public callCount = 0;

  constructor(
    private readonly faultBusInternalId: string,
    private readonly faultBusVnKv: number,
    private readonly ikssKA: number,
    private readonly ipKA: number,
  ) {}

  async health() {
    return {
      sidecarName: "gc-sc-01-replay",
      sidecarVersion: "0.0.0",
      contractInputVersion: SOLVER_INPUT_VERSION,
      solverName: "pandapower" as const,
      solverVersion: "replayed-from-hand-calc",
      status: "ok" as const,
    };
  }

  async runLoadFlow(): Promise<never> {
    throw new Error("ReferenceReplayTransport: GC-SC-01 is short-circuit only");
  }

  async runShortCircuit(
    request: ShortCircuitRequest,
  ): Promise<ShortCircuitSidecarResponse> {
    this.callCount += 1;
    this.lastRequest = request;
    return {
      status: "succeeded",
      metadata: {
        solverName: "pandapower",
        solverVersion: "replayed-from-hand-calc",
        adapterVersion: "0.0.0-replay",
        options: request.solverInput.options,
        executedAt: "2026-05-04T00:00:00Z",
        inputHash: null,
        networkHash: null,
      },
      shortCircuit: {
        calculationCase: "maximum",
        faultType: "threePhase",
        computePeak: request.shortCircuitOptions.computePeak,
        computeThermal: request.shortCircuitOptions.computeThermal,
        // Replay the documented IEC 60909 voltage factor from the
        // artifact's solverOptions block. Stage 3 PR #7 does not change
        // this — see GC-SC-01 hand-calc note §11.
        voltageFactor: 1.0,
      },
      buses: [
        {
          internalId: this.faultBusInternalId,
          voltageLevelKv: this.faultBusVnKv,
          ikssKa: this.ikssKA,
          ipKa: this.ipKA,
          ithKa: this.ikssKA,
          skssMva: Math.sqrt(3) * this.faultBusVnKv * this.ikssKA,
          status: "valid",
        },
      ],
      issues: [],
    };
  }
}

describe("GC-SC-01 — orchestrator + comparison harness (stubbed sidecar)", () => {
  it("compares replayed reference values against the documented tolerance", async () => {
    const gc = getGoldenCaseGcSc01();
    const built = buildAppNetwork(gc.input.projectFile);
    expect(built.appNetwork).not.toBeNull();
    const network = built.appNetwork!;

    const faultBus = network.buses.find((b) => b.internalId === FAULT_BUS_INTERNAL_ID);
    expect(faultBus).toBeDefined();

    const transport = new ReferenceReplayTransport(
      FAULT_BUS_INTERNAL_ID,
      faultBus!.vnKv,
      gc.expected.ikssKA,
      gc.expected.ipKA,
    );

    const bundle = await runShortCircuitForAppNetwork(network, {
      transport,
      mode: "specific",
      faultTargets: [{ busInternalId: FAULT_BUS_INTERNAL_ID }],
      projectId: gc.input.projectFile.project.projectId,
    });

    expect(transport.callCount).toBe(1);
    expect(bundle.shortCircuit.status).toBe("valid");
    expect(bundle.shortCircuit.voltageFactor).toBe(gc.input.solverOptions.voltageFactorC);

    const lv = bundle.shortCircuit.busResults.find(
      (b) => b.busInternalId === FAULT_BUS_INTERNAL_ID,
    );
    expect(lv).toBeDefined();
    expect(lv?.status).toBe("ok");

    assertFaultBusWithinTolerance(
      { ikssKa: lv?.ikssKa ?? null, ipKa: lv?.ipKa ?? null },
      {
        ikssKA: gc.expected.ikssKA,
        ipKA: gc.expected.ipKA,
        ikssTolerance: parseGoldenCasePercentTolerance(gc.tolerance.ikssKA),
        ipTolerance: parseGoldenCasePercentTolerance(gc.tolerance.ipKA),
      },
    );

    // Status / warning / error tolerance is "exact match" per the artifact.
    expect(bundle.shortCircuit.status).toBe("valid");
    expect(
      bundle.shortCircuit.issues.filter((i) => i.severity === "warning").map((i) => i.code),
    ).toEqual([]);
    expect(
      bundle.shortCircuit.issues.filter((i) => i.severity === "error").map((i) => i.code),
    ).toEqual([]);
  });

  it("fails the comparison when the replayed value sits outside the documented tolerance", async () => {
    const gc = getGoldenCaseGcSc01();
    const built = buildAppNetwork(gc.input.projectFile);
    const network = built.appNetwork!;
    const faultBus = network.buses.find((b) => b.internalId === FAULT_BUS_INTERNAL_ID)!;

    // 5% above the documented Ik'' — well beyond the ±1% tolerance band.
    // The harness must surface this as a real test failure, not silently
    // accept it; that's the protection that keeps the Golden Case from
    // being claimed verified against a drifting solver result.
    const ikssOffByFivePercent = gc.expected.ikssKA * 1.05;
    const transport = new ReferenceReplayTransport(
      FAULT_BUS_INTERNAL_ID,
      faultBus.vnKv,
      ikssOffByFivePercent,
      gc.expected.ipKA,
    );

    const bundle = await runShortCircuitForAppNetwork(network, {
      transport,
      mode: "specific",
      faultTargets: [{ busInternalId: FAULT_BUS_INTERNAL_ID }],
    });

    const lv = bundle.shortCircuit.busResults.find(
      (b) => b.busInternalId === FAULT_BUS_INTERNAL_ID,
    )!;

    expect(() =>
      assertFaultBusWithinTolerance(
        { ikssKa: lv.ikssKa, ipKa: lv.ipKa },
        {
          ikssKA: gc.expected.ikssKA,
          ipKA: gc.expected.ipKA,
          ikssTolerance: parseGoldenCasePercentTolerance(gc.tolerance.ikssKA),
          ipTolerance: parseGoldenCasePercentTolerance(gc.tolerance.ipKA),
        },
      ),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Layer 3 — strict verification against the real Python sidecar (opt-in)
//
// Both flags must be set:
//   - RUN_SIDECAR_INTEGRATION=1 keeps the sidecar smoke gate consistent
//     with `loadFlow.integration.test.ts` and `shortCircuit.integration.test.ts`.
//   - RUN_GOLDEN_CASE_VERIFICATION=1 explicitly asks for the strict
//     hand-calc tolerance comparison. This is gated separately so the
//     existing `pnpm --filter solver-adapter test:integration` smoke
//     command does not start failing the moment pandapower's default
//     IEC 60909 voltage factor diverges from the simplified hand-calc
//     assumption (voltageFactorC = 1.0). Until S3-OQ-08 alignment ships
//     (see Stage 3 closeout §4.1), Layer 3 is expected to surface that
//     mismatch when invoked, and the comparison failure IS the finding.
// ---------------------------------------------------------------------------

const goldenDescribe =
  SHOULD_RUN_SIDECAR && SHOULD_RUN_GOLDEN ? describe : describe.skip;

goldenDescribe("GC-SC-01 — strict verification against the real sidecar", () => {
  it("matches the documented Ik'' and ip within tolerance at the LV bus", async () => {
    const gc = getGoldenCaseGcSc01();
    const built = buildAppNetwork(gc.input.projectFile);
    expect(built.appNetwork).not.toBeNull();
    const network = built.appNetwork!;

    const transport = new StdioSidecarTransport({
      pythonExecutable: PYTHON,
      sidecarScriptPath: DEFAULT_SIDECAR_SCRIPT_PATH,
      timeoutMs: 300_000,
    });

    const health = await transport.health();
    expect(health.status).toBe("ok");
    if (health.solverVersion === "unavailable") {
      throw new Error(
        "pandapower is not installed in the integration environment. Install via " +
          "`pip install -r services/solver-sidecar/requirements.txt` then re-run.",
      );
    }

    const bundle = await runShortCircuitForAppNetwork(network, {
      transport,
      mode: "specific",
      faultTargets: [{ busInternalId: FAULT_BUS_INTERNAL_ID }],
      projectId: gc.input.projectFile.project.projectId,
    });

    expect(bundle.shortCircuit.status).toBe("valid");

    const lv = bundle.shortCircuit.busResults.find(
      (b) => b.busInternalId === FAULT_BUS_INTERNAL_ID,
    );
    expect(lv).toBeDefined();
    expect(lv?.status).toBe("ok");

    assertFaultBusWithinTolerance(
      { ikssKa: lv?.ikssKa ?? null, ipKa: lv?.ipKa ?? null },
      {
        ikssKA: gc.expected.ikssKA,
        ipKA: gc.expected.ipKA,
        ikssTolerance: parseGoldenCasePercentTolerance(gc.tolerance.ikssKA),
        ipTolerance: parseGoldenCasePercentTolerance(gc.tolerance.ipKA),
      },
    );

    // Status / warning / error tolerance is "exact match" per the artifact.
    expect(bundle.shortCircuit.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(bundle.shortCircuit.issues.filter((i) => i.severity === "warning")).toEqual([]);
  }, 600_000);
});
