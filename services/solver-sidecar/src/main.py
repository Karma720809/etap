"""Stage 2 PR #4 / Stage 3 PR #3 — solver sidecar entry point.

This is the Python side of the solver adapter. It exposes three commands
over stdio JSON-Lines transport:

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
- ``run_short_circuit`` (Stage 3 PR #3) — read **one** JSON line from
  stdin (the ``ShortCircuitRequest`` produced by the TypeScript
  adapter), run pandapower's IEC 60909 maximum 3-phase short-circuit
  calculation, and write a single ``ShortCircuitSidecarResponse`` JSON
  line to stdout. Same exit-code policy as ``run_load_flow``.

Design notes:

- One request per process. The TypeScript client spawns a fresh process
  per call. Daemon mode and FastAPI are deferred (see hosting decision
  §6).
- No fake numerical values are emitted. If pandapower is not installed,
  ``run_load_flow`` returns a structured ``E-LF-004`` issue and
  ``run_short_circuit`` returns a structured ``E-SC-001`` issue, both
  with ``status = "failed_solver"`` and empty result rows.
- The contract types live in :mod:`contracts`. Drift between the
  TypeScript wire shapes and this module would surface as a
  contract-level test failure.

Usage::

    python services/solver-sidecar/src/main.py health
    echo '<solver-input.json>' | \
        python services/solver-sidecar/src/main.py run_load_flow
    echo '<short-circuit-request.json>' | \
        python services/solver-sidecar/src/main.py run_short_circuit
"""

from __future__ import annotations

import importlib
import json
import sys
from typing import Any, Dict, List, TypedDict

import datetime

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


def _utc_now_iso() -> str:
    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _default_solver_options() -> Dict[str, Any]:
    """Solver-options shape stamped on responses produced before the
    request body is parsed (e.g., malformed JSON). Mirrors
    ``DEFAULT_SOLVER_OPTIONS`` on the TypeScript side."""

    return {
        "algorithm": "nr",
        "tolerance": 1e-8,
        "maxIter": 50,
        "enforceQLim": False,
    }


def _stub_metadata() -> Dict[str, Any]:
    """Build a structurally valid ``SolverMetadata`` for failure paths
    that occurred before the request was parsed.

    Stage 2 PR #4 review blocker 1: every response must include a real
    metadata object so the TypeScript side can rely on
    ``solverResult.metadata`` being non-null. The values reported here
    reflect what the sidecar can honestly state without having seen a
    request: solver/adapter version, options defaults, and timestamp.
    """

    return {
        "solverName": "pandapower",
        "solverVersion": _detect_pandapower_version(),
        "adapterVersion": SIDECAR_VERSION,
        "options": _default_solver_options(),
        "executedAt": _utc_now_iso(),
        "inputHash": None,
        "networkHash": None,
    }


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
        # covers both empty-body and malformed-JSON cases. The metadata
        # object is populated with the stub values from `_stub_metadata`
        # so the TypeScript adapter never sees `metadata: null`.
        _emit(
            {
                "status": "failed_validation",
                "converged": False,
                "metadata": _stub_metadata(),
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


def _stub_short_circuit_metadata_block() -> Dict[str, Any]:
    """Default metadata block stamped on malformed-request responses.

    The TypeScript structural guard rejects any other literal for
    ``calculationCase`` / ``faultType`` (S3-OQ-02 / S3-OQ-03), so even
    pre-parse failure responses must carry the pinned MVP values.
    """

    return {
        "calculationCase": "maximum",
        "faultType": "threePhase",
        "computePeak": True,
        "computeThermal": True,
        "voltageFactor": 1.0,
    }


def _run_short_circuit_command() -> int:
    # Lazy import — the short_circuit module pulls in pandapower
    # transitively at call time, identical to load_flow.
    from short_circuit import run_short_circuit

    try:
        request = _read_one_request()
    except ValueError as exc:
        _emit(
            {
                "status": "failed_validation",
                "metadata": _stub_metadata(),
                "shortCircuit": _stub_short_circuit_metadata_block(),
                "buses": [],
                "issues": [
                    {
                        "code": "E-SC-005",
                        "severity": "error",
                        "message": f"malformed request: {exc}",
                    }
                ],
            }
        )
        return 0

    response = run_short_circuit(request)
    _emit(dict(response))
    return 0


def main(argv: List[str]) -> int:
    if len(argv) < 2:
        sys.stderr.write("usage: main.py <command>\n")
        sys.stderr.write("commands: health, run_load_flow, run_short_circuit\n")
        return 2

    command = argv[1]
    if command == "health":
        _emit(dict(health()))
        return 0
    if command == "run_load_flow":
        return _run_load_flow_command()
    if command == "run_short_circuit":
        return _run_short_circuit_command()

    sys.stderr.write(f"unknown command: {command}\n")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
