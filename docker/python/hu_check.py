"""hu_check: a pytest plugin that writes one JSON line per test for the
runner's check adapter (architecture.md 7.3, outlines/fastapi.md 8.2).

    pytest -p hu_check --hu-report /tmp/hu-check.jsonl

hu/python keeps this file in /opt/hu/python. A check runs pytest with
PYTHONPATH=/opt/hu/python, so `-p hu_check` loads it whichever venv runs
pytest, and nothing else sees it. Each line is

    {"id": "tests/test_tasks.py::test_cap", "title": "A sixth open task gets 409",
     "status": "pass" | "fail" | "error" | "skip", "message": "...",
     "location": {"file": "tests/test_tasks.py", "line": 12}, "ms": 41}

The title is the first line of the test's docstring (the acceptance
criterion), or else the test's name. A failure in setup or teardown is an
error, never a failing test.
"""

import json
import os

MESSAGE_LIMIT = 8192
_titles = {}
_report = None


def pytest_addoption(parser):
    parser.addoption(
        "--hu-report",
        default=os.environ.get("HU_CHECK_REPORT", "/tmp/hu-check.jsonl"),
        help="Where hu_check writes its JSON lines.",
    )


def pytest_configure(config):
    global _report
    _report = open(config.getoption("--hu-report"), "w", encoding="utf-8")


def pytest_unconfigure(config):
    if _report:
        _report.close()


def pytest_collection_modifyitems(items):
    for item in items:
        doc = (getattr(getattr(item, "function", None), "__doc__", None) or "").strip()
        _titles[item.nodeid] = doc.splitlines()[0].strip() if doc else item.name


def pytest_runtest_logreport(report):
    broken = report.when in ("setup", "teardown") and report.failed
    skipped = report.when == "setup" and report.skipped
    if report.when != "call" and not broken and not skipped:
        return
    if report.passed:
        status = "pass"
    elif report.skipped:
        status = "skip"
    else:
        status = "error" if broken else "fail"
    message = ""
    if report.failed:
        message = str(report.longrepr)[-MESSAGE_LIMIT:]
    elif report.skipped and isinstance(report.longrepr, tuple):
        message = str(report.longrepr[2])
    path, line, _ = report.location
    _report.write(json.dumps({
        "id": report.nodeid,
        "title": _titles.get(report.nodeid, report.nodeid.split("::")[-1]),
        "status": status,
        "message": message,
        "location": {"file": path, "line": (line or 0) + 1},
        "ms": round(report.duration * 1000),
    }) + "\n")
    _report.flush()
