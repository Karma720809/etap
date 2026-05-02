# Stage 3 Implementation Spec — Short Circuit MVP

**Project:** Power System Study App
**Baseline:** Stage 1 Rev D + Stage 2 PR #1–#6 (merged)
**Stage:** Stage 3 — Short Circuit MVP
**Document Status:** Implementation-ready spec — Rev A (spec-only)
**Date:** 2026-05-02

---

## 0. Reading Order

This spec depends on, and does **not** restate, the Stage 1 baseline or
the Stage 2 calculation surface:

- `docs/stage-1-baseline/power_system_study_app_prd_v1_0_final.md`
- `docs/stage-1-baseline/stage_1_one_line_diagram_mvp_spec_rev_d.md`
- `docs/stage-1-baseline/schema/schema_alignment_decision.md`
- `docs/stage-1-implementation-notes.md`
- `docs/stage-2/stage_2_load_flow_voltage_drop_spec.md`
- `docs/stage-2/solver_adapter_contract.md`
- `docs/stage-2/solver_adapter_hosting_decision.md`

Whenever this spec says "the canonical schema", it refers to
`packages/schemas/src/stage_1_project_schema.rev_d.zod.ts` /
`packages/schemas/stage_1_project_file.rev_d.schema.json`. Stage 3 must
not modify those files. Whenever this spec says "AppNetwork", it refers
to `@power-system-study/network-model`'s `AppNetwork` produced by
`buildAppNetwork()`. Stage 3 must not modify the shape of `AppNetwork`
in a way that would change Stage 2's Load Flow / Voltage Drop output.

This document defines specification only. **Stage 3 PR #1 ships no
production code.** Implementation is broken into Stage 3 PR #2 and
onward (see §13).

---

## 1. Stage 3 Open Questions and Decisions

The following Stage 3 open questions are resolved here. Subsequent
sections build on these decisions; future Stage 3 PRs that diverge from
any decision must update this section first. Open items that are
intentionally left for follow-up live in §15.

### S3-OQ-01 — Calculation basis

**Decision.** Stage 3 MVP adopts **IEC 60909** as the short-circuit
calculation basis. This is the standard pandapower's
`pandapower.shortcircuit.calc_sc()` implements; choosing IEC 60909
keeps the pandapower engine well-supported and avoids carrying a
second reference implementation in MVP. ANSI / IEEE C37.010 / C37.13
and DIN 102 style calculations are explicitly **deferred** until a
verified Golden Case forces the comparison (see §15 / S3-FU-08).

The IEC 60909 voltage factor `c` is read from
`NetworkSource.voltageFactor` per Stage 2 (default 1.0 when missing,
per §6.2 of the Stage 2 spec).

### S3-OQ-02 — Engineering output, not certified calculation

**Decision.** Stage 3 results are **engineering-study MVP output**,
not certified short-circuit calculation. The result model carries a
`status` enum (§8) and an `issues` array so that any case where a
required input was missing or an assumption was substituted (e.g.,
default voltage factor) surfaces as a warning code instead of being
silently absorbed into a number. Under no circumstance does Stage 3
emit fabricated values: failed runs return empty per-bus result rows
plus issue codes, the same fail-closed rule established in Stage 2 §14.5.

A reference produced by pandapower may be recorded as `provisional` or
`regression_only` for a future Short-Circuit Golden Case, but it must
**not** be the sole verified reference for a release-gate pass. The
acceptable verified reference sources mirror the Stage 2 §S2-OQ-07
list (hand calculation, IEC/IEEE textbook example, verified
spreadsheet, independent commercial tool result with documented
inputs).

### S3-OQ-03 — MVP fault scope

**Decision.** Stage 3 MVP supports:

- **3-phase bolted faults** at buses (IEC 60909 `fault="3ph"`), and
- **maximum case** (IEC 60909 `case="max"`).

The minimum case (`case="min"`) is deferred until either (a) a Stage 3
Golden Case explicitly requires it, or (b) the implementation PR for
the orchestrator (Stage 3 PR #4) decides that the marginal cost of
running both cases in the same sidecar invocation is small enough to
ship together. This decision is recorded in §15 / S3-FU-01 and
revisited at Stage 3 PR #4.

Single-phase-to-ground, line-to-line, and double-line-to-ground faults
are **out of scope** for Stage 3 MVP. They are not silently emitted
with placeholder values; the contract refuses any
`faultType !== "threePhase"` request with `E-SC-004`.

### S3-OQ-04 — Fault location scope

**Decision.** Stage 3 MVP supports faults **at buses only**. Fault
location is identified by `busInternalId` exactly like every other
cross-process reference in the adapter (Stage 2 §4 / contract §3.3).
Display tags are never used as fault identifiers, so editor edits of
the bus tag cannot move a fault target.

Mid-line / branch-end faults (faulting partway down a cable, or at a
transformer LV terminal that is not modeled as a bus) are **deferred**
until a Stage 3 Golden Case forces them. Adding them later would
require either (a) a synthetic split-bus on the AppNetwork or (b) a
new fault-target kind on the contract; both are out of MVP scope and
recorded as §15 / S3-FU-02.

### S3-OQ-05 — Source contribution policy

**Decision.** Stage 3 MVP includes the following short-circuit
contributions:

| Source | MVP behavior |
|---|---|
| Utility (slack) | **Included.** Drives the IEC 60909 equivalent grid impedance from `scLevelMva` (preferred) or `faultCurrentKa` (fallback) plus `xrRatio` and `voltageFactor`. Same field set as Stage 2 Load Flow's slack ext-grid configuration (`load_flow.py` §_build_pandapower_net). |
| Transformer impedance | **Included via existing `NetworkTransformerBranch`.** No new field. The fault current path is whatever pandapower computes once the same transformers used in Load Flow are in the network. |
| Cable impedance | **Included via existing `NetworkCableBranch`.** Same R/X carried for Load Flow. |
| Closed/in-service breakers and switches | **Topology gates only**, identical to Stage 2 (S2-OQ-02). Their fault-current contribution is whatever the closed topology produces; Stage 3 does **not** model breaker arc impedance, breaker rating duty, or contact resistance. Equipment Duty Check is a separate Stage 3+ deliverable (§2.3). |
| Grid-parallel PQ generators (`grid_parallel_pq`) | **Excluded** from short-circuit fault feed in MVP. The contract has no `xdssPu` / `rdssPu` field today and pandapower will treat the existing `sgen` as a constant-current PQ injection rather than a synchronous source. Reported via `W-SC-003`. |
| Motors | **Excluded** from short-circuit fault feed in MVP. Stage 2 already represents motors as steady-state PQ loads (§6.2); they have no subtransient impedance in the contract today. Reported via `W-SC-002`. |
| Out-of-service equipment | Excluded by AppNetwork construction (S2-OQ-03). Stage 3 inherits the rule unchanged. |

Adding generator subtransient and motor short-circuit contribution is
explicitly recorded as §15 / S3-FU-03 and §15 / S3-FU-04. Both require
new contract fields and at least one verified Golden Case before they
can ship.

### S3-OQ-06 — Source data precedence

**Decision.** When the slack utility carries both `scLevelMva` and
`faultCurrentKa`, the implementation uses **`scLevelMva`** as the
primary input and emits `W-SC-001` (`source data partial`) only when
the two values are inconsistent beyond a documented tolerance. When
only `faultCurrentKa` is present, it is converted to an equivalent
`s_sc_max_mva` using the slack bus nominal voltage and recorded with
`W-SC-001` so that the user can audit the conversion. When neither is
present, the run is blocked with `E-SC-002`.

`xrRatio` is required for the IEC 60909 source equivalent. When
missing, the run is blocked with `E-SC-002`. Stage 3 does **not**
substitute a default X/R value; the Stage 2 hosting / contract
decisions deliberately keep the engineering inputs explicit, and a
silent default would conflict with §S3-OQ-02.

### S3-OQ-07 — SolverInput reuse and `ShortCircuitOptions`

**Decision.** Stage 3 reuses the existing `SolverInput` shape from
`packages/solver-adapter/src/types.ts` as-is for the network topology
(buses, sources, transformers, lines, loads, generatorsPQ). Short
Circuit adds:

1. A new request envelope shape `ShortCircuitRequest` carried over the
   sidecar transport, which contains the existing `SolverInput` plus a
   short-circuit-specific options block and fault target list.
2. A new `ShortCircuitOptions` record (calculation case, fault type,
   IEC 60909 toggles for `ip` / `ith`).
3. A new `ShortCircuitFaultTarget` record (bus internalId only in
   MVP).

The existing `SolverInput.options` block (`SolverOptions` —
algorithm/tolerance/maxIter/enforceQLim) is **not** reused for short
circuit because those flags belong to the Newton-Raphson load flow
solver and are meaningless for IEC 60909. They are still passed
through unchanged so the same `SolverInput` can be cached and reused
for a Load Flow run on the same `AppNetwork` without rebuilding it.

This avoids two anti-patterns:

- A second, near-duplicate `ShortCircuitSolverInput` type whose only
  difference would be the options block — that would force the
  AppNetwork → solver mapping to fork too.
- Polymorphic options inside `SolverInput` — that would push every
  Load Flow consumer to discriminate on the calculation kind.

### S3-OQ-08 — Bundle structure: separate from `LoadFlowRunBundle`

**Decision.** Stage 3 introduces a new runtime bundle
`ShortCircuitRunBundle` returned by `runShortCircuitForAppNetwork()`
(planned for Stage 3 PR #4). It is separate from
`LoadFlowRunBundle` and is **not** merged into a single
multi-module bundle in MVP. Reasons:

1. Short Circuit and Load Flow are independent runs; coupling them
   would force every Load Flow run to also produce a short-circuit
   result, which is wasted work for the user who only wants to check
   voltage drop after an edit.
2. The runtime calculation-store retention key (Stage 2 §10.5) is
   `(scenarioId, module, subCase)`. Treating Short Circuit as its own
   `module` keeps the existing `load_flow_bundle` retention slot
   untouched and lets Short Circuit have its own retention slot
   (see §9 / S3-OQ-10).
3. The Stage 2 §S2-OQ-05 rationale for bundling Load Flow + Voltage
   Drop ("Voltage Drop is *derived* from Load Flow node voltages")
   does **not** apply to Short Circuit, which is a separate solver
   call.

The new bundle shape is defined in §8.

### S3-OQ-09 — Runtime-only guardrails preserved

**Decision.** Every Stage 2 runtime-only guardrail applies to Stage 3
unchanged:

- The Stage 1 canonical project-file schema is **unchanged** for the
  entirety of Stage 3.
- The project file's `calculationSnapshots` array remains an empty
  array in **every** Stage 3 PR.
- `calculationResults` is **not** introduced into the canonical project
  schema. Result bundles live in `packages/calculation-store` keyed by
  the runtime retention key.
- No fake calculations. Failed Short Circuit runs surface issue codes
  (§11), not zeros.
- No disk persistence of runtime snapshots / result bundles in Stage 3
  (extension of S2-FU-07). If persistence is required later, it must
  go through a new project-file schema version or a separate sidecar
  result-store schema — never silent edits to Stage 1 Rev D.

### S3-OQ-10 — `CalculationModule` widening

**Decision.** The `CalculationModule` literal union in
`packages/calculation-store/src/types.ts` is widened from
`"load_flow_bundle"` to `"load_flow_bundle" | "short_circuit_bundle"`
**only when the implementation lands** (Stage 3 PR #4). This PR (Stage
3 PR #1) does not touch the union. Adding a literal that has no
producer would be dead code and would defeat the existing TypeScript
guard that prevents callers from retaining short-circuit bundles
before the orchestrator exists.

---

## 2. Stage 3 Purpose, Scope, and Non-Goals

### 2.1 Purpose

Stage 3 produces the **first short-circuit engineering output** of the
Power System Study App for a project that has already been validated
and successfully solved by the Stage 2 Load Flow path. The output is
a per-bus 3-phase bolted fault current at maximum case (IEC 60909).

### 2.2 In-scope (Stage 3)

- Short Circuit MVP per S3-OQ-03 / S3-OQ-04 (3-phase bolted bus
  faults, maximum case, IEC 60909).
- A new sidecar command `run_short_circuit` over the existing stdio
  JSON-Lines transport (Stage 2 hosting decision, unchanged).
- A new `ShortCircuitResult` runtime type with per-bus rows.
- A new `ShortCircuitRunBundle` returned by an orchestrator
  `runShortCircuitForAppNetwork()`.
- Calculation-store retention extension: a second module slot
  (`"short_circuit_bundle"`) keyed by the existing
  `(scenarioId, module, subCase)` retention key.
- UI surfaces: extension of `CalculationStatusPanel` so Short Circuit
  becomes a runnable module once the implementation lands; a Short
  Circuit result table behind the same conventions as Stage 2's
  `ResultTables`.

### 2.3 Out-of-scope (Stage 3)

- **Cable Sizing engine** (Stage 4).
- **Equipment Duty Check.** While Short Circuit feeds duty-check
  inputs, the Stage 3 MVP does not compare per-equipment ratings
  against fault currents and does not emit duty-pass / duty-fail rows.
- **Report export** (Excel / PDF) — Stage 5.
- **Disk persistence of any runtime snapshot or result bundle.**
  Continues the Stage 2 §S2-FU-07 deferral.
- **Full protection coordination / TCC viewer** — post-MVP.
- **Arc flash** — post-MVP.
- **Detailed equipment duty / rating database.** No new equipment-
  rating fields are added to the Stage 1 schema in Stage 3.
- **Single-phase-to-ground, line-to-line, double-line-to-ground
  faults.** Out of MVP per S3-OQ-03.
- **Mid-line / branch-end / transformer-terminal faults that are not
  at a modeled bus.** Out of MVP per S3-OQ-04.
- **Generator subtransient short-circuit contribution.** Deferred per
  S3-OQ-05.
- **Motor short-circuit contribution.** Deferred per S3-OQ-05.
- **Multi-utility / multi-slack networks.** Inherits the Stage 2
  S2-FU-03 deferral; Short Circuit fail-closes with `E-SC-006` if
  AppNetwork has zero or more than one slack source.
- **Unbalanced / single-phase / DC / mixed-phase analysis.** Inherits
  the Stage 2 §6.2 exclusion; the contract refuses non-3-phase
  topology buses on the fault path with `E-SC-004`.
- **Any fake calculation result.** Inherits the Stage 2 §14.5 rule.

### 2.4 Stage 1 / Stage 2 guardrails preserved

Stage 3 must preserve the guardrails listed in
`docs/stage-1-implementation-notes.md` and the Stage 2 spec §17:

- `calculationResults` is **not** introduced into the canonical
  project schema.
- The Stage 1 canonical project-file schema is **unchanged** for the
  entirety of Stage 3.
- `calculationSnapshots` remains an optional empty array on the
  project file in every Stage 3 PR.
- No fake calculations.
- Transformer-as-node in the project file (Stage 2 §S2-OQ-04).
- `branch_chain` ordering is upstream-to-downstream and never sorted.
- Deterministic serialization (Stage 1 Rev D §12.3).
- Runtime validation is authoritative; saved validation is audit-only.
- pandapower structures must not leak into the canonical project file
  or into `packages/network-model` / `packages/solver-adapter`'s public
  surface (Stage 2 §8.2).

---

## 3. Applicable Standards and Assumptions

### 3.1 Standard

Stage 3 MVP adopts **IEC 60909-0:2016** ("Short-circuit currents in
three-phase a.c. systems — Part 0: Calculation of currents") as the
calculation basis. The pandapower 2.14.10 implementation
(`pandapower.shortcircuit.calc_sc`) is IEC 60909-oriented; this
alignment keeps the engine well-trodden and avoids re-implementing
clause-by-clause behavior.

### 3.2 Assumptions baked into the MVP

| Topic | Stage 3 assumption |
|---|---|
| Calculation case | `case = "max"` (per IEC 60909). `case = "min"` deferred per S3-FU-01. |
| Fault type | `fault = "3ph"` (3-phase bolted). All other fault types are blocked with `E-SC-004`. |
| Fault location | At buses only. Fault target identified by `busInternalId`. |
| Voltage factor `c` | Taken from `NetworkSource.voltageFactor` (Stage 2 contract). Default 1.0 when missing. Recorded on result metadata. |
| Frequency | Project `frequencyHz` (50 or 60), inherited from `AppNetwork`. |
| Pre-fault voltage | IEC 60909 voltage source method (no separate load flow pre-step in Stage 3 MVP). |
| Bolted fault impedance | Zero. Arc-fault / fault-impedance modeling deferred. |
| Source equivalent | Driven by `scLevelMva` (preferred) or `faultCurrentKa` (fallback) and `xrRatio` per S3-OQ-06. |
| Transformer impedance | Same `vkPercent` / `vkrPercent` / `xrRatio` already wired for Stage 2 Load Flow. |
| Cable impedance | Same `rOhmPerKm` / `xOhmPerKm` × `lengthM` already wired for Stage 2 Load Flow. Zero-sequence parameters not modeled (3-phase balanced fault only). |
| Closed breaker / switch | Topology gate only (S2-OQ-02). Zero impedance, no breaker arc model. |
| Open breaker / switch / out-of-service equipment | Excluded by AppNetwork construction (S2-OQ-03). |
| Generator (`grid_parallel_pq`) contribution | Excluded in MVP (`W-SC-003`). |
| Motor contribution | Excluded in MVP (`W-SC-002`). |
| Topology coverage | Same as Stage 2: `3P3W` and `3P4W` buses only. `1P*` / `DC*` topology on the fault path → `E-SC-004`. |

### 3.3 Provisional vs verified output

A `ShortCircuitResult` is **provisional** by default. It becomes
**verified** only when at least one Stage 3 Golden Case (recorded
under §12.7-equivalent metadata) compares the per-bus values against
an independent reference (hand calculation, IEC textbook example,
verified spreadsheet, or independent commercial tool result). No
Stage 3 PR ships a `verified` reference; promotion is a post-MVP
follow-up (S3-FU-09).

---

## 4. Scope of Short Circuit Calculations

### 4.1 What Short Circuit does in Stage 3

For an in-scope `AppNetwork` and a fault target list:

1. Verify pre-conditions identical to Stage 2 Load Flow: at least one
   bus, exactly one slack source, no unsupported topology bus on the
   fault path. (Failures map to `E-SC-006` / `E-SC-004` before the
   sidecar is spawned.)
2. Verify Stage-3-specific pre-conditions: fault target list non-empty
   when `mode === "specific"`; required short-circuit input fields
   present on slack and on every transformer that lies between the
   slack and a fault target. (Failures map to `E-SC-002` / `E-SC-003`
   / `E-SC-005` before the sidecar is spawned.)
3. Send one `ShortCircuitRequest` to the sidecar over the same stdio
   JSON-Lines transport used by Load Flow. The sidecar invokes
   `pandapower.shortcircuit.calc_sc(net, fault="3ph", case="max",
   ip=True, ith=True)` with the existing pandapower network built from
   `SolverInput`.
4. Project the per-bus result rows back into a `ShortCircuitResult`
   keyed by `busInternalId` and return them in a
   `ShortCircuitRunBundle` alongside the runtime snapshot.

### 4.2 Required input fields for Short Circuit

These fields, missing or non-positive on an in-scope element, are
calculation-blocking with the codes listed in §11. The check happens
in `validateForCalculation()` via a new `validateForShortCircuit()`
wrapper (Stage 3 PR #4 — moved from PR #2 so the wrapper lands next
to the orchestrator that consumes it). The wrapper reuses the Stage 2
readiness function's output shape; it does not duplicate Stage 2
readiness checks.

- **Bus on the fault path**: `vnKv > 0`, `topology ∈ { 3P3W, 3P4W }`.
  (Already enforced by Stage 2 readiness for Load Flow; carried
  through unchanged.)
- **Utility (slack)**: `connectedBus`, `vnKv > 0`, **at least one of**
  `scLevelMva > 0` or `faultCurrentKa > 0` (S3-OQ-06), **and**
  `xrRatio > 0`. `voltageFactor` defaults to 1.0 when missing
  (recorded on result metadata; no warning).
- **Transformer on the fault path**: `snMva > 0`, `vnHvKv > 0`,
  `vnLvKv > 0`, `vkPercent > 0`. `vkrPercent` is preferred; when
  missing, `xrRatio` is used to derive `vkrPercent` per the same
  formula already used by `services/solver-sidecar/src/load_flow.py`.
- **Cable on the fault path**: `lengthM > 0`, `rOhmPerKm > 0`,
  `xOhmPerKm > 0`. (Already enforced by Stage 2 §6.3.)
- **Generator (`grid_parallel_pq`)** and **motors**: not required —
  excluded from MVP per S3-OQ-05.

The wrapper does **not** require equipment ratings (breaker
interrupting capacity, cable short-time withstand). Equipment Duty
Check is out of scope per §2.3.

---

## 5. AppNetwork / Solver Input Impact

### 5.1 AppNetwork remains solver-agnostic

Stage 3 does **not** change `packages/network-model`'s public surface.
`AppNetwork` keeps the Stage 2 PR #2 shape exactly. No
short-circuit-specific fields are added to `NetworkSource`,
`NetworkTransformerBranch`, `NetworkCableBranch`, `NetworkBus`, or any
other `Network*` type in MVP.

Rationale: every short-circuit input the MVP needs is already on the
existing `Network*` types because Stage 2 Load Flow already needs
them (`scLevelMva`, `faultCurrentKa`, `xrRatio`, `voltageFactor` on
sources; `snMva` / `vkPercent` / `vkrPercent` / `xrRatio` on
transformers; `R/X` on cables). Adding placeholder fields for
generator subtransient (`xdssPu`, `rdssPu`) or motor short-circuit
contribution (`kFactor`) before they have a producer would defeat
S3-OQ-05 and pollute the network-model with reserved-but-unused
fields.

### 5.2 No pandapower leakage

The Stage 2 contract rule (Stage 2 §8.2 / `solver_adapter_contract.md`
§3.5) is preserved unchanged: pandapower element kinds, function
names, and option keys never appear on the public API of
`packages/network-model` or `packages/solver-adapter`. The Stage 3
contract types are split across two files using app-side vocabulary:
the wire-side surface (`ShortCircuitFaultTarget`,
`ShortCircuitOptions`, `ShortCircuitRequest`,
`ShortCircuitSidecarBusRow`, `ShortCircuitSidecarResponse`) lands in
`packages/solver-adapter/src/shortCircuit.ts` (Stage 3 PR #2); the
app-normalized surface (`ShortCircuitBusResult`,
`ShortCircuitResult`, `ShortCircuitRunBundle`) lands in
`packages/solver-adapter/src/shortCircuitResults.ts` (Stage 3 PR #4).

### 5.3 SolverInput reuse — recommended path

Per S3-OQ-07, Stage 3 reuses `SolverInput` as-is. The new request
envelope is:

```ts
// packages/solver-adapter/src/shortCircuit.ts (planned)

export type ShortCircuitFaultType = "threePhase";
export type ShortCircuitCase = "maximum"; // "minimum" deferred per S3-FU-01.

export interface ShortCircuitFaultTarget {
  /** Stage 1 Bus.internalId — preserved verbatim from AppNetwork. */
  busInternalId: string;
}

export interface ShortCircuitOptions {
  /** IEC 60909 fault type. MVP supports "threePhase" only. */
  faultType: ShortCircuitFaultType;
  /** IEC 60909 calculation case. MVP supports "maximum" only. */
  calculationCase: ShortCircuitCase;
  /** Compute peak short-circuit current ip per IEC 60909. */
  computePeak: boolean;
  /** Compute thermal equivalent current Ith per IEC 60909. */
  computeThermal: boolean;
}

export const DEFAULT_SHORT_CIRCUIT_OPTIONS: ShortCircuitOptions = {
  faultType: "threePhase",
  calculationCase: "maximum",
  computePeak: true,
  computeThermal: true,
};

/** Wire-format envelope sent to the sidecar's `run_short_circuit` command. */
export interface ShortCircuitRequest {
  /** Stage 2 SolverInput, reused verbatim. Topology comes from here. */
  solverInput: SolverInput;
  /**
   * Fault targets to compute. When the array is empty AND
   * `mode === "all_buses"`, every in-scope bus is faulted in turn.
   * When `mode === "specific"`, the array must be non-empty.
   */
  mode: "all_buses" | "specific";
  faultTargets: ShortCircuitFaultTarget[];
  shortCircuitOptions: ShortCircuitOptions;
}
```

`SolverInput.options.algorithm` / `tolerance` / `maxIter` /
`enforceQLim` are passed through unchanged but are unused by the
short-circuit sidecar code path; the sidecar must not validate them
beyond the existing `inputVersion` check.

### 5.4 Fault targets by `internalId`, not display tag

Per S3-OQ-04, every `ShortCircuitFaultTarget.busInternalId` is the
Stage 1 canonical `Bus.internalId`. The contract never carries a tag
or label as a fault identifier. `mode === "all_buses"` is shorthand
for "fault at every `SolverBus` in the request"; the sidecar still
emits the result keyed by `internalId` so the projection back into
the UI does not depend on the mode flag.

### 5.5 Branch vocabulary preserved

Stage 2's `branchKind: "cable" | "transformer"` vocabulary is
preserved on the per-bus result rows where applicable (e.g., a future
"contribution from branch" view). Stage 3 MVP does not surface
per-branch contribution rows; the result type carries per-bus rows
only (§8). `pandapower`'s `res_line_sc` / `res_trafo_sc` tables are
read by the sidecar but are not projected onto the wire in MVP.

### 5.6 Breaker / switch gate behavior preserved

Stage 2's S2-OQ-02 (closed gate = zero impedance) and S2-OQ-03 (open
or out-of-service gate = path excluded) are preserved unchanged.
Stage 3 does **not** introduce a breaker arc-impedance model and does
**not** introduce an interrupting-capacity field on `NetworkGate`.

---

## 6. Solver Sidecar Impact

### 6.1 New command: `run_short_circuit`

Stage 3 PR #3 adds a `run_short_circuit` command to
`services/solver-sidecar/src/main.py`. The command:

- Reads exactly **one** `ShortCircuitRequest` JSON document from
  stdin.
- Builds the same pandapower network the existing `run_load_flow`
  command builds (`_build_pandapower_net` in `load_flow.py`),
  reusing the helper to keep the topology mapping in one place.
- Invokes `pandapower.shortcircuit.calc_sc(net, fault="3ph",
  case="max", ip=True, ith=True, bus=...)` where `bus` is the
  pandapower indices corresponding to the requested
  `faultTargets` (or the full bus index list when
  `mode === "all_buses"`).
- Projects `net.res_bus_sc.ikss_ka` / `ip_ka` / `ith_ka` /
  `skss_mw` back onto `internalId`-keyed rows.
- Writes one JSON line carrying a `ShortCircuitResponse` to stdout
  and exits 0.
- Maps every failure mode (pandapower import unavailable, malformed
  request, missing required fields on slack/transformer,
  pandapower exception, non-3-phase topology on the fault path) to
  a structured `E-SC-*` issue per §11. Never fabricates numerical
  values.

### 6.2 Hosting model unchanged

Stage 3 inherits the Stage 2 hosting decision
(`solver_adapter_hosting_decision.md`) verbatim:

- Out-of-process Python sidecar.
- One process per call (no daemon).
- Stdio JSON-Lines transport.
- Exact `pandapower==2.14.10` pin in
  `services/solver-sidecar/requirements.txt`. Stage 3 does **not**
  bump the pin in this PR; if the implementation PR (Stage 3 PR #3)
  needs a newer pandapower for `calc_sc` features, the bump goes
  through the same upgrade procedure documented in
  `requirements.txt` (re-run every verified Golden Case).

### 6.3 Sidecar request / response shape

Wire format is JSON-Lines, identical to Stage 2. The sidecar response
shape below is the **solver/contract boundary** — it uses solver-side
field names (`internalId`, `status: "valid" | "warning" | "failed"`)
that mirror the existing Stage 2 `SolverResult` vocabulary. The
TypeScript orchestrator normalizes this wire shape into the
app-side `ShortCircuitResult` per §7.5. The two shapes are
intentionally distinct: the wire response carries only what the
sidecar actually computed, and the app result carries the
app-vocabulary projection plus any synthesized rows for buses that
were not part of the fault target list.

Request (one line on stdin):

```json
{
  "solverInput": { /* Stage 2 SolverInput, inputVersion "1.0.0" */ },
  "mode": "all_buses" | "specific",
  "faultTargets": [{ "busInternalId": "BUS-MV" }],
  "shortCircuitOptions": {
    "faultType": "threePhase",
    "calculationCase": "maximum",
    "computePeak": true,
    "computeThermal": true
  }
}
```

Response (one line on stdout):

```json
{
  "status": "succeeded" | "failed_validation" | "failed_solver",
  "metadata": { /* SolverMetadata — see §6.4 */ },
  "shortCircuit": {
    "calculationCase": "maximum",
    "faultType": "threePhase",
    "computePeak": true,
    "computeThermal": true,
    "voltageFactor": 1.0
  },
  "buses": [
    {
      "internalId": "BUS-MV",
      "voltageLevelKv": 11.0,
      "ikssKa": 18.42,
      "ipKa": 41.18,
      "ithKa": 19.05,
      "skssMva": 351.2,
      "status": "valid" | "warning" | "failed",
      "issueCodes": []
    }
  ],
  "issues": [
    { "code": "E-SC-001", "severity": "error", "message": "..." }
  ]
}
```

Every per-bus numeric field on the wire (`ikssKa`, `ipKa`, `ithKa`,
`skssMva`) is **nullable**: when pandapower returns NaN for a row, or
when the corresponding `computePeak` / `computeThermal` flag was
disabled, the sidecar emits `null` for the affected field rather than
fabricating a value (§7.1). Rows that the sidecar could not compute at
all (e.g., a per-bus pandapower exception) are still emitted with
`status: "failed"` and all numeric fields `null`. The sidecar response
**never** contains rows for buses outside the fault target set —
"unavailable" is an app-side status synthesized by the orchestrator
(§7.5).

### 6.4 Solver metadata

The existing `SolverMetadata` shape from
`packages/solver-adapter/src/types.ts` is reused unchanged. The
sidecar populates:

- `solverName: "pandapower"`
- `solverVersion`: pandapower's `__version__`, identical to Load Flow.
- `adapterVersion`: sidecar version (the orchestrator overrides with
  the TypeScript adapter semver before normalization, identical to
  Load Flow).
- `options`: the **Stage 2 `SolverOptions`** still travels through
  unchanged on `metadata.options`; the short-circuit-specific options
  (`calculationCase`, `faultType`, `computePeak`, `computeThermal`,
  effective `voltageFactor`) live on a separate `shortCircuit` block
  on the result envelope (see the response example in §6.3) so that
  retention consumers can record both without tripping on Load Flow's
  NR options.
- `executedAt`: ISO-8601 UTC timestamp.
- `inputHash` / `networkHash`: reserved (`null` in MVP, identical to
  Load Flow).

### 6.5 What this PR does NOT ship for the sidecar

Stage 3 PR #1 (this PR) ships **no** sidecar code changes:

- `services/solver-sidecar/src/main.py` is not modified.
- `services/solver-sidecar/src/load_flow.py` is not modified.
- `services/solver-sidecar/requirements.txt` is not modified.
- No `services/solver-sidecar/src/short_circuit.py` is created.
- No `services/solver-sidecar/src/contracts.py` short-circuit
  additions.

The sidecar implementation lands in Stage 3 PR #3.

---

## 7. Result Model — Per-Bus Detail

### 7.1 What pandapower 2.14.10 reliably produces

pandapower's `calc_sc` populates `net.res_bus_sc` with the following
columns when the corresponding option is enabled:

- `ikss_ka` — initial symmetrical short-circuit current (`Ik''`).
  Always populated.
- `ip_ka` — peak short-circuit current (`ip`). Populated when
  `ip=True`.
- `ith_ka` — thermal equivalent short-circuit current (`Ith`).
  Populated when `ith=True`.
- `skss_mw` — initial symmetrical short-circuit apparent power
  (`Sk''`). Always populated. Despite the column name, the unit is
  MVA in pandapower 2.14; the result is projected to a `skssMva`
  field on the wire to avoid the confusing column name.

The Stage 3 result type uses `number | null` for **every** per-bus
numeric output (`ikssKa`, `ipKa`, `ithKa`, `skssMva`) so that the
sidecar and the orchestrator can return `null` honestly whenever a
value cannot be computed. The cases that produce a `null` numeric
field are:

1. The option that controls the column was disabled
   (`computePeak === false` → `ipKa: null`;
   `computeThermal === false` → `ithKa: null`).
2. pandapower returned NaN on that row.
3. The per-row pandapower computation failed (rare, but possible —
   per-bus rows fall back to `status: "failed"` and all four numeric
   fields `null`).
4. The orchestrator synthesized the row for a bus that was **not** in
   the fault target list (`status: "unavailable"`, all four numeric
   fields `null`; see §7.3 / §7.5).

The result model **never** invents a substitute (e.g., `ip ≈ 2.55 ×
ikss`) when a column is missing. Failed and unavailable rows are
preserved in `busResults` so that the UI can render an explicit empty
cell next to the bus tag rather than silently dropping it; the
fail-closed rule from Stage 2 §14.5 is preserved end-to-end.

### 7.2 Type sketch

The following TypeScript interfaces are illustrative — they live in
`packages/solver-adapter/src/shortCircuit.ts` (planned for Stage 3
PR #2). All identifiers use Stage 1 canonical `internalId`
vocabulary.

```ts
export type ShortCircuitStatus = "valid" | "warning" | "failed";
export type ShortCircuitBusStatus = "ok" | "warning" | "failed" | "unavailable";

export type ShortCircuitIssueCode =
  | "E-SC-001"
  | "E-SC-002"
  | "E-SC-003"
  | "E-SC-004"
  | "E-SC-005"
  | "E-SC-006"
  | "W-SC-001"
  | "W-SC-002"
  | "W-SC-003";

export type ShortCircuitIssueSeverity = "error" | "warning";

export interface ShortCircuitIssue {
  code: ShortCircuitIssueCode;
  severity: ShortCircuitIssueSeverity;
  message: string;
  /** Optional pointer back into AppNetwork for UI navigation. */
  internalId?: string;
  field?: string;
}

export interface ShortCircuitBusResult {
  /** = SolverBus.internalId. Resolves back into AppNetwork. */
  busInternalId: string;
  /** Carried forward for display; UI never re-derives from internalId. */
  tag: string;
  /** Stage 1 Bus.vnKv. */
  voltageLevelKv: number;
  /** Initial symmetrical short-circuit current (kA), IEC 60909 Ik''. `null` when the row could not be computed (per-bus failure, NaN, or `unavailable` status). */
  ikssKa: number | null;
  /** Peak short-circuit current (kA), IEC 60909 ip. `null` when computePeak=false, pandapower returned NaN, or the row is `failed` / `unavailable`. */
  ipKa: number | null;
  /** Thermal equivalent short-circuit current (kA), IEC 60909 Ith. `null` when computeThermal=false, pandapower returned NaN, or the row is `failed` / `unavailable`. */
  ithKa: number | null;
  /** Initial symmetrical short-circuit apparent power (MVA), IEC 60909 Sk''. `null` when the row could not be computed (per-bus failure, NaN, or `unavailable` status). */
  skssMva: number | null;
  /**
   * Per-bus status. `"unavailable"` when the bus was not in the fault
   * target list (orchestrator-synthesized row); `"failed"` when the
   * bus was targeted but pandapower could not produce a value for it.
   * In both cases all four numeric fields are `null` (§7.1).
   */
  status: ShortCircuitBusStatus;
  /** Per-row issue codes that contributed to `status`. */
  issueCodes: ShortCircuitIssueCode[];
}

export interface ShortCircuitResult {
  resultId: string;
  runtimeSnapshotId: string;
  scenarioId: string | null;
  /**
   * App-side result-API module identifier. This is **not** the same
   * field as the calculation-store retention key
   * `CalculationModule = "short_circuit_bundle"` (§8.2). They are
   * related — both identify the Short Circuit calculation — but live
   * on different APIs: `module` here annotates the result envelope so
   * UI consumers can discriminate result kinds, whereas the retention
   * key is a runtime-store index into `retainedResults`.
   */
  module: "shortCircuit";
  status: ShortCircuitStatus;
  faultType: ShortCircuitFaultType;
  calculationCase: ShortCircuitCase;
  /** Voltage factor `c` actually used (default 1.0 when missing). */
  voltageFactor: number;
  /**
   * Per-bus rows keyed by busInternalId. Includes rows for every
   * in-scope `SolverBus`, regardless of whether the bus was in the
   * fault target set: targeted-and-computed rows carry numeric
   * values, targeted-but-failed rows carry null numerics with
   * `status: "failed"`, and non-targeted rows carry null numerics
   * with `status: "unavailable"` (§7.3 / §7.5).
   * Empty only when the run failed before any normalization could
   * happen (e.g., sidecar transport failure → top-level
   * `status === "failed"`).
   */
  busResults: ShortCircuitBusResult[];
  /** Top-level issues — never fabricated values. */
  issues: ShortCircuitIssue[];
  /** Solver metadata identical to the Stage 2 LoadFlowResult metadata. */
  metadata: SolverMetadata;
  createdAt: string;
}

export interface ShortCircuitRunBundle {
  shortCircuit: ShortCircuitResult;
  snapshot: RuntimeCalculationSnapshot;
  /** SolverInput sent to the sidecar — same shape and snapshot guarantees as Stage 2 LoadFlowRunBundle.solverInput. */
  solverInput: SolverInput;
  request: ShortCircuitRequest;
}
```

### 7.3 Per-bus status mapping

The per-bus `status` field aggregates per-row warnings:

| Condition | `status` | Numeric fields |
|---|---|---|
| Bus was faulted, all required inputs present, pandapower converged | `ok` | populated |
| Bus was faulted; result was produced but a `W-SC-*` was raised on the row (e.g., source data partial used to derive equivalent) | `warning` | populated |
| Bus was faulted; pandapower failed for that specific bus (NaN values, per-bus exception) | `failed` | all `null` |
| Bus was **not** in the fault target list (orchestrator-synthesized row) | `unavailable` | all `null` |

The top-level `status` follows the Stage 2 PR #5 derivation rule. It
is aligned with — and must stay consistent with — the
sidecar→app top-level status mapping in §7.5.3:

- `failed` if the run could not be normalized at all (transport
  failure, pre-normalization sidecar exit, or any
  `failed_validation` / `failed_solver` sidecar response). In this
  case `busResults` may be empty.
- `warning` if the run completed and **any** per-row `failed`
  appears in `busResults`. A per-row failure does not block the
  other rows; the top-level status reflects "the run completed with
  warnings".
- `warning` if the run completed with **at least one** per-row
  `warning` and no per-row `failed`.
- `valid` if the run completed with only `ok` and/or
  `unavailable` per-row statuses **and** no top-level issues.
  `unavailable` rows do **not** by themselves flip the top-level
  status — they reflect the `mode === "specific"` scoping decision,
  not a calculation failure.

### 7.4 What is intentionally NOT in the result

- **No per-branch contribution.** pandapower's `res_line_sc` /
  `res_trafo_sc` / `res_ext_grid_sc` are not projected onto the wire
  in MVP. Adding them would require a per-branch row vocabulary that
  Stage 3 has no UI for and that Equipment Duty Check (out of scope
  per §2.3) has no consumer for yet.
- **No equipment duty pass / fail.** Out of scope per §2.3.
- **No per-fault-location annotation beyond `busInternalId`.** A
  future "fault at branch end" feature (S3-FU-02) will need a richer
  `faultLocation` discriminator; the MVP does not pre-bake it.
- **No per-source contribution breakdown.** Useful for protection
  coordination; deferred (S3-FU-05).

### 7.5 Sidecar response → app-normalized result mapping

The sidecar response (§6.3) and the app-normalized
`ShortCircuitResult` (§7.2) deliberately use **different**
vocabularies. The orchestrator
`runShortCircuitForAppNetwork()` (planned for Stage 3 PR #4) is
responsible for the projection. The mapping rules:

#### 7.5.1 Field renames

| Sidecar response field | App-normalized field |
|---|---|
| `buses[i].internalId` | `busResults[j].busInternalId` |
| `buses[i].voltageLevelKv` | `busResults[j].voltageLevelKv` |
| `buses[i].ikssKa` | `busResults[j].ikssKa` |
| `buses[i].ipKa` | `busResults[j].ipKa` |
| `buses[i].ithKa` | `busResults[j].ithKa` |
| `buses[i].skssMva` | `busResults[j].skssMva` |
| `buses[i].issueCodes` | `busResults[j].issueCodes` |
| `shortCircuit.calculationCase` | `ShortCircuitResult.calculationCase` |
| `shortCircuit.faultType` | `ShortCircuitResult.faultType` |
| `shortCircuit.voltageFactor` | `ShortCircuitResult.voltageFactor` |
| `metadata` | `ShortCircuitResult.metadata` (with `adapterVersion` overridden by the TypeScript adapter semver, identical to Stage 2 Load Flow) |
| `issues` | `ShortCircuitResult.issues` |

`tag` on `ShortCircuitBusResult` is filled by the orchestrator from
`AppNetwork.buses[].tag` (looked up by `internalId`); it is not
carried on the wire because `SolverInput` already has it.

#### 7.5.2 Per-row status mapping

| Sidecar response `buses[i].status` | App-normalized `busResults[j].status` |
|---|---|
| `"valid"` | `"ok"` |
| `"warning"` | `"warning"` |
| `"failed"` (per-bus pandapower failure / NaN) | `"failed"` |

The app-side `"unavailable"` status has **no** equivalent in the
sidecar response — it is synthesized exclusively by the orchestrator
for buses that were not in the fault target set. Specifically, when
`request.mode === "specific"`, the orchestrator iterates every
in-scope `AppNetwork.buses` entry and:

1. If the bus's `internalId` appears in the response's `buses[i]`,
   project the row through the field-rename and status-mapping
   tables above.
2. Otherwise, append a synthesized row with
   `status: "unavailable"`, all four numeric fields `null`, and an
   empty `issueCodes` array.

When `request.mode === "all_buses"`, every bus is in the fault
target set by definition, so the orchestrator should not need to
synthesize any `unavailable` rows; if a sidecar response is missing a
bus that was implied by `mode === "all_buses"` (e.g., the sidecar
skipped it for an internal reason), the orchestrator still
synthesizes an `unavailable` row plus a top-level `W-SC-*` /
`E-SC-*` issue noting the discrepancy (the exact code is decided in
Stage 3 PR #4 alongside the orchestrator implementation).

#### 7.5.3 Top-level status mapping

| Sidecar response top-level `status` | App-normalized `ShortCircuitResult.status` |
|---|---|
| `"succeeded"` with no per-row `failed` and no per-row `warning` | `"valid"` |
| `"succeeded"` with at least one per-row `warning` and no per-row `failed` | `"warning"` |
| `"succeeded"` with at least one per-row `failed` | `"warning"` (per-row failure does not block other rows; top-level status reflects "the run completed with warnings") |
| `"failed_validation"` or `"failed_solver"` | `"failed"` |

Transport-level failures (sidecar non-zero exit, malformed JSON, IPC
timeout, missing metadata) map to a synthesized
`status: "failed"` result with `busResults: []` and a single
`E-SC-001` issue, identical in spirit to the Stage 2 Load Flow
`E-LF-004` handling.

#### 7.5.4 Numeric nullability is preserved end-to-end

A `null` numeric field on the wire passes through unchanged to the
app-normalized result. The orchestrator does **not** substitute a
default and does **not** drop the row. This preserves the §S3-OQ-02
fail-closed rule.

---

## 8. Runtime Snapshot / Calculation-Store Impact

### 8.1 Runtime snapshot

Stage 3 reuses the Stage 2
`packages/solver-adapter/src/runtimeSnapshot.ts`
`RuntimeCalculationSnapshot` shape unchanged. A short-circuit run
creates exactly one runtime snapshot, identical in structure to the
Load Flow snapshot:

- Deep copy of the post-override `AppNetwork`.
- Deep copy of the `SolverInput` sent to the sidecar.
- `validation: RuntimeValidationSummary` populated from the new
  `validateForShortCircuit()` wrapper (planned for Stage 3 PR #4
  alongside the orchestrator that consumes it).
- `solver`: name `"pandapower"`, version filled from
  `SolverMetadata.solverVersion` after the run, and the Stage 2
  `SolverOptions` (unchanged).

The snapshot does **not** carry the `ShortCircuitOptions` or the
fault target list; those live on the bundle's `request` field
(§7.2). This keeps the snapshot type stable across modules — only
the bundle differs.

### 8.2 Calculation-store retention

The Stage 2 `packages/calculation-store` retention shape (§Stage 2
§9.5 / §10.5) is reused with the following widenings (Stage 3 PR #4
only — Stage 3 PR #1 / #2 do not touch the package):

- `CalculationModule` literal union becomes
  `"load_flow_bundle" | "short_circuit_bundle"`.
- `RuntimeResultRetentionKey` carries `module: "short_circuit_bundle"`
  for short-circuit retention. (This is the **retention key**; it is
  related to but distinct from the app result-API field
  `ShortCircuitResult.module = "shortCircuit"` documented in §7.2.)
- `subCase` stays `null` for MVP; future sub-cases (e.g., per-fault-
  location, per-calculation-case) reuse the existing slot without
  reshaping the key.
- `RuntimeCalculationRecord.bundle` is currently typed as
  `LoadFlowRunBundle` in `packages/calculation-store/src/types.ts`.
  This must be widened to a union (recommended) or a generic so
  short-circuit retention can hold a `ShortCircuitRunBundle` under the
  same record shape. The recommended union is
  `bundle: LoadFlowRunBundle | ShortCircuitRunBundle`, with the
  retention key's `module` field acting as the discriminator. A
  fully-generic `RuntimeCalculationRecord<TBundle>` is also viable but
  pushes a type parameter onto every retention consumer; the MVP
  prefers the discriminated union for ergonomics. The exact shape is
  finalized in Stage 3 PR #4 alongside the orchestrator.

Retention rules are unchanged from Stage 2:

- Latest **successful** Short Circuit result per
  `(scenarioId, "short_circuit_bundle", null)`.
- Latest **failed** snapshot for audit (`lastFailedSnapshot` slot is
  shared between modules; if a Short Circuit run fails, it overwrites
  the slot exactly the same way a failed Load Flow run does).
- Stale flag: a project edit that affects the AppNetwork flips the
  retained Short Circuit record's `stale` flag. **No auto-recompute.**
  The user explicitly re-runs.

### 8.3 No project file serialization

Per S3-OQ-09 / Stage 2 §S2-OQ-06:

- The project file's `calculationSnapshots` array remains an empty
  array in **every** Stage 3 PR.
- `calculationResults` is **not** added to the canonical project
  schema.
- No disk persistence of runtime snapshots / result bundles.

---

## 9. UI Impact

### 9.1 CalculationStatusPanel

Stage 1 PR #2's `CalculationStatusPanel` was extended in Stage 2 PR #5
to make Load Flow / Voltage Drop runnable. Stage 3 extends the same
panel to add a Short Circuit module entry. Until Stage 3 PR #5
implements the wiring:

- The panel **may** show a Short Circuit row labeled "planned"
  (parallel to the Stage 1 "not implemented" placeholder), but it
  must **not** show a Run button. Stage 3 PR #1 (this PR) does not
  modify the panel.
- Once Stage 3 PR #5 lands, the panel reads the new
  `validateForShortCircuit()` result and renders the same
  `ready_to_run` / `blocked_by_validation` / `disabled_by_validation`
  states already used by Load Flow.

### 9.2 Result table

A new `ShortCircuitResultTable` is added in Stage 3 PR #5. Rows are
keyed by `busInternalId` and display:

- bus tag (read-only, from `ShortCircuitBusResult.tag`)
- voltage level (kV)
- `Ik''` (kA)
- `ip` (kA) — blank when null
- `Ith` (kA) — blank when null
- `Sk''` (MVA)
- per-row status badge

`internalId` is the React key; `tag` is for display, consistent with
Stage 1 / Stage 2 conventions. Test ids follow the existing
`result-bus-<id>-status` pattern, namespaced as
`result-sc-bus-<id>-status` to avoid collision with the Stage 2 Load
Flow bus row.

### 9.3 Diagram overlay

A diagram overlay for fault current (`Ik''` near each bus) is
**deferred** to a follow-up beyond Stage 3 PR #5. The overlay surface
in `apps/web/src/components/DiagramCanvas.tsx` is left unchanged in
Stage 3 PR #5 except for any structural extension needed to add a
second overlay layer; if the implementation finds that a single
extension touch is cheap, it may ship with the result table, but it
is not a Stage 3 acceptance requirement.

### 9.4 Run button behavior

The Run button surface for Short Circuit is defined in Stage 3 PR #5,
not in this PR. Spec-only contract for the implementation PR:

- Disabled when `validateForShortCircuit()` returns
  `blocked_by_validation`. Tooltip lists the top 3–5 blocking codes.
- Disabled when no `SidecarTransport` is configured (e.g., in a
  browser build with no desktop wrapper), identical to the Stage 2
  Load Flow disabled state.
- Enabled otherwise. Clicking the button issues a single
  `runShortCircuitForAppNetwork(appNetwork, …)` call with
  `mode: "all_buses"` as the MVP default.
- No fake fault current is ever rendered. Failed runs surface the
  issue codes from `ShortCircuitResult.issues` and per-row
  `issueCodes`; the table renders empty cells for numeric columns
  rather than zeros.

### 9.5 No fake results

The Stage 1 / Stage 2 prohibition is preserved. There is **no path**
in Stage 3 UI that returns fabricated short-circuit numbers. If a run
fails or is blocked, the Short Circuit table shows an empty state
plus the issues list, exactly like Stage 2's Load Flow / Voltage Drop
empty states.

---

## 10. Adapter Contract Tests (Planned)

The Stage 2 `S2-ADP-*` test groups (`solver_adapter_contract.md` §6)
are unchanged. Stage 3 adds a new group of contract tests, mapped
later to the `AC-S3-*` matrix in §12. Test files live in the package
they exercise.

| Group | Layer | Package | Test focus |
|---|---|---|---|
| `S3-ADP-01` | A1 | `packages/network-model` | No regression: every Stage 1 equipment kind still round-trips into the correct `Network*` element after Stage 3 changes. (Stage 3 must not modify AppNetwork shape.) |
| `S3-ADP-02` | A2 | `packages/solver-adapter` | `AppNetwork → SolverInput` is unchanged for short-circuit reuse: the same `SolverInput` is byte-identical whether the consumer is Load Flow or Short Circuit, given the same AppNetwork. |
| `S3-ADP-03` | A2 | `packages/solver-adapter` | `ShortCircuitRequest` envelope: every fault target's `busInternalId` is a real `SolverBus.internalId`; `mode: "specific"` with empty `faultTargets` is rejected; `mode: "all_buses"` with non-empty `faultTargets` is allowed (the array is treated as a hint and ignored). |
| `S3-ADP-04` | sidecar | `services/solver-sidecar` | `run_short_circuit` smoke: builds the same pandapower network as `run_load_flow` from a shared `SolverInput`; `pandapower.shortcircuit.calc_sc` is invoked with `fault="3ph"`, `case="max"`. (Opt-in integration test gated behind `RUN_SIDECAR_INTEGRATION=1`, identical to the Stage 2 pattern.) |
| `S3-ADP-05` | A3 | `packages/solver-adapter` | `ShortCircuitResponse → ShortCircuitResult`: every `busInternalId` resolves to a Stage 1 canonical bus; numeric fields preserved; `ipKa` / `ithKa` are `null` when the option was disabled; per-row `status` mapping per §7.3. |
| `S3-ADP-06` | A4 | `apps/web` | `ShortCircuitResult → ShortCircuitResultTable`: rows render with status badges; empty state surfaces when `status === "failed"`. |
| `S3-ADP-07` | A5 | `packages/calculation-store` | `ShortCircuitRunBundle → CalculationStoreState`: retained under `(scenarioId, "short_circuit_bundle", null)`; project edit flips the record's `stale` flag; the project file's `calculationSnapshots` array is unchanged. |

Each group has at least one positive case and one negative case (an
input that should produce a specific `E-SC-*` code per §11).

---

## 11. Warning / Error Codes (Stage 3)

Stage 3 introduces the codes below. Stage 1 codes (Rev D §11.2) and
Stage 2 codes (Stage 2 §11) remain in force unchanged. New codes
follow the same `<severity>-<area>-NNN` convention. **All codes are
app-level codes**, not pandapower exception names.

### 11.1 Errors

| Code | Severity | Condition | Calculation impact |
|---|---|---|---|
| `E-SC-001` | error | Solver sidecar short-circuit failure (pandapower exception inside `calc_sc`, IPC timeout, malformed sidecar response). | Run failed. Status `failed_solver`. No `ShortCircuitBusResult` rows emitted. |
| `E-SC-002` | error | Missing source short-circuit data on the slack utility: neither `scLevelMva > 0` nor `faultCurrentKa > 0` is present, **or** `xrRatio > 0` is missing. | Run blocked before sidecar spawn. |
| `E-SC-003` | error | Missing transformer impedance on a transformer that lies between the slack and a fault target: `snMva`, `vnHvKv`, `vnLvKv`, or `vkPercent` is missing or non-positive. | Run blocked. |
| `E-SC-004` | error | Unsupported topology, grounding, or fault type on the fault path: `1P*` / `DC*` bus, transformer winding voltage mismatch, or `faultType !== "threePhase"`. | Run blocked. |
| `E-SC-005` | error | Missing fault target: `mode === "specific"` and `faultTargets` is empty, **or** a `busInternalId` does not resolve to a `SolverBus`. | Run blocked. |
| `E-SC-006` | error | Source / slack invariant violated: zero or more than one in-service slack source on the AppNetwork. | Run blocked. Reuses the Stage 2 multi-slack guard rather than introducing a parallel check. |

### 11.2 Warnings

| Code | Severity | Condition |
|---|---|---|
| `W-SC-001` | warning | Source data partial: `faultCurrentKa` was used as a fallback because `scLevelMva` was absent, OR both were present but inconsistent beyond the documented tolerance. The result still ships; the user is told which input drove the equivalent. |
| `W-SC-002` | warning | Motor short-circuit contribution ignored on this run (S3-OQ-05). Raised when the AppNetwork contains at least one in-service motor. |
| `W-SC-003` | warning | Generator subtransient short-circuit contribution ignored on this run (S3-OQ-05). Raised when the AppNetwork contains at least one in-service `grid_parallel_pq` generator. |

### 11.3 Stage 1 / Stage 2 codes that change role in Stage 3

- `E-LF-002` (unsupported topology in Load Flow) is **not** reused for
  Short Circuit. The equivalent condition raises `E-SC-004` so that
  the user can distinguish "blocked Load Flow" from "blocked Short
  Circuit" in the Calculation status panel.
- `E-LF-003` (multi-slack / no-slack) is **not** reused either.
  Equivalent condition raises `E-SC-006`. Same rationale.
- All other Stage 1 / Stage 2 codes retain their meaning.

---

## 12. Stage 3 Acceptance Criteria

Stage 3 PR #1 (this PR) only delivers the spec. The acceptance matrix
below enumerates ACs that gate the entire Stage 3 work; per-PR AC
graduation is recorded in §13 alongside each PR.

| AC | Criterion |
|---|---|
| AC-S3-01 | This spec defines the Short Circuit MVP scope: 3-phase bolted bus faults, IEC 60909 maximum case, fault target by `busInternalId`, source contribution policy per S3-OQ-05. (§§1, 2, 3, 4) |
| AC-S3-02 | `AppNetwork` remains solver-agnostic across Stage 3: no pandapower types in `packages/network-model` or `packages/solver-adapter`'s public surface; the canonical project schema is unchanged; the canonical drift test still passes. (§5, §S3-OQ-09, §17) |
| AC-S3-03 | The sidecar `run_short_circuit` command contract is defined: request envelope (`ShortCircuitRequest`), response shape (`ShortCircuitResponse`), failure modes mapped to `E-SC-*` codes, transport reused from Stage 2. (§6, §11) |
| AC-S3-04 | The `ShortCircuitResult` model is defined: per-bus rows keyed by `busInternalId`, IEC 60909 outputs (`Ik''`, `ip`, `Ith`, `Sk''`), per-row status, top-level status, issues, metadata. Distinguishes pandapower-reliable outputs from optional outputs (`ipKa` / `ithKa` may be `null`). (§7) |
| AC-S3-05 | Runtime-only guardrails preserved: `calculationSnapshots` stays empty in every Stage 3 PR; `calculationResults` is not added; no disk persistence; no fake numbers; runtime snapshot reused unchanged from Stage 2. (§8, §9.5, §17) |
| AC-S3-06 | Non-goals and deferred items are explicitly listed: minimum case, line-end faults, generator subtransient, motor contribution, equipment duty, multi-slack, single-phase / DC / mixed-phase faults, arc flash, report export, cable sizing. (§2.3, §15) |
| AC-S3-07 | The implementation PR breakdown is defined: Stage 3 PR #2 (contract / wire / input types only — request envelope, sidecar response shape, structural guard, issue codes), PR #3 (sidecar `run_short_circuit` + adapter transport call + adapter tests), PR #4 (orchestrator + app-normalized result types + `validateForShortCircuit()` + runtime snapshot/result normalization + `calculation-store` retention widening), PR #5 (UI result table / status wiring), PR #6 (acceptance closeout). Each PR has a concrete shipping list and a do-not-ship boundary. (§13) |

### 12.1 Proposed future manifest structure

When Stage 3 PR #6 (closeout) lands, the project's
`scripts/acceptance-coverage.json` should grow a third top-level
block:

```jsonc
{
  "stage1": { "criteria": [ /* AC01..AC23 — unchanged */ ] },
  "stage2": { "criteria": [ /* AC-S2-01..17 — unchanged */ ] },
  "stage3": {
    "criteria": [
      { "id": "AC-S3-01", "summary": "Short Circuit MVP scope defined", "owner": "docs/stage-3/stage_3_short_circuit_mvp_spec.md §§1,2,3,4 + scripts/check-spec-coverage.ts (planned)" },
      { "id": "AC-S3-02", "summary": "AppNetwork remains solver-agnostic", "owner": "packages/schemas/tests/canonical-drift.test.ts + packages/network-model/tests/buildAppNetwork.test.ts + grep guard (no pandapower imports outside services/solver-sidecar/)" },
      { "id": "AC-S3-03", "summary": "Sidecar run_short_circuit command contract defined", "owner": "packages/solver-adapter/tests/shortCircuit.contract.test.ts (Stage 3 PR #2) + services/solver-sidecar/tests/run_short_circuit.test.py (Stage 3 PR #3) + opt-in packages/solver-adapter/tests/shortCircuit.integration.test.ts (RUN_SIDECAR_INTEGRATION=1)" },
      { "id": "AC-S3-04", "summary": "ShortCircuitResult model defined", "owner": "packages/solver-adapter/src/shortCircuitResults.ts (Stage 3 PR #4) + packages/solver-adapter/tests/shortCircuitResults.test.ts (Stage 3 PR #4) — wire-side types live in packages/solver-adapter/src/shortCircuit.ts (Stage 3 PR #2)" },
      { "id": "AC-S3-05", "summary": "Runtime-only guardrails preserved", "owner": "packages/calculation-store/tests/reducer.test.ts (short_circuit_bundle retention) + packages/schemas/src/stage_1_project_schema.rev_d.zod.ts pins calculationSnapshots to max(0) + apps/web/tests/calculationStore.test.tsx (project file unchanged after SC run)" },
      { "id": "AC-S3-06", "summary": "Non-goals and deferred items listed", "owner": "docs/stage-3/stage_3_short_circuit_mvp_spec.md §§2.3 and 15" },
      { "id": "AC-S3-07", "summary": "Implementation PR breakdown defined", "owner": "docs/stage-3/stage_3_short_circuit_mvp_spec.md §13" }
    ]
  }
}
```

`scripts/check-acceptance.ts` would gain a `stage3Expected` array
mirroring `stage1Expected` / `stage2Expected`, generated from the
`AC-S3-NN` template. Stage 3 PR #1 (this PR) does **not** modify
`scripts/acceptance-coverage.json` or `scripts/check-acceptance.ts`;
the manifest extension lands in Stage 3 PR #6.

---

## 13. Implementation PR Breakdown

Stage 3 ships in six PRs, each independently reviewable. PR
boundaries match the guardrail "do not implement Stage 3 in this PR"
from this spec.

### Stage 3 PR #1 — Spec only (this PR)

- New file: `docs/stage-3/stage_3_short_circuit_mvp_spec.md`.
- No code changes.
- No schema changes.
- No solver-sidecar behavior changes.
- No new dependencies.
- Acceptance: AC-S3-01, AC-S3-06, AC-S3-07 satisfied by this spec.
- Guardrail check: `git diff --stat` shows only the new spec file
  (and a `docs/stage-3/` directory if previously absent).

### Stage 3 PR #2 — Contract / wire / input types only

PR #2 is **contract-and-wire-only**. App-normalized result types, the
runtime bundle, the validation-readiness wrapper, normalization, and
retention widening all land in PR #4 — see the boundary list below.

- New file: `packages/solver-adapter/src/shortCircuit.ts` carrying
  the **request- and wire-side** surface only:
  `ShortCircuitFaultType`, `ShortCircuitCase`, `ShortCircuitMode`,
  `ShortCircuitFaultTarget`, `ShortCircuitOptions`,
  `DEFAULT_SHORT_CIRCUIT_OPTIONS`, `ShortCircuitRequest`,
  `SHORT_CIRCUIT_COMMAND`, `ShortCircuitErrorCode` /
  `ShortCircuitWarningCode` / `ShortCircuitIssueCode`,
  `ShortCircuitIssueSeverity`, `ShortCircuitWireIssue`,
  `ShortCircuitSidecarBusRowStatus`, `ShortCircuitSidecarBusRow`,
  `ShortCircuitSidecarMetadataBlock`,
  `ShortCircuitSidecarResponseStatus`,
  `ShortCircuitSidecarResponse`, and the strict structural guard
  `isShortCircuitSidecarResponse()`.
- Re-export from `packages/solver-adapter/src/index.ts`.
- New file: `packages/solver-adapter/tests/shortCircuitContract.test.ts`
  with structural guards (mirrors the Stage 2 PR #3 contract test
  pattern), the negative-case rejections required by the strict
  `isShortCircuitSidecarResponse()` guard (top-level status enum,
  `shortCircuit` block enums, bus-row status enum and required
  nullable numerics, issue severity/code/message), and the negative
  cases for `E-SC-005` / `E-SC-006`.
- Optional: Python TypedDict mirror of the wire shapes in
  `services/solver-sidecar/src/contracts.py` so the Python side stays
  next to the contract. No `run_short_circuit` dispatcher.
- **Out of scope for PR #2 (move to PR #4):**
  `ShortCircuitIssue` (app-normalized issue type),
  `ShortCircuitBusResult`, `ShortCircuitResult`,
  `ShortCircuitRunBundle`, `validateForShortCircuit()` wrapper,
  sidecar response → app-normalized projection, and any
  `calculation-store` retention widening.
- No sidecar `run_short_circuit` execution. No transport call. No
  orchestrator. No UI changes. No `calculation-store` changes.
- Acceptance: AC-S3-03 partially advanced (request envelope and wire
  response shape defined); AC-S3-02 reinforced (no pandapower imports
  in the new file). AC-S3-04 graduation (the app-normalized result
  model) is **deferred to PR #4** because that is where the
  app-normalized types are introduced.

### Stage 3 PR #3 — Sidecar `run_short_circuit` command + adapter tests

- New file: `services/solver-sidecar/src/short_circuit.py` carrying
  the pandapower invocation (mirrors `load_flow.py`).
- Edit: `services/solver-sidecar/src/main.py` adds the
  `run_short_circuit` command dispatcher.
- Edit: `services/solver-sidecar/src/contracts.py` mirrors the
  Stage 3 contract types.
- Possible edit: `services/solver-sidecar/requirements.txt` only if
  `pandapower==2.14.10` is found to be missing a `calc_sc` feature
  the MVP needs. Documented in the PR.
- New file: `packages/solver-adapter/src/shortCircuitClient.ts`
  carrying the `runShortCircuit` transport call (mirrors
  `runLoadFlow`).
- New tests: `packages/solver-adapter/tests/shortCircuitClient.test.ts`
  + opt-in `packages/solver-adapter/tests/shortCircuit.integration.test.ts`
  gated behind `RUN_SIDECAR_INTEGRATION=1`.
- Acceptance: AC-S3-03 mapped.

### Stage 3 PR #4 — Orchestrator + app-normalized result types + runtime snapshot / retention widening

PR #4 introduces the app-normalized result model (moved out of PR #2),
the orchestrator, the validation-readiness wrapper, and the
`calculation-store` retention widening.

- New file: `packages/solver-adapter/src/shortCircuitResults.ts`
  carrying the app-normalized result types
  (`ShortCircuitIssue`, `ShortCircuitBusResult`, `ShortCircuitResult`)
  and `normalizeShortCircuitResult()` (mirrors `results.ts`).
- New file: `packages/solver-adapter/src/shortCircuitRunner.ts`
  carrying `runShortCircuitForAppNetwork(appNetwork, options)` and
  the `ShortCircuitRunBundle` factory and type (mirrors `loadFlow.ts`).
- New `validateForShortCircuit()` wrapper in
  `packages/validation/src/calcReadiness.ts` (or a sibling file),
  reusing the Stage 2 readiness output shape. Moved from PR #2 to
  keep the wrapper next to the orchestrator that consumes it.
- Edit: `packages/calculation-store/src/types.ts` widens
  `CalculationModule` to
  `"load_flow_bundle" | "short_circuit_bundle"` and widens
  `RuntimeCalculationRecord.bundle` from its current
  `LoadFlowRunBundle`-specific type to
  `LoadFlowRunBundle | ShortCircuitRunBundle` (discriminated union;
  see §8.2 — the alternative generic shape is rejected for ergonomics).
- Edit: `packages/calculation-store/src/reducer.ts` to handle the
  new module's retention slot under the existing
  `(scenarioId, module, subCase)` key.
- New tests:
  `packages/solver-adapter/tests/shortCircuitRunner.test.ts`,
  `packages/solver-adapter/tests/shortCircuitResults.test.ts`,
  `packages/calculation-store/tests/short-circuit-retention.test.ts`,
  `packages/validation/tests/short-circuit-readiness.test.ts`.
- Acceptance: AC-S3-04 mapped (app-normalized result model lands
  here, not in PR #2); AC-S3-05 mapped (runtime-only retention).

### Stage 3 PR #5 — UI result table + Calculation Status Panel wiring

- New file: `apps/web/src/components/ShortCircuitResultTable.tsx`.
- Edit: `apps/web/src/components/CalculationStatusPanel.tsx` to add
  the Short Circuit row, Run controls, and the
  `disabled_by_validation` tooltip path.
- Edit: `apps/web/src/state/calculationStore.ts` to expose a
  `runShortCircuit()` action and a Short Circuit lifecycle slot.
- New tests:
  `apps/web/tests/ShortCircuitResultTable.test.tsx`,
  `apps/web/tests/calculationStore.shortCircuit.test.tsx`,
  extension to
  `apps/web/tests/CalculationStatusPanel.test.tsx`.
- Diagram overlay for fault current is **deferred** out of this PR
  unless the implementation finds the structural change is one
  touch (see §9.3).
- Acceptance: AC-S3-04 + AC-S3-05 + AC-S3-03 reinforced through the
  UI.

### Stage 3 PR #6 — Acceptance closeout

- Edit: `scripts/acceptance-coverage.json` adds the `stage3` block
  per §12.1.
- Edit: `scripts/check-acceptance.ts` extends to enforce
  `AC-S3-01..07` coverage (parallel to Stage 1 / Stage 2 blocks).
- Documentation closeout in this spec (Rev A.1+ revision note).
- Acceptance: AC-S3-01..07 all graduated to `mapped` (or to
  `deferred-post-stage-3` for any explicitly deferred item, with a
  follow-up tracker in §15).

---

## 14. Test Surface Summary

| Layer | Package | New tests planned (Stage 3 PR #2–#5) |
|---|---|---|
| Contract types | `packages/solver-adapter` | `shortCircuit.contract.test.ts`, `shortCircuit.results.test.ts` |
| Validation | `packages/validation` | extension to `calc-readiness.test.ts` for `validateForShortCircuit()` |
| Sidecar client | `packages/solver-adapter` | `shortCircuitClient.test.ts`, opt-in `shortCircuit.integration.test.ts` |
| Sidecar Python | `services/solver-sidecar` | `tests/run_short_circuit.test.py` (mirrors any existing sidecar tests; opt-in) |
| Orchestrator | `packages/solver-adapter` | `shortCircuitRunner.test.ts` |
| Calculation store | `packages/calculation-store` | `short-circuit-retention.test.ts` |
| UI | `apps/web` | `ShortCircuitResultTable.test.tsx`, `calculationStore.shortCircuit.test.tsx`, extension to `CalculationStatusPanel.test.tsx` |

Stage 3 PR #1 (this PR) ships **no** new test files.

---

## 15. Stage 3 Follow-Up Questions (Not Closed in this Spec)

These are recorded to be closed by a later Stage 3 spec revision or
by the corresponding implementation PR — they do not block Stage 3
PR #1.

- **S3-FU-01** — Maximum case only vs maximum + minimum case.
  Decision deferred to Stage 3 PR #4 (orchestrator). pandapower can
  produce both in the same `calc_sc` call (or two calls with
  `case="max"` / `case="min"`); the cost/value trade-off is
  marginal-implementation vs UI surface area for the second case.
  MVP ships maximum only.
- **S3-FU-02** — Bus-only vs branch-end / mid-line / transformer-
  terminal faults. Decision deferred to Stage 3 PR #4 or later.
  Adding non-bus fault locations requires either a synthetic split
  bus on AppNetwork (cleaner; reusable for protection coordination)
  or a new `faultLocation` discriminator on `ShortCircuitFaultTarget`
  (faster; lock-in risk). MVP ships bus-only.
- **S3-FU-03** — Generator subtransient short-circuit contribution
  (`xdssPu`, `rdssPu`, IEC 60909 `K` factor). Requires a new contract
  field on `NetworkSource` / `NetworkGeneratorPQ` and a
  pandapower configuration change (`gen.sc_model = "current_source"` /
  `"voltage_source"`). Must ship with at least one verified Golden
  Case before it can land. Deferred.
- **S3-FU-04** — Motor short-circuit contribution. Requires a new
  contract field on `NetworkMotor` (e.g., `motorScKFactor`) and a
  pandapower configuration change. Same Golden Case requirement as
  S3-FU-03. Deferred.
- **S3-FU-05** — Source contribution breakdown (per-source `Ik''`
  contribution to a given bus fault). pandapower exposes
  `res_ext_grid_sc` and per-element `_sc` tables. Useful for
  protection coordination; not in MVP. Deferred.
- **S3-FU-06** — Source data precedence: scLevelMva vs faultCurrentKa
  inconsistency tolerance. The MVP picks scLevelMva when both are
  present and emits `W-SC-001` only when the two values are
  inconsistent beyond a documented tolerance — the tolerance itself
  is to be set in Stage 3 PR #4 alongside the validation wrapper
  (`validateForShortCircuit()` lands with the orchestrator).
  Default proposal: 5% relative difference between the two derived
  `s_sc_mva` equivalents, but this is to be confirmed with reference
  cases.
- **S3-FU-07** — X/R handling when `xrRatio` is missing on a source.
  MVP blocks the run with `E-SC-002`. Whether to ship a documented
  default (e.g., 10 for utilities ≥ 33 kV, lower for LV) is a
  documentation-and-defaults decision deferred to a Stage 3 PR #4
  follow-up.
- **S3-FU-08** — ANSI / IEEE C37 calculation basis as an alternative
  to IEC 60909. Requires either a separate engine or pandapower's
  IEEE-style support (limited in 2.14). Deferred — IEC 60909 is the
  Stage 3 MVP basis per S3-OQ-01.
- **S3-FU-09** — Stage 3 Golden Case fixtures and the Golden Case
  schema extension equivalent to Stage 2 §12.7. Required before any
  `referenceStatus = "verified"` claim. Deferred to a post-Stage-3
  Golden Case PR.
- **S3-FU-10** — Disk persistence of runtime
  `RuntimeCalculationSnapshot` / `ShortCircuitRunBundle`. Stage 3
  inherits Stage 2's S2-FU-07 deferral unchanged. Any future
  persistence must come through a new project-file schema version or
  a sidecar result-store schema; it must not silently change Stage 1
  Rev D.
- **S3-FU-11** — Diagram overlay for fault current (`Ik''` near each
  bus). Deferred from Stage 3 PR #5; revisit after the result table
  ships.
- **S3-FU-12** — Equipment Duty Check. A separate Stage 3+
  deliverable; consumes `ShortCircuitResult` but lives in its own
  module (likely `packages/duty-check` and a new module literal
  `"duty_check_bundle"` on `CalculationModule`). Out of MVP scope.

---

## 16. Guardrails Restated

- **Do not modify** the Stage 1 canonical schema
  (`packages/schemas/src/stage_1_project_schema.rev_d.zod.ts`,
  `packages/schemas/stage_1_project_file.rev_d.schema.json`) in any
  Stage 3 PR. The canonical drift test continues to pass.
- **Do not reintroduce** PRD §8 illustrative names (`bus`,
  `inService`, etc.) into the canonical schema or Stage 3 types.
- **Do not break** Stage 1 (AC01..AC23) or Stage 2 (AC-S2-01..17)
  acceptance tests. Both blocks remain green after every Stage 3 PR.
- **Do not implement** real Short Circuit calculation in this PR.
  Stage 3 PR #1 is spec-only.
- **Do not modify** solver-sidecar behavior in this PR. The
  `run_short_circuit` command lands in Stage 3 PR #3.
- **Do not add** `calculationResults` to the canonical project
  schema in any Stage 3 PR.
- **Do not persist** runtime snapshots or result bundles to disk in
  any Stage 3 PR (S2-FU-07 / S3-OQ-09 inherited).
- **Do not populate** the project file's `calculationSnapshots`
  array in any Stage 3 PR. Real runtime snapshots (from Stage 3 PR
  #4 onward) live only in `packages/calculation-store`.
- **Do not create** fake calculation outputs in any Stage 3 PR.
  Failed runs surface `E-SC-*` codes, never zeros.
- **Do not** widen `CalculationModule` until Stage 3 PR #4 ships
  the orchestrator and the retention slot.
- **Preserve** transformer-as-node in the project / UI layer
  (Stage 2 §S2-OQ-04). Conversion to a calculation branch happens
  only inside `packages/network-model`.
- **Preserve** `branch_chain` ordering and breaker / switch gate
  behavior (Stage 2 §S2-OQ-01..03).
- **Preserve** deterministic serialization (Stage 1 Rev D §12.3).
- **Runtime validation is authoritative.** Saved validation remains
  audit-only; Stage 3 readiness is computed fresh from the loaded
  project.
- **Use app-level codes**, not pandapower exception names. Every
  `E-SC-*` / `W-SC-*` code is owned by the Stage 3 contract; the
  sidecar maps pandapower exceptions onto these codes.

---

## 17. Revision Notes

| Revision | Date | Description |
|---|---|---|
| Rev A | 2026-05-02 | Initial Stage 3 spec. Closes S3-OQ-01 through S3-OQ-10; defines Short Circuit MVP scope (3-phase bolted bus faults, IEC 60909 maximum case), required inputs, AppNetwork / SolverInput reuse policy (no pandapower leakage), sidecar `run_short_circuit` command contract, `ShortCircuitResult` runtime type, runtime-snapshot / calculation-store impact, UI plan, `E-SC-*` / `W-SC-*` codes, AC-S3-01..07, and the six-PR implementation breakdown. Spec-only PR. No code, schema, fixture, or solver-sidecar changes. |
| Rev A.2 | 2026-05-02 | Spec-text-only consistency patch for PR #11 Codex re-review. §7.3 top-level status prose realigned with §7.5.3: a completed run with **any** per-row `failed` now resolves to top-level `warning` (not `valid`); `valid` requires only `ok` / `unavailable` per-row statuses and no top-level issues; transport / pre-normalization failures resolve to `failed`. §13 PR #4 implementation breakdown extended: the `RuntimeCalculationRecord.bundle` widening from `LoadFlowRunBundle`-specific to a discriminated `LoadFlowRunBundle \| ShortCircuitRunBundle` union (already documented in §8.2) is now also called out in PR #4's edit list. No code, schema, fixture, or solver-sidecar changes. |
| Rev A.1 | 2026-05-02 | Spec-text-only patch for PR #11 Codex review. Blocker 1 (numeric nullability): §7.1 prose and §7.2 `ShortCircuitBusResult` updated so every per-bus numeric output (`ikssKa`, `ipKa`, `ithKa`, `skssMva`) is `number \| null`; §7.3 status table now records that `failed` and `unavailable` rows carry all-null numerics; non-computable rows are kept in `busResults` rather than omitted. Blocker 2 (sidecar wire shape vs app-normalized result): §6.3 explicitly names the wire shape as the solver/contract boundary using `internalId` + `status: "valid"\|"warning"\|"failed"`; new §7.5 defines the orchestrator's field-rename mapping (`internalId → busInternalId`), per-row status mapping (`valid → ok`; `failed → "failed"` for targeted-but-failed rows; `"unavailable"` synthesized only by the orchestrator for non-targeted buses), and top-level status mapping. Non-blocking cleanup: §6.3 response example grew an explicit `shortCircuit` block to match §6.4; §7.2 `ShortCircuitResult.module` doc-comment clarifies it is the app result-API module name and is distinct from the calculation-store retention key `"short_circuit_bundle"` (§8.2); §8.2 records that `RuntimeCalculationRecord.bundle` (currently `LoadFlowRunBundle`-specific) must be widened to a discriminated union when `ShortCircuitRunBundle` lands in PR #4. Spec-only; no code, schema, fixture, or solver-sidecar changes. |
