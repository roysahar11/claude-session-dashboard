---
name: sessions
description: "Manage Claude Code session dashboard. Start/stop the dashboard server, check status, or view active sessions."
argument-hint: "[start|stop|status]"
allowed-tools:
  - Bash(node *)
  - Bash(lsof *)
  - Bash(kill *)
  - Bash(open *)
  - Bash(start *)
  - Bash(xdg-open *)
  - Bash(cat *)
  - Bash(netstat *)
  - Bash(taskkill *)
---

# /sessions — Manage Session Dashboard

Manage the session dashboard server that tracks and displays all your Claude Code sessions.

## Configuration

- Install directory: `{{INSTALL_DIR}}`
- Server script: `{{INSTALL_DIR}}/dist/server.js`
- Sessions data: `{{INSTALL_DIR}}/data/sessions.json`
- Default port: 3457

## Commands

The user provides one of: `start`, `stop`, or `status`. Default to `status` if no argument.

### start

1. Check if the server is already running on port 3457:
   - macOS/Linux: `lsof -ti:3457`
   - Windows: `netstat -ano | findstr :3457`
2. If not running, start it in the background:
   ```bash
   node "{{INSTALL_DIR}}/dist/server.js" &
   ```
   On Windows, use `start /b node "{{INSTALL_DIR}}/dist/server.js"`.
   Wait 1 second, then confirm it started.
3. Open the dashboard in the browser:
   - macOS: `open http://localhost:3457`
   - Windows: `start http://localhost:3457`
   - Linux: `xdg-open http://localhost:3457`

### stop

1. Find the server process on port 3457:
   - macOS/Linux: `lsof -ti:3457`
   - Windows: `netstat -ano | findstr :3457` (extract PID)
2. If running, kill it:
   - macOS/Linux: `kill $(lsof -ti:3457)`
   - Windows: `taskkill /PID <pid> /F`
3. Confirm it stopped.

### status

1. Check if the server is running (see port check above).
2. Read the sessions data and report a summary:
   ```bash
   cat "{{INSTALL_DIR}}/data/sessions.json"
   ```
   Report: how many active, pinned, and archived sessions; which projects have active sessions; whether the dashboard server is running.
