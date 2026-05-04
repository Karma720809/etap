# Stage 3 Equipment Duty Spec Revision / OQ Update

**Project:** Power System Study App
**Stage:** Stage 3 — Equipment Duty (gated follow-up to the Short Circuit MVP)
**PR:** Stage 3 PR #8 (this PR — spec revision / OQ closure, documentation only)
**Branch:** `stage-3/pr-8-equipment-duty-spec`
**Document status:** Implementation-ready spec — Rev A (spec-only, no code)
**Date:** 2026-05-04

---

## 0. Reading order

This revision depends on, and does **not** restate, the merged Stage 3
Short Circuit MVP spec, the Stage 3 implementation plan, or the
Stage 3 acceptance closeout. Read those first; this document is the
follow-on spec revision they reference as the gate for any Equipment
Duty implementation work:

- `docs/stage-3/stage_3_short_circuit_mvp_spec.md` — merged Stage 3
  spec. Equipment Duty Check is recorded there as **out of MVP scope**
  (§2.3) and tracked as **S3-FU-12** in §15.
- `docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md`
  — implementation plan. The **Equipment Duty pre-implementation OQ
  gate** lives in plan §8 and the gated PR slot lives in plan §6.6
  ("PR #5A or later — Equipment Duty Check (Gated Follow-Up)").
- `docs/stage-3/stage_3_acceptance_closeout.md` — Stage 3 closeout.
  §4.2 records Equipment Duty Check as a **gated follow-up** that
  "requires a separate Stage 3 spec revision / OQ update PR before
  any code lands."

This document IS that spec revision. When `stage_3_equipment_duty_spec.md`
is merged, the Equipment Duty pre-implementation OQ gate (plan §8) is
closed; the implementation PRs listed in §8 of this document become
the canonical Equipment Duty PR breakdown for the next slot in the
Stage 3 follow-up sequence.

Whenever this document refers to spec sections (e.g., §6.3, §8, §15),
it refers to sections in `stage_3_short_circuit_mvp_spec.md`. Whenever
it refers to plan sections (e.g., plan §6.6, plan §8), it refers to
sections in `stage_3_short_circuit_equipment_duty_implementation_plan.md`.

---

## 1. Purpose and document role

### 1.1 Purpose

Equipment Duty Check (S3-FU-12) compares per-equipment ratings
(breaker interrupting capacity, switch / busbar short-time withstand,
optionally cable short-circuit withstand) against the per-bus
fault-current rows produced by the Stage 3 Short Circuit MVP. It is
an **engineering-study output**, not certified equipment selection.
Its purpose is to flag equipment whose published rating is exceeded
by the prospective fault duty so the engineer can re-rate or escalate.

### 1.2 What this PR is

This PR is **documentation only**. It:

- Closes every item in the Equipment Duty pre-implementation OQ gate
  (plan §8) with an explicit decision and rationale.
- Defines the Equipment Duty result model, threshold matrix,
  missing-rating policy, runtime retention shape, and acceptance
  criteria template (`AC-S3-D01..D09`).
- Defines the **canonical Equipment Duty PR breakdown** that supersedes
  plan §6.6's "PR #5A or later" placeholder.
- Defines the explicit non-goals so a future Equipment Duty PR cannot
  silently expand into Cable Sizing (Stage 4) or Report Workflow
  (Stage 5).

### 1.3 What this PR is NOT

This PR ships **no** code, **no** schema change, **no** sidecar
behavior change, **no** runtime behavior change, **no** UI change,
and **no** acceptance-manifest extension. Specifically, this PR does
**not**:

- Add any field to the Stage 1 canonical schema. Schema additions
  required for Equipment Duty are sequenced into the **next**
  Equipment Duty PR (the schema-only PR — see §8.1 / ED-PR-01) and
  must follow the existing canonical-drift / migration policy.
- Implement any Equipment Duty calculation, contract type, validation
  wrapper, runtime bundle, retention slot, sidecar dispatcher, or UI
  surface.
- Modify `apps/web/**`, `packages/solver-adapter/**`,
  `packages/calculation-store/**`, `packages/project-io/**`,
  `packages/network-model/**`, `packages/validation/**`,
  `packages/schemas/**`, or `services/solver-sidecar/**`.
- Modify `scripts/acceptance-coverage.json` or
  `scripts/check-acceptance.ts`. Equipment Duty acceptance entries
  (`AC-S3-D01..D09`) are added by the Equipment Duty acceptance
  closeout PR (ED-PR-05), mirroring how `AC-S3-01..07` landed in
  Stage 3 closeout PR #6 rather than in the Stage 3 spec PR.

### 1.4 Operating-model placement

Per the project operating model (plan §3.4):

- **PRD v1.0** owns product baseline.
- **Stage Spec** owns stage-level design, OQ decisions, the result
  model, the adapter boundary, validation policy, acceptance criteria,
  and the canonical PR breakdown for the stage.
- **Stage Implementation Plan** owns sequencing and merge criteria
  derived from the Stage Spec.
- **PR-level task plans** own concrete coding instructions per PR.

This document is a **Stage Spec revision** — it amends the merged
Stage 3 spec by closing the Equipment Duty OQs that the Stage 3 Short
Circuit MVP intentionally left open (S3-FU-12). Once merged, **this
spec revision is the canonical Equipment Duty gate-closing document**:
it closes the plan §8 pre-implementation OQ gate, supersedes the plan
§6.6 "PR #5A or later" placeholder, and is the document any future
Equipment Duty PR cites as the source of the OQ decisions and PR
breakdown.

Editing the older implementation plan
(`stage_3_short_circuit_equipment_duty_implementation_plan.md`) to
point §6.6 at this document is a **recommended documentation
synchronization follow-up**, not a prerequisite for ED-PR-01. The
plan-edit follow-up is itself documentation-only, does not change the
gate state, and may land before, alongside, or after ED-PR-01 without
affecting Equipment Duty code-work readiness. ED-PR-01 is unblocked
the moment **this** spec revision merges.

This PR remains documentation/spec-only regardless: it does not edit
the implementation plan, the closeout, or any code, schema, script,
manifest, test, or package file. The plan-synchronization follow-up
must be a separate documentation-only PR if it happens.

---

## 2. Stage Boundary recap (what is and is not done)

For traceability, the current Stage 3 state at the moment this spec
revision is authored:

| Item | State | Source |
|---|---|---|
| Stage 3 Short Circuit MVP spec | Merged | spec PR #11 |
| Stage 3 implementation plan | Merged | plan PR #12 |
| Short Circuit contract / wire types | Merged | PR #13 (Stage 3 PR #2) |
| Sidecar `run_short_circuit` | Merged | PR #14 (Stage 3 PR #3) |
| Short Circuit orchestrator + result normalization + retention widening | Merged | PR #15 (Stage 3 PR #4) |
| Short Circuit UI result table + status panel wiring | Merged | PR #16 (Stage 3 PR #5) |
| Stage 3 acceptance closeout (`AC-S3-01..07` mapped) | Merged | PR #6 (closeout) |
| GC-SC-01 executable Golden Case integration (`provisional`) | Merged | PR #7 |
| **Equipment Duty Check (S3-FU-12) implementation** | **Not started; gated on this spec revision** | this PR (#8) |

Equipment Duty implementation has **not** begun. The Short Circuit
MVP, GC-SC-01 integration, and Stage 3 acceptance closeout are all
already merged on `main` and remain unaffected by this spec
revision.

---

## 3. Equipment Duty OQ Decision Table

The eight Equipment Duty OQs below correspond one-for-one to the
plan §8 pre-implementation OQ gate items (with ED-OQ-08 added to
formalize the explicit non-goal boundary the task brief requires).
Each row is the headline decision; the per-OQ sections in §4 carry
the rationale, implementation impact, and acceptance-criteria impact.

| OQ | Topic | Decision | Implementation impact | AC impact |
|---|---|---|---|---|
| **ED-OQ-01** | Equipment rating fields | Add **optional** rating fields to the Stage 1 canonical schema for breakers, switches, and buses. Cable short-circuit withstand fields are **conditionally** added (see ED-OQ-04). All fields are `optional` so existing project files round-trip. Lands in a **dedicated schema-only PR** (ED-PR-01) before any duty-check code. | Stage 1 schema extension (Rev D → Rev D.1 minor); canonical-drift test updated; round-trip + serialization tests extended; no changes to non-rating fields. | AC-S3-D01 |
| **ED-OQ-02** | Missing-rating policy | Missing rating on an in-scope element → per-row `unavailable` status with `W-DC-001` (`missing equipment rating`). The run is **not** blocked. Top-level status flips to `warning` if any row is `unavailable`. | Orchestrator must synthesize `unavailable` rows for ratable equipment lacking a rating; `validateForDutyCheck()` must NOT escalate missing ratings to errors. | AC-S3-D06 |
| **ED-OQ-03** | Duty basis | Breaker interrupt: **`Ib`** (IEC 60909-0 §4.5) when computable; **`Ik''`** fallback labeled `provisional` with `W-DC-002`. Time-to-fault default `tmin = 0.05 s`. Peak duty: `ip` vs `breakerMakingKa` and `busPeakWithstandKa` (skip when peak rating absent). Thermal duty: `Ith` vs `√(I²t / t_clearing)` derived from short-time withstand fields, using project-level default `faultClearingS = 0.5 s` labeled `provisional`. Provisional vs verified: any row whose duty was computed from a fallback path or a project-level default carries `verdictBasis: "provisional"`; rows computed entirely from explicit project inputs and `Ib` carry `verdictBasis: "verified"`. | Orchestrator implements the basis matrix; runtime bundle records basis per row; no new sidecar command (duty check is pure TypeScript over an already-normalized `ShortCircuitResult` plus AppNetwork ratings). | AC-S3-D03 |
| **ED-OQ-04** | Cable short-circuit withstand | **Included** in this Equipment Duty effort, not a separate spec. Rated by `cableShortCircuitKValue` (A·s^0.5 / mm²; IEC 60364-5-54 Table 43A) on `NetworkCableBranch` and the existing `crossSectionMm2`. Computed `I²t_allowed = (K × A)²`; `I²t_actual = Ik''² × t_clearing`. Clearing time uses the same project-level `faultClearingS` default as ED-OQ-03 thermal duty, so cable withstand rows are `provisional` until per-zone protection coordination ships. | Cable rating field added in ED-PR-01 alongside breaker / switch / bus ratings. Orchestrator emits per-cable duty rows under the same `DutyCheckResult.equipmentResults[]` slot as breakers / switches / buses (discriminated by `equipmentKind`). | AC-S3-D04 |
| **ED-OQ-05** | Pass / warning / fail thresholds | Per duty row: `ok` when utilization ≤ 90%; `warning` when 90% < utilization ≤ 100%; `violation` when utilization > 100%. Utilization defined as `dutyActual / rating × 100%`. Margins are **fixed in spec for MVP**; per-project override is deferred (ED-FU-01). | Orchestrator applies the threshold table; UI renders the badge per row. | AC-S3-D05 |
| **ED-OQ-06** | Runtime/store model | New runtime-only `DutyCheckRunBundle` returned by `runDutyCheckForBundle()`. New `CalculationModule` literal `"duty_check_bundle"`. Retention via the existing `(scenarioId, module, subCase)` key. **No project-file persistence.** `calculationSnapshots` remains an empty array; `calculationResults` is **not** introduced. The active-slot lifecycle asymmetry recorded in spec §8.2.1 (LF-narrow active slot) extends unchanged to duty-check successes — they live in `retainedResults["duty_check_bundle"]`, not in the active LF slot. | `packages/calculation-store/src/types.ts` widens `CalculationModule` to `"load_flow_bundle" \| "short_circuit_bundle" \| "duty_check_bundle"` and `RuntimeCalculationRecord.bundle` to `LoadFlowRunBundle \| ShortCircuitRunBundle \| DutyCheckRunBundle`. Reducer slot widened. | AC-S3-D07 |
| **ED-OQ-07** | Acceptance criteria | New AC block `AC-S3-D01..D09` lands at the Equipment Duty acceptance closeout PR (ED-PR-05). The block is added to `scripts/acceptance-coverage.json` as a fourth top-level key (`stage3EquipmentDuty.criteria[]`) and `scripts/check-acceptance.ts` is extended with a `stage3EquipmentDutyExpected` array, parallel to the existing Stage 1 / Stage 2 / Stage 3 blocks. None of those edits land in **this** PR — the spec defines the AC contract; the closeout PR records owners. | Closeout-PR-only edits to the manifest + checker. | AC-S3-D01..D09 (definition) |
| **ED-OQ-08** | Boundary / non-goals | Equipment Duty does **not** include Cable Sizing (Stage 4), Report Workflow (Stage 5), arc flash, breaker arc-impedance modeling, breaker time-current curve verification, IEC TR 60909-1 / 60909-2 detail (motor + generator subtransient contributions), per-zone protection coordination clearing time, or per-source contribution breakdown. UI implementation is out of **this** PR (#8) but is in scope for a later Equipment Duty PR (ED-PR-04). Equipment Duty calculation implementation is out of **this** PR (#8). | Documented in §7 and §9 of this revision. | AC-S3-D09 |

---

## 4. Decisions in detail

Each subsection below expands the headline decision in §3 with the
rationale required to judge edge cases.

### 4.1 ED-OQ-01 — Equipment rating fields

**Decision.** Add the following **optional** fields to the Stage 1
canonical schema. The schema bump is a `Rev D → Rev D.1` minor
revision: every existing project file continues to validate because
all new fields are optional. The bump lands in **ED-PR-01** as a
schema-only PR; this PR does **not** add the fields.

**Schema fields (canonical names, units, types):**

| Element | Field | Type | Units | Notes |
|---|---|---|---|---|
| `Breaker` | `interruptingCapacityKa` | `number > 0` (optional) | kA, RMS symmetrical | Compared against `Ib` (or `Ik''` fallback per ED-OQ-03). |
| `Breaker` | `peakWithstandKa` | `number > 0` (optional) | kA, peak | Compared against `ip` per ED-OQ-03 peak duty. Optional — when absent, peak duty for the breaker is skipped (not a violation). |
| `Switch` | `shortTimeWithstandKa` | `number > 0` (optional) | kA, RMS symmetrical | Compared against `Ith` per ED-OQ-03 thermal duty. |
| `Switch` | `shortTimeWithstandDurationS` | `number > 0` (optional, default 1.0) | s | Rated duration. Default 1 s per IEC 62271 convention; the canonical schema keeps the field required-when-`shortTimeWithstandKa`-present so the conversion to a 1-s equivalent is auditable. |
| `Switch` | `peakWithstandKa` | `number > 0` (optional) | kA, peak | Compared against `ip`. Skip when absent. |
| `Bus` (`Bus.bustype = "busbar"`) | `shortTimeWithstandKa` | `number > 0` (optional) | kA, RMS symmetrical | Same semantics as switch field. |
| `Bus` (`Bus.bustype = "busbar"`) | `shortTimeWithstandDurationS` | `number > 0` (optional, default 1.0) | s | Same semantics as switch field. |
| `Bus` (`Bus.bustype = "busbar"`) | `peakWithstandKa` | `number > 0` (optional) | kA, peak | Compared against `ip`. Skip when absent. |
| `Cable` (`NetworkCableBranch`) | `shortCircuitKValue` | `number > 0` (optional) | A · s^0.5 / mm² | IEC 60364-5-54 Table 43A. Examples: 143 (Cu/PVC), 115 (Cu/XLPE), 94 (Al/PVC), 76 (Al/XLPE). Cable duty row is computed only when this field is present (otherwise `unavailable` per ED-OQ-02). |

**Rationale.**

- Optional-only: the schema-rev policy (Stage 1 §12 / canonical-drift
  test) requires that any new field be opt-in for existing project
  files. Equipment Duty is a follow-up; it must not invalidate
  projects authored before duty fields existed.
- Naming consistency: every duty-related field is named with the
  rating mechanism (`interruptingCapacityKa`, `shortTimeWithstandKa`)
  rather than a vendor-specific label (e.g., `ICU`, `IcW`). This
  matches the existing Stage 1 convention of physically-named fields
  (`scLevelMva`, `xrRatio`, `vkPercent`).
- Cable `shortCircuitKValue` is sourced from IEC 60364-5-54 Table 43A
  rather than computed from insulation type at runtime, because the
  insulation field today is free-form and the K-factor lookup would
  add a maintenance burden the duty-check engine doesn't need.
- Schema-change approval is a **hard prerequisite** — ED-PR-01 ships
  only schema, fixtures, drift test, and round-trip tests. No
  runtime code, no sidecar code, no UI consumes the fields until
  ED-PR-02+.

**Out of scope for ED-OQ-01:**

- Switchgear assembly ratings (a busbar inside a `LV-MCC` enclosure
  may have a lower rating than the busbar itself); modeled as
  `Bus.shortTimeWithstandKa` for MVP. Per-assembly rating deferred to
  ED-FU-02.
- Vendor-specific breaker family fields (`ICS`, `ICU` distinction).
  MVP records a single `interruptingCapacityKa`; vendor split is
  deferred to ED-FU-03.

### 4.2 ED-OQ-02 — Missing-rating policy

**Decision.** A ratable equipment row whose rating field is missing
emits a `DutyCheckEquipmentResult` with:

- `status: "unavailable"`
- `verdictBasis: "provisional"` (because the row was synthesized
  rather than computed)
- All numeric duty / utilization fields `null`
- `issueCodes: ["W-DC-001"]`

The run does **not** block. The top-level
`DutyCheckResult.status` follows the Short Circuit pattern (spec
§7.3 / §7.5.3):

- `valid` only when every row is `ok` AND no top-level issue is
  present.
- `warning` when at least one row is `warning`, `unavailable`, or
  `provisional`-with-warning, AND no row is `violation`.
- `failed` when at least one row is `violation`, OR when the upstream
  `ShortCircuitResult.status === "failed"`, OR when `validateForDutyCheck()`
  rejected the run.

**Rationale.**

- `unavailable` parallels the Short Circuit per-bus `unavailable`
  row (spec §7.3 / §7.5.2). The user sees an explicit "no rating
  recorded" cell rather than a silently dropped row, preserving the
  no-fake-numbers rule (§S3-OQ-02 / §9.5).
- A run-block on missing ratings would punish projects that are
  partway through inventory. Stage 1 accepts incomplete projects
  (`I-EQ-001`), so duty check does too. The user is told via the
  warning, not blocked.
- `violation` correctly escalates the top-level status to `failed`
  because a rating violation is the engineering outcome the duty
  check exists to catch — it is **not** a partial-input edge case.

**UI behavior** (specified for ED-PR-04):

- `unavailable` row renders the equipment tag, an empty cell for
  every numeric column, the warning badge, and a tooltip carrying
  the `W-DC-001` description. The row is **not** hidden and is
  **not** greyed out — empty-cell + badge is the convention already
  established by Stage 2 / Stage 3 result tables (spec §9.2 / §9.5).

### 4.3 ED-OQ-03 — Duty basis

**Decision matrix.**

| Duty kind | Primary basis | Fallback | Provisional condition |
|---|---|---|---|
| Breaker interrupting | `Ib` (IEC 60909-0 §4.5), derived from `Ik''` and the source-equivalent `R/X` ratio at `tmin = 0.05 s` | `Ik''` directly when `Ib` cannot be computed (e.g., source `xrRatio` carried no time-to-decay information beyond the Stage 2 contract) | Any row using the `Ik''` fallback OR computed at the default `tmin = 0.05 s` is `verdictBasis: "provisional"` and emits `W-DC-002`. |
| Breaker peak (making) | `ip` from `ShortCircuitResult.busResults[].ipKa` vs `Breaker.peakWithstandKa` | None — when `ipKa` is `null` or `peakWithstandKa` is missing, the row is `unavailable` (peak duty only). The breaker's interrupting duty row is unaffected. | Always `verified` when both `ipKa` and `peakWithstandKa` are present. |
| Switch / busbar thermal | `Ith` from `ShortCircuitResult.busResults[].ithKa`, scaled to the equipment's rated duration via the IEC 60865 `I × √(t / t_rated)` equivalence | None — when `ithKa` is `null`, the row is `unavailable`. | Any row computed with the project-level default `faultClearingS = 0.5 s` (i.e., where the per-zone clearing time is not yet wired) is `verdictBasis: "provisional"` and emits `W-DC-003`. |
| Cable thermal withstand | `I²t_actual = ikssKa² × faultClearingS` vs `I²t_allowed = (K × crossSectionMm2)²` | None — when `cableShortCircuitKValue` is missing, the row is `unavailable`. | Always `provisional` until per-zone protection clearing time replaces the `faultClearingS = 0.5 s` default (ED-FU-04). |
| Switch / bus peak | `ip` vs `peakWithstandKa` | None — peak rating absent → `unavailable` for the peak comparison only. | Always `verified` when both are present. |

**Time-to-fault assumption.** The MVP picks `tmin = 0.05 s` as the
single global default for `Ib` derivation, matching the IEC 60909-0
recommended minimum delay for a typical LV breaker. Per-equipment
override of `tmin` is deferred (ED-FU-05). The `tmin` value used is
recorded on `DutyCheckResult.metadata.basis.tminS` so the user can
audit and so a future per-equipment override can flag a row's
`verdictBasis` accordingly.

**Provisional vs verified.** The overall `DutyCheckResult` carries
no top-level `verdictBasis` field; the basis is per-row because a
single run can mix verified and provisional rows. The UI surfaces
the basis via a per-row badge.

**Rationale.**

- IEC 60909-0 §4.5 `Ib` is the engineering-standard breaker-duty
  basis; using `Ik''` would systematically over-state duty (`Ik''`
  decays toward `Ib` over the breaker's opening time). Using `Ik''`
  silently as the primary basis would flag breakers as failing duty
  that pass the standard interrupting test. The fallback path
  preserves the "no fake numbers" rule by labeling the row
  `provisional` rather than dropping it.
- A single global `tmin` keeps the MVP scope tight while keeping the
  audit trail honest. Per-equipment override is the natural next
  refinement once Stage 6 (protection coordination) ships per-zone
  clearing times.
- Cable withstand and bus thermal both consume `faultClearingS`,
  which is the same project-level default. Both ride on the same
  warning code (`W-DC-003`) so a single follow-up — wiring per-zone
  clearing time — clears the `provisional` label on every row that
  uses the default.
- Duty check is pure TypeScript over already-normalized
  `ShortCircuitResult` + AppNetwork ratings. No new sidecar command
  is required; pandapower has no equipment-rating awareness, and a
  Python-side duty check would re-implement TypeScript logic across
  the IPC boundary for no benefit.

### 4.4 ED-OQ-04 — Cable short-circuit withstand

**Decision.** Cable short-circuit withstand IS in scope for this
Equipment Duty effort. It is **not** spun off as a separate spec.
Reasons:

- Cable withstand consumes the same `ShortCircuitResult.busResults`
  rows as breakers / switches / buses, plus the same project-level
  `faultClearingS` default. Splitting it across two specs would
  duplicate the OQ tree (rating fields, missing-rating policy,
  threshold matrix, retention, AC) for no engineering gain.
- Cable Sizing (Stage 4) is an unrelated feature. Sizing decides
  cross-section from steady-state ampacity + voltage drop; withstand
  decides whether an already-sized cable can survive a fault.
  Bundling withstand into Cable Sizing would force Stage 4 to drag in
  the entire Equipment Duty surface (rating fields, basis matrix,
  threshold matrix, retention, UI), which is the opposite of the
  Stage 4 charter.

**Inputs.**

- `cableShortCircuitKValue` (A·s^0.5/mm²) — added in ED-PR-01.
  Sourced from IEC 60364-5-54 Table 43A.
- `crossSectionMm2` (mm²) — already on the Stage 1 schema.
- `faultClearingS` (s) — project-level default `0.5 s`, configurable
  via `ProjectMetadata.shortCircuit.defaultFaultClearingS` (added in
  ED-PR-01 as another optional field). Per-zone clearing time is
  deferred (ED-FU-04).

**Computation.**

- `I²t_allowed = (cableShortCircuitKValue × crossSectionMm2)²`
  (units: A²·s).
- `I²t_actual = (ikssKa × 1000)² × faultClearingS` (units: A²·s).
  The per-bus row that drives the cable's actual duty is the bus at
  the cable's downstream end — the convention picks the bus most
  likely to see the highest `Ik''` for a fault on the cable.
  (Alternative: pick the higher of upstream / downstream; deferred
  to ED-FU-06.)
- `utilizationPct = √(I²t_actual / I²t_allowed) × 100`. The square
  root keeps the utilization comparable in the same scale as the
  current-based duty rows.

**Status mapping.** Same threshold table as ED-OQ-05.

**Provisional labeling.** Always `provisional` until per-zone
protection clearing time replaces the project-level default.

### 4.5 ED-OQ-05 — Pass / warning / fail thresholds

**Decision.** The threshold table is fixed in spec for MVP:

| Utilization | `status` | `verdictBasis` |
|---|---|---|
| `null` (missing rating or missing fault current) | `unavailable` | `provisional` |
| ≤ 90% | `ok` | per ED-OQ-03 / ED-OQ-04 |
| > 90% AND ≤ 100% | `warning` | per ED-OQ-03 / ED-OQ-04 |
| > 100% | `violation` | per ED-OQ-03 / ED-OQ-04 |

`utilizationPct` is recorded on the per-equipment row as a
`number | null` (always `null` for `unavailable`).

**Rationale.**

- 90% / 100% margins match the IEC convention used by Stage 2 Load
  Flow's voltage-drop band classification (`ok` / `warning` /
  `violation`) so the user sees consistent semantics across modules.
- Tunable thresholds are deferred (ED-FU-01) for the same reason
  Stage 2 deferred per-project voltage-band tunability: introducing a
  per-project tunable margin without UI wiring would make the
  acceptance test surface depend on project state, which complicates
  the acceptance closeout.
- A `violation` row escalates the top-level status to `failed`
  because the duty check's purpose is to catch ratings violations.

### 4.6 ED-OQ-06 — Runtime / store model

**Decision.**

- New runtime type `DutyCheckRunBundle` returned by
  `runDutyCheckForBundle(bundle: ShortCircuitRunBundle, options?: DutyCheckOptions)`.
  The orchestrator consumes a `ShortCircuitRunBundle` (already in
  `retainedResults` per spec §8.2) plus the AppNetwork ratings, so it
  does **not** spawn the sidecar.
- `CalculationModule` widens to
  `"load_flow_bundle" | "short_circuit_bundle" | "duty_check_bundle"`.
- `RuntimeCalculationRecord.bundle` widens to
  `LoadFlowRunBundle | ShortCircuitRunBundle | DutyCheckRunBundle`,
  using the existing module discriminator.
- Retention key remains `(scenarioId, "duty_check_bundle", null)`.
  `subCase` stays `null` for MVP (per-fault-target sub-cases deferred
  to ED-FU-07 if needed).
- Stale flag: a project edit that affects ratings flips the retained
  duty record's `stale` flag. **No auto-recompute.** Same rule as
  Stage 2 / Stage 3.
- Active-slot lifecycle: spec §8.2.1's LF-narrow active slot
  asymmetry extends unchanged. Duty-check successes live in
  `retainedResults["duty_check_bundle"]` and do **not** displace
  `state.bundle` (which stays LF-narrow). Consumers needing a
  cross-module stale signal iterate `retainedResults[*].stale`.
- `calculationSnapshots` remains an empty array. `calculationResults`
  is **not** introduced. No disk persistence.

**Rationale.**

- Runtime-only retention preserves spec §S3-OQ-09 / spec §17 / Stage 2
  guardrails verbatim. No exception.
- The bundle separation (don't merge `DutyCheckRunBundle` into
  `ShortCircuitRunBundle`) follows the same logic as spec §S3-OQ-08
  separating Short Circuit from Load Flow: duty check is a separate
  user action (the user re-checks ratings after editing equipment
  data), and coupling the two would force every Short Circuit run to
  also produce a duty check.

**Calculation-store implementation note.** Widening the
`RuntimeCalculationRecord.bundle` union to three members must
preserve the discriminator-by-`module` invariant introduced in
PR #15. Adding `"duty_check_bundle"` is a structural extension of
the existing pattern, not a redesign.

### 4.7 ED-OQ-07 — Acceptance criteria

**Decision.** Define `AC-S3-D01..D09` here; ship them in the manifest
at the Equipment Duty acceptance closeout PR (ED-PR-05). Each AC has
a verification owner template that the closeout PR fills with
concrete file paths + test names once implementation lands.

| AC | Criterion | Owner template (filled at ED-PR-05) |
|---|---|---|
| **AC-S3-D01** | Equipment rating fields defined on Stage 1 canonical schema (breaker `interruptingCapacityKa` / `peakWithstandKa`, switch `shortTimeWithstandKa` / `shortTimeWithstandDurationS` / `peakWithstandKa`, busbar `shortTimeWithstandKa` / `shortTimeWithstandDurationS` / `peakWithstandKa`, cable `shortCircuitKValue`, project `defaultFaultClearingS`); all fields optional; Rev D → Rev D.1; canonical-drift test still passes; round-trip preserved. | `packages/schemas/src/stage_1_project_schema.rev_d.zod.ts` (renamed or `rev_d_1.zod.ts`) + `packages/schemas/tests/canonical-drift.test.ts` + `packages/project-io/tests/round-trip.test.ts` (ED-PR-01). |
| **AC-S3-D02** | Duty check orchestrator consumes a normalized `ShortCircuitRunBundle` plus AppNetwork ratings and emits a `DutyCheckResult` keyed by equipment internalId. | `packages/duty-check/src/dutyCheckRunner.ts` + tests (ED-PR-03). |
| **AC-S3-D03** | Duty basis matrix per ED-OQ-03 (breaker `Ib` primary / `Ik''` fallback labeled `provisional`; peak `ip`; thermal `Ith`; default `tmin = 0.05 s`; default `faultClearingS = 0.5 s`). | `packages/duty-check/src/dutyCheckBasis.ts` + tests (ED-PR-03). |
| **AC-S3-D04** | Cable short-circuit withstand per ED-OQ-04 (`I²t_allowed = (K × A)²`; `I²t_actual = Ik''² × t_clearing`; per-row `provisional` until per-zone clearing time wired). | `packages/duty-check/src/cableWithstand.ts` + tests (ED-PR-03). |
| **AC-S3-D05** | Threshold mapping `ok` (≤90%) / `warning` (>90% ≤100%) / `violation` (>100%) per ED-OQ-05. | `packages/duty-check/src/thresholds.ts` + tests (ED-PR-03). |
| **AC-S3-D06** | Missing-rating policy per ED-OQ-02 (`unavailable` row + `W-DC-001`; run not blocked). | `packages/duty-check/tests/missing-rating.test.ts` (ED-PR-03). |
| **AC-S3-D07** | Runtime-only retention via `"duty_check_bundle"`; project file unchanged after duty run; `calculationSnapshots` empty; no `calculationResults`. | `packages/calculation-store/tests/duty-check-retention.test.ts` + `apps/web/tests/calculationStore.dutyCheck.test.tsx` (ED-PR-03 / ED-PR-04). |
| **AC-S3-D08** | UI surfaces (`DutyCheckResultTable.tsx`, `CalculationStatusPanel.tsx` row) render real values, render `unavailable` rows as empty cells + warning badge, never render fake numbers. | `apps/web/tests/DutyCheckResultTable.test.tsx` + `apps/web/tests/CalculationStatusPanel.test.tsx` extension (ED-PR-04). |
| **AC-S3-D09** | Non-goals listed (Cable Sizing, Report Workflow, arc flash, breaker arc model, vendor split, per-zone clearing time, motor / generator subtransient, per-source contribution breakdown). | This document §7 + ED-PR-05 closeout doc. |

The closeout PR is responsible for adding the `stage3EquipmentDuty`
block to `scripts/acceptance-coverage.json` and extending
`scripts/check-acceptance.ts` with the `stage3EquipmentDutyExpected`
array. None of those edits land in this PR.

### 4.8 ED-OQ-08 — Boundary

**Decision.** This Equipment Duty effort does **not** include and
must **not** silently expand into:

- **Cable Sizing engine** — Stage 4 charter. Cable Sizing decides
  cross-section from ampacity + voltage drop. Equipment Duty merely
  checks whether already-sized cables survive the prospective fault.
- **Report Workflow** — Stage 5 charter (Excel / PDF certified
  report).
- **UI implementation in this PR (#8)** — UI lands in ED-PR-04, not
  this PR.
- **Equipment Duty calculation implementation in this PR (#8)** —
  calculation lands in ED-PR-03, not this PR.
- **Arc flash** — post-MVP per spec §2.3.
- **Breaker arc-impedance modeling** — per spec §S3-OQ-05 / §3.2,
  closed gates are zero-impedance; Stage 3 does not model arc.
- **Motor / generator subtransient short-circuit contribution** —
  deferred per spec §S3-OQ-05 / S3-FU-03 / S3-FU-04. Equipment Duty
  reads whatever `ShortCircuitResult` the Stage 3 MVP sidecar
  produces; if the sidecar excludes motors and generators, the duty
  check inherits that exclusion. A future Equipment Duty refinement
  PR (post-S3-FU-03 / S3-FU-04) may revisit.
- **Per-source contribution breakdown** — deferred (S3-FU-05).
- **ANSI / IEEE C37 basis** — deferred (S3-FU-08). Equipment Duty
  uses the IEC 60909 outputs the Stage 3 MVP produces.
- **Per-zone protection clearing time** — see ED-FU-04. Until then,
  thermal and cable-withstand rows are `provisional` per ED-OQ-03 /
  ED-OQ-04.

---

## 5. Result model (planned, not implemented in this PR)

The shapes below are illustrative — they live in
`packages/duty-check/src/types.ts` once ED-PR-02 lands. Stage 3
PR #8 (this PR) introduces no code.

```ts
export type DutyCheckEquipmentKind =
  | "breaker"
  | "switch"
  | "busbar"
  | "cable";

export type DutyCheckDutyKind =
  | "interrupting"   // breaker, vs Ib (or Ik'' fallback)
  | "peakMaking"     // breaker, vs ip
  | "shortTimeWithstand" // switch / busbar, vs Ith
  | "peakWithstand"  // switch / busbar, vs ip
  | "cableThermal";  // cable, vs I²t

export type DutyCheckStatus =
  | "ok"
  | "warning"
  | "violation"
  | "unavailable";

export type DutyCheckVerdictBasis = "verified" | "provisional";

export type DutyCheckIssueCode = "W-DC-001" | "W-DC-002" | "W-DC-003";

export interface DutyCheckIssue {
  code: DutyCheckIssueCode;
  severity: "warning";
  message: string;
  internalId?: string;
  field?: string;
}

export interface DutyCheckEquipmentResult {
  /** Stage 1 canonical equipment internalId. Resolves back into AppNetwork. */
  equipmentInternalId: string;
  equipmentKind: DutyCheckEquipmentKind;
  dutyKind: DutyCheckDutyKind;
  /** Source bus for the fault current driving this row. */
  busInternalId: string;
  /** kA, RMS sym, basis per ED-OQ-03. `null` when row is unavailable. */
  dutyActualKa: number | null;
  /** kA, the equipment's rated value (same units as dutyActualKa). `null` when rating absent. */
  ratingKa: number | null;
  /** = dutyActualKa / ratingKa × 100. `null` for unavailable rows. */
  utilizationPct: number | null;
  status: DutyCheckStatus;
  verdictBasis: DutyCheckVerdictBasis;
  issueCodes: DutyCheckIssueCode[];
}

export interface DutyCheckResultMetadataBasis {
  /** Default tmin used for Ib derivation (s). ED-OQ-03. */
  tminS: number;
  /** Project-level fault clearing time used for thermal / cable duty (s). ED-OQ-03 / ED-OQ-04. */
  faultClearingS: number;
}

export interface DutyCheckResult {
  resultId: string;
  runtimeSnapshotId: string;
  scenarioId: string | null;
  module: "dutyCheck";
  status: "valid" | "warning" | "failed";
  equipmentResults: DutyCheckEquipmentResult[];
  issues: DutyCheckIssue[];
  metadata: {
    /** Reuses Stage 2 SolverMetadata shape, pinned to solverName "duty-check" (no sidecar). */
    solverName: "duty-check";
    solverVersion: string;
    adapterVersion: string;
    executedAt: string;
    inputHash: null;
    networkHash: null;
    options: { /* DutyCheckOptions snapshot */ };
    basis: DutyCheckResultMetadataBasis;
  };
  createdAt: string;
}

export interface DutyCheckRunBundle {
  dutyCheck: DutyCheckResult;
  snapshot: RuntimeCalculationSnapshot;
  /** The ShortCircuitRunBundle this duty check ran against (same retention slot key). */
  shortCircuit: ShortCircuitRunBundle;
}
```

Notes on the planned shape:

- Per-equipment rows include the source `busInternalId` so the UI
  can group rows by feeding bus and so the user can pivot from a duty
  violation back to the originating fault row.
- `DutyCheckIssue.severity` is restricted to `"warning"` because
  every Equipment Duty failure mode in MVP surfaces as either a
  per-row `violation` (escalates the top-level status) or a per-row
  warning. Top-level errors (`E-DC-*`) are not introduced in MVP —
  the orchestrator either runs (and may produce `violation` rows) or
  fails the readiness check (which surfaces as a Stage-2-style
  blocked-by-validation state on the Run button, not as an
  `E-DC-*` issue on the result).
- `DutyCheckResult.metadata.solverName: "duty-check"` deliberately
  reuses the Stage 2 `SolverMetadata` shape but pins `solverName` to
  `"duty-check"` rather than `"pandapower"` so the retention store
  can distinguish runs.

---

## 6. Issue codes (Stage 3 — Equipment Duty additions)

| Code | Severity | Condition |
|---|---|---|
| `W-DC-001` | warning | Equipment rating field missing on a ratable element. Row emitted as `unavailable`; run does not block (ED-OQ-02). |
| `W-DC-002` | warning | Breaker interrupting duty computed from `Ik''` fallback rather than `Ib` (ED-OQ-03). Row labeled `verdictBasis: "provisional"`. |
| `W-DC-003` | warning | Thermal / cable-withstand duty computed using project-level default `faultClearingS` rather than per-zone protection clearing time (ED-OQ-03 / ED-OQ-04). Row labeled `verdictBasis: "provisional"`. |

No `E-DC-*` codes in MVP — see §5 note on `DutyCheckIssue.severity`.

Existing Stage 1 / Stage 2 / Stage 3 codes retain their meaning.
`E-SC-001..E-SC-006` and `W-SC-001..W-SC-003` (Stage 3 MVP, spec
§11) are unaffected by this revision.

---

## 7. Non-goals

For traceability and to constrain future Equipment Duty PRs, the
following are explicitly **not** delivered by this Equipment Duty
effort (any of ED-PR-01 through ED-PR-05). A scope expansion into any
of these requires a further spec revision PR.

- Cable Sizing engine (Stage 4 charter).
- Report Workflow / Excel / PDF (Stage 5 charter).
- Arc flash analysis.
- Breaker arc-impedance modeling.
- Breaker time-current curve verification (protection coordination).
- Per-zone protection clearing time (ED-FU-04 — until then, thermal
  and cable withstand rows are `provisional`).
- Motor short-circuit contribution (S3-FU-04).
- Generator subtransient contribution (S3-FU-03).
- Per-source contribution breakdown (S3-FU-05).
- ANSI / IEEE C37 basis (S3-FU-08).
- Per-equipment `tmin` override (ED-FU-05).
- Per-project tunable thresholds (ED-FU-01).
- Vendor-specific breaker rating split — `ICU` vs `ICS` (ED-FU-03).
- Per-assembly switchgear ratings distinct from busbar ratings
  (ED-FU-02).
- Disk persistence of duty-check runtime bundles (S3-FU-10 / Stage 2
  S2-FU-07 deferral inherited).
- Auto-recompute on project edit (Stage 2 stale-flag rule preserved
  unchanged).
- Per-fault-target sub-cases on the duty result (`subCase` stays
  `null`; ED-FU-07 if needed).
- Cable upstream/downstream end selection refinement (ED-FU-06).

---

## 8. Equipment Duty PR breakdown

This sequence supersedes plan §6.6's "PR #5A or later" placeholder
once this spec revision merges. PR numbers below are spec-relative
("ED-PR-01"..); the actual GitHub PR numbers are assigned as the
work lands.

### 8.1 ED-PR-01 — Stage 1 schema extension (schema-only)

**Purpose.** Add the optional rating fields defined in ED-OQ-01 +
ED-OQ-04 to the Stage 1 canonical schema, plus the project-level
`defaultFaultClearingS` field.

**In scope.**

- Edit `packages/schemas/src/stage_1_project_schema.rev_d.zod.ts`
  (or rename to `rev_d_1.zod.ts` if the policy bumps minor revisions
  via filename).
- Edit `packages/schemas/stage_1_project_file.rev_d.schema.json`
  (or `rev_d_1`).
- Update `packages/schemas/tests/canonical-drift.test.ts` to pin the
  new fields.
- Update `packages/project-io/tests/round-trip.test.ts` and
  `packages/project-io/tests/top-level-order.test.ts` so the new
  fields round-trip and the documented serialization order is
  preserved.
- Update demo fixtures in `packages/fixtures/**` only as needed to
  carry an example rating value; existing fixtures that omit ratings
  must continue to load (since fields are optional).

**Out of scope.** No runtime code consumes the fields yet. No
sidecar code. No UI. No `validateForDutyCheck()`. No retention
widening. No duty-check orchestrator. No acceptance manifest entry
for `AC-S3-D*` (lands in ED-PR-05).

**Acceptance graduation.** AC-S3-D01 is **mapped** by ED-PR-01.

### 8.2 ED-PR-02 — Duty Check contract types + result model

**Purpose.** Land the contract surface (TypeScript types only) for
the duty-check engine without implementing the orchestrator.

**In scope.**

- New package `packages/duty-check/`:
  - `src/types.ts` carrying the types in §5
    (`DutyCheckEquipmentKind`, `DutyCheckDutyKind`, `DutyCheckStatus`,
    `DutyCheckVerdictBasis`, `DutyCheckIssueCode`, `DutyCheckIssue`,
    `DutyCheckEquipmentResult`, `DutyCheckResultMetadataBasis`,
    `DutyCheckResult`, `DutyCheckOptions`, `DutyCheckRunBundle`).
  - `src/index.ts` re-exports.
- `packages/duty-check/tests/types.test.ts` covering structural
  guards.
- `packages/calculation-store/src/types.ts` widens
  `CalculationModule` to add `"duty_check_bundle"` and
  `RuntimeCalculationRecord.bundle` to the three-member union (this
  is the type-only surface; the reducer handler lands in ED-PR-03).
- `packages/calculation-store/tests/types.test.ts` (or similar) is
  extended to assert the union widening compiles.

**Out of scope.** No orchestrator. No `validateForDutyCheck()`.
No reducer slot for `"duty_check_bundle"`. No UI.

**Acceptance graduation.** None — AC-S3-D02..D08 are mapped by
ED-PR-03 / ED-PR-04.

### 8.3 ED-PR-03 — Orchestrator + readiness wrapper + retention slot

**Purpose.** Implement the duty-check engine over a
`ShortCircuitRunBundle` plus AppNetwork ratings, with retention.

**In scope.**

- `packages/duty-check/src/dutyCheckBasis.ts` — basis matrix per
  ED-OQ-03 (Ib derivation, peak comparison, thermal scaling).
- `packages/duty-check/src/cableWithstand.ts` — cable I²t per
  ED-OQ-04.
- `packages/duty-check/src/thresholds.ts` — threshold table per
  ED-OQ-05.
- `packages/duty-check/src/dutyCheckRunner.ts` —
  `runDutyCheckForBundle(bundle: ShortCircuitRunBundle, options?: DutyCheckOptions): DutyCheckRunBundle`.
- `packages/validation/src/calcReadiness.ts` — adds
  `validateForDutyCheck()` (or a sibling file). Required inputs:
  the upstream `ShortCircuitRunBundle` exists and is not stale.
  Missing ratings are **not** a readiness blocker (per ED-OQ-02);
  they surface as per-row `unavailable`.
- `packages/calculation-store/src/reducer.ts` — handles the
  `"duty_check_bundle"` retention slot.
- Tests:
  - `packages/duty-check/tests/dutyCheckRunner.test.ts`
  - `packages/duty-check/tests/dutyCheckBasis.test.ts`
  - `packages/duty-check/tests/cableWithstand.test.ts`
  - `packages/duty-check/tests/thresholds.test.ts`
  - `packages/duty-check/tests/missing-rating.test.ts`
  - `packages/calculation-store/tests/duty-check-retention.test.ts`
  - `packages/validation/tests/duty-check-readiness.test.ts`

**Out of scope.** No UI. No sidecar. No new project schema fields.
No `calculationResults`. No persistence. No fake numbers.

**Acceptance graduation.** AC-S3-D02..D07 mapped by ED-PR-03.

### 8.4 ED-PR-04 — UI

**Purpose.** Surface duty-check results in the app UI.

**In scope.**

- `apps/web/src/components/DutyCheckResultTable.tsx` — per-row table
  keyed by `equipmentInternalId`, columns per §5
  (`equipmentKind`, `dutyKind`, source bus tag, `dutyActualKa`,
  `ratingKa`, `utilizationPct`, status badge, basis badge).
- `apps/web/src/components/CalculationStatusPanel.tsx` extension —
  add the Duty Check module row, Run controls, and the
  `disabled_by_validation` tooltip path. Run is disabled when no
  Short Circuit bundle is in `retainedResults` (the upstream
  dependency is missing).
- `apps/web/src/state/calculationStore.ts` extension —
  `runDutyCheck()` action and a duty-check lifecycle slot. The
  active-slot asymmetry (spec §8.2.1) extends unchanged.
- Tests: `apps/web/tests/DutyCheckResultTable.test.tsx`,
  `apps/web/tests/calculationStore.dutyCheck.test.tsx`, extension
  to `apps/web/tests/CalculationStatusPanel.test.tsx`.

**Out of scope.** No diagram overlay (deferred — same pattern as
S3-FU-11). No report export. No fake numbers. No new schema
fields. No new sidecar command.

**Acceptance graduation.** AC-S3-D08 mapped by ED-PR-04.

### 8.5 ED-PR-05 — Equipment Duty acceptance closeout

**Purpose.** Close the Equipment Duty effort.

**In scope.**

- `scripts/acceptance-coverage.json` — adds the `stage3EquipmentDuty`
  block per ED-OQ-07.
- `scripts/check-acceptance.ts` — extends with
  `stage3EquipmentDutyExpected` array.
- New file:
  `docs/stage-3/stage_3_equipment_duty_acceptance_closeout.md`
  (parallel to `stage_3_acceptance_closeout.md`).
- Documentation closeout in this spec revision (Rev A.1+ revision
  note).

**Out of scope.** No new feature implementation. No scope
expansion. Carryovers (per-zone clearing time, vendor split, motor /
generator subtransient, etc.) recorded explicitly per the §7
non-goals list.

**Mandatory check matrix (recorded as closeout artifacts).**

- `pnpm typecheck`
- `pnpm test`
- `pnpm check:fixtures`
- `pnpm check:acceptance`
- `pnpm --filter web build`

**Acceptance graduation.** AC-S3-D09 mapped by ED-PR-05; AC-S3-D01..D08
recorded as `mapped` with concrete owners filled in from ED-PR-01..04.

---

## 9. Carryover and follow-ups

Items recorded for traceability — none required for any
Equipment Duty PR to ship:

- **ED-FU-01** — Per-project tunable `ok` / `warning` / `violation`
  thresholds. MVP pins 90% / 100%.
- **ED-FU-02** — Per-assembly switchgear ratings distinct from busbar
  ratings.
- **ED-FU-03** — Vendor-specific breaker rating split (`ICU` vs `ICS`).
- **ED-FU-04** — Per-zone protection clearing time replacing the
  project-level `faultClearingS` default. Until then, thermal and
  cable-withstand rows are `provisional`.
- **ED-FU-05** — Per-equipment `tmin` override for `Ib` derivation.
- **ED-FU-06** — Cable upstream / downstream end selection refinement
  (currently fixed to downstream-end bus).
- **ED-FU-07** — Per-fault-target sub-cases on the duty result.
- **ED-FU-08** — Diagram overlay for duty status (parallels Short
  Circuit S3-FU-11).
- **ED-FU-09** — Equipment Duty Golden Cases (parallels S3-FU-09).
  Required before any duty-check row may carry `verdictBasis:
  "verified"` for a release-gate pass.

---

## 10. Guardrails (restated for Equipment Duty PRs)

Every Equipment Duty PR (ED-PR-01 through ED-PR-05) must preserve:

- The Stage 1 canonical project schema is unchanged **except** for
  the optional rating fields defined in ED-OQ-01 / ED-OQ-04, added
  exclusively in ED-PR-01. No other field changes.
- `calculationResults` is **not** introduced into the canonical
  schema in any Equipment Duty PR.
- `calculationSnapshots` remains an empty array on the project file
  in every Equipment Duty PR.
- Runtime snapshots and result bundles remain in memory only. No
  disk persistence (Stage 2 §S2-FU-07 / spec §S3-OQ-09 inherited).
- Duty check results are **never** fabricated. Failed runs / missing
  ratings surface `W-DC-*` codes and `unavailable` rows; numeric
  fields are `null` rather than zero.
- AppNetwork remains solver-agnostic. No pandapower types leak.
  Duty check is pure TypeScript over an already-normalized
  `ShortCircuitResult`; no new sidecar command is created.
- The Stage 2 stale-flag rule is preserved unchanged. Project edits
  do **not** auto-recompute duty check.
- The Stage 3 active-slot lifecycle asymmetry (spec §8.2.1) extends
  unchanged. Duty-check successes live in
  `retainedResults["duty_check_bundle"]`; they do not displace the
  LF-narrow active slot.
- Equipment Duty PRs do **not** introduce Cable Sizing scope, Report
  Workflow scope, or arc-flash scope.
- All codes are app-level (`W-DC-*`); pandapower exception names
  never appear in the public `packages/duty-check` surface.

---

## 11. Spec / plan / closeout synchronization

This document amends the merged Stage 3 spec by closing S3-FU-12's
pre-implementation OQs. The relationship to existing Stage 3 docs:

- `stage_3_short_circuit_mvp_spec.md` §15 / S3-FU-12 ("Equipment Duty
  Check … Out of MVP scope") is **superseded by §3–§9 of this
  document** for the purpose of unblocking implementation. The Short
  Circuit MVP spec itself remains the authoritative source for the
  Short Circuit MVP scope; this revision adds Equipment Duty as a
  follow-on stage scope, not as a Short Circuit MVP addition.
- `stage_3_short_circuit_equipment_duty_implementation_plan.md`
  §6.6 ("PR #5A or later — Equipment Duty Check (Gated Follow-Up)")
  and §8 ("Equipment Duty Pre-Implementation OQ Gate") are
  **closed by §3 + §8 of this document the moment this spec revision
  merges**. The plan file itself is not edited by this PR. A
  recommended documentation synchronization follow-up may rewrite
  plan §6.6 to point at §8 of this document and mark the plan §8
  gate items as closed, but that follow-up is **explicitly not a
  prerequisite** for ED-PR-01 — the operating model makes this spec
  revision the canonical source, so the plan-edit follow-up may land
  before, alongside, or after ED-PR-01 (or never, if a future spec
  revision restructures the plan instead) without affecting Equipment
  Duty code-work readiness.
- `stage_3_acceptance_closeout.md` §4.2 ("Equipment Duty Check
  (S3-FU-12) … Status: gated follow-up") is **superseded by §3 + §8
  of this document**. The closeout is not edited by this PR; the
  Equipment Duty acceptance closeout (ED-PR-05) ships its own
  closeout document (`stage_3_equipment_duty_acceptance_closeout.md`)
  and may add a forward pointer back to that file from §4.2 of the
  Short Circuit closeout in a documentation-only follow-up.

The acceptance manifest (`scripts/acceptance-coverage.json`) and
checker (`scripts/check-acceptance.ts`) are **not** modified by this
PR. Equipment Duty AC entries (`AC-S3-D01..D09`) land at ED-PR-05,
mirroring how `AC-S3-01..07` landed at Stage 3 closeout PR #6.

---

## 12. Revision notes

| Revision | Date | Description |
|---|---|---|
| Rev A | 2026-05-04 | Initial Equipment Duty spec revision. Closes ED-OQ-01 through ED-OQ-08 (the plan §8 pre-implementation OQ gate plus the explicit non-goal boundary). Defines the `DutyCheckResult` model, the duty-basis matrix, the threshold table, the missing-rating policy, the runtime-only retention shape, the `W-DC-001..003` codes, the `AC-S3-D01..D09` template, and the canonical Equipment Duty PR breakdown (ED-PR-01..05) that supersedes plan §6.6's "PR #5A or later" placeholder. Spec-only PR. No code, schema, sidecar, runtime, UI, fixture, or acceptance-manifest changes. |
