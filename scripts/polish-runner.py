"""One bounded JSON request/result; isolated from application credentials."""
import fcntl
import json
import os
from pathlib import Path
import sys
import time
from polish_sources import ImportRequest, collect


def main():
    try:
        data = sys.stdin.buffer.read(8193)
        if len(data) > 8192:
            raise ValueError("request too large")
        query = ImportRequest.model_validate_json(data)
        directory = Path(os.environ["DOCUMENTS_DIR"])
        with (directory / (".polish-" + query.source + "-http.lock")).open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            time.sleep(2)
            result = collect(query)
            sys.stdout.write(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception:
        sys.stderr.write("Polish source runner failed\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
