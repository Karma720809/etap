# Adapter Contract Test Spec — Power System Study App

## 1. Purpose

This document defines contract-test expectations for the adapter layer described in PRD v1.0 §9.2.

The goal is to prevent solver, UI, or schema changes from silently changing engineering behavior. Contract tests should verify that each adapter accepts the app standard data model and produces a stable, normalized output contract.

## 2. Contract Test Scope

PRD §9.2 identifies seven adapter families:

1. Project data → App standard network model
2. App standard network model → pandapower network model
3. App standard network model → Load Flow input
4. App standard network model → Short Circuit input
5. Cable branch → Cable Sizing input
6. pandapower calculation result → App result model
7. App result model → UI result table / diagram overlay / report model

Stage 1 only needs placeholder or schema-only tests for #2~#7. Stage 2 and later will turn these into executable contract tests.

## 3. Common Contract Principles

Each adapter contract test must verify:

| Principle | Requirement |
|---|---|
| No mutation | Adapter must not mutate source project data. |
| Deterministic output | Same input + same versions must produce byte-stable normalized output. |
| ID mapping | App `internalId` must be preserved through mapping tables. |
| Tag display | UI/report may display `tag`, but traceability must retain `internalId`. |
| Fail-closed | Invalid or unsupported input must return structured error, not partial fake result. |
| Solver isolation | pandapower-specific element IDs must not leak into app-visible result models except mapping metadata. |
| Version traceability | Adapter version and solver version must be attached to calculation snapshot/result. |

## 4. Adapter 1 — Project Data → App Standard Network Model

### Input

- `PowerSystemProjectFile`
- selected `scenarioId`
- optional calculation module request: `load-flow`, `voltage-drop`, `short-circuit`, `cable-sizing`

### Output

```ts
interface AppStandardNetworkModel {
  schemaVersion: string;
  projectId: string;
  scenarioId: string;
  buses: StandardBus[];
  branches: StandardBranch[];
  sources: StandardSource[];
  loads: StandardLoad[];
  motors: StandardMotor[];
  generators: StandardGenerator[];
  protectiveDevices: StandardProtectiveDevice[];
  appliedOverrides: AppliedOverride[];
  validationResult: ValidationResult;
}
```

### Contract Tests

| Test ID | Test |
|---|---|
| ADP-01-001 | Stage 1 demo fixture converts without mutation. |
| ADP-01-002 | Transformer node becomes a standard transformer branch between HV and LV buses. |
| ADP-01-003 | Ordered branch chain `BRK-001 → CBL-001` is preserved. |
| ADP-01-004 | Open switch/breaker state is represented in branch availability metadata. |
| ADP-01-005 | Missing referenced bus returns `E-NET-003` and no usable calculation input. |
| ADP-01-006 | Duplicate override path returns fail-closed validation error. |

## 5. Adapter 2 — App Standard Network Model → pandapower Network Model

### Input

- `AppStandardNetworkModel`
- `solverOptions`

### Output

```ts
interface PandapowerBuildResult {
  pandapowerNet: unknown;
  mapping: {
    appInternalIdToPandapowerId: Record<string, string | number>;
    pandapowerIdToAppInternalId: Record<string, string>;
  };
  solverGapRegisterEntries: SolverGapRegisterEntry[];
  warnings: WarningIssue[];
}
```

### Contract Tests

| Test ID | Test |
|---|---|
| ADP-02-001 | Utility maps to ext_grid/source representation. |
| ADP-02-002 | Transformer vendor tap fields are converted only at adapter boundary. |
| ADP-02-003 | Transformer `internalId` remains traceable through mapping table. |
| ADP-02-004 | Closed breaker in a branch chain is mapped according to Stage 2 decision: topology-only, switch, or impedance element. |
| ADP-02-005 | Open breaker/switch removes or opens the corresponding network path. |
| ADP-02-006 | Unsupported generator mode returns structured unsupported-mode error. |

## 6. Adapter 3 — App Standard Network Model → Load Flow Input

### Input

- `AppStandardNetworkModel`
- load-flow calculation request

### Output

```ts
interface LoadFlowInputContract {
  scenarioId: string;
  balancedThreePhaseOnly: true;
  buses: LoadFlowBusInput[];
  branches: LoadFlowBranchInput[];
  injections: LoadFlowInjectionInput[];
  validationResult: ValidationResult;
}
```

### Contract Tests

| Test ID | Test |
|---|---|
| ADP-03-001 | 3P3W and 3P4W balanced buses are accepted. |
| ADP-03-002 | 1P/DC topology is rejected for integrated Load Flow MVP with `W-EQ-002` or calculation-readiness error according to policy. |
| ADP-03-003 | `grid_parallel_pq` generator becomes fixed P/Q injection. |
| ADP-03-004 | `pv_voltage_control` and `island_isochronous` do not enter release-gate load-flow input. |

## 7. Adapter 4 — App Standard Network Model → Short Circuit Input

### Input

- `AppStandardNetworkModel`
- short-circuit request: location, max/min case, voltage factor, contribution options

### Output

```ts
interface ShortCircuitInputContract {
  scenarioId: string;
  subCase: "max_sc" | "min_sc" | "single_fault";
  faultLocationBusInternalId: string;
  faultType: "3phase_bolted";
  voltageFactorC: number;
  sourceImpedanceModel: SourceImpedanceInput[];
  transformerImpedanceModel: TransformerImpedanceInput[];
  motorContributionMode: "excluded" | "included_simplified";
  validationResult: ValidationResult;
}
```

### Contract Tests

| Test ID | Test |
|---|---|
| ADP-04-001 | GC-SC-01 input can be built without pandapower dependency. |
| ADP-04-002 | Motor contribution excluded produces no motor source contribution. |
| ADP-04-003 | Motor included_simplified requires documented X'' or equivalent assumption. |
| ADP-04-004 | Generator detailed short-circuit contribution is disabled until verified Golden Case exists. |
| ADP-04-005 | Min/max short-circuit cases are distinguishable by `{scenarioId, module, subCase}`. |

## 8. Adapter 5 — Cable Branch → Cable Sizing Input

### Input

- cable branch
- connected load/motor context
- load-flow operating current, if available
- short-circuit current, if available
- protective device clearing time

### Output

```ts
interface CableSizingInputContract {
  mode: "standalone" | "integrated";
  feederType: "motor" | "static_load" | "distribution_feeder" | "mixed_load" | "spare";
  voltageV: number;
  designCurrentA: SourceStatusNumber;
  operatingCurrentA?: SourceStatusNumber;
  startingCurrentA?: SourceStatusNumber;
  shortCircuitCurrentKA?: SourceStatusNumber;
  tripTimeS?: SourceStatusNumber;
  cable: CableSizingCableInput;
}
```

### Contract Tests

| Test ID | Test |
|---|---|
| ADP-05-001 | Motor feeder uses design current from motor FLA policy, not blindly from load-flow branch current. |
| ADP-05-002 | Operating current greater than design current raises warning/error according to project policy. |
| ADP-05-003 | Buried cable without soil resistivity returns fail-closed error. |
| ADP-05-004 | Manual cable R/X values are preserved as project-local source of truth. |

## 9. Adapter 6 — pandapower Result → App Result Model

### Input

- pandapower result object
- mapping table
- calculation snapshot id

### Output

```ts
interface AppCalculationResult {
  resultId: string;
  snapshotId: string;
  module: "load-flow" | "voltage-drop" | "short-circuit";
  scenarioId: string;
  status: "completed" | "failed" | "invalid";
  results: unknown;
  warningCodes: string[];
  errorCodes: string[];
  createdAt: string;
}
```

### Contract Tests

| Test ID | Test |
|---|---|
| ADP-06-001 | pandapower bus result maps back to app bus internalId. |
| ADP-06-002 | Solver non-convergence returns failed result, not stale previous result. |
| ADP-06-003 | Missing `Ib` short-circuit result falls back to `Ik''` for breaker duty with warning code. |
| ADP-06-004 | pandapower-specific IDs are not shown as primary UI identifiers. |

## 10. Adapter 7 — App Result Model → UI / Overlay / Report Model

### Input

- `AppCalculationResult`
- referenced calculation snapshot

### Output

```ts
interface ResultPresentationModel {
  tables: ResultTable[];
  diagramOverlays: DiagramOverlay[];
  reportData: ReportDataModel;
  warningSummary: WarningErrorSummary;
}
```

### Contract Tests

| Test ID | Test |
|---|---|
| ADP-07-001 | Result table rows display tag but preserve internalId. |
| ADP-07-002 | Diagram overlay points to existing diagram node/edge. |
| ADP-07-003 | Report data includes snapshot reference or embedded input summary. |
| ADP-07-004 | Stale result is not exportable as a valid report. |

## 11. Timing

| Stage | Required Adapter Contracts |
|---|---|
| Stage 1 | Contract placeholders and fixture-driven schema checks |
| Stage 2 | Adapter 1, 2, 3, 6, 7 for Load Flow / Voltage Drop |
| Stage 3 | Adapter 4, 6, 7 for Short Circuit / Duty Check |
| Stage 4 | Adapter 5 for Cable Sizing Integration |
| Stage 5 | Adapter 7 for report generation |
