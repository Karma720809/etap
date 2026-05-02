이 문서는 첨부 레퍼런스의 운영 원칙을 기준으로 작성했습니다. 즉, 전체 PRD v1.0은 상위 기준, Stage Spec은 Stage 상세 설계/OQ 결정, PR별 Implementation Plan은 실제 구현 단위라는 구조를 따릅니다. 또한 Stage 3는 “Short Circuit / Equipment Duty” 단계이며, OQ를 닫은 뒤 구현 PR로 들어가야 합니다.

# Stage 3 Implementation Plan — Short Circuit / Equipment Duty

Status: Draft  
Branch: `stage-3/implementation-plan`  
Baseline spec: `docs/stage-3/stage_3_short_circuit_mvp_spec.md`  
Previous stage: Stage 2 Load Flow / Voltage Drop — closed  
Current stage: Stage 3 Short Circuit / Equipment Duty  

---

## 1. Purpose

Stage 3 introduces the Short Circuit study capability and prepares the foundation for Equipment Duty Check.

The first deliverable is the Short Circuit MVP. Equipment Duty Check belongs to the broader Stage 3 scope, but it must not be mixed into the first Short Circuit solver implementation. It will be implemented only after Short Circuit results are normalized, retained, and testable.

Stage 3 must preserve the product-level guardrails established in Stage 1 and Stage 2:

- Stage 1 canonical project schema remains stable unless explicitly approved.
- No `calculationResults` field is added to the project file.
- `project.calculationSnapshots` remains reserved and empty.
- Runtime calculation results and snapshots remain runtime-only.
- No fake calculation results are generated.
- No disk persistence is introduced.
- AppNetwork remains solver-agnostic.
- pandapower-specific concepts do not leak into the public project schema.

---

## 2. Document Hierarchy

This implementation plan follows the project document operating model:

| Document Level | Role |
|---|---|
| PRD v1.0 | Product-level baseline and high-level MVP direction |
| Stage 3 Spec | Stage-level design, OQ decisions, result model, adapter boundary, validation policy, acceptance criteria |
| Stage 3 Implementation Plan | PR sequencing, implementation boundaries, merge criteria, and risk control |
| PR-level task plan | Concrete coding instructions for each PR |

This document does not replace the Stage 3 spec. It translates the merged Stage 3 spec into an implementation sequence.

---

## 3. Current Baseline

### 3.1 Completed Before Stage 3

Stage 2 delivered:

- AppNetwork topology extraction.
- Solver adapter contract.
- Python sidecar hosting model.
- Real Load Flow via pandapower sidecar.
- Voltage Drop derived from normalized Load Flow result.
- Runtime-only calculation-store retention.
- Stage 2 acceptance closeout.

### 3.2 Current Repository State

At the start of Stage 3 implementation:

- No Short Circuit calculation code exists.
- No `run_short_circuit` sidecar command exists.
- Solver sidecar currently supports Load Flow only.
- `packages/solver-adapter` currently contains Load Flow and Voltage Drop runtime paths.
- `packages/calculation-store` currently retains `LoadFlowRunBundle`-based runtime records.
- Project file schema is unchanged from Stage 1.
- `calculationSnapshots` remains reserved and empty.
- `calculationResults` does not exist.

### 3.3 Merged Stage 3 Spec

The Stage 3 spec has been merged at:

`docs/stage-3/stage_3_short_circuit_mvp_spec.md`

The merged spec defines the Stage 3 Short Circuit MVP as:

- IEC 60909 basis (S3-OQ-01).
- Maximum short-circuit case only; minimum case deferred (S3-OQ-02 / S3-FU-01).
- Three-phase bolted bus faults only (S3-OQ-03).
- Fault targets identified by `busInternalId`, never display tag (S3-OQ-04).
- Runtime-only result handling; no project-file persistence (S3-OQ-09).
- `run_short_circuit` sidecar command contract defined; sidecar implementation lands in PR #3 (§6).
- **Equipment Duty Check is explicitly out of MVP scope** and is tracked as **S3-FU-12** (post-MVP, separate module — likely `packages/duty-check` and a new `"duty_check_bundle"` module literal).
- **Golden Case fixtures (GC-SC-01) and the schema extension equivalent to Stage 2 §12.7 are deferred** to a post-Stage-3 Golden Case PR per **S3-FU-09**.

### 3.4 Plan-vs-Spec Reconciliation (Operating Model)

The project operating model assigns ownership as:

- **PRD v1.0** — product baseline.
- **Stage Spec** — stage-level design, OQ decisions, result model, adapter boundary, validation policy, acceptance criteria, **and the canonical PR breakdown for the stage**.
- **Stage Implementation Plan** (this document) — sequencing, merge criteria, and risk control **derived from** the merged Stage Spec.
- **PR-level task plans** — concrete coding instructions per PR.

Because the Stage Spec owns stage-level design and the canonical PR breakdown, **this implementation plan must not silently supersede the merged Stage 3 spec**. Concretely:

- Stage 3 is broadly "Short Circuit / Equipment Duty" per the product roadmap, but the **currently merged Stage 3 MVP spec governs implementation until revised**.
- The merged spec's PR breakdown (§13 of the spec) is six PRs: PR #1 spec, PR #2 contract/result types, PR #3 sidecar `run_short_circuit`, PR #4 orchestrator + runtime snapshot/result normalization, PR #5 UI result table + Calculation Status Panel wiring, PR #6 acceptance closeout.
- **Equipment Duty Check is NOT part of the currently approved Short Circuit MVP implementation sequence.** It is **S3-FU-12** in the merged spec — out of MVP scope.
- **Equipment Duty may enter Stage 3 only after a dedicated Stage 3 spec revision / OQ update PR** that closes the duty-side OQs (see §8).
- This implementation plan does **not** list Equipment Duty as an unconditional PR #5. It is instead listed as a **gated follow-up** (PR #5A or later — see §6.6) that requires the spec revision above before any code lands.

If a future Stage 3 spec revision changes the PR breakdown, this plan must be updated in lockstep with that revision; the spec change comes first.

---

## 4. Stage 3 Scope (Aligned with Merged Spec)

### 4.1 In Scope (Stage 3 MVP)

Mirrors `stage_3_short_circuit_mvp_spec.md` §2.2:

- Short Circuit MVP per S3-OQ-03 / S3-OQ-04 (3-phase bolted bus faults, maximum case, IEC 60909).
- New sidecar command `run_short_circuit` over the existing stdio JSON-Lines transport.
- New `ShortCircuitResult` runtime type with per-bus rows.
- New `ShortCircuitRunBundle` returned by `runShortCircuitForAppNetwork()`.
- `calculation-store` retention extension: a second module slot `"short_circuit_bundle"` keyed by `(scenarioId, module, subCase)`.
- UI surfaces: `CalculationStatusPanel` extension and a Short Circuit result table.
- Stage 3 acceptance closeout (`AC-S3-01..07`) wiring `scripts/acceptance-coverage.json` and `scripts/check-acceptance.ts`.

### 4.2 Out of Scope (Stage 3 MVP)

Mirrors `stage_3_short_circuit_mvp_spec.md` §2.3 — these are **not** delivered in the current Stage 3 MVP and must not be implemented as part of PRs #2–#6:

- **Equipment Duty Check** (S3-FU-12). Short Circuit feeds duty-check inputs but Stage 3 MVP does not compare per-equipment ratings against fault currents and does not emit duty pass / fail rows.
- **Cable short-circuit withstand check.** Out of Stage 3 MVP. It is a duty-style check and is part of the Equipment Duty / cable-rating follow-up family — not the Stage 4 Cable **Sizing** engine. It enters scope only after the Equipment Duty spec revision in §8 is merged (or as part of a separate cable-withstand spec). It is not silently included in Cable Sizing.
- **Golden Case fixtures and the GC-SC-01 verified reference** (S3-FU-09). Deferred to a post-Stage-3 Golden Case PR.
- **Cable Sizing engine** (Stage 4).
- **Report export / PDF / certified report output** (Stage 5).
- **Full protection coordination, TCC viewer, arc flash** — post-MVP.
- **Persistent result database / disk persistence** — Stage 2 §S2-FU-07 deferral preserved.
- **Detailed equipment duty / rating database fields** on the Stage 1 schema — out of Stage 3.
- **Single-phase / line-to-line / DLG / mixed-phase / DC analysis** — out of MVP per S3-OQ-03 (`E-SC-004` if requested).
- **Mid-line / branch-end / transformer-terminal faults** — out of MVP per S3-OQ-04.
- **Generator subtransient contribution** — deferred per S3-OQ-05.
- **Motor short-circuit contribution** — deferred per S3-OQ-05.
- **Multi-utility / multi-slack networks** — fail-closed with `E-SC-006` (Stage 2 S2-FU-03 inheritance).
- **Any fake calculation output** — Stage 2 §14.5 rule preserved.

---

## 5. Stage 3 OQ Status Table

The following OQs are Stage 3 implementation controls. Reopening any of them requires explicit spec-level review before coding. Status values track the merged spec.

| OQ | Topic | Decision | Status | First PR Affected | Risk if Reopened |
|---|---|---|---|---|---|
| SC-OQ-01 | IEC 60909 option set | Use IEC 60909 as Stage 3 basis; pandapower IEC 60909 behavior is the solver basis for MVP. | Closed | PR #2 / PR #3 | Solver result drift, Golden Case mismatch |
| SC-OQ-02 | Voltage factor cmax/cmin policy | Maximum short-circuit case first. Minimum case deferred. | Closed for MVP | PR #2 / PR #3 | max/min ambiguity, inconsistent labeling |
| SC-OQ-03 | Transformer correction factor Kt | No public project-schema Kt setting in MVP. Solver-side behavior follows pandapower/IEC defaults and is documented. | Implementation-dependent | PR #3 / Golden Case follow-up | 5–10% mismatch versus hand calculation |
| SC-OQ-04 | Motor short-circuit contribution | Excluded from MVP. | Deferred | PR #3 / Equipment Duty follow-up | Overstated/understated fault current |
| SC-OQ-05 | Generator short-circuit contribution | Deferred unless existing generator data is sufficient and explicitly mapped. | Deferred | PR #3 / Golden Case follow-up | Incorrect source contribution |
| SC-OQ-06 | Breaker duty basis | Not part of Stage 3 MVP. Required as a prerequisite for the Equipment Duty follow-up (see §8). | Deferred (S3-FU-12 prerequisite) | PR #5A or later | Unsafe duty assessment, misleading pass/fail |
| SC-OQ-07 | max/min scenario expression | MVP is maximum case only. Result model leaves room for max/min labeling. | Closed for MVP | PR #2 / PR #4 | API churn if min case added later |
| SC-OQ-08 | GC-SC-01 hand calc vs strict IEC | Simplified hand calculation must remain separate from strict IEC/pandapower reference. Provisional smoke tests must not be called "verified Golden Cases." | Closed (policy) | Golden Case follow-up | Cannot distinguish bug from solver-option mismatch |
| SC-OQ-09 | Fault target identity | `busInternalId`, never display tag. | Closed | PR #2 | Broken references after tag edits |
| SC-OQ-10 | Runtime retention module | Short Circuit retention requires widening `RuntimeCalculationRecord.bundle` to a discriminated union when `ShortCircuitRunBundle` lands. | Closed (decision) / lands in PR #4 | PR #4 | Runtime retention type mismatch |

---

## 6. Stage 3 PR Breakdown

This sequence mirrors the merged Stage 3 spec §13. Per §3.4, the spec owns the canonical PR breakdown — any deviation here must be reflected in a spec revision first.

### 6.1 PR #1 — Stage 3 Spec / OQ Decision

- Status: **merged** as PR #11.
- File: `docs/stage-3/stage_3_short_circuit_mvp_spec.md`.
- Purpose: define MVP scope, IEC 60909 basis, result model, sidecar command shape, runtime-only guardrails, and explicitly state Equipment Duty Check and Golden Case fixtures are out of MVP scope.
- No implementation.

### 6.2 PR #2 — Short Circuit Contract / Input Model + Sidecar Wire Contract

**Purpose:** define the TypeScript-side and Python-side contract surfaces for Short Circuit without running pandapower.

**In scope (tightened):**

- `packages/solver-adapter/src/shortCircuit.ts` carrying contract types: `ShortCircuitFaultType`, `ShortCircuitCase`, `ShortCircuitFaultTarget`, `ShortCircuitOptions`, `DEFAULT_SHORT_CIRCUIT_OPTIONS`, `ShortCircuitRequest`, `ShortCircuitIssueCode`, `ShortCircuitIssue`.
- `run_short_circuit` sidecar wire request / response shape.
- `validateForShortCircuit()` wrapper in `packages/validation/src/calcReadiness.ts` (or sibling), reusing the Stage 2 readiness output shape.
- Re-exports from `packages/solver-adapter/src/index.ts` for the contract types.
- Contract tests in `packages/solver-adapter/tests/shortCircuit.contract.test.ts` covering serialization, `internalId` mapping, and negative cases for `E-SC-005` / `E-SC-006`.

**Out of scope:**

- `ShortCircuitBusResult`, `ShortCircuitResult`, `ShortCircuitRunBundle` — these are app-normalized result types and land with the orchestrator in PR #4. Do **not** add app-normalized result type stubs in PR #2 unless a contract test strictly requires the type's existence; the spec test pattern does not require it.
- No sidecar command execution.
- No pandapower invocation.
- No UI.
- No Equipment Duty Check.
- No project schema changes.
- No disk persistence.
- No `calculation-store` changes.

**Likely files:**

- `packages/solver-adapter/src/shortCircuit.ts`
- `packages/solver-adapter/src/index.ts` (re-export)
- `packages/solver-adapter/tests/shortCircuit.contract.test.ts`
- `packages/validation/src/calcReadiness.ts` (or sibling)
- `services/solver-sidecar/src/contracts.py` only if a Python TypedDict mirror is added in this PR

**Required tests:**

- TypeScript contract tests (structural guards, mirroring Stage 2 PR #3 pattern).
- `internalId` preservation tests.
- Options defaulting tests against `DEFAULT_SHORT_CIRCUIT_OPTIONS`.
- Negative cases for `E-SC-005` / `E-SC-006`.
- No integration solver test.

**Merge criteria (mandatory, regardless of code surface touched):**

- `pnpm typecheck` green.
- `pnpm test` green.
- `pnpm check:fixtures` green.
- `pnpm check:acceptance` green.
- No Stage 1 schema drift.
- No sidecar solver behavior change.
- No pandapower import in any newly touched file outside `services/solver-sidecar/`.

### 6.3 PR #3 — pandapower `run_short_circuit` Sidecar + Adapter Transport

**Purpose:** implement the actual Python sidecar `run_short_circuit` command and the adapter transport call.

**In scope:**

- `services/solver-sidecar/src/short_circuit.py` carrying the pandapower invocation (mirrors `load_flow.py`).
- `services/solver-sidecar/src/main.py` adds the `run_short_circuit` dispatcher.
- `services/solver-sidecar/src/contracts.py` mirrors the Stage 3 contract types.
- `services/solver-sidecar/requirements.txt` only if `pandapower==2.14.10` requires a documented adjustment.
- `packages/solver-adapter/src/shortCircuitClient.ts` carrying `runShortCircuit` (mirrors `runLoadFlow`).
- `packages/solver-adapter/tests/shortCircuitClient.test.ts` plus opt-in `packages/solver-adapter/tests/shortCircuit.integration.test.ts` gated behind `RUN_SIDECAR_INTEGRATION=1`.

**Out of scope:**

- No UI.
- No Equipment Duty Check.
- No project schema changes.
- No disk persistence.
- No verified Golden Case claim.

**Required tests:**

- Sidecar command parse/dispatch test.
- Transport-level error handling.
- Opt-in real pandapower integration test gated by `RUN_SIDECAR_INTEGRATION=1`.
- No fake fallback values on failure — structured error only.

**Merge criteria:**

- `pnpm typecheck`, `pnpm test`, `pnpm check:fixtures`, `pnpm check:acceptance` all green.
- `python3 services/solver-sidecar/src/main.py health` passes.
- Load Flow integration unchanged.
- Failed sidecar response surfaces a structured error, not zeros.

### 6.4 PR #4 — Orchestrator + Runtime Snapshot / Result Normalization + Retention Widening

**Purpose:** normalize the sidecar wire response into an app-level `ShortCircuitResult`, build `ShortCircuitRunBundle`, and retain the runtime bundle in `calculation-store`.

**In scope:**

- `packages/solver-adapter/src/shortCircuitRunner.ts` carrying `runShortCircuitForAppNetwork(appNetwork, options)` and the `ShortCircuitRunBundle` factory.
- `packages/solver-adapter/src/shortCircuitResults.ts` carrying `normalizeShortCircuitResult()`.
- App-normalized result types: `ShortCircuitBusResult`, `ShortCircuitResult`, `ShortCircuitRunBundle`.
- Wire → app field renames (`internalId → busInternalId`); per-row status mapping (`valid → ok`, `warning → warning`, `failed → failed`, orchestrator-synthesized rows → `unavailable`); top-level status mapping; numeric nullability preserved end-to-end.
- `packages/calculation-store/src/types.ts` widens `CalculationModule` to `"load_flow_bundle" | "short_circuit_bundle"` and `RuntimeCalculationRecord.bundle` to a discriminated union (`LoadFlowRunBundle | ShortCircuitRunBundle`).
- `packages/calculation-store/src/reducer.ts` handles the new module's retention slot under the existing `(scenarioId, module, subCase)` key.

**Out of scope:**

- No UI.
- No Equipment Duty Check.
- No Golden Case fixture claim.
- No disk persistence.

**Required tests:**

- Normalization mapping tests (`packages/solver-adapter/tests/shortCircuitResults.test.ts`).
- Runner tests (`packages/solver-adapter/tests/shortCircuitRunner.test.ts`).
- Failed/unavailable row nullability.
- Retention test (`packages/calculation-store/tests/short-circuit-retention.test.ts`) confirming retention does not pollute the project file.
- Existing Load Flow / Voltage Drop tests still pass.

**Merge criteria:**

- `pnpm typecheck`, `pnpm test`, `pnpm check:fixtures`, `pnpm check:acceptance` all green.
- Stage 2 runtime behavior preserved.
- `calculationSnapshots` remains empty after a Short Circuit run.
- No fake numeric output on failure.

### 6.5 PR #5 — UI Result Table + Calculation Status Panel Wiring

**Purpose:** expose Short Circuit results in the app UI per the merged spec §13 PR #5.

**In scope:**

- `apps/web/src/components/ShortCircuitResultTable.tsx` (new).
- `apps/web/src/components/CalculationStatusPanel.tsx` adds the Short Circuit row, Run controls, and the `disabled_by_validation` tooltip path.
- `apps/web/src/state/calculationStore.ts` exposes a `runShortCircuit()` action and a Short Circuit lifecycle slot.
- Tests: `apps/web/tests/ShortCircuitResultTable.test.tsx`, `apps/web/tests/calculationStore.shortCircuit.test.tsx`, extension to `apps/web/tests/CalculationStatusPanel.test.tsx`.
- Diagram overlay for fault current (`Ik''` near each bus) is **deferred** unless the implementation finds the structural change is one touch (S3-FU-11, spec §9.3).

**Out of scope:**

- No Equipment Duty Check (`PR #5A or later` — see §6.6).
- No report export.
- No Cable Sizing.
- No disk persistence.
- No browser-side fake solver.

**Required tests:**

- No results before a real run.
- Run disabled without transport.
- Validation errors block run.
- Failed run surfaces structured issues.
- Result table renders nullable fields correctly.
- Stale-state behavior preserved.

**Merge criteria:**

- `pnpm typecheck`, `pnpm test`, `pnpm check:fixtures`, `pnpm check:acceptance` all green.
- `pnpm --filter web build` green.
- Browser build does not import Node-only sidecar code.
- Existing Load Flow / Voltage Drop UI unaffected.

### 6.6 PR #5A or later — Equipment Duty Check (Gated Follow-Up)

**Status: NOT scheduled in the currently approved Stage 3 MVP.**

This entry exists only to record where Equipment Duty Check would land **if and when** the Stage 3 spec is revised. It is **S3-FU-12** in the merged spec. Implementation work must not begin until:

1. A spec-revision PR amends `docs/stage-3/stage_3_short_circuit_mvp_spec.md` (or supersedes it with a Stage 3 Equipment Duty spec) to **close all duty-side OQs** (see §8).
2. That spec revision is merged.
3. This implementation plan is updated to reflect the new sequencing.

If those gates are met, this PR (or PR #5B / #5C / similar — sequencing decided in the spec revision) will then introduce Equipment Duty Check based on normalized Short Circuit results. Until then, no Equipment Duty code, schema, or UI lands.

### 6.7 PR #6 — Stage 3 Acceptance Closeout

**Purpose:** close Stage 3 per the merged spec §13 PR #6.

**In scope:**

- `scripts/acceptance-coverage.json` adds the `stage3` block per spec §12.1.
- `scripts/check-acceptance.ts` extends to enforce `AC-S3-01..07` (parallel to Stage 1 / Stage 2 blocks).
- Documentation closeout in the spec (`Rev A.1+` revision note).
- Any `deferred-post-stage-3` markers for items legitimately deferred (e.g., Equipment Duty Check S3-FU-12, Golden Case fixtures S3-FU-09, diagram overlay S3-FU-11) with follow-up trackers in spec §15.

**Out of scope:**

- No new feature implementation.
- No scope expansion.

**Likely files:**

- `scripts/acceptance-coverage.json`
- `scripts/check-acceptance.ts`
- `docs/stage-3/stage_3_short_circuit_mvp_spec.md`
- `docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md`

**Required checks (mandatory, unconditional — these are recorded as part of closeout regardless of which packages the closeout PR touched):**

- `pnpm typecheck`
- `pnpm test`
- `pnpm check:fixtures`
- `pnpm check:acceptance`
- `pnpm --filter web build`

**Merge criteria:**

- Every Stage 3 AC is mapped or explicitly deferred with a tracker.
- No hidden Golden Case gap (GC-SC-01 status is explicitly recorded as deferred to S3-FU-09).
- No project-file contamination.

> **Note on Golden Case bundling.** The merged spec keeps GC-SC-01 separate from Stage 3 closeout (S3-FU-09 — post-Stage-3 Golden Case PR). Bundling a verified GC-SC-01 into PR #6 would be a **proposed refinement** to the spec and **requires a Stage 3 spec update PR before it can be implemented**.

---

## 7. PR #2 Detailed Implementation Notes

PR #2 is the first implementation PR after this plan. The detailed shape below is illustrative; the canonical names live in `packages/solver-adapter/src/shortCircuit.ts` once the PR lands and in spec §7.2.

### 7.1 Goal

Define the Short Circuit input model and sidecar wire contract without executing the solver. **Do not introduce app-normalized result types** (`ShortCircuitBusResult`, `ShortCircuitResult`, `ShortCircuitRunBundle`) — those land with the orchestrator in PR #4.

### 7.2 Contract Types (PR #2 In-Scope Surface)

- `ShortCircuitRequest`
- `ShortCircuitOptions` (with `DEFAULT_SHORT_CIRCUIT_OPTIONS`)
- `ShortCircuitFaultTarget`
- `ShortCircuitFaultType`, `ShortCircuitCase`
- `ShortCircuitIssue`, `ShortCircuitIssueCode`
- Sidecar wire request/response shapes for `run_short_circuit`

The request identifies fault targets by `internalId`:

```ts
interface ShortCircuitFaultTarget {
  kind: "bus";
  busInternalId: string;
}
```

Options are explicit and limited:

```ts
interface ShortCircuitOptions {
  standard: "IEC_60909";
  calculationCase: "maximum";
  faultType: "threePhase";
  voltageFactor: "cmax";
  computePeak: boolean;
  computeThermal: boolean;
}
```

The sidecar command shape is defined but not executed in PR #2:

```json
{
  "command": "run_short_circuit",
  "input": {
    "solverInput": "...",
    "shortCircuit": {
      "calculationCase": "maximum",
      "faultType": "threePhase",
      "faultTargets": [
        { "kind": "bus", "busInternalId": "eq_bus_1" }
      ]
    }
  }
}
```

### 7.3 Out of Scope for PR #2

- Invoking pandapower short-circuit calculation.
- Adding UI.
- Adding Equipment Duty Check.
- Adding persistence.
- Adding project schema fields.
- Adding fake results.
- Adding app-normalized result type stubs (`ShortCircuitBusResult`, `ShortCircuitResult`, `ShortCircuitRunBundle`).

### 7.4 Tests for PR #2

- TypeScript contract tests (structural guards).
- `internalId` preservation tests.
- Options defaulting tests against `DEFAULT_SHORT_CIRCUIT_OPTIONS`.
- Unsupported-option rejection tests if validation is introduced.
- Sidecar request shape tests if a Python TypedDict mirror is added.

---

## 8. Equipment Duty Pre-Implementation OQ Gate

Equipment Duty Check (S3-FU-12) must not begin coding until **all** items below are closed in a Stage 3 spec revision PR. Listing them here makes the gate explicit so that future planning does not accidentally schedule duty work before the spec is updated.

**Required spec-level decisions before any Equipment Duty PR:**

1. **Equipment rating fields on the Stage 1 schema.**
   - Which equipment types receive duty rating fields (e.g., breakers, switchgear buses, contactors, fuses, optionally cables for withstand)?
   - Exact field names, units, and Zod / JSON Schema definitions.
   - Schema-rev bump policy: any new equipment-rating field is a Stage 1 schema change and must follow the existing canonical-drift / migration policy. **Schema-change approval is a hard prerequisite.**

2. **Missing-rating policy.**
   - When a piece of equipment has no rating: does the duty row become `unavailable`, `warning`, or block the entire run?
   - Whether the absence raises a warning issue code on the bundle and which code (e.g., `W-DC-MISSING-RATING`).
   - UI behavior for missing-rating rows (explicit empty cell vs. hidden vs. greyed badge).

3. **Duty basis: `Ik''` vs breaking-current.**
   - Whether breaker duty is compared against `Ik''` (initial symmetrical short-circuit current) or against breaking current (`Ib` per IEC 60909-0 §4.5).
   - Whether a fallback path exists when only `Ik''` is available, and how that fallback is labeled (e.g., `provisional` duty status vs. `verified`).
   - Time-to-fault assumption (e.g., `tmin = 0.02 s` vs `tmin = 0.05 s`) when breaking current is computed.
   - Whether peak (`ip`) and/or thermal (`Ith`) duty are also assessed and against which rating fields.

4. **Cable short-circuit withstand** (if scope extends here).
   - Decide whether cable withstand is part of the Equipment Duty follow-up or a separate spec item.
   - If included: cable rating fields, K-factor / cross-section / insulation policy, fault-clearing-time source.

5. **Pass / warning / fail thresholds.**
   - Numerical margins for `ok` / `warning` / `violation` statuses.
   - Whether margins are tunable per-project or fixed in the spec.

6. **Duty-result module retention.**
   - Whether duty results live in a new `"duty_check_bundle"` (per spec §15 S3-FU-12) and how that interacts with existing retention keys.
   - Confirmation that duty results remain runtime-only (no project-file persistence).

7. **Acceptance criteria.**
   - New `AC-S3-Dxx` entries (or a new stage-block) covering duty inputs, missing-rating behavior, basis fallback, and runtime-only guardrails.

Until each of the above is decided in a merged spec revision, the implementation plan must continue to list Equipment Duty as **PR #5A or later (gated follow-up)** per §6.6.

---

## 9. Cable Short-Circuit Withstand Status

Cable short-circuit withstand (i.e., checking that a cable's `I²t` rating is not exceeded by the prospective fault current and clearing time) is treated as follows in the current Stage 3 plan:

- **Out of current Stage 3 MVP.** Not delivered by PRs #2–#6.
- **Not part of Cable Sizing (Stage 4)** in its current scope. Stage 4 covers ampacity / sizing, not duty/withstand.
- **Belongs to the Equipment Duty / withstand follow-up family.** It will be scoped together with breaker duty when the Stage 3 spec revision in §8 lands, or as a separate Stage 3+ withstand spec, whichever the spec revision selects.
- Until then, no cable-withstand contract types, results, UI, or schema fields are added.

---

## 10. Golden Case Policy

Per the merged spec, the verified Short Circuit Golden Case (GC-SC-01) is **S3-FU-09** — deferred to a post-Stage-3 Golden Case PR. The current Stage 3 closeout (PR #6) does **not** require a verified GC-SC-01; it only requires that the deferral is explicitly recorded.

When the Golden Case PR lands, it must follow the spec's status model:

| Status | Meaning |
|---|---|
| `verified` | Compared against a trusted reference with documented assumptions and tolerance |
| `provisional` | Useful smoke test, not trusted enough for acceptance |
| `regression_only` | Captures current behavior only; not a correctness reference |

Rules carried into that future PR:

- pandapower smoke tests must not be called verified Golden Cases.
- Simplified hand calculations must not be called strict IEC references.
- Document voltage factor, transformer correction, X/R, source strength, and tolerance.
- Explain any 5–10% mismatch before treating it as a bug.

If a future revision proposes bundling GC-SC-01 into PR #6 (acceptance closeout), that proposal is a **spec change** and must land via a Stage 3 spec revision PR before this plan is updated.

---

## 11. Runtime / Project File Guardrails

The following guardrails apply to **every** Stage 3 PR:

- No `calculationResults` field in the project file.
- `calculationSnapshots` remains reserved and empty after every Stage 3 run.
- Runtime snapshots remain in memory only.
- Runtime results remain in memory only.
- Disk persistence remains deferred (S2-FU-07 / S3-FU-10).
- No `localStorage` / `sessionStorage` persistence.
- Project schema changes require explicit spec-level review.
- `AppNetwork` remains solver-agnostic.
- pandapower naming and exception vocabulary must not leak into the public project schema or `packages/network-model` / `packages/solver-adapter` public surface.
- Failed calculations return structured issues, not fabricated numbers.
- UI must not show fake placeholder numeric values; render explicit empty / unavailable cells instead.

---

## 12. Acceptance / Review Gates

### 12.1 When to Update the Acceptance Manifest

Stage 3 acceptance entries should not be added to `scripts/acceptance-coverage.json` until implementation has enough test owners to map the criteria honestly. Per the merged spec:

- `scripts/acceptance-coverage.json` and `scripts/check-acceptance.ts` are **not** modified in PRs #2–#5.
- Stage 3 manifest extension lands in **PR #6** (closeout).
- If any AC needs to be marked deferred at closeout, it must be marked explicitly and not silently treated as satisfied.

### 12.2 Mandatory Checks Before Merge

**For every Stage 3 PR (code or docs), regardless of which packages were touched:**

- `pnpm typecheck`
- `pnpm test`
- `pnpm check:fixtures`
- `pnpm check:acceptance`

**Closeout record (PR #6):** the closeout PR must record evidence of the full check matrix as part of its merge artifacts — `pnpm typecheck`, `pnpm test`, `pnpm check:fixtures`, `pnpm check:acceptance`, **and `pnpm --filter web build`** — unconditionally, not only when UI changed in that PR. The Stage 3 web build must remain green at the moment of closeout.

**Per-PR additional gates:**

- Sidecar PRs (PR #3): `python3 services/solver-sidecar/src/main.py health` and `RUN_SIDECAR_INTEGRATION=1 SOLVER_PYTHON=... pnpm --filter @power-system-study/solver-adapter test:integration` recorded in the PR description.
- UI-touching PRs (PR #5): `pnpm --filter web build`.
- Docs-only PRs: at minimum `pnpm check:acceptance` and `pnpm typecheck`.

### 12.3 Codex Review Focus

Every Stage 3 PR review must check:

- No Stage 1 schema drift.
- No result persistence beyond runtime memory.
- No fake numbers.
- No unscoped Equipment Duty / Cable Sizing / Cable Withstand / Report implementation.
- Runtime-only policy preserved.
- Short Circuit numeric outputs are nullable where appropriate.
- Sidecar wire model and app-normalized model are clearly separated.
- Golden Case claims are not overstated.
- Plan-vs-spec alignment: any deviation from the merged spec's PR breakdown must be backed by a merged spec revision.

---

## 13. Risks and Deferrals

| Risk | Impact | Control |
|---|---|---|
| IEC 60909 option mismatch | 5–10% result difference | Lock OQ decisions; document solver options on metadata |
| cmax/cmin ambiguity | max/min result confusion | MVP max-only; result model leaves room for labeling |
| Transformer correction factor | Mismatch vs hand calc | Document; revisit in Golden Case follow-up |
| Source data precedence | Different fault levels | `scLevelMva` preferred, `faultCurrentKa` fallback per S3-OQ-06 |
| Motor contribution | Fault current underestimation | Deferred per S3-OQ-05 |
| Generator contribution | Wrong source contribution | Deferred per S3-OQ-05 |
| Branch-end faults | Topology complexity | Out of MVP per S3-OQ-04; bus faults only |
| Equipment Duty premature implementation | Unsafe pass/fail on unstable inputs | Gated per §6.6 / §8 — requires merged spec revision before any code |
| Cable withstand premature implementation | Unsafe / incorrect withstand verdicts | Out of Stage 3 MVP per §9 — requires spec scoping before any code |
| Golden Case overclaim | False acceptance confidence | `verified` / `provisional` / `regression_only` policy carried into the future Golden Case PR |
| UI fake values | User trust issue | Render only real result or explicit unavailable/null state |
| Plan supersedes spec silently | Operating-model violation | §3.4 reconciliation; spec revision required before plan changes |

---

## 14. Stage 3 Completion Criteria

Stage 3 MVP can be considered complete when:

- Short Circuit MVP runs through the sidecar (`run_short_circuit`).
- Short Circuit results are normalized into app vocabulary (`ShortCircuitResult` / `ShortCircuitRunBundle`).
- Runtime snapshot/result retention is implemented without project-file persistence.
- UI displays real Short Circuit results only — never fabricated numbers.
- Stage 3 acceptance mapping (`AC-S3-01..07`) is complete in `scripts/acceptance-coverage.json` and enforced by `scripts/check-acceptance.ts`, with any deferred items explicitly marked.
- Stage 1 and Stage 2 guardrails remain green.
- Equipment Duty Check is **explicitly deferred** (S3-FU-12) with a documented gate (§8) — completion does **not** require Equipment Duty implementation.
- GC-SC-01 verified reference is **explicitly deferred** (S3-FU-09) — completion does not require GC-SC-01.
- No Cable Sizing, Cable Withstand, or Report Workflow scope leaks into Stage 3.

---

## 15. Final Operating Principle

Stage 3 implementation must proceed in small PRs.

Do not combine in a single PR:

- Contract definition,
- Solver invocation,
- Result normalization,
- UI,
- Acceptance closeout,
- Equipment Duty Check (gated),
- Golden Case fixtures (deferred).

Each PR must have:

- Clear scope aligned with the merged spec §13.
- Explicit non-goals.
- Test ownership.
- Guardrail review.
- Codex review.
- Merge only after blockers are resolved and the mandatory check matrix is green.

If at any point an implementation PR's scope appears to outgrow the merged spec, stop and open a Stage 3 spec revision PR first; do not extend scope by editing this plan alone.

