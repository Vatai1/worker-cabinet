import subprocess, sys, os, signal, time
from watchfiles import watch, Change

AGENT_PY = os.path.join(os.path.dirname(__file__), "agent.py")
WATCH_DIR = os.path.dirname(__file__)
AGENT_VENV = "/Users/vatai/mini-agent/.venv/bin/python"

def run_agent():
    proc = subprocess.Popen(
        [AGENT_VENV, AGENT_PY],
        cwd=WATCH_DIR,
    )
    return proc

def main():
    print(f"Watching {WATCH_DIR} for changes...")
    proc = run_agent()

    try:
        for changes in watch(WATCH_DIR, watch_filter=lambda p, _: p.suffix == '.py'):
            if any(c in (Change.added, Change.modified) for c in changes.values()):
                print(f"Change detected, restarting...")
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                proc = run_agent()
    except KeyboardInterrupt:
        proc.terminate()
        proc.wait()

if __name__ == "__main__":
    main()
