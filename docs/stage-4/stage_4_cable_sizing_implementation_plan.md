# Stage 4 Implementation Plan — Cable Sizing Integration

**Project:** Power System Study App
**Stage:** Stage 4 — Cable Sizing Integration
**PR:** Stage 4 PR #1 (this document, paired with the Stage 4
integration spec — `docs/stage-4/stage_4_cable_sizing_integration_spec.md`)
**Branch:** `stage-4/pr-01-cable-sizing-integration-spec`
**Status:** Documentation / planning only. No runtime, calculation,
schema, sidecar, project-IO, store-architecture, UI, fixture, test,
acceptance-tooling, or Golden Case-expected-value change.
**Date:** 2026-05-15
**Baseline spec:** `docs/stage-4/stage_4_cable_sizing_integration_spec.md`
**HEAD basis:** PR #25 merge commit `2cc5890`.

This plan translates the merged Stage 4 Cable Sizing Integration Spec
into a per-PR implementation sequence with merge criteria, risk
controls, and the Stage 4 closeout / overall-review policy.

It does not replace the Stage 4 spec. Per Stage 3 plan §3.4 (the
plan-vs-spec reconciliation policy that applies to Stage 4 verbatim),
the Stage 4 spec owns OQ decisions, the result-model shape, the Golden
Case policy, the acceptance-criteria template, and the non-goals; this
plan owns the implementation-PR sequencing, merge criteria, and risk
control derived from that spec. If any future Stage 4 PR needs to
diverge from a spec decision, the spec PR change comes first.

---

## 1. Document hierarchy

The Stage 4 documents fit the project operating model:

| Document Level | Role |
|---|---|
| **PRD v1.0** | Product-level baseline. Anchors PRD §15 OQ-03, PRD §7.7 FR-CS-000 / FR-CS-001 / FR-CS-002 / FR-CS-003 / FR-CS-004, PRD §14.5, PRD §16, PRD §12.1 (Cable Sizing GC list), PRD §15 OQ-06 (1P2W / 3P3W standalone preservation). |
| **Stage 4 Spec** (`stage_4_cable_sizing_integration_spec.md`) | Stage-level scope, formal CS-OQ-1..14 decisions, result-model shape, Golden Case policy, acceptance-criteria template, non-goals. **Does not** carry PR sequencing or merge criteria. |
| **Stage 4 Implementation Plan** (this document) | PR sequencing, per-PR merge criteria, risk control, Stage 4 closeout / overall-review policy. **Does not** restate the spec's OQ decisions. |
| **PR-level task plan** | Concrete per-PR coding instructions written when each PR is opened. |

Stage 4 explicitly does **not** authorize:

- A Cable Sizing engine rewrite (any change from "reuse / integration"
  to "rewrite" requires a PRD revision; see Stage 4 spec §1.1).
- A change to Stage 1 / Stage 2 / Stage 3 behavior beyond optional,
  ED-PR-01-style, separately-gated schema additions.
- Persistence of calculation results / snapshots into the project
  file (CS-OQ-14).

---

## 2. Proposed PR sequence

The proposed Stage 4 PR sequence is below. PR labels use the
spec-relative form `CS-PR-NN`. As with Stage 3, the GitHub PR numbers
will differ from the `CS-PR-NN` labels and are recorded in each PR's
own description and in CS-PR-13 / CS-PR-14 closeout / review
documents.

The sequence is intentionally small and reviewable. It is structured
so that:

- The integration **starting point** (CS-PR-01 / CS-PR-02 / CS-PR-03)
  is documentation / spec / inventory only — no engine code is moved
  or imported until the inventory and boundary are confirmed.
- The **engine integration** (CS-PR-04) lands inside a confirmed
  package boundary and is followed by **state-of-input hardening
  PRs** (CS-PR-05 .. CS-PR-09), each focused on a single
  fail-closed / stale-state surface.
- The **runtime / project-file separation hardening** (CS-PR-10) and
  **UI integration** (CS-PR-11) come after the engine surface is
  stable.
- The **GC-LV migration / preservation** (CS-PR-12) is its own PR so
  the classification policy (CS-OQ-11 / Stage 4 spec §6) is applied
  visibly and in isolation from engine logic.
- The **Stage 4 acceptance closeout** (CS-PR-13) extends
  `scripts/acceptance-coverage.json` with the `stage4` block and the
  `stage4GoldenCases` block.
- The **Stage 4 overall review** (CS-PR-14) is the Stage 5 hand-off
  document, paralleling the Stage 3 overall review (PR #25).

The plan stays flexible if the CS-PR-02 inventory shows the existing
LV Cable Sizing engine is already more (or less) integrated than
expected. Specifically, if the engine source turns out to already be
in this monorepo under a different name, CS-PR-04 may merge with
CS-PR-02 / CS-PR-03 into a smaller sequence; conversely, if the
engine has non-trivial refactor needs, additional refactor PRs may
be inserted between CS-PR-02 and CS-PR-04.

| Label | Title | Goal |
|---|---|---|
| **CS-PR-01** | Stage 4 Cable Sizing Integration Spec / OQ / Implementation Plan | Land the Stage 4 spec + implementation plan (this PR). Documentation only. |
| **CS-PR-02** | Inspect `Karma720809/cable-sizing`; existing Cable Sizing asset inventory; package/API boundary confirmation; integration-method decision | Inspect the **known external existing Cable Sizing source repository** `Karma720809/cable-sizing` (https://github.com/Karma720809/cable-sizing). Inventory its engine, validation rules, warning/error codes, UI, tests, fixtures, GC-LV cases (paths / IDs / verification basis), and report data structure. Confirm license / ownership / authorship / commit pin. Decide the package / API boundary inside `etap`. Decide the integration method (git subtree vs manual migration vs package extraction vs npm/workspace vs other) per CS-OQ-1. Identify what is reused as-is versus adapted at the integration boundary (CS-OQ-2). Documentation only. |
| **CS-PR-03** | Cable Sizing contract / result model and input mapping | Realize the Stage 4 spec §5 result model (`CableSizingRunBundle`, `CableSizingResult`, `CableSizingCableResult`, source / status types, issue-code namespace) and the CS-OQ-3 input contract mapping as TypeScript types. **Contract / wire types only — no engine, no orchestrator, no UI.** |
| **CS-PR-04** | Existing engine package integration | Move or import the existing Cable Sizing engine into the confirmed package boundary (`packages/cable-sizing/` or equivalent). Wire the engine to the contract surface from CS-PR-03 via an `engineAdapter` that translates between the engine's native input/output and the canonical contract. **Engine logic preserved verbatim.** No app-facing wiring. |
| **CS-PR-05** | Design current and input validation fail-closed hardening | Implement / register the Cable Sizing readiness wrapper (`evaluateCableSizingReadiness()` four-state contract), the design-current basis derivation per CS-OQ-4, and the invalid-state fail-closed policy per CS-OQ-13 for the design-current axis. |
| **CS-PR-06** | Reference method / loaded conductors / installation-state hardening | Implement CS-OQ-6 (loaded-conductors default, neutral toggle, invalid fail-closed) and CS-OQ-9 (reference-method hybrid exposure, stale-selection prevention). |
| **CS-PR-07** | Ampacity and correction-factor result-state hardening | Implement / wire ampacity-axis result row, correction-factor application (CS-OQ-8), defaulted-value visibility on the result row (CS-OQ-12 source/status separation; visible defaults). |
| **CS-PR-08** | Voltage drop result-state hardening | Implement / wire the Cable Sizing voltage-drop axis. Preserve the distinction from Stage 2 Voltage Drop (Stage 4 spec §3.2). Report design-current and operating-current voltage drop with explicit source/status when integrated mode is used. Stage 2 Voltage Drop runtime path is **unchanged**. |
| **CS-PR-09** | Short-circuit withstand result-state hardening (sizing-side) | Implement / wire the Cable Sizing short-circuit thermal withstand axis (sizing-side — CS-PR-09 is *not* the Equipment Duty cable-withstand surface, see Stage 4 spec §3.4). Consume Short Circuit run bundle outputs and `Breaker.faultClearingS` / project-level `defaultFaultClearingS`. |
| **CS-PR-10** | Runtime retention and project-file separation hardening | Add `"cable_sizing_bundle"` to the `CalculationModule` union; widen `RuntimeCalculationRecord.bundle` to the four-member union (`LoadFlowRunBundle | ShortCircuitRunBundle | DutyCheckRunBundle | CableSizingRunBundle`); add the `(scenarioId, "cable_sizing_bundle", subCase)` retention key; assert in tests that the project file is unchanged after a Cable Sizing run (the ED-PR-03 / ED-PR-04 retention pattern). |
| **CS-PR-11** | UI result / status / audit integration | Replace the current `cableSizing` Stage 4 placeholder in `apps/web/src/components/CalculationStatusPanel.tsx` with a real Run button and result table. Numeric `null` renders as `—`, never `0`. Per-row issue codes surfaced. Stale flag flips on project edit. Defaulted-value badges visible. |
| **CS-PR-12** | GC-LV Golden Case migration / preservation / classification | Migrate or preserve existing GC-LV Golden Cases per CS-OQ-11 / Stage 4 spec §6. Classify each as `verified` / `provisional` / `regression_only`. **No fake expected values.** Static support-package artifact `referenceStatus` distinct from acceptance-manifest integration `referenceStatus` (Stage 3 GC-SC-01 pattern). |
| **CS-PR-13** | Stage 4 acceptance closeout | Add the `stage4` block to `scripts/acceptance-coverage.json`; extend `scripts/check-acceptance.ts` `stage4Expected` to enumerate `AC-S4-01..AC-S4-15` (or the actual final count); add `stage4GoldenCases` block with each migrated GC-LV entry's `referenceStatus`. Closeout document under `docs/stage-4/`. |
| **CS-PR-14** | Stage 4 overall review | Mirror the Stage 3 overall review (`docs/stage-3/stage_3_overall_review.md`) for Stage 4: map all Stage 4 PRs, summarize completed acceptance coverage, classify deferred / gated follow-ups, confirm GC-LV status labels, confirm runtime / project-file separation, confirm no Stage 5 / arc-flash / coordination scope leakage. Stage 5 (Report Workflow) hand-off document. |

---

## 3. Per-PR merge criteria

Each PR carries: a **goal** (what changed when the PR merges), an
**allowed files / areas** list, a **forbidden scope** list, a
**minimum validation** list, and **merge criteria** (the evidence
required for merge).

Validation gates that run on **every** Stage 4 PR (unless explicitly
excepted by docs-only PRs):

- `pnpm typecheck` (TypeScript-level guard).
- `pnpm test` (unit test guard).
- `pnpm check:acceptance` (acceptance-manifest guard).
- `git diff --check` (whitespace / merge-marker guard).

Docs-only PRs (CS-PR-01, CS-PR-02, CS-PR-14) skip `pnpm test` only
when no test file is added or modified; `pnpm typecheck` and
`pnpm check:acceptance` always run.

### CS-PR-01 — Spec / OQ / Implementation Plan

- **Goal.** Land Stage 4 spec + Stage 4 implementation plan (this
  PR).
- **Allowed.** `docs/stage-4/stage_4_cable_sizing_integration_spec.md`,
  `docs/stage-4/stage_4_cable_sizing_implementation_plan.md`.
- **Forbidden.** Any code, schema, fixture, test, sidecar, UI,
  acceptance-coverage, or `scripts/check-acceptance.ts` change.
- **Minimum validation.** `pnpm typecheck`, `pnpm check:acceptance`,
  `git diff --check`.
- **Merge criteria.** Spec and plan accepted by the reviewer; no
  divergence from PRD §7.7 / §14.5 / §15 OQ-03 / §16 / Stage 3
  overall review §10 hand-off charter.

### CS-PR-02 — Inspect `Karma720809/cable-sizing`; inventory; boundary; integration method

- **Goal.** Inspect the **known external existing Cable Sizing
  source repository** `Karma720809/cable-sizing`
  (https://github.com/Karma720809/cable-sizing) named in CS-OQ-1 /
  Stage 4 spec §2.2. Produce the integration record that CS-PR-03
  and CS-PR-04 depend on. **Documentation only — no engine code is
  moved, copied, or imported in this PR.**
- **Inspection scope (against `Karma720809/cable-sizing`).**
  - **Engine.** Source files, entrypoints, public API shape,
    framework / runtime / build-tool assumptions, internal
    calculation modules (ampacity tables, voltage-drop derivations,
    derating-factor lookups, short-circuit withstand formulation).
  - **Validation rules.** Existing input-validation surface and
    rule set.
  - **Warning / error code namespace.** Exact code prefix family,
    code list, message strings.
  - **UI.** Existing screen surface and any UI-coupled API the
    engine exposes.
  - **Tests and fixtures.** Test runner, test count, fixture
    layout, any cross-module dependencies on the engine internals.
  - **GC-LV Golden Cases.** File paths, ID convention (whether
    `GC-LV-*` or another prefix), expected-value verification basis
    per case (hand calc / IEC textbook / verified spreadsheet /
    independent tool / regression-only / provisional). Includes the
    1P2W / 3P3W standalone cases preserved per PRD §15 OQ-06.
  - **Report data structure.** Existing report-row data model named
    by PRD §7.7 FR-CS-001 reuse list.
  - **License / ownership / authorship.** License file, copyright
    statements, contributor authorship in commit history relevant
    to integration.
  - **Documented known limitations.** Any LIMITATIONS / TODO /
    KNOWN_ISSUES doc inside the external repo.
  - **Commit pin.** Specific commit SHA selected as the integration
    baseline.
- **Decision scope.**
  - **Integration method (CS-OQ-1).** Select from at least: git
    subtree; manual migration (with explicit history / source /
    commit-reference note); package extraction into the `etap`
    monorepo; npm / pnpm workspace package; another explicitly
    reviewed approach. Record the rationale, the precise version /
    commit pin, the license / ownership assumption, and the retained
    verification evidence (especially for GC-LV expected values).
  - **Package / API boundary inside `etap` (CS-OQ-2).** Finalize
    package layout, public API names, file paths, and re-export
    tree.
  - **Reused as-is vs adapted (CS-OQ-2).** Per asset class
    (engine / validation / warning-error / UI / tests / fixtures /
    GC-LV / report data), record whether the asset is consumed
    as-is from the external repo or adapted at the integration
    boundary.
  - **Spec / plan reconciliation.** If the external repo's contents
    diverge from assumptions in this spec or this plan (e.g.,
    GC-LV ID prefix differs, code namespace differs, package layout
    forces a particular integration method), open a **reviewable
    follow-up PR** to update the spec / plan **before** CS-PR-03 /
    CS-PR-04 land (Stage 3 plan §3.4 reconciliation pattern).
- **Allowed files.** New / updated documentation under
  `docs/stage-4/` only (e.g.,
  `stage_4_cable_sizing_inventory_and_boundary.md`). No code, no
  schema, no fixture, no test, no UI, no
  `scripts/acceptance-coverage.json`, no
  `scripts/check-acceptance.ts`.
- **Forbidden.** Engine source code import / copy / vendor /
  modification (including any file from `Karma720809/cable-sizing`).
  Schema change. Fixture change. Test change. UI change.
  Acceptance-coverage change. Validation of the external repo's
  engineering formulas (verification basis classification is
  CS-PR-12 / Golden Case policy §6, not this PR). Migration of
  `Karma720809/cable-sizing` tests or fixtures into `etap`. Creation
  or restatement of GC-LV expected values.
- **Minimum validation.** `pnpm typecheck`, `pnpm check:acceptance`,
  `git diff --check`.
- **Merge criteria.** `Karma720809/cable-sizing` inspected at the
  selected commit pin; inventory recorded across all inspection-scope
  bullets; integration method selected with rationale; package
  layout and public API names finalized; reused-as-is vs adapted
  classification recorded per asset class; CS-PR-03 / CS-PR-04
  unblocked. Any open question discovered by the inspection must
  either close in this PR (with a documented decision) or update
  the Stage 4 spec §4 OQ table first via a separate spec-revision
  PR.

### CS-PR-03 — Contract / result model and input mapping

- **Goal.** Realize the Stage 4 spec §5 result-model types and the
  CS-OQ-3 input mapping as TypeScript types in the integration
  package.
- **Allowed.** New package directory (per CS-PR-02 boundary
  decision) — `packages/cable-sizing/src/types.ts`,
  `packages/cable-sizing/src/index.ts`,
  `packages/cable-sizing/tests/types.test.ts`,
  `packages/cable-sizing/package.json`, etc. No app-facing wiring.
- **Forbidden.** Engine code, orchestrator, UI, schema change,
  acceptance-coverage change, calculation-store change.
- **Minimum validation.** `pnpm typecheck`, `pnpm test`,
  `pnpm check:acceptance`, `git diff --check`.
- **Merge criteria.** Result-model types compile and round-trip
  through tests. Input contract mapping documented. No fabricated
  numeric defaults. Source / status separation preserved (CS-OQ-12).
  Any discovery that a required cable-side schema field is missing
  on the Stage 1 schema is **deferred to a separate gated PR** per
  CS-OQ-14 — never bundled here.

### CS-PR-04 — Engine package integration

- **Goal.** Move or import the existing Cable Sizing engine into the
  confirmed package boundary; wire to CS-PR-03 contract via
  `engineAdapter`. Engine logic preserved verbatim.
- **Allowed.** `packages/cable-sizing/src/engine/` (or equivalent),
  `packages/cable-sizing/src/engineAdapter.ts`,
  `packages/cable-sizing/tests/engineAdapter.test.ts`. No app-facing
  wiring.
- **Forbidden.** Modification of engine calculation behavior beyond
  adapter / boundary plumbing. Schema change (use the CS-OQ-14 gated
  PR pattern for any required schema addition). UI change.
  Acceptance-coverage change.
- **Minimum validation.** `pnpm typecheck`, `pnpm test`,
  `pnpm check:acceptance`, `git diff --check`. Engine-internal tests
  (if any are imported alongside the engine code) continue to pass.
- **Merge criteria.** Engine integrated; adapter tested; engine
  numeric output unchanged from upstream baseline (verified by the
  imported engine-internal tests, where applicable). No engine
  formula change. No engine-internal API leak across the package
  boundary (CS-OQ-2).

### CS-PR-05 — Design current / input validation fail-closed

- **Goal.** Implement the Cable Sizing readiness wrapper, the
  design-current basis derivation per CS-OQ-4, the invalid-state
  fail-closed policy per CS-OQ-13 for the design-current axis.
- **Allowed.** `packages/cable-sizing/src/readiness.ts`,
  `packages/cable-sizing/src/runner.ts` (orchestrator),
  associated tests. No UI change. No schema change.
- **Forbidden.** Modification of Stage 1 / Stage 2 / Stage 3
  validation behavior. Modification of `validateForCalculation()`.
  Modification of UI behavior. Acceptance-coverage change.
- **Minimum validation.** `pnpm typecheck`, `pnpm test`,
  `pnpm check:acceptance`, `git diff --check`.
- **Merge criteria.** Readiness four-state contract returned for
  each documented blocking case; invalid design current basis
  produces explicit error code + null numerics + `failed` row
  status (no fabricated 0).

### CS-PR-06 — Reference method / loaded conductors / installation

- **Goal.** Implement CS-OQ-6 and CS-OQ-9.
- **Allowed.** `packages/cable-sizing/` engine adapter / runner
  changes for reference-method selection and loaded-conductors
  defaulting; tests. No UI change. No schema change.
- **Forbidden.** Modification of engine internal reference-method
  logic. UI change. Schema change. Acceptance-coverage change.
- **Minimum validation.** Same as CS-PR-05.
- **Merge criteria.** Invalid `loadedConductors` fails closed.
  Stale reference-method selection cleared or fail-closed when
  context changes. Standalone 1P2W / 3P3W path unchanged.

### CS-PR-07 — Ampacity and correction-factor result-state

- **Goal.** Wire ampacity-axis result row, apply correction
  factors per CS-OQ-8, expose defaulted-value visibility per
  CS-OQ-12.
- **Allowed.** `packages/cable-sizing/` runner / result-builder
  changes; tests.
- **Forbidden.** Engine formula change. UI change. Schema change.
- **Minimum validation.** Same as CS-PR-05.
- **Merge criteria.** Soil-required-but-missing for buried
  installation fails closed. Defaulted correction factors surface a
  warning code and `source: "defaulted"` on the result row.

### CS-PR-08 — Voltage drop result-state

- **Goal.** Wire Cable Sizing voltage-drop axis. Preserve
  distinction from Stage 2 Voltage Drop (Stage 4 spec §3.2). Report
  design-current and operating-current voltage drop with explicit
  source/status when integrated mode is used.
- **Allowed.** `packages/cable-sizing/` runner / result-builder
  changes; tests.
- **Forbidden.** Modification of `packages/solver-adapter/src/voltageDrop.ts`
  or any Stage 2 file. UI change.
- **Minimum validation.** Same as CS-PR-05. Plus:
  `packages/solver-adapter/tests/voltageDrop.test.ts` continues to
  pass unchanged.
- **Merge criteria.** Stage 2 Voltage Drop unchanged. Cable Sizing
  voltage-drop axis carries explicit `source` (design vs operating)
  and `status`.

### CS-PR-09 — Short-circuit withstand result-state (sizing-side)

- **Goal.** Wire Cable Sizing short-circuit thermal withstand axis
  (sizing-side). Consume Short Circuit run bundle and
  `Breaker.faultClearingS` / project-level `defaultFaultClearingS`.
- **Allowed.** `packages/cable-sizing/` runner / result-builder
  changes; tests.
- **Forbidden.** Modification of Short Circuit calculation behavior
  (`packages/solver-adapter/src/shortCircuit*.ts`,
  `services/solver-sidecar/src/short_circuit.py`). Modification of
  Equipment Duty cable-withstand surface
  (`packages/duty-check/`). UI change.
- **Minimum validation.** Same as CS-PR-05. Plus: Short Circuit and
  Equipment Duty test suites continue to pass unchanged.
- **Merge criteria.** Invalid short-circuit current or trip time
  fails closed. Cable Sizing withstand row separated from Equipment
  Duty cable withstand row (Stage 4 spec §3.4 separation).

### CS-PR-10 — Runtime retention and project-file separation

- **Goal.** Add `"cable_sizing_bundle"` to `CalculationModule`;
  widen `RuntimeCalculationRecord.bundle` to the four-member union;
  add retention key.
- **Allowed.** `packages/calculation-store/src/types.ts`,
  `packages/calculation-store/src/reducer.ts`,
  `packages/calculation-store/src/retention.ts`,
  `packages/calculation-store/tests/cable-sizing-retention.test.ts`.
- **Forbidden.** Schema change (CS-OQ-14 — `calculationSnapshots`
  stays `max(0)`; `calculationResults` not introduced). UI change.
- **Minimum validation.** Same as CS-PR-05. Plus: existing
  `packages/calculation-store/tests/reducer.test.ts` and
  `packages/calculation-store/tests/duty-check-retention.test.ts`
  continue to pass unchanged.
- **Merge criteria.** Project file is byte-identical before and
  after a Cable Sizing run (test asserts `serializeProjectFile()`
  unchanged). `calculationSnapshots` stays empty.

### CS-PR-11 — UI result / status / audit integration

- **Goal.** Replace the current `cableSizing` Stage 4 placeholder in
  `apps/web/src/components/CalculationStatusPanel.tsx` with a real
  Run button and result table.
- **Allowed.** `apps/web/src/components/CableSizingResultTable.tsx`
  (new), `apps/web/src/components/CalculationStatusPanel.tsx`
  (replace `cableSizing` placeholder),
  `apps/web/src/state/calculationStore.ts` (`runCableSizing()`
  action + lifecycle slot + readiness gate), tests under
  `apps/web/tests/`.
- **Forbidden.** Schema change. Modification of Stage 2 / Stage 3
  result tables.
- **Minimum validation.** Same as CS-PR-05. Plus: `apps/web/tests/`
  Stage 2 / Stage 3 test suites unchanged.
- **Merge criteria.** Numeric `null` renders as `—`, never `0`.
  Per-row issue codes surfaced. Stale flag flips on project edit
  with no auto-recompute. Run button readiness-gated by CS-PR-05
  wrapper.

### CS-PR-12 — GC-LV Golden Case migration / preservation

- **Goal.** Migrate or preserve existing GC-LV Golden Cases per
  CS-OQ-11 / Stage 4 spec §6. Classify each as `verified` /
  `provisional` / `regression_only`. No fake expected values.
- **Allowed.** New static support-package artifacts under
  `docs/stage-1-baseline/stage_1_preimplementation_support_v1_1/golden_cases/gc_lv_*/`
  (or equivalent), executable fixture loaders under
  `packages/fixtures/src/golden_cases/`, structural / orchestrator
  comparison tests under `packages/fixtures/tests/` /
  `packages/cable-sizing/tests/`.
- **Forbidden.** Modification of any existing Golden Case numeric
  expected value. Promotion of a `provisional` integration entry
  to `verified` (a separate Golden Case refinement PR is required).
  Schema change.
- **Minimum validation.** Same as CS-PR-05. Plus: existing
  `packages/fixtures/tests/golden-case-gc-sc-01.test.ts` and
  `packages/solver-adapter/tests/shortCircuit.goldenCaseGcSc01.test.ts`
  continue to pass unchanged.
- **Merge criteria.** Each migrated GC-LV case carries an explicit
  `verified` / `provisional` / `regression_only` integration
  classification. Static support-package artifact's own
  `referenceStatus` distinct from acceptance-manifest integration
  `referenceStatus`. 1P2W / 3P3W standalone preservation honored
  (PRD §15 OQ-06).

### CS-PR-13 — Stage 4 acceptance closeout

- **Goal.** Add the `stage4` block to
  `scripts/acceptance-coverage.json`; extend
  `scripts/check-acceptance.ts` `stage4Expected` to enumerate
  `AC-S4-01..` (final count finalized in this PR);
  `stage4GoldenCases` block; closeout document.
- **Allowed.** `scripts/acceptance-coverage.json`,
  `scripts/check-acceptance.ts`,
  `docs/stage-4/stage_4_cable_sizing_acceptance_closeout.md`.
- **Forbidden.** Calculation logic change. Schema change. UI
  change.
- **Minimum validation.** `pnpm typecheck`,
  `pnpm check:acceptance`, `pnpm test`, `git diff --check`.
- **Merge criteria.** Every `AC-S4-NN` row has a non-empty owner
  field; every `stage4GoldenCases[].referenceStatus` is one of
  `verified` / `provisional` / `regression_only` and is consistent
  with the Stage 4 spec §6 policy. `pnpm check:acceptance` exits
  zero with all entries `mapped` (or marked `deferred-*` per the
  closeout brief).

### CS-PR-14 — Stage 4 overall review

- **Goal.** Mirror the Stage 3 overall review for Stage 4. Map all
  Stage 4 PRs; summarize completed acceptance coverage; classify
  deferred / gated follow-ups; confirm GC-LV status labels;
  confirm runtime / project-file separation; confirm no Stage 5 /
  arc-flash / coordination scope leakage. Stage 5 hand-off
  document.
- **Allowed.** `docs/stage-4/stage_4_overall_review.md`.
- **Forbidden.** Calculation logic change. Schema change. UI
  change. Acceptance-coverage change. Promotion of any Golden
  Case integration `referenceStatus` (a separate Golden Case
  refinement PR is required for promotion).
- **Minimum validation.** `pnpm typecheck`,
  `pnpm check:acceptance`, `git diff --check`.
- **Merge criteria.** Hand-off charter for Stage 5 articulated;
  Stage 4 deferred / gated items recorded; Stage 1 / Stage 2 /
  Stage 3 / Stage 4 runtime guardrails preserved.

---

## 4. Risk controls

The Stage 4 risk surface — and the controls each PR must apply.

### 4.1 Accidental greenfield rewrite

**Risk.** A Stage 4 PR re-implements existing Cable Sizing engine
formulas (ampacity tables, derating curves, voltage-drop formulas,
short-circuit withstand formulation) — **including merely because the
engine source lives outside the current `etap` monorepo** in
`Karma720809/cable-sizing` — instead of integrating that existing
engine.

**Control.**

- **Out-of-monorepo is not a license to rewrite.** The existing
  engine's source is `Karma720809/cable-sizing`
  (https://github.com/Karma720809/cable-sizing) per CS-OQ-1 / Stage 4
  spec §2.2. The fact that it lives outside `etap` at HEAD `2cc5890`
  is an integration question (CS-PR-02), **not** an authorization to
  re-derive formulas. A rewrite triggered by "the code is somewhere
  else" is forbidden.
- CS-PR-01 (this PR) and Stage 4 spec §1.1 explicitly forbid the
  rewrite.
- CS-PR-04 (engine integration) is the only PR allowed to
  introduce the engine code, and it must move / import / vendor it
  **verbatim** from `Karma720809/cable-sizing` per the integration
  method selected by CS-PR-02 (CS-OQ-1). Engine-internal calculation
  files must not be hand-edited as part of CS-PR-04.
- Reviewer checklist for CS-PR-04: confirm engine-internal tests
  (if any are imported alongside) pass with byte-identical outputs
  versus the `Karma720809/cable-sizing` upstream baseline at the
  selected commit pin.
- Any engine refactor that turns out to be necessary must be
  scheduled as a **separate refactor PR**, not bundled with
  CS-PR-04, and the refactor PR must preserve GC-LV behavior
  (CS-OQ-11) and warning/error vocabulary (CS-OQ-13).

### 4.2 Fake expected values

**Risk.** A Stage 4 PR copies engine output (from
`Karma720809/cable-sizing` or from any in-`etap` engine adapter) and
labels it `verified` in a Golden Case manifest entry — or invents an
expected value because the external repo's verification basis was not
inspected.

**Control.**

- Stage 4 spec §6 (Golden Case policy) and CS-OQ-11 forbid this.
- **External examples are not automatically `verified`.** Cases
  copied from `Karma720809/cable-sizing` carry the verification
  basis their external-repo provenance documents — and only that.
  An undocumented external example **must not** be promoted to
  `verified` in this stage. Default classification for an
  external example without independent-reference provenance is
  `provisional` or `regression_only`, never `verified`. Conversion
  to `verified` requires a separate Golden Case refinement PR with
  an independent reference attached.
- CS-PR-12 reviewer checklist: every `verified` GC-LV entry must
  trace to an independent reference (hand calculation, IEC / IEEE
  textbook example, verified spreadsheet, or independent
  commercial-tool result with documented inputs) **whose
  provenance is documented at the time of import from
  `Karma720809/cable-sizing`**; a `verified` label without an
  independent reference is an automatic merge block.
- CS-PR-13 manifest enforcement: `scripts/check-acceptance.ts`
  Stage 4 Golden Case enforcement (paralleling the
  `stage3GoldenCasesExpected` literal) pins each GC-LV entry's
  expected `referenceStatus` so a future edit cannot silently
  flip a `provisional` entry to `verified`.

### 4.3 Stale result display

**Risk.** A successful Cable Sizing result row continues to
display after the user edits a relevant input that should
invalidate it.

**Control.**

- CS-PR-10 reducer test: `markStale` flips the lifecycle and the
  `retainedResults` `cable_sizing_bundle` slot's stale flag on
  project edit.
- CS-PR-11 UI test: stale flag visibly dims the Cable Sizing
  result table and the Run button shows the stale-input
  disabled-reason chip.
- CS-OQ-13 spec rule: "The UI / result layer must not continue to
  display stale successful results after inputs become invalid."

### 4.4 Invalid-state pass-through

**Risk.** An invalid numeric input (zero / negative design current
basis, zero / negative short-circuit current, zero / negative
trip time, invalid `loadedConductors`, missing required
installation parameter) produces a valid-looking result row.

**Control.**

- CS-PR-05 / CS-PR-06 / CS-PR-07 / CS-PR-09 fail-closed
  hardening: each axis fails closed on its invalid-input cases
  per CS-OQ-13; result row carries explicit error code + null
  numerics + `failed` row status.
- CS-PR-11 UI rendering: numeric `null` → `—`, never `0`. Per-row
  issue codes surfaced.
- CS-PR-12 GC-LV preservation includes the existing GC-LV
  invalid-state cases listed in PRD §12.1 (Loaded conductors
  invalid override; Soil missing for buried installation; Short
  circuit current zero invalid; Trip time zero invalid).

### 4.5 Project-file persistence creep

**Risk.** A Stage 4 PR silently widens the project file (e.g.,
adds a `cableSizingResults` field; populates
`calculationSnapshots`; adds non-additive cable-side schema
fields).

**Control.**

- CS-PR-10 retention test: project file byte-identical before /
  after a Cable Sizing run.
- CS-OQ-14 schema-change gating: any cable-side field addition
  must be optional, additive, canonical-drift-test pinned, and
  scheduled as a **separate gated PR** (not bundled with
  calculation logic).
- Canonical schema continues to pin `calculationSnapshots` to
  `max(0)`. `calculationResults` is not introduced.

### 4.6 Source / status collapse

**Risk.** A Stage 4 PR merges the `source` and `status` axes
into a single field (e.g., a single enum that conflates
`calculated_from_motor_fla` with `valid` into one literal).

**Control.**

- CS-OQ-12 / Stage 4 spec §5.2 forbid the collapse. Result-model
  types in CS-PR-03 carry source and status as **separate** typed
  fields per axis. CS-PR-03 reviewer checklist asserts this.

### 4.7 Scope leakage into Report Workflow

**Risk.** A Stage 4 PR ships Excel / PDF / certified-output code
or wires Cable Sizing into the Stage 5 Report Workflow
prematurely.

**Control.**

- Stage 4 spec §8 non-goals.
- CS-PR-11 UI integration is limited to the Calculation Status
  Panel + a Cable Sizing result table; no Excel export,
  no certified-report output, no PDF.
- Reviewer checklist for every Stage 4 PR: grep for `xlsx`,
  `excel`, `pdf` introductions outside the Stage 5 boundary.

### 4.8 Changing Stage 1 / Stage 2 / Stage 3 behavior

**Risk.** A Stage 4 PR modifies Load Flow / Voltage Drop / Short
Circuit / Equipment Duty / project validation behavior or breaks
Stage 1 round-trip.

**Control.**

- Per-PR forbidden-scope lists (§3 above).
- Existing Stage 1 / Stage 2 / Stage 3 test suites continue to
  pass unchanged on every Stage 4 PR.
- `packages/schemas/tests/canonical-drift.test.ts` and
  `packages/project-io/tests/round-trip.test.ts` continue to pin
  the canonical schema and round-trip discipline.
- Stage 2 `packages/solver-adapter/tests/voltageDrop.test.ts` and
  Stage 3 `packages/solver-adapter/tests/shortCircuit*.test.ts` /
  `packages/duty-check/tests/*.test.ts` are explicit forbidden
  scope for CS-PR-08 / CS-PR-09 modifications.

### 4.9 Equipment Duty cable-withstand absorption

**Risk.** A Stage 4 PR absorbs cable short-circuit *withstand*
(an Equipment Duty responsibility per Equipment Duty spec §4.4 /
ED-OQ-04 / Stage 3 overall review §10.6) into the Cable Sizing
surface, collapsing two distinct surfaces.

**Control.**

- Stage 4 spec §3.4 separates the two surfaces. CS-PR-09 wires
  the Cable Sizing **sizing-side** withstand axis only;
  Equipment Duty cable-withstand surface in `packages/duty-check/`
  is explicit forbidden scope for CS-PR-09.

### 4.10 Acceptance-tooling drift

**Risk.** A Stage 4 PR modifies `scripts/check-acceptance.ts` /
`scripts/acceptance-coverage.json` outside CS-PR-13 (acceptance
closeout).

**Control.**

- Per-PR forbidden-scope lists explicitly carve out
  acceptance-tooling files except in CS-PR-13.
- CS-PR-13 reviewer checklist: schema of the new `stage4` block
  matches the existing `stage1` / `stage2` / `stage3` blocks
  (each criterion has `id`, `summary`, `owner`).

### 4.11 Silent copy from `Karma720809/cable-sizing`

**Risk.** A Stage 4 PR pulls files from
`Karma720809/cable-sizing` into `etap` without recording the source
commit, the migration method, the license / ownership assumption, or
the retained verification evidence — i.e., the engine appears in
`etap` with no auditable provenance trail.

**Control.**

- **CS-PR-02 must select and document the integration method
  (CS-OQ-1)** — git subtree, manual migration with explicit
  history / source / commit-reference note, package extraction
  into the `etap` monorepo, npm / pnpm workspace package, or
  another explicitly reviewed approach — **before** CS-PR-04
  introduces any engine code.
- CS-PR-04 reviewer checklist: the integration PR description
  must cite the **exact upstream commit SHA** in
  `Karma720809/cable-sizing` from which files were taken, the
  migration method selected by CS-PR-02, the license / ownership
  assumption, and the retained verification evidence (especially
  for any GC-LV expected values that travel along).
- **Forbidden in any Stage 4 PR.** Pasting source from
  `Karma720809/cable-sizing` into `etap` without the above
  provenance trail. Importing engine code via an integration
  method other than the one selected by CS-PR-02 (without
  amending CS-PR-02 / CS-OQ-1 first). Renaming or refactoring
  engine internals as part of the same PR that vendors them
  (those refactor PRs are separate per §4.1).
- CS-PR-12 reviewer checklist: any GC-LV case migrated from
  `Karma720809/cable-sizing` must carry the same provenance
  trail (upstream commit SHA, migration method, license /
  ownership note, verification evidence per §6).
- **External examples are not automatically verified Golden Cases**
  (see §4.2 control above). Promotion requires a separate Golden
  Case refinement PR with an independent reference.

---

## 5. Stage 4 closeout / overall review policy

Stage 4 ends with two sequenced documents — the same shape as
Stage 3:

1. **Stage 4 acceptance closeout (CS-PR-13).** Mechanically maps
   shipped PRs to acceptance-manifest owners. Adds the `stage4`
   block (and `stage4GoldenCases` block) to
   `scripts/acceptance-coverage.json` and extends
   `scripts/check-acceptance.ts`. Documents per-`AC-S4-NN`
   verification owners. Records any `deferred-*` markers.

2. **Stage 4 overall review (CS-PR-14).** The Stage 5 hand-off
   document. Distinguishes (as Stage 3 overall review §1 did):

   | Type | Scope |
   |---|---|
   | Stage 4 acceptance closeout (CS-PR-13) | Per-AC mechanical mapping; manifest owner. |
   | Stage 4 overall review (CS-PR-14) | Whole-stage evaluation: did Stage 4 actually achieve the Stage 4 spec's CS-OQ decisions? Were GC-LV cases preserved? Did runtime / project-file separation hold? Did scope leak into Stage 5 / arc flash / coordination? Stage 5 hand-off readiness. |

The Stage 4 overall review must, at minimum:

- Map every Stage 4 PR (CS-PR-01 .. CS-PR-13) to its shipped
  scope.
- Summarize completed acceptance coverage; record any
  `deferred-*` items separately.
- Classify deferred / gated follow-ups (analogous to Stage 3
  overall review §9.1 / §9.2 / §9.3).
- Confirm GC-LV integration `referenceStatus` labels for every
  migrated case; do not promote any case here.
- Confirm runtime / project-file separation (as Stage 3 overall
  review §7 did).
- Confirm no scope leakage into Stage 5 / arc flash / full
  protection coordination / per-zone clearing time.
- Articulate the Stage 5 starting charter (analogous to Stage 3
  overall review §10).

The Stage 4 overall review **does not** flip any
`AC-S4-NN` row, **does not** promote any GC-LV integration
status, and **does not** modify
`scripts/acceptance-coverage.json` or any harness file. Those
remain CS-PR-12 / CS-PR-13 deliverables.

---

## 6. Document control

- **Plan status.** Stage 4 PR #1 — Rev A.1. Plan only; paired with
  the Stage 4 integration spec.
- **Authors.** Stage 4 working set.
- **Related documents.** `stage_4_cable_sizing_integration_spec.md`;
  Stage 3 overall review (`docs/stage-3/stage_3_overall_review.md`);
  Stage 3 implementation plan
  (`docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md`).
- **External baseline.** `Karma720809/cable-sizing`
  (https://github.com/Karma720809/cable-sizing) — known external
  source repository for the existing LV Cable Sizing program. Named
  in spec §2.2 / CS-OQ-1; inspected by CS-PR-02; integrated by
  CS-PR-04 per the integration method selected in CS-PR-02. **This
  plan does not clone, import, copy, or modify
  `Karma720809/cable-sizing`** — only CS-PR-04 (the integration PR)
  may, and only via the integration method recorded by CS-PR-02.
- **Change log.**
  - **Rev A** — created at HEAD `2cc5890`.
  - **Rev A.1** — recorded `Karma720809/cable-sizing` as the
    inspection target for CS-PR-02. Expanded CS-PR-02 detail
    block (§3) to enumerate the inspection scope (engine,
    validation, codes, UI, tests, fixtures, GC-LV cases, report
    data, license / ownership, commit pin) and the decision scope
    (integration method per CS-OQ-1, package / API boundary per
    CS-OQ-2, reused-as-is vs adapted classification, spec / plan
    reconciliation trigger). Strengthened §4.1 (do not rewrite
    merely because the source is outside the monorepo). Added
    "External examples are not automatically verified" control to
    §4.2. Added new §4.11 (silent copy from
    `Karma720809/cable-sizing` — provenance trail required). **No
    code, test, schema, fixture, or import / migration was
    performed in this revision.**
  - Future revisions (e.g., CS-PR-02 inventory findings that
    demand reordering CS-PR-03 / CS-PR-04, or a CS-PR-02 finding
    that the engine source is in a state that requires additional
    refactor PRs) update this section in lockstep with the Stage 4
    spec when an OQ reopens, or in this plan alone when only
    sequencing changes.
