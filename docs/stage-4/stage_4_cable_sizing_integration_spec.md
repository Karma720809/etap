# Stage 4 Cable Sizing Integration Spec

**Project:** Power System Study App
**Stage:** Stage 4 — Cable Sizing Integration
**PR:** Stage 4 PR #1 (this document — integration spec, formal OQ
decisions, GC-LV preservation policy, acceptance criteria)
**Branch:** `stage-4/pr-01-cable-sizing-integration-spec`
**Status:** Documentation / specification only. No runtime, calculation,
schema, sidecar, project-IO, store-architecture, UI, fixture, test,
acceptance-tooling, or Golden Case-expected-value change.
**Date:** 2026-05-15
**HEAD basis:** PR #25 merge commit `2cc5890`
(`docs/stage-3/stage_3_overall_review.md`).

This spec governs Stage 4 of the Power System Study App. It is paired
with the Stage 4 implementation plan
(`docs/stage-4/stage_4_cable_sizing_implementation_plan.md`), which
translates this spec into a PR-by-PR sequencing plan.

---

## 0. Reading order

This spec depends on, and does **not** restate, the Stage 1 baseline,
Stage 2 calculation surface, Stage 3 Short Circuit / Equipment Duty
work, or the Stage 3 overall review:

- `docs/stage-1-baseline/power_system_study_app_prd_v1_0_final.md`
  — PRD v1.0 final (the product-level baseline).
- `docs/stage-1-baseline/stage_1_one_line_diagram_mvp_spec_rev_d.md`
- `docs/stage-1-implementation-notes.md`
- `docs/stage-2/stage_2_load_flow_voltage_drop_spec.md`
- `docs/stage-2/solver_adapter_contract.md`
- `docs/stage-2/solver_adapter_hosting_decision.md`
- `docs/stage-3/stage_3_short_circuit_mvp_spec.md`
- `docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md`
- `docs/stage-3/stage_3_equipment_duty_spec.md`
- `docs/stage-3/stage_3_acceptance_closeout.md`
- `docs/stage-3/stage_3_equipment_duty_acceptance_closeout.md`
- `docs/stage-3/stage_3_overall_review.md` — Stage 4 hand-off charter.

External baseline (outside the `etap` monorepo, named here so future
Stage 4 PRs can reference it directly):

- `Karma720809/cable-sizing` (https://github.com/Karma720809/cable-sizing)
  — known external source repository for the existing LV Cable Sizing
  program (engine, validation, warning/error vocabulary, UI, tests,
  fixtures, GC-LV Golden Cases, report data structure). See §2.2 for
  inventory role and CS-OQ-1 for ownership / integration-method
  decision. **This spec PR does not clone, import, copy, or modify
  `Karma720809/cable-sizing`** — it only names it as the inspection
  target for CS-PR-02.

Whenever this spec says "the canonical schema", it refers to
`packages/schemas/src/stage_1_project_schema.rev_d.zod.ts` /
`packages/schemas/stage_1_project_file.rev_d.schema.json`. Stage 4 PR
#1 (this document) **must not modify those files**. Whenever this spec
says "AppNetwork", it refers to `@power-system-study/network-model`'s
`AppNetwork` produced by `buildAppNetwork()`. Stage 4 PR #1 must not
modify the shape of `AppNetwork`. Whenever this spec says "the PRD",
it refers to `power_system_study_app_prd_v1_0_final.md`. Whenever this
spec says "the Stage 3 overall review", it refers to
`stage_3_overall_review.md` (the Stage 4 hand-off charter).

This document defines specification only. **Stage 4 PR #1 ships no
production code, no fixture, no test, no Golden Case data, no schema
change, no acceptance-tooling change, and no UI behavior change.**
Implementation is broken into Stage 4 PR #2 onward (see the Stage 4
implementation plan).

---

## 1. Stage 4 purpose

### 1.1 Stage charter

Stage 4 is **Cable Sizing Integration**. Concretely:

- Stage 4 **integrates the existing LV Cable Sizing assets** (calculation
  engine, validation rule, warning/error code, Golden Cases, report
  data structure — per PRD §15 OQ-03 and PRD §7.7 FR-CS-001) into the
  Power System Study App acceptance framework.
- Stage 4 is **not a greenfield Cable Sizing engine rewrite**.
- Stage 4 is **not** a re-derivation of Cable Sizing engineering
  formulas. The engine and its validation/warning/error vocabulary
  are preserved.

The PRD anchors that fix this charter are:

- **PRD §15 OQ-03 (final decision).** "Cable Sizing App은 Power System
  Study App과 같은 monorepo에서 통합 관리한다. 기존 Cable Sizing
  calculation engine, validation rule, warning/error code, Golden Case는
  별도 package로 분리하여 재사용한다." (Closed; recorded in PRD §15
  OQ-03 and the PRD changelog v0.1.3 entry.)
- **PRD §7.7 FR-CS-001 (Cable Sizing App 연계).** "Power System
  Study App은 기존 LV Cable Sizing App의 계산엔진을 같은 monorepo 내 별도
  package로 분리하여 재사용한다."
- **PRD §14.5 Stage 4 — Cable Sizing Integration.** Deliverables:
  Existing cable sizing engine integration; Cable adequacy check;
  Auto cable size recommendation; Existing GC-LV tests preserved.
- **PRD §16 Initial Technical Recommendation.** "pandapower adapter
  for Load Flow / Short Circuit + reusable Cable Sizing package."
- **Stage 3 overall review §10 / §10.5 (Stage 4 hand-off).** "Stage 4
  Cable Sizing is **integration of existing Cable Sizing assets**, not
  a greenfield Cable Sizing engine rewrite. … Replacing the existing
  engine with a from-scratch implementation is **out of scope** for
  Stage 4 and would require an explicit spec-revision decision before
  any code lands."

Any change from "reuse / integration" to "rewrite" requires an explicit
PRD revision. This spec does **not** authorize that change.

### 1.2 Scope of integration

Stage 4 integration covers:

1. The existing Cable Sizing calculation engine / package boundary
   (engine source, ownership, package layout, public API surface).
2. The input contract mapping from the Power System Study App
   canonical model (`Cable`, `Load`, `Motor`, `NetworkSource`,
   `Transformer`, `Breaker`, scenario context, Load Flow result,
   Short Circuit result) to the Cable Sizing engine canonical input
   schema defined by PRD §7.7 FR-CS-000.
3. The **design current basis** policy in integrated mode (PRD §7.7
   FR-CS-000 design current policy).
4. The **voltage drop check** (Stage 4 cable adequacy uses the existing
   Cable Sizing engine's voltage drop check; Stage 2 Load Flow / Voltage
   Drop continues to provide the operating-state voltage drop result —
   the two checks are not the same; see §3 below).
5. The **ampacity / current-carrying capacity check** with installation
   reference method, ambient temperature, soil resistivity, grouping,
   and loaded conductors.
6. The **short-circuit thermal withstand check** at the Cable Sizing
   layer, with explicit reference to the Equipment Duty cable
   withstand surface (Equipment Duty spec §4.4) — the two checks are
   sibling concerns and Stage 4 must not absorb Equipment Duty
   withstand scope.
7. The **protective-device / upstream Short Circuit interfaces**
   (`shortCircuitCurrentKA`, `tripTimeS`) per PRD §7.7 FR-CS-000 — the
   Cable Sizing engine consumes these but does not compute them.
8. The **installation / reference method** assumption surface
   (`installationMethod`, `loadedConductors`, `ambientTempC`,
   `soilResistivityK_m_W`, `groupingCondition`).
9. The **derating / correction factors** policy (defaults, missing
   inputs, and visibility).
10. The **armour / CPC / PE handling** insofar as it is already in
    project scope (`Cable.armourType`, `Cable.armourCsaMm2`).
11. The **warning / error behavior** for invalid or incomplete inputs
    (fail-closed on invalid numerics; documented warnings on
    defaulted assumptions).
12. The **runtime / project-file separation** for Cable Sizing results
    (runtime-only retention; no silent persistence).

### 1.3 Out of charter

Stage 4 explicitly does **not**:

- Re-derive engineering formulas (ampacity tables, voltage-drop
  formulas, IEC 60364-5-52 derating tables, IEC 60949 short-circuit
  withstand formulation).
- Rewrite, replace, or refactor the existing Cable Sizing engine code
  beyond the package / API boundary required for integration.
- Introduce a new short-circuit calculation or duty calculation —
  Cable Sizing **consumes** Short Circuit and Equipment-Duty-adjacent
  inputs through the canonical contract; it does not produce them.
- Modify the Stage 1 canonical project schema except via the same
  optional-field / canonical-drift discipline used by ED-PR-01 (see §7
  below — and even then, schema changes require their own gated PR
  per OQ CS-OQ-14).
- Modify Stage 2 Load Flow / Voltage Drop behavior.
- Modify Stage 3 Short Circuit / Equipment Duty behavior.
- Modify the sidecar / Python / pandapower path. Cable Sizing is
  expected to be a TypeScript-side package; Python sidecar dependence
  is **not assumed** by this spec and is closed by CS-OQ-1 / CS-OQ-2.
- Add or modify Golden Case numeric expected values (see §6 Golden
  Case policy).
- Modify acceptance-tooling logic (`scripts/check-acceptance.ts`,
  `scripts/acceptance-coverage.json` enforcement).
- Move or import existing Cable Sizing engine code in this PR. That
  is a future implementation PR (see Stage 4 implementation plan PR
  CS-PR-04).

---

## 2. Existing baseline inventory

This section records the **current state of the repository** at HEAD
basis `2cc5890`, with respect to Cable Sizing assets. It is the
"existing LV Cable Sizing asset inventory" that the Stage 3 overall
review §10 hand-off list (item 4) requires.

The inventory distinguishes three categories:

- **§2.1 Found inside the current `etap` monorepo** — code, schema
  fields, validation rules, fixtures, UI hooks, or documentation that
  is currently present and Cable-Sizing-relevant at HEAD `2cc5890`.
- **§2.2 Known external existing Cable Sizing source repository** —
  the existing LV Cable Sizing program is **not** an unknown asset.
  Its known external source repository is
  `Karma720809/cable-sizing` (https://github.com/Karma720809/cable-sizing).
  At this review point that repository is **outside** the current
  `etap` monorepo. It is the authoritative baseline candidate for the
  reuse target named by PRD §15 OQ-03 / §7.7 FR-CS-001 (existing LV
  Cable Sizing engine, validation rule, warning/error code, Golden
  Cases, report data structure). It must be **inspected** by CS-PR-02
  before any import / integration decision is taken.
- **§2.3 Still unresolved integration facts** — concrete items that
  cannot be confirmed from this spec PR alone (engine internals,
  license / ownership, public API shape, GC-LV expected values,
  package / API boundary inside this monorepo). These are recorded as
  **integration discovery items** to be resolved by CS-PR-02 (against
  `Karma720809/cable-sizing`) or later Stage 4 PRs.

### 2.1 Found inside the current `etap` monorepo

| Asset | Location | Notes |
|---|---|---|
| Stage 1 canonical `Cable` model with cable-sizing-relevant fields | `packages/schemas/src/stage_1_project_schema.rev_d.zod.ts` lines ~145–167 (`CableSchema`) — `voltageGradeKv`, `coreConfiguration`, `conductorMaterial` (`Cu`/`Al`/`unknown`), `insulationType` (`PVC`/`XLPE`/`EPR`/`unknown`), `armourType` (`none`/`SWA`/`AWA`/`STA`/`unknown`), `conductorSizeMm2`, `armourCsaMm2`, `lengthM`, `rOhmPerKm`, `xOhmPerKm`, `ampacityA`, `installationMethod` (`tray`/`buried`/`conduit`/`ladder`/`air`/`unknown`), `ambientTempC`, `soilResistivityK_m_W`, `groupingCondition`, `loadedConductors`, `shortCircuitKValue`. | All cable fields except `kind`, `internalId`, `tag`, and `status` are nullable / optional. `shortCircuitKValue` was added in ED-PR-01 for Equipment Duty cable short-circuit *withstand* per Equipment Duty spec §4.4 — it is **not** a Cable Sizing field and is **not** a Stage 4 addition. |
| `Cable` model PRD example | PRD §8.5 Cable Model. | Concrete JSON example with `lengthM`, `conductorMaterial`, `conductorSizeMm2`, `rOhmPerKm`, `xOhmPerKm`, `ampacityA`, `installationMethod`, `loadedConductors`, `armourCsaMm2`. |
| Cable Sizing input contract (PRD-level, not yet code) | PRD §7.7 FR-CS-000 ("Cable Sizing Input Contract and Design Current Policy") — defines the canonical input schema, design current policy, `feederType` enum (`motor`, `static_load`, `distribution_feeder`, `mixed_load`, `spare`), and the four output current axes (`designCurrentA`, `operatingCurrentA`, `startingCurrentA`, `shortCircuitCurrentKA`). | This is the contract Stage 4 must implement on the integration-side adapter (CS-OQ-3). It is **not** yet realized in code. |
| `Cable` cable-sizing input PRD-level item list | PRD §7.7 FR-CS-001 "연계 항목": Load current, Motor FLA, Demand factor, Cable length, Voltage level, Installation method, Ambient temperature, Soil resistivity, Loaded conductors, Armour CSA, Short circuit current, Trip time. | These are the cross-module data items Stage 4 integration must wire. All except *trip time* and *short circuit current* are already present on Stage 1 schema (Cable / Motor / Load); *trip time* and *short circuit current* come from Equipment Duty / Short Circuit context. |
| Cable Sizing UI module placeholder | `apps/web/src/components/CalculationStatusPanel.tsx` — `STAGE_MODULES` includes `{ id: "cableSizing", label: "Cable Sizing", futureStage: "Stage 4" }`. | UI lists Cable Sizing as `not_implemented` — see the file's header comment lines ~20–29. No Run button is wired and no result table is rendered. The placeholder is preserved so UI visibility on what is and isn't shipped is maintained. Stage 4 UI integration (CS-PR-11) will replace the `not_implemented` placeholder. |
| Stage-1 cable-side validation rule | `packages/validation/src/validateCableManualRX.ts` — emits `W-CBL-001` warning when a cable carries manually entered `rOhmPerKm` or `xOhmPerKm`. | Documented as an **audit hint** that Stage 4 cable-library values must not silently override these inputs. Stage 4 must preserve this rule and may extend it with additional cable-side warning codes (under the existing `W-CBL-*` namespace or an integration-engine-imported namespace per CS-OQ-1). |
| Validation code table | `packages/validation/src/codes.ts` — `STAGE1_VALIDATION_CODES` registers `W-CBL-001`. | The Stage 1 validation registry is the deterministic warning/error vocabulary at HEAD. PRD §7.8 FR-WE-001 also documents project-level codes (`E-VAL-003 "Soil resistivity is required for buried installation"`, `W-CF-001 "Default correction factor was used"`, `E-SC-001 "Short-circuit current is invalid"`, `E-SC-002 "Trip time is invalid"`) that the Cable Sizing integration must surface as deterministic codes — but no `E-CS-*` / `W-CS-*` namespace is yet declared in the Stage 1 registry. The integration-time vocabulary decision is closed by CS-OQ-1 / CS-OQ-13. |
| PRD-level Cable Sizing acceptance bullet | PRD §13.1 MVP Acceptance Criteria #7 — "Cable sizing result를 기존 cable sizing logic 기준으로 확인할 수 있다." | Anchors that the Stage 4 acceptance-mapping decision must trace through to "기존 cable sizing logic" (i.e., the existing engine integration), not a Stage 4-rewritten engine. |
| PRD-level Cable Sizing Golden Case bullet | PRD §12.1 ("Cable Sizing") — "Existing LV cable sizing Golden Cases shall be preserved." Also calls out: Motor FLA null fallback, 1P2W case, 3P3W case, Loaded conductors invalid override, Soil missing for buried installation, Short circuit current zero invalid, Trip time zero invalid. | These are the **existing GC-LV preservation requirements** Stage 4 must honor (CS-OQ-11). |
| 1P2W / 3P3W standalone preservation | PRD §15 OQ-06 — "기존 LV Cable Sizing App의 1P2W/3P3W Golden Case와 standalone cable sizing capability는 유지한다." | The integrated Power System Study App calculation scope is 3-phase balanced, but the standalone Cable Sizing 1P2W / 3P3W capability and Golden Cases are **preserved** as part of the engine integration. Stage 4 must not regress this. |
| Cable Sizing report data structure (PRD-level) | PRD §7.7 FR-CS-001 reuse list — "Cable sizing report data structure". | A report data structure is named as a reuse target but is not realized in this monorepo. Report integration into the Stage 5 Excel report is **out of Stage 4 scope**; Stage 4 must define the runtime result model only (CS-OQ-2, CS-OQ-14). |

### 2.2 Known external existing Cable Sizing source repository

| Asset | Location | Notes |
|---|---|---|
| Existing LV Cable Sizing program (engine, validation, warning/error vocabulary, UI, tests, fixtures, Golden Cases, report data structure) | `Karma720809/cable-sizing` (https://github.com/Karma720809/cable-sizing). | **Current role:** authoritative baseline candidate for the reuse target named by PRD §15 OQ-03, PRD §7.7 FR-CS-001, PRD §14.5 ("Existing cable sizing engine integration", "Existing GC-LV tests preserved"), and PRD §16 ("reusable Cable Sizing package"). **Status:** outside the current `etap` monorepo at HEAD `2cc5890`; **must be inspected by CS-PR-02** before any import / migration / integration decision is taken. **CS-PR-02 inspection scope** (mirrored in Stage 4 implementation plan §3 / CS-PR-02): engine source files and entrypoints; validation rules and the warning/error code namespace; UI / screen surface; tests and fixtures; existing GC-LV cases (file paths, ID conventions, expected-value verification basis); report data structure; license / ownership / authorship; package layout and any framework / runtime / build-tool assumptions; documented known limitations. **CS-PR-02 decision scope:** integration method — git subtree, manual migration with history / reference note, package extraction into the `etap` monorepo, npm / pnpm workspace package consumed from the external repo, or another explicitly reviewed approach (CS-OQ-1) — and which assets are reused as-is versus adapted at the integration boundary (CS-OQ-2). Not addressed by this PR. |
| Authoritative GC-LV Golden Case set | `Karma720809/cable-sizing` (specific paths to be enumerated by CS-PR-02). | The existing GC-LV cases (including the 1P2W / 3P3W cases preserved by PRD §15 OQ-06) live in `Karma720809/cable-sizing`. Their **expected values and verification basis must be read from that repository** by CS-PR-02 / CS-PR-12. **This spec PR does not enumerate, copy, restate, or assume those expected values.** GC-LV migration / preservation / classification is owned by CS-PR-12; the verification-basis classification follows the §6 Golden Case policy (verified / provisional / regression_only). |

The `Karma720809/cable-sizing` repository is a **known external
source**, not an unknown asset. Statements in this spec that the
existing engine is "not present in this monorepo" mean exactly that —
the engine is not yet inside `etap`; they do **not** mean its source
location is unknown. CS-OQ-1 names the repository explicitly; CS-PR-02
inspects it.

### 2.3 Still unresolved integration facts

Each item below is **expected by PRD §7.7 / §14.5 / §15 OQ-03** but is
**not yet physically present in the `etap` monorepo today** and **must
be resolved by inspecting `Karma720809/cable-sizing`** (or by a
follow-up gated PR) before integration code lands. Stage 4 records
each as an **integration discovery item** for resolution in CS-PR-02
(against the external repo named in §2.2) or later Stage 4 PRs. This
spec does **not** invent, reconstruct, copy, or restate any of these
assets — it points at the external source of truth.

| Item | Expected by | Status |
|---|---|---|
| Existing Cable Sizing calculation engine source code (`engine-cable-sizing/` per PRD §16 sketch, or equivalent). | PRD §7.7 FR-CS-001 reuse list; PRD §15 OQ-03; PRD §16 Initial Technical Recommendation (`packages/engine-cable-sizing/`). | **Known external source** = `Karma720809/cable-sizing` (§2.2 above). **Not yet inside the `etap` monorepo** at HEAD `2cc5890`. Integration discovery item — engine entrypoints, public API, build/runtime assumptions, license / ownership must be **inspected** in `Karma720809/cable-sizing` by CS-PR-02 before any engine code is moved, copied, or imported. |
| Existing Cable Sizing validation rule package. | PRD §7.7 FR-CS-001 reuse list; PRD §15 OQ-03. | **Known external source** = `Karma720809/cable-sizing` (§2.2 above). Integration discovery item (CS-PR-02 inspection). The `W-CBL-001` rule in `packages/validation/` is a Stage 1 audit hint; it is not the existing LV Cable Sizing validation rule set. |
| Existing Cable Sizing warning / error code namespace (e.g., a distinct `E-CS-*` / `W-CS-*` family beyond the PRD §7.8 placeholders). | PRD §7.7 FR-CS-001 reuse list; PRD §15 OQ-03; PRD §7.8 FR-WE-001 illustrative entries (`E-VAL-003`, `W-CF-001`, `E-SC-001`, `E-SC-002`). | **Known external source** = `Karma720809/cable-sizing` (§2.2 above). Integration discovery item (CS-PR-02 inspection). The integration must either inherit the existing engine's code namespace (preserving regression compatibility of any GC-LV tests that match by code) or formally remap with a documented translation table — closed by CS-OQ-1 / CS-OQ-13 after CS-PR-02 confirms the actual external namespace. |
| Existing Cable Sizing Golden Cases — `GC-LV-*` (or the existing engine's native ID prefix). | PRD §14.5 ("Existing GC-LV tests preserved"); PRD §12.1 Cable Sizing list; PRD §15 OQ-06 (1P2W / 3P3W). | **Known external source** = `Karma720809/cable-sizing` (§2.2 above). **Not yet inside the `etap` monorepo** at HEAD `2cc5890`. No `GC-LV-*` / `gc_lv_*` / `gc-lv-*` artifact exists under `docs/stage-1-baseline/stage_1_preimplementation_support_v1_1/golden_cases/`, `packages/fixtures/src/golden_cases/`, or `packages/fixtures/tests/`. The only Golden Case present in `etap` today is `GC-SC-01` (Stage 3 Short Circuit). Integration discovery item — GC-LV file paths, ID convention, expected-value verification basis must be **inspected** in `Karma720809/cable-sizing` by CS-PR-02 (inventory) and migrated by CS-PR-12. |
| Existing Cable Sizing UI screen / `apps/web/cable-sizing-screen/` (per PRD §16 sketch). | PRD §16 monorepo structure example. | **Known external source** = `Karma720809/cable-sizing` (§2.2 above). Integration discovery item (CS-PR-02 inspection + CS-PR-11 UI integration). The current `apps/web/` folder has no `cable-sizing-screen/`; only the `CalculationStatusPanel.tsx` placeholder. |
| Existing Cable Sizing report data structure code. | PRD §7.7 FR-CS-001 reuse list. | **Known external source** = `Karma720809/cable-sizing` (§2.2 above). Integration discovery item (CS-PR-02 inspection). Out of Stage 4 scope to *use* (Report Workflow is Stage 5); Stage 4 must surface it only as an integration discovery for later use. |
| `packages/cable-sizing/` (or equivalent integrated package directory inside `etap`). | Stage 3 overall review §10 hand-off item 5 ("a new `packages/cable-sizing/` paralleling `packages/duty-check/`, or an integration into an existing package"). | **Not present in `etap`.** Boundary decision (and its relationship to whatever package layout `Karma720809/cable-sizing` already uses) is owned by CS-OQ-2 and confirmed by CS-PR-02. |
| Cable Sizing run / runtime bundle slot in `packages/calculation-store/` (`"cable_sizing_bundle"` `CalculationModule` literal, `CableSizingRunBundle` discriminator, retention key). | Stage 3 retention pattern (`packages/calculation-store/src/types.ts` `CalculationModule` widened to `"load_flow_bundle" \| "short_circuit_bundle" \| "duty_check_bundle"` per PR #15 / PR #22). | **Not present in `etap`.** Stage 4 retention slot is owned by CS-PR-10 (runtime retention hardening). |
| Cable Sizing acceptance manifest block (`stage4` block in `scripts/acceptance-coverage.json`). | Stage 3 closeout pattern (PR #17 added the `stage3` block). | **Not present in `etap`.** Owned by CS-PR-13 (Stage 4 acceptance closeout). This PR does **not** edit `scripts/acceptance-coverage.json`. |
| `validateForCableSizing()` readiness wrapper. | Stage 2 / Stage 3 readiness pattern (`validateForCalculation()`, `evaluateDutyCheckReadiness()`). | **Not present in `etap`.** Owned by CS-PR-05 (input validation fail-closed hardening). |
| Existing engine known limitations document. | PRD §7.7 FR-CS-001 reuse expectations. | **Known external source** = `Karma720809/cable-sizing` (§2.2 above). Integration discovery item (CS-PR-02 inspection). Whatever the upstream `Karma720809/cable-sizing` repo documents as known limitations must be surfaced in the Stage 4 integration record before CS-PR-04 (engine integration) lands. |

The three-category shape above (in-`etap` / known-external / unresolved)
is the "existing LV Cable Sizing asset inventory" that the Stage 3
overall review §10 hand-off item 4 requires. It is a **starting
inventory** recorded at the **spec PR**; the **inventory-confirmation
PR** is CS-PR-02 in the Stage 4 implementation plan, where
`Karma720809/cable-sizing` is inspected and the package / API boundary
+ migration method are decided before any engine code is moved,
copied, or imported into `etap`.

---

## 3. Stage 4 Cable Sizing scope (charter detail)

### 3.1 Calculation surface

Stage 4 Cable Sizing produces, per cable in the project, an adequacy
result against four sizing criteria taken directly from PRD §7.7
FR-CS-002 ("Cable Size 선정 기준"):

1. **Current carrying capacity** (ampacity check against derated
   cable ampacity at the chosen installation reference method).
2. **Voltage drop** (per Cable Sizing engine voltage-drop check; see
   §3.2 below for the relationship to the Stage 2 Load Flow /
   Voltage Drop result).
3. **Short-circuit thermal withstand** (using the upstream Short
   Circuit current and the protective-device clearing time; see §3.4
   for the relationship to the Equipment Duty cable withstand
   surface).
4. **Installation correction factor** evaluation (ambient
   temperature, soil resistivity, grouping, loaded conductors).

Plus, when the cable serves a motor (PRD §7.7 FR-CS-002 #6):

5. **Motor starting voltage drop** (separate from steady-state
   voltage drop; uses the motor's `startingCurrentRatio` and
   `startingMethod`).

And, when applicable (PRD §7.7 FR-CS-002 #5):

6. **Armour / PE conductor requirement** (using `Cable.armourType` and
   `Cable.armourCsaMm2`; see CS-OQ-10 for the armour-CSA
   interpretation).

Stage 4 also supports the two PRD-level operating modes:

- **FR-CS-003 Existing Cable Verification.** User submits a chosen
  cable size; the engine returns ampacity / voltage-drop /
  short-circuit / armour / overall pass-fail status.
- **FR-CS-004 Recommended Cable Size.** User selects auto sizing; the
  engine returns the smallest acceptable cable size, or refuses
  (invalid) when any of: design current invalid; cable library
  missing; installation method missing where required; soil
  resistivity missing for buried installation; short circuit current
  or trip time invalid (PRD §7.7 FR-CS-004 list).

### 3.2 Relationship to Stage 2 Voltage Drop

Stage 2 produces a **Voltage Drop result** as part of the Load Flow
bundle (`packages/solver-adapter/src/voltageDrop.ts`). That result
is an **operating-state** voltage-drop result derived from the Load
Flow solution: per-branch sending / receiving voltage, drop %, limit
%, status. It uses the operating current at the simulated scenario.

Cable Sizing's voltage-drop check is **distinct**:

- It uses the **design current** (PRD §7.7 FR-CS-000 design current
  policy), not the operating current, as the basis.
- It is evaluated against the Cable Sizing engine's voltage-drop
  formulation (which may differ in its impedance or temperature
  assumption from Load Flow).
- Its purpose is **sizing adequacy**, not operating-state monitoring.

Per PRD §7.7 FR-CS-000 #6–#8, Stage 4 must:

- Report **both** design-current voltage drop and operating-current
  voltage drop in integrated mode.
- Surface a warning (and not silently coerce) when
  `operatingCurrentA > designCurrentA`.

Stage 4 must not collapse the two results. The Stage 2 Voltage Drop
runtime path (`packages/solver-adapter/src/voltageDrop.ts`) is
**unchanged** by Stage 4 (CS-PR-08 is a result-state hardening PR, not
a Stage 2 modification PR).

### 3.3 Relationship to Stage 3 Short Circuit

Cable Sizing's short-circuit thermal withstand check **consumes** the
upstream short-circuit current (`shortCircuitCurrentKA`) and
protective-device clearing time (`tripTimeS`) per PRD §7.7 FR-CS-000.
It does **not produce** them.

The Short Circuit module owner remains
`packages/solver-adapter/src/shortCircuit*.ts` /
`services/solver-sidecar/src/short_circuit.py` (Stage 3 PR #2 / #3 /
#4). Stage 4 must:

- Read the Short Circuit run bundle's per-bus `Ik''` for the cable's
  upstream / downstream bus context as the basis for the cable's
  short-circuit current input.
- Read the protective-device clearing time from the project's
  `Breaker` data or from `ProjectMetadata.shortCircuit.defaultFaultClearingS`
  (per Equipment Duty spec §4.4 / ED-OQ-04 default-clearing convention)
  as the basis for the cable's `tripTimeS` input.
- Refuse to run (fail closed) when either is invalid (CS-OQ-13).
- Treat both as **inputs**, not outputs. No Stage 4 PR is allowed to
  modify Short Circuit calculation behavior.

### 3.4 Relationship to Equipment Duty cable withstand

Per Stage 3 overall review §10.6 and Equipment Duty spec §4.4 /
ED-OQ-04, **cable short-circuit *withstand*** (does an already-sized
cable survive a fault?) is an **Equipment Duty** responsibility, not a
Cable Sizing responsibility.

Cable Sizing's short-circuit thermal withstand check (§3.1 #3 above)
is the **sizing-side** check: it asks "does the cable I am about to
recommend survive the short-circuit current at its location for the
relevant clearing time?". Equipment Duty's cable withstand check asks
"does the cable I have already chosen survive the short-circuit
current at its location for the relevant clearing time?".

The two checks share most of the input ingredients
(`shortCircuitCurrentKA`, `tripTimeS`, cable `K` value, cable
`A` cross-section), but their **owners** differ:

- **Cable Sizing engine (Stage 4).** Decides whether a cable size is
  acceptable or recommends the smallest acceptable size.
- **Equipment Duty (Stage 3 / ED-FU family).** Decides whether an
  already-existing cable's pass / fail row in the Duty Check result.

Stage 4 must **not absorb Equipment Duty cable withstand scope**. The
two surfaces stay separate. The Cable Sizing engine's withstand
check produces a Cable Sizing result; the Equipment Duty cable
withstand check produces an Equipment Duty result; both consume the
same upstream Short Circuit and protective-device clearing-time
inputs.

### 3.5 Relationship to Stage 5 Report Workflow

Cable Sizing report rows are part of PRD §7.9 FR-RPT-001 ("Cable
Sizing Report"). Stage 5 (Report & Review Workflow) integrates the
Cable Sizing result into the Excel report flow; Stage 4 must define
the runtime result model only and must **not** ship report-export
code, PDF, or certified-output paths.

---

## 4. Formal OQ Decisions

This section closes the formal Open Questions for Stage 4. The pattern
mirrors Stage 3 spec §1 and Stage 3 plan §8 (the pre-implementation
OQ gate). Reopening any decision below requires an explicit Stage 4
spec revision before any implementation PR proceeds.

### CS-OQ-1 — Existing engine source and ownership

**Question.** Where does the existing LV Cable Sizing engine live, and
under what ownership / version pin / integration method will Stage 4
integrate it?

**Decision.**

- **Stage 4 reuses the existing LV Cable Sizing program from
  `Karma720809/cable-sizing`** (https://github.com/Karma720809/cable-sizing).
  That repository is the **known baseline source** named by PRD §15
  OQ-03 / PRD §7.7 FR-CS-001 / PRD §14.5 / PRD §16. It is the
  authoritative source-of-truth to inspect for the engine, validation
  rules, warning/error code namespace, UI, tests, fixtures, GC-LV
  Golden Cases, and report data structure. **Stage 4 must not rewrite
  the engine.**
- **The current PR (CS-PR-01) does not import, copy, move, or rewrite
  any code from `Karma720809/cable-sizing`.** It only names the
  repository as the inspection target and the integration baseline.
- **CS-PR-02 must determine the integration method.** The integration
  method is **not** decided in this spec PR. CS-PR-02 evaluates and
  selects from at least the following explicitly reviewed options
  (and may surface another option if `Karma720809/cable-sizing`
  inspection makes one obviously preferable):
  - **git subtree** — pull the external repo into `etap` as a
    subtree, preserving history.
  - **manual migration** — copy selected files into `etap` with an
    explicit history / source / commit-reference note in the
    integration PR description.
  - **package extraction into the monorepo** — extract the
    Cable-Sizing-relevant subset into `packages/cable-sizing/` (or
    equivalent) inside `etap`, keeping `Karma720809/cable-sizing` as
    the upstream reference.
  - **npm / pnpm workspace package** — consume `Karma720809/cable-sizing`
    as a published / versioned dependency rather than vendoring its
    source.
  - **Another explicitly reviewed approach** documented in CS-PR-02
    with the same source / license / verification-evidence record.
  Whichever method is selected, CS-PR-02 must record the rationale,
  the precise version / commit pin, the license / ownership
  assumption, and the retained verification evidence (especially for
  GC-LV expected values).
- **Out-of-monorepo ≠ unknown.** The existing engine's code is **not
  yet present inside this `etap` monorepo at HEAD `2cc5890`** (see
  §2.1 / §2.3 above), but its source is **not unknown** — it is
  `Karma720809/cable-sizing` (§2.2). Until CS-PR-02 confirms the
  inspection results and selects the integration method, Stage 4 spec
  PRs (CS-PR-01, CS-PR-03) must reference the engine through the
  integration contract only — not by importing a specific module path
  from either `Karma720809/cable-sizing` or any future in-`etap`
  location.
- **If `Karma720809/cable-sizing` contents differ from assumptions in
  this spec or the implementation plan**, the spec / plan must be
  updated through a **reviewable follow-up PR** (Stage 3 plan §3.4
  reconciliation pattern: spec change comes first). For example: if
  the external repo's GC-LV cases use an ID prefix other than
  `GC-LV-*`; if its warning/error code namespace differs from the
  `E-CS-*` / `W-CS-*` working family; if its package / framework
  layout makes a particular integration method (CS-OQ-1 list above)
  obviously the only safe choice — each of these triggers a
  spec / plan update PR before any code change.
- **If, after CS-PR-02 inspection, the engine is found to be in a
  state that requires non-trivial refactoring before integration**
  (e.g., it depends on a runtime not available in this monorepo, or
  exposes only a UI-coupled API), the refactoring is a **separate
  PR** and **must not be conflated with the integration PR**
  (CS-PR-04). That refactor PR must preserve the engine's existing
  GC-LV behavior (CS-OQ-11) and warning/error vocabulary (CS-OQ-13).
- **Importing or moving existing Cable Sizing engine code is a future
  implementation PR (CS-PR-04), not this spec PR.**

**Consequence.** This spec PR names the **known baseline source**
(`Karma720809/cable-sizing`) but does not name a specific commit
pin, license assumption, or integration method. CS-PR-02 records
those — and CS-PR-04 acts on them.

### CS-OQ-2 — Package / API boundary

**Question.** Where in this monorepo does the integrated Cable Sizing
engine live, and what is the public API surface that other packages
consume?

**Decision.**

- Cable Sizing **must be integrated behind a package / API boundary**.
  App-facing code (`apps/web/`, `packages/calculation-store/`,
  `packages/solver-adapter/` callers) must depend on a stable contract
  / result model, **not** on the existing engine's internal
  calculation details.
- The natural pattern, mirroring Stage 3 Equipment Duty
  (`packages/duty-check/`) and Stage 2 / Stage 3 calculation-store
  retention, is a new package (working name: `packages/cable-sizing/`)
  that exports:
  - The Cable Sizing canonical input contract types (per PRD §7.7
    FR-CS-000).
  - The Cable Sizing result model (per §5 of this spec).
  - A `runCableSizingForAppNetwork(...)` orchestrator paralleling
    `runShortCircuitForAppNetwork()` and `runDutyCheckForBundle()`.
  - A readiness wrapper (`evaluateCableSizingReadiness()` or
    `validateForCableSizing()`) returning the same four-state contract
    as Equipment Duty (`ready_to_run`, `blocked_by_upstream`,
    `blocked_by_stale_upstream`, `blocked_by_validation`) — adapted as
    needed for Cable Sizing's specific upstream dependencies (Load
    Flow optional; Short Circuit required only for the thermal
    withstand check).
- The Cable Sizing engine's **internal calculation modules** (ampacity
  tables, voltage-drop formulas, derating-factor lookups) are
  **encapsulated inside the package** and are not part of the public
  API. The integration boundary surface must remain stable across
  engine internal changes.
- The Cable Sizing surface **is not assumed to require a Python
  sidecar**. The existing LV Cable Sizing engine is presumed to be a
  TypeScript / JavaScript / pure-data implementation; if CS-PR-02
  inventory finds otherwise, the sidecar dependence question reopens
  as a Stage 4 spec revision item before CS-PR-04 lands.
- The exact package layout, public API names, file paths, and
  re-export tree are **owned by CS-PR-02** (boundary confirmation)
  and **realized by CS-PR-03 / CS-PR-04** (contract / engine
  integration). This spec PR fixes the *shape* of the boundary, not
  the file-by-file layout.

**Consequence.** No app-facing code in Stage 4 imports from the engine's
internal modules. All Stage 4 callers route through the
`packages/cable-sizing/` (or equivalent) public entrypoint.

### CS-OQ-3 — Input contract mapping

**Question.** How does the Power System Study App canonical model
(`Cable`, `Load`, `Motor`, scenario context, Load Flow result, Short
Circuit result, Equipment Duty result) map onto the existing Cable
Sizing engine's canonical input schema (PRD §7.7 FR-CS-000)?

**Decision.**

- Stage 4 **must define and document a deterministic mapping** from
  the Power System Study App canonical model to the Cable Sizing
  engine canonical input schema (PRD §7.7 FR-CS-000). The mapping is
  the deliverable of CS-PR-03 (Cable Sizing contract / result model
  and input mapping).
- The mapping must cover, at minimum, the PRD §7.7 FR-CS-001 "연계
  항목" list:

  | Cable Sizing engine input | Source in Power System Study App canonical model |
  |---|---|
  | Load current (`operatingCurrentA`) | Load Flow result (`BranchResult.currentA` for the cable) when integrated mode is selected; otherwise null. |
  | Motor FLA (motor `flaA`, `flaSource`) | `Motor.flaA` / `Motor.flaSource` (Stage 1 schema) when the cable serves a motor load. |
  | Demand factor | `Load.demandFactor` (Stage 1 schema) for non-motor loads. |
  | Cable length | `Cable.lengthM` (Stage 1 schema). |
  | Voltage level | `Cable.voltageGradeKv` and the upstream/downstream `Bus.nominalVoltageKv`. |
  | Installation method | `Cable.installationMethod` (Stage 1 schema). |
  | Ambient temperature | `Cable.ambientTempC` (Stage 1 schema). |
  | Soil resistivity | `Cable.soilResistivityK_m_W` (Stage 1 schema). |
  | Loaded conductors | `Cable.loadedConductors` (Stage 1 schema). |
  | Armour CSA | `Cable.armourCsaMm2` (Stage 1 schema; see CS-OQ-10). |
  | Short circuit current | Short Circuit run bundle (`ShortCircuitBusResult.ikssKa` for the relevant bus). |
  | Trip time | `Breaker.faultClearingS` (per-equipment, when present) or `ProjectMetadata.shortCircuit.defaultFaultClearingS` (Stage 1 schema, project-level). |
  | Design current basis | Per CS-OQ-4 below (load-type derivation; manual override only with audit visibility). |
  | `feederType` | Derived from the cable's downstream load: `motor`, `static_load`, `mixed_load`, `spare`; `distribution_feeder` when downstream is another bus carrying further loads. (PRD §7.7 FR-CS-000 enum.) |

- Any **mismatch** between an engine input shape and the app schema
  (for example: the engine expects `installationMethod` values not
  in the Stage 1 `tray|buried|conduit|ladder|air|unknown` enum, or
  expects a unit different from the app's scalar base-unit policy
  per PRD §15 OQ-14) is **documented as a discovery item** in
  CS-PR-02 and **resolved by a future gated PR** — never silently
  coerced.
- Schema changes to the Stage 1 canonical project file required for
  the mapping (e.g., a new optional cable-side field) **must follow
  the ED-PR-01 pattern**: optional, additive, canonical-drift-test
  pinned, and **scheduled as a separate gated PR** (per CS-OQ-14 and
  Stage 4 implementation plan CS-PR-03 / CS-PR-04).

**Consequence.** The mapping is the spec-side contract that the
implementation PRs must satisfy. It is **not** code in this PR; it is
the specification CS-PR-03 will realize.

### CS-OQ-4 — Design current basis

**Question.** How is design current determined in the integrated
Cable Sizing surface, given Load Flow operating current, motor FLA,
demand factor, and the user's potential manual override?

**Decision.**

- **Design current is derived automatically by load type where
  possible.**
  - **Motor feeders.** Design current prefers the motor FLA (`Motor.flaA`)
    when present and validated; the FLA source (`Motor.flaSource` —
    `nameplate`, `calculated`, `vendor`) determines the result's
    `source` field per PRD §7.7 FR-CS-000. When `flaA` is null and
    `flaSource: "calculated"`, the engine derives FLA from
    `Motor.ratedKw`, `Motor.ratedVoltageV`, `Motor.efficiency`, and
    `Motor.powerFactor` per the standard 3-phase motor formula.
  - **Static / mixed / spare loads.** Design current is derived from
    `Load.kw`, `Load.powerFactor`, `Load.demandFactor`, and the
    project's diversity / sizing rule.
  - **Distribution feeders** carrying further downstream loads:
    design current is derived from the aggregated downstream demand
    on that path, applying the project's diversity / demand-factor
    policy.
- **Manual override.** Design current may be **explicitly overridden**
  by user input. When overridden, the result's `source` field carries
  `user_input` and the result must surface explicit visibility:
  - The override value is recorded in the audit trail.
  - The override value is **not silently preserved** when the override
    is turned off (see CS-OQ-7).
  - The Cable Sizing readiness wrapper must validate the override
    value (positive, finite); invalid override **fails closed**
    (CS-OQ-13).
- **Operating current vs design current (integrated mode).** Per PRD
  §7.7 FR-CS-000 #2–#8:
  - Integrated mode shall **not** blindly replace design current with
    Load Flow operating current.
  - Load Flow branch current may be used as a **cross-check and
    warning source**.
  - When `operatingCurrentA > designCurrentA`, the result must raise
    a warning or error per the project policy (the choice between
    warning and error is itself a decision the integration must
    record explicitly per CS-PR-03; this spec records "warning by
    default" as the integration starting point, mirroring the PRD's
    "shall raise a warning or error" wording — escalation to error
    requires explicit project-policy configuration).
- **Result reporting.** Cable Sizing result rows must report **both**
  `designCurrentA` and `operatingCurrentA` when integrated mode is
  used (PRD §7.7 FR-CS-000 #8). Each carries an explicit `source` and
  `status` per CS-OQ-12.

### CS-OQ-5 — Demand factor

**Question.** How is the load-side demand factor handled in the
Stage 4 integration, and what is the regression compatibility with
existing GC-LV cases?

**Decision.**

- **Single demand factor model.** Stage 4 integration keeps a single
  demand factor model — the per-load `Load.demandFactor` value already
  present in the Stage 1 canonical schema. No second project-level
  demand-factor table is introduced in Stage 4.
- **100% default behavior.** When `Load.demandFactor` is null /
  absent, the integrated Cable Sizing engine treats it as **1.0**
  (100%) so existing GC-LV regression cases that did not specify a
  demand factor continue to produce the same numeric output.
- **Defaulted values must be visible.** The applied demand factor is
  always reported on the Cable Sizing result row with explicit
  `source: "user_input"` (when set on `Load.demandFactor`) or
  `source: "defaulted"` (when fallback to 1.0). A user must be able
  to audit the factor that was actually applied; it is **not** silent.
- **Per-load override visibility.** When the user-set
  `Load.demandFactor` ≠ 1.0, the Cable Sizing result row must include
  a corresponding cable-sizing audit line (e.g., a `W-CS-DF-*` code in
  the integration code namespace from CS-OQ-1 / CS-OQ-13).
- **Multi-feeder demand-factor models** (project-level diversity
  factor table, group-level diversity factor) are explicitly
  **out of Stage 4 scope** and recorded as a non-goal.

### CS-OQ-6 — Loaded conductors

**Question.** What is the default for `loadedConductors`, how does the
neutral conductor enter the model, and what happens when the value is
invalid?

**Decision.**

- **3-phase 4-wire default.** When `Cable.loadedConductors` is null
  on a 3-phase 4-wire cable, the integrated engine defaults to **3
  loaded conductors** (i.e., the neutral is not loaded under balanced
  3-phase steady state). Per PRD §15 OQ-06, the integrated calculation
  scope is 3-phase balanced; the 3-conductor default reflects that.
- **Explicit neutral-loaded toggle.** An explicit
  "neutral-is-loaded" override (4 loaded conductors) is preserved
  where the existing engine already exposes it. The override is
  per-cable. Whether the toggle is realized as an extension of
  `loadedConductors` to {3, 4, ...} or as a sibling field is owned
  by CS-PR-03 (input mapping) and depends on the existing engine's
  field naming.
- **Invalid `loadedConductors` fails closed.** Negative, zero, or
  non-numeric `loadedConductors` produces a Cable Sizing
  fail-closed error (CS-OQ-13). Invalid values **must not** silently
  fall through to a default; the result row carries an explicit
  error code (e.g., `E-CS-LC-*` in the integration code namespace
  per CS-OQ-1 / CS-OQ-13). PRD §12.1 already lists "Loaded
  conductors invalid override" as a preserved GC-LV case
  (CS-OQ-11).
- **1P2W / 3P3W standalone preservation.** Per PRD §15 OQ-06, the
  standalone Cable Sizing 1P2W / 3P3W capability and the
  corresponding GC-LV cases are preserved. Integration-mode
  defaulting applies only to integrated 3-phase cable rows; the
  standalone path's loaded-conductor convention is whatever the
  existing engine specifies and must be preserved verbatim.

### CS-OQ-7 — Override behavior

**Question.** When a user toggles an override off (e.g., turns off
manual design-current override, manual demand factor, or manual cable
R/X), what happens to the override value in the active session and on
project save?

**Decision.**

- **Active-session preservation is allowed.** Override values **may**
  be preserved during the active session when the override toggle is
  turned off. Re-toggling the override on within the same session
  may restore the previously entered override value as a convenience.
- **Project-file persistence requires explicit approval.** Override
  values are **not persisted** to the Stage 1 canonical project file
  unless the override field itself is explicitly part of the
  approved project-file model (e.g., `Cable.rOhmPerKm` is already
  persisted, but a session-only "manual design current override"
  scratchpad value is not). New persisted override fields require
  CS-OQ-14-gated schema PRs.
- **Saving must not silently preserve inactive override
  assumptions.** When the user saves with an override toggle in the
  off state, the saved project file must not carry a hidden override
  value that would re-activate on reload. The saved file represents
  the current intended state.
- **Active overrides are visible.** When an override is on, the
  Cable Sizing result row's `source` field carries `user_input` for
  the overridden axis (per CS-OQ-12) and the audit trail records the
  override.

### CS-OQ-8 — Missing correction factors

**Question.** When a required correction-factor input is missing (soil
resistivity, ambient temperature, grouping condition, installation
reference method), what does the Cable Sizing surface do?

**Decision.**

- **Soil-related inputs are blocking when the installation mode
  requires them.** When `installationMethod` is `buried` and
  `soilResistivityK_m_W` is null / absent, Cable Sizing **fails
  closed** (CS-OQ-13). PRD §7.8 FR-WE-001 already names this code
  illustratively (`E-VAL-003 "Soil resistivity is required for buried
  installation"`); the integration code namespace per CS-OQ-1 will
  fix the actual emitted code.
- **Other correction factors may use documented defaults with
  explicit warnings only if the spec approves.** PRD §7.8 FR-WE-001
  illustrates `W-CF-001 "Default correction factor was used"`. The
  defaults applied (e.g., default ambient temperature when null) are
  the existing engine's defaults; the integration must preserve them
  and surface a warning code.
- **Defaults must be visible / auditable, not silent.** Every applied
  default surfaces on the result row with the corresponding
  warning code and `source: "defaulted"` per CS-OQ-12. A user must
  be able to look at the result row and see exactly which
  correction-factor inputs were defaulted.
- **Recommended-cable-size mode (FR-CS-004) refuses to recommend**
  when a required correction-factor input is missing per the PRD
  §7.7 FR-CS-004 list (cable library missing, installation method
  missing where required, soil resistivity missing for buried
  installation, etc.). The recommended-size result row carries an
  explicit "invalid — cannot recommend" status; it is not a
  fabricated recommendation.

### CS-OQ-9 — Reference method selection

**Question.** What set of installation reference methods is exposed,
and how is stale reference-method selection prevented when the cable's
phase / topology / installation context changes?

**Decision.**

- **Hybrid approach.**
  - **Common practical reference methods** (e.g., a curated subset
    of IEC 60364-5-52 reference methods aligned with the existing
    LV Cable Sizing App's primary use cases) are **exposed first** in
    the UI for the most common feeder types.
  - The **full supported reference-method set** of the existing
    engine remains accessible behind an "advanced" / "all methods"
    UI affordance for users who need it.
- **Stale-selection prevention.** When the cable's
  `installationMethod`, `loadedConductors`, or upstream/downstream
  topology context changes in a way that invalidates the previously
  selected reference method, the Cable Sizing surface must:
  - Detect the conflict.
  - Either auto-clear the now-invalid selection (and emit a warning
    per CS-OQ-13 stale-result rule) **or** fail closed and require
    the user to re-select before re-running.
  - Choice of clearing-vs-failing-closed is owned by CS-PR-06
    (reference-method / loaded-conductors / installation-state
    hardening); the spec records that **silent stale persistence is
    forbidden**.
- **Mapping the Stage 1 enum.** The Stage 1 schema's
  `installationMethod` enum is `tray|buried|conduit|ladder|air|unknown`
  (`packages/schemas/src/stage_1_project_schema.rev_d.zod.ts`). If the
  existing engine exposes finer-grained reference methods than this
  enum, the integration mapping (CS-PR-03) must record the
  many-to-one or one-to-many resolution explicitly.

### CS-OQ-10 — Armour / CPC / PE interpretation

**Question.** How is `Cable.armourCsaMm2` interpreted by the integrated
Cable Sizing engine, and what happens when armour data is unavailable?

**Decision.**

- **`Cable.armourCsaMm2` is the armour CSA for armoured LV cable.**
  The PRD §8.5 Cable Model example treats `armourCsaMm2` as armour
  CSA. The integrated Cable Sizing surface adopts the same
  interpretation **unless a later approved spec revision changes
  this** (e.g., reinterprets it as an external CPC / PE conductor
  cross-section).
- **Armour-vs-CPC ambiguity.** The PRD does not yet name a separate
  CPC / PE conductor field. Until one is added (gated by CS-OQ-14),
  the integrated engine uses `armourCsaMm2` as the protective-earth
  return path **only when `Cable.armourType` is one of `SWA` /
  `AWA` / `STA`** (i.e., when an armour exists). When
  `armourType: "none"` or null, no armour-derived earth-return path
  is assumed.
- **Missing armour data.** When `armourType` is non-`none` but
  `armourCsaMm2` is null, the Cable Sizing armour check shows a
  **clear warning or not-applicable state**. Stage 4 must **not
  fabricate** an armour CSA result; the result row carries
  `armourCheck: { status: "missing_input" | "not_applicable", ... }`
  with the corresponding warning code. The PRD §7.7 FR-CS-002 #5
  bullet ("Armour/PE conductor requirement, if applicable") is
  honored by either showing a real check or showing a documented
  not-applicable state.

### CS-OQ-11 — Golden Case set and GC-LV preservation

**Question.** How are the existing GC-LV Golden Cases preserved,
classified, and migrated into the Stage 4 acceptance framework?

**Decision.**

- **Existing GC-LV tests / cases must be preserved.** Stage 4 must
  not delete, alter the expected numeric output of, or
  silently-merge any existing GC-LV case from the upstream LV Cable
  Sizing engine.
- **Three-way classification.** The Stage 4 Golden Case integration
  manifest (the per-Stage 4 equivalent of `stage3GoldenCases[]`)
  records each GC-LV case with one of three classifications:
  - `verified` — independently checked engineering reference (hand
    calculation, IEC / IEEE textbook example, verified spreadsheet,
    or independent commercial-tool result with documented inputs)
    that the integration test compares the engine output against.
  - `provisional` — a useful example, not yet verified for
    engineering acceptance. Provisional cases may guard against
    regression but are not engineering references.
  - `regression_only` — protects existing engine behavior but is
    explicitly **not** an engineering reference.
- **Provisional-to-verified promotion requires evidence.**
  Provisional cases **are not** silently promoted to verified during
  Stage 4 integration. Promotion requires a documented independent
  reference (per the list above) and a separate Golden Case
  refinement PR. The Stage 3 GC-SC-01 promotion gate pattern
  (Stage 3 closeout §4.1 / overall review §5) applies here verbatim.
- **No fake expected values.** GC-LV cases must not contain
  fabricated expected values (e.g., a number copied from the engine
  output without an independent reference and labeled `verified`).
  Any calculated expected value must identify its source and
  verification status (per CS-OQ-12 source/status separation, and
  PRD §15 OQ-10 Golden Case reference policy).
- **Static support-package artifact distinction.** The Stage 3
  GC-SC-01 pattern of distinguishing the **static support-package
  artifact's own `referenceStatus`** (which describes the
  independent hand-calc reference) from the **acceptance-manifest
  Golden Case integration `referenceStatus`** (which describes the
  Stage's integration status) applies here. Stage 4 must preserve
  the same three-way distinction (the support-package artifact may
  carry its own `referenceStatus: "verified"` for the underlying
  hand calculation while the Stage 4 acceptance-manifest
  integration entry is `provisional`).
- **1P2W / 3P3W cases preserved.** Per PRD §15 OQ-06, the
  standalone 1P2W / 3P3W Golden Cases are preserved. The integrated
  3-phase Stage 4 calculation surface does not re-execute these
  cases in integrated mode (1P2W / 3P3W are out of integrated
  calculation scope per PRD §15 OQ-06), but the cases themselves
  remain part of the engine's regression suite and must continue to
  pass against the standalone path.

### CS-OQ-12 — Source / status model

**Question.** How are "where did this number come from" (source) and
"how confident are we in it" (status) represented on a Cable Sizing
result?

**Decision.**

- **Two dimensions, never collapsed.** Cable Sizing result rows must
  carry **source** and **status** as separate fields per axis:

  | Axis | Examples |
  |---|---|
  | **Source** (where did the value come from?) | `user_input`, `calculated` (engine derivation), `defaulted` (engine default applied), `derived` (e.g., motor FLA derived from kW), `dataset` (lookup from a cable / installation table), `load_flow_branch_current` (Load Flow result), `short_circuit_result` (Short Circuit result), `protective_device_clearing_time` (Breaker data). |
  | **Status** (how confident, what state?) | `verified`, `provisional`, `defaulted`, `warning`, `invalid`, `regression_only`. |

- **No collapse.** Source and confidence/status **must not be merged
  into a single field**. PRD §7.7 FR-CS-000 already shows the
  separation in its example (`{ "source": "calculated_from_motor_fla",
  "status": "valid" }`). Stage 4 preserves this separation across the
  result model and the report row.
- **Per-axis recording.** The two axes apply per output / per input
  axis (design current, operating current, ampacity, voltage drop,
  short-circuit withstand, armour). A single Cable Sizing result row
  may carry multiple `(source, status)` tuples — one per axis.
- **PRD §15 OQ-09 alignment.** PRD §15 OQ-09 already states "All
  project-local equipment data는 source/status tracking과 calculation
  audit trail에 포함되어야 한다." Stage 4 inherits and extends this rule
  for the Cable Sizing result model.

### CS-OQ-13 — Change control / invalid-state policy

**Question.** What does the Cable Sizing surface do when an input
becomes invalid, and how does it ensure the UI / result layer does not
display stale successful results?

**Decision.**

- **Fail closed for invalid states.** Invalid numeric inputs (zero
  or negative design current basis; zero or negative short-circuit
  current; zero or negative trip time; zero or negative or
  non-integer `loadedConductors`; missing required installation
  parameter; missing required correction-factor input per CS-OQ-8)
  **must not produce a valid-looking result row**. The result row
  must surface an explicit error code (per the integration code
  namespace per CS-OQ-1) and the runtime status must be `failed` or
  `invalid` — never a synthetic "0.0 A" or "0.0 V drop" row.
- **Stale results are cleared or visibly invalidated.** When the
  user edits an input that affects an existing Cable Sizing result
  row (cable conductor size, installation method, ambient
  temperature, soil resistivity, grouping, loaded conductors,
  upstream Load Flow, upstream Short Circuit, protective-device
  clearing time, design-current basis source), the existing result
  row must be cleared or visibly marked stale. The Stage 2 / Stage
  3 stale-flag pattern applies (`apps/web/src/state/calculationStore.ts`
  `markStale` rule).
- **No stale successful display.** The UI / result layer must not
  continue to display stale successful results after inputs become
  invalid. The Stage 2 stale-flag rule (no auto-recompute on project
  edit) extends to Cable Sizing.
- **Deterministic warning / error codes.** Every invalid-state path
  surfaces a deterministic warning / error code (no free-text-only
  messages on the result axis). The exact codes are owned by CS-PR-03
  (contract / result model) and registered in the validation-code
  table (or the integration package's local code table).

### CS-OQ-14 — Runtime / project-file separation

**Question.** Where do Cable Sizing results live (runtime store vs
project file), and what schema changes — if any — are allowed in
Stage 4?

**Decision.**

- **Runtime / store retention only.** Cable Sizing calculation
  results live in `@power-system-study/calculation-store`'s
  `retainedResults` map under `(scenarioId, "cable_sizing_bundle",
  subCase)` keys, paralleling Stage 2 / Stage 3. The runtime
  retention slot is added by CS-PR-10 (runtime retention hardening).
  No silent project-file persistence of calculation results.
- **`calculationSnapshots` stays empty.** The Stage 1 canonical
  schema continues to pin `calculationSnapshots` to `max(0)`. No
  Stage 4 PR populates the array.
- **`calculationResults` is not introduced.** No Stage 4 PR adds a
  `calculationResults` field to the canonical schema or the
  serialized JSON.
- **Optional cable-side schema additions are gated.** If the input
  contract mapping (CS-OQ-3) discovers that an existing-engine
  input is not present on the Stage 1 schema and **must** be added,
  the addition is:
  - **Optional** on the canonical schema (the ED-PR-01 pattern).
  - Pinned by `packages/schemas/tests/canonical-drift.test.ts`.
  - Round-trip-tested by `packages/project-io/tests/round-trip.test.ts`.
  - **Scheduled as a separate gated PR** in the Stage 4
    implementation plan, not bundled with calculation logic.
- **No silent persistence of snapshots.** Per PRD §15 OQ-15
  (calculation snapshot retention policy), calculation results /
  snapshots remain runtime-only in Stage 4. Disk persistence of
  runtime snapshots is the same deferral that Stage 2 (S2-FU-07) and
  Stage 3 (S3-FU-10) carry.

---

## 5. Result model (Stage 4 contract surface)

This section defines the **runtime result-model shape** for Cable
Sizing. It mirrors the Stage 3 Equipment Duty result-model section
(Equipment Duty spec §5) and is the contract that CS-PR-03 (Cable
Sizing contract / result model) must realize. It is **specification
only** — no code, no Zod schema, no test ships in this PR.

### 5.1 Top-level bundle

A Cable Sizing run produces a `CableSizingRunBundle` (working name)
with:

- `runId` — a unique runtime ID for the run.
- `scenarioId` — the scenario the run was executed against.
- `mode` — `"existing_cable_verification"` or
  `"recommended_cable_size"` (per PRD §7.7 FR-CS-003 / FR-CS-004).
- `result` — a `CableSizingResult`.
- `inputSnapshot` — a runtime-only deep clone of the inputs the
  engine consumed (cable list, scenario context, upstream Load Flow
  and Short Circuit references), per the Stage 2 runtime-snapshot
  pattern.
- `metadata` — engine version, integration package version, time of
  run, top-level `status` (`ok`, `partial`, `failed`).

`CableSizingRunBundle` is added to the `CalculationModule` union
(`"load_flow_bundle" | "short_circuit_bundle" | "duty_check_bundle" |
"cable_sizing_bundle"`) and to the `RuntimeCalculationRecord.bundle`
discriminated union by CS-PR-10.

### 5.2 Per-cable result row

Each cable in scope produces a `CableSizingCableResult` row. The row's
**numeric fields are typed `number | null`** so a future engine
calculation refinement can land without producer-side breakage (the
ED-PR-02 pattern). Fields:

- `cableInternalId` — `Cable.internalId` (immutable id; per PRD §15
  OQ-11, never the display tag).
- `feederType` — derived per CS-OQ-3 (`motor`, `static_load`,
  `mixed_load`, `spare`, `distribution_feeder`).
- **Design current axis.** `{ value: number | null, source: ...,
  status: ... }` per CS-OQ-12.
- **Operating current axis** (integrated mode). Same shape; nullable
  in standalone mode.
- **Starting current axis** (motor feeders). Same shape.
- **Short-circuit current axis.** Sourced from the Short Circuit run
  bundle when available; null otherwise.
- **Trip time axis.** Sourced from `Breaker.faultClearingS` or
  project-level default; null otherwise.
- **Ampacity check axis.** `{ derateA: number | null, marginPct:
  number | null, status: ..., source: ..., issueCodes: [...] }`.
- **Voltage drop check axis.** `{ dropPct: number | null, limitPct:
  number | null, status: ..., source: ..., issueCodes: [...] }`.
- **Short-circuit thermal withstand axis.** `{ I2tActual: number |
  null, I2tAllowed: number | null, status: ..., source: ...,
  issueCodes: [...] }`.
- **Armour check axis.** `{ status: ..., source: ..., issueCodes:
  [...] }`.
- **Recommended size axis** (mode `"recommended_cable_size"`). `{
  recommendedConductorSizeMm2: number | null, status: ..., source: ...,
  issueCodes: [...] }`.
- **Per-row status.** `"ok"` | `"warning"` | `"violation"` | `"failed"`
  | `"unavailable"` | `"missing_input"`.
- **Per-row issues.** `issues: CableSizingIssue[]`.
- **Per-row verdict basis.** `"verified"` | `"provisional"` |
  `"regression_only"` (mirrors the ED `verdictBasis` axis).

### 5.3 Issue codes

Cable Sizing issue codes are **deterministic** and live under the
integration package's code namespace (per CS-OQ-1 / CS-OQ-13). The
code prefix family will be confirmed by CS-PR-02 / CS-PR-03 — likely
`E-CS-*` / `W-CS-*` / `I-CS-*` paralleling Stage 2 / Stage 3 code
families, but possibly inheriting the upstream engine's existing
prefix (e.g., `E-CBL-*`) if regression compatibility with GC-LV cases
demands it.

The PRD-level placeholders that the Stage 4 codes must surface
(directly or via translation):

- `E-VAL-003 "Soil resistivity is required for buried installation"`
  (PRD §7.8 FR-WE-001).
- `W-CF-001 "Default correction factor was used"` (PRD §7.8
  FR-WE-001).
- `E-SC-001 "Short-circuit current is invalid"` (PRD §7.8 FR-WE-001;
  also used by Stage 3 Short Circuit).
- `E-SC-002 "Trip time is invalid"` (PRD §7.8 FR-WE-001).
- `W-CBL-001 "Cable R/X manually entered"` (Stage 1
  `validateCableManualRX.ts`; preserved verbatim).

### 5.4 UI rendering rules

- **Numeric `null` renders as `—`, never `0`.** Equipment Duty UI
  pattern (PR #23) extends to Cable Sizing.
- **Per-row issue codes are surfaced** in the result table.
- **Run button is readiness-gated** by the Cable Sizing readiness
  wrapper (CS-PR-05 / CS-PR-11).
- **Stale flag** flips on project edit; no auto-recompute (Stage 2
  / Stage 3 pattern).
- **`not_implemented` placeholder** (the current
  `apps/web/src/components/CalculationStatusPanel.tsx` Stage 4
  placeholder) is replaced by the real Cable Sizing module entry
  in CS-PR-11.

---

## 6. Golden Case policy

Per CS-OQ-11, GC-LV preservation, plus the PRD §15 OQ-10 Golden Case
reference policy:

- **`verified`** — independently checked engineering reference or
  approved benchmark. Acceptable verified reference sources
  (mirroring PRD §15 OQ-10 / Stage 2 §S2-OQ-07 list): hand
  calculation, IEC / IEEE textbook example, verified spreadsheet,
  independent commercial tool result with documented inputs.
- **`provisional`** — useful example, not yet verified for
  engineering acceptance. Provisional cases may guard against
  regression but are not engineering references.
- **`regression_only`** — protects existing engine behavior but is
  explicitly **not** an engineering reference.

Hard rules:

- **Do not convert provisional cases to verified without explicit
  evidence.** Stage 4 PR #1 (this PR) does not flip the
  classification of any case.
- **Do not use fake expected values.** Every numeric expected value
  in a Stage 4 Golden Case must trace to either the existing engine
  output (regression / provisional, not verified) or to an
  independent reference (verified). Copying an engine output and
  labeling it `verified` is forbidden.
- **Existing GC-LV cases are preserved**, including the 1P2W / 3P3W
  standalone cases per PRD §15 OQ-06.
- **Reclassification requires evidence.** A GC-LV case may be
  reclassified upward (e.g., provisional → verified) only by a
  separate Golden Case refinement PR with documented evidence (the
  Stage 3 GC-SC-01 promotion-gate pattern).
- **Static support-package artifact vs acceptance-manifest
  integration status.** The static support-package artifact's own
  `referenceStatus` field (describing the underlying independent
  reference) is **distinct** from the acceptance-manifest Golden
  Case integration entry's `referenceStatus` (describing this
  stage's integration status). This three-way distinction
  (Stage 3 closeout §4.1 / overall review §5) applies verbatim to
  Stage 4.
- **Promotion gates apply.** Promotion of any GC-LV integration
  status from `provisional` to `verified` is owned by a separate
  refinement PR, **not** by CS-PR-12 (GC-LV migration) and **not**
  by CS-PR-13 (Stage 4 acceptance closeout).

---

## 7. Acceptance criteria

The Stage 4 acceptance criteria template is `AC-S4-NN`. Concrete
manifest entries (the `stage4` block in
`scripts/acceptance-coverage.json`) are owned by CS-PR-13 (Stage 4
acceptance closeout) — **this PR does not extend the manifest**.

The template:

| ID | Criterion |
|---|---|
| **AC-S4-01** | Stage 4 Cable Sizing scope defined as **integration of existing Cable Sizing assets**, not greenfield rewrite (per PRD §15 OQ-03 / §7.7 FR-CS-001 / §14.5 / §16; Stage 3 overall review §10.5). |
| **AC-S4-02** | Existing Cable Sizing assets inventoried before any engine code is moved or imported (CS-PR-02 deliverable). |
| **AC-S4-03** | Existing Cable Sizing engine package / API boundary defined; app-facing code depends on a stable contract / result model only (CS-OQ-2). |
| **AC-S4-04** | Input contract mapping from the Power System Study App canonical model to the Cable Sizing engine canonical input schema (PRD §7.7 FR-CS-000) is documented and realized (CS-OQ-3 / CS-PR-03). |
| **AC-S4-05** | Invalid input states **fail closed** — invalid design current basis, short-circuit current, trip time, loadedConductors, or required installation parameter never produce valid-looking results (CS-OQ-13). |
| **AC-S4-06** | Stale successful results are **cleared or visibly invalidated** after relevant input changes; UI does not display stale successful results (CS-OQ-13; Stage 2 stale-flag pattern). |
| **AC-S4-07** | Warning / error codes are **deterministic** and registered (per CS-OQ-1 / CS-OQ-13). |
| **AC-S4-08** | Defaulted values are **visible** on the result row with `source: "defaulted"` and a `W-CF-*`-family warning (CS-OQ-8 / CS-OQ-12). |
| **AC-S4-09** | **Source and status are preserved separately** on each Cable Sizing result axis; no collapse into a single field (CS-OQ-12). |
| **AC-S4-10** | GC-LV cases are **preserved** and classified as `verified` / `provisional` / `regression_only`; no fake expected values (CS-OQ-11 / §6 above). |
| **AC-S4-11** | Runtime calculation results are **not silently persisted** into project files; `calculationSnapshots` stays empty; `calculationResults` is not introduced (CS-OQ-14). |
| **AC-S4-12** | Project-file schema changes (if any) are **separately gated** as ED-PR-01-style optional-field-only PRs (CS-OQ-14 / CS-PR-03 boundary). |
| **AC-S4-13** | Tests cover each calculation mode (existing-cable verification per FR-CS-003; recommended-cable-size per FR-CS-004) and each invalid-state path. |
| **AC-S4-14** | Stage 1 / Stage 2 / Stage 3 behavior remains **unchanged**: canonical schema round-trips pre-existing project files; `validateProject()` / `validateForCalculation()` outputs unchanged on Stage-3-or-earlier scope; Load Flow / Voltage Drop / Short Circuit / Equipment Duty results unchanged. |
| **AC-S4-15** | No Cable Sizing PR leaks scope into Report Workflow (Stage 5), arc flash, breaker arc-impedance, full protection coordination, or per-zone clearing time. |

The mapping of each `AC-S4-NN` to a verification owner is owned by
CS-PR-13 (Stage 4 acceptance closeout).

---

## 8. Stage 4 non-goals

This PR (Stage 4 PR #1, integration spec) does **not**:

- Rewrite the existing Cable Sizing engine.
- Implement new Cable Sizing engineering formulas.
- Import or move existing Cable Sizing engine code.
- Change calculation behavior of any existing module (Load Flow,
  Voltage Drop, Short Circuit, Equipment Duty, project validation).
- Change UI behavior beyond what the existing
  `CalculationStatusPanel.tsx` `not_implemented` Stage 4 placeholder
  already shows.
- Change the Stage 1 canonical project file schema.
- Modify `apps/web/src/state/calculationStore.ts` or any
  React-component file.
- Modify `services/solver-sidecar/` (Python sidecar).
- Modify `packages/calculation-store/` runtime / store architecture.
- Add fake calculation results.
- Add or modify Golden Case numeric expected values (no `GC-LV-*`
  artifact is created or edited in this PR).
- Modify Stage 1, Stage 2, or Stage 3 behavior.
- Modify `scripts/check-acceptance.ts` or
  `scripts/acceptance-coverage.json`.
- Modify any test or fixture file.
- Move or import existing Cable Sizing code.

External-repository non-goals (specific to the
`Karma720809/cable-sizing` baseline named in §2.2 / CS-OQ-1):

- **Clone, import, copy, vendor, or modify `Karma720809/cable-sizing`**
  in this PR. The repository is named only as the CS-PR-02 inspection
  target.
- **Validate the external repo's engineering formulas, ampacity tables,
  derating curves, voltage-drop derivations, or short-circuit
  withstand basis.** Verification basis classification is owned by
  CS-PR-12 / Golden Case policy §6 — not this PR.
- **Migrate `Karma720809/cable-sizing` tests or fixtures into `etap`**
  (including any GC-LV cases). GC-LV migration is CS-PR-12.
- **Create, fabricate, or restate GC-LV expected values.** All GC-LV
  expected numeric values must trace to the external repository's
  authoritative source (with verification-basis classification per
  §6); none are introduced in this PR.
- **Decide the integration method** (git subtree vs manual migration
  vs package extraction vs npm/workspace vs other). The choice is a
  CS-PR-02 deliverable per CS-OQ-1.
- **Make any license / ownership / authorship claim about
  `Karma720809/cable-sizing`** beyond naming it as the known external
  source. License / ownership confirmation is a CS-PR-02 deliverable.

The broader Stage 4 charter also has scope-leakage non-goals per the
Stage 3 overall review §10.6 carryover:

- Cable short-circuit **withstand** (Equipment Duty surface, not
  Cable Sizing — see §3.4 above).
- Excel / PDF / certified report output (Stage 5).
- Arc flash, breaker arc-impedance, full protection coordination
  (Post-MVP per PRD §15 OQ-07 / OQ-08).
- Per-zone protection clearing time (Equipment Duty ED-FU-04).

---

## 9. Reading-order summary for downstream Stage 4 PRs

Subsequent Stage 4 PRs should treat this spec as the **single source
of truth** for:

- The OQ decisions (CS-OQ-1 .. CS-OQ-14).
- The result-model shape (§5).
- The Golden Case policy (§6).
- The acceptance-criteria template (§7).
- The non-goals (§8).

The companion Stage 4 implementation plan
(`stage_4_cable_sizing_implementation_plan.md`) translates this spec
into a PR-by-PR sequencing with merge criteria, risk controls, and
the closeout / overall-review policy.

If a downstream Stage 4 PR diverges from any decision recorded here,
this spec **must be updated first** — the spec PR change comes before
the implementation PR change. The Stage 3 plan-vs-spec reconciliation
discipline (Stage 3 plan §3.4) applies to Stage 4 verbatim.

---

## 10. Document control

- **Spec status.** Stage 4 PR #1 — Rev A.1. Spec only.
- **Authors.** Stage 4 working set.
- **Related documents.** See §0 reading order.
- **Change log.**
  - **Rev A** — created at HEAD `2cc5890`.
  - **Rev A.1** — recorded `Karma720809/cable-sizing`
    (https://github.com/Karma720809/cable-sizing) as the **known
    external existing Cable Sizing source repository**. Inventory
    restructured into three categories (§2.1 in-`etap`; §2.2 known
    external; §2.3 unresolved integration facts). CS-OQ-1 revised to
    name `Karma720809/cable-sizing` as the baseline source and to
    enumerate the integration-method options that CS-PR-02 must
    decide. §8 non-goals extended with explicit "do not clone /
    import / copy / modify `Karma720809/cable-sizing`" rules. Reading
    order (§0) extended with the external-baseline reference. **No
    code, test, schema, fixture, or import / migration was performed
    in this revision.**
  - Future revisions update this section in lockstep with any OQ
    reopen or CS-PR-02 finding that diverges from current
    assumptions.
