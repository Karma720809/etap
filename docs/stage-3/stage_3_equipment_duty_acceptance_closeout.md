# Stage 3 Equipment Duty Acceptance Closeout

**Project:** Power System Study App
**Stage:** Stage 3 — Equipment Duty (gated follow-up to the Short Circuit MVP)
**PR:** Stage 3 ED-PR-05 (Equipment Duty acceptance closeout — this document)
**Branch:** `stage-3/ed-pr-05-duty-acceptance-closeout`
**Status:** Documentation closeout + two carryover UI tests. No runtime, calculation, schema, sidecar, fixture, project-IO, or store-architecture change. No acceptance manifest or `scripts/check-acceptance.ts` edit.
**Date:** 2026-05-11

This document is the Equipment Duty acceptance closeout record for the
ED-PR-01..04 implementation sequence. It maps each merged PR to the
Equipment Duty spec, summarizes what is now implemented at HEAD, and
separates completed acceptance items from deferred / gated follow-ups
and non-blocking backlog. It does **not** revise the Equipment Duty
spec, the Short Circuit MVP spec, the implementation plan, or the
Stage 3 acceptance closeout. It does **not** modify
`scripts/acceptance-coverage.json` or `scripts/check-acceptance.ts`.

---

## 1. Reading order

This closeout depends on, and does not restate, the merged Stage 3
documents:

- `docs/stage-3/stage_3_short_circuit_mvp_spec.md` — Stage 3 Short
  Circuit MVP spec.
- `docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md`
  — Stage 3 implementation plan.
- `docs/stage-3/stage_3_acceptance_closeout.md` — Stage 3 Short
  Circuit MVP acceptance closeout (PR #6). §4.2 records Equipment
  Duty Check as a gated follow-up.
- `docs/stage-3/stage_3_equipment_duty_spec.md` — Equipment Duty spec
  revision (PR #8 / Rev A). Closes the plan §8 pre-implementation OQ
  gate, defines the `DutyCheckResult` model, the duty-basis matrix,
  the threshold table, the `W-DC-001..003` issue codes, the
  `AC-S3-D01..D09` acceptance template, and the canonical Equipment
  Duty PR breakdown (ED-PR-01..05) that supersedes plan §6.6.

Whenever this document refers to spec sections (e.g., §4.6, §8) it
refers to sections in `stage_3_equipment_duty_spec.md`. Whenever it
refers to plan sections (e.g., plan §6.6, plan §8) it refers to
sections in `stage_3_short_circuit_equipment_duty_implementation_plan.md`.

---

## 2. Equipment Duty PR ledger (ED-PR-01 → ED-PR-04)

The Equipment Duty implementation sequence followed the spec §8
breakdown. GitHub PR numbers below are the actual numbers under this
repository; the spec-relative `ED-PR-NN` labels are the canonical
identifiers from `stage_3_equipment_duty_spec.md` §8.

| GitHub PR | ED label | Title / scope shipped | Boundary notes |
|---|---|---|---|
| #20 | ED-PR-01 | Stage 1 schema extension — added the optional rating fields defined in spec §4.1 / §4.4 to `packages/schemas/src/stage_1_project_schema.rev_d.zod.ts` and `packages/schemas/stage_1_project_file.rev_d.schema.json` (breaker `interruptingCapacityKa` / `peakWithstandKa`; switch `shortTimeWithstandKa` / `shortTimeWithstandDurationS` / `peakWithstandKa`; bus `shortTimeWithstandKa` / `shortTimeWithstandDurationS` / `peakWithstandKa`; cable `shortCircuitKValue`; project-level `defaultFaultClearingS`). Updated `packages/schemas/tests/canonical-drift.test.ts`, added `packages/schemas/tests/equipment-duty-fields.test.ts` and `packages/project-io/tests/equipment-duty-round-trip.test.ts`. | **Schema-only.** Every new field is optional; pre-existing project files round-trip unchanged. No runtime code consumes the fields. No sidecar. No UI. No retention widening. |
| #21 | ED-PR-02 | Duty Check contract types + result model — new package `packages/duty-check/` carrying `src/types.ts` (`DutyCheckEquipmentKind`, `DutyCheckDutyKind`, `DutyCheckStatus`, `DutyCheckVerdictBasis`, `DutyCheckIssue`, `DutyCheckIssueCode`, `DutyCheckEquipmentResult`, `DutyCheckResultMetadataBasis`, `DutyCheckResult`, `DutyCheckOptions`, `DutyCheckRunBundle`, status / kind enums, `DutyCheckCriterion`), `src/index.ts` re-exports, and `tests/types.test.ts` covering structural guards. | **Contract / wire types only.** No orchestrator. No readiness wrapper. No reducer change. No retention slot. No UI. No fake numbers — every numeric field is typed `number \| null` and producers are not yet wired. |
| #22 | ED-PR-03 | Orchestrator + readiness wrapper + retention slot — `packages/duty-check/src/runner.ts` (`runDutyCheckForBundle(shortCircuit, options?)`), `packages/duty-check/src/readiness.ts` (`evaluateDutyCheckReadiness`), `packages/calculation-store/src/types.ts` widening `CalculationModule` to add `"duty_check_bundle"` and `RuntimeCalculationRecord.bundle` to `LoadFlowRunBundle \| ShortCircuitRunBundle \| DutyCheckRunBundle`, `packages/calculation-store/src/reducer.ts` retention slot, `packages/calculation-store/src/retention.ts` key extension, `packages/calculation-store/tests/duty-check-retention.test.ts`, `packages/duty-check/tests/runner.test.ts`, `packages/duty-check/tests/readiness.test.ts`, `packages/duty-check/tests/test-builders.ts`. Follow-up commit (`8293ae6`) tightens the readiness wrapper's project-validation probe (separate messages for `blocked_by_validation` / `not_evaluated` / `invalid` network-build) and pins peak-rating row emission so a missing `peakWithstandKa` surfaces as `missing_rating` rather than being silently dropped. | **Orchestrator at the contract / wiring level.** The runner emits per-equipment rows whose `status` is one of `not_evaluated` (`I-DC-002`), `missing_rating` (`W-DC-001`), or `not_applicable` (`I-DC-001`). Every numeric `dutyKa` / `ratingKa` / `utilizationPct` / `marginPct` stays `null`. **No real engineering calculation is performed.** When the upstream SC bundle is `failed`, the duty bundle returns a `failed` result with no rows. No sidecar dispatcher. No UI. No project-file persistence. |
| #23 | ED-PR-04 | Equipment Duty UI — `apps/web/src/components/DutyCheckResultTable.tsx` (per-row table keyed by `equipmentInternalId` with status / duty / rating / util / margin / issues columns; numeric cells render `—` for `null`, never `0`); `apps/web/src/components/CalculationStatusPanel.tsx` extension (Duty Check module row, Run Equipment Duty button, `dutyCheckDisabledReason` chip, `calc-dc-stale-badge`, duty-check issues panel); `apps/web/src/state/calculationStore.ts` extension (`runDutyCheck()` action, React-side `DutyCheckState` lifecycle slot, `dutyCheckReadiness` memo wired to the ED-PR-03 readiness wrapper, parallel stale flag); `apps/web/tests/DutyCheckUI.test.tsx`. | **UI wiring only.** Renders rows produced by the ED-PR-03 contract surface. Numeric cells render as `—` because the orchestrator emits all-null numerics by design. The Run button is gated by the ED-PR-03 readiness wrapper for the four states `ready_to_run` / `blocked_by_upstream` / `blocked_by_stale_upstream` / `blocked_by_validation`. The project file is **not** mutated by a Duty Check run; `calculationSnapshots` stays empty and `calculationResults` is not added. |

ED-PR-05 (this PR, branch `stage-3/ed-pr-05-duty-acceptance-closeout`)
ships only this closeout document and two focused UI tests that pin
the stale-upstream and failed-upstream `dutyCheckDisabledReason` paths
already wired in ED-PR-04 (PR #23 Codex non-blocking carryover — see
§5.1). No runtime, calculation, schema, sidecar, fixture, project-IO,
store-architecture, or acceptance-manifest edit.

---

## 3. What is implemented at HEAD (post-ED-PR-04)

The Equipment Duty surface that exists on `main` after PRs #20–#23
merge:

### 3.1 Schema (ED-PR-01)

- Optional rating fields on the Stage 1 canonical schema:
  - `Breaker.interruptingCapacityKa`, `Breaker.peakWithstandKa`.
  - `Switch.shortTimeWithstandKa`, `Switch.shortTimeWithstandDurationS`, `Switch.peakWithstandKa`.
  - `Bus.shortTimeWithstandKa`, `Bus.shortTimeWithstandDurationS`, `Bus.peakWithstandKa`.
  - `Cable.shortCircuitKValue`.
  - Project-level `defaultFaultClearingS` on `ProjectMetadata.shortCircuit`.
- All fields are optional; pre-existing project files validate and
  round-trip unchanged (`packages/project-io/tests/equipment-duty-round-trip.test.ts`).
- The canonical-drift test is updated to pin the new fields.
- No schema field is required; no field is migrated.

### 3.2 Contract / result model (ED-PR-02)

- Package `@power-system-study/duty-check` exports the result-model
  types: `DutyCheckEquipmentKind`, `DutyCheckDutyKind`,
  `DutyCheckStatus`, `DutyCheckVerdictBasis`, `DutyCheckIssueCode`,
  `DutyCheckIssue`, `DutyCheckEquipmentResult`,
  `DutyCheckResultMetadataBasis`, `DutyCheckResult`,
  `DutyCheckOptions`, `DutyCheckRunBundle`, `DutyCheckCriterion`,
  `DutyCheckRunStatus`.
- Every numeric duty / rating / utilization / margin field on
  `DutyCheckEquipmentResult` is typed `number \| null`. The contract
  surface admits a real engineering calculation in a follow-up PR
  without producer-side breakage, but no real calculation has shipped
  yet (see §4).

### 3.3 Readiness wrapper + orchestrator + retention (ED-PR-03)

- `evaluateDutyCheckReadiness({ shortCircuit, shortCircuitStale, projectValidation })`
  in `packages/duty-check/src/readiness.ts` is a pure function that
  returns one of four `status` values: `ready_to_run`,
  `blocked_by_upstream`, `blocked_by_stale_upstream`,
  `blocked_by_validation`. Each blocked status carries a structured
  `I-DC-002` info-level issue with the user-facing reason.
- `runDutyCheckForBundle(shortCircuit, options?)` in
  `packages/duty-check/src/runner.ts` consumes a
  `ShortCircuitRunBundle` plus an optional Stage 1 project file and
  emits a `DutyCheckRunBundle`. It enumerates per-equipment rows from
  the project file's rating fields:
  - `not_applicable` (`I-DC-001`) for criteria that do not apply to an
    equipment kind.
  - `missing_rating` (`W-DC-001`) when the rating field is absent on a
    ratable element.
  - `not_evaluated` (`I-DC-002`) for the remaining rows. **Every
    numeric `dutyKa` / `ratingKa` / `utilizationPct` / `marginPct`
    field is `null`.**
  - When the upstream `ShortCircuitResult.status === "failed"`, the
    duty bundle returns a `failed` `DutyCheckResult` with no rows and
    a single info-level upstream-failure note. No row fabrication.
- `packages/calculation-store/src/types.ts` widens `CalculationModule`
  to `"load_flow_bundle" | "short_circuit_bundle" | "duty_check_bundle"`
  and `RuntimeCalculationRecord.bundle` to
  `LoadFlowRunBundle | ShortCircuitRunBundle | DutyCheckRunBundle`.
- `packages/calculation-store/src/reducer.ts` retains the duty bundle
  under the `(scenarioId, "duty_check_bundle", null)` key. Stale flag
  flips on project edit (no auto-recompute). The LF-narrow active
  slot asymmetry (Stage 3 spec §8.2.1) is preserved unchanged —
  duty-check successes live in `retainedResults["duty_check_bundle"]`
  and do not displace `state.bundle`.

### 3.4 UI (ED-PR-04)

- `apps/web/src/components/DutyCheckResultTable.tsx` renders the
  per-equipment rows. Every numeric cell renders `—` (em dash) for a
  `null` value — never `0`.
- `apps/web/src/components/CalculationStatusPanel.tsx` adds the Duty
  Check module row, a Run Equipment Duty button, the
  `dutyCheckDisabledReason` text chip (test id
  `calc-dc-disabled-reason`), a duty-stale badge (test id
  `calc-dc-stale-badge`), and a duty-check issues notice.
- `apps/web/src/state/calculationStore.ts` exposes a `runDutyCheck()`
  action and a React-side `DutyCheckState` lifecycle slot. The Run
  button is gated on the ED-PR-03 readiness wrapper's result:
  - `ready_to_run` → Run enabled.
  - `blocked_by_upstream` (no SC bundle, or SC bundle present with
    `shortCircuit.status === "failed"`) → Run disabled, reason
    surfaces the missing-or-failed-upstream message; module status
    cell renders `blocked_by_upstream`.
  - `blocked_by_stale_upstream` (SC bundle present but the React-side
    `shortCircuit.lifecycle === "stale"`) → Run disabled, reason
    surfaces the stale-upstream message; module status cell renders
    `blocked_by_upstream` (the panel intentionally collapses the two
    upstream-blocked enum values into a single visible module status
    — the precise reason is carried in `calc-dc-disabled-reason`).
  - `blocked_by_validation` → Run disabled, module status cell
    renders `disabled_by_validation`.
- A successful Duty Check run does **not** mutate the project file;
  `apps/web/tests/DutyCheckUI.test.tsx` pins
  `serializeProjectFile(project)` before and after a run as
  byte-identical.

### 3.5 Runtime-only retention; no project-file persistence

- `calculationSnapshots` on `PowerSystemProjectFile` remains pinned to
  `max(0)` by `packages/schemas/src/stage_1_project_schema.rev_d.zod.ts`.
  No Equipment Duty PR populates the array.
- `calculationResults` is **not** introduced. No PR in the ED-PR-01..04
  sequence adds it to the canonical schema or to the serialized JSON.
- Runtime snapshots and result bundles live only in
  `@power-system-study/calculation-store`. No disk persistence is
  written or read for Equipment Duty.

---

## 4. Current limitations (explicit, not silently elided)

This is the **boundary of what shipped**. Read this section before
treating any Equipment Duty output as engineering-quality.

1. **No real Equipment Duty engineering calculation has shipped.**
   `runDutyCheckForBundle()` is a contract / wiring orchestrator. It
   does **not** compute breaker interrupting duty (`Ib` per IEC 60909-0
   §4.5), peak duty (`ip`), thermal withstand (`Ith`), or cable I²t.
   No duty-basis matrix entry from spec §4.3 is yet realized in code.
2. **No pass / fail / warning duty evaluation has shipped.** The
   90% / 100% / >100% threshold table from spec §4.5 is documented but
   not implemented. The orchestrator does not emit `pass`, `fail`, or
   `warning` rows — only `not_evaluated` / `missing_rating` /
   `not_applicable`.
3. **No real breaker / switch / bus / cable duty formula has shipped.**
   The ED-PR-03 orchestrator inspects rating fields to decide
   `missing_rating` vs `not_applicable` vs `not_evaluated`, but it
   does **not** compute or compare any duty against any rating. The
   `peakWithstandKa` row emission tightened in commit `8293ae6`
   guarantees a `missing_rating` row when peak rating is absent; it
   does not introduce a peak-duty calculation.
4. **All numeric duty / rating / utilization / margin fields remain
   `null` unless and until a future PR formally adds a real
   calculation.** Every `DutyCheckEquipmentResult` produced today has
   `dutyKa = null`, `ratingKa = null`, `utilizationPct = null`,
   `marginPct = null`. The UI renders these as `—`. No row carries a
   fabricated `0`.
5. **Emitted rows remain `not_evaluated` / `missing_rating` /
   `not_applicable` only.** The `pass` / `fail` / `warning` literals
   exist in the type vocabulary (`DutyCheckStatus`) because the
   contract was designed forward to a future calculation PR, but the
   orchestrator does not emit them.
6. **`verdictBasis` is `provisional` for every emitted row.** The
   `verified` literal in the contract is reserved for the future
   real-calculation rows. No row at HEAD claims algorithmic
   verification.
7. **No Equipment Duty Golden Cases exist.** ED-FU-09 in spec §9
   records this as a release-quality follow-up. No `GC-DC-*` artifact
   has been authored.
8. **No project-file persistence of Duty Check results.** All
   retention is runtime / in-memory only.

The acceptance manifest (`scripts/acceptance-coverage.json`) is **not
extended** by this closeout PR. Per the closeout brief and spec §1.3 /
§4.7, the `stage3EquipmentDuty` block is intentionally deferred until
either (a) the real engineering calculation lands or (b) the project
chooses to record the contract-level scaffolding owners as
`mapped`-with-caveat in a separate spec-revision PR. This closeout
PR is documentation + carryover tests only; it does not pre-empt that
decision.

---

## 5. Acceptance items — completed / deferred / backlog

This section is the operational summary. It does **not** edit the
acceptance manifest (per closeout-PR scope). The `AC-S3-D01..D09`
slots remain unowned in `scripts/acceptance-coverage.json` until a
future PR explicitly fills them.

### 5.1 Completed acceptance items (ED-PR-01..04)

These items are demonstrably implemented at HEAD and covered by the
tests that landed alongside the relevant PR. They do **not** include
acceptance items that require a real engineering calculation.

| Item | Where it landed | Where it is exercised |
|---|---|---|
| Optional schema fields (AC-S3-D01 partial — schema only) | ED-PR-01 (PR #20) | `packages/schemas/tests/equipment-duty-fields.test.ts`, `packages/schemas/tests/canonical-drift.test.ts`, `packages/project-io/tests/equipment-duty-round-trip.test.ts` |
| Result-model contract types | ED-PR-02 (PR #21) | `packages/duty-check/tests/types.test.ts` |
| `CalculationModule` widening + retention slot | ED-PR-03 (PR #22) | `packages/calculation-store/tests/duty-check-retention.test.ts`, retention key extension in `packages/calculation-store/src/retention.ts` |
| Orchestrator emits `not_evaluated` / `missing_rating` / `not_applicable` rows with all-null numerics | ED-PR-03 (PR #22) + tightening commit `8293ae6` | `packages/duty-check/tests/runner.test.ts` |
| Readiness wrapper four-state contract (`ready_to_run` / `blocked_by_upstream` / `blocked_by_stale_upstream` / `blocked_by_validation`) | ED-PR-03 (PR #22) + tightening commit `8293ae6` | `packages/duty-check/tests/readiness.test.ts` |
| Missing-rating policy: row emitted, run not blocked, top-level result not failed | ED-PR-03 (PR #22) | `packages/duty-check/tests/runner.test.ts`, `packages/duty-check/tests/readiness.test.ts` (peak-rating row regression pinned in `8293ae6`) |
| Upstream-failed SC → empty rows, info-level top-level issue, `status: "failed"` | ED-PR-03 (PR #22) | `packages/duty-check/tests/runner.test.ts` |
| UI gating: Run Equipment Duty disabled in `blocked_by_upstream` (no SC) and `blocked_by_validation` (validation errors); enabled in `ready_to_run` | ED-PR-04 (PR #23) | `apps/web/tests/DutyCheckUI.test.tsx` |
| UI numeric rendering: every duty / rating / utilization / margin cell renders `—`, never `0` | ED-PR-04 (PR #23) | `apps/web/tests/DutyCheckUI.test.tsx` |
| Project file unchanged after a Duty Check run (`calculationSnapshots` empty, `calculationResults` absent, byte-identical serialization) | ED-PR-04 (PR #23) | `apps/web/tests/DutyCheckUI.test.tsx` |
| **UI gating: Run Equipment Duty disabled in `blocked_by_stale_upstream` (stale SC bundle); reason surfaces stale message** | ED-PR-05 (this PR, carryover) | `apps/web/tests/DutyCheckUI.test.tsx` — closes PR #23 Codex non-blocking review carryover item 1 |
| **UI gating: Run Equipment Duty disabled when the upstream SC bundle exists but its `shortCircuit.status === "failed"`; reason surfaces upstream-failed message** | ED-PR-05 (this PR, carryover) | `apps/web/tests/DutyCheckUI.test.tsx` — closes PR #23 Codex non-blocking review carryover item 2 |

### 5.2 Deferred / gated follow-ups (spec-revision-gated before code)

Each item below is **not** delivered by ED-PR-01..04 and is **not**
required for this closeout. Each is recorded with the spec section
that documents its deferral. None of these may land without an
explicit spec revision or follow-up PR.

- **Real breaker interrupting-duty calculation (`Ib` at `tmin = 0.05 s`
  with `Ik''` fallback).** Spec §4.3 / `W-DC-002`. Not started.
- **Real breaker peak-making duty calculation (`ip` vs
  `peakWithstandKa`).** Spec §4.3.
- **Real switch / busbar short-time withstand calculation (`Ith` vs
  rated `Ith` scaled to `t_rated`).** Spec §4.3.
- **Real cable thermal withstand calculation (`I²t_actual` vs
  `I²t_allowed = (K × A)²`).** Spec §4.4 / `W-DC-003`.
- **Threshold table (`ok` ≤ 90% / `warning` > 90% & ≤ 100% /
  `violation` > 100%).** Spec §4.5. Not implemented.
- **`pass` / `fail` / `warning` row emission with `verdictBasis:
  "verified"`.** Blocked on the calculations above. The contract
  vocabulary exists today; the producer does not emit those literals.
- **`AC-S3-D01..D09` acceptance manifest entries
  (`stage3EquipmentDuty` block in `scripts/acceptance-coverage.json`).**
  Spec §4.7. Not added in this PR. The closeout-PR brief leaves the
  manifest unchanged because the Equipment Duty engineering
  calculation has not shipped and the AC owners would otherwise pin
  contract-level scaffolding as the verifying owner. A future PR may
  add the block — with or without a `deferred-*` marker per the spec
  §11 reconciliation policy — when either (a) the real calculation
  ships or (b) the project explicitly decides that contract-level
  ownership is acceptable.
- **ED-PR-05 documentation closeout in the Equipment Duty spec
  itself (Rev A.1+ revision note).** Recommended by spec §8.5; this
  PR ships the standalone closeout document and leaves
  `stage_3_equipment_duty_spec.md` untouched to keep the spec stable
  for downstream readers. A future documentation-only follow-up may
  add a forward pointer.

### 5.3 Non-blocking backlog (no spec change required)

The items below are explicit non-goals or future-refinement bullets
from spec §7 and §9. They are listed here for traceability only;
none is required for any Equipment Duty PR shipped to date.

- **ED-FU-01** Per-project tunable `ok` / `warning` / `violation`
  thresholds. MVP pins 90% / 100%.
- **ED-FU-02** Per-assembly switchgear ratings distinct from busbar
  ratings.
- **ED-FU-03** Vendor-specific breaker rating split (`ICU` vs `ICS`).
- **ED-FU-04** Per-zone protection clearing time replacing the
  project-level `defaultFaultClearingS`. Until then, the future
  thermal and cable-withstand rows are designed to be `provisional`.
- **ED-FU-05** Per-equipment `tmin` override for `Ib` derivation.
- **ED-FU-06** Cable upstream / downstream end selection refinement.
- **ED-FU-07** Per-fault-target sub-cases on the duty result
  (`subCase` stays `null` for MVP).
- **ED-FU-08** Diagram overlay for duty status (parallels Short
  Circuit S3-FU-11).
- **ED-FU-09** Equipment Duty Golden Cases (parallels S3-FU-09). Spec
  §9 documents this as a release-gate caveat — even when the real
  calculation ships and rows graduate to `verdictBasis: "verified"`,
  that label means *algorithmically* verified against the spec basis
  matrix, not release-gate-verified against an independent reference.
  See §6 for the Golden Case terminology guardrail this closeout
  preserves.

The non-blocking items also include the **two UI tests for stale and
failed SC upstream disabled reasons** that PR #23's Codex review
flagged as non-blocking. Per the closeout brief, this PR closes that
carryover by adding both tests — see §5.1 entries marked "carryover".

---

## 6. Golden Case terminology guardrail

Equipment Duty must not be claimed as a verified Golden Case at any
point in the ED-PR-01..05 sequence. Concretely, this closeout PR:

- Does **not** introduce any `GC-DC-*` Golden Case identifier.
- Does **not** add a `stage3EquipmentDutyGoldenCases` block to
  `scripts/acceptance-coverage.json`.
- Does **not** promote any Short Circuit Golden Case from
  `provisional` to `verified`. The Stage 3 Short Circuit Golden Case
  integration status for **GC-SC-01** in
  `scripts/acceptance-coverage.json` `stage3GoldenCases[]` remains
  `provisional` per the Stage 3 closeout §4.1 — unchanged by this PR.
  Promotion to `verified` still requires both S3-OQ-08 voltage-factor
  alignment and the Layer 3 strict sidecar comparison passing within
  the documented ±1% / ±2% tolerance.
- Does **not** modify
  `packages/fixtures/src/golden_cases/gc_sc_01.node.ts`,
  `packages/fixtures/tests/golden-case-gc-sc-01.test.ts`, or
  `packages/solver-adapter/tests/shortCircuit.goldenCaseGcSc01.test.ts`.

The Equipment Duty `verdictBasis: "verified"` literal in the ED-PR-02
contract is reserved for the future real-calculation path and means
**algorithmically verified against the spec basis matrix** (spec §9
ED-FU-09). It is not the same as a release-gate-verified Golden Case,
and ED-PR-01..04 do not emit any row that carries that label.

---

## 7. Runtime / project-file separation (attestation)

Equipment Duty PRs ED-PR-01 through ED-PR-04 preserve every Stage 1 /
Stage 2 / Stage 3 guardrail recorded in Equipment Duty spec §10.
Concretely, at HEAD:

- The canonical Stage 1 project schema is unchanged except for the
  optional rating fields added in ED-PR-01. No required field was
  added; no field was renamed or removed. `calculationSnapshots`
  remains pinned to `max(0)` and is empty in every fixture.
- `calculationResults` is **not** introduced. No serialized project
  file grows that key.
- Duty Check results live exclusively in
  `@power-system-study/calculation-store` runtime retention under
  the `duty_check_bundle::<scenarioId>::<subCase>` key. They are
  **not** persisted to disk.
- The Stage 2 stale-flag rule extends unchanged to Equipment Duty.
  A project edit flips the retained duty record's `stale` flag and
  the React-side `dutyCheck.lifecycle` to `"stale"`. There is no
  auto-recompute.
- AppNetwork remains solver-agnostic. No pandapower types leak into
  `@power-system-study/duty-check`. Equipment Duty is pure
  TypeScript over an already-normalized `ShortCircuitRunBundle` plus
  the Stage 1 project file's rating fields; no new sidecar command
  was added and no Python module under `services/solver-sidecar/`
  was changed.
- The active-slot lifecycle asymmetry (Stage 3 spec §8.2.1) extends
  unchanged. Duty-check successes live in
  `retainedResults["duty_check_bundle"]`; they do not displace the
  LF-narrow active slot (`state.bundle`).
- All Equipment Duty codes are app-level (`W-DC-001`, `W-DC-002`,
  `W-DC-003`, `I-DC-001`, `I-DC-002`). No pandapower exception name
  appears on the `packages/duty-check` public surface.
- The Load Flow / Voltage Drop runtime behavior is unchanged across
  ED-PR-01..04.
- The Short Circuit calculation behavior is unchanged across
  ED-PR-01..04. No Stage 3 Short Circuit MVP code path or test was
  modified.
- No Cable Sizing scope is introduced. No Report Workflow scope is
  introduced. No arc-flash scope is introduced.

---

## 8. Files changed by this closeout PR (ED-PR-05)

- `docs/stage-3/stage_3_equipment_duty_acceptance_closeout.md` —
  this document (new).
- `apps/web/tests/DutyCheckUI.test.tsx` — adds two focused UI tests
  closing PR #23 Codex non-blocking carryover (stale SC and failed SC
  upstream disabled reasons). Tests-only; no UI behavior change.

No other file is modified. Specifically:

- `scripts/acceptance-coverage.json` is **not** edited.
- `scripts/check-acceptance.ts` is **not** edited.
- `packages/schemas/**`, `packages/duty-check/**`,
  `packages/calculation-store/**`, `packages/solver-adapter/**`,
  `packages/network-model/**`, `packages/project-io/**`,
  `packages/validation/**`, `packages/fixtures/**`,
  `services/solver-sidecar/**`, and `apps/web/src/**` are **not**
  edited.
- The Stage 3 Short Circuit MVP spec, implementation plan, Short
  Circuit acceptance closeout, and Equipment Duty spec revision are
  **not** edited.

---

## 9. Mandatory check matrix

The Equipment Duty spec §8.5 records the full check matrix expected
on an Equipment Duty closeout PR. This document records which were
executed locally on this PR's edits and which are left for the merge
gate per the same convention used by the Stage 3 Short Circuit MVP
closeout (PR #6).

| Command | Status for this PR | Notes |
|---|---|---|
| `pnpm typecheck` | run locally | Verifies the new test file compiles. |
| `pnpm check:acceptance` | run locally | Verifies the existing manifest still passes after a docs-only PR with two added UI tests (no manifest extension shipped). |
| `git diff --check` | run locally | Whitespace / merge-marker hygiene on the doc + test edits. |
| `pnpm --filter @power-system-study/web test` | run locally | Runs the extended `DutyCheckUI.test.tsx` to confirm both carryover tests pass. |
| `pnpm test` | **not run** in this PR | Docs + tests-only edit to `apps/web/`. The Equipment Duty package tests, schema tests, calculation-store tests, and solver-adapter tests are unaffected by this PR. The merge gate may rerun the full suite. |
| `pnpm check:fixtures` | **not run** in this PR | No fixture or schema change. |
| `pnpm --filter web build` | **not run** in this PR | No production-build code change. |

Commands marked **not run** are explicitly **not** claimed to have
passed in this PR. The PR description (or the merge gate) records
their result before merge.

---

## 10. Closeout summary

- **Completed (Equipment Duty MVP scaffolding, ED-PR-01..04):**
  optional schema rating fields; result-model contract types;
  readiness wrapper + orchestrator at the contract / wiring level;
  retention slot for `duty_check_bundle`; UI wiring with the
  four-state readiness gate; runtime-only retention; project file
  byte-identical before and after a Duty Check run.
- **Closed in this PR (ED-PR-05):** standalone Equipment Duty
  acceptance closeout document; two UI tests pinning the
  stale-upstream and failed-upstream `dutyCheckDisabledReason` paths
  (PR #23 Codex non-blocking carryover).
- **Explicit current limitation:** no real Equipment Duty
  engineering calculation has shipped. No pass / fail / warning duty
  evaluation. No real breaker / switch / bus / cable duty formula.
  Emitted rows remain `not_evaluated` / `missing_rating` /
  `not_applicable`. Numeric duty / rating / utilization / margin
  fields remain `null`. The UI renders `—` for every numeric cell.
- **Deferred / gated:** the real calculation, the threshold table,
  the `pass` / `fail` / `warning` row emission, the `AC-S3-D01..D09`
  acceptance manifest entries, and the spec §8.5 closeout revision
  note. None of these is shipped in ED-PR-01..05.
- **Golden Case terminology:** Equipment Duty is **not** marked as a
  verified Golden Case. GC-SC-01's Stage 3 Golden Case integration
  status remains `provisional` — unchanged by this PR.
- **Schema / runtime guardrails:** preserved end-to-end. Optional
  schema additions only. `calculationSnapshots` empty.
  `calculationResults` not introduced. No disk persistence. No fake
  numbers.
