# Claude Code Session Dashboard

A live web dashboard that automatically tracks every [Claude Code](https://docs.anthropic.com/en/docs/claude-code) session, groups them by project, and lets you resume any session from the browser.

Sessions are tracked via Claude Code hooks — every time you start a session, type a prompt, or exit, the dashboard updates in real-time. Pin important sessions to keep them visible after you exit, or let them archive automatically.

## Features

- **Automatic tracking** — hooks capture session lifecycle events with zero manual effort
- **Live dashboard** — web UI at `localhost:3457` with Server-Sent Events for real-time updates
- **Project grouping** — sessions organized by working directory
- **Pin sessions** — keep important sessions visible after exit for easy resuming
- **One-click resume** — open any session in a terminal directly from the dashboard
- **Search & archive** — find any past session by summary, project name, or path
- **Dark/light mode** — respects system preference
- **Cross-platform** — macOS, Windows, and Linux

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed and working

## Installation

Clone the repo and run the installer:

```bash
git clone https://github.com/roysahar11/claude-session-dashboard.git ~/.claude/session-dashboard
cd ~/.claude/session-dashboard
node install.mjs
```

> You can clone to any directory — the install script adapts all paths automatically.

The installer will:

1. Install dependencies and build the project
2. Generate Claude Code skills (`/pin` and `/sessions`) with correct paths
3. Symlink the skills into `~/.claude/skills/` (junctions on Windows)
4. Add session tracking hooks to `~/.claude/settings.json`

After installation, the dashboard auto-starts when you open your next Claude Code session.

### Manual start

If you want to start the dashboard manually:

```bash
cd ~/.claude/session-dashboard
npm start
```

Then open [http://localhost:3457](http://localhost:3457).

## Usage

### Dashboard

Open [http://localhost:3457](http://localhost:3457) in your browser. You'll see:

- **Active sessions** (green indicator) — currently running Claude Code sessions
- **Pinned sessions** (blue indicator) — ended sessions you've pinned for later
- **Archived sessions** (hidden by default) — toggle "Archived" to see past sessions

#### Actions

- **Resume** — click to open the session in a terminal. Available for pinned and archived sessions.
- **Pin/Unpin** — toggle whether a session stays visible after exit.
- **Remove** — delete a session from the dashboard.
- **Search** — filter sessions by summary, project, or path. Press `/` to focus.

### Skills

#### `/pin`

Run inside any Claude Code session to pin it. Pinned sessions remain visible in the dashboard after you exit, so you can resume them later.

```
> /pin
Session pinned — it will stay in the dashboard after you exit.
```

Run again to unpin.

#### `/sessions`

Manage the dashboard server from within Claude Code.

```
> /sessions start    # Start server + open browser
> /sessions stop     # Stop the server
> /sessions status   # Show running sessions summary
```

## Configuration

Edit `config.json` in the install directory:

```json
{
  "terminal": "auto",
  "port": 3457
}
```

### `terminal`

Controls which terminal app opens when you click "Resume." Set to `"auto"` to detect automatically, or specify one:

| Platform | Options |
|----------|---------|
| macOS | `Terminal`, `iTerm2`, `Warp` |
| Windows | `Windows Terminal`, `PowerShell`, `cmd` |
| Linux | `gnome-terminal`, `konsole`, `xfce4-terminal`, `xterm` |

### `port`

The port for the dashboard server. Default: `3457`. Can also be overridden with the `PORT` environment variable.

## How It Works

### Architecture

```
┌─────────────────┐     stdin (JSON)     ┌──────────────────┐
│  Claude Code     │ ──────────────────> │  Hook Handler     │
│  (hooks)         │                     │  (hook-handler.js)│
└─────────────────┘                     └────────┬─────────┘
                                                  │ writes
                                                  ▼
                                        ┌──────────────────┐
                                        │  sessions.json    │
                                        └────────┬─────────┘
                                                  │ watches (500ms)
                                                  ▼
┌─────────────────┐       SSE           ┌──────────────────┐
│  Browser         │ <───────────────── │  Express Server   │
│  (dashboard)     │ ───────────────── >│  (server.js)      │
└─────────────────┘    REST API         └──────────────────┘
```

### Hooks

The install script registers four hooks in `~/.claude/settings.json`:

| Hook | What it does |
|------|-------------|
| `SessionStart` | Creates or reactivates session. Auto-starts dashboard server if not running. |
| `UserPromptSubmit` | Updates summary (from prompt text) and increments prompt count. |
| `Stop` | Increments stop count and updates activity timestamp. |
| `SessionEnd` | Sets status to `archived` (or `pinned` if pinned). |

All hooks run the same compiled script (`dist/hook-handler.js`) which reads the event data from stdin and updates `data/sessions.json` with file locking.

### Session Lifecycle

```
SessionStart ──> active ──> SessionEnd ──> archived (hidden from dashboard)
                   │                           │
                   │  /pin                     │  Pin from dashboard
                   ▼                           ▼
                 active ──> SessionEnd ──> pinned (stays visible, resumable)
```

- **Active** — session is running right now
- **Pinned** — session ended but stays visible for easy resuming
- **Archived** — session ended, hidden from main view, searchable via "Archived" toggle

### Data

Session data is stored in `data/sessions.json`. Each session tracks:

- Session ID, working directory, project name
- Status (`active` / `pinned` / `archived`)
- Summary (first substantial prompt, up to 200 chars)
- Timestamps (started, last activity, ended)
- Prompt and stop counts
- Pin state

## File Structure

```
~/.claude/session-dashboard/
├── src/                          # TypeScript sources
│   ├── types.ts                  #   Data interfaces
│   ├── file-lock.ts              #   mkdir-based advisory file lock
│   ├── sessions-store.ts         #   Read/write sessions.json with locking
│   ├── hook-handler.ts           #   Hook event processing
│   ├── pin.ts                    #   Pin/unpin CLI utility
│   └── server.ts                 #   Express + SSE + terminal resume
├── public/
│   └── index.html                # Dashboard UI (self-contained, inline CSS/JS)
├── skills/
│   ├── pin/SKILL.template.md     # /pin skill template
│   └── sessions/SKILL.template.md# /sessions skill template
├── data/                         # Runtime data (gitignored)
│   └── sessions.json             #   Session state
├── dist/                         # Compiled JS (gitignored)
├── config.json                   # Terminal + port settings
├── install.mjs                   # Cross-platform installer
├── build.mjs                     # esbuild bundler
└── package.json
```

## Troubleshooting

### Dashboard doesn't auto-start

The dashboard server is started automatically by the `SessionStart` hook. If it's not running:

1. Check that hooks are configured: look for `session-dashboard` entries in `~/.claude/settings.json` under `hooks`
2. Start manually: `node ~/.claude/session-dashboard/dist/server.js`
3. Or from within Claude Code: `/sessions start`

### Sessions not appearing

Verify hooks are working by checking the debug log:

```bash
cat ~/.claude/session-dashboard/data/hooks.log
```

Each hook event logs a line with the event name, session ID, source, and working directory.

### Port already in use

If port 3457 is taken, either stop the existing process or change the port in `config.json` and restart.

### Resume opens wrong terminal

Set your preferred terminal in `config.json`. Use `"auto"` to let the system detect it, or specify the exact terminal app name.

## Uninstalling

1. Remove hooks from `~/.claude/settings.json` — delete the entries containing `session-dashboard`
2. Remove skill symlinks:
   ```bash
   rm ~/.claude/skills/pin
   rm ~/.claude/skills/sessions
   ```
3. Delete the project directory:
   ```bash
   rm -rf ~/.claude/session-dashboard
   ```

## License

[MIT](LICENSE)
