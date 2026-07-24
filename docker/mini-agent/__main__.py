import subprocess, sys, os

AGENT_SRC = os.path.join(os.path.dirname(__file__), "agent.py")
subprocess.run([sys.executable, AGENT_SRC])
