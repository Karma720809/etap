# Stage 3 Overall Review

**Project:** Power System Study App
**Stage:** Stage 3 — Short Circuit MVP + Equipment Duty (gated follow-up)
**PR:** Stage 3 PR #25 (overall review — this document)
**Branch:** `stage-3/pr-25-overall-review`
**Status:** Documentation-only overall review. No runtime, calculation, schema, sidecar, project-IO, store-architecture, UI, fixture, test, or acceptance-tooling change.
**Date:** 2026-05-11
**HEAD basis:** PR #24 merge commit `bf0fb46` (Equipment Duty acceptance closeout).

This document is the **Stage 3 Overall Review**. It is written before
Stage 4 (Cable Sizing Integration) begins, to evaluate whether the
Stage 3 completion criteria recorded in the merged Stage 3
implementation plan were actually satisfied, what carries over into
Stage 4, and what Stage 4 must explicitly start from rather than
silently rebuild.

It does **not** modify the Stage 3 Short Circuit MVP spec, the Stage 3
implementation plan, the Equipment Duty spec revision, the Short
Circuit acceptance closeout, or the Equipment Duty acceptance
closeout. It does **not** modify any application code, sidecar code,
test, fixture, runtime / store source, project-file schema, or
acceptance-tooling source.

---

## 1. Review purpose

Stage 3 functional sequence is complete on `main` through PR #24. Two
separate **acceptance closeout** documents already exist:

- `docs/stage-3/stage_3_acceptance_closeout.md` — Short Circuit MVP
  acceptance closeout (PR #17 / Stage 3 PR #6).
- `docs/stage-3/stage_3_equipment_duty_acceptance_closeout.md` —
  Equipment Duty scaffolding acceptance closeout (PR #24 / ED-PR-05).

The two acceptance closeouts mechanically map shipped work to
acceptance-manifest owners (`AC-S3-01..07` for Short Circuit;
`AC-S3-D01..D09` left intentionally **not** added to
`scripts/acceptance-coverage.json` for Equipment Duty per the ED-PR-05
brief). They do not, by themselves, evaluate whether the **Stage 3
completion criteria** in the implementation plan were satisfied as a
whole, nor do they consolidate the Short Circuit and Equipment Duty
threads into a single Stage 4 hand-off decision.

This overall review fills that gap. It is the document Stage 4 reads
when planning starts. The distinction this document preserves:

| Type | Purpose | Scope |
|---|---|---|
| **Acceptance closeout** (PR #17 + PR #24) | Mechanically map shipped PRs to acceptance-coverage owners; record what acceptance entries are `mapped` or `deferred`. | Per-module: Short Circuit MVP vs Equipment Duty scaffolding, separately. |
| **Overall stage review** (this document, PR #25) | Evaluate whether Stage 3 completion criteria (plan §14) were *actually* satisfied; consolidate Short Circuit + Equipment Duty; record Stage 4 hand-off readiness, deferred items, and gated follow-ups. | Whole-stage. |

The overall review does **not** flip any `AC-S3-*` row, does **not**
promote any Golden Case integration status, and does **not** introduce
or remove `AC-S3-D*` entries. Those are acceptance-closeout decisions
recorded in the closeout PRs.

---

## 2. Stage 3 scope reviewed

The full Stage 3 scope evaluated by this review:

1. **Short Circuit MVP.** IEC 60909, 3-phase bolted bus faults,
   maximum case, fault target by `busInternalId`, end-to-end sidecar
   path (`run_short_circuit`), app-normalized result model,
   runtime-only retention, UI result table, status panel wiring,
   acceptance manifest (`AC-S3-01..07`).
2. **GC-SC-01 integration / status.** Static support-package
   artifact, executable fixture loader, orchestrator-layer comparison
   harness (Layers 1–3), Stage 3 Golden Case integration status in
   `scripts/acceptance-coverage.json` `stage3GoldenCases[]`.
3. **Equipment Duty specification gate.** Closure of the plan §8
   pre-implementation OQ gate (ED-OQ-01..08) and the canonical
   Equipment Duty PR breakdown (ED-PR-01..05) that supersedes plan
   §6.6's "PR #5A or later" placeholder.
4. **Equipment Duty implementation sequence.** Optional rating-field
   schema extension (ED-PR-01); duty-check contract / result-model
   types (ED-PR-02); orchestrator + readiness wrapper + retention
   widening (ED-PR-03); Equipment Duty UI (ED-PR-04); Equipment Duty
   acceptance closeout document + two carryover UI tests (ED-PR-05).
5. **Runtime-only result retention.** No `calculationResults` field;
   `calculationSnapshots` pinned to `max(0)` and empty; runtime
   `RuntimeCalculationRecord.bundle` widened to
   `LoadFlowRunBundle | ShortCircuitRunBundle | DutyCheckRunBundle`;
   no disk persistence.
6. **UI display guardrails.** No fake numbers — every nullable
   numeric field renders as an explicit empty / em-dash cell. Run
   buttons are gated by readiness, not by hidden defaults.
7. **Stage 1 / Stage 2 guardrail preservation.** Stage 1 canonical
   project schema is unchanged except for optional Equipment Duty
   rating fields in ED-PR-01; Stage 2 Load Flow + Voltage Drop
   behavior is unchanged across Stage 3.
8. **No Cable Sizing or Report Workflow leakage.** Stage 3 does not
   introduce Cable Sizing engine code, ampacity computation, Excel /
   PDF / certified report output, arc-flash analysis, or per-zone
   protection-coordination clearing time.

Each of those threads is reviewed in §4 (completion criteria), §5
(GC-SC-01), §6 (Equipment Duty), §7 (runtime / project-file
separation), and §8 (scope leakage).

---

## 3. PR mapping

The Stage 3 GitHub PR sequence on `main`, derived from
`git log --all --oneline --first-parent`, anchors every later section
of this review. The labels in the second column are the canonical
spec-relative identifiers (`Stage 3 PR #N` for Short Circuit MVP work,
`ED-PR-NN` for Equipment Duty work).

| GitHub PR | Spec label | Title / scope shipped | Closeout reference |
|---|---|---|---|
| #11 | Stage 3 PR #1 | Short Circuit MVP spec — `docs/stage-3/stage_3_short_circuit_mvp_spec.md` (Rev A / A.1 / A.2). IEC 60909 basis, MVP scope (3-phase bolted bus faults, max case), result model, sidecar wire contract, runtime-only guardrails, Equipment Duty / Golden Case / diagram overlay deferrals, AC-S3-01..07, six-PR breakdown. | Stage 3 closeout §2 (PR #11 row). |
| #12 | Stage 3 plan PR | Implementation plan — `docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md`. Plan §3.4 reconciliation, plan §6.6 gated Equipment Duty slot, plan §8 pre-implementation OQ gate, plan §9 cable-withstand note. Docs-only. | Stage 3 closeout §2 (PR #12 row). |
| #13 | Stage 3 PR #2 | Short Circuit contract / wire types — `packages/solver-adapter/src/shortCircuit.ts`, `packages/solver-adapter/tests/shortCircuitContract.test.ts`. Wire contract only. | Stage 3 closeout §2 (PR #13 row). |
| #14 | Stage 3 PR #3 | Sidecar `run_short_circuit` — `services/solver-sidecar/src/short_circuit.py`, `services/solver-sidecar/src/main.py` dispatcher, opt-in `packages/solver-adapter/tests/shortCircuit.integration.test.ts` gated by `RUN_SIDECAR_INTEGRATION=1`. Failure modes emit structured `E-SC-*`, no zeros. | Stage 3 closeout §2 (PR #14 row). |
| #15 | Stage 3 PR #4 | Orchestrator + result normalization + retention widening — `packages/solver-adapter/src/shortCircuitResults.ts`, `packages/solver-adapter/src/shortCircuitRunner.ts`, `packages/calculation-store/src/types.ts` widens `CalculationModule` to `"load_flow_bundle" \| "short_circuit_bundle"`, `packages/calculation-store/src/reducer.ts` retention slot. Fail-closed on incomplete sidecar wire output (commit `9777a89`). | Stage 3 closeout §2 (PR #15 row). |
| #16 | Stage 3 PR #5 | Short Circuit UI — `apps/web/src/components/ShortCircuitResultTable.tsx`, `CalculationStatusPanel.tsx` extension, `apps/web/src/state/calculationStore.ts` `runShortCircuit()` action and lifecycle slot. Per-row `issueCodes` surfaced (commit `f448a74`). | Stage 3 closeout §2 (PR #16 row). |
| #17 | Stage 3 PR #6 | **Short Circuit MVP acceptance closeout** — `docs/stage-3/stage_3_acceptance_closeout.md`, `stage3` block in `scripts/acceptance-coverage.json` (AC-S3-01..07 all `mapped`), `stage3Expected` extension in `scripts/check-acceptance.ts`. | This PR itself is the Short Circuit MVP closeout. |
| #18 | Stage 3 PR #7 | **GC-SC-01 executable Golden Case integration** — Node-only fixture loader at `packages/fixtures/src/golden_cases/gc_sc_01.node.ts`, structural test `packages/fixtures/tests/golden-case-gc-sc-01.test.ts`, orchestrator-layer comparison `packages/solver-adapter/tests/shortCircuit.goldenCaseGcSc01.test.ts` (Layers 1 always / 2 always / 3 opt-in via `RUN_GOLDEN_CASE_VERIFICATION=1`). `stage3GoldenCases` block added to `scripts/acceptance-coverage.json` with integration status `provisional`. | Stage 3 closeout §4.1. |
| #19 | Stage 3 PR #8 | **Equipment Duty spec revision / OQ closure** — `docs/stage-3/stage_3_equipment_duty_spec.md` (Rev A). Closes ED-OQ-01..08, defines `DutyCheckResult` model, threshold table, missing-rating policy, runtime-only retention shape, `W-DC-001..003` codes, `AC-S3-D01..D09` template, canonical Equipment Duty PR breakdown (ED-PR-01..05) that supersedes plan §6.6. Spec-only; no code, schema, runtime, sidecar, UI, fixture, or acceptance-manifest change. | Equipment Duty closeout §1 (reading order). |
| #20 | ED-PR-01 | Stage 1 schema extension for Equipment Duty rating fields — optional `Breaker.interruptingCapacityKa` / `Breaker.peakWithstandKa`; optional `Switch.shortTimeWithstandKa` / `shortTimeWithstandDurationS` / `peakWithstandKa`; optional `Bus.shortTimeWithstandKa` / `shortTimeWithstandDurationS` / `peakWithstandKa`; optional `Cable.shortCircuitKValue`; optional project-level `ProjectMetadata.shortCircuit.defaultFaultClearingS`. Canonical-drift test extended; round-trip preserved. Schema-only; pre-existing project files validate unchanged. | Equipment Duty closeout §2 / §3.1. |
| #21 | ED-PR-02 | Duty Check contract / result model — new package `packages/duty-check/` (`types.ts`, `index.ts`, `tests/types.test.ts`). Numeric `dutyKa` / `ratingKa` / `utilizationPct` / `marginPct` typed `number \| null`. Contract / wire types only — no orchestrator, no readiness wrapper, no reducer change. | Equipment Duty closeout §2 / §3.2. |
| #22 | ED-PR-03 | Orchestrator + readiness wrapper + retention slot — `packages/duty-check/src/runner.ts` (`runDutyCheckForBundle`), `packages/duty-check/src/readiness.ts` (`evaluateDutyCheckReadiness` four-state contract), `packages/calculation-store/src/types.ts` widens `CalculationModule` to add `"duty_check_bundle"` and `RuntimeCalculationRecord.bundle` to the three-member union, `packages/calculation-store/src/reducer.ts` retention slot, `packages/calculation-store/src/retention.ts` key extension. Follow-up commit `8293ae6` tightens project-validation probe and pins peak-rating row emission. Orchestrator emits `not_evaluated` / `missing_rating` / `not_applicable` rows with all-null numerics; **no real engineering calculation, no pass/fail/warning evaluation**. | Equipment Duty closeout §2 / §3.3. |
| #23 | ED-PR-04 | Equipment Duty UI — `apps/web/src/components/DutyCheckResultTable.tsx` (numeric cells render `—` for `null`, never `0`); `CalculationStatusPanel.tsx` adds Duty Check module row, Run Equipment Duty button, `dutyCheckDisabledReason` chip, `calc-dc-stale-badge`, duty-check issues panel; `apps/web/src/state/calculationStore.ts` adds `runDutyCheck()` action + lifecycle slot + `dutyCheckReadiness` memo + parallel stale flag. Run gated by ED-PR-03 readiness wrapper four-state contract. UI wiring only. | Equipment Duty closeout §2 / §3.4. |
| #24 | ED-PR-05 | **Equipment Duty acceptance closeout** — `docs/stage-3/stage_3_equipment_duty_acceptance_closeout.md` + two carryover UI tests in `apps/web/tests/DutyCheckUI.test.tsx` pinning the `blocked_by_stale_upstream` and `blocked_by_upstream` (failed SC) disabled-reason paths. `scripts/acceptance-coverage.json` is **not** edited — the `stage3EquipmentDuty` block is intentionally deferred until either the real engineering calculation lands or a separate spec-revision PR decides contract-level scaffolding ownership is acceptable. | Equipment Duty closeout itself. |
| #25 | this PR | **Stage 3 Overall Review** — this document. Documentation-only; no code, schema, runtime, sidecar, UI, fixture, test, or acceptance-tooling change. | — |

PRs #11–#16 land the Short Circuit MVP functional sequence. PR #17
closes Short Circuit MVP acceptance. PR #18 promotes GC-SC-01 from
deferred to an executable `provisional` Stage 3 Golden Case
integration entry (it does not flip any `AC-S3-01..07` row). PR #19 is
the spec-only Equipment Duty OQ-closure that unblocks ED-PR-01.
PRs #20–#23 land the Equipment Duty scaffolding sequence at the
contract / wiring level. PR #24 closes Equipment Duty acceptance
documentation. PR #25 (this document) is the Stage 4 hand-off review.

The two acceptance closeouts disagree only on whether to extend the
acceptance manifest. PR #17 ships the `stage3` block with all seven
`AC-S3-01..07` rows mapped. PR #24 intentionally **does not** ship a
`stage3EquipmentDuty` block because no real Equipment Duty engineering
calculation has shipped — the closeout records that decision
explicitly in `stage_3_equipment_duty_acceptance_closeout.md` §4 / §5.2.
This review preserves that distinction; it does not edit the manifest.

---

## 4. Stage 3 completion criteria review

The completion criteria below are the eight bullets recorded in
`stage_3_short_circuit_equipment_duty_implementation_plan.md` §14
("Stage 3 Completion Criteria"). Each row is evaluated against the
code, tests, fixtures, documents, and acceptance manifest entries that
landed across PRs #11–#24.

| # | Criterion (plan §14) | Status | Evidence | Notes | Carryover |
|---|---|---|---|---|---|
| 1 | Short Circuit MVP runs through the sidecar (`run_short_circuit`). | satisfied | PR #14 `services/solver-sidecar/src/short_circuit.py` + dispatcher in `services/solver-sidecar/src/main.py`; adapter transport `packages/solver-adapter/src/shortCircuitClient.ts`; opt-in real-pandapower integration test `packages/solver-adapter/tests/shortCircuit.integration.test.ts` gated by `RUN_SIDECAR_INTEGRATION=1`. Stage 3 closeout §3 AC-S3-03 owner. | Failure modes return structured `E-SC-*` codes — no zeros (Short Circuit MVP spec §11.1; PR #14 dispatcher; PR #15 commit `9777a89` fail-closed on incomplete wire output). | None. |
| 2 | Short Circuit results are normalized into app vocabulary (`ShortCircuitResult` / `ShortCircuitRunBundle`). | satisfied | PR #15 `packages/solver-adapter/src/shortCircuitResults.ts` (`normalizeShortCircuitResult()`), `packages/solver-adapter/src/shortCircuitRunner.ts` (`runShortCircuitForAppNetwork`, `ShortCircuitRunBundle` factory), tests in `packages/solver-adapter/tests/shortCircuitResults.test.ts` / `shortCircuitRunner.test.ts`. Wire → app field rename (`internalId → busInternalId`); per-row status (`valid → ok`, `failed → failed`, orchestrator-synthesized → `unavailable`); numeric nullability preserved end-to-end. Stage 3 closeout §3 AC-S3-04 owner. | — | None. |
| 3 | Runtime snapshot / result retention is implemented without project-file persistence. | satisfied | PR #15 widens `CalculationModule` to `"load_flow_bundle" \| "short_circuit_bundle"` and `RuntimeCalculationRecord.bundle` to a discriminated union; `packages/calculation-store/src/reducer.ts` retention slot under `(scenarioId, module, subCase)`; `packages/calculation-store/tests/reducer.test.ts` retention coverage. PR #22 extends the union to three members for `"duty_check_bundle"`; `packages/calculation-store/tests/duty-check-retention.test.ts` covers the duty slot. `packages/schemas/src/stage_1_project_schema.rev_d.zod.ts` pins `calculationSnapshots` to `max(0)`; `apps/web/tests/calculationStore.test.tsx` and `apps/web/tests/DutyCheckUI.test.tsx` assert the project file is unchanged after a Short Circuit run and a Duty Check run respectively. Stage 3 closeout §3 AC-S3-05 owner. | — | None for retention shape. Disk persistence remains deferred (S2-FU-07 / S3-FU-10). |
| 4 | Equipment Duty Check is implemented or explicitly deferred. | partial (per plan §14: "explicitly deferred" suffices for completion; this review additionally records the scaffolding that landed) | Plan §14 bullet 7: "Equipment Duty Check is **explicitly deferred** (S3-FU-12) with a documented gate (§8) — completion does **not** require Equipment Duty implementation." The plan §8 OQ gate was subsequently closed by **PR #19** (Equipment Duty spec revision); ED-PR-01..05 (PRs #20–#24) then shipped Equipment Duty **scaffolding** at the contract / wiring / UI / retention layer. **No real Equipment Duty engineering calculation has shipped** — `runDutyCheckForBundle()` emits only `not_evaluated` / `missing_rating` / `not_applicable` rows with all-null numerics. Equipment Duty closeout §4 records the eight numbered current limitations explicitly. | Plan §14's completion criterion is satisfied by the original "explicit deferral" path. The scaffolding work that subsequently landed exceeds the strict completion requirement and is recorded here so Stage 4 sees the actual code surface. Equipment Duty is **not** a verified Stage 3 acceptance owner — no `AC-S3-01..07` row cites Equipment Duty code, and no `AC-S3-D*` row is in `scripts/acceptance-coverage.json`. | Real Equipment Duty engineering calculation (basis matrix per Equipment Duty spec §4.3 — breaker `Ib` / `Ik''` fallback / peak `ip` / thermal `Ith` / cable `I²t`); threshold table per spec §4.5 (`ok` ≤ 90% / `warning` > 90% / `violation` > 100%); `pass` / `fail` / `warning` row emission with `verdictBasis: "verified"`; `AC-S3-D01..D09` acceptance manifest entries; Equipment Duty Golden Cases (ED-FU-09). |
| 5 | GC-SC-01 verified reference is resolved or explicitly documented. | partial / explicitly documented as `provisional` | Plan §14 bullet 8: "GC-SC-01 verified reference is **explicitly deferred** (S3-FU-09) — completion does not require GC-SC-01." PR #18 then integrated GC-SC-01 as an executable Stage 3 Golden Case integration entry with integration status `provisional`. Static support-package artifact at `docs/stage-1-baseline/stage_1_preimplementation_support_v1_1/golden_cases/gc_sc_01/` is unchanged. Executable fixture loader `packages/fixtures/src/golden_cases/gc_sc_01.node.ts`; structural test `packages/fixtures/tests/golden-case-gc-sc-01.test.ts`; orchestrator-layer harness `packages/solver-adapter/tests/shortCircuit.goldenCaseGcSc01.test.ts` (Layer 1 always — AppNetwork build; Layer 2 always — orchestrator vs stub transport with hand-calc values; Layer 3 opt-in — strict comparison vs real sidecar, gated by both `RUN_SIDECAR_INTEGRATION=1` and `RUN_GOLDEN_CASE_VERIFICATION=1`). Stage 3 closeout §4.1 records the residual carryover. `scripts/acceptance-coverage.json` `stage3GoldenCases[].referenceStatus` for `GC-SC-01` is `provisional`. | Plan §14's completion criterion is satisfied by the original "explicit deferral" path; PR #18 then integrated the executable harness without promoting to verified. The integration status remains `provisional` because the simplified hand-calc uses `voltageFactorC = 1.0` while pandapower's `case="max"` defaults to `c=1.05` (LV) / `c=1.10` (HV); the documented 5–10% mismatch surfaces in Layer 3 until S3-OQ-08 voltage-factor alignment ships. The support-package artifact's own `referenceStatus: "verified"` field describes only the hand-calc reference and is distinct from the Stage 3 Golden Case integration status. | Promotion of `stage3GoldenCases[].referenceStatus` from `provisional` to `verified` requires (a) S3-OQ-08 voltage-factor alignment landing and (b) Layer 3 strict sidecar comparison passing within the documented ±1% / ±2% tolerance. **GC-SC-01 should remain `provisional` until both gates close.** This review does **not** promote it. |
| 6 | UI displays real results only — never fabricated numbers. | satisfied | PR #16 Short Circuit UI: `apps/web/src/components/ShortCircuitResultTable.tsx` renders nullable numeric fields explicitly; per-row `issueCodes` are surfaced (PR #16 commit `f448a74`). PR #23 Equipment Duty UI: `apps/web/src/components/DutyCheckResultTable.tsx` renders numeric cells as `—` for `null` values, never `0` — `apps/web/tests/DutyCheckUI.test.tsx` pins this. `CalculationStatusPanel.tsx` Run buttons are readiness-gated (four-state contract for Duty Check; validation-blocked for Short Circuit). Stage 3 closeout §3 AC-S3-05 owner; Equipment Duty closeout §3.4 / §5.1 (UI numeric rendering row). | Short Circuit failed / unavailable rows render explicit empty cells plus issue codes; Equipment Duty `not_evaluated` / `missing_rating` / `not_applicable` rows render empty cells plus status badge and issue codes. | None. SC diagram overlay (S3-FU-11) is deferred — not a Stage 3 acceptance owner, see §9.4 below. |
| 7 | Stage 3 acceptance mapping (`AC-S3-01..07`) is complete in `scripts/acceptance-coverage.json` and enforced by `scripts/check-acceptance.ts`, with any deferred items explicitly marked. | satisfied | PR #17 ships the `stage3` block in `scripts/acceptance-coverage.json` with all seven `AC-S3-01..07` rows `mapped` (none `deferred`). `scripts/check-acceptance.ts` extends `stage3Expected` to enumerate the seven IDs and exits with `mapped` tags. PR #18 adds a separate `stage3GoldenCases` block (Golden Case integration tracking; **not** an `AC-S3-*` owner). PR #24 intentionally does **not** extend the manifest with a `stage3EquipmentDuty` block, per the closeout brief. | The Short Circuit MVP acceptance manifest is complete and enforced. The Equipment Duty `AC-S3-D01..D09` template is **defined in spec** (Equipment Duty spec §4.7) but **not in the manifest** — this is the documented decision recorded in Equipment Duty closeout §4 / §5.2, not a gap. | A future PR may add the `stage3EquipmentDuty` block — with or without `deferred-*` markers per Equipment Duty spec §11 reconciliation policy — when either (a) the real Equipment Duty calculation ships or (b) the project explicitly decides contract-level scaffolding ownership is acceptable. |
| 8 | Stage 1 and Stage 2 guardrails remain green. | satisfied | Stage 1 canonical schema is unchanged across PRs #11–#19. PRs #20–#24 add only **optional** Stage 1 fields (ED-PR-01) so pre-existing project files round-trip unchanged — `packages/schemas/tests/canonical-drift.test.ts` and `packages/project-io/tests/equipment-duty-round-trip.test.ts` pin this. AppNetwork remains solver-agnostic across Stage 3 (Stage 3 closeout §3 AC-S3-02 owner). Stage 2 Load Flow / Voltage Drop runtime path is unchanged across Stage 3 — no Stage 2 test was modified across PRs #11–#24. The Stage 2 stale-flag rule (no auto-recompute on project edit) extends unchanged to Short Circuit and Duty Check. | — | None. |
| 9 | No Cable Sizing, Cable Withstand, or Report Workflow scope leaks into Stage 3. | satisfied | No Cable Sizing engine code, ampacity computation, or Excel / PDF / certified report output was added across PRs #11–#24. Cable short-circuit withstand was **scoped into the Equipment Duty effort** per Equipment Duty spec §4.4 / ED-OQ-04 — `Cable.shortCircuitKValue` is an optional Stage 1 schema field added in ED-PR-01, but the real cable I²t calculation has **not** shipped (Equipment Duty closeout §4 limitations #1, #3). Cable Sizing (Stage 4) is **not** the same as cable short-circuit withstand: sizing decides cross-section from ampacity + voltage drop; withstand decides whether an already-sized cable survives a fault. The withstand surface lives inside Equipment Duty, not Cable Sizing — confirmed by both Equipment Duty spec §4.4 and plan §9. | The cable `shortCircuitKValue` field is added to the canonical schema in ED-PR-01 as part of the Equipment Duty scope. It is **not** Cable Sizing scope. No Stage 4 work is pre-staged in Stage 3. | None. |

**Headline.** Plan §14's nine completion bullets (eight numbered plus
the "no scope leakage" guardrail) are all satisfied. Two bullets
(#4 Equipment Duty and #5 GC-SC-01) explicitly allow "deferred"
as satisfying completion; in both cases Stage 3 went beyond the
strict requirement and landed scaffolding (#4) / executable
integration (#5), with the residual real-engineering / verified-status
work explicitly carried over.

---

## 5. GC-SC-01 status review

The Stage 3 Golden Case integration status for **GC-SC-01** in
`scripts/acceptance-coverage.json` `stage3GoldenCases[]` is
**`provisional`**. This review records the current state and does
**not** promote it.

**What exists.**

- **Static support-package artifact** (Stage 1 baseline,
  unchanged by PR #18):
  - `docs/stage-1-baseline/stage_1_preimplementation_support_v1_1/golden_cases/gc_sc_01/GC-SC-01.utility_transformer_lv_fault.json`
    with `caseId: "GC-SC-01"` and a self-describing
    `referenceStatus: "verified"` field that refers to the
    *independent hand-calc reference* — i.e., the hand-calculation
    documented in the companion `GC-SC-01.hand_calculation.md` is
    treated as a verified reference. This field is **not** the same
    as the Stage 3 Golden Case integration status in the acceptance
    manifest.
- **Executable fixture loader** (PR #18, Node-only subpath):
  - `packages/fixtures/src/golden_cases/gc_sc_01.node.ts` exposes
    `getGoldenCaseGcSc01()` / `parseGoldenCasePercentTolerance()` /
    `GOLDEN_CASE_GC_SC_01_PATH`. Node-only because it reads the
    authoritative docs JSON via `node:fs`; the root
    `@power-system-study/fixtures` entrypoint stays browser-safe so
    `apps/web` (Vite) can keep importing the demo fixture.
  - `packages/fixtures/tests/golden-case-gc-sc-01.test.ts` pins the
    documented hand-calc expected values
    (`Ik'' = 42.46 kA`, `ip = 97.55 kA`, `X/R = 6.22`) and the
    documented tolerance literals (`±1% / ±2% / ±5%`).
- **Orchestrator-layer comparison harness** (PR #18):
  - `packages/solver-adapter/tests/shortCircuit.goldenCaseGcSc01.test.ts`
    runs three layers:
    - **Layer 1 (always):** `buildAppNetwork(...)` against the
      artifact's `input.projectFile`; asserts the result is `valid`
      and that the slack utility, MV bus, transformer, and LV fault
      target are wired.
    - **Layer 2 (always):** drives `runShortCircuitForAppNetwork`
      against a stub transport replaying the hand-calc reference
      values; asserts the loader → orchestrator → tolerance
      comparison pipeline holds end-to-end without invoking
      pandapower, so it is part of stock CI.
    - **Layer 3 (opt-in):** strict comparison against the real
      Python sidecar, gated by **both**
      `RUN_SIDECAR_INTEGRATION=1` (pandapower smoke gate) and
      `RUN_GOLDEN_CASE_VERIFICATION=1` (explicit consent to the
      strict ±1% / ±2% comparison).

**Why it remains `provisional`.**

Layer 3 is expected to surface a 5–10% mismatch versus the hand
calculation because the simplified hand-calc assumes
`voltageFactorC = 1.0` while pandapower's `case="max"` defaults to
`c = 1.05` (LV) / `c = 1.10` (HV). That mismatch IS the documented
finding (Stage 3 closeout §4.1 / plan §10) — it is **not** treated
as a bug. The mismatch is the gap that must close before the
`provisional` integration status can be promoted to `verified`.

**Separation of simplified hand-calc vs strict IEC 60909 reference.**

Plan §10 / S3-OQ-08 require that "simplified hand calculations must
not be called strict IEC references" and that "pandapower smoke
tests must not be called verified Golden Cases." The current
PR #18 harness preserves this separation:

- Layer 2's stub transport replays the documented hand-calc values
  to exercise the *pipeline*, not to claim solver verification.
- Layer 3's strict comparison runs against the real sidecar, but is
  opt-in and `provisional`-labeled until S3-OQ-08 closes.
- The support-package artifact's `referenceStatus: "verified"`
  field on the JSON refers only to the hand-calc reference, not to
  the solver-vs-reference comparison. This separation is recorded
  explicitly in Stage 3 closeout §4.1.

**Recommendation.** GC-SC-01's Stage 3 Golden Case integration
status **should remain `provisional` for Stage 4 hand-off**. The
promotion gates (S3-OQ-08 voltage-factor alignment + Layer 3 pass
within ±1% / ±2%) are **not** Stage 4 prerequisites — Stage 4 may
begin with GC-SC-01 still `provisional`. Promotion is a separate
Short Circuit Golden Case refinement PR that is tracked in the
deferred-items section (§9 below) and is **not blocking** for
Cable Sizing Integration work.

This review does **not** promote GC-SC-01 to verified and does
**not** modify `scripts/acceptance-coverage.json` or any harness file.

---

## 6. Equipment Duty review

Equipment Duty work that shipped across PRs #19–#24:

**Spec / OQ closure (PR #19).** Plan §8 pre-implementation OQ gate
closed: ED-OQ-01 (rating fields, optional, schema-only PR boundary);
ED-OQ-02 (missing-rating policy: `unavailable` + `W-DC-001`, run not
blocked); ED-OQ-03 (duty basis: `Ib` primary at MVP spec `tmin = 0.05 s`
verified, `Ik''` fallback with `W-DC-002` provisional, thermal /
cable using `faultClearingS = 0.5 s` default with `W-DC-003`
provisional); ED-OQ-04 (cable withstand inside Equipment Duty, not
Cable Sizing); ED-OQ-05 (90% / 100% threshold table fixed for MVP);
ED-OQ-06 (runtime-only `"duty_check_bundle"` retention); ED-OQ-07
(`AC-S3-D01..D09` template); ED-OQ-08 (non-goals: Cable Sizing /
Report Workflow / arc flash / breaker arc model / vendor split /
per-zone clearing time / motor + generator subtransient / per-source
breakdown). The plan §6.6 "PR #5A or later" placeholder is
superseded by the spec §8 canonical PR breakdown (ED-PR-01..05).

**Schema fields added (PR #20 / ED-PR-01).** All optional on the
Stage 1 canonical schema (`Rev D`), so pre-existing project files
round-trip unchanged (pinned by
`packages/project-io/tests/equipment-duty-round-trip.test.ts`):

- `Breaker.interruptingCapacityKa`, `Breaker.peakWithstandKa`.
- `Switch.shortTimeWithstandKa`, `Switch.shortTimeWithstandDurationS`,
  `Switch.peakWithstandKa`.
- `Bus.shortTimeWithstandKa`, `Bus.shortTimeWithstandDurationS`,
  `Bus.peakWithstandKa`.
- `Cable.shortCircuitKValue`.
- `ProjectMetadata.shortCircuit.defaultFaultClearingS`.

The canonical-drift test is updated to pin the new fields. No field
is required, renamed, or removed.

**Contract / result model added (PR #21 / ED-PR-02).** New package
`@power-system-study/duty-check` exports the result-model types
defined in Equipment Duty spec §5 (`DutyCheckEquipmentKind`,
`DutyCheckDutyKind`, `DutyCheckStatus`, `DutyCheckVerdictBasis`,
`DutyCheckIssueCode`, `DutyCheckIssue`, `DutyCheckEquipmentResult`,
`DutyCheckResultMetadataBasis`, `DutyCheckResult`, `DutyCheckOptions`,
`DutyCheckRunBundle`, `DutyCheckCriterion`, `DutyCheckRunStatus`).
Every numeric duty / rating / utilization / margin field is typed
`number | null` so a future real-calculation PR can land without
producer-side breakage.

**Readiness wrapper + orchestrator + runtime retention added
(PR #22 / ED-PR-03).** `evaluateDutyCheckReadiness()` is a pure
function returning one of four states: `ready_to_run`,
`blocked_by_upstream`, `blocked_by_stale_upstream`,
`blocked_by_validation`. `runDutyCheckForBundle()` consumes a
`ShortCircuitRunBundle` plus an optional Stage 1 project file and
emits a `DutyCheckRunBundle`. The orchestrator enumerates per-equipment
rows from the project file's rating fields and emits one of three
status values per row:

- `not_applicable` (`I-DC-001`) — criterion does not apply to the
  equipment kind.
- `missing_rating` (`W-DC-001`) — rating field is absent on a
  ratable element.
- `not_evaluated` (`I-DC-002`) — row emitted for accounting; no real
  calculation performed.

Upstream-failed Short Circuit → empty rows + info-level top-level
note + `status: "failed"`. The runtime retention layer is widened to
hold the duty bundle: `CalculationModule` →
`"load_flow_bundle" | "short_circuit_bundle" | "duty_check_bundle"`;
`RuntimeCalculationRecord.bundle` →
`LoadFlowRunBundle | ShortCircuitRunBundle | DutyCheckRunBundle`;
reducer retains under the `(scenarioId, "duty_check_bundle", null)`
key. Stale flag flips on project edit; no auto-recompute.

**UI wiring added (PR #23 / ED-PR-04).** `DutyCheckResultTable.tsx`,
`CalculationStatusPanel.tsx` extension, `runDutyCheck()` action,
React-side `DutyCheckState` lifecycle slot, parallel stale flag.
Numeric cells render `—` for `null` — **never `0`**. Run button is
gated by the four-state readiness contract.

**Acceptance closeout completed (PR #24 / ED-PR-05).** Equipment
Duty closeout document + two carryover UI tests pinning the
`blocked_by_stale_upstream` and `blocked_by_upstream`-via-failed-SC
disabled-reason paths.

**Boundaries this review preserves (what Equipment Duty
explicitly does *not* claim today).** Per Equipment Duty closeout
§4 (the eight numbered current limitations):

- **No real Equipment Duty engineering calculation has shipped.**
  `runDutyCheckForBundle()` is a contract / wiring orchestrator. It
  does not compute breaker interrupting duty (`Ib` per IEC 60909-0
  §4.5), peak duty (`ip`), thermal withstand (`Ith`), or cable I²t.
  No duty-basis matrix entry from Equipment Duty spec §4.3 is yet
  realized in code.
- **No pass / fail / warning duty evaluation has shipped.** The
  90% / 100% threshold table from spec §4.5 is documented but not
  implemented. The orchestrator does not emit `pass`, `fail`, or
  `warning` rows — only `not_evaluated` / `missing_rating` /
  `not_applicable`.
- **Numeric duty / rating / utilization / margin fields remain `null`**
  on every `DutyCheckEquipmentResult` produced today. The UI renders
  these as `—`. No row carries a fabricated `0`.
- **`verdictBasis: "provisional"` on every emitted row.** The
  `verified` literal in the contract is reserved for the future
  real-calculation rows. No row at HEAD claims algorithmic
  verification.
- **Equipment Duty is NOT a verified Golden Case.** No `GC-DC-*`
  artifact has been authored. No `stage3EquipmentDutyGoldenCases`
  block exists. The Equipment Duty `verdictBasis: "verified"`
  literal — when it eventually appears in producer code — will mean
  *algorithmically* verified against the spec basis matrix, **not**
  release-gate-verified against an independent reference (Equipment
  Duty spec §9 / ED-FU-09).

This review preserves the boundary verbatim: numeric duty / rating /
utilization / margin fields **remain `null`** unless and until a later
implementation formally adds a real engineering calculation. No Stage 4
work in this overall review changes that.

---

## 7. Runtime / project-file separation review

Stage 3 preserves the runtime-only result retention discipline
established in Stage 2. Concretely:

- **Calculation results remain at the runtime / store layer.**
  Load Flow + Voltage Drop results, Short Circuit results, and
  Duty Check results all live in
  `@power-system-study/calculation-store`'s
  `retainedResults` map under
  `(scenarioId, module, subCase)` keys. The widened union is
  `LoadFlowRunBundle | ShortCircuitRunBundle | DutyCheckRunBundle`.
- **Duty Check results are not persisted into project files.**
  `apps/web/tests/DutyCheckUI.test.tsx` asserts
  `serializeProjectFile(project)` is byte-identical before and
  after a Duty Check run. The Stage 3 Short Circuit equivalent
  assertion lives in `apps/web/tests/calculationStore.test.tsx`.
- **`project.calculationSnapshots` is not widened silently.**
  `packages/schemas/src/stage_1_project_schema.rev_d.zod.ts` pins
  the field to `max(0)` (an empty array). No Stage 3 PR populates
  the array. The canonical-drift test continues to pass.
- **`calculationResults` is not introduced.** No Stage 3 PR adds
  a `calculationResults` field to the canonical schema or to the
  serialized JSON.
- **No fake calculation results are persisted, anywhere.**
  Short Circuit failed rows surface `E-SC-*` codes with all-null
  numerics; orchestrator-synthesized `unavailable` rows have
  null numerics. Duty Check `not_evaluated` / `missing_rating` /
  `not_applicable` rows have null numerics. The UI renders `—`
  for every `null` numeric cell — never `0`.

**Uncertainty / future-verification items.** None at this review.
The retention discipline is exercised by:

- `packages/calculation-store/tests/reducer.test.ts` (Short Circuit
  retention).
- `packages/calculation-store/tests/duty-check-retention.test.ts`
  (Duty Check retention).
- `apps/web/tests/calculationStore.test.tsx` (project file unchanged
  after SC run).
- `apps/web/tests/DutyCheckUI.test.tsx` (project file unchanged
  after Duty Check run).
- The canonical-drift and round-trip tests
  (`packages/schemas/tests/canonical-drift.test.ts`,
  `packages/project-io/tests/round-trip.test.ts`,
  `packages/project-io/tests/equipment-duty-round-trip.test.ts`).

No item under this section is carried into Stage 4 as an open
question.

---

## 8. Scope-leakage review

Stage 3 did **not** leak scope into:

- **Cable Sizing engine (Stage 4 charter).** No ampacity computation,
  no IEC 60364-5-52 sizing curves, no cross-section selection logic,
  and no cable-sizing UI shipped in Stage 3. The optional
  `Cable.shortCircuitKValue` field added in ED-PR-01 is for
  Equipment Duty cable short-circuit *withstand* (whether a
  pre-sized cable survives a fault), **not** for Cable Sizing
  (deciding the cross-section). Equipment Duty spec §4.4 records
  the separation explicitly.
- **Report Workflow (Stage 5 charter).** No Excel export, no PDF
  certified report output, no report template UI, and no
  certified-output path shipped in Stage 3.
- **Unrelated Stage 1 / Stage 2 behavior.** Stage 1 canonical
  project schema additions are exclusively the optional Equipment
  Duty rating fields landed in ED-PR-01; no other field was added,
  renamed, or removed. Stage 2 Load Flow / Voltage Drop runtime
  path is unchanged across Stage 3 — no Stage 2 test was modified
  across PRs #11–#24.
- **Unrelated project-schema changes.** No `calculationResults`
  field. No widening of `calculationSnapshots`. No persisted
  calculation outputs. No vendor-specific equipment fields beyond
  the Equipment Duty rating fields explicitly authorized in
  Equipment Duty spec §4.1 / ED-OQ-01.
- **Arc flash, breaker arc-impedance, motor / generator
  subtransient, per-source contribution breakdown, ANSI / IEEE
  C37 basis, per-zone protection clearing time.** All recorded as
  explicit non-goals in Equipment Duty spec §7 / ED-OQ-08 and
  Short Circuit MVP spec §15. None implemented.

No scope-leakage findings.

---

## 9. Deferred / gated follow-ups

This section separates **deferred items** (work that was acknowledged
in spec / plan / closeout and not delivered), **gated follow-ups**
(work that requires a specific gate to close before any code lands),
and **non-blocking backlog** (refinements that may land in any future
PR without changing the Stage 3 / Stage 4 boundary).

### 9.1 Deferred (not blocking Stage 4)

| Item | Source of deferral | Notes |
|---|---|---|
| GC-SC-01 Stage 3 Golden Case integration status promotion from `provisional` to `verified` | Stage 3 closeout §4.1; plan §10; Equipment Duty closeout §6. | Requires (a) S3-OQ-08 voltage-factor alignment in the sidecar, and (b) Layer 3 strict comparison against the real sidecar passing within ±1% / ±2%. Until then, the support-package artifact's own `referenceStatus: "verified"` field on the JSON describes only the hand-calc reference and remains distinct from the Stage 3 Golden Case integration status. |
| `validateForShortCircuit()` readiness wrapper as a named export under `packages/validation/` | Stage 3 closeout §4.4. | PR #16 gates the Short Circuit Run button on the existing Stage 2 readiness path plus transport availability, satisfying the spec §9.4 contract for the user-visible disabled / enabled states. A future PR may introduce the named export and `packages/validation/tests/short-circuit-readiness.test.ts`. |
| SC diagram overlay (`Ik''` painted near each bus on `DiagramCanvas.tsx`) | S3-FU-11; spec §9.3; Stage 3 closeout §4.3. | UI-only follow-up; spec already records the deferral. |
| Golden Case schema extension (Stage 2 §12.7 equivalent) for `verified` / `provisional` / `regression_only` invariant | S3-FU-09; Stage 3 closeout §4.1. | Currently encoded as free-form artifact fields; future Zod schema move when a second Golden Case appears. |
| Short Circuit minimum case (`case = "min"`) | S3-FU-01; spec §S3-OQ-03. | MVP is maximum-case only. |
| Mid-line / branch-end / transformer-terminal faults | S3-FU-02; spec §S3-OQ-04. | MVP is bus-only. |
| Generator subtransient short-circuit contribution | S3-FU-03; spec §S3-OQ-05. | Requires new contract field plus a verified Golden Case. |
| Motor short-circuit contribution | S3-FU-04; spec §S3-OQ-05. | Same constraint as generator. |
| Per-source `Ik''` contribution breakdown | S3-FU-05. | — |
| `scLevelMva` vs `faultCurrentKa` inconsistency tolerance | S3-FU-06. | Deferred to a future tuning PR. |
| X/R default when `xrRatio` is missing | S3-FU-07. | MVP fail-closes with `E-SC-002`. |
| ANSI / IEEE C37 calculation basis | S3-FU-08. | MVP is IEC 60909 only. |
| Disk persistence of runtime snapshots / result bundles | S3-FU-10; Stage 2 §S2-FU-07. | All retention runtime-only. |
| `AC-S3-D01..D09` acceptance manifest entries (`stage3EquipmentDuty` block) | Equipment Duty spec §4.7; Equipment Duty closeout §4 / §5.2. | Manifest not extended at ED-PR-05; awaits either (a) the real Equipment Duty calculation, or (b) an explicit spec-revision decision to record contract-level scaffolding ownership. |
| Equipment Duty spec Rev A.1+ revision note (closeout recorded inline) | Equipment Duty spec §8.5 recommendation; Equipment Duty closeout §5.2. | Standalone closeout document preferred to keep spec stable. A documentation-only forward-pointer follow-up may land later. |
| Implementation plan §6.6 / §8 plan-text synchronization to point at Equipment Duty spec §8 | Equipment Duty spec §1.4 / §11. | Plan-edit follow-up is documentation-only and **not** a prerequisite for any Equipment Duty code-work. |

### 9.2 Gated follow-ups (require a specific gate before code)

| Item | Gate |
|---|---|
| Real Equipment Duty engineering calculation — breaker `Ib` derivation at `tmin = 0.05 s`, `Ik''` fallback, peak `ip`, thermal `Ith` scaling, cable `I²t_actual = (ikssKa × 1000)² × faultClearingS` vs `I²t_allowed = (K × A)²` | Equipment Duty spec §4.3 / §4.4 already closed (the OQ gate); the next gate is implementation PR scope — the work lands as an extension of the existing `packages/duty-check/` package under the contract surface already shipped by ED-PR-02. No further spec revision is required to begin, but the implementation PR must (a) land Golden Case parity tests where feasible, and (b) explicitly distinguish `verdictBasis: "verified"` (algorithmically verified) from release-gate-verified Golden Case parity. |
| Real Equipment Duty pass / warning / fail evaluation per Equipment Duty spec §4.5 threshold table (`ok` ≤ 90% / `warning` > 90% / `violation` > 100%) | Same gate as above — bundles with the real calculation. |
| Equipment Duty Golden Cases (`GC-DC-*`, ED-FU-09) | Spec §9 — even after the real calculation ships, `verdictBasis: "verified"` does **not** equal a release-gate-verified Golden Case. The `GC-DC-*` family is a separate post-real-calc release-quality follow-up. Not blocking Stage 4 Cable Sizing in any case. |
| Cable short-circuit withstand UI exposure parity with breaker / switch / bus rows | Equipment Duty spec §4.4 + the same real-calculation gate; cable rows already share the same `equipmentResults[]` slot in the contract, so UI parity falls out naturally from the real-calc PR. |
| Per-zone protection clearing time replacing the project-level `defaultFaultClearingS` default (ED-FU-04) | Future PR — until it lands, real thermal and cable-withstand rows are designed to carry `verdictBasis: "provisional"` and `W-DC-003`. Not blocking Stage 4. |

### 9.3 Non-blocking backlog (no spec change required; not blocking Stage 4)

- ED-FU-01 — per-project tunable thresholds.
- ED-FU-02 — per-assembly switchgear ratings distinct from busbar
  ratings.
- ED-FU-03 — vendor-specific breaker rating split (`ICU` vs `ICS`).
- ED-FU-05 — per-equipment `tmin` override for `Ib` derivation.
- ED-FU-06 — cable upstream / downstream end selection refinement.
- ED-FU-07 — per-fault-target sub-cases on the duty result.
- ED-FU-08 — diagram overlay for duty status (parallels S3-FU-11).
- Cable Sizing Integration must use **existing LV Cable Sizing
  engine / assets** rather than a from-scratch implementation —
  see §10 below. This is recorded as a Stage 4 *starting point*,
  not as a backlog item to land before Stage 4 begins.

---

## 10. Readiness for Stage 4

**Conclusion.** Stage 3 is ready to hand off to Stage 4.

Stage 3 acceptance is closed at the Short Circuit MVP level
(`AC-S3-01..07` all `mapped` per PR #17). Equipment Duty
scaffolding is in place (PRs #19–#24) with its limitations
explicitly recorded. The runtime / project-file separation
discipline is preserved end-to-end. No Cable Sizing or Report
Workflow scope has leaked into Stage 3.

The carryover items in §9.1 / §9.2 / §9.3 do **not** block Stage 4
Cable Sizing Integration from starting. Specifically:

- GC-SC-01 may remain `provisional` for the duration of Stage 4
  work.
- Equipment Duty real-calculation work is **not** a Stage 4
  prerequisite — it lives in its own ED follow-up PR family that
  may land in parallel with, before, or after Stage 4 work.
- The `stage3EquipmentDuty` acceptance-manifest block may stay
  absent during Stage 4 work; its decision is independent of
  Cable Sizing.

**Stage 4 must begin with the following deliverables before any
Cable Sizing code lands**, in the same documentation-first
operating model used for Stage 2 and Stage 3:

1. **Cable Sizing Integration Spec** — a Stage 4 spec document
   under `docs/stage-4/` (filename to be set by the spec author,
   e.g., `stage_4_cable_sizing_integration_spec.md`). The spec
   must define: (a) which existing LV Cable Sizing engine / assets
   are being integrated and from where; (b) the engine / package
   / API boundary on the TypeScript side (per the Stage 2 / Stage 3
   adapter-contract pattern); (c) which Stage 1 canonical schema
   fields are read (and any new optional fields, with the same
   minor-rev / canonical-drift discipline used by ED-PR-01); (d)
   the result model and per-row status / nullability rules; (e)
   the runtime-only retention policy; (f) the AppNetwork
   integration boundary; (g) the relationship to Equipment Duty
   cable withstand (Equipment Duty spec §4.4); and (h) the
   acceptance criteria template (`AC-S4-NN`).
2. **OQ formal decisions** — a Stage 4 OQ block paralleling the
   plan §8 pre-implementation OQ gate pattern, closing every
   open Cable Sizing decision (engine selection, asset migration
   policy, sizing-method scope — IEC 60364-5-52 vs alternatives,
   ampacity correction factors policy, voltage-drop coupling
   policy, multi-circuit / grouping policy, derating policy).
3. **Stage 4 implementation plan** — sequencing and merge criteria
   derived from the Stage 4 spec, mirroring Stage 3's plan
   structure (`docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md`).
4. **Existing LV Cable Sizing asset inventory** — an explicit
   inventory of the pre-existing LV Cable Sizing engine, package,
   tests, fixtures, golden cases, and any out-of-repo references
   that Stage 4 integration will consume. The inventory anchors
   the "integration, not greenfield" principle in §10.5 below.
5. **Existing engine / package / API boundary decision** — the
   specific TypeScript package layout for the Cable Sizing
   surface (e.g., a new `packages/cable-sizing/` paralleling
   `packages/duty-check/`, or an integration into an existing
   package), the public API shape (a `runCableSizingForAppNetwork()`
   orchestrator paralleling `runShortCircuitForAppNetwork()` and
   `runDutyCheckForBundle()` is the natural pattern, but the spec
   must record the actual decision), and the relationship to the
   existing solver-adapter / sidecar boundary (Cable Sizing may
   not require a Python sidecar — the spec must close that
   question explicitly).
6. **GC-LV migration / preservation policy** — an explicit policy
   for how any pre-existing LV Cable Sizing Golden Cases will be
   migrated into the Stage 4 surface (or preserved untouched as
   support-package artifacts à la GC-SC-01's static JSON). The
   policy must distinguish (as Stage 3 did for GC-SC-01) the
   support-package artifact's own `referenceStatus` field from
   the Stage 4 Golden Case integration status in the acceptance
   manifest.

### 10.5 Integration, not greenfield

Stage 4 Cable Sizing is **integration of existing Cable Sizing
assets**, not a greenfield Cable Sizing engine rewrite. The same
principle that GC-SC-01 integration (PR #18) was the integration
of an already-documented hand-calc artifact into an executable
harness — not a re-derivation of the artifact — applies here:
Stage 4 must take the existing LV Cable Sizing engine, inventory
its API surface and behavior, and wire it into the Stage 1
schema + AppNetwork + runtime-only-retention discipline used by
Stage 2 / Stage 3. Replacing the existing engine with a
from-scratch implementation is **out of scope** for Stage 4 and
would require an explicit spec-revision decision before any code
lands.

### 10.6 Stage 3 / Stage 4 separation that must hold

For traceability when Stage 4 begins, the following Stage 3
boundaries must continue to hold under Stage 4 work:

- The Stage 1 canonical project schema must continue to
  round-trip pre-existing project files. Any Cable Sizing schema
  additions must be optional and pinned by the canonical-drift
  test (the ED-PR-01 pattern).
- `calculationSnapshots` must remain `max(0)` and empty. No
  Cable Sizing result is persisted to the project file.
- `calculationResults` must not be introduced.
- AppNetwork must remain solver-agnostic.
- No Cable Sizing result may render as a fabricated number.
  Nullable numeric fields render as `—`, not `0`.
- Stage 2 Load Flow + Voltage Drop and Stage 3 Short Circuit +
  Equipment Duty behavior must remain unchanged under Stage 4.
- Cable short-circuit withstand remains an **Equipment Duty**
  responsibility, not a Cable Sizing responsibility — Stage 4
  must not absorb withstand scope.

---

## 11. Summary

- Stage 3 functional sequence is complete on `main` through PR #24
  (Equipment Duty acceptance closeout).
- Plan §14 completion criteria are all satisfied — two by explicit
  deferral and additional scaffolding (Equipment Duty Check;
  GC-SC-01), seven by direct delivery.
- `AC-S3-01..07` are all `mapped` in the acceptance manifest.
- `stage3GoldenCases[]` records GC-SC-01 at `provisional`; this
  review does **not** promote it.
- `stage3EquipmentDuty` block is intentionally absent from the
  manifest pending either a real-calculation PR or a separate
  spec-revision decision; this review does **not** add it.
- No real Equipment Duty engineering calculation has shipped; no
  pass / fail / warning duty evaluation; numeric duty / rating /
  utilization / margin fields remain `null` on every emitted row.
- No Cable Sizing or Report Workflow scope has leaked into
  Stage 3.
- Stage 3 is ready for Stage 4. Stage 4 must begin with a Cable
  Sizing Integration Spec, formal OQ closure, an implementation
  plan, an explicit inventory of the existing LV Cable Sizing
  assets, an engine / package / API boundary decision, and a
  GC-LV migration / preservation policy. Stage 4 Cable Sizing
  is integration, not a greenfield rewrite.
