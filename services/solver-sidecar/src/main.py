"""Stage 2 PR #4 — solver sidecar entry point with real Load Flow.

This is the Python side of the Stage 2 solver adapter. It exposes two
commands over stdio JSON-Lines transport:

- ``health`` — write a single JSON line describing sidecar version,
  contract version, and the detected pandapower version. Does not
  require a request body. Never imports pandapower lazily on its own
  (it tries; failure is reported in the payload but never crashes).
- ``run_load_flow`` — read **one** JSON line from stdin (the
  ``SolverInput`` produced by the TypeScript adapter), run a balanced
  three-phase load flow via pandapower, and write a single
  ``SolverResult`` JSON line to stdout. The process exits 0 on a
  structured response (including ``failed_validation`` /
  ``failed_solver`` outcomes) and exits non-zero only when the request
  cannot be parsed at all.

Design notes:

- One request per process. PR #4 deliberately does not introduce a
  daemon lifecycle — the TypeScript client spawns a fresh process per
  call. Daemon mode and FastAPI are deferred (see hosting decision §6).
- No fake numerical values are emitted. If pandapower is not installed,
  ``run_load_flow`` returns a structured ``E-LF-004`` issue and
  ``status = "failed_solver"`` with empty ``buses`` / ``branches``.
- The contract types live in :mod:`contracts`. Drift between the
  TypeScript ``SolverInput`` / ``SolverResult`` and this module would
  surface as a contract-level test failure.

Usage::

    python services/solver-sidecar/src/main.py health
    echo '<solver-input.json>' | \
        python services/solver-sidecar/src/main.py run_load_flow
"""

from __future__ import annotations

import importlib
import json
import sys
from typing import Any, Dict, List, TypedDict

from contracts import SIDECAR_NAME, SIDECAR_VERSION, SOLVER_INPUT_VERSION


class HealthPayload(TypedDict):
    sidecarName: str
    sidecarVersion: str
    contractInputVersion: str
    solverName: str
    solverVersion: str
    status: str


def _detect_pandapower_version() -> str:
    """Return the installed pandapower version string, or ``unavailable``.

    Importing pandapower is deliberately a soft dependency for the
    ``health`` smoke command: a pandapower-less interpreter still
    answers health, which keeps developer onboarding cheap.
    """

    try:
        pp = importlib.import_module("pandapower")
    except Exception:
        return "unavailable"
    return str(getattr(pp, "__version__", "unknown"))


def health() -> HealthPayload:
    """Return the smoke-test payload."""

    return {
        "sidecarName": SIDECAR_NAME,
        "sidecarVersion": SIDECAR_VERSION,
        "contractInputVersion": SOLVER_INPUT_VERSION,
        "solverName": "pandapower",
        "solverVersion": _detect_pandapower_version(),
        "status": "ok",
    }


def _emit(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def _read_one_request() -> Any:
    """Read exactly one JSON value from stdin.

    The transport is JSON-Lines but the run_load_flow command consumes a
    single request per process. Reading the entire stdin and parsing it
    as a single JSON document is more forgiving of pretty-printed input
    than a strict line reader and still satisfies the JSON-Lines wire
    format (one JSON value, one newline).
    """

    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("empty request body on stdin")
    return json.loads(raw)


def _run_load_flow_command() -> int:
    # Imported lazily so that running ``health`` or an ``unknown command``
    # does not pull in the load_flow module (which transitively imports
    # pandapower at call time).
    from load_flow import run_load_flow

    try:
        request = _read_one_request()
    except ValueError as exc:
        # json.JSONDecodeError inherits from ValueError, so this branch
        # covers both empty-body and malformed-JSON cases.
        _emit(
            {
                "status": "failed_validation",
                "converged": False,
                "metadata": None,
                "buses": [],
                "branches": [],
                "issues": [
                    {
                        "code": "E-LF-005",
                        "severity": "error",
                        "message": f"malformed request: {exc}",
                    }
                ],
            }
        )
        return 0

    result = run_load_flow(request)
    _emit(dict(result))
    return 0


def main(argv: List[str]) -> int:
    if len(argv) < 2:
        sys.stderr.write("usage: main.py <command>\n")
        sys.stderr.write("commands: health, run_load_flow\n")
        return 2

    command = argv[1]
    if command == "health":
        _emit(dict(health()))
        return 0
    if command == "run_load_flow":
        return _run_load_flow_command()

    sys.stderr.write(f"unknown command: {command}\n")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
