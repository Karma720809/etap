# Solver Sidecar (Python)

**Status:** Skeleton only — Stage 2 PR #3.
**Companion docs:**
- `docs/stage-2/solver_adapter_hosting_decision.md`
- `docs/stage-2/solver_adapter_contract.md`

This service is the Python host for the pandapower solver, sitting
behind the TypeScript `@power-system-study/solver-adapter` boundary.
It does **not** compute Load Flow yet; that is wired in Stage 2 PR #4.
Stage 2 PR #3 ships:

- `src/contracts.py` — Python mirror of the TypeScript contract types
  in `packages/solver-adapter/src/types.ts` (used to keep the two
  sides in sync once PR #4 picks a transport).
- `src/main.py` — a `health` smoke command that prints sidecar +
  contract version metadata and exits.

There is **no** pandapower call in this PR. The sidecar emits no
voltage / current / loading values, no fake convergence flag, and
no fabricated `SolverResult`.

## Smoke command

```sh
python services/solver-sidecar/src/main.py health
```

Expected output (JSON, single line):

```json
{"sidecarName":"power-system-study-solver-sidecar","sidecarVersion":"0.1.0","contractInputVersion":"1.0.0","solverName":"pandapower","solverVersion":"unconfigured","status":"ok"}
```

`solverVersion` reads `unconfigured` because pandapower is not yet a
declared dependency — version pinning lands in Stage 2 PR #4 alongside
the actual transport. The smoke command intentionally avoids importing
`pandapower` so that it works on a stock Python install.

## Out-of-scope for PR #3

- pandapower invocation
- transport selection (stdio JSON-Lines vs. `127.0.0.1` HTTP / FastAPI)
- packaging the Python interpreter
- result normalization to `BusResult` / `BranchResult`
- runtime `CalculationSnapshot` creation
- disk persistence

These are deferred to Stage 2 PR #4 / PR #5 / PR #6 per the spec.
