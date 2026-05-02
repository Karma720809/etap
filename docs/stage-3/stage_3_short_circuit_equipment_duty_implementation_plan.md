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

The Stage 3 spec has been merged as:

```text
docs/stage-3/stage_3_short_circuit_mvp_spec.md

The spec defines the initial Short Circuit MVP scope as:

IEC 60909 basis.
Maximum short-circuit case first.
Three-phase bolted bus faults.
Fault targets by bus internalId.
Runtime-only result handling.
Sidecar command contract to be implemented later.
Equipment Duty Check deferred to a later Stage 3 PR.
4. Stage 3 Scope
4.1 In Scope

Stage 3 includes:

Short Circuit input model and sidecar contract.
run_short_circuit sidecar command.
Short Circuit result normalization.
Runtime snapshot/result retention for Short Circuit.
Short Circuit UI result table.
Equipment Duty Check after normalized Short Circuit results exist.
Golden Case / verified reference case for Short Circuit.
Stage 3 acceptance closeout.
4.2 Out of Scope

Stage 3 does not include:

Cable Sizing integration.
Report export.
PDF generation.
Full protection coordination.
Arc flash calculation.
Persistent result database.
Disk persistence of calculation snapshots/results.
Certified calculation report output.

Cable Sizing remains Stage 4. Report Workflow remains Stage 5.

5. Stage 3 OQ Status Table

The following OQs must be treated as Stage 3 implementation controls. Reopening any of them requires explicit review before coding.

OQ	Topic	Decision	Status	First PR Affected	Risk if Reopened
SC-OQ-01	IEC 60909 option set	Use IEC 60909 as the Stage 3 basis. pandapower IEC 60909 behavior is the solver basis for MVP.	Closed	PR #2 / PR #3	Solver result drift, Golden Case mismatch
SC-OQ-02	Voltage factor cmax/cmin policy	MVP implements maximum short-circuit first. Minimum case is deferred unless explicitly scoped later.	Closed for MVP	PR #2 / PR #3	max/min ambiguity, inconsistent result labeling
SC-OQ-03	Transformer correction factor Kt	Do not expose a public project-schema Kt setting in the first MVP. Solver-side behavior follows pandapower/IEC configuration and is documented.	Implementation-dependent	PR #3 / PR #6	5–10% mismatch versus hand calculation
SC-OQ-04	Motor short-circuit contribution	Excluded from first MVP unless a simplified, explicitly flagged model is added later.	Deferred	PR #3 / PR #5	Overstated/understated fault current
SC-OQ-05	Generator short-circuit contribution	Generator contribution is deferred unless existing generator data is sufficient and explicitly mapped.	Deferred	PR #3 / PR #6	Incorrect source contribution
SC-OQ-06	Breaker duty basis	Equipment Duty Check is Stage 3 PR #5. It must define the basis before implementation, including Ik'' vs breaking-current fallback.	Deferred to PR #5	PR #5	Unsafe duty assessment or misleading pass/fail
SC-OQ-07	max/min scenario expression	First MVP is maximum case only. Result model must still leave room for maximum / minimum case labeling.	Closed for MVP	PR #2 / PR #4	API churn if min case added later
SC-OQ-08	GC-SC-01 hand calc vs strict IEC	Separate simplified hand-calculation checks from strict IEC/pandapower reference expectations. Do not call provisional smoke tests “verified Golden Cases.”	Closed	PR #6	Cannot distinguish bug from solver-option mismatch
SC-OQ-09	Fault target identity	Fault target is bus internalId, never display tag.	Closed	PR #2	Broken references after tag edits
SC-OQ-10	Runtime retention module	Short Circuit retention requires widening calculation-store bundle support when ShortCircuitRunBundle lands.	Deferred to PR #4	PR #4	Runtime retention type mismatch
6. Stage 3 PR Breakdown
PR #1 — Short Circuit / Equipment Duty Spec / OQ Decision

Status: merged as PR #11.

Current file:

docs/stage-3/stage_3_short_circuit_mvp_spec.md

Purpose:

Define Short Circuit MVP.
Establish IEC 60909 basis.
Define result model.
Define sidecar command shape.
Preserve runtime-only guardrails.
State that Equipment Duty Check is Stage 3 follow-up after Short Circuit normalization.

No implementation was included.

PR #2 — SC Input Model + Sidecar Contract

Purpose:

Define TypeScript-side and Python-side contract surfaces for Short Circuit without running pandapower yet.

In scope:

Add Short Circuit request/option/fault-target types.
Add Short Circuit wire response types.
Add app-normalized result type stubs if required by contract tests.
Define run_short_circuit command contract shape.
Add contract tests for serialization, validation, and internalId mapping.
Keep AppNetwork solver-agnostic.

Out of scope:

No actual sidecar command execution.
No pandapower short-circuit invocation.
No UI.
No Equipment Duty Check.
No project schema changes.
No disk persistence.

Likely files:

packages/solver-adapter/src/types.ts
packages/solver-adapter/src/index.ts
packages/solver-adapter/tests/contract.test.ts
services/solver-sidecar/src/types.py or equivalent TypedDict file
docs/stage-3/stage_3_short_circuit_mvp_spec.md only if clarification needed

Required tests:

TypeScript contract tests.
Python contract-shape smoke if existing sidecar test pattern supports it.
No integration solver test yet.

Merge criteria:

pnpm typecheck
pnpm test
pnpm check:acceptance
No schema drift.
No sidecar solver behavior change.
PR #3 — pandapower Short-Circuit Invocation

Purpose:

Implement the actual Python sidecar run_short_circuit command.

In scope:

Add run_short_circuit command to sidecar.
Convert existing solver input into pandapower network for short-circuit study.
Execute pandapower short-circuit function for maximum 3-phase bus faults.
Return wire response with metadata and row-level results.
Add opt-in integration test.

Out of scope:

No UI.
No Equipment Duty Check.
No project schema changes.
No disk persistence.
No Golden Case claim unless verified reference is included separately.

Likely files:

services/solver-sidecar/src/main.py
services/solver-sidecar/src/short_circuit.py
services/solver-sidecar/tests if present
packages/solver-adapter/src/sidecarClient.ts
packages/solver-adapter/tests/sidecarClient.test.ts
packages/solver-adapter/tests/shortCircuit.integration.test.ts

Required tests:

Sidecar command parse/dispatch test.
Transport-level error handling.
Opt-in real pandapower integration test.
No fake fallback values.

Merge criteria:

Sidecar health still passes.
Load Flow integration remains unchanged.
Short Circuit integration is opt-in.
Failed sidecar response surfaces structured error, not zeros.
PR #4 — Short Circuit Result Normalization + Runtime Retention Widening

Purpose:

Normalize sidecar wire response into app-level ShortCircuitResult and retain runtime bundle in calculation-store.

In scope:

Add ShortCircuitResult.
Add ShortCircuitBusResult.
Add ShortCircuitRunBundle.
Add Short Circuit orchestrator.
Create runtime snapshot for Short Circuit run.
Normalize wire fields to app fields:
internalId → busInternalId
wire valid → app row ok
wire warning → app row warning
wire failed → app row failed
orchestrator-created unavailable rows → app row unavailable
Ensure numeric fields are nullable where unavailable/failed.
Widen RuntimeCalculationRecord.bundle from LoadFlow-only to a discriminated union:
LoadFlowRunBundle
ShortCircuitRunBundle
Add calculation-store retention key for Short Circuit bundle.

Out of scope:

No UI.
No Equipment Duty Check.
No Golden Case fixture claim.
No disk persistence.

Likely files:

packages/solver-adapter/src/shortCircuit.ts
packages/solver-adapter/src/results.ts or new result module
packages/solver-adapter/src/index.ts
packages/calculation-store/src/types.ts
packages/calculation-store/src/retention.ts
packages/calculation-store/src/reducer.ts
packages/solver-adapter/tests/shortCircuit.test.ts
packages/calculation-store/tests/reducer.test.ts

Required tests:

Normalization mapping.
Failed/unavailable row nullability.
Top-level status mapping.
Runtime snapshot is referenced.
Retention does not serialize to project file.
Existing Load Flow / Voltage Drop tests still pass.

Merge criteria:

Existing Stage 2 runtime behavior preserved.
Short Circuit retention does not pollute project JSON.
No fake numeric output on failure.
PR #5 — Breaker / Equipment Duty Check

Purpose:

Introduce Equipment Duty Check based on normalized Short Circuit results.

In scope:

Define breaker/equipment duty check input assumptions.
Use normalized Short Circuit result as source.
Define duty basis:
Ik'' basis
breaking-current fallback if applicable
future duty rating fields if not currently present
Produce Equipment Duty Check result with status:
ok
warning
violation
unavailable
Keep Equipment Duty runtime-only.

Out of scope:

No Cable Sizing.
No report export.
No persistent result database.
No schema changes unless explicitly approved and reviewed.

Likely files:

packages/solver-adapter or new package if pure post-processing
packages/calculation-store if retention is needed
apps/web only if status surface is included
docs/stage-3/stage_3_short_circuit_mvp_spec.md if duty assumptions require clarification

Required tests:

Duty pass/fail mapping.
Missing rating → unavailable/warning policy.
Runtime-only serialization guardrail.
No fake pass/fail when required data is absent.

Merge criteria:

Equipment Duty does not alter Short Circuit solver results.
Missing data fails safely.
Cable Sizing remains out of scope.
PR #6 — GC-SC-01 Integration / Verified Reference Case

Purpose:

Add verified Short Circuit Golden Case coverage.

In scope:

Add GC-SC-01 verified reference.
Separate simplified hand calculation from strict IEC/pandapower reference.
Define tolerance policy.
Mark case status:
verified
provisional
regression_only
Add integration or fixture runner as appropriate.

Out of scope:

No broad cable sizing.
No report export.
No unsupported min/branch-end fault expansion.

Likely files:

packages/solver-adapter/tests/shortCircuit.integration.test.ts
packages/fixtures or dedicated golden-case directory
docs/stage-3/stage_3_short_circuit_mvp_spec.md
scripts/check-acceptance.ts only if Stage 3 acceptance mapping is wired here
scripts/acceptance-coverage.json if Stage 3 manifest is introduced

Required tests:

GC-SC-01 calculation within documented tolerance.
Explicit solver option record.
Failure case if solver option changes unexpectedly.

Merge criteria:

Golden Case status is not overstated.
Provisional smoke tests are not called verified Golden Cases.
Differences between hand calc and pandapower are explained.
PR #7 — UI Result Table / Overlay

Purpose:

Expose Short Circuit results in the app UI.

In scope:

Add Short Circuit status row.
Add Short Circuit run button only when transport and readiness permit.
Add Short Circuit result table.
Add optional diagram overlay only if clearly scoped.
Preserve no-fake-output behavior.

Out of scope:

No Equipment Duty report export.
No Cable Sizing.
No disk persistence.
No browser-side fake solver.

Likely files:

apps/web/src/components/CalculationStatusPanel.tsx
apps/web/src/components/ResultTables.tsx or new ShortCircuitResultTable.tsx
apps/web/src/state/calculationStore.ts
apps/web/tests/CalculationStatusPanel.test.tsx
apps/web/tests/... UI tests

Required tests:

No results before real run.
Run disabled without transport.
Validation errors block run.
Failed run surfaces issues.
Result table renders nullable fields correctly.
Stale behavior preserved.

Merge criteria:

Browser build does not import Node-only sidecar code.
Existing Load Flow / Voltage Drop UI unaffected.
Stage 3 runtime output is real or absent, never fake.
PR #8 — Stage 3 Acceptance Closeout

Purpose:

Close Stage 3 after implementation PRs.

In scope:

Add Stage 3 acceptance manifest.
Confirm AC-S3 mappings.
Confirm GC-SC-01 status.
Confirm runtime-only guardrails.
Document carryovers.

Out of scope:

No new feature implementation.
No scope expansion.

Likely files:

scripts/acceptance-coverage.json
scripts/check-acceptance.ts if needed
docs/stage-3/stage_3_short_circuit_mvp_spec.md
docs/stage-3/stage_3_short_circuit_equipment_duty_implementation_plan.md

Required checks:

pnpm check:acceptance
pnpm typecheck
pnpm test
pnpm check:fixtures
web build if UI changed in previous PRs.

Merge criteria:

Every Stage 3 AC is mapped or explicitly deferred.
No hidden Golden Case gap.
No project-file contamination.
7. PR #2 Detailed Implementation Plan

PR #2 is the next implementation PR after this plan.

7.1 Goal

Define Short Circuit input model and sidecar contract without executing the solver.

7.2 In Scope

PR #2 should add or prepare:

ShortCircuitRequest
ShortCircuitOptions
ShortCircuitFaultTarget
ShortCircuitSidecarResponse
ShortCircuitSidecarBusRow

The request should identify fault targets by internalId:

interface ShortCircuitFaultTarget {
  kind: "bus";
  busInternalId: string;
}

Options should be explicit and limited:

interface ShortCircuitOptions {
  standard: "IEC_60909";
  calculationCase: "maximum";
  faultType: "threePhase";
  voltageFactor: "cmax";
  computePeak: boolean;
  computeThermal: boolean;
}

The sidecar command shape should be defined but not executed:

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
7.3 Out of Scope

PR #2 must not:

Invoke pandapower short-circuit calculation.
Add UI.
Add Equipment Duty Check.
Add persistence.
Add project schema fields.
Add fake results.
7.4 Tests

PR #2 should include:

TypeScript contract tests.
InternalId preservation tests.
Options defaulting tests.
Unsupported option rejection tests if validation is introduced.
Sidecar request shape tests if Python TypedDict mirror is added.
8. Equipment Duty Placement

Equipment Duty Check is part of Stage 3, not Stage 4 and not Stage 5.

However, it depends on normalized Short Circuit results. Therefore it must not be implemented before:

run_short_circuit command exists.
ShortCircuitResult exists.
Runtime snapshot/retention path is stable.
Short Circuit result rows have well-defined nullable numeric fields.
Breaker duty basis is explicitly decided.

Equipment Duty Check should be implemented in Stage 3 PR #5.

It must not be mixed into:

PR #2 contract type work.
PR #3 sidecar solver invocation.
PR #4 result normalization.

This separation prevents incorrect pass/fail duty status from being built on unstable solver output.

9. Golden Case Policy

Stage 3 must not repeat the Stage 2 Golden Case ambiguity.

GC-SC-01 is required before Stage 3 closeout.

Golden Case statuses must be explicit:

Status	Meaning
verified	Compared against a trusted reference with documented assumptions and tolerance
provisional	Useful smoke test, but not trusted enough for acceptance
regression_only	Captures current behavior only; not a correctness reference

Rules:

Do not call pandapower smoke tests verified Golden Cases.
Do not call simplified hand calculations strict IEC references.
Keep simplified hand calculation and strict IEC/pandapower reference expectations separate.
Document voltage factor, transformer correction, X/R, source strength, and tolerance.
Explain any 5–10% mismatch before treating it as a bug.
10. Runtime / Project File Guardrails

The following guardrails apply to every Stage 3 PR:

No calculationResults field in the project file.
calculationSnapshots remains reserved and empty.
Runtime snapshots remain in memory.
Runtime results remain in memory.
Disk persistence remains deferred.
No localStorage/sessionStorage persistence.
Project schema changes require explicit review.
AppNetwork remains solver-agnostic.
pandapower naming and exception vocabulary must not leak into public project schema.
Failed calculations return structured issues, not fabricated numbers.
UI must not show fake placeholder numeric values.
11. Acceptance / Review Gates
11.1 When to Update Acceptance Manifest

Stage 3 acceptance should not be added to scripts/acceptance-coverage.json until implementation has enough test owners to map criteria honestly.

Recommended:

Do not update acceptance manifest in PR #2 unless the team decides to track Stage 3 from the beginning.
Update acceptance manifest no later than PR #8 closeout.
If Stage 3 ACs are added early, incomplete ACs must be explicitly marked deferred and not silently treated as satisfied.
11.2 Mandatory Checks Before Merge

For each implementation PR:

pnpm typecheck
pnpm test
pnpm check:fixtures
pnpm check:acceptance
pnpm --filter web build

For docs-only PRs:

pnpm check:acceptance
pnpm typecheck

Additional checks for sidecar PRs:

python3 services/solver-sidecar/src/main.py health
SOLVER_PYTHON=... pnpm --filter @power-system-study/solver-adapter test:integration
11.3 Codex Review Focus

Every Stage 3 PR review should check:

No Stage 1 schema drift.
No result persistence.
No fake numbers.
No unscoped Equipment Duty / Cable Sizing / Report implementation.
Runtime-only policy preserved.
Short Circuit outputs are nullable where appropriate.
Sidecar wire model and app-normalized model are clearly separated.
Golden Case claims are not overstated.
12. Risks and Deferrals
Risk	Impact	Control
IEC 60909 option mismatch	5–10% result difference	Lock OQ decisions and document solver options
cmax/cmin ambiguity	max/min result confusion	MVP max-only
transformer correction factor	mismatch vs hand calc	Document and test in GC-SC-01
source data precedence	different fault levels	Decide scLevelMva vs faultCurrentKa policy before implementation
motor contribution	fault current underestimation	Defer or explicitly flag simplified model
generator contribution	wrong source contribution	Defer unless data model supports it
branch-end faults	topology complexity	Defer; bus faults only
Equipment Duty Check premature implementation	unsafe pass/fail	Wait until normalized SC result exists
Golden Case overclaim	false acceptance confidence	verified/provisional/regression_only status policy
UI fake values	user trust issue	render only real result or clear unavailable/null state
13. Stage 3 Completion Criteria

Stage 3 can be considered complete only when:

Short Circuit MVP runs through sidecar.
Short Circuit results are normalized into app vocabulary.
Runtime snapshot/result retention is implemented without project-file persistence.
Equipment Duty Check is implemented or explicitly deferred with documented reason.
GC-SC-01 verified reference status is resolved.
UI displays real results only.
Stage 3 acceptance mapping is complete.
Stage 1 and Stage 2 guardrails remain green.
No Cable Sizing or Report Workflow scope leaks into Stage 3.
14. Final Operating Principle

Stage 3 implementation must proceed in small PRs.

Do not combine:

Contract definition,
solver invocation,
result normalization,
Equipment Duty Check,
UI,
Golden Case closeout,

into one PR.

Each PR must have:

clear scope,
explicit non-goals,
test ownership,
guardrail review,
Codex review,
merge only after blockers are resolved.

