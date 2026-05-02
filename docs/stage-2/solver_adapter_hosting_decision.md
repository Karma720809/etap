# Solver Adapter Hosting Decision (S2-FU-01)

**Project:** Power System Study App
**Stage:** Stage 2 — Load Flow / Voltage Drop MVP
**Closes:** S2-FU-01 (`stage_2_load_flow_voltage_drop_spec.md` §18)
**Status:** Decided — selected option recorded below
**Date:** 2026-05-02
**Authoring PR:** Stage 2 PR #3 — Solver Adapter Contract + Python Sidecar

---

## 1. Context

Stage 2 introduces the first real engineering output of the Power System
Study App: balanced three-phase Load Flow and a derived Voltage Drop. The
selected internal solver is **pandapower**, per `stage_2_load_flow_voltage_drop_spec.md`
§8.2. pandapower is a Python library; the rest of the application is
TypeScript (Node + browser). S2-FU-01 asks how Stage 2 should host
pandapower so that:

- The TypeScript canonical schema and `AppNetwork` model remain
  independent of pandapower (spec §8.2 / §17).
- Solver-specific structures stay behind adapter contracts (spec §8.1 A2 / A3).
- Pandapower version, adapter version, and solver options are
  recorded with every result (spec §8.2 / §9.2).
- Future Short Circuit (Stage 3) can share the same solver boundary.
- The decision is testable, deployable for the MVP, and not coupled
  to disk persistence (S2-FU-07 keeps results in-memory only).

This decision is also a **merge gate** for Stage 2 PR #3 per spec §16
and §18 / S2-FU-01.

---

## 2. Decision

**Selected option: Python sidecar service.**

The pandapower runtime is hosted as an out-of-process Python service
("solver sidecar"). The TypeScript application calls the sidecar through
a typed adapter contract defined in `packages/solver-adapter`. The
adapter accepts an `AppNetwork`, builds a `SolverInput` (a solver-agnostic
request), invokes the sidecar, and parses the response into a
`SolverResult` (a solver-agnostic response). Every public type on the
adapter is defined in TypeScript and contains **no** pandapower element
names.

Stage 2 PR #3 ships:

1. The **adapter contract types** in `packages/solver-adapter/src/types.ts`
   and `src/contract.ts`.
2. A pure **`AppNetwork → SolverInput` mapper** that does not call
   pandapower. The mapper is fully tested.
3. A **Python sidecar skeleton** (`services/solver-sidecar/`) with a
   `health` command and a `contracts.py` module that mirrors the
   TypeScript contract. The skeleton does **not** compute Load Flow
   yet; it returns no fake engineering values.
4. **Contract tests** that exercise the mapper, never pandapower.

Real solver execution and result normalization land in Stage 2 PR #4.

---

## 3. Options considered

### 3.1 Option A — Browser / WASM pandapower (rejected)

**Idea.** Compile pandapower (and its NumPy/SciPy stack) to
WebAssembly (e.g., via Pyodide) and run it in the browser.

**Reasons rejected.**

- pandapower's transitive dependency tree (NumPy, SciPy, pandas,
  numba) is large and not all of it builds reliably under Pyodide;
  numba is a particular blocker.
- Initial download size for a Pyodide bundle that includes the
  scientific stack is in the tens of MB — too costly for an editor
  app whose primary path is authoring, not solving.
- WASM execution does not give us the version pinning story we want
  for Golden Cases. Reproducing a result on a CI worker becomes
  Pyodide-version dependent in addition to pandapower-version
  dependent.
- Stage 3 Short Circuit will reuse the same solver host. Forcing
  Short Circuit through WASM duplicates the same constraints.
- Browser-only hosting blocks future server-side / batch execution
  (a likely Stage 4+ requirement once Cable Sizing and bulk
  Short-Circuit runs land).

### 3.2 Option B — Node-native solver (rejected)

**Idea.** Replace pandapower with a JavaScript / TypeScript Load Flow
implementation, or wrap a C/C++ solver via Node N-API.

**Reasons rejected.**

- We do not have a Load Flow solver in TypeScript with comparable
  scope, robustness, or community adoption to pandapower.
- Writing one in this PR would be a multi-quarter effort and bring
  its own correctness risk; spec §S2-OQ-07 already forbids letting
  the solver be its own oracle, so we would still need pandapower as
  a cross-check engine.
- C/C++ N-API wrappers (e.g., MATPOWER bindings) introduce a
  compiled native dependency without removing the Python sidecar
  problem for Short Circuit.
- This option does not satisfy spec §8.2 rule 1 ("pandapower is
  allowed as the internal solver adapter. No other solver is wired
  in Stage 2.").

### 3.3 Option C — Direct Python child process from Node (rejected)

**Idea.** Spawn `python -c "..."` from Node for each calculation, pipe
JSON in/out, no service.

**Reasons rejected.**

- Cold-start cost: importing pandapower takes ~1–2 s. Paying that on
  every run defeats interactive use.
- No place to keep solver-version metadata, options, or warmed
  caches between runs.
- Process management in browsers is not possible at all; this
  option locks Stage 2 to the desktop / Electron path.
- Larger inputs do not fit cleanly through CLI argv; we end up
  reinventing a stdio protocol — the same surface as a sidecar
  service, but undocumented and per-call.

### 3.4 Option D — Python sidecar service (selected)

**Idea.** A long-running Python process that exposes the solver
contract over a local IPC mechanism (HTTP / FastAPI in the long
term; stdio JSON-Lines or `127.0.0.1` HTTP for the MVP). The Node
adapter starts the sidecar (or attaches to an externally-started
one), sends `SolverInput` JSON, and reads back `SolverResult` JSON.

**Reasons selected.**

- pandapower is Python-native; no compilation or WASM porting.
- One process boundary for Load Flow now and Short Circuit later
  (spec §16 — same A2/A3 layers reused).
- Version is **pinned** in the sidecar's `pyproject.toml` /
  `requirements.txt` and reported back on every call as
  `SolverMetadata.solverVersion`.
- Bidirectional `internalId ↔ solver index` map is owned entirely
  by the adapter — pandapower indices never leak into the
  TypeScript app.
- Cleanly separates editor concerns (authoring, validation, UI) from
  solver concerns (numerical methods, library versions). Failures in
  the sidecar never crash the editor.
- Future server-mode is a deployment change, not an architecture
  change: the same sidecar runs on a worker.

---

## 4. Process boundary and security

- **Transport (MVP).** stdio JSON-Lines or local HTTP on
  `127.0.0.1`. The choice is a deployment detail; the contract is
  the same. Stage 2 PR #4 will pick one and pin it.
- **Trust.** The sidecar is treated as trusted code shipped with the
  application. It runs only on the user's machine in MVP.
- **Authentication.** Not required for the MVP local-only transport.
  When the sidecar is hosted server-side later, an
  application-issued token must be required on every request.
- **Inputs are JSON only.** The adapter never sends shell strings.
  No pickle, no `eval`, no arbitrary-code execution path on either
  side.
- **Outputs are validated.** The adapter parses and type-checks every
  response field before exposing it to the rest of the app. A
  malformed response maps to `E-LF-004 solver adapter failure`
  (spec §11.1).
- **Process lifetime.** The adapter owns the sidecar lifecycle in
  MVP: spawn on first use, kill on shutdown. Crashes surface as
  `E-LF-004`; the adapter does not silently restart and re-run.
- **Logging.** Sidecar logs to stderr with structured JSON lines.
  The adapter forwards them under a "solver-sidecar" namespace; no
  result data is logged unless an explicit debug flag is set.

---

## 5. Version pinning plan

- pandapower is pinned exactly (`pandapower==X.Y.Z`) in
  `services/solver-sidecar/requirements.txt` (or `pyproject.toml`
  when a build backend is added in PR #4).
- The exact version string is reported on every response in
  `SolverMetadata.solverVersion` and recorded on every
  `CalculationResultBundle` once Stage 2 PR #4 introduces the
  result store.
- The adapter has its own semver in
  `packages/solver-adapter/package.json`; it is reported as
  `SolverMetadata.adapterVersion`.
- A solver upgrade requires:
  1. updating the pin,
  2. re-running every `verified` Golden Case,
  3. recording the new version on regenerated reference data.

This satisfies spec §8.2 rule 4 ("pandapower version and adapter
version are recorded") and the merge-gate clause in S2-FU-01.

---

## 6. Deployment model for the MVP

- Stage 2 MVP ships the sidecar **alongside** the application in a
  local-first packaging: the sidecar runs on the user's machine.
  No remote calls are made. This matches Stage 2's in-memory
  result-store policy (spec §9.4) and the deferred persistence
  decision (S2-FU-07).
- For Stage 2 PR #3 (this PR), the sidecar ships as a **skeleton**:
  - a `health` smoke command that prints version metadata,
  - a `contracts.py` mirror of the TypeScript contract,
  - **no pandapower call**, no solver execution.
- Stage 2 PR #4 wires the actual pandapower call and binds the
  adapter to a concrete transport. The adapter contract types in
  `packages/solver-adapter` do not change between PR #3 and PR #4
  except for adding the chosen transport's connection options to
  `SolverOptions` (additive, behind a typed field).

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sidecar startup latency (~1–2 s on first call) | Spawn lazily on first run; keep alive across runs; show "starting solver…" in the Run UI in PR #5. |
| Cross-platform Python availability | The sidecar is run from a packaged Python interpreter shipped with the desktop build (PR #4 picks the packager: `pyoxidizer` / `briefcase` / `pyapp` are all candidates). End users do not install Python by hand. |
| Pandapower version drift during development | Version pin in requirements + `SolverMetadata.solverVersion` echo + Golden Case regeneration policy (§5). |
| Sidecar crash mid-run | Adapter maps to `E-LF-004 solver adapter failure` (spec §11.1) and surfaces the message; no fake numbers. |
| IPC protocol mismatch | Contract types are the single source of truth; sidecar `contracts.py` mirrors them and is exercised by a smoke test. Drift becomes a contract-test failure, not a runtime crash. |
| Result-data leakage in logs | Sidecar logs only metadata by default; result payloads are gated behind an explicit debug flag (§4 "Logging"). |

---

## 8. What this decision does NOT do

This decision document only resolves S2-FU-01. It does not:

- Implement real Load Flow execution. (Stage 2 PR #4.)
- Persist any result to disk. (Spec §9.4 / S2-FU-07: deferred.)
- Pick the final IPC transport. (Decision in PR #4; both stdio
  JSON-Lines and local HTTP / FastAPI satisfy the contract.)
- Modify the Stage 1 canonical project schema. (Spec §17 / AC-S2-12.)
- Introduce pandapower types into `packages/schemas`,
  `packages/core-model`, `packages/network-model`, or any UI code.
- Promote any pandapower output to a verified Golden Case reference
  (spec §S2-OQ-07).

---

## 9. References

- `docs/stage-2/stage_2_load_flow_voltage_drop_spec.md`
  (S2-FU-01, §8 Solver Boundary, §9 Result Model, §16 PR breakdown,
  §17 Guardrails)
- `docs/stage-2/solver_adapter_contract.md` (contract types and
  shapes referenced from this decision)
- `packages/solver-adapter/` (TypeScript adapter implementation)
- `services/solver-sidecar/` (Python sidecar skeleton)
