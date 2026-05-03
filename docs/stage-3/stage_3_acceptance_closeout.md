# Stage 3 Acceptance Closeout — Short Circuit MVP

**Project:** Power System Study App
**Stage:** Stage 3 — Short Circuit MVP
**PR:** Stage 3 PR #6 (acceptance closeout, this document)
**Branch:** `stage-3/pr-6-acceptance-closeout`
**Status:** Documentation closeout — no runtime, calculation, schema, sidecar, or UI behavior change.
**Date:** 2026-05-04

This document is the Stage 3 acceptance closeout record. It maps the
work that actually shipped in Stage 3 PRs #11–#16 to the Stage 3
acceptance criteria `AC-S3-01..07` defined in
`docs/stage-3/stage_3_short_circuit_mvp_spec.md` §12, and it makes the
deferred / carryover items explicit so nothing is silently claimed as
verified.

It does **not** modify the merged Stage 3 spec, the implementation
plan, the canonical schema, calculation code, sidecar code, or UI
behavior. It accompanies the manifest extension in
`scripts/acceptance-coverage.json` (`stage3` block) and the parallel
checker change in `scripts/check-acceptance.ts`.

---

## 1. Reading order

This closeout depends on, and does not restate, the Stage 3 spec or
implementation plan:

- `docs/stage-3/stage_3_short_circuit_mvp_spec.md`
  (Stage 3 PR #11 / Spec PR #1).
- `docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md`
  (Stage 3 PR #12 / Plan PR #2).

Whenever this document refers to spec sections (e.g., §13, §15) it
refers to sections in `stage_3_short_circuit_mvp_spec.md`. Whenever it
refers to plan sections (e.g., plan §6.6, plan §8) it refers to
sections in `stage_3_short_circuit_equipment_duty_implementation_plan.md`.

---

## 2. Stage 3 PR ledger (PR #11 → PR #16)

Stage 3 implementation followed the spec's §13 / plan §6 six-PR
breakdown. The GitHub PR numbers below are the actual numbers under
this repository, not the Stage 3 spec's internal "Stage 3 PR #N"
labels (e.g., GitHub PR #13 corresponds to the spec's "Stage 3 PR #2").

| GitHub PR | Spec label | Title / scope shipped | Notes |
|---|---|---|---|
| #11 | Stage 3 PR #1 | Short Circuit MVP spec — `docs/stage-3/stage_3_short_circuit_mvp_spec.md` (Rev A / A.1 / A.2). Defines IEC 60909 basis, MVP scope (3-phase bolted bus faults, max case), result model, sidecar wire contract, runtime-only guardrails, Equipment Duty / Golden Case / diagram overlay deferrals, AC-S3-01..07, and the six-PR breakdown. | Spec only — no code, schema, fixture, or sidecar change. |
| #12 | Stage 3 plan PR | Implementation plan — `docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md`. Translates the merged spec's PR breakdown into sequencing, merge criteria, the Equipment Duty pre-implementation OQ gate (plan §8), the cable-withstand status note (plan §9), and the plan-vs-spec reconciliation policy (plan §3.4). | Docs only. Records that Equipment Duty is **not** scheduled in the approved Short Circuit MVP sequence (plan §6.6). |
| #13 | Stage 3 PR #2 | Short Circuit contract / wire types — `packages/solver-adapter/src/shortCircuit.ts` (request envelope, options, fault target, issue codes, sidecar response shape, structural guard `isShortCircuitSidecarResponse()`); `packages/solver-adapter/tests/shortCircuitContract.test.ts`. App-normalized result types intentionally excluded from this PR per spec §13 PR #2 boundary. | Contract/wire only. No sidecar invocation. No `calculation-store` change. No UI. |
| #14 | Stage 3 PR #3 | Sidecar `run_short_circuit` invocation — `services/solver-sidecar/src/short_circuit.py` (pandapower IEC 60909 invocation), dispatcher in `services/solver-sidecar/src/main.py`, `packages/solver-adapter/tests/sidecarShortCircuitMalformedStdin.test.ts`, opt-in `packages/solver-adapter/tests/shortCircuit.integration.test.ts` (gated by `RUN_SIDECAR_INTEGRATION=1`). | Real pandapower path lands here. Failure mode emits structured `E-SC-001` issue, never zeros (spec §S3-OQ-02 / §11.1). |
| #15 | Stage 3 PR #4 | Result normalization + runtime bundle + retention widening — `packages/solver-adapter/src/shortCircuitResults.ts` (`normalizeShortCircuitResult()`, app-normalized `ShortCircuitBusResult` / `ShortCircuitResult` / `ShortCircuitIssue`), `packages/solver-adapter/src/shortCircuitRunner.ts` (`runShortCircuitForAppNetwork()` + `ShortCircuitRunBundle`), `packages/calculation-store/src/types.ts` widens `CalculationModule` to `"load_flow_bundle" \| "short_circuit_bundle"` and `RuntimeCalculationRecord.bundle` to `LoadFlowRunBundle \| ShortCircuitRunBundle`, `packages/calculation-store/src/reducer.ts` retention slot, `packages/calculation-store/tests/reducer.test.ts` SC retention coverage, `packages/solver-adapter/tests/shortCircuitRunner.test.ts`, `packages/solver-adapter/tests/shortCircuitResults.test.ts`. Per-row status mapping `valid → ok` / `failed → failed` and orchestrator-synthesized `unavailable` rows wired end-to-end with all-null numerics on non-computable rows. | Fail-closed: incomplete sidecar wire output is rejected (commit `9777a89`). No project-file persistence. `calculationSnapshots` stays empty. |
| #16 | Stage 3 PR #5 | UI Short Circuit results — `apps/web/src/components/ShortCircuitResultTable.tsx`, extension to `apps/web/src/components/CalculationStatusPanel.tsx` (Short Circuit module row, Run controls, `disabled_by_validation` tooltip path, issues panel), extension to `apps/web/src/state/calculationStore.ts` (`runShortCircuit()` action + lifecycle slot + `canRunShortCircuit` / `shortCircuitDisabledReason`), `apps/web/tests/ShortCircuitResultTable.test.tsx`, `apps/web/tests/CalculationStatusPanel.test.tsx` extension, `apps/web/tests/calculationStore.test.tsx` (project file unchanged after SC run). Per-row `issueCodes` are surfaced in the table (commit `f448a74`). | No fake numbers: failed / unavailable rows render explicit empty cells plus issue codes, per spec §9.5. SC diagram overlay (S3-FU-11) **not** implemented — see §4.3. |

This PR (Stage 3 PR #6, GitHub PR for branch
`stage-3/pr-6-acceptance-closeout`) ships only:

- This closeout document.
- The `stage3` block in `scripts/acceptance-coverage.json`.
- The `stage3Expected` extension in `scripts/check-acceptance.ts`.

No runtime / calculation / sidecar / schema / UI code is touched.

---

## 3. AC-S3-01..07 — verification owners

The seven Stage 3 acceptance criteria from spec §12 are mapped to
verification owners below. Each row mirrors the entry in
`scripts/acceptance-coverage.json` `stage3.criteria[]`. **All seven
ACs land as `mapped` in this closeout** — none are deferred.

| AC | Status | Verifying owner (test / file / doc, with PR) |
|---|---|---|
| **AC-S3-01** Short Circuit MVP scope defined (3-phase bolted bus faults, IEC 60909 maximum case, fault target by `busInternalId`, source contribution policy per S3-OQ-05). | mapped | Spec `docs/stage-3/stage_3_short_circuit_mvp_spec.md` §§1, 2, 3, 4 (PR #11). Plan `docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md` §§3, 4 (PR #12). This document §§2, 3 (PR #6). |
| **AC-S3-02** AppNetwork remains solver-agnostic across Stage 3; canonical project schema unchanged; canonical drift test still passes. | mapped | `packages/schemas/tests/canonical-drift.test.ts`, `packages/network-model/tests/buildAppNetwork.test.ts`, `packages/solver-adapter/tests/contract.test.ts` (no `calculationResults` / no pandapower types in public surface), grep guard: no pandapower imports outside `services/solver-sidecar/`. The Stage 1 canonical schema files are untouched across Stage 3 PRs #11–#16 and the closeout PR. |
| **AC-S3-03** Sidecar `run_short_circuit` command contract defined (request envelope, response shape, `E-SC-*` failure modes, transport reused from Stage 2). | mapped | `packages/solver-adapter/src/shortCircuit.ts` + `packages/solver-adapter/tests/shortCircuitContract.test.ts` (PR #13). `services/solver-sidecar/src/short_circuit.py` + `services/solver-sidecar/src/main.py` `run_short_circuit` dispatcher + `packages/solver-adapter/tests/sidecarShortCircuitMalformedStdin.test.ts` (PR #14). Opt-in `packages/solver-adapter/tests/shortCircuit.integration.test.ts` gated by `RUN_SIDECAR_INTEGRATION=1` (PR #14). |
| **AC-S3-04** `ShortCircuitResult` model defined (per-bus rows by `busInternalId`, IEC 60909 outputs `Ik''` / `ip` / `Ith` / `Sk''`, per-row + top-level status, issues, metadata; `ipKa` / `ithKa` may be `null`). | mapped | `packages/solver-adapter/src/shortCircuitResults.ts` + `packages/solver-adapter/src/shortCircuitRunner.ts` (PR #15). `packages/solver-adapter/tests/shortCircuitResults.test.ts` + `packages/solver-adapter/tests/shortCircuitRunner.test.ts` (PR #15). UI consumer: `apps/web/src/components/ShortCircuitResultTable.tsx` + `apps/web/tests/ShortCircuitResultTable.test.tsx` (PR #16). |
| **AC-S3-05** Runtime-only guardrails preserved: `calculationSnapshots` stays empty in every Stage 3 PR; `calculationResults` is not added; no disk persistence; no fake numbers; runtime snapshot reused unchanged from Stage 2. | mapped | `packages/calculation-store/src/types.ts` (`CalculationModule` widened to include `"short_circuit_bundle"`; `RuntimeCalculationRecord.bundle` widened to `LoadFlowRunBundle \| ShortCircuitRunBundle`) + `packages/calculation-store/src/reducer.ts` retention slot (PR #15). `packages/calculation-store/tests/reducer.test.ts` Short Circuit retention cases (`retains a successful Short Circuit bundle under the short_circuit_bundle key`, stale flag, project edit semantics). `packages/schemas/src/stage_1_project_schema.rev_d.zod.ts` continues to pin `calculationSnapshots` to `max(0)`. `apps/web/tests/calculationStore.test.tsx` asserts the project file is unchanged after a Short Circuit run (PR #16). Failed runs surface `E-SC-*` codes with all-null numerics rather than fabricated values (commit `9777a89` fail-closed guard). |
| **AC-S3-06** Non-goals and deferred items explicitly listed (minimum case, line-end faults, generator subtransient, motor contribution, equipment duty, multi-slack, single-phase / DC / mixed-phase faults, arc flash, report export, cable sizing). | mapped | Spec §§2.3 and 15 (PR #11). Plan §§4.2, 6.6, 8, 9 (PR #12). This document §4 (PR #6) records the carryover state at closeout. |
| **AC-S3-07** Implementation PR breakdown defined (PR #2 contract / wire types only; PR #3 sidecar + adapter; PR #4 orchestrator + result types + retention; PR #5 UI; PR #6 acceptance closeout). | mapped | Spec §13 (PR #11). Plan §6 (PR #12). This document §2 PR ledger (PR #6) records that the breakdown was followed in PRs #13–#16 and is being closed by this PR. |

The `scripts/check-acceptance.ts` extension reports the same status
machine-readably: `pnpm check:acceptance` enumerates all seven entries
and exits with `mapped` tags for `AC-S3-01..07`. No Stage 3 entry
relies on a `deferred-*` marker.

---

## 4. Carryover / deferred items

The items below are **not** delivered by Stage 3 PRs #11–#16 and are
**not** required for Stage 3 acceptance closeout per the merged spec.
They are recorded here so future planning does not silently treat them
as satisfied.

### 4.1 GC-SC-01 — Verified Short Circuit Golden Case (S3-FU-09)

**Status: deferred / carryover. Not yet integrated. Not claimed as
verified by Stage 3 PR #6.**

Per spec §15 / S3-FU-09 and plan §10, the Stage 3 verified Short
Circuit Golden Case fixture (GC-SC-01) and the Golden Case schema
extension equivalent to Stage 2 §12.7 are **deferred to a post-Stage-3
Golden Case PR**. The current Stage 3 closeout (this PR) does **not**
require a verified GC-SC-01; it only requires the deferral to be
explicitly recorded.

Current state at closeout:

- The opt-in integration test
  `packages/solver-adapter/tests/shortCircuit.integration.test.ts`
  (gated by `RUN_SIDECAR_INTEGRATION=1`) exercises a real pandapower
  short-circuit invocation but is a smoke test, not a verified Golden
  Case (spec §S3-OQ-02 / §S3-OQ-08, plan §10).
- No fixture is recorded as `referenceStatus = "verified"`.
- pandapower smoke output is **not** treated as a verified IEC 60909
  reference. The spec's `verified` / `provisional` / `regression_only`
  status model (plan §10) carries forward unchanged into the future
  Golden Case PR.
- Hand calculations and pandapower runs remain separate per
  S3-OQ-08.

**Carryover work for the Golden Case follow-up PR (post-Stage-3):**

- Author the Golden Case fixture (network, expected per-bus `Ik''` /
  `ip` / `Ith` / `Sk''`, voltage factor, transformer correction, X/R,
  source strength, tolerance).
- Extend the Golden Case schema (Stage 2 §12.7 equivalent) to record
  Short Circuit reference status.
- Document the assumption set for any 5–10% mismatch versus hand
  calculation before promoting to `verified`.
- Bundling GC-SC-01 into Stage 3 closeout would be a **proposed
  refinement** to the spec and requires a Stage 3 spec revision PR
  before implementation (plan §6.7 note, plan §10 final paragraph).

GC-SC-01 must not be claimed as verified, integrated, or in-scope for
Stage 3 closeout.

### 4.2 Equipment Duty Check (S3-FU-12)

**Status: gated follow-up. Out of the approved Short Circuit MVP
implementation sequence. Requires a separate Stage 3 spec revision /
OQ update PR before any code lands.**

Per spec §15 / S3-FU-12, spec §2.3, plan §3.4, and plan §6.6,
Equipment Duty Check is **not** part of the currently approved
Stage 3 MVP. Short Circuit results feed duty-check inputs but the
Stage 3 MVP does not compare per-equipment ratings against fault
currents and does not emit duty pass / fail rows.

Equipment Duty Check may enter Stage 3 only after **all** items in
plan §8 (Equipment Duty Pre-Implementation OQ Gate) are closed in a
spec-revision PR. Reproduced here for traceability:

1. Equipment rating fields on the Stage 1 schema — which equipment
   types receive duty rating fields, exact field names / units / Zod
   definitions, and the schema-rev bump policy. **Schema-change
   approval is a hard prerequisite.**
2. Missing-rating policy — `unavailable` vs `warning` vs run-block; UI
   behavior for missing-rating rows.
3. Duty basis: `Ik''` vs breaking current `Ib`, fallback labeling
   (`provisional` vs `verified`), time-to-fault assumption, optional
   peak (`ip`) and thermal (`Ith`) duty.
4. Cable short-circuit withstand scoping — whether it joins the
   Equipment Duty follow-up or a separate spec, plus the rating fields
   / K-factor / clearing-time source if included (plan §9).
5. Pass / warning / fail thresholds (numeric margins, per-project vs
   fixed).
6. Duty-result module retention — likely a new
   `"duty_check_bundle"` on `CalculationModule`, runtime-only.
7. New `AC-S3-Dxx` (or new stage-block) acceptance criteria.

Until each of those is decided in a merged spec revision, the
implementation plan continues to list Equipment Duty as "PR #5A or
later (gated follow-up)" per plan §6.6, and **no Equipment Duty code,
schema, UI, or contract type lands**.

Equipment Duty must remain outside the approved Short Circuit MVP
implementation sequence. This closeout does not relax that gate.

### 4.3 SC diagram overlay (S3-FU-11)

**Status: deferred. Not implemented in PR #16.**

Per spec §9.3, plan §6.5, and spec §15 / S3-FU-11, a diagram overlay
that paints `Ik''` near each bus on
`apps/web/src/components/DiagramCanvas.tsx` is **not** a Stage 3
acceptance requirement. The spec leaves room for the overlay to ship
opportunistically with the result table only "if the implementation
finds the structural change is one touch".

Current state at closeout:

- `apps/web/src/components/DiagramCanvas.tsx` is unchanged for Short
  Circuit. No `Ik''` overlay is rendered. The Stage 2 Load Flow
  overlay surface is preserved.
- The Short Circuit result table
  (`apps/web/src/components/ShortCircuitResultTable.tsx`) remains the
  sole UI surface for per-bus fault current.

Carryover work for a follow-up PR (post-Stage-3): wire a second
overlay layer on the diagram canvas and namespace its test ids
(`result-sc-bus-<id>-overlay-*`) so it does not collide with the
existing Stage 2 overlay. This is a UI-only follow-up and does not
require a spec revision; the spec already records the deferral.

### 4.4 `validateForShortCircuit()` readiness wrapper (carryover from spec §13 PR #4)

**Status: carryover / not yet integrated.**

Spec §13 PR #4 lists a `validateForShortCircuit()` wrapper alongside
the orchestrator under `packages/validation/src/calcReadiness.ts` (or
sibling). The orchestrator and runtime bundle landed in PR #15, but
the dedicated readiness wrapper did **not** ship. The actual
PR #16 UI gates the Short Circuit Run button on
`hasValidationErrors` from the existing Stage 2 readiness path plus
transport availability, which satisfies the spec §9.4 contract for
the disabled / enabled states surfaced to the user, but it does not
deliver the Stage 3-specific readiness wrapper as a named export.

This is recorded as carryover (not as a missed acceptance criterion):
none of `AC-S3-01..07` requires `validateForShortCircuit()` as a
named export. Spec §S3-OQ-09 / §17 runtime-only guardrails and §9.4
Run-button behavior are satisfied through the existing Stage 2
readiness path.

Carryover work for a follow-up PR: introduce
`validateForShortCircuit()` next to `validateForCalculation()`, with
the Stage 3-specific blocking checks listed in spec §4.2 (slack
short-circuit data, X/R, transformer impedance on the fault path,
fault-target list when `mode === "specific"`), and add
`packages/validation/tests/short-circuit-readiness.test.ts`. This is a
spec-aligned tightening, not a behavior change for the user.

### 4.5 Other Stage 3 follow-ups (recorded by spec §15)

The following spec §15 follow-ups remain deferred. None are required
for closeout; they are listed for traceability only:

- **S3-FU-01** Minimum case (`case = "min"`) — deferred. MVP ships
  maximum only.
- **S3-FU-02** Bus-only vs branch-end / mid-line / transformer-
  terminal faults — deferred. MVP ships bus-only.
- **S3-FU-03** Generator subtransient short-circuit contribution —
  deferred; requires new contract field plus a verified Golden Case.
- **S3-FU-04** Motor short-circuit contribution — deferred; same
  constraint as S3-FU-03.
- **S3-FU-05** Per-source `Ik''` contribution breakdown — deferred.
- **S3-FU-06** `scLevelMva` vs `faultCurrentKa` inconsistency
  tolerance — deferred to a future tuning PR alongside the readiness
  wrapper (§4.4 above).
- **S3-FU-07** X/R default when `xrRatio` is missing — deferred. MVP
  fail-closes with `E-SC-002`.
- **S3-FU-08** ANSI / IEEE C37 calculation basis — deferred. IEC 60909
  is the Stage 3 MVP basis per S3-OQ-01.
- **S3-FU-10** Disk persistence of runtime snapshots / result bundles
  — deferred. Stage 2 §S2-FU-07 deferral inherited unchanged.
- **Cable short-circuit withstand** — out of Stage 3 MVP per plan §9.
  Belongs to the Equipment Duty / withstand follow-up family or a
  separate cable-withstand spec, whichever the spec revision in plan
  §8 selects.

---

## 5. Guardrail attestation

Stage 3 closeout (this PR) preserves every Stage 1 / Stage 2 / Stage 3
guardrail. Concretely, this PR:

- Does **not** modify `packages/schemas/**`. The Stage 1 canonical
  project-file schema is unchanged.
- Does **not** modify `packages/network-model/**`. `AppNetwork`
  remains solver-agnostic.
- Does **not** modify `packages/project-io/**`. Deterministic
  serialization and top-level key order are unchanged.
- Does **not** modify `packages/validation/**`. Readiness behavior is
  unchanged.
- Does **not** modify `packages/solver-adapter/**`. Short Circuit
  contract types, normalization, runner, and sidecar client are
  unchanged.
- Does **not** modify `packages/calculation-store/**`. Retention
  semantics for `"short_circuit_bundle"` (added in PR #15) are
  unchanged.
- Does **not** modify `services/solver-sidecar/**`. The
  `run_short_circuit` command is unchanged.
- Does **not** modify `apps/web/src/**` or `apps/web/tests/**`. UI
  behavior is unchanged.
- Does **not** introduce `calculationResults` to the canonical
  schema.
- Does **not** populate the project file's `calculationSnapshots`
  array.
- Does **not** persist runtime snapshots or result bundles to disk.
- Does **not** create fake calculation outputs.
- Does **not** implement Equipment Duty Check, Cable Sizing, Cable
  Withstand, or Report Workflow scope.
- Does **not** implement GC-SC-01 or the Stage 3 Golden Case schema
  extension.
- Does **not** implement the SC diagram overlay.

---

## 6. Mandatory check matrix

Per plan §12.2, every Stage 3 PR must record the unconditional check
matrix in its PR description. For this docs-only closeout PR the
required checks are `pnpm typecheck` and `pnpm check:acceptance` (plan
§12.2 — docs-only PR baseline). The remaining commands in the matrix
(`pnpm test`, `pnpm check:fixtures`, `pnpm --filter web build`) are
recorded against the originating implementation PRs (#13–#16) and are
expected to remain green at closeout time, since this PR touches no
code.

The check evidence is recorded in the PR description after the doc
edits land; this document does not encode command output.

---

## 7. Spec / plan revision impact

This PR does **not** revise the Stage 3 spec or implementation plan
beyond adding a closeout pointer. Concretely:

- `docs/stage-3/stage_3_short_circuit_mvp_spec.md` is unchanged. The
  spec already records (§13 PR #6) that "the documentation closeout
  in this spec (Rev A.1+ revision note)" is part of the closeout PR;
  this closeout chooses to record that closeout in a **separate
  document** (this file) rather than as an inline `Rev A.x` note, to
  keep the spec stable for downstream readers and to keep the
  closeout reviewable in isolation. A future Stage 3 spec revision
  (e.g., for the Equipment Duty pre-implementation OQ gate) may add a
  pointer back to this document.
- `docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md`
  is unchanged.
- The merged spec / plan continue to govern. Any Equipment Duty work
  must still be preceded by a Stage 3 spec revision PR per plan §6.6
  / §8.

---

## 8. Closeout summary

- **Completed (Stage 3 MVP, PRs #11–#16):** Short Circuit MVP spec,
  implementation plan, sidecar wire contract, `run_short_circuit`
  pandapower invocation, app-normalized result model, runtime bundle,
  `calculation-store` retention widening, UI result table, status
  panel wiring, fail-closed handling for incomplete sidecar output,
  `AC-S3-01..07` mapping (this PR), and the `stage3` block in the
  acceptance manifest (this PR).
- **Deferred / carryover (explicit, not claimed):** GC-SC-01 verified
  Golden Case (S3-FU-09); SC diagram overlay (S3-FU-11);
  `validateForShortCircuit()` readiness wrapper (carryover from spec
  §13 PR #4); spec §15 follow-ups S3-FU-01..08 / S3-FU-10; cable
  short-circuit withstand (plan §9).
- **Gated follow-up (requires spec revision before any code):**
  Equipment Duty Check (S3-FU-12), per spec §2.3 / §15 and plan §6.6
  / §8.
- **Stage 3 acceptance criteria status:** `AC-S3-01..07` all
  `mapped`. None deferred.
- **Schema / runtime guardrails:** preserved end-to-end. Stage 1
  canonical schema untouched. `calculationSnapshots` empty.
  `calculationResults` not introduced. No disk persistence. No fake
  numbers.
