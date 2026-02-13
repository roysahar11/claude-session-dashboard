---
name: pin
description: Pin the current Claude Code session to keep it alive in the session dashboard after exit. Pinned sessions can be resumed later from the dashboard. Run again to unpin.
allowed-tools:
  - Bash(node *)
---

# /pin — Pin or Unpin Current Session

Toggle the pin status of the current session in the session dashboard.

**Pinned sessions** stay visible in the dashboard after you exit Claude, so you can resume them later by clicking "Resume" in the dashboard.

**Unpinned sessions** get archived when you exit — they disappear from the main dashboard view (but remain searchable in the archive).

## What to do

Run this command, replacing `${CLAUDE_SESSION_ID}` with the actual session ID from the environment:

```bash
node "{{INSTALL_DIR}}/dist/pin.js" "${CLAUDE_SESSION_ID}"
```

Report the output to the user. The script will confirm whether the session was pinned or unpinned.
