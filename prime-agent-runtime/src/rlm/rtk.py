"""Rewrite agent bash commands through `rtk rewrite` when it is installed.

No-op when `rtk` is missing, older than 0.23, or `RTK_DISABLED=1`. The Rust
host has no bash minimizer, so every remaining command is eligible.
"""

from __future__ import annotations

import os
import re
import subprocess
from collections.abc import Callable
from typing import Any

_REWRITE_TIMEOUT_S = 2
_MIN_SUPPORTED_RTK_MINOR = 23
_VERSION = re.compile(r"(\d+)\.(\d+)\.(\d+)")
_available: bool | None = None

Runner = Callable[..., subprocess.CompletedProcess[str]]


def reset_cache() -> None:
    global _available
    _available = None


def rewrite_bash_command(command: str, run: Runner | None = None) -> str:
    if os.environ.get("RTK_DISABLED") == "1" or not command.strip():
        return command
    runner = run or _run
    if not _ready(runner):
        return command
    try:
        result = runner(
            ["rtk", "rewrite", command],
            capture_output=True,
            text=True,
            timeout=_REWRITE_TIMEOUT_S,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return command
    if result.returncode not in (0, 3):
        return command
    rewritten = result.stdout.strip()
    if rewritten and rewritten != command:
        return rewritten
    return command


def _ready(run: Runner) -> bool:
    global _available
    if _available is not None:
        return _available
    try:
        version = run(
            ["rtk", "--version"],
            capture_output=True,
            text=True,
            timeout=_REWRITE_TIMEOUT_S,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        _available = False
        return False
    if version.returncode != 0:
        _available = False
        return False
    match = _VERSION.search(version.stdout.removeprefix("rtk").strip())
    if match and int(match.group(1)) == 0 and int(match.group(2)) < _MIN_SUPPORTED_RTK_MINOR:
        _available = False
        return False
    _available = True
    return True


def _run(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
    return subprocess.run(*args, **kwargs)
