"""Stage 2 PR #3 — solver sidecar smoke entry point.

Stage 2 PR #3 deliberately does NOT compute Load Flow. The sidecar is
shipped as a skeleton so that the hosting decision (S2-FU-01) can be
exercised end-to-end without leaking fake engineering values into any
result store. PR #4 will add the actual pandapower call and a chosen
transport (stdio JSON-Lines or local HTTP / FastAPI).

Usage:

    python services/solver-sidecar/src/main.py health

The ``health`` command writes a single JSON line to stdout with the
sidecar version and contract version. It exits 0 on success and 2 on
unknown commands. It does not import pandapower.
"""

from __future__ import annotations

import json
import sys
from typing import List, TypedDict

from contracts import SIDECAR_NAME, SIDECAR_VERSION, SOLVER_INPUT_VERSION


class HealthPayload(TypedDict):
    sidecarName: str
    sidecarVersion: str
    contractInputVersion: str
    solverName: str
    solverVersion: str
    status: str


def health() -> HealthPayload:
    """Return the smoke-test payload. No pandapower import, no real solver."""
    return {
        "sidecarName": SIDECAR_NAME,
        "sidecarVersion": SIDECAR_VERSION,
        "contractInputVersion": SOLVER_INPUT_VERSION,
        "solverName": "pandapower",
        # Reads "unconfigured" until Stage 2 PR #4 pins pandapower and
        # imports it. This makes the smoke command runnable on a stock
        # CPython without the scientific stack.
        "solverVersion": "unconfigured",
        "status": "ok",
    }


def main(argv: List[str]) -> int:
    if len(argv) < 2:
        sys.stderr.write("usage: main.py <command>\n")
        sys.stderr.write("commands: health\n")
        return 2

    command = argv[1]
    if command == "health":
        sys.stdout.write(json.dumps(health(), separators=(",", ":")) + "\n")
        return 0

    sys.stderr.write(f"unknown command: {command}\n")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
