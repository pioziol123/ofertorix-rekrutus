"""One bounded JSON request/result. No application credentials are required."""

import sys
import json
import fcntl
import os
import time
from contextlib import contextmanager
from pathlib import Path

from jobspy.integration import IndeedRequest, collect_indeed
from jobspy.multi_source import SourceRequest, collect_source


@contextmanager
def serialized_import():
    # Shared Docker volume: separate containers/processes use the same inode.
    # Never unlink this file: that would let another process lock a new inode.
    directory = Path(os.environ["DOCUMENTS_DIR"])
    with (directory / ".jobspy-http.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            # Also protects the boundary after a crashed/killed predecessor.
            # Inside a run ControlledRequests spaces every attempt by >=2 s.
            time.sleep(1)
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def main():
    try:
        data = sys.stdin.buffer.read(8193)
        if len(data) > 8192:
            raise ValueError("request too large")
        value = json.loads(data)
        if isinstance(value, dict) and value.get('source'):
            request = SourceRequest.model_validate(value)
            collect = collect_source
        else:
            request = IndeedRequest.model_validate(value)
            collect = collect_indeed
        with serialized_import():
            result = collect(request)
        sys.stdout.write(result.model_dump_json())
    except Exception:
        sys.stderr.write("JobSpy runner failed\n")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
