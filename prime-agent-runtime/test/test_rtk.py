from __future__ import annotations

import subprocess
import unittest
from unittest import mock

from rlm import rtk


def _completed(stdout: str, code: int = 0) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(["rtk"], code, stdout, "")


class RtkRewriteTest(unittest.TestCase):
    def tearDown(self) -> None:
        rtk.reset_cache()

    def test_rewrites_when_rtk_accepts_the_command(self) -> None:
        calls: list[list[str]] = []

        def run(args, **_kwargs):
            calls.append(args)
            if args[1] == "--version":
                return _completed("rtk 0.45.0\n")
            return _completed("git status --short\n")

        with mock.patch.dict("os.environ", {}, clear=False):
            os_disabled = "RTK_DISABLED"
            if os_disabled in __import__("os").environ:
                del __import__("os").environ[os_disabled]
            rewritten = rtk.rewrite_bash_command("git status", run)
        self.assertEqual(rewritten, "git status --short")
        self.assertEqual(calls[0][1], "--version")
        self.assertEqual(calls[1], ["rtk", "rewrite", "git status"])

    def test_keeps_the_command_when_rewrite_fails_or_rtk_is_disabled(self) -> None:
        def fail(args, **_kwargs):
            if args[1] == "--version":
                return _completed("rtk 0.45.0\n")
            return _completed("", 1)

        self.assertEqual(rtk.rewrite_bash_command("git status", fail), "git status")
        rtk.reset_cache()
        with mock.patch.dict("os.environ", {"RTK_DISABLED": "1"}):
            self.assertEqual(rtk.rewrite_bash_command("git status"), "git status")
