// Stage 2 PR #6 — calculation-store reducer + retention tests.
//
// These tests exercise the pure reducer extracted from
// `apps/web/src/state/calculationStore.ts`. They build minimal
// hand-crafted `LoadFlowRunBundle` fixtures rather than driving the
// full solver-adapter orchestrator, so the assertions focus on store
// semantics (retention keying, stale propagation, lifecycle
// transitions) rather than result normalization.
//
// Coverage:
//   - runStarted flips lifecycle to "running".
//   - runSucceeded retains the record under the canonical key and
//     replaces an earlier record under the same key.
//   - runSucceeded under a different scenarioId stores a second
//     retained record alongside the first.
//   - A misrouted runSucceeded carrying a failed bundle is rerouted
//     to runFailed semantics rather than retained as a success.
//   - runFailed with a bundle retains the snapshot as
//     `lastFailedSnapshot`.
//   - runFailed without a bundle sets `startError` but does not
//     overwrite a prior successful bundle.
//   - markStale flips lifecycle and every retained record's stale
//     flag, but is a no-op when no bundle is present.
//   - clearResults returns the store to its initial shape.

import { describe, expect, it } from "vitest";
import type { AppNetwork } from "@power-system-study/network-model";
import {
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_INPUT_VERSION,
  type LoadFlowResult,
  type LoadFlowRunBundle,
  type RuntimeCalculationSnapshot,
  type SolverInput,
  type SolverOptions,
  type VoltageDropResult,
} from "@power-system-study/solver-adapter";

import {
  calculationReducer,
  initialCalculationStoreState,
  retentionKeyToString,
  deriveRetentionKey,
  markAllRetainedStale,
  type CalculationStoreState,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Fixtures — minimal hand-crafted runtime objects.
//
// We do not need the topology to round-trip through the solver; the
// reducer only reads `bundle.snapshot.scenarioId`, `bundle.loadFlow.status`,
// and `bundle.loadFlow.issues` (for fail-message synthesis). Everything
// else is opaque to the store.
// ---------------------------------------------------------------------------

const NOW = "2026-05-02T00:00:00Z";

function emptyAppNetwork(scenarioId: string | null): AppNetwork {
  return {
    networkModelVersion: "2.0.0-pr2",
    scenarioId,
    frequencyHz: 60,
    buses: [],
    sources: [],
    generators: [],
    transformers: [],
    cables: [],
    gates: [],
    gateConnections: [],
    loads: [],
    motors: [],
    topologyEdges: [],
  };
}

function emptySolverInput(scenarioId: string | null): SolverInput {
  return {
    inputVersion: SOLVER_INPUT_VERSION,
    scenarioId,
    frequencyHz: 60,
    buses: [],
    sources: [],
    transformers: [],
    lines: [],
    loads: [],
    generatorsPQ: [],
    options: { ...DEFAULT_SOLVER_OPTIONS },
  };
}

function fakeSnapshot(scenarioId: string | null, id = "snap_x"): RuntimeCalculationSnapshot {
  const options: SolverOptions = { ...DEFAULT_SOLVER_OPTIONS };
  return {
    snapshotId: id,
    projectId: "PJT-T",
    scenarioId,
    createdAt: NOW,
    appNetwork: emptyAppNetwork(scenarioId),
    solverInput: emptySolverInput(scenarioId),
    validation: {
      status: "ready_to_run",
      networkBuildStatus: "valid",
      issues: [],
    },
    solver: {
      name: "pandapower",
      version: "fake-2.14.11",
      options,
    },
    adapterVersion: "0.0.0-test",
    appNetworkHash: null,
    solverInputHash: null,
  };
}

function fakeLoadFlow(
  scenarioId: string | null,
  status: "valid" | "warning" | "failed",
  resultId = "lfr_x",
): LoadFlowResult {
  return {
    resultId,
    runtimeSnapshotId: "snap_x",
    scenarioId,
    createdAt: NOW,
    status,
    converged: status !== "failed",
    busResults: [],
    branchResults: [],
    loadResults: [],
    motorResults: [],
    totalGenerationMw: 0,
    totalLoadMw: 0,
    totalLossesMw: 0,
    issues:
      status === "failed"
        ? [
            {
              code: "E-LF-001",
              severity: "error",
              message: "non-convergence",
            },
          ]
        : [],
    metadata: {
      solverName: "pandapower",
      solverVersion: "fake-2.14.11",
      adapterVersion: "0.0.0-test",
      solverOptions: { ...DEFAULT_SOLVER_OPTIONS },
      executedAt: NOW,
      inputHash: null,
      networkHash: null,
    },
  };
}

function fakeVoltageDrop(scenarioId: string | null): VoltageDropResult {
  return {
    resultId: "vdr_x",
    sourceLoadFlowResultId: "lfr_x",
    runtimeSnapshotId: "snap_x",
    scenarioId,
    createdAt: NOW,
    status: "valid",
    branchResults: [],
    issues: [],
    totals: {
      branchCount: 0,
      okCount: 0,
      warningCount: 0,
      violationCount: 0,
      unavailableCount: 0,
      maxVoltageDropPct: null,
    },
    limits: { cablePct: 3, transformerPct: 5 },
  };
}

function fakeBundle(
  scenarioId: string | null,
  status: "valid" | "warning" | "failed" = "valid",
  snapshotId = "snap_x",
): LoadFlowRunBundle {
  return {
    loadFlow: fakeLoadFlow(scenarioId, status),
    snapshot: fakeSnapshot(scenarioId, snapshotId),
    solverInput: emptySolverInput(scenarioId),
    voltageDrop: status === "failed" ? null : fakeVoltageDrop(scenarioId),
  };
}

function fakeBuild(scenarioId: string | null) {
  return {
    status: "valid" as const,
    appNetwork: emptyAppNetwork(scenarioId),
    issues: [],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("calculationReducer — lifecycle", () => {
  it("runStarted flips lifecycle to running and clears startError", () => {
    const start: CalculationStoreState = {
      ...initialCalculationStoreState,
      startError: "stale failure",
    };
    const next = calculationReducer(start, { type: "runStarted", at: NOW });
    expect(next.lifecycle).toBe("running");
    expect(next.lastRunAt).toBe(NOW);
    expect(next.startError).toBeNull();
  });

  it("runSucceeded retains the record under the canonical key", () => {
    const bundle = fakeBundle("SCN-A", "valid");
    const build = fakeBuild("SCN-A");
    const next = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle,
      build,
      at: NOW,
    });
    expect(next.lifecycle).toBe("succeeded");
    expect(next.bundle).toBe(bundle);
    expect(next.build).toBe(build);
    const key = retentionKeyToString(deriveRetentionKey(bundle));
    expect(next.retainedResults[key]).toBeDefined();
    expect(next.retainedResults[key]?.bundle).toBe(bundle);
    expect(next.retainedResults[key]?.stale).toBe(false);
    expect(next.retainedResults[key]?.recordedAt).toBe(NOW);
    expect(next.retainedResults[key]?.key.scenarioId).toBe("SCN-A");
    expect(next.retainedResults[key]?.key.module).toBe("load_flow_bundle");
  });

  it("runSucceeded under same key replaces the prior record (latest only)", () => {
    const first = fakeBundle("SCN-A", "valid", "snap_1");
    const second = fakeBundle("SCN-A", "warning", "snap_2");
    const after1 = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle: first,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const after2 = calculationReducer(after1, {
      type: "runSucceeded",
      bundle: second,
      build: fakeBuild("SCN-A"),
      at: "2026-05-02T01:00:00Z",
    });
    const key = retentionKeyToString(deriveRetentionKey(second));
    expect(Object.keys(after2.retainedResults)).toEqual([key]);
    expect(after2.retainedResults[key]?.bundle).toBe(second);
    expect(after2.retainedResults[key]?.recordedAt).toBe("2026-05-02T01:00:00Z");
  });

  it("runSucceeded under different scenarioId stores both records side by side", () => {
    const a = fakeBundle("SCN-A", "valid", "snap_a");
    const b = fakeBundle("SCN-B", "valid", "snap_b");
    const after1 = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle: a,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const after2 = calculationReducer(after1, {
      type: "runSucceeded",
      bundle: b,
      build: fakeBuild("SCN-B"),
      at: NOW,
    });
    const keyA = retentionKeyToString(deriveRetentionKey(a));
    const keyB = retentionKeyToString(deriveRetentionKey(b));
    expect(Object.keys(after2.retainedResults).sort()).toEqual([keyA, keyB].sort());
    expect(after2.retainedResults[keyA]?.bundle).toBe(a);
    expect(after2.retainedResults[keyB]?.bundle).toBe(b);
  });

  it("runSucceeded with a failed loadFlow is rerouted to runFailed semantics", () => {
    const failed = fakeBundle("SCN-A", "failed", "snap_f");
    const build = fakeBuild("SCN-A");
    const next = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle: failed,
      build,
      at: NOW,
    });
    expect(next.lifecycle).toBe("failed");
    expect(next.retainedResults).toEqual({});
    expect(next.lastFailedSnapshot).not.toBeNull();
    expect(next.lastFailedSnapshot?.snapshot).toBe(failed.snapshot);
    expect(next.lastFailedSnapshot?.reason).toBe("runtime_failure");
    expect(next.lastFailedSnapshot?.message).toBe("E-LF-001: non-convergence");
  });
});

describe("calculationReducer — runFailed", () => {
  it("retains the snapshot from a failed bundle and surfaces the message", () => {
    const bundle = fakeBundle("SCN-A", "failed", "snap_f");
    const build = fakeBuild("SCN-A");
    const next = calculationReducer(initialCalculationStoreState, {
      type: "runFailed",
      at: NOW,
      message: "E-LF-001: non-convergence",
      bundle,
      build,
      reason: "runtime_failure",
    });
    expect(next.lifecycle).toBe("failed");
    expect(next.bundle).toBe(bundle);
    expect(next.build).toBe(build);
    expect(next.startError).toBe("E-LF-001: non-convergence");
    expect(next.lastFailedSnapshot?.snapshot).toBe(bundle.snapshot);
    expect(next.lastFailedSnapshot?.reason).toBe("runtime_failure");
    expect(next.lastFailedSnapshot?.recordedAt).toBe(NOW);
  });

  it("pre-bundle failure sets startError but preserves the prior bundle", () => {
    const success = fakeBundle("SCN-A", "valid", "snap_ok");
    const after1 = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle: success,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const after2 = calculationReducer(after1, {
      type: "runFailed",
      at: "2026-05-02T02:00:00Z",
      message: "No solver transport configured.",
    });
    expect(after2.lifecycle).toBe("failed");
    // Prior bundle still surfaces — pre-bundle failure must not blank
    // the result panel.
    expect(after2.bundle).toBe(success);
    expect(after2.startError).toBe("No solver transport configured.");
    // No snapshot supplied → lastFailedSnapshot stays null.
    expect(after2.lastFailedSnapshot).toBeNull();
    // Prior retention is untouched.
    const key = retentionKeyToString(deriveRetentionKey(success));
    expect(after2.retainedResults[key]?.bundle).toBe(success);
  });
});

describe("calculationReducer — markStale", () => {
  it("flips lifecycle to stale and marks every retained record stale", () => {
    const bundle = fakeBundle("SCN-A", "valid", "snap_ok");
    const after1 = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const after2 = calculationReducer(after1, { type: "markStale" });
    expect(after2.lifecycle).toBe("stale");
    const key = retentionKeyToString(deriveRetentionKey(bundle));
    expect(after2.retainedResults[key]?.stale).toBe(true);
    // Bundle ref preserved — UI still surfaces previous numbers.
    expect(after2.bundle).toBe(bundle);
  });

  it("is a no-op when no active bundle and no retained records", () => {
    const next = calculationReducer(initialCalculationStoreState, { type: "markStale" });
    expect(next).toBe(initialCalculationStoreState);
  });

  it("is idempotent — second markStale dispatch returns the same reference", () => {
    const bundle = fakeBundle("SCN-A", "valid");
    const after1 = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const after2 = calculationReducer(after1, { type: "markStale" });
    const after3 = calculationReducer(after2, { type: "markStale" });
    expect(after3).toBe(after2);
  });
});

describe("calculationReducer — clearResults", () => {
  it("returns the store to its initial shape", () => {
    const bundle = fakeBundle("SCN-A", "valid");
    const after1 = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const cleared = calculationReducer(after1, { type: "clearResults" });
    expect(cleared.lifecycle).toBe("idle");
    expect(cleared.bundle).toBeNull();
    expect(cleared.build).toBeNull();
    expect(cleared.lastRunAt).toBeNull();
    expect(cleared.startError).toBeNull();
    expect(cleared.retainedResults).toEqual({});
    expect(cleared.lastFailedSnapshot).toBeNull();
  });
});

describe("retention helpers", () => {
  it("retentionKeyToString uses '_' for null scenarioId / subCase", () => {
    expect(
      retentionKeyToString({
        scenarioId: null,
        module: "load_flow_bundle",
        subCase: null,
      }),
    ).toBe("load_flow_bundle::_::_");
    expect(
      retentionKeyToString({
        scenarioId: "SCN-A",
        module: "load_flow_bundle",
        subCase: "sub-1",
      }),
    ).toBe("load_flow_bundle::SCN-A::sub-1");
  });

  it("deriveRetentionKey reads scenarioId from the bundle's snapshot", () => {
    const bundle = fakeBundle("SCN-Z");
    expect(deriveRetentionKey(bundle)).toEqual({
      scenarioId: "SCN-Z",
      module: "load_flow_bundle",
      subCase: null,
    });
  });

  it("markAllRetainedStale returns the same reference when nothing changes", () => {
    const stale = {
      key: { scenarioId: null, module: "load_flow_bundle" as const, subCase: null },
      bundle: fakeBundle(null),
      build: null,
      recordedAt: NOW,
      stale: true,
    };
    const map = { "load_flow_bundle::_::_": stale };
    expect(markAllRetainedStale(map)).toBe(map);
  });
});
