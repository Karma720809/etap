# Stage 1 Pre-Implementation Support v1.1 Changelog

## Changes

1. Adopted Stage 1 Rev D project-file schema as the canonical implementation schema.
2. Replaced the earlier PRD-example-derived data model schema with a Stage-1-aligned schema.
3. Added `schema/schema_alignment_decision.md`.
4. Updated GC-SC-01 input to include a Stage 1 canonical `projectFile` plus explicit fault and solver options.
5. Updated GC-SC-01 hand calculation notes to state the simplified short-circuit assumptions: `voltageFactorC = 1.0`, `applyKt = false`, `applyKg = false`, motor/generator contribution excluded.

## Deferred

- GC-SC-01b strict IEC 60909 maximum short-circuit case is deferred to Stage 3, when short-circuit solver options and result-model schema are finalized.
- Partial `$ref` export refactoring is deferred until an external import/API boundary requires standalone partial schemas.
