// Stage 3 ED-PR-03 — calculation-store retention tests for the
// Equipment Duty bundle slot (`"duty_check_bundle"`).
//
// Coverage:
//   - retentionKeyToString / deriveRetentionKey produce the
//     canonical `"duty_check_bundle::<scn>::_"` key.
//   - runSucceeded retains a duty-check bundle under the canonical
//     key without displacing the LF-narrow active slot
//     (Equipment Duty spec §4.6 active-slot asymmetry inherited).
//   - LF + SC + DC bundles coexist side by side under three
//     distinct retention keys.
//   - markStale flips the duty-check record's stale flag.
//   - A misrouted runSucceeded carrying a failed duty-check bundle
//     is rerouted to runFailed semantics (no failed bundle retained
//     as a success).
//   - A failed duty-check bundle's snapshot lands on
//     `lastFailedSnapshot` without disturbing prior duty-check
//     retention.

import { describe, expect, it } from "vitest";
import type { AppNetwork } from "@power-system-study/network-model";
import {
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_INPUT_VERSION,
  type RuntimeCalculationSnapshot,
  type ShortCircuitResult,
  type ShortCircuitRunBundle,
  type SolverInput,
} from "@power-system-study/solver-adapter";
import type {
  DutyCheckResult,
  DutyCheckRunBundle,
} from "@power-system-study/duty-check";

import {
  calculationReducer,
  initialCalculationStoreState,
  retentionKeyToString,
  deriveRetentionKey,
  DUTY_CHECK_BUNDLE_MODULE,
  SHORT_CIRCUIT_BUNDLE_MODULE,
  LOAD_FLOW_BUNDLE_MODULE,
} from "../src/index.js";

const NOW = "2026-05-07T00:00:00Z";

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

function fakeSnapshot(
  scenarioId: string | null,
  id = "snap_x",
): RuntimeCalculationSnapshot {
  return {
    snapshotId: id,
    projectId: "PJT-DUTY",
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
      options: { ...DEFAULT_SOLVER_OPTIONS },
    },
    adapterVersion: "0.0.0-test",
    appNetworkHash: null,
    solverInputHash: null,
  };
}

function fakeShortCircuitResult(
  scenarioId: string | null,
  status: "valid" | "warning" | "failed",
  resultId = "scr_dc_x",
): ShortCircuitResult {
  return {
    resultId,
    runtimeSnapshotId: "snap_x",
    scenarioId,
    module: "shortCircuit",
    status,
    faultType: "threePhase",
    calculationCase: "maximum",
    voltageFactor: 1,
    busResults: [],
    issues: [],
    metadata: {
      solverName: "pandapower",
      solverVersion: "fake-2.14.10",
      adapterVersion: "0.0.0-test",
      solverOptions: { ...DEFAULT_SOLVER_OPTIONS },
      executedAt: NOW,
      inputHash: null,
      networkHash: null,
    },
    createdAt: NOW,
  };
}

function fakeShortCircuitBundle(
  scenarioId: string | null,
  status: "valid" | "warning" | "failed" = "valid",
  snapshotId = "snap_x",
): ShortCircuitRunBundle {
  return {
    shortCircuit: fakeShortCircuitResult(scenarioId, status),
    snapshot: fakeSnapshot(scenarioId, snapshotId),
    solverInput: emptySolverInput(scenarioId),
    request: {
      solverInput: emptySolverInput(scenarioId),
      mode: "all_buses",
      faultTargets: [],
      shortCircuitOptions: {
        faultType: "threePhase",
        calculationCase: "maximum",
        computePeak: true,
        computeThermal: true,
      },
    },
  };
}

function fakeDutyCheckResult(
  scenarioId: string | null,
  status: "valid" | "warning" | "failed",
  resultId = "dcr_x",
): DutyCheckResult {
  return {
    resultId,
    runtimeSnapshotId: "snap_x",
    scenarioId,
    module: "dutyCheck",
    status,
    sourceShortCircuitResultId: status === "failed" ? null : "scr_dc_x",
    equipmentResults: [],
    issues:
      status === "failed"
        ? [
            {
              code: "I-DC-002",
              severity: "info",
              message: "upstream short circuit failed",
            },
          ]
        : [],
    metadata: {
      solverName: "duty-check",
      solverVersion: "0.1.0",
      adapterVersion: "0.1.0",
      executedAt: NOW,
      inputHash: null,
      networkHash: null,
      options: {},
      basis: { tminS: 0.05, faultClearingS: 0.5 },
    },
    createdAt: NOW,
  };
}

function fakeDutyCheckBundle(
  scenarioId: string | null,
  status: "valid" | "warning" | "failed" = "warning",
  snapshotId = "snap_dc",
): DutyCheckRunBundle {
  const sc = fakeShortCircuitBundle(scenarioId, "valid", snapshotId);
  return {
    dutyCheck: fakeDutyCheckResult(scenarioId, status),
    snapshot: sc.snapshot,
    shortCircuit: sc,
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
// Retention key derivation
// ---------------------------------------------------------------------------

describe("calculation-store — duty-check retention key", () => {
  it("DUTY_CHECK_BUNDLE_MODULE is the literal `duty_check_bundle`", () => {
    expect(DUTY_CHECK_BUNDLE_MODULE).toBe("duty_check_bundle");
  });

  it("deriveRetentionKey routes a duty-check bundle to the duty_check_bundle key", () => {
    const bundle = fakeDutyCheckBundle("SCN-A", "warning");
    const key = deriveRetentionKey(bundle);
    expect(key.module).toBe(DUTY_CHECK_BUNDLE_MODULE);
    expect(key.scenarioId).toBe("SCN-A");
    expect(key.subCase).toBeNull();
    expect(retentionKeyToString(key)).toBe("duty_check_bundle::SCN-A::_");
  });

  it("disambiguates duty-check from short-circuit even though both carry a `shortCircuit` field", () => {
    // The duty-check bundle carries its consumed SC bundle on a
    // `shortCircuit` field. The retention layer must NOT route it
    // to `short_circuit_bundle` — the duty-check probe runs first.
    const dc = fakeDutyCheckBundle("SCN-A", "warning");
    const sc = fakeShortCircuitBundle("SCN-A", "valid");
    expect(deriveRetentionKey(dc).module).toBe(DUTY_CHECK_BUNDLE_MODULE);
    expect(deriveRetentionKey(sc).module).toBe(SHORT_CIRCUIT_BUNDLE_MODULE);
  });
});

// ---------------------------------------------------------------------------
// runSucceeded
// ---------------------------------------------------------------------------

describe("calculation-store — duty-check runSucceeded", () => {
  it("retains a successful duty-check bundle under the canonical key", () => {
    const bundle = fakeDutyCheckBundle("SCN-A", "warning");
    const next = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    expect(next.lifecycle).toBe("succeeded");
    const key = retentionKeyToString(deriveRetentionKey(bundle));
    expect(key).toBe("duty_check_bundle::SCN-A::_");
    expect(next.retainedResults[key]).toBeDefined();
    expect(next.retainedResults[key]?.bundle).toBe(bundle);
    expect(next.retainedResults[key]?.stale).toBe(false);
    expect(next.retainedResults[key]?.key.module).toBe(DUTY_CHECK_BUNDLE_MODULE);
  });

  it("does not displace the LF-narrow active slot (duty-check active-slot asymmetry)", () => {
    const bundle = fakeDutyCheckBundle("SCN-A", "warning");
    const next = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    // Per Equipment Duty spec §4.6, duty-check successes live in
    // `retainedResults["duty_check_bundle"]` and do NOT occupy the
    // LF-narrow active slot.
    expect(next.bundle).toBeNull();
  });

  it("retains LF, SC, and DC bundles side by side under three distinct keys", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid", "snap_sc");
    const dc = fakeDutyCheckBundle("SCN-A", "warning", "snap_dc");
    const after1 = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle: sc,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const after2 = calculationReducer(after1, {
      type: "runSucceeded",
      bundle: dc,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const scKey = retentionKeyToString(deriveRetentionKey(sc));
    const dcKey = retentionKeyToString(deriveRetentionKey(dc));
    expect(scKey).toBe("short_circuit_bundle::SCN-A::_");
    expect(dcKey).toBe("duty_check_bundle::SCN-A::_");
    expect(Object.keys(after2.retainedResults).sort()).toEqual([dcKey, scKey].sort());
    expect(after2.retainedResults[scKey]?.bundle).toBe(sc);
    expect(after2.retainedResults[dcKey]?.bundle).toBe(dc);
    expect(after2.retainedResults[dcKey]?.key.module).toBe(DUTY_CHECK_BUNDLE_MODULE);
    expect(after2.retainedResults[scKey]?.key.module).toBe(SHORT_CIRCUIT_BUNDLE_MODULE);
    // None of the three keys collide with the load-flow key prefix.
    for (const k of Object.keys(after2.retainedResults)) {
      expect(k.startsWith(LOAD_FLOW_BUNDLE_MODULE)).toBe(false);
    }
  });

  it("dispatching runSucceeded with a failed duty-check bundle is rerouted to runFailed semantics", () => {
    const failed = fakeDutyCheckBundle("SCN-A", "failed", "snap_dc_f");
    const next = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle: failed,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    expect(next.lifecycle).toBe("failed");
    // No failed duty bundle is retained as a success.
    expect(next.retainedResults).toEqual({});
    // The failed duty bundle's snapshot still lands for audit.
    expect(next.lastFailedSnapshot?.snapshot).toBe(failed.snapshot);
    expect(next.lastFailedSnapshot?.reason).toBe("runtime_failure");
    // No fake error message — the orchestrator only ships info-level
    // diagnostics for upstream failure, so the reducer falls back to
    // the default `"Equipment Duty failed."` text rather than
    // fabricating an `E-DC-*` code.
    expect(next.lastFailedSnapshot?.message).toBe("Equipment Duty failed.");
  });
});

// ---------------------------------------------------------------------------
// markStale
// ---------------------------------------------------------------------------

describe("calculation-store — duty-check markStale", () => {
  it("flips the retained duty-check record's stale flag without auto-recompute", () => {
    const bundle = fakeDutyCheckBundle("SCN-A", "warning");
    const after1 = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const after2 = calculationReducer(after1, { type: "markStale" });
    const dcKey = retentionKeyToString(deriveRetentionKey(bundle));
    expect(after2.retainedResults[dcKey]?.stale).toBe(true);
    // Bundle ref preserved — UI still surfaces previous numbers.
    expect(after2.retainedResults[dcKey]?.bundle).toBe(bundle);
    // No auto-recompute: lifecycle stays at the LF-active-slot
    // value (succeeded) because the active LF slot is null.
    expect(after2.lifecycle).toBe("succeeded");
  });

  it("flips stale on LF + SC + DC retained records together", () => {
    const sc = fakeShortCircuitBundle("SCN-A", "valid", "snap_sc");
    const dc = fakeDutyCheckBundle("SCN-A", "warning", "snap_dc");
    const after1 = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle: sc,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const after2 = calculationReducer(after1, {
      type: "runSucceeded",
      bundle: dc,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const after3 = calculationReducer(after2, { type: "markStale" });
    expect(Object.keys(after3.retainedResults)).toHaveLength(2);
    for (const rec of Object.values(after3.retainedResults)) {
      expect(rec.stale).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// runFailed for a duty-check bundle
// ---------------------------------------------------------------------------

describe("calculation-store — duty-check runFailed", () => {
  it("retains the snapshot of a failed duty bundle without dropping a prior successful duty record", () => {
    const success = fakeDutyCheckBundle("SCN-A", "warning", "snap_ok");
    const after1 = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle: success,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const successKey = retentionKeyToString(deriveRetentionKey(success));
    expect(after1.retainedResults[successKey]?.bundle).toBe(success);

    const failed = fakeDutyCheckBundle("SCN-A", "failed", "snap_f");
    const after2 = calculationReducer(after1, {
      type: "runFailed",
      at: "2026-05-07T01:00:00Z",
      message: "Equipment Duty failed.",
      bundle: failed,
      build: fakeBuild("SCN-A"),
      reason: "runtime_failure",
    });
    expect(after2.lifecycle).toBe("failed");
    // Prior successful duty record is preserved.
    expect(after2.retainedResults[successKey]?.bundle).toBe(success);
    expect(after2.retainedResults[successKey]?.stale).toBe(false);
    // Failed snapshot lands on lastFailedSnapshot.
    expect(after2.lastFailedSnapshot?.snapshot).toBe(failed.snapshot);
    expect(after2.lastFailedSnapshot?.reason).toBe("runtime_failure");
  });
});

// ---------------------------------------------------------------------------
// Project-file isolation (spec §10 guardrail)
// ---------------------------------------------------------------------------

describe("calculation-store — project-file isolation", () => {
  it("retained duty-check record carries no project-file shape (runtime-only retention)", () => {
    const bundle = fakeDutyCheckBundle("SCN-A", "warning");
    const next = calculationReducer(initialCalculationStoreState, {
      type: "runSucceeded",
      bundle,
      build: fakeBuild("SCN-A"),
      at: NOW,
    });
    const dcKey = retentionKeyToString(deriveRetentionKey(bundle));
    const record = next.retainedResults[dcKey];
    expect(record).toBeDefined();
    // The retained record holds only the runtime bundle + the
    // network build. There is no `project` / `equipment` /
    // `calculationSnapshots` / `calculationResults` field on the
    // record (spec §10 — duty results never persist into the
    // project file).
    const recordKeys = Object.keys(record!).sort();
    expect(recordKeys).toEqual(["build", "bundle", "key", "recordedAt", "stale"]);
    // Iterating the bundle's keys also confirms there is no
    // project-file leakage on the bundle itself.
    const bundleKeys = Object.keys(bundle).sort();
    expect(bundleKeys).toEqual(["dutyCheck", "shortCircuit", "snapshot"]);
  });
});
