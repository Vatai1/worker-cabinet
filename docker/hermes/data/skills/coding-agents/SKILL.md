---
name: coding-agents
description: "Comprehensive guide to autonomous coding agents: Claude Code, Codex, OpenCode, and orchestration patterns."
version: 2.2.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Coding-Agents, Autonomous-Coding, Claude-Code, Codex, OpenCode, Code-Review, Refactoring]
    related_skills: [claude-code, codex, opencode, hermes-agent, kanban-codex-lane]
---

# Autonomous Coding Agents

This skill covers the complete ecosystem of autonomous coding agents that can be delegated to implement features, review code, refactor, and manage development workflows. Each agent has its own strengths and optimal use cases.

## 🔧 Choosing the Right Coding Agent

| Agent | Best For | Provider | Key Strength |
|-------|----------|----------|-------------|
| **Claude Code** | Complex multi-turn tasks, deep reasoning | Anthropic | Best reasoning, conversation flow |
| **Codex** | Fast implementation, batch operations | OpenAI | Speed, full-auto mode |
| **OpenCode** | Provider-agnostic, PR reviews | Multiple (OpenRouter/etc) | Flexibility, cost-effective |
| **Kanban Workers** | Structured development, review cycles | Hermes | Team coordination, quality gates |

## 🤖 Claude Code (Anthropic)

### When to Use
- Complex multi-step development tasks
- Deep reasoning and architectural work
- PR reviews requiring thorough analysis
- Tasks where conversation flow matters

### Prerequisites
```bash
# Installation
npm install -g @anthropic-ai/claude-code

# Authentication (choose one)
claude auth login  # OAuth browser flow
claude auth login --console  # API key billing
claude auth login --sso  # Enterprise

# Verify
claude --version  # Requires v2.x+
claude auth status
claude doctor     # Health check
```

### Two Orchestration Modes

#### Mode 1: Print Mode (`-p`) - Non-Interactive (PREFERRED)
Clean one-shot execution, no PTY needed, structured output.
```bash
terminal(command="claude -p 'Add error handling to all API calls' --max-turns 10", workdir="/project", timeout=120)
```

**Key flags for print mode:**
- `--max-turns <n>` - Limit agentic loops (prevents runaway)
- `--output-format json` - Structured output
- `--json-schema <schema>` - Force structured extraction
- `--allowedTools Read,Edit,Bash` - Restrict capabilities

#### Mode 2: Interactive PTY with tmux
For multi-turn conversations requiring iteration.
```bash
# Start tmux session
terminal(command="tmux new-session -d -s claude-work -x 140 -y 40")

# Launch Claude Code
terminal(command="tmux send-keys -t claude-work 'cd /project && claude --dangerously-skip-permissions' Enter")

# Handle dialogs
terminal(command="sleep 4 && tmux send-keys -t claude-work Enter")  # Trust dialog
terminal(command="sleep 3 && tmux send-keys -t claude-work Down && sleep 0.3 && tmux send-keys -t claude-work Enter")  # Permissions dialog

# Send task
terminal(command="sleep 5 && tmux send-keys -t claude-work 'Refactor auth module to use JWT tokens' Enter")

# Monitor progress
terminal(command="sleep 15 && tmux capture-pane -t claude-work -p -S -50")

# Send follow-up
terminal(command="tmux send-keys -t claude-work 'Now add unit tests' Enter")

# Exit
terminal(command="tmux send-keys -t claude-work '/exit' Enter")
```

### Advanced Patterns

#### Structured JSON Output
```bash
terminal(command="claude -p 'List all functions in src/' --output-format json --json-schema '{\"type\":\"object\",\"properties\":{\"functions\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}}}}'", workdir="/project", timeout=90)
```

#### Session Continuation
```bash
# Start task and save session ID
terminal(command="claude -p 'Start refactoring database layer' --output-format json > /tmp/session.json", workdir="/project", timeout=180)

# Resume with session ID
terminal(command="claude -p 'Continue and add connection pooling' --resume $(cat /tmp/session.json | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"session_id\"])')", workdir="/project", timeout=120)
```

#### Piped Input
```bash
terminal(command="git diff HEAD~3 | claude -p 'Summarize these changes' --max-turns 1", timeout=60)
terminal(command="cat src/auth.py | claude -p 'Review for security issues' --max-turns 1", timeout=60)
```

### PR Review Patterns
```bash
# Quick diff review
terminal(command="git diff main...feature-branch | claude -p 'Review this diff' --max-turns 1", timeout=60)

# Deep review in worktree
terminal(command="claude -w pr-review", workdir="/repo", background=true, pty=true)
terminal(command="sleep 5 && tmux send-keys -t session 'Review all changes vs main' Enter")
```

## 🧠 Codex (OpenAI)

### When to Use
- Fast implementation tasks
- Batch operations
- Parallel issue fixing
- Full-auto development (with `--yolo`)

### Prerequisites
```bash
# Installation
npm install -g @openai/codex

# Authentication
export OPENAI_API_KEY="sk-..."
# OR use Codex OAuth
```

### Basic Usage
```bash
# One-shot task
terminal(command="codex exec 'Add dark mode toggle to settings'", workdir="/project", pty=true)

# Full-auto mode
terminal(command="codex exec --full-auto 'Refactor auth module'", workdir="/project", pty=true)
```

### Background Tasks
```bash
# Start long task
terminal(command="codex exec --full-auto 'Migrate database schema'", workdir="/project", background=true, pty=true)

# Monitor
process(action="poll", session_id="<id>")
process(action="log", session_id="<id>")

# Send input if needed
process(action="submit", session_id="<id>", data="yes")
```

### Batch Issue Fixing
```bash
# Create worktrees
terminal(command="git worktree add -b fix/issue-78 /tmp/issue-78 main", workdir="/project")
terminal(command="git worktree add -b fix/issue-99 /tmp/issue-99 main", workdir="/project")

# Launch Codex in each
terminal(command="codex --yolo exec 'Fix issue #78. Commit when done.'", workdir="/tmp/issue-78", background=true, pty=true)
terminal(command="codex --yolo exec 'Fix issue #99. Commit when done.'", workdir="/tmp/issue-99", background=true, pty=true)

# Monitor and cleanup
process(action="list")
terminal(command="git worktree remove /tmp/issue-78", workdir="/project")
```

## 🔓 OpenCode

### When to Use
- Provider-agnostic tasks (OpenRouter, Anthropic, etc.)
- Cost-effective development
- PR reviews
- When user specifically requests OpenCode

### Prerequisites
```bash
# Installation
npm i -g opencode-ai@latest
# OR
brew install anomalyco/tap/opencode

# Authentication
opencode auth login
opencode auth list  # Verify providers
```

### Binary Resolution
Check for multiple OpenCode binaries:
```bash
terminal(command="which -a opencode")
terminal(command="opencode --version")
```

### One-Shot Tasks
```bash
terminal(command="opencode run 'Add retry logic to API calls'", workdir="/project")
```

### Interactive Sessions
```bash
# Start TUI
terminal(command="opencode", workdir="/project", background=true, pty=true)

# Send prompts
process(action="submit", session_id="<id>", data="Implement OAuth refresh flow")
process(action="submit", session_id="<id>", data="Now add error handling")

# Monitor
process(action="poll", session_id="<id>")
process(action="log", session_id="<id>")

# Exit (use Ctrl+C, NOT /exit)
process(action="write", session_id="<id>", data="\x03")
```

### PR Review
```bash
# Built-in PR command
terminal(command="opencode pr 42", workdir="/project", pty=true)

# Isolated review
terminal(command="REVIEW=$(mktemp -d) && git clone https://github.com/user/repo.git $REVIEW && cd $REVIEW && opencode run 'Review PR vs main'", pty=true)
```

### Common Flags
| Flag | Purpose |
|------|---------|
| `--continue` / `-c` | Continue last session |
| `--session <id>` / `-s` | Resume specific session |
| `--agent <name>` | Choose agent (build/plan) |
| `--model provider/model` | Force specific model |
| `--format json` | Machine-readable output |
| `--file <path>` / `-f` | Attach context files |

## 🔄 Kanban Codex Lane

### When to Use
- Structured development workflows
- When Hermes manages task lifecycle
- Quality gates and reviews
- Team coordination

### Pattern
```bash
# Kanban worker delegates to Codex while maintaining ownership
terminal(command="codex exec --full-auto 'Implement feature X'", workdir="/project", background=true, pty=true)

# Hermes continues to own testing, validation, and handoff
# The worker ensures quality gates are met
```

## 🛠️ Orchestration Patterns

### Parallel Development
Run multiple agents simultaneously for different aspects:
```bash
# Task 1: Backend (Claude Code)
terminal(command="tmux new-session -d -s backend -x 140 -y 40 && tmux send-keys -t backend 'claude -p \"Implement auth API\" --max-turns 10' Enter")

# Task 2: Frontend (OpenCode) 
terminal(command="opencode run 'Build login UI components' --format json", workdir="/project", background=true, pty=true)

# Task 3: Tests (Codex)
terminal(command="codex exec --full-auto 'Write integration tests'", workdir="/project", background=true, pty=true)

# Monitor all
process(action="list")
```

### Sequential Refinement
Use one agent's output as another's input:
```bash
# Step 1: Design with Claude Code
terminal(command="claude -p 'Design database schema for user system' --output-format json --json-schema schema.json", workdir="/project", timeout=90)

# Step 2: Implement with Codex
terminal(command="codex exec --full-auto 'Implement schema from design.json'", workdir="/project", pty=true)

# Step 3: Review with OpenCode
terminal(command="opencode run 'Review implementation vs design' -f design.json -f schema.sql", workdir="/project")
```

### Fallback Strategy
When one agent is unavailable or rate-limited:
```bash
# Try Claude Code first
if command -v claude &>/dev/null && claude auth status &>/dev/null; then
  terminal(command="claude -p 'task' --max-turns 10")
# Fall back to OpenCode
elif command -v opencode &>/dev/null && opencode auth list &>/dev/null; then
  terminal(command="opencode run 'task'")
# Finally fall back to Codex
elif command -v codex &>/dev/null && [ -n "$OPENAI_API_KEY" ]; then
  terminal(command="codex exec 'task'", pty=true)
fi
```

## 🔍 Code Review Patterns

### Multi-Agent Review
Each agent has different review strengths:
```bash
# Security review (Claude Code - deep reasoning)
terminal(command="claude -p 'Conduct security review of auth.py' --max-turns 5", workdir="/project")

# Performance review (Codex - fast analysis)
terminal(command="codex exec 'Profile and optimize database queries'", workdir="/project", pty=true)

# Style review (OpenCode - provider-agnostic)
terminal(command="opencode run 'Review for style and best practices'", workdir="/project")
```

### PR Review Workflow
```bash
# Option 1: Direct PR review
terminal(command="claude -p 'Review this PR' --from-pr 123 --max-turns 10", workdir="/repo", timeout=120)

# Option 2: Isolated clone
terminal(command="REVIEW=$(mktemp -d) && git clone https://github.com/user/repo.git $REVIEW", timeout=30)
terminal(command="cd $REVIEW && gh pr checkout 123", timeout=15)
terminal(command="cd $REVIEW && opencode run 'Review all changes' --thinking", workdir="$REVIEW", pty=true)

# Option 3: Batch review
for pr in 42 43 44; do
  terminal(command="claude -p 'Review PR #$pr' --from-pr $pr --max-turns 5 &", workdir="/repo")
done
```

## 📊 Monitoring and Results

### Claude Code Monitoring
```bash
# Check progress
terminal(command="tmux capture-pane -t claude-session -p -S -50")

# Look for indicators:
# - ❯ at bottom = waiting for input (done or asking question)
# - ● lines = actively using tools
# - "✓" or checkmarks = completed actions
```

### Process Monitoring (All Agents)
```bash
# List all background processes
process(action="list")

# Poll specific process
process(action="poll", session_id="<id>")

# Get full logs
process(action="log", session_id="<id>", offset=1, limit=200)

# Send input/exit
process(action="submit", session_id="<id>", data="yes")
process(action="kill", session_id="<id>")
```

### Cost and Performance Tracking
```bash
# Claude Code costs
terminal(command="claude auth status --text")

# OpenCode usage
terminal(command="opencode stats")
terminal(command="opencode stats --days 7")

# Token optimization tips
# - Use --max-turns in print mode
# - Use --effort low for simple tasks
# - Pipe input instead of reading files
# - Use --allowedTools to restrict capabilities
```

## ⚠️ Pitfalls and Troubleshooting

### Claude Code
- **PTY required for interactive mode** - Use tmux for orchestration
- **Trust and permissions dialogs** - Handle with tmux send-keys
- **Context window degradation** - Monitor with `/context` command
- **Session persistence** - Requires same directory for `--continue`
- **`--max-turns` ignored in interactive** - Only works in print mode

### Codex
- **Git repository required** - Won't run outside git dir
- **PTY mandatory** - Hangs without pty=true
- **Background cleanup** - Kill tmux sessions when done
- **OAuth vs API key** - Check both auth methods

### OpenCode
- **Wrong binary in PATH** - Use explicit path if needed
- **Don't use `/exit` command** - Opens agent selector, use Ctrl+C
- **Enter may need double press** - Once to finalize text, once to send
- **Session management** - Use `-c` or `-s` flags for resumption

### General
- **One workdir per session** - Avoid collisions in parallel work
- **Set reasonable timeouts** - Long tasks may need 180+ seconds
- **Monitor before killing** - Agents may be thinking or running tests
- **Report concrete outcomes** - Files changed, tests passing, risks remaining

## 🎯 Decision Matrix

Use this guide to choose the right agent:

| Task Scenario | Recommended Agent | Why |
|---------------|------------------|-----|
| Complex feature with deep reasoning | Claude Code | Best for multi-step logic and architecture |
| Quick bug fix or simple feature | Codex | Fast execution, full-auto mode |
| Code review (general) | Any | Choose based on availability |
| Security-focused review | Claude Code | Deepest reasoning and analysis |
| Performance optimization | Codex | Fast iteration and testing |
| PR review with specific requirements | OpenCode | Flexible provider options |
| Batch processing multiple issues | Codex | Best for parallel operations |
| Cost-sensitive tasks | OpenCode | Provider-agnostic, often cheaper |
| Team coordination with quality gates | Kanban + Any | Hermes maintains oversight |

## 🔄 Best Practices

1. **Start with print mode** for Claude Code - simpler and no PTY management
2. **Use worktrees/workdirs** for parallel tasks to avoid conflicts
3. **Set --max-turns** in print mode to prevent runaway loops
4. **Monitor before interrupting** - agents may be running tests or deep thinking
5. **Use structured output** when you need programmatic results
6. **Pipe known content** instead of having agents read files
7. **Clean up background processes** - kill tmux sessions and background tasks
8. **Report outcomes clearly** - what changed, what tests passed, what risks remain