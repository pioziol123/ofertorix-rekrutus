"""Offline regressions for the shared, process-wide JobSpy request boundary."""

import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, call, patch


RUNNER = Path(__file__).resolve().parents[1] / "scripts/jobspy-runner.py"
spec = importlib.util.spec_from_file_location("jobspy_runner", RUNNER)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

# Each child imports the real runner and uses its real flock and real clock.
# Collection is represented by a local critical section: no scraper is called.
CHILD = r"""
import importlib.util, json, os, sys, time
spec = importlib.util.spec_from_file_location('runner', sys.argv[1])
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
try:
    with runner.serialized_import():
        print(json.dumps({'event': 'enter', 'at': time.monotonic()}), flush=True)
        time.sleep(0.2)
        print(json.dumps({'event': 'end', 'at': time.monotonic()}), flush=True)
        if sys.argv[2] == 'crash':
            os._exit(17)
        if sys.argv[2] == 'error':
            raise RuntimeError('fixture failure')
except RuntimeError:
    sys.exit(18)
"""


class RunnerLockTests(unittest.TestCase):
    def test_indeed_uses_graphql_collector(self):
        from jobspy.integration import collect_indeed as collect_indeed_graphql

        self.assertIs(runner.collect_indeed, collect_indeed_graphql)

    def test_every_source_collects_inside_the_shared_lock(self):
        for source in (None, 'linkedin', 'bayt', 'glassdoor', 'zip_recruiter',
                       'naukri', 'bdjobs', 'hellowork', 'google'):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as directory:
                value = {'source': source} if source else {}
                request = object()
                result = SimpleNamespace(model_dump_json=lambda: '{}')
                def collect(actual):
                    self.assertIs(actual, request)
                    self.assertTrue((Path(directory) / '.jobspy-http.lock').exists())
                    # A second descriptor cannot acquire the lock while collecting.
                    with (Path(directory) / '.jobspy-http.lock').open('a') as lock:
                        with self.assertRaises(BlockingIOError):
                            runner.fcntl.flock(lock, runner.fcntl.LOCK_EX | runner.fcntl.LOCK_NB)
                    return result
                with (patch.dict(os.environ, {'DOCUMENTS_DIR': directory}),
                      patch.object(runner.time, 'sleep'),
                      patch.object(runner.IndeedRequest, 'model_validate', return_value=request),
                      patch.object(runner.SourceRequest, 'model_validate', return_value=request),
                      patch.object(runner, 'collect_indeed', side_effect=collect) as indeed,
                      patch.object(runner, 'collect_source', side_effect=collect) as others,
                      patch.object(runner.sys, 'stdin', SimpleNamespace(buffer=io.BytesIO(json.dumps(value).encode()))),
                      patch.object(runner.sys, 'stdout', io.StringIO())):
                    self.assertEqual(runner.main(), 0)
                    self.assertEqual(indeed.call_count, int(source is None))
                    self.assertEqual(others.call_count, int(source is not None))

    def child(self, directory, mode="success"):
        process = subprocess.Popen(
            [sys.executable, "-c", CHILD, str(RUNNER), mode],
            env={**os.environ, "DOCUMENTS_DIR": str(directory)},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self.addCleanup(self.stop_child, process)
        return process

    @staticmethod
    def stop_child(process):
        if process.poll() is None:
            process.kill()
        process.communicate(timeout=5)

    def test_processes_serialize_and_leave_one_second_after_all_exit_modes(self):
        for mode, exit_code in (("success", 0), ("error", 18), ("crash", 17)):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                first = self.child(directory, mode)
                entered = json.loads(first.stdout.readline())
                self.assertEqual(entered["event"], "enter")
                second = self.child(directory)
                first_out, first_error = first.communicate(timeout=15)
                second_out, second_error = second.communicate(timeout=15)
                self.assertEqual(first.returncode, exit_code, first_error)
                self.assertEqual(second.returncode, 0, second_error)
                ended = json.loads(first_out)
                following = [json.loads(line) for line in second_out.splitlines()]
                self.assertEqual(ended["event"], "end")
                self.assertEqual(following[0]["event"], "enter")
                # The prior critical section must finish before the next starts,
                # including an exception or a process that never runs finally.
                self.assertGreaterEqual(following[0]["at"] - ended["at"], 1.0)
                self.assertTrue((Path(directory) / ".jobspy-http.lock").is_file())

    def test_lock_inode_is_reused_instead_of_unlinked(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"DOCUMENTS_DIR": directory}):
                with patch.object(runner.time, "sleep") as sleep:
                    with runner.serialized_import():
                        inode = (Path(directory) / ".jobspy-http.lock").stat().st_ino
                    with runner.serialized_import():
                        self.assertEqual(
                            (Path(directory) / ".jobspy-http.lock").stat().st_ino,
                            inode,
                        )
                    self.assertEqual(sleep.call_args_list, [call(1), call(1)])

    def test_missing_documents_environment_fails_closed(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(KeyError):
                with runner.serialized_import():
                    self.fail("entered collection without a lock")

    def test_main_never_collects_when_lock_cannot_be_opened(self):
        with tempfile.TemporaryDirectory() as directory:
            blocked_lock = Path(directory) / ".jobspy-http.lock"
            blocked_lock.mkdir()
            for value in (
                {"search_term": "Senior PHP"},
                {"source": "linkedin", "search_term": "Senior PHP"},
            ):
                for environment in ({}, {"DOCUMENTS_DIR": directory}):
                    with self.subTest(value=value, environment=environment):
                        source = Mock()
                        indeed = Mock()
                        output, errors = io.StringIO(), io.StringIO()
                        with (
                            patch.dict(os.environ, environment, clear=True),
                            patch.object(runner, "collect_source", source),
                            patch.object(runner, "collect_indeed", indeed),
                            patch.object(
                                runner.sys,
                                "stdin",
                                SimpleNamespace(buffer=io.BytesIO(json.dumps(value).encode())),
                            ),
                            patch.object(runner.sys, "stdout", output),
                            patch.object(runner.sys, "stderr", errors),
                        ):
                            self.assertEqual(runner.main(), 1)
                        source.assert_not_called()
                        indeed.assert_not_called()
                        self.assertEqual(output.getvalue(), "")
                        self.assertEqual(errors.getvalue(), "JobSpy runner failed\n")


if __name__ == "__main__":
    unittest.main()
