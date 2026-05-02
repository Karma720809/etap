# Solver Adapter Contract

**Project:** Power System Study App
**Stage:** Stage 2 — Load Flow / Voltage Drop MVP
**Implements:** `stage_2_load_flow_voltage_drop_spec.md` §8 (A2 / A3)
**Authoring PR:** Stage 2 PR #3 — Solver Adapter Contract + Python Sidecar
**Activated by:** Stage 2 PR #4 — Real Load Flow execution + result normalization
**Companion decision:** `solver_adapter_hosting_decision.md` (S2-FU-01)
**Date:** 2026-05-02

---

## 1. Purpose

The solver adapter is the typed boundary between the TypeScript
application (`AppNetwork` from `packages/network-model`) and any
concrete numerical solver. Stage 2 uses pandapower behind this
boundary, hosted by the Python sidecar described in the hosting
decision. **No pandapower element name appears in the contract.** The
contract is the single source of truth shared by the TypeScript
adapter (`packages/solver-adapter`) and the Python sidecar
(`services/solver-sidecar/src/contracts.py`).

This document describes:

1. The adapter contract shape (input, options, metadata, result,
   issue).
2. The `AppNetwork → SolverInput` mapping rules.
3. The `internalId ↔ solver index` traceability rules.
4. What this PR does **not** ship (real solver execution, result
   normalization to `BusResult` / `BranchResult`, snapshots,
   persistence).

---

## 2. Contract types

All types are defined in TypeScript in
`packages/solver-adapter/src/types.ts`. Wire format is JSON.

### 2.1 Inputs

```ts
interface SolverInput {
  inputVersion: "1.0.0";
  scenarioId: string | null;
  frequencyHz: 50 | 60;
  buses: SolverBus[];
  sources: SolverSource[];
  transformers: SolverTransformer[];
  lines: SolverLine[];
  loads: SolverLoad[];
  generatorsPQ: SolverGeneratorPQ[];
  options: SolverOptions;
}

interface SolverBus {
  internalId: string;     // = NetworkBus.internalId
  tag: string;
  vnKv: number;
  topology: "3P3W" | "3P4W";
}

interface SolverSource {
  internalId: string;     // = NetworkSource.internalId
  tag: string;
  kind: "utility" | "generator_pq";
  busInternalId: string;
  vnKv: number | null;
  scLevelMva: number | null;
  faultCurrentKa: number | null;
  xrRatio: number | null;
  voltageFactor: number | null;
  role: "slack" | "pq";
  pMw: number | null;     // PQ generators only; null for utilities
  qMvar: number | null;
}

interface SolverTransformer {
  internalId: string;     // = NetworkTransformerBranch.internalId
  tag: string;
  fromBusInternalId: string;
  toBusInternalId: string;
  snMva: number | null;
  vnHvKv: number | null;
  vnLvKv: number | null;
  vkPercent: number | null;
  vkrPercent: number | null;
  xrRatio: number | null;
  vectorGroup: string | null;
  tapPosition: number | null;
}

interface SolverLine {
  internalId: string;     // = NetworkCableBranch.internalId
  tag: string;
  fromBusInternalId: string;
  toBusInternalId: string;
  lengthM: number | null;
  rOhmPerKm: number | null;
  xOhmPerKm: number | null;
}

interface SolverLoad {
  internalId: string;     // = NetworkLoad.internalId or NetworkMotor.internalId
  tag: string;
  busInternalId: string;
  pMw: number;
  qMvar: number;
  origin: "load" | "motor";
}

interface SolverGeneratorPQ {
  internalId: string;     // = NetworkGeneratorPQ.internalId
  tag: string;
  busInternalId: string;
  pMw: number | null;
  qMvar: number | null;
}
```

### 2.2 Options

```ts
interface SolverOptions {
  algorithm: "nr" | "bfsw";   // matches spec §9.2 CalculationSnapshot.solver.options
  tolerance: number;          // p.u., e.g., 1e-8
  maxIter: number;
  enforceQLim: false;         // PV mode unsupported in Stage 2 (spec §6.2)
}
```

### 2.3 Metadata

```ts
interface SolverMetadata {
  solverName: "pandapower";   // Stage 2 fixed; widened when more solvers land
  solverVersion: string;      // exact pandapower version string
  adapterVersion: string;     // semver of @power-system-study/solver-adapter
  options: SolverOptions;
  executedAt: string;         // ISO-8601 UTC
  inputHash: string | null;   // SHA-256 of the canonical SolverInput JSON when available
  networkHash: string | null; // SHA-256 of the canonical AppNetwork JSON when the
                              // mapper was invoked with hashing enabled
}
```

`inputHash` and `networkHash` are populated by the adapter (PR #4)
once a stable serializer is wired. PR #3 leaves them `null`; the
field is reserved.

### 2.4 Result

```ts
interface SolverResult {
  status: "succeeded" | "failed_validation" | "failed_solver";
  converged: boolean;
  metadata: SolverMetadata;
  buses: SolverBusResult[];
  branches: SolverBranchResult[];
  issues: SolverIssue[];
}

interface SolverBusResult {
  internalId: string;     // = SolverBus.internalId
  voltageKv: number;
  voltagePuPct: number;
  angleDeg: number;
}

interface SolverBranchResult {
  internalId: string;     // = SolverTransformer.internalId or SolverLine.internalId
  branchKind: "transformer" | "line";
  fromBusInternalId: string;
  toBusInternalId: string;
  pMwFrom: number;
  qMvarFrom: number;
  pMwTo: number;
  qMvarTo: number;
  currentA: number;
  loadingPct: number | null; // null when no rating is available
  lossKw: number;
}

interface SolverIssue {
  code: "E-LF-001" | "E-LF-004" | "E-LF-005" | "W-LF-001" | "W-LF-002" | "W-LF-003";
  severity: "error" | "warning";
  message: string;
  internalId?: string;    // resolves back into AppNetwork
  field?: string;
}
```

`SolverBusResult` and `SolverBranchResult` are intentionally a thin,
solver-shaped projection. They are **not** the spec's
`BusResult` / `BranchResult` (§9). Mapping the solver result to the
spec's `LoadFlowResult` (`busInternalId`, `tag`, band status,
`branchKind: "cable" | "transformer"`) is **PR #4** territory. PR #3
defines the contract types and the input mapper only.

---

## 3. AppNetwork → SolverInput mapping rules

Implemented in `packages/solver-adapter/src/contract.ts` as
`buildSolverInputFromAppNetwork(appNetwork, options): SolverInput`.

### 3.1 Element mapping

| `AppNetwork` element | `SolverInput` element | Notes |
|---|---|---|
| `NetworkBus` | `SolverBus` | `internalId`, `tag`, `vnKv`, `topology` carried through. |
| `NetworkSource` (kind: `utility`) | `SolverSource` (`kind: "utility"`, `role: "slack"`) | Stage 2 MVP supports exactly one in-service utility (spec §4.3 / §6.2). |
| `NetworkSource` (kind: `generator_pq`) | `SolverSource` (`kind: "generator_pq"`, `role` taken from source) | Captures `pMw` / `qMvar` for PQ injection. |
| `NetworkGeneratorPQ` | `SolverGeneratorPQ` | Mirrors PQ generators that were modeled as separate elements (not promoted to slack sources). |
| `NetworkTransformerBranch` | `SolverTransformer` | Direct field mapping; HV = `fromBusInternalId`, LV = `toBusInternalId`. |
| `NetworkCableBranch` | `SolverLine` | Direct field mapping. `branchChainOrderIndex` and `branchChainEdgeId` are intentionally **omitted** from solver input — they are app-side traceability fields per network-model §3, not solver inputs. |
| `NetworkLoad` | `SolverLoad` (`origin: "load"`) | `pMw` / `qMvar` already computed in PR #2. |
| `NetworkMotor` | `SolverLoad` (`origin: "motor"`) | Stage 2 represents motors as steady-state PQ loads (spec §6.2). |
| `NetworkGate` | **omitted** | Closed/in-service breakers and switches are zero-impedance topology gates (S2-OQ-02). They are not solver elements. |
| `NetworkGateConnection` | **omitted** | Gate-only branch_chain ties carry zero impedance (spec §5.6). They are not solver elements. |
| `NetworkTopologyEdge` | **omitted** | Pure traceability; the solver gets bus-attached relationships through `busInternalId` fields. |

### 3.2 Mutation rule

`buildSolverInputFromAppNetwork()` is a pure function. It must not
mutate the input `AppNetwork` or any of its arrays. The contract
test suite asserts that every input collection is byte-identical
after the call.

### 3.3 Identity rule

Every `internalId` on the solver-side type is the **Stage 1 canonical
internalId** carried verbatim from `AppNetwork`. The adapter never
generates synthetic IDs and never depends on tag, name, label, or
React Flow node id. This is what allows Stage 2 PR #4 to map every
`SolverBusResult.internalId` and `SolverBranchResult.internalId` back
into `AppNetwork` and (transitively) into the canonical project file.

### 3.4 Single-slack rule

Stage 2 MVP enforces exactly one `role: "slack"` entry across
`SolverInput.sources` (spec §4.3 / §6.2 / `E-LF-003`). The
`network-model` package already enforces this on `AppNetwork`
construction; the adapter trusts that invariant and does not
re-validate. The contract test suite asserts that the mapper does
not introduce a second slack on its own.

### 3.5 Unsupported items

If `AppNetwork` ever contains an element kind that the solver
contract does not represent (e.g., a future fault calculator
adding a `NetworkShortCircuitInjection`), the mapper must omit
that element and **not** invent a placeholder solver element. PR #3
codifies this with an explicit gates-and-gateConnections omission
test.

---

## 4. internalId traceability

The contract is built around `internalId` as the only stable
identifier:

- `SolverBus.internalId` ← `NetworkBus.internalId` ← Stage 1
  `Bus.internalId`.
- `SolverLine.internalId` ← `NetworkCableBranch.internalId` ←
  Stage 1 `Cable.internalId`.
- `SolverTransformer.internalId` ← `NetworkTransformerBranch.internalId`
  ← Stage 1 `Transformer.internalId` (preserved across the
  node→branch conversion in `network-model`).
- `SolverLoad.internalId` for `origin: "load"` ←
  `NetworkLoad.internalId` ← Stage 1 `Load.internalId`.
- `SolverLoad.internalId` for `origin: "motor"` ←
  `NetworkMotor.internalId` ← Stage 1 `Motor.internalId`.
- `SolverGeneratorPQ.internalId` ← `NetworkGeneratorPQ.internalId`
  ← Stage 1 `Generator.internalId`.

Pandapower indices (and any future solver's element keys) live
**only** inside the sidecar process. They are constructed when the
sidecar is invoked (Stage 2 PR #4) and never crossed back over the
wire. The `internalId ↔ solver index` map is a private detail of
the sidecar; the wire format always uses `internalId`.

---

## 5. What this PR ships and what it does not

### 5.1 Ships in PR #3

- TypeScript adapter contract types (§2).
- `buildSolverInputFromAppNetwork()` mapper (§3) — pure, tested.
- Python sidecar skeleton with a contract mirror and a `health`
  smoke command. No pandapower call.
- Contract tests (see §6).

### 5.2 Ships in PR #4 (this commit)

- Exact `pandapower==2.14.10` pin in
  `services/solver-sidecar/requirements.txt` (2.14.11's wheel ships an
  unbumped `__version__` upstream, so 2.14.10 keeps the pin and the
  runtime-reported `SolverMetadata.solverVersion` aligned).
- `run_load_flow` command on the Python sidecar (stdio JSON-Lines
  transport): converts a `SolverInput` JSON request into a pandapower
  network, runs balanced 3-phase Newton-Raphson load flow, and
  returns a `SolverResult` JSON response with `internalId`-keyed
  bus and branch rows. Failure modes (pandapower missing, malformed
  input, non-convergence, runpp exception) map to structured
  `E-LF-001` / `E-LF-004` / `E-LF-005` issues — never to fabricated
  numerical values.
- TypeScript `SidecarTransport` interface and `StdioSidecarTransport`
  implementation (`packages/solver-adapter/src/sidecarClient.ts`).
- Runtime `LoadFlowResult` / `LoadFlowBusResult` /
  `LoadFlowBranchResult` / `LoadFlowEquipmentLoadingResult` /
  `LoadFlowIssue` types and a pure
  `normalizeSolverResult(...)` projection from the solver-shaped
  result into the app-shaped result
  (`packages/solver-adapter/src/results.ts`).
- Runtime-only `RuntimeCalculationSnapshot` type and factory
  (`packages/solver-adapter/src/runtimeSnapshot.ts`). Per spec §10 /
  S2-OQ-06 these are NEVER serialized into the Stage 1 canonical
  project file; the project file's `calculationSnapshots` array
  remains empty in every Stage 2 PR.
- Orchestrator `runLoadFlowForAppNetwork(...)`
  (`packages/solver-adapter/src/loadFlow.ts`) tying the steps
  together. Pre-flight short-circuits (no buses, no slack) avoid
  spawning the sidecar for unsolvable inputs.
- Unit tests for transport, normalization, and orchestrator.
- Opt-in integration test (`tests/loadFlow.integration.test.ts`)
  gated behind `RUN_SIDECAR_INTEGRATION=1` that exercises the full
  TS↔Python boundary.

### 5.3 Does not ship (still deferred)

- Voltage Drop derivation — Stage 2 PR #5.
- UI result tables / diagram overlay — Stage 2 PR #5.
- Daemon / long-running sidecar / FastAPI transport — deferred.
- Disk persistence of runtime snapshots / results — deferred
  (S2-FU-07).
- Multi-utility / multi-slack support — deferred (S2-FU-03).
- Cable loading-vs-rating — the `SolverLine` contract does not yet
  carry cable ampacity; cable `loadingPct` is reported as `null`
  until that field is wired through.
- `inputHash` / `networkHash` byte-stable serializer — reserved
  (S2-FU-04).

---

## 6. Test surface

PR #3 covers contract behavior end-to-end without invoking
pandapower. The test files live in
`packages/solver-adapter/tests/contract.test.ts` and cover:

1. `SolverInput` shape on a `minimalValidProject()` AppNetwork
   (round-trips bus, transformer, cable, load, motor).
2. `internalId` preservation: every `SolverInput` element carries
   the AppNetwork `internalId` verbatim.
3. Transformer mapping: HV/LV bus assignment, tap position, vector
   group preserved.
4. Cable mapping → `SolverLine`: R/X/length carried; branch-chain
   ordering metadata **not** in `SolverLine`.
5. Breaker/switch gates do **not** become solver elements (no
   impedance leak from S2-OQ-02 / S2-OQ-03).
6. Gate-only branch-chain ties (`NetworkGateConnection`) do not
   become solver elements.
7. PQ generator mapping: `NetworkGeneratorPQ` → `SolverGeneratorPQ`,
   `NetworkSource` (`kind: "generator_pq"`) → `SolverSource`
   (`kind: "generator_pq"`, `role` preserved).
8. AppNetwork is not mutated; arrays are cloned, not aliased.
9. PR #3 does not introduce `calculationResults`,
   `calculationSnapshots` entries, or any persisted result.

The Python sidecar smoke test is run manually for now (see
`services/solver-sidecar/README.md`); CI integration will be added
in PR #4 alongside the actual transport selection.

---

## 7. Versioning

- `inputVersion` on `SolverInput` ticks when the contract shape
  changes in a backward-incompatible way.
- `adapterVersion` is the package semver of
  `@power-system-study/solver-adapter`.
- `solverName` and `solverVersion` are filled by the sidecar. The
  TypeScript adapter never hard-codes a pandapower version string.

---

## 8. References

- `docs/stage-2/stage_2_load_flow_voltage_drop_spec.md` (§8, §9)
- `docs/stage-2/solver_adapter_hosting_decision.md` (S2-FU-01)
- `packages/network-model/src/types.ts` (input source-of-truth)
- `packages/solver-adapter/src/types.ts`
- `packages/solver-adapter/src/contract.ts`
- `services/solver-sidecar/src/contracts.py`
