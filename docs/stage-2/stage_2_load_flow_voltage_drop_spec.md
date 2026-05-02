# Stage 2 Implementation Spec — Load Flow / Voltage Drop MVP

**Project:** Power System Study App
**Baseline:** Stage 1 Rev D + Stage 1 PR #1 / PR #2 / PR #3 (merged)
**Stage:** Stage 2 — Load Flow / Voltage Drop MVP
**Document Status:** Implementation-ready spec — Rev A (spec-only)
**Date:** 2026-05-02

---

## 0. Reading Order

This spec depends on, and does **not** restate, the Stage 1 baseline:

- `docs/stage-1-baseline/power_system_study_app_prd_v1_0_final.md`
- `docs/stage-1-baseline/stage_1_one_line_diagram_mvp_spec_rev_d.md`
- `docs/stage-1-baseline/stage_2_spec_overlap_plan_rev_a.md`
- `docs/stage-1-baseline/schema/schema_alignment_decision.md`
- `docs/stage-1-implementation-notes.md`

Whenever the term "canonical schema" appears here, it refers to
`packages/schemas/src/stage_1_project_schema.rev_d.zod.ts` /
`packages/schemas/stage_1_project_file.rev_d.schema.json`. Stage 2 must not
modify those files.

This document defines specification only. Stage 2 PR #1 ships **no production
code**. Implementation is broken into Stage 2 PR #2 and onward (see §16).

---

## 1. Stage 2 Open Questions and Decisions

The following Stage 2 open questions are resolved here. Subsequent sections
build on these decisions; future Stage 2 PRs that diverge from any decision
must update this section first.

### S2-OQ-01 — branch_chain solver conversion policy

**Decision.** For the Stage 2 MVP, `branch_chain` remains an *app-layer*
ordered branch group as defined in Stage 1 Rev D §4.8. The solver input
receives only electrically meaningful impedance elements:

| `branch_chain` member kind | Stage 2 solver representation |
|---|---|
| `cable` | Solver line (`NetworkCableBranch` → solver line element) |
| `breaker` | Topology gate only — no solver impedance |
| `switch` | Topology gate only — no solver impedance |
| `transformer` | (Not allowed in `branch_chain`; transformer is a node — see S2-OQ-04) |

A `branch_chain` of `[BRK-001, CBL-001]` between two buses produces exactly
one solver line (for `CBL-001`), gated by the closed/in-service state of
`BRK-001`. The branch chain itself is not a solver element.

### S2-OQ-02 — Closed breaker / closed switch representation

**Decision.** A closed and in-service breaker or switch is **not** modeled as
a solver impedance element in Stage 2. It acts as a topology *connection
gate*: when closed and in-service, the path through it is enabled. Its
electrical contribution is treated as zero impedance.

This is consistent with the Stage 2 MVP scope: closed-breaker fault
contribution and switch impedance modeling are deferred to Stage 3+.

### S2-OQ-03 — Open breaker / open switch / out-of-service equipment

**Decision.** An open or out-of-service breaker, switch, transformer, or
cable **breaks the topology path** during App Network extraction. The open
path is excluded from solver input rather than represented as an "open
solver switch" element. The downstream sub-network may become floating;
floating sub-networks are reported as a calculation-blocking issue
(`E-NET-002`) per Stage 1 connectivity rules and Stage 2 §10.

This avoids two sources of bugs: spurious zero-current solver elements and
solver convergence issues from disconnected islands.

### S2-OQ-04 — Transformer-as-node conversion point

**Decision.** Transformer remains a **node** in the Stage 1 project file and
in the React Flow diagram model (Stage 1 Rev D §4.7 / AC21). It is converted
into a calculation **branch** only during App Standard Network Model
generation (this spec, §3 + §4). The canonical project file therefore never
contains a transformer represented as an edge, and the React Flow renderer
never has to know about Stage 2's `NetworkTransformerBranch`.

### S2-OQ-05 — Load Flow / Voltage Drop result structure

**Decision.** Load Flow and Voltage Drop share **one calculation result
bundle and one calculation snapshot** per `(scenarioId, runTrigger)`, but
each module's result remains a separate field inside the bundle:

- `CalculationResultBundle.loadFlow: LoadFlowResult | null`
- `CalculationResultBundle.voltageDrop: VoltageDropResult | null`

This reflects the engineering reality that Voltage Drop in Stage 2 is
derived from Load Flow node voltages and branch currents (§6) — running
them as independent jobs would force the user to run Load Flow twice.

### S2-OQ-06 — First real calculation snapshot timing

**Decision.** Stage 2 must **not** modify the Stage 1 canonical
project-file schema. The Stage 1 `calculationSnapshots` field on the
project file remains reserved and **always empty** for the entirety of
Stage 2.

Stage 2 PR #1 (this spec) and the early network-model PRs (Stage 2
PR #2, PR #3) must not create real `CalculationSnapshot` instances of
any kind. The **first real runtime `CalculationSnapshot`** is allowed
only after the Load Flow result model schema is finalized — i.e.,
starting at Stage 2 PR #4 (§16). When PR #4 ships:

1. Real runtime `CalculationSnapshot` and `CalculationResultBundle`
   types live in a Stage 2 in-memory runtime result-store (or a
   separate calculation-store schema), **not inside the Stage 1
   canonical project file**.
2. Runtime result bundles reference a runtime `snapshotId`. That
   runtime `snapshotId` is never written into the project file's
   `calculationSnapshots` array.
3. The project file's `calculationSnapshots` field continues to
   follow Stage 1 Rev D §6 / §50: optional, empty array, schema
   reserved, no real entries.
4. **Disk persistence of runtime snapshots / result bundles is
   deferred** beyond Stage 2 (see S2-FU-07). If persistence is
   required later, it must be done by introducing a new project-file
   schema version, or by introducing a sidecar result-store file with
   its own schema — not by silently writing into the Stage 1 Rev D
   canonical schema.

### S2-OQ-07 — pandapower result as Golden Case reference

**Decision.** A pandapower result may be recorded as a `provisional` or
`regression_only` reference for a Golden Case. It must **not** be the sole
verified Golden Case reference for a release-gate pass.

A verified release-gate Golden Case must use one or more of:

- hand calculation with documented working
- a public engineering reference (textbook example, IEEE/IEC standard
  example)
- a verified spreadsheet (with the calculation steps and inputs in the
  repository)
- a published IEC/IEEE example
- an independent commercial tool result with documented inputs

This rule prevents pandapower from being both the engine and its own
oracle.

---

## 2. Stage 2 Purpose and Scope

### 2.1 Purpose

Stage 2 produces the first usable engineering analysis output of the Power
System Study App: balanced three-phase Load Flow and Voltage Drop on a
project that was authored in the Stage 1 editor.

To get there, Stage 2 introduces:

1. The **App Standard Network Model** (`AppNetwork`) — the app-layer
   calculation model.
2. **Topology extraction** — converting a Stage 1 project file into an
   `AppNetwork` (or a `NetworkBuildResult` that explains why it cannot).
3. **Calculation-readiness validation** — escalating Stage 1 editor-only
   issues into calculation-blocking issues.
4. **Solver adapter contracts** — a typed boundary between `AppNetwork` and
   any concrete solver (pandapower in Stage 2 internally).
5. **Result model** — `CalculationResultBundle` containing
   `LoadFlowResult` and `VoltageDropResult`, with snapshot/result identity
   and stale-result semantics.

### 2.2 In-scope

- Load Flow MVP (balanced three-phase)
- Voltage Drop MVP (derived from Load Flow)
- App Standard Network Model + topology extraction
- Calculation-readiness validation
- Result model and stale-result policy
- Solver adapter contract definition (with an internal pandapower
  implementation)
- First real calculation snapshot policy
- UI surfaces for Load Flow / Voltage Drop result tables and a basic
  diagram overlay

### 2.3 Out-of-scope (Stage 2)

- Short Circuit calculation (Stage 3)
- Equipment Duty Check (Stage 3)
- Cable Sizing engine (Stage 4)
- Report export — Excel / PDF (Stage 5)
- Protection coordination / TCC viewer (post-MVP)
- Arc flash (post-MVP)
- Real-time monitoring (post-MVP)
- Motor starting voltage drop / dynamic motor starting (post-MVP, may be
  re-scoped as a Stage 2 extension only with explicit decision)
- Unbalanced / single-phase / DC / mixed-phase analysis
- Multi-scenario simultaneous runs (Stage 2 runs one scenario at a time)
- Any **fake** calculation result. Stage 2 fail-closes; it does not emit
  placeholder numbers.

### 2.4 Stage 1 guardrails preserved

Stage 2 must preserve the Stage 1 guardrails listed in the implementation
notes and PRD:

- `calculationResults` is **not** introduced into the canonical project
  schema. (Result bundles live in a Stage 2 in-memory result store,
  referenced by a runtime `snapshotId`.)
- The Stage 1 canonical project-file schema is **unchanged** for the
  entirety of Stage 2.
- `calculationSnapshots` remains an optional empty array on the project
  file in **every** Stage 2 PR (see §10 / S2-OQ-06).
- No fake calculations.
- Transformer-as-node in the project file (§S2-OQ-04).
- `branch_chain` ordering is upstream-to-downstream and never sorted.
- Deterministic serialization (Stage 1 Rev D §12.3).
- Runtime validation is authoritative; saved validation is audit-only.
- pandapower structures must not leak into the canonical project file.

---

## 3. App Standard Network Model

The App Standard Network Model (`AppNetwork`) is the app-layer calculation
model. It is **separate** from:

- the Stage 1 canonical project file (`PowerSystemProjectFile`),
- the React Flow diagram model (`DiagramModel`),
- any third-party solver model (e.g., pandapower's network).

Conceptually:

```text
PowerSystemProjectFile  ── (topology extraction §4) ──▶  AppNetwork
                                                             │
                                                             ▼
                                                      SolverInput (§7)
                                                             │
                                                             ▼
                                                      SolverOutput
                                                             │
                                                             ▼
                                                  NormalizedResult (§8)
```

### 3.1 Type sketch

The following TypeScript interfaces are illustrative — they live in a new
package (`packages/network-model`, see §16). All fields use SI / canonical
units consistent with Stage 1 (kV, MVA, %, ohm/km, m, …).

```ts
export interface AppNetwork {
  // Stage 2 monotonic version of the network model schema; will tick when
  // the AppNetwork shape changes in a way that affects stored snapshots.
  networkModelVersion: string;          // e.g. "2.0.0"
  // The scenarioId this AppNetwork was built from (after override merge).
  scenarioId: string;
  // Frequency from project metadata (50 | 60).
  frequencyHz: 50 | 60;
  buses: NetworkBus[];
  sources: NetworkSource[];
  transformers: NetworkTransformerBranch[];
  cables: NetworkCableBranch[];
  // Gates are kept for traceability/UI overlay even though they are not
  // solver impedance elements (S2-OQ-02).
  gates: (NetworkBreakerGate | NetworkSwitchGate)[];
  loads: NetworkLoad[];
  motors: NetworkMotor[];
  generators: NetworkGeneratorPQ[];
  // Issues raised during AppNetwork construction. Non-empty `error` issues
  // mean the network is not solvable.
  issues: NetworkIssue[];
}

export interface NetworkBus {
  internalId: string;       // = Bus.internalId (Stage 1)
  tag: string;
  vnKv: number;
  topology: "3P3W" | "3P4W";
  minVoltagePct: number | null;
  maxVoltagePct: number | null;
}

export interface NetworkSource {
  internalId: string;
  tag: string;
  kind: "utility" | "generator_pq";
  busInternalId: string;
  vnKv: number;
  // Utility: scLevelMva or faultCurrentKa drive the slack equivalent.
  scLevelMva: number | null;
  faultCurrentKa: number | null;
  xrRatio: number | null;
  voltageFactor: number | null;
  // Slack/PQ classification at solver build time. In Stage 2, exactly
  // one source acts as the slack; others (if any) are PQ.
  role: "slack" | "pq";
  pMw: number | null;       // for grid_parallel_pq generators
  qMvar: number | null;
}

export interface NetworkTransformerBranch {
  internalId: string;       // = Transformer.internalId (Stage 1 node)
  tag: string;
  fromBusInternalId: string; // HV
  toBusInternalId: string;   // LV
  snMva: number;
  vnHvKv: number;
  vnLvKv: number;
  vkPercent: number;
  vkrPercent: number | null;
  xrRatio: number | null;
  vectorGroup: string | null;
  tapPosition: number | null;
}

export interface NetworkCableBranch {
  internalId: string;       // = Cable.internalId
  tag: string;
  fromBusInternalId: string;
  toBusInternalId: string;
  lengthM: number;
  rOhmPerKm: number;
  xOhmPerKm: number;
  // Branch chain ordering trace — useful for UI/result attribution.
  branchChainEdgeId: string | null;
}

export interface NetworkBreakerGate {
  kind: "breaker";
  internalId: string;       // = ProtectiveDevice.internalId
  tag: string;
  fromBusInternalId: string;
  toBusInternalId: string;
  state: "closed";          // open gates are not present in AppNetwork
  branchChainEdgeId: string | null;
}

export interface NetworkSwitchGate {
  kind: "switch";
  internalId: string;
  tag: string;
  fromBusInternalId: string;
  toBusInternalId: string;
  state: "closed";
  branchChainEdgeId: string | null;
}

export interface NetworkLoad {
  internalId: string;
  tag: string;
  busInternalId: string;
  pMw: number;              // computed from kw + (pf | kvar) at extraction
  qMvar: number;
  demandFactor: number;
}

export interface NetworkMotor {
  internalId: string;
  tag: string;
  busInternalId: string;
  pMw: number;              // steady-state load representation
  qMvar: number;
}

export interface NetworkGeneratorPQ {
  internalId: string;
  tag: string;
  busInternalId: string;
  pMw: number;
  qMvar: number;
}

export interface NetworkIssue {
  code: string;             // E-LF-* / E-NET-* / W-NET-* see §11
  severity: "error" | "warning" | "info";
  message: string;
  equipmentInternalId?: string;
  field?: string;
}
```

### 3.2 Construction rules

1. **No mutation of project data.** Topology extraction is a pure function:
   `extractAppNetwork(project, scenarioId): NetworkBuildResult`.
2. **Refer by `internalId`.** No reference uses tag, label, or React Flow
   node id.
3. **Preserve `tag`** on every network element for display, validation
   messages, and (later) report attribution.
4. **Respect `status` and open/closed state.** Out-of-service equipment
   and open breaker/switch elements are excluded (per S2-OQ-03), not
   carried as zero-impedance/zero-load placeholders.
5. **Transformer-as-node is converted to branch here, and only here**
   (S2-OQ-04). The Stage 1 project file is not edited.
6. **Scenario overrides are applied before extraction.** The scenarioId
   recorded on the `AppNetwork` corresponds to the post-override view.

---

## 4. Topology Extraction

Topology extraction reads a Stage 1 project file and produces a
`NetworkBuildResult`:

```ts
export interface NetworkBuildResult {
  appNetwork: AppNetwork | null;
  issues: NetworkIssue[];
  // Mirrors AppNetwork.issues but is also populated when appNetwork is null.
}
```

`appNetwork` is non-null iff every `issues` entry is `severity !== "error"`.

### 4.1 Inputs interpreted

| Source in Stage 1 file | Stage 2 interpretation |
|---|---|
| `diagram.edges` of `kind: "connection"` between bus and a bus-attached source/load/motor/generator | Records bus attachment for the corresponding `NetworkSource` / `NetworkLoad` / `NetworkMotor` / `NetworkGeneratorPQ`. |
| `diagram.edges` of `kind: "connection"` between transformer node and a bus | Records HV/LV bus attachments for `NetworkTransformerBranch`, cross-checked against `Transformer.fromBus` / `Transformer.toBus`. |
| `diagram.edges` of `kind: "branch_chain"` | Iterated upstream-to-downstream in `branchEquipmentInternalIds` order. Each member is interpreted per S2-OQ-01: cable → solver line, breaker/switch → gate. |
| `equipment.transformers[].fromBus` / `toBus` | Authoritative for transformer branch endpoints. Mismatch with diagram connection edges produces `W-NET-001` (warning) or escalates to error if the network cannot be built. |
| `equipment.utilities[].connectedBus`, `equipment.generators[].connectedBus`, `equipment.loads[].connectedBus`, `equipment.motors[].connectedBus` | Authoritative attachments for sources / generators / loads / motors. |
| `equipment.cables[].fromBus` / `toBus`, `equipment.breakers[].fromBus` / `toBus`, `equipment.switches[].fromBus` / `toBus` | Authoritative branch endpoints. Branch-chain endpoint mismatch → `W-NET-001` per Stage 1, or calculation-blocking if it prevents network construction. |
| `equipment.breakers[].state`, `equipment.switches[].state` | `open` excludes the path; `closed` opens the path through that gate (subject also to `status`). |
| `status` field on any equipment | `out_of_service` excludes the element from `AppNetwork` entirely (sources are excluded; branches and loads/motors are excluded; transformers are excluded — which may produce a downstream floating bus). |

### 4.2 Output classification

Topology extraction returns one of:

1. **Valid AppNetwork.** All blocking checks pass; the resulting
   `AppNetwork` is well-formed and can be passed to a solver adapter.
2. **Invalid NetworkBuildResult.** Issues include at least one `error`
   (e.g., `E-NET-002 floating bus`, `E-LF-002 unsupported topology`,
   `E-LF-003 source/slack invalid`). `appNetwork` is `null`. UI must report
   the codes; the calculation run button must be disabled with these codes
   shown.

### 4.3 Cases the extractor must handle deterministically

- **Empty project.** `appNetwork = null`, issues include `I-NET-001`
  promoted to `E-LF-003` for calculation-readiness. (Stage 2 cannot run on
  an empty project.)
- **Project with bus + source but no loads.** Allowed; extractor produces
  a valid `AppNetwork` with no loads and no motors. The solver run is
  trivial but legal. UI shows a result of "no loaded buses" rather than
  blocking.
- **Project with multiple in-service utility sources.** Multi-utility
  / multi-slack handling is **deferred** for Stage 2 MVP. The Stage 2
  MVP supports exactly one in-service utility as the slack/source
  (chosen by deterministic ordering: lexically smallest `internalId`)
  plus optional `grid_parallel_pq` generators on other buses. If two
  or more utilities are simultaneously `in_service`, the extractor
  raises `E-LF-003 source/slack invalid` and blocks the run. There is
  **no** Stage 2 implementation of short-circuit-equivalent
  PQ conversion; that conversion remains S2-FU-03 and must not be
  implemented unless a future Golden Case forces it.
- **Generator with `operatingMode: pv_voltage_control` or
  `island_isochronous`.** Excluded from Stage 2 solver and reported via
  `W-GEN-001` (Stage 1 code retained) and additionally raises
  `E-LF-003` if no other valid slack exists.
- **Floating / islanded sub-network.** `E-NET-002` is raised; if any load
  or motor is on the floating segment, the AppNetwork is invalid.
- **Unsupported topology (1P / DC / mixed).** Buses with topology
  `1P2W` / `1P3W` / `DC2W` / `DC3W` raise `E-LF-002`; in Stage 2, the
  presence of any such bus is calculation-blocking even if it is not on a
  source-fed path. (`W-EQ-002` from Stage 1 remains as the editor-time
  hint.)

---

## 5. Branch-Chain Conversion Policy

This section consolidates S2-OQ-01 / S2-OQ-02 / S2-OQ-03 into a single
rule set:

1. `branch_chain` order is **upstream-to-downstream** as established by
   Stage 1 Rev D §4.8. The serializer never reorders it; the extractor
   honors that order as the source-of-truth path.
2. `breaker` and `switch` members of a `branch_chain` are **gates**:
   - `state: "closed"` and `status: "in_service"` → enabled gate, kept in
     `AppNetwork.gates` for traceability, contributes zero impedance to
     the solver.
   - `state: "open"` or `status: "out_of_service"` → path disabled; the
     `branch_chain` is removed from the AppNetwork.
3. A `cable` member of a `branch_chain` becomes a `NetworkCableBranch`
   (a solver line) **iff** the entire path is enabled. "Entire path
   enabled" means: no member of the `branch_chain` is an open
   breaker/switch, and no member of the `branch_chain` (cable, breaker,
   switch) is `status: "out_of_service"`. A single open or out-of-service
   member anywhere in the chain — upstream or downstream of the cable
   — disables the whole path; the cable is excluded from the
   `AppNetwork`.
4. Stage 2 **does not** model breaker / switch impedance; this is a
   decision recorded in S2-OQ-02. A future stage may revisit.
5. Branch-chain endpoint mismatch (`W-NET-001`) remains a warning at the
   project-file level. It escalates to a calculation-blocking issue
   **only if** the mismatch prevents constructing a coherent
   `AppNetwork` (for example, the equipment `fromBus`/`toBus` would
   produce a different topology than the branch-chain endpoints, with no
   reconciliation possible). In that case the extractor raises
   `E-LF-002`.
6. A `branch_chain` containing **only** gates (no cable) collapses to a
   direct connection between the two endpoints when enabled, and to a
   removed path when disabled. The two endpoints are treated as the same
   electrical node only after the gate is collapsed; if both endpoints
   were already physically distinct buses, this means the buses become
   electrically tied and the solver should see them as one
   slack/PQ-equivalent. Stage 2 implementation note: the extractor may
   merge the two `NetworkBus` records into a single solver bus with a
   stable parent rule (`internalId` lexically smaller wins) and record
   the merge in `AppNetwork.issues` as `info`.

---

## 6. Load Flow Assumptions (Stage 2 MVP)

### 6.1 What Load Flow does in Stage 2

For an in-scope `AppNetwork`:

1. Determine slack bus (the bus attached to the chosen utility/generator
   slack source).
2. Solve nodal voltages and branch currents with the selected solver
   (pandapower internally) for steady state at the project frequency.
3. Compute branch loading percentages where ratings are available.
4. Return a `LoadFlowResult` (§8).

### 6.2 Modeling assumptions

| Topic | Stage 2 assumption |
|---|---|
| Phase model | Balanced three-phase only. |
| Topology coverage | `3P3W` and `3P4W` buses only. |
| Excluded topologies | `1P2W`, `1P3W`, `DC2W`, `DC3W` cause `E-LF-002`. |
| Frequency | Project `frequencyHz` (50 or 60). One frequency per run. |
| Load model | Constant **PQ** load (`pMw`, `qMvar`). No ZIP, no constant-current. |
| Reactive power source | `pMw` + `qMvar` if both entered; otherwise `pMw` + `pf` → `qMvar`. If neither is derivable, `E-VD-002` (load input missing). |
| Utility / Grid | Slack source — Stage 2 MVP supports exactly one in-service utility (lexically smallest `internalId`). Two or more in-service utilities raise `E-LF-003`. Stage 2 treats the chosen utility as the slack with `vnKv` = nominal voltage and `voltageFactor` (default 1.0) on the slack bus; SC-level / fault-current values are kept on the `NetworkSource` for traceability but are **not** converted into PQ equivalents in Stage 2 MVP. (Short-circuit-equivalent PQ conversion is S2-FU-03, deferred.) |
| Generator | Allowed only with `operatingMode ∈ { out_of_service, grid_parallel_pq }`. `out_of_service` is excluded; `grid_parallel_pq` is a PQ injection on its bus. |
| PV mode | **Not supported** in Stage 2. `pv_voltage_control` raises `W-GEN-001`; if it is the only source, `E-LF-003`. |
| Island / isochronous mode | **Not supported**. Same rule as PV mode. |
| Generator voltage control | Not supported in Stage 2. |
| Cable impedance | `R/km` and `X/km` × `lengthM`, included. |
| Transformer impedance | `vkPercent` plus `vkrPercent` / `xrRatio` if available, included. |
| Motor in steady-state | Treated as a steady-state PQ load using `ratedKw`, `efficiency`, `powerFactor`, `serviceFactor`. `out_of_service` motors are excluded. (Motor starting is **not** a Stage 2 MVP scope; see §6.4.) |
| Tap position | Included if entered; otherwise nominal ratio is used. |

### 6.3 Required input fields for Load Flow

These fields, missing or non-positive on an in-scope element, are
calculation-blocking in `validateForCalculation()` per §10:

- **Bus**: `vnKv > 0`, `topology ∈ { 3P3W, 3P4W }`.
- **Utility (slack)**: `connectedBus`, `vnKv > 0`, and at least one of
  `scLevelMva > 0` or `faultCurrentKa > 0`. `xrRatio` defaults to a
  documented value when missing (warning, not error).
- **Generator (PQ)**: `connectedBus`, `pMw`, `qMvar` or `powerFactor`.
- **Transformer**: `fromBus`, `toBus`, `snMva > 0`, `vnHvKv > 0`,
  `vnLvKv > 0`, `vkPercent > 0`. Voltage match between transformer
  windings and the connected buses is required (mismatch → §11).
- **Cable**: `fromBus`, `toBus`, `lengthM > 0`, `rOhmPerKm > 0`,
  `xOhmPerKm > 0`. (Stage 1 already requires `lengthM`; R/X must be
  entered or supplied via vendor library — Stage 4 — or the cable is
  blocking for Stage 2.)
- **Load**: `connectedBus`, `kw > 0`, plus either `kvar` or
  `powerFactor`.
- **Motor (treated as load)**: `connectedBus`, `ratedKw > 0`,
  `ratedVoltageV > 0`, `powerFactor`, `efficiency`. Missing values block
  the motor for Load Flow inclusion.

### 6.4 Motor starting (deferred)

Motor starting voltage drop is **not** a Stage 2 MVP feature. If it is
re-scoped later, it must add a separate `motorStarting` module result
(not overload the existing `voltageDrop` result), and it must define its
own readiness rules.

---

## 7. Voltage Drop Assumptions (Stage 2 MVP)

### 7.1 Source of values

In Stage 2, Voltage Drop is **derived from the same Load Flow run** that
produced the bus voltages and branch currents. There is no second solver
run. This is a direct consequence of S2-OQ-05.

Per branch (cable / transformer):

```text
sendingEndVoltageV   = magnitude of voltage at branch sending bus
receivingEndVoltageV = magnitude of voltage at branch receiving bus
voltageDropV         = sendingEndVoltageV - receivingEndVoltageV
voltageDropPct       = voltageDropV / sendingEndVoltageV * 100
```

For Stage 2, "sending" = upstream (closer to the slack); "receiving" =
downstream. Direction is decided from the load-flow solution (positive
real power flow direction), not from `fromBus`/`toBus` alone.

### 7.2 Limits

The `limitPct` for each branch in Stage 2 defaults to:

- 3.0% for feeder cables (cables on a `branch_chain` to a load/motor
  bus),
- 5.0% for transformer-secondary feeders,
- editable later via project preferences (post-Stage-2; not in PR #5).

These defaults are not engineering-final and are documented as such; they
exist so that `status` can be computed and surfaced. They will be moved
into a project-level Stage 2 setting after PR #5.

### 7.3 Status mapping

Two distinct status mappings exist; they are computed independently.

#### 7.3.1 Branch voltage-drop status

Applied to each `BranchVoltageDrop` row. Compares the per-branch
`voltageDropPct` against that branch's `limitPct`:

| Condition | `status` |
|---|---|
| `voltageDropPct ≤ 0.9 × limitPct` | `ok` |
| `0.9 × limitPct < voltageDropPct ≤ limitPct` | `warning` (raises `W-VD-002`) |
| `voltageDropPct > limitPct` | `violation` (raises `W-VD-001`) |

#### 7.3.2 Bus voltage-band status

Applied to each `BusResult` row. Compares the bus per-unit voltage
against the bus's own `minVoltagePct` / `maxVoltagePct` band (when
entered on the canonical `Bus` record):

| Condition | `status` |
|---|---|
| `minVoltagePct ≤ voltagePuPct ≤ maxVoltagePct` | `ok` |
| `voltagePuPct < minVoltagePct` | `warning` (raises `W-LF-001`) |
| `voltagePuPct > maxVoltagePct` | `warning` (raises `W-LF-002`) |

If a bus has no `minVoltagePct` / `maxVoltagePct` entered, the bus
voltage-band status defaults to `ok` and no `W-LF-001` / `W-LF-002` is
raised. Branch voltage-drop status is computed from `limitPct`
defaults (§7.2) and is independent of bus band status.

### 7.4 Dependency on Load Flow

- Voltage Drop **cannot** run if Load Flow result is invalid or
  unavailable. This case raises `E-VD-001` (`voltage drop unavailable
  because load flow invalid`). The bundle returns `voltageDrop = null`.
- Voltage Drop also cannot be run "alone" — the API runs the Load Flow
  step first, then derives the Voltage Drop result. Re-runs invalidate
  both.

### 7.5 Output fields

For each branch:

```text
sendingEndVoltageV
receivingEndVoltageV
voltageDropV
voltageDropPct
limitPct
status: "ok" | "warning" | "violation"
```

Plus per bus voltage band status (under/over) tied to `Bus.minVoltagePct`
and `Bus.maxVoltagePct` if entered.

---

## 8. Solver Boundary and Adapter Contracts

### 8.1 Adapter layers

Stage 2 defines five typed adapter boundaries:

```text
ProjectFile           ──[A1]──▶ AppNetwork
AppNetwork            ──[A2]──▶ SolverInput          (e.g., pandapower net)
SolverOutput          ──[A3]──▶ NormalizedResult     (LoadFlow + Voltage Drop merged)
NormalizedResult      ──[A4]──▶ UI ResultTables / Diagram Overlay
NormalizedResult      ──[A5]──▶ CalculationResultBundle + CalculationSnapshot
```

| Layer | Owner package | Notes |
|---|---|---|
| A1 | `packages/network-model` | Pure TypeScript; no solver. |
| A2 | `packages/solver-adapter-pandapower` | Internal. May translate to other solvers later. |
| A3 | `packages/solver-adapter-pandapower` | Maps element ids back to `internalId`. |
| A4 | `apps/web` (results UI) | Reads `CalculationResultBundle`. |
| A5 | `packages/calculation-store` | Holds bundles and snapshots in memory; persistence rules in §9. |

### 8.2 Contract rules

1. **pandapower is allowed as the internal solver adapter.** No other
   solver is wired in Stage 2.
2. **The canonical project schema must not depend on pandapower.** No
   pandapower types appear in `packages/schemas/` or `packages/core-model/`.
3. **pandapower element IDs map back to `internalId`.** The adapter
   maintains an explicit `Map<pandapowerElementType, Map<int, internalId>>`
   for buses, lines, transformers, loads, generators, switches. Result
   normalization uses this to attach `internalId` to every `BusResult` /
   `BranchResult` (§8.3 in the result model).
4. **pandapower version and adapter version are recorded** in
   `CalculationSnapshot.solver` and `CalculationResultBundle.adapterVersion`
   *only* once §9 allows real snapshots. Until then, these fields are
   omitted from the project file.
5. **Solver options are explicit.** Stage 2 records `algorithm`
   (e.g., `nr` for Newton–Raphson), `tolerance`, `maxIter`, `enforceQLim`
   (`false` in Stage 2, since PV mode is unsupported).
6. **Solver failures are reported, not swallowed.** Non-convergence,
   adapter exceptions, and solver-version mismatches map to `E-LF-001`,
   `E-LF-004`, and `E-LF-001` respectively.

### 8.3 Adapter test surface

See §13 (adapter contract tests).

---

## 9. Result Model

### 9.1 Status enum

```ts
export type CalculationStatus =
  | "idle"
  | "ready_to_run"
  | "blocked_by_validation"
  | "running"
  | "succeeded"
  | "failed_validation"
  | "failed_solver"
  | "stale";
```

`stale` is set when the underlying inputs change after a successful run
(see §9.5).

### 9.2 Job / snapshot / bundle

```ts
export interface CalculationJob {
  jobId: string;
  scenarioId: string;
  module: "load_flow_voltage_drop"; // bundled per S2-OQ-05
  triggeredAt: string;              // ISO timestamp
  status: CalculationStatus;
  appVersion: string;
  calculationEngineVersion: string; // semver of @power-system-study/calculation
}

export interface CalculationSnapshot {
  snapshotId: string;
  scenarioId: string;
  createdAt: string;
  // Exact post-override view passed to topology extraction.
  // For Stage 2, this is a compact representation that mirrors AppNetwork
  // plus the originating internalIds; it is NOT the full project file.
  appNetwork: AppNetwork;
  validation: ValidationSummary;     // result of validateForCalculation()
  solver: {
    name: "pandapower";
    version: string;                 // pandapower version string
    options: {
      algorithm: "nr" | "bfsw";
      tolerance: number;
      maxIter: number;
      enforceQLim: false;
    };
  };
  adapterVersion: string;            // semver of solver-adapter-pandapower
}

export interface CalculationResultBundle {
  resultId: string;
  snapshotId: string;
  scenarioId: string;
  module: "load_flow_voltage_drop";
  createdAt: string;
  status: CalculationStatus;
  issues: ResultIssue[];
  stale: boolean;
  appVersion: string;
  calculationEngineVersion: string;
  adapterVersion: string;
  loadFlow: LoadFlowResult | null;
  voltageDrop: VoltageDropResult | null;
}

export type ResultStatus = "ok" | "warning" | "violation";

export interface ResultIssue {
  code: string;                      // §11 codes
  severity: "error" | "warning" | "info";
  message: string;
  equipmentInternalId?: string;
}

export interface LoadFlowResult {
  buses: BusResult[];
  branches: BranchResult[];
  loads: EquipmentLoadingResult[];
  motors: EquipmentLoadingResult[];
  totalGenerationMw: number;
  totalLoadMw: number;
  totalLossesMw: number;
  converged: boolean;
}

export interface BusResult {
  busInternalId: string;
  tag: string;
  voltageKv: number;
  voltagePuPct: number;
  status: ResultStatus;             // band status from min/max %
  angleDeg: number;
}

export interface BranchResult {
  branchInternalId: string;         // cable or transformer internalId
  branchKind: "cable" | "transformer";
  fromBusInternalId: string;
  toBusInternalId: string;
  fromBusTag: string;
  toBusTag: string;
  pMwFrom: number;
  qMvarFrom: number;
  pMwTo: number;
  qMvarTo: number;
  currentA: number;
  loadingPct: number | null;        // null when no rating is available
  lossKw: number;
  status: ResultStatus;             // from loadingPct vs rating
}

export interface EquipmentLoadingResult {
  equipmentInternalId: string;
  tag: string;
  busInternalId: string;
  pMw: number;
  qMvar: number;
  loadingPct: number | null;
  status: ResultStatus;
}

export interface VoltageDropResult {
  branches: BranchVoltageDrop[];
}

export interface BranchVoltageDrop {
  branchInternalId: string;
  branchKind: "cable" | "transformer";
  sendingEndVoltageV: number;
  receivingEndVoltageV: number;
  voltageDropV: number;
  voltageDropPct: number;
  limitPct: number;
  status: ResultStatus;
}
```

### 9.3 Identity rules

- `resultId` is unique per run; `snapshotId` is unique per AppNetwork
  build.
- A single `snapshotId` may be referenced by at most one **successful**
  `resultId` per `(scenarioId, module)`.
- Two different runs with byte-identical `AppNetwork` should produce two
  different `resultId`s but the same `snapshotId` is allowed (snapshot
  deduplication is optional in Stage 2; if implemented, must be
  byte-stable on the `AppNetwork` JSON serialization).

### 9.4 Storage

- `CalculationResultBundle` is held in an in-memory store
  (`packages/calculation-store`). Stage 2 does not persist the bundle to
  the project file or to disk in any form.
- `CalculationSnapshot` is also a runtime-only in-memory object held by
  `packages/calculation-store`. Stage 2 does **not** write
  `CalculationSnapshot` into the Stage 1 project file's
  `calculationSnapshots` array. That array remains empty and
  schema-reserved per Stage 1 Rev D §6 / §50 (see S2-OQ-06).
- The canonical project schema is **not extended** with a result field
  and is **not modified** for Stage 2. This preserves the Stage 1
  guardrail that the project file carries inputs only, never derived
  results.
- Disk persistence of runtime snapshots / bundles is deferred (see
  S2-FU-07). Any later persistence must come through a new project-file
  schema version or a sidecar result-store file, not through silent
  edits to Stage 1 Rev D.

### 9.5 Stale-result policy

- Any edit through the project store that touches an equipment, diagram
  edge, or scenario override that participates in the AppNetwork marks
  the latest `CalculationResultBundle` for that scenario `stale = true`
  and `status = "stale"`.
- Stage 2 does not auto-recompute. The user re-runs explicitly.
- Edits that cannot affect the AppNetwork (purely cosmetic such as node
  position) must not mark the result stale. Implementation note: stale
  detection compares the byte-stable `AppNetwork` JSON across edits.

---

## 10. First Real Calculation Snapshot Policy

This is the operational form of S2-OQ-06.

1. **Stage 1 + Stage 2 PR #1 (this spec) + Stage 2 PR #2 + Stage 2 PR #3**:
   No real `CalculationSnapshot` is created in any layer. The Stage 1
   project file's `calculationSnapshots` field remains the empty array
   per Stage 1 Rev D §6 / §50. Topology extraction and adapter spike
   code MAY emit `AppNetwork` in memory, but MUST NOT instantiate a
   real `CalculationSnapshot`.
2. **Starting at Stage 2 PR #4** (Load Flow result normalization +
   first Golden Case): real **runtime** `CalculationSnapshot` instances
   are allowed in `packages/calculation-store`. A runtime snapshot
   carries, at minimum:
   - `snapshotId`
   - `createdAt`
   - `scenarioId`
   - the post-override `AppNetwork`
   - the `validation` from `validateForCalculation()`
   - solver name / version / options
   - adapter version
3. The Stage 1 canonical schema (`CalculationSnapshotPlaceholder` in
   Stage 1 Rev D §5.2, the Zod schema, and the JSON schema) is **not
   modified** in Stage 2. The project file's `calculationSnapshots`
   array remains empty across every Stage 2 PR. There is no
   `CalculationSnapshotV2` admitted into the project-file schema in
   Stage 2.
4. **Result references** the runtime snapshot via its runtime
   `snapshotId`. The runtime `snapshotId` is **not written** into the
   project file. The project file never contains the result bundle
   itself.
5. **Retention** follows Stage 1 OQ-15 once runtime snapshots are
   enabled, and applies inside the in-memory store only:
   - Latest successful result per `(scenarioId, module, subCase)`.
   - Latest failed validation snapshot (so the user can audit the
     failure).
   - No unlimited history in MVP.
6. **Disk persistence is deferred** (S2-FU-07). If a future stage
   persists results to disk, it must do so through a new project-file
   schema version, or via a sidecar result-store file with its own
   schema, not by silently writing into the Stage 1 Rev D canonical
   schema.

### 10.1 Calculation-readiness validation function

Stage 2 introduces a higher-level wrapper that combines existing
`validateForCalculation()` (Stage 1 escalation) with Stage 2-specific
network-construction checks:

```ts
export interface CalculationReadinessResult {
  validation: ValidationSummary;        // from validateForCalculation
  buildResult: NetworkBuildResult;      // from extractAppNetwork
  status: "ready_to_run" | "blocked_by_validation";
  blockingIssues: ValidationIssue[];
}
```

Calculation must be **blocked** when any of the following are present:

- No source. (`E-NET-001`, possibly escalated to `E-LF-003`.)
- Floating / islanded bus. (`E-NET-002`.)
- Unsupported topology. (`E-LF-002`.)
- Missing transformer impedance (`vkPercent` missing or 0). (`E-EQ-001`
  + `E-LF-005` precondition.)
- Missing cable length / R / X. (`E-EQ-001` + Stage 2 cable-readiness.)
- Missing load `kW`/`PF` or `kW`/`kvar`. (`E-VD-002` precondition;
  `E-EQ-001` for required-field readiness.)
- Invalid voltage on a bus, source, transformer, or motor.
  (`E-EQ-002` and / or `E-LF-002` for transformer winding mismatch.)
- Transformer voltage mismatch with attached buses.
  (`E-LF-002 unsupported topology` is intentionally broad here; a more
  specific code may be added in Stage 2 PR #4 if needed.)
- Non-positive numeric calculation input. (`E-EQ-002`.)

Warnings come in two phases and must not be conflated.

**Readiness warnings (visible before Run).** Editor- and
readiness-time warnings derived purely from project inputs:
`W-EQ-002`, `W-EQ-003`, `W-EQ-004`, `W-CBL-001`, `W-NET-001`,
`W-GEN-001`. These are surfaced in the calculation-readiness summary
and must be visible in the UI before the user clicks Run. They must
not block the run.

**Result warnings (visible only after a successful run).** Warnings
that depend on solver output: `W-LF-001` (bus undervoltage),
`W-LF-002` (bus overvoltage), `W-LF-003` (equipment loading),
`W-VD-001` (voltage drop exceeds limit), `W-VD-002` (voltage drop
near limit). These are populated on the `CalculationResultBundle` /
`LoadFlowResult` / `VoltageDropResult` after a successful Load Flow,
and are surfaced in the result tables and diagram overlay. They are
**not** available in the readiness summary and must not be presented
as readiness signals.

---

## 11. Warning / Error Codes (Stage 2)

Stage 2 introduces the codes below. Stage 1 codes (§11.2 of the Rev D
spec) remain in force. New codes follow the same `<severity>-<area>-NNN`
convention.

### 11.1 Errors

| Code | Severity | Condition | Calculation impact |
|---|---|---|---|
| `E-LF-001` | error | Load Flow non-convergence (solver iteration limit reached, divergence). | Load Flow result is `null`; bundle status `failed_solver`. |
| `E-LF-002` | error | Unsupported topology in `AppNetwork` (e.g., 1P/DC bus, transformer winding voltage mismatch). | Run blocked. |
| `E-LF-003` | error | Source / slack invalid: no in-service slack-eligible source, **or** two or more in-service utilities (multi-utility is deferred per S2-FU-03), **or** the only in-service generator is in an unsupported mode (`pv_voltage_control` / `island_isochronous`). | Run blocked. |
| `E-LF-004` | error | Solver adapter failure (pandapower exception, version mismatch, IPC failure). | Run failed. |
| `E-LF-005` | error | Load Flow result unavailable (pre-run state when bundle is requested before a successful run). | Diagnostic. |
| `E-VD-001` | error | Voltage Drop unavailable because Load Flow is invalid. | Voltage Drop is `null`. |
| `E-VD-002` | error | Voltage Drop input missing (load `kW`+`pf`/`kvar` not derivable, cable R/X missing on a feeder). | Run blocked. |

### 11.2 Warnings

| Code | Severity | Condition |
|---|---|---|
| `W-LF-001` | warning | Bus voltage below `minVoltagePct`. |
| `W-LF-002` | warning | Bus voltage above `maxVoltagePct`. |
| `W-LF-003` | warning | Equipment loading > 100% (cable, transformer, motor, load). |
| `W-VD-001` | warning | Voltage drop on a branch exceeds its limit. |
| `W-VD-002` | warning | Voltage drop on a branch is within 90–100% of its limit. |

### 11.3 Stage 1 codes that change role in Stage 2

- `W-NET-001` (branch-chain endpoint mismatch) **may escalate** to
  `E-LF-002` only if it would prevent network construction (§5.5).
- `I-EQ-001` (draft missing fields) is escalated to `E-EQ-001` by
  `validateForCalculation()` (Stage 1 PR #3 behavior; unchanged).
- `W-GEN-001` retains its semantic; PV / island generator modes block the
  run only if no other slack is available.

---

## 12. Golden Case Candidates

Per S2-OQ-07, pandapower may serve as `provisional` or
`regression_only` reference but never as the sole verified reference.
Each Golden Case lists `referenceType` and `referenceStatus`.

| `referenceStatus` | Meaning |
|---|---|
| `verified` | Reference is independent and citable; release-gate eligible. |
| `provisional` | Working reference (e.g., pandapower) used to drive implementation. Must be upgraded to `verified` before release. |
| `regression_only` | Reference snapshots used only to prevent regression after intentional refactor; never accepted for release-gate. |

### 12.1 GC-LF-01 — Utility + Transformer + Single Load

- **Purpose.** Smallest end-to-end Load Flow path: utility slack →
  HV bus → transformer → LV bus → cable → load. Validates topology
  extraction, branch_chain conversion, and basic Load Flow.
- **Topology.** UTL-001 → BUS-MV → TR-001 → BUS-LV → [BRK-001, CBL-001] →
  BUS-LD → LD-001.
- **Reference type.** Hand calculation + IEC textbook example.
- **Reference status.** `provisional` until reference is added; promoted
  to `verified` in Stage 2 PR #4.
- **Expected values.** Bus voltage % (LV bus near 100% with light load),
  branch loading % on cable consistent with hand calculation, total
  losses match within 1%.
- **Tolerance.** Voltage 0.1%; current 0.5%; loading 0.5%; losses 1.0%.
- **Code expectations.** No errors; possibly `W-LF-003` if loading is
  intentionally tight in the case definition.

### 12.2 GC-LF-02 — Transformer + MCC + Multiple Loads

- **Purpose.** Multiple loads on a single LV bus / MCC; checks total
  generation = total load + losses convergence and per-load attribution.
- **Topology.** UTL → MV bus → TR → LV bus inside MCC (placeholder) →
  LD-001, LD-002, M-001, M-002.
- **Reference type.** Verified spreadsheet reference + textbook crosscheck.
- **Reference status.** `provisional` initially; `verified` by Stage 2 PR #5.
- **Expected values.** Per-load `pMw` matches input; per-load loading
  computed; bus voltage within band.
- **Tolerance.** Voltage 0.1%; loading 0.5%.
- **Code expectations.** May produce `W-LF-001` if the bus drops below
  `minVoltagePct` — that should be encoded into the case so the test is
  asserting the warning, not its absence.

### 12.3 GC-VD-01 — Cable Voltage Drop, Dominant Feeder

- **Purpose.** Long LV feeder cable with high R; tests Voltage Drop
  derivation from Load Flow per §7. The case is sized so `voltageDropPct`
  exceeds `limitPct` and triggers `W-VD-001`.
- **Topology.** UTL → MV → TR → LV bus → [BRK, long CBL] → motor terminal
  bus → M-001.
- **Reference type.** Hand calculation (closed-form per
  `V = I × R + j I × X`).
- **Reference status.** `verified` (closed-form reference is trivial).
- **Expected values.** `voltageDropPct` matches hand calc within 0.1%;
  `status = "violation"` with `W-VD-001`.
- **Tolerance.** 0.1%.

### 12.4 GC-INVALID-LF-01 — Islanded Bus

- **Purpose.** A bus with equipment but no path to any source.
- **Topology.** UTL → MV → TR → LV; separately, an isolated LD on a bus
  with no transformer feeding it.
- **Reference type.** Validation fixture (no numeric reference needed).
- **Reference status.** `verified`.
- **Expected behavior.** `extractAppNetwork()` returns `appNetwork = null`
  with `E-NET-002` for the islanded bus. Run is blocked.

### 12.5 GC-INVALID-LF-02 — Source Missing

- **Purpose.** Project with buses/loads but no in-service utility or
  generator.
- **Reference type.** `validation_fixture` (no numeric reference
  needed; assertion is on emitted codes and `appNetwork = null`).
- **Reference status.** `verified`.
- **Expected behavior.** `validateProject()` returns `E-NET-001`;
  `validateForCalculation()` keeps it as error; readiness wrapper sets
  `status = "blocked_by_validation"` and reports `E-LF-003`.

### 12.6 GC-INVALID-LF-03 — Unsupported Topology

- **Purpose.** A `1P2W` bus with an attached load, otherwise
  source-fed.
- **Reference type.** `validation_fixture` (no numeric reference
  needed; assertion is on emitted codes and `appNetwork = null`).
- **Reference status.** `verified`.
- **Expected behavior.** Editor warns `W-EQ-002`. Calculation readiness
  raises `E-LF-002`. Run blocked.

### 12.7 Golden Case metadata

Each Golden Case is stored with the schema sketched in
`docs/stage-1-baseline/stage_1_preimplementation_support_v1_1/golden_cases/golden_case_metadata.schema.json`,
extended for Stage 2 to include `referenceStatus`, `module`, expected
codes, and tolerance tables. The schema extension is authored in
Stage 2 PR #4.

---

## 13. Adapter Contract Tests

Adapter contract tests live in the package they exercise. Each group is
a test file pinned to specific layer boundaries.

| Group | Layer | Package | Test focus |
|---|---|---|---|
| `S2-ADP-01` | A1 | `packages/network-model` | `ProjectFile → AppNetwork`: every Stage 1 equipment kind round-trips into the correct `Network*` element; `tag`/`internalId` preserved. |
| `S2-ADP-02` | A1 | `packages/network-model` | Topology extraction + branch_chain conversion: `[BRK closed, CBL]` → 1 line + 1 gate; `[BRK open, CBL]` → no line, path removed; `[SW open]` → path removed; multi-equipment chains preserve order. |
| `S2-ADP-03` | A1 | `packages/network-model` | Transformer node → `NetworkTransformerBranch`: HV/LV mapping correct; tap position carried through; vector group preserved. |
| `S2-ADP-04` | A2 | `packages/solver-adapter-pandapower` | `AppNetwork → SolverInput`: every `NetworkBus`/`NetworkCableBranch`/`NetworkTransformerBranch` maps to a pandapower element; bidirectional `internalId ↔ pandapowerIndex` map intact. |
| `S2-ADP-05` | A3 | `packages/solver-adapter-pandapower` | `SolverOutput → NormalizedResult`: every `BusResult.busInternalId` resolves; per-branch `currentA` / `loadingPct` computed; `converged` flag honest. |
| `S2-ADP-06` | derive | `packages/calculation` | `LoadFlowResult → VoltageDropResult`: per-branch sending/receiving voltages; `status` mapping per §7.3; `voltageDrop = null` when Load Flow is invalid (`E-VD-001`). |
| `S2-ADP-07` | A4 | `apps/web` | `ResultBundle → UI table / overlay`: result tables render correct rows; diagram overlay shows bus % and branch %. |
| `S2-ADP-08` | A5 | `packages/calculation-store` | `ResultBundle → CalculationSnapshot reference`: bundle's `snapshotId` points at a real snapshot; retention rule (§9.5) respected. |

Each group has at least one positive case and one negative case (an
input that should produce a specific error code per §11).

---

## 14. UI Impact

### 14.1 Calculation tab activation

- The Stage 1 `CalculationStatusPanel` ("Not implemented in Stage 1")
  is replaced for Load Flow / Voltage Drop in Stage 2 PR #5 with an
  **active** panel.
- The active panel reads `CalculationReadinessResult`:
  - `ready_to_run` → Run button enabled, Voltage Drop and Load Flow
    selectable as a single bundled run.
  - `blocked_by_validation` → Run button disabled. Tooltip and inline
    list show the blocking codes; clicking a code scrolls to / selects
    the offending equipment, identical to the existing Validation
    Panel pattern.

### 14.2 Result tables

- `LoadFlowResultTable`: rows of `BusResult` (voltage % and band status)
  and `BranchResult` (current, loading %, losses).
- `VoltageDropResultTable`: rows of `BranchVoltageDrop` with sending /
  receiving voltage, drop %, limit %, status.
- Tables use `internalId` for keying and `tag` for display, consistent
  with the Stage 1 conventions.

### 14.3 Diagram overlay

When a successful, non-stale result bundle exists for the active
scenario, the diagram overlays:

- bus voltage % near each bus node (with band-status color),
- branch current and loading % near each cable / transformer,
- voltage drop % alongside loading % when Voltage Drop is available.

The overlay reads from the result bundle, never from the canonical
project file. When the bundle is `stale`, overlay values are dimmed and
flagged "stale; rerun".

### 14.4 Stale result UX

- Editing any field that participates in the AppNetwork (§9.5) marks
  the latest bundle stale.
- Stage 2 does not auto-rerun.
- The Run button shows "Re-run (stale)" while a stale bundle exists.

### 14.5 No fake results

The Stage 1 prohibition is preserved: there is **no path** in Stage 2 UI
that returns fabricated numbers. If a run fails or is blocked, the
result tables show empty states and the issues list, not zeros.

### 14.6 Run-disabled explanation

The disabled Run button must show the blocking validation codes
(top 3-5) inline plus a "see all" link to the Validation Panel,
matching how Stage 1 PR #3 already lists errors in the calculation
status placeholder.

---

## 15. Stage 2 Acceptance Criteria

| AC | Criterion |
|---|---|
| AC-S2-01 | A valid demo network (utility + transformer + LV bus + branch_chain + load) extracts into a non-null `AppNetwork` with no error issues. |
| AC-S2-02 | An invalid network (islanded bus, missing source, unsupported topology) blocks the run with the documented error code from §11. |
| AC-S2-03 | Calculation-readiness wrapper returns `status = "ready_to_run"` for a valid network and `"blocked_by_validation"` for an invalid one, with `blockingIssues` populated. |
| AC-S2-04 | A valid network can run Load Flow via the pandapower adapter, returning a `LoadFlowResult` with `converged = true` and `BusResult.busInternalId` resolving to canonical buses. |
| AC-S2-05 | Bus voltages are displayed in the Load Flow result table with band-status classification (`ok` / `warning` / `violation`). |
| AC-S2-06 | Branch current and loading % are displayed for cables and transformers in the Load Flow result table. |
| AC-S2-07 | Voltage Drop result is derived from Load Flow and displayed in the Voltage Drop result table with sending / receiving voltage, drop %, limit %, status. |
| AC-S2-08 | When Load Flow is invalid, Voltage Drop is `null` and `E-VD-001` is reported; the bundle's `voltageDrop` field is null and the table shows the empty state. |
| AC-S2-09 | An input edit that affects the AppNetwork marks the latest bundle as `stale`, status `"stale"`, and the diagram overlay is dimmed. |
| AC-S2-10 | After Stage 2 PR #4 ships, a successful run produces a runtime `CalculationSnapshot` (in `packages/calculation-store`) and a `CalculationResultBundle` whose `snapshotId` references that runtime snapshot. The project file's `calculationSnapshots` array remains empty. |
| AC-S2-11 | Each Stage 2 Golden Case (`GC-LF-01`, `GC-LF-02`, `GC-VD-01`, `GC-INVALID-LF-01`, `GC-INVALID-LF-02`, `GC-INVALID-LF-03`) passes within tolerance (§12). |
| AC-S2-12 | The canonical project schema (`packages/schemas/`) is unchanged across every Stage 2 PR; it contains no pandapower types or imports; the canonical drift test still passes. |
| AC-S2-13 | All Stage 1 acceptance tests (AC01..AC23) remain green after Stage 2 PRs. |
| AC-S2-14 | The project file's `calculationSnapshots` array remains empty in **every** Stage 2 PR (PR #1 through PR #6). Real runtime snapshots (PR #4 onward) live only in `packages/calculation-store` and are never serialized into the project file. |
| AC-S2-15 | Adapter contract tests (S2-ADP-01..08) all pass. |
| AC-S2-16 | The Run button is disabled with explanatory codes whenever readiness is `blocked_by_validation`. |
| AC-S2-17 | No fake calculation result is ever returned: failed runs surface issues, not zeros. |

---

## 16. Implementation PR Breakdown

Stage 2 ships in six PRs, each independently reviewable. PR boundaries
match the guardrail "do not implement Stage 2 in this PR" from the spec
(this PR).

### Stage 2 PR #1 — Spec only (this PR)

- New file: `docs/stage-2/stage_2_load_flow_voltage_drop_spec.md`.
- No code changes.
- No schema changes.
- No fixture changes.
- `pnpm check:acceptance` continues to pass on Stage 1 ACs.

### Stage 2 PR #2 — AppNetwork model + topology extraction

- New package `packages/network-model` with the types from §3 and
  `extractAppNetwork(project, scenarioId): NetworkBuildResult`.
- Adapter contract tests `S2-ADP-01..03`.
- New Stage 2 codes wired in but **not** raised as Stage 1 validation
  output: instead they appear in `NetworkBuildResult.issues`.
- The Stage 1 canonical project-file schema is **not modified**; the
  project file's `calculationSnapshots` array remains empty in
  fixtures and saved files.

### Stage 2 PR #3 — Solver adapter contract + pandapower spike

- New package `packages/solver-adapter-pandapower` with adapter A2/A3.
- Internal pandapower wiring (Python sidecar or WASM, decision in
  PR #3 — out of scope here).
- Adapter contract tests `S2-ADP-04..05`.
- No real `CalculationSnapshot` instantiated yet; spike runs
  end-to-end in memory and is gated behind a feature flag. The
  project file's `calculationSnapshots` field remains empty.
- **Merge gate.** PR #3 must not merge until the solver-hosting
  decision (S2-FU-01) is closed in writing. If the decision is still
  open, PR #3 stays in draft.

### Stage 2 PR #4 — Load Flow result normalization + first Golden Case

- New package `packages/calculation` providing the result model in §9
  and `runLoadFlow(scenarioId): CalculationResultBundle`.
- **No change to the Stage 1 canonical project-file schema.** No new
  variant is admitted into `CalculationSnapshotPlaceholder`; the
  project file's `calculationSnapshots` array continues to be empty.
- First real **runtime** `CalculationSnapshot` permitted in
  `packages/calculation-store` (S2-OQ-06). Runtime snapshots are
  in-memory only and are not written to disk.
- GC-LF-01 promoted to `verified`.
- New `validateForCalculation` integration with topology issues.

### Stage 2 PR #5 — Voltage Drop result + UI tables / overlay

- Voltage Drop derivation per §7 inside `packages/calculation`.
- UI: `LoadFlowResultTable`, `VoltageDropResultTable`, diagram overlay,
  Run button activation, replacing the Stage 1 placeholder calculation
  panel for Load Flow / Voltage Drop only.
- Adapter contract tests `S2-ADP-06..07`.
- GC-LF-02, GC-VD-01 added; GC-INVALID-LF-01..03 wired into the
  validation suite.

### Stage 2 PR #6 — Stale result + snapshot retention

- `packages/calculation-store` with retention per §9.5 / OQ-15.
- Stale propagation from project store edits.
- Adapter contract test `S2-ADP-08`.
- AC-S2-09, AC-S2-10, AC-S2-14 graduated to mapped (not deferred).

---

## 17. Guardrails Restated

- **Do not modify** the Stage 1 canonical schema
  (`packages/schemas/src/stage_1_project_schema.rev_d.zod.ts`,
  `packages/schemas/stage_1_project_file.rev_d.schema.json`). The
  Stage 1 canonical project file is unchanged for the entirety of
  Stage 2. Real snapshots / result bundles are runtime-only objects in
  `packages/calculation-store`; they are never written into the
  project file's `calculationSnapshots` array. Disk persistence (if
  ever needed) requires a new project-file schema version or a
  separate sidecar result-store schema (S2-FU-07), not silent edits to
  Stage 1 Rev D. The canonical drift test continues to pass.
- **Do not reintroduce** PRD §8 illustrative names (`bus`, `inService`,
  etc.) into the canonical schema or Stage 2 types.
- **Do not break** Stage 1 tests. AC01–AC23 continue to be the
  acceptance baseline alongside Stage 2 ACs.
- **Do not implement** real calculations in this PR. PR #1 is
  spec-only.
- **Do not create** fake calculation outputs in any Stage 2 PR. Failed
  runs show issues, not numbers.
- **Do not populate** the project file's `calculationSnapshots` array
  in **any** Stage 2 PR. Runtime `CalculationSnapshot` objects (allowed
  starting at Stage 2 PR #4 per §9 / §10) live in
  `packages/calculation-store` and are never serialized into the
  project file.
- **Preserve** transformer-as-node in the project / UI layer
  (S2-OQ-04). Conversion to a calculation branch happens only inside
  `packages/network-model`.
- **Preserve** `branch_chain` ordering. The serializer never reorders
  `branchEquipmentInternalIds`.
- **Preserve** deterministic serialization (Stage 1 Rev D §12.3).
- **Runtime validation is authoritative.** Saved validation remains
  audit-only; Stage 2 readiness is computed fresh from the loaded
  project.

---

## 18. Stage 2 Follow-Up Questions (Not Closed in this Spec)

These are recorded to be closed by a later Stage 2 spec revision or by
the corresponding implementation PR — they do not block Stage 2 PR #1.

- **S2-FU-01** ~~Solver hosting decision~~ **Closed (Stage 2 PR #3,
  2026-05-02).** Decision: pandapower runs as an out-of-process
  **Python sidecar service**. Browser/WASM, Node-native, and direct
  Python child-process options were rejected. The TypeScript adapter
  contract lives in `packages/solver-adapter` and contains no
  pandapower element names; the sidecar skeleton lives in
  `services/solver-sidecar/`. Full rationale, options analysis, version
  pinning plan, security/process boundary, and MVP deployment model
  are recorded in
  `docs/stage-2/solver_adapter_hosting_decision.md`; the contract
  shape is in `docs/stage-2/solver_adapter_contract.md`. The Stage 2
  PR #3 merge gate on S2-FU-01 is satisfied by this entry.
- **S2-FU-02** Project-level Voltage Drop limit settings (per voltage
  level, per equipment kind, per scenario). Deferred until after
  PR #5; Stage 2 ships with the static defaults of §7.2.
- **S2-FU-03** Multi-utility / multi-slack handling, including any
  short-circuit-equivalent → PQ conversion. **Deferred for Stage 2 MVP**:
  the MVP supports exactly one in-service utility slack/source plus
  optional `grid_parallel_pq` generators (§4.3, §6.2). Multiple
  in-service utilities raise `E-LF-003`. This must not be implemented
  unless a future Golden Case explicitly forces it; if it is, both the
  conversion formula and a verified reference must be added before
  release.
- **S2-FU-04** Whether to deduplicate snapshots when an `AppNetwork`
  serializes byte-identical across runs (§9.3). Performance-only
  optimization; deferred.
- **S2-FU-05** Pandapower version pin and adapter compatibility window
  policy. To be set in Stage 2 PR #3.
- **S2-FU-06** Motor starting voltage drop scope: stay deferred or be
  added as a Stage 2 extension after PR #6. Decision after PR #5
  feedback.
- **S2-FU-07** Whether runtime `CalculationSnapshot` / `ResultBundle`
  are ever persisted to disk. Stage 2 says **no** (§9.4 / §10): both
  are in-memory only and the Stage 1 canonical project file's
  `calculationSnapshots` array is not written to. Any future
  persistence must come through a new project-file schema version, or
  via a sidecar result-store file with its own schema; it must not
  silently change Stage 1 Rev D. Likely to be revisited at the
  post-MVP report-export stage.
- **S2-FU-08** UI affordance for "compare two snapshots" — not in
  Stage 2 MVP, but the result store is shaped to allow it later.

---

## 19. Revision Notes

| Revision | Date | Description |
|---|---|---|
| Rev A | 2026-05-02 | Initial Stage 2 spec. Closes S2-OQ-01 through S2-OQ-07; defines AppNetwork, topology extraction, branch_chain conversion policy, Load Flow / Voltage Drop assumptions, solver adapter contracts, result model, snapshot policy, Stage 2 codes, Golden Case candidates, adapter contract tests, UI impact, AC-S2-01..17, and the six-PR breakdown. Spec-only PR. |
| Rev A.1 | 2026-05-02 | Spec-review patch. Blocker 1: tightened S2-OQ-06 / §9.4 / §10 / §16 / §17 / AC-S2-10 / AC-S2-12 / AC-S2-14 to state that the Stage 1 canonical project-file schema is unchanged for the entirety of Stage 2 — `calculationSnapshots` stays empty in every PR; runtime `CalculationSnapshot` / `CalculationResultBundle` live only in `packages/calculation-store`; disk persistence is deferred (S2-FU-07). Blocker 2: added `Reference type: validation_fixture` to GC-INVALID-LF-02 and GC-INVALID-LF-03. Non-blocking patches: tightened §5 branch-chain wording (no open gate **and** no out-of-service member); split §7.3 into branch voltage-drop status (§7.3.1) and bus voltage-band status (§7.3.2); split §10 warnings text into readiness vs result phases; deferred multi-utility / SC-equivalent PQ conversion (§4.3 / §6.2 / §11 `E-LF-003` / S2-FU-03) — Stage 2 MVP requires exactly one in-service utility; added Stage 2 PR #3 merge gate on S2-FU-01 hosting decision. Spec-only; no code/schema/fixture changes. |
| Rev A.2 | 2026-05-02 | S2-FU-01 closed in writing as part of Stage 2 PR #3 (Solver Adapter Contract + Python Sidecar). §18 entry updated to point at `docs/stage-2/solver_adapter_hosting_decision.md` and `docs/stage-2/solver_adapter_contract.md`. Decision: Python sidecar service hosts pandapower; the TypeScript adapter contract is solver-agnostic and lives in `packages/solver-adapter`. No other spec sections changed; remaining follow-ups (S2-FU-02..08) unchanged. |
