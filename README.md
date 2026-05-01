# Power System Study App

Stage 1 foundation. Editor-first; no real calculations yet.

## Documents

- Canonical baseline: [`docs/stage-1-baseline/`](docs/stage-1-baseline/)
- Implementation notes: [`docs/stage-1-implementation-notes.md`](docs/stage-1-implementation-notes.md)

## Quickstart

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm check:fixtures
pnpm check:acceptance
pnpm --filter web dev
```

## Repository layout

```
apps/web                     # minimal Vite + React TS scaffold (read-only fixture viewer for PR #1)
packages/schemas             # canonical Zod + JSON Schema (verbatim from baseline)
packages/core-model          # type re-exports + ID/tag-counter utilities
packages/project-io          # deterministic serialize/load
packages/validation          # runtime structural validation rules
packages/fixtures            # demo fixture + tests
scripts                      # check:fixtures, check:acceptance
docs/stage-1-baseline        # canonical baseline artifacts
```

## Stage 1 scope

PR #1 (this PR): foundation — model, schema, save/load, validation, demo fixture, tests.
PR #2: equipment forms, property panel UX.
PR #3: UI polish, validation panel UX, project tree polish.
