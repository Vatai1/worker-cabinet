---
name: hermes-config-sync
description: "Sync and back up Hermes Agent configuration across devices via git, exports, and manual file transfer."
version: 1.0.0
author: agent
created_by: agent
metadata:
  hermes:
    tags: [hermes, sync, backup, git, config, portability]
---

# Hermes Config Sync

Keep Hermes Agent settings consistent across multiple machines or backed up for disaster recovery.

## What to Sync

| File/Dir | Purpose | Sync? |
|----------|---------|-------|
| `config.yaml` | Main configuration | Yes |
| `.env` | API keys and secrets | Yes (private repo only) |
| `auth.json` | OAuth tokens and credential pools | Yes (private repo only) |
| `skills/` | Installed skills | Yes |
| `SOUL.md` | Personality override | Yes |
| `memories/` | Persistent memory files | Yes |
| `cron/` | Cron job definitions | Optional |

## What NOT to Sync

These are machine-local and will cause conflicts or corruption:

- `state.db` — session store (SQLite, machine-specific)
- `sessions/` — session transcripts and routing
- `logs/` — runtime logs
- `hermes-agent/` — source code (reinstalled per machine)
- `cache/`, `audio_cache/`, `image_cache/` — temporary caches
- `*.lock`, `*.bak.*` — lockfiles and backups
- `processes.json` — running process state
- `sandboxes/` — code execution sandboxes
- `lsp/` — LSP server data
- `profiles/` — profiles can be synced separately via `hermes profile export/import`

## Templates

- `templates/dot-gitignore` — Ready-made `.gitignore` for `~/.hermes/`. Copy into place: `cp templates/dot-gitignore ~/.hermes/.gitignore`

## Method 1: Git (Recommended)

### Setup

1. Create a `.gitignore` in `~/.hermes/` (use `templates/dot-gitignore` from this skill).
2. `cd ~/.hermes && git init && git add -A && git commit -m "initial hermes config"`
3. Add a private remote: `git remote add origin <private-repo-url>`
4. Push: `git push -u origin main`

### Pitfall: gh CLI protocol mismatch

`gh auth status` may report `Git operations protocol: ssh` even when you added an HTTPS remote.
If `git push` fails with `could not read Username for 'https://github.com'`, switch to SSH:

```bash
git remote set-url origin git@github.com:<user>/<repo>.git
```

### Sync Scripts

Two helper scripts live in `~/.hermes/` after setup:

- `sync.sh` — macOS / Linux (bash)
- `sync.ps1` — Windows (PowerShell)

Both support the same actions:

| Action | What it does |
|--------|-------------|
| *(none)* | Pull then commit & push if changes exist |
| `push` | Commit all changes and push |
| `pull` | Pull from remote |
| `status` | Show uncommitted changes and ahead/behind counts |
| `force` | Commit all changes and force-push (overwrites remote) |

```bash
# macOS / Linux
~/.hermes/sync.sh              # auto: pull + push
~/.hermes/sync.sh push         # only push
~/.hermes/sync.sh pull         # only pull
~/.hermes/sync.sh status       # check state
~/.hermes/sync.sh force        # force push

# Windows (PowerShell)
~\.hermes\sync.ps1              # auto: pull + push
~\.hermes\sync.ps1 push         # only push
~\.hermes\sync.ps1 pull         # only pull
~\.hermes\sync.ps1 status       # check state
~\.hermes\sync.ps1 force        # force push
```

### Day-to-day workflow

```bash
# Quick sync (pull + push):
~/.hermes/sync.sh

# On another machine:
~/.hermes/sync.sh pull
```

Or manual:
```bash
cd ~/.hermes && git add -A && git commit -m "sync: <description>" && git push
cd ~/.hermes && git pull
```

### Cloning on a new machine

If `~/.hermes` already exists, back it up first:

**macOS / Linux:**
```bash
mv ~/.hermes ~/.hermes.bak
git clone <repo-url> ~/.hermes
chmod +x ~/.hermes/sync.sh
```

**Windows (PowerShell):**
```powershell
Rename-Item "$env:USERPROFILE\.hermes" "$env:USERPROFILE\.hermes.bak"
git clone <repo-url> "$env:USERPROFILE\.hermes"
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

If `.hermes` does not exist (fresh install), skip the backup/rename step.

Then reinstall Hermes (`hermes doctor --fix` to verify).

## Method 2: Profile Export/Import

```bash
# Export
hermes profile export default

# Import on another machine
hermes profile import hermes-default-<date>.tar.gz
```

Transfers the full profile: config, .env, skills, memory, cron jobs.

## Method 3: Selective File Sync

For cloud-sync folders (iCloud, Dropbox) or rsync:

```bash
rsync -av --exclude-from='templates/dot-gitignore' ~/.hermes/ ~/Library/Mobile\ Documents/hermes-config/
```

Or use symlinks for individual files:

```bash
ln -s ~/Library/Mobile\ Documents/hermes-config/config.yaml ~/.hermes/config.yaml
ln -s ~/Library/Mobile\ Documents/hermes-config/.env ~/.hermes/.env
```

## Pitfall: Windows execution policy

On Windows, PowerShell blocks unsigned scripts by default. Fix once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Or run with explicit bypass:

```powershell
powershell -ExecutionPolicy Bypass -File ~\.hermes\sync.ps1
```

## Security Notes

- `.env` and `auth.json` contain API keys. **Always use private repos.**
- `hermes profile export` creates unencrypted tar.gz — protect the archive.
- After cloning on a new machine, run `hermes doctor --fix` to verify setup.
