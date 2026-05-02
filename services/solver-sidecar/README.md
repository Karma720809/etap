# Solver Sidecar (Python)

**Status:** Active — Stage 2 PR #4 (real Load Flow execution).
**Companion docs:**
- `docs/stage-2/solver_adapter_hosting_decision.md`
- `docs/stage-2/solver_adapter_contract.md`
- `docs/stage-2/stage_2_load_flow_voltage_drop_spec.md`

This service is the Python host for the pandapower solver, sitting
behind the TypeScript `@power-system-study/solver-adapter` boundary.
PR #3 shipped the skeleton; PR #4 introduces real Load Flow
execution. The sidecar still:

- Runs **out-of-process** as a Python child of the TypeScript adapter.
- Speaks the **stdio JSON-Lines** transport selected for the MVP
  (one request → one response per process).
- Exposes **no fake numerical values**. If pandapower is not installed
  or fails to converge, the sidecar emits a structured `SolverIssue`
  with the spec's `E-LF-001` / `E-LF-004` / `E-LF-005` codes.

## Files

- `src/contracts.py` — Python mirror of the TypeScript contract
  (`packages/solver-adapter/src/types.ts`).
- `src/main.py` — entry point with two commands: `health` and
  `run_load_flow`.
- `src/load_flow.py` — pandapower invocation: builds a pandapower net
  from a `SolverInput` JSON, runs balanced 3-phase Newton-Raphson
  load flow, and projects the result back to the contract's
  `SolverResult` shape.
- `requirements.txt` — exact pandapower version pin plus its
  scientific stack pins.

## pandapower version pin (PR #4)

Pinned to **`pandapower==2.14.10`** (per `requirements.txt`). The
2.14 long-term line keeps the same `runpp` / `create_*_from_parameters`
API used by the sidecar adapter and is well-exercised against
numpy 1.x / scipy 1.x / pandas 2.x. We pin 2.14.10 rather than the
slightly newer 2.14.11 because the latter's wheel ships an unbumped
`__version__`, which would cause `SolverMetadata.solverVersion`
(reported back to the TypeScript adapter on every call) to drift
from the pin string. Pinning 2.14.10 keeps the pin and the
runtime-reported version aligned.

The pinned version is reported back to the TypeScript adapter on
every Load Flow run via `SolverMetadata.solverVersion`. To upgrade
pandapower:

1. Bump the pin in `requirements.txt`.
2. Re-run every `verified` Stage 2 Golden Case and refresh reference
   data (spec §S2-OQ-07).
3. Note the new version in the next PR summary.

## Install

The sidecar is local-first in the MVP — it runs on the user's
machine. For development:

```sh
python3 -m venv services/solver-sidecar/.venv
source services/solver-sidecar/.venv/bin/activate
pip install -r services/solver-sidecar/requirements.txt
```

CPython 3.10 or newer is recommended (pandapower 2.14 supports 3.9+,
but the rest of the toolchain pins 3.10+).

## Health smoke

```sh
python3 services/solver-sidecar/src/main.py health
```

Expected output (single JSON line on stdout):

```json
{"sidecarName":"power-system-study-solver-sidecar","sidecarVersion":"0.1.0","contractInputVersion":"1.0.0","solverName":"pandapower","solverVersion":"2.14.10","status":"ok"}
```

`solverVersion` reads `unavailable` if pandapower is not installed in
the active interpreter. The health command never imports the heavy
scientific stack on its own — it tries the import and reports the
result, but never crashes.

## Load Flow smoke

`run_load_flow` reads one `SolverInput` JSON value from stdin and
writes one `SolverResult` JSON value to stdout. The process exits 0
on a structured response (including failed_solver / failed_validation
outcomes) and exits non-zero only when no JSON could be parsed at all.

Example (utility + transformer + LV bus + load):

```sh
cat > /tmp/lf-smoke.json <<'JSON'
{
  "inputVersion": "1.0.0",
  "scenarioId": "SCN-SMOKE",
  "frequencyHz": 60,
  "buses": [
    {"internalId":"eq_bus_mv","tag":"BUS-MV","vnKv":6.6,"topology":"3P3W"},
    {"internalId":"eq_bus_lv","tag":"BUS-LV","vnKv":0.4,"topology":"3P4W"}
  ],
  "sources": [
    {
      "internalId":"eq_util","tag":"UTL","kind":"utility",
      "busInternalId":"eq_bus_mv","vnKv":6.6,"scLevelMva":250,
      "faultCurrentKa":null,"xrRatio":10,"voltageFactor":1,
      "role":"slack","pMw":null,"qMvar":null
    }
  ],
  "transformers": [
    {
      "internalId":"eq_tr","tag":"TR","fromBusInternalId":"eq_bus_mv",
      "toBusInternalId":"eq_bus_lv","snMva":1,"vnHvKv":6.6,"vnLvKv":0.4,
      "vkPercent":6,"vkrPercent":1,"xrRatio":null,"vectorGroup":"Dyn11",
      "tapPosition":null
    }
  ],
  "lines": [],
  "loads": [
    {
      "internalId":"eq_ld","tag":"LD","busInternalId":"eq_bus_lv",
      "pMw":0.05,"qMvar":0.024,"origin":"load"
    }
  ],
  "generatorsPQ": [],
  "options": {"algorithm":"nr","tolerance":1e-8,"maxIter":50,"enforceQLim":false}
}
JSON

python3 services/solver-sidecar/src/main.py run_load_flow < /tmp/lf-smoke.json
```

A successful run returns `"status":"succeeded"`, `"converged":true`, a
`buses` array with `voltageKv` / `voltagePuPct` / `angleDeg`, and a
`branches` array with `pMwFrom` / `currentA` / `lossKw`. Cable loading
is reported as `null` until equipment ratings are wired through the
contract in Stage 2 PR #5.

## TypeScript-side integration test

The TypeScript adapter ships an opt-in integration test that drives
the real Python sidecar end-to-end:

```sh
RUN_SIDECAR_INTEGRATION=1 \
  SOLVER_PYTHON=services/solver-sidecar/.venv/bin/python \
  pnpm --filter @power-system-study/solver-adapter test:integration
```

The test is skipped without `RUN_SIDECAR_INTEGRATION=1` so plain
`pnpm test` does not require pandapower to be installed.

## What the sidecar does NOT do (deferred)

- **Voltage Drop derivation** — Stage 2 PR #5.
- **Short Circuit** — Stage 3.
- **Cable Sizing** — Stage 4.
- **Report export** — Stage 5.
- **FastAPI / HTTP transport** — deferred. The MVP transport is stdio
  JSON-Lines (hosting decision §6).
- **Daemon / long-running process** — deferred. PR #4 spawns one
  process per call.
- **Disk persistence of results** — deferred (S2-FU-07). Runtime
  snapshots live only in TypeScript memory.
- **Promotion of pandapower output to a verified Golden Case** —
  forbidden by S2-OQ-07; pandapower may be a `provisional` or
  `regression_only` reference, never the sole verified one.

## Known limitations (PR #4)

- Cable `loadingPct` is reported as `null`; the SolverInput contract
  does not yet carry cable ampacity.
- `inputHash` and `networkHash` are reserved (`null`) — a byte-stable
  serializer is a Stage 2 follow-up (S2-FU-04).
- Multi-utility / multi-slack networks are out of scope per spec
  §4.3 / §6.2 (S2-FU-03).
