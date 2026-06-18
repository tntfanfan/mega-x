"""Start the mega-x debug stack: dev_server + Edge with CDP, wait until both
are healthy, then keep this process alive until VSCode terminates the task.

Designed to be a VSCode background task. The 'ready' line we print when both
endpoints are reachable is what the task's problemMatcher.endsPattern matches,
unblocking the dependent debug-attach configuration.

If a dev_server or Edge-with-CDP is already running, this script reuses it
instead of spawning a duplicate.

On Windows we attach all spawned children to a Job Object with
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE so that even when VSCode hard-kills this
script (which is the normal way it terminates background tasks), the OS
guarantees Edge + dev_server die too. No graceful signal needed.

Run: python tools/start_debug_stack.py
"""
import subprocess, sys, time, urllib.request, signal, json, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
USER_DIR = ROOT / ".vscode" / ".edge-profile"
DEV_PORT = 8000
CDP_PORT = 9223
URL = f"http://localhost:{DEV_PORT}/"

procs: list[subprocess.Popen] = []

# --- Windows job-object plumbing -------------------------------------------
# We bind every spawned child to a Job Object that has
# JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE set. When this Python process dies (for
# any reason), the kernel handle to the job is released, the job closes, and
# every process in the job is terminated. This is the only reliable way to
# avoid orphan Edge processes on Windows.
_job_handle = None

def _create_job():
    global _job_handle
    if sys.platform != "win32":
        return
    import ctypes
    from ctypes import wintypes
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    # Constants
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
    JobObjectExtendedLimitInformation = 9

    class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_int64),
            ("PerJobUserTimeLimit", ctypes.c_int64),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class IO_COUNTERS(ctypes.Structure):
        _fields_ = [
            ("ReadOperationCount", ctypes.c_uint64),
            ("WriteOperationCount", ctypes.c_uint64),
            ("OtherOperationCount", ctypes.c_uint64),
            ("ReadTransferCount", ctypes.c_uint64),
            ("WriteTransferCount", ctypes.c_uint64),
            ("OtherTransferCount", ctypes.c_uint64),
        ]

    class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ("IoInfo", IO_COUNTERS),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    h = kernel32.CreateJobObjectW(None, None)
    if not h:
        raise ctypes.WinError(ctypes.get_last_error())

    info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not kernel32.SetInformationJobObject(
        h, JobObjectExtendedLimitInformation,
        ctypes.byref(info), ctypes.sizeof(info),
    ):
        raise ctypes.WinError(ctypes.get_last_error())

    _job_handle = h

def _assign_to_job(pid: int):
    if sys.platform != "win32" or _job_handle is None:
        return
    import ctypes
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    PROCESS_SET_QUOTA = 0x0100
    PROCESS_TERMINATE = 0x0001
    h_proc = kernel32.OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, False, pid)
    if not h_proc:
        return
    try:
        kernel32.AssignProcessToJobObject(_job_handle, h_proc)
    finally:
        kernel32.CloseHandle(h_proc)


def shutdown(*_):
    print("[debug-stack] shutdown — closing job", flush=True)
    if sys.platform == "win32" and _job_handle is not None:
        import ctypes
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CloseHandle(_job_handle)  # job close → all children die
    else:
        for p in procs:
            try:
                p.terminate()
            except Exception:
                pass
    sys.exit(0)


signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)
if hasattr(signal, "SIGBREAK"):
    signal.signal(signal.SIGBREAK, shutdown)


def is_dev_up() -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{DEV_PORT}/", timeout=0.5) as r:
            r.read(1)
        return True
    except Exception:
        return False


def is_cdp_up() -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json", timeout=0.5) as r:
            data = json.load(r)
        return any(t.get("type") == "page" for t in data)
    except Exception:
        return False


def spawn(args: list[str], cwd: str | None = None) -> subprocess.Popen:
    p = subprocess.Popen(args, cwd=cwd)
    _assign_to_job(p.pid)
    procs.append(p)
    return p


def main():
    _create_job()

    if is_dev_up():
        print(f"[debug-stack] dev_server already up on :{DEV_PORT}", flush=True)
    else:
        print(f"[debug-stack] starting dev_server on :{DEV_PORT}", flush=True)
        spawn([sys.executable, str(ROOT / "tools" / "dev_server.py"), str(DEV_PORT)],
              cwd=str(ROOT))

    if is_cdp_up():
        print(f"[debug-stack] Edge with CDP already up on :{CDP_PORT}", flush=True)
    else:
        print(f"[debug-stack] starting Edge with CDP on :{CDP_PORT}", flush=True)
        spawn([
            EDGE,
            f"--remote-debugging-port={CDP_PORT}",
            f"--user-data-dir={USER_DIR}",
            "--no-first-run",
            "--no-default-browser-check",
            URL,
        ])

    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if is_dev_up() and is_cdp_up():
            break
        time.sleep(0.5)
    else:
        print("[debug-stack] FAIL: timeout waiting for stack to become ready", flush=True)
        shutdown()

    # The exact phrase below is matched by tasks.json problemMatcher.endsPattern.
    print("[debug-stack] ready — VSCode can attach now", flush=True)

    while True:
        time.sleep(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        shutdown()
