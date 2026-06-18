---
name: github-workflow
description: "Comprehensive GitHub workflow: authentication, PRs, issues, code review, repository management, and codebase analysis."
version: 1.1.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [GitHub, Pull-Requests, Issues, Code-Review, Repository-Management, CI/CD, Authentication, Git]
    related_skills: [github-code-review, github-pr-workflow, github-issues, github-repo-management, codebase-inspection]
---

# Comprehensive GitHub Workflow

This skill covers the complete GitHub workflow - from authentication and repository setup through pull requests, issues, code review, and codebase analysis. Each section shows both `gh` CLI (preferred) and `git` + `curl` fallback approaches.

## 🔐 Authentication Setup

All GitHub workflows start with proper authentication. The first step is always to set up auth.

### Detection Flow

```bash
# Check what's available
git --version
gh --version 2>/dev/null || echo "gh not installed"

# Check if already authenticated
gh auth status 2>/dev/null || echo "gh not authenticated"
git config --global credential.helper 2>/dev/null || echo "no git credential helper"
```

**Decision tree:**
1. If `gh auth status` shows authenticated → use `gh` for everything
2. If `gh` is installed but not authenticated → use "gh auth" method
3. If `gh` is not installed → use "git-only" method (no sudo needed)

### Method 1: Git-Only Authentication (No gh, No sudo)

This works on any machine with `git` installed. No root access needed.

#### Option A: HTTPS with Personal Access Token (Recommended)

**Step 1: Create a personal access token**
Tell the user to go to: **https://github.com/settings/tokens**
- Click "Generate new token (classic)"
- Give it a name like "hermes-agent"
- Select scopes: `repo` (full access), `workflow` (GitHub Actions), `read:org` (for org repos)
- Copy the token - it won't be shown again

**Step 2: Configure git to store the token**
```bash
# Set up the credential helper to cache credentials
git config --global credential.helper store

# Test with a remote operation that triggers auth
git ls-remote https://github.com/<their-username>/<any-repo>.git
```

**Step 3: Configure git identity**
```bash
git config --global user.name "Their Name"
git config --global user.email "their-email@example.com"
```

#### Option B: SSH Key Authentication
```bash
# Check for existing SSH keys
ls -la ~/.ssh/id_*.pub 2>/dev/null || echo "No SSH keys found"

# Generate a key if needed
ssh-keygen -t ed25519 -C "their-email@example.com" -f ~/.ssh/id_ed25519 -N ""

# Display the public key for GitHub
cat ~/.ssh/id_ed25519.pub
```

Add the public key to GitHub at **https://github.com/settings/keys**, then test:
```bash
ssh -T git@github.com
```

### Method 2: gh CLI Authentication

**Interactive Browser Login:**
```bash
gh auth login
# Select: GitHub.com, HTTPS, authenticate via browser
```

**Token-Based Login:**
```bash
echo "<TOKEN>" | gh auth login --with-token
gh auth setup-git
```

---

## 📚 Repository Management

### Creating Repositories

**With gh:**
```bash
# Create a public repo and clone it
gh repo create my-new-project --public --clone

# Private, with description and license
gh repo create my-new-project --private --description "A useful tool" --license MIT --clone
```

**With curl:**
```bash
# Create the remote repo via API
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user/repos \
  -d '{"name": "my-new-project", "description": "A useful tool", "private": false, "auto_init": true}'

# Clone it
git clone https://github.com/$GH_USER/my-new-project.git
```

### Cloning and Forking

**Cloning:**
```bash
# HTTPS (with auth configured)
git clone https://github.com/owner/repo.git

# SSH (if configured)
git clone git@github.com:owner/repo.git
```

**Forking:**
```bash
# With gh
gh repo fork owner/repo-name --clone

# With curl + git
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/repos/owner/repo-name/forks
git clone https://github.com/$GH_USER/repo-name.git
```

### Repository Information
```bash
# With gh
gh repo view owner/repo-name
gh repo list --limit 20

# With curl
curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/repos/$OWNER/$REPO
```

### Releases
```bash
# With gh
gh release create v1.0.0 --title "v1.0.0" --generate-notes
gh release download v1.0.0 --dir ./downloads

# With curl
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/repos/$OWNER/$REPO/releases \
  -d '{"tag_name": "v1.0.0", "name": "v1.0.0", "generate_release_notes": true}'
```

---

## 🐛 Issues Management

### Creating Issues

**With gh:**
```bash
gh issue create \
  --title "Login redirect ignores ?next= parameter" \
  --body "## Bug Description\nAfter logging in, users always land on /dashboard.\n\n## Steps to Reproduce\n1. Navigate to /settings while logged out\n2. Get redirected to /login?next=/settings\n3. Log in\n4. Actual: redirected to /dashboard" \
  --label "bug,backend" \
  --assignee "username"
```

**With curl:**
```bash
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/issues \
  -d '{"title": "Login redirect ignores ?next= parameter", "body": "Bug report...", "labels": ["bug", "backend"], "assignees": ["username"]}'
```

### Managing Issues
```bash
# View issues (gh)
gh issue list
gh issue list --state open --label "bug"
gh issue view 42

# View issues (curl)
curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/repos/$OWNER/$REPO/issues?state=open
```

### Issue Triage Workflow
1. List untriaged issues: `gh issue list --label "needs-triage" --state open`
2. Read and categorize each issue
3. Apply labels: `gh issue edit 42 --add-label "priority:high,bug"`
4. Assign if needed: `gh issue edit 42 --add-assignee username`
5. Comment with triage notes: `gh issue comment 42 --body "Investigated - root cause identified"`

---

## 🔀 Pull Request Workflow

### Branch Creation
```bash
# Start from clean main
git checkout main && git pull origin main

# Create a feature branch
git checkout -b feat/add-user-authentication
```

### Making Commits
```bash
# Stage files
git add src/auth.py tests/test_auth.py

# Commit with conventional format
git commit -m "feat: add JWT-based user authentication

- Add login/register endpoints
- Add User model with password hashing
- Add auth middleware for protected routes"
```

### Creating PRs
```bash
# Push branch
git push -u origin HEAD

# Create PR with gh
gh pr create \
  --title "feat: add JWT-based user authentication" \
  --body "## Summary\nAdds login and register API endpoints.\n\n## Test Plan\n- [ ] Unit tests pass\n\nCloses #42" \
  --draft

# Create PR with curl
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls \
  -d '{"title": "feat: add JWT-based user authentication", "body": "Summary...", "head": "'"$BRANCH"'", "base": "main"}'
```

### Monitoring CI Status
```bash
# With gh
gh pr checks
gh pr checks --watch

# With curl
SHA=$(git rev-parse HEAD)
curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/repos/$OWNER/$REPO/commits/$SHA/status
```

### Merging
```bash
# With gh
gh pr merge --squash --delete-branch
gh pr merge --auto --squash --delete-branch

# With curl
curl -s -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$PR_NUMBER/merge \
  -d '{"merge_method": "squash", "commit_title": "feat: add user authentication (#'"$PR_NUMBER"')"}'
```

---

## 🔍 Code Review

### Reviewing Local Changes (Pre-Push)
```bash
# Get the diff overview
git diff main...HEAD --stat
git diff main...HEAD --name-only

# Review specific files
git diff main...HEAD -- src/auth/login.py

# Check for common issues
git diff main...HEAD | grep -n "print(\|console\.log\|TODO\|FIXME\|debugger"
git diff main...HEAD | grep -in "password\|secret\|api_key\|token.*="
```

### Review Checklist
1. **Correctness** - Does the code work? Edge cases handled?
2. **Security** - No hardcoded secrets, input validation, no injection vulnerabilities
3. **Code Quality** - Clear naming, DRY, focused functions
4. **Testing** - New code tested? Happy path and errors covered?
5. **Performance** - No N+1 queries, appropriate caching
6. **Documentation** - APIs documented, "why" comments for non-obvious logic

### Reviewing PRs on GitHub
```bash
# Check out PR locally
gh pr checkout 123
# OR
git fetch origin pull/123/head:pr-123 && git checkout pr-123

# Read the diff
git diff main...HEAD

# Leave inline comments (gh)
gh pr review 123 --request-changes --body "See inline comments"

# Leave inline comments (curl)
HEAD_SHA=$(gh pr view 123 --json headRefOid --jq '.headRefOid')
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/123/comments \
  -d '{"body": "This could be simplified with a list comprehension", "path": "src/auth/login.py", "commit_id": "'"$HEAD_SHA"'", "line": 45, "side": "RIGHT"}'
```

---

## 📊 Codebase Analysis

### Lines of Code and Language Breakdown
```bash
# Install pygount if needed
pip install pygount

# Basic analysis (most common)
pygount --format=summary \
  --folders-to-skip=".git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next" \
  .

# Filter by language
pygount --suffix=py --format=summary .
pygount --suffix=js,ts --format=summary .

# Detailed file-by-file
pygount --folders-to-skip=".git,node_modules,venv" . | sort -t$'\t' -k1 -nr | head -20
```

### Interpreting Results
The summary table shows:
- **Language** - detected programming language
- **Files** - number of files of that language  
- **Code** - lines of actual code
- **Comment** - lines of comments/documentation
- **%** - percentage of total

**Important**: Always exclude .git, node_modules, and venv directories to avoid slow analysis or hangs.

---

## 🛠️ GitHub Actions

### Managing Workflows
```bash
# With gh
gh workflow list
gh run list --limit 10
gh run view <RUN_ID>
gh run view <RUN_ID> --log-failed
gh run rerun <RUN_ID>

# With curl
curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/repos/$OWNER/$REPO/actions/workflows
curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/repos/$OWNER/$REPO/actions/runs?per_page=10"
```

### Triggering Workflows
```bash
# With gh
gh workflow run ci.yml --ref main
gh workflow run deploy.yml -f environment=staging

# With curl
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/actions/workflows/$WORKFLOW_ID/dispatches \
  -d '{"ref": "main", "inputs": {"environment": "staging"}}'
```

---

## 📋 Quick Reference

| Action | gh Command | curl Endpoint |
|--------|------------|--------------|
| Auth setup | `gh auth login` | N/A (manual git config) |
| Clone repo | `gh repo clone o/r` | `git clone https://github.com/o/r.git` |
| Create issue | `gh issue create ...` | `POST /repos/o/r/issues` |
| Create PR | `gh pr create ...` | `POST /repos/o/r/pulls` |
| Review PR | `gh pr view 123` | `GET /repos/o/r/pulls/123` |
| Merge PR | `gh pr merge --squash` | `PUT /repos/o/r/pulls/N/merge` |
| Code analysis | `pygount --format=summary .` | N/A (local tool) |

---

## 🎯 Complete Workflow Example

```bash
# 1. Start with authentication
# (follow auth setup above)

# 2. Clone or create repo
gh repo clone existing/repo --depth 1
# OR
gh repo create new-project --public --clone

# 3. Branch for changes
git checkout main && git pull origin main
git checkout -b feat/new-feature

# 4. Make changes, commit, push
# (make code changes)
git add .
git commit -m "feat: add new feature"
git push -u origin HEAD

# 5. Create PR
gh pr create --title "feat: add new feature" --body "## Summary\nAdds new feature"

# 6. Monitor CI
gh pr checks --watch

# 7. Address feedback if needed
# (review code, fix issues, push)

# 8. Merge when ready
gh pr merge --squash --delete-branch

# 9. Analyze codebase changes
pygount --format=summary --folders-to-skip=".git,node_modules" .
```