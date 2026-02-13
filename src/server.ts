import express from "express";
import * as fs from "fs";
import * as path from "path";
import { exec, execSync } from "child_process";
import { readSessions, getSessionsPath, withLock } from "./sessions-store";

const CONFIG_PATH = path.join(__dirname, "..", "config.json");
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PLATFORM = process.platform;

function readConfig(): { terminal: string; port: number } {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { terminal: "auto", port: 3457 };
  }
}

function detectTerminal(): string {
  if (PLATFORM === "darwin") return "Terminal";
  if (PLATFORM === "win32") {
    // Prefer Windows Terminal if available
    try {
      execSync("where wt", { stdio: "ignore" });
      return "Windows Terminal";
    } catch {}
    return "cmd";
  }
  // Linux — try common terminals
  for (const t of ["gnome-terminal", "konsole", "xfce4-terminal", "x-terminal-emulator"]) {
    try {
      execSync(`which ${t}`, { stdio: "ignore" });
      return t;
    } catch {}
  }
  return "xterm";
}

const config = readConfig();
const PORT = parseInt(process.env.PORT || String(config.port), 10);
const app = express();

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// Get sessions
app.get("/api/sessions", (req, res) => {
  const data = readSessions();
  const showAll = req.query.all === "true";
  const search = (req.query.search as string || "").toLowerCase();

  let sessions = Object.values(data.sessions);

  if (!showAll) {
    sessions = sessions.filter((s) => s.status !== "archived");
  }

  if (search) {
    sessions = sessions.filter(
      (s) =>
        s.summary.toLowerCase().includes(search) ||
        s.project_name.toLowerCase().includes(search) ||
        s.cwd.toLowerCase().includes(search)
    );
  }

  const statusOrder: Record<string, number> = { active: 0, pinned: 1, archived: 2 };
  sessions.sort((a, b) => {
    const so = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    if (so !== 0) return so;
    return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
  });

  res.json(sessions);
});

// SSE events
const clients: Set<express.Response> = new Set();

app.get("/api/events", (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("data: connected\n\n");
  clients.add(res);
  _req.on("close", () => clients.delete(res));
});

function broadcast(): void {
  const data = readSessions();
  let sessions = Object.values(data.sessions).filter((s) => s.status !== "archived");
  const statusOrder: Record<string, number> = { active: 0, pinned: 1, archived: 2 };
  sessions.sort((a, b) => {
    const so = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    if (so !== 0) return so;
    return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
  });
  const payload = JSON.stringify(sessions);
  for (const client of clients) {
    client.write(`data: ${payload}\n\n`);
  }
}

// Watch sessions.json for changes
const sessionsPath = getSessionsPath();
let lastMtime = 0;
setInterval(() => {
  try {
    const stat = fs.statSync(sessionsPath);
    const mtime = stat.mtimeMs;
    if (mtime !== lastMtime) {
      lastMtime = mtime;
      broadcast();
    }
  } catch {}
}, 500);

// Resume a session in terminal
app.post("/api/resume/:id", (req, res) => {
  const sessionId = req.params.id;
  const data = readSessions();
  const session = data.sessions[sessionId];

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const cwd = session.cwd;
  const terminalApp = config.terminal === "auto" ? detectTerminal() : config.terminal;

  openTerminal(cwd, sessionId, terminalApp, (err) => {
    if (err) {
      res.status(500).json({ error: "Failed to open terminal: " + err.message });
    } else {
      res.json({ ok: true });
    }
  });
});

function openTerminal(
  cwd: string,
  sessionId: string,
  terminal: string,
  cb: (err: Error | null) => void
): void {
  const resumeCmd = `claude --resume ${sessionId}`;

  if (PLATFORM === "darwin") {
    openTerminalMac(cwd, resumeCmd, terminal, cb);
  } else if (PLATFORM === "win32") {
    openTerminalWindows(cwd, resumeCmd, terminal, cb);
  } else {
    openTerminalLinux(cwd, resumeCmd, terminal, cb);
  }
}

// ── macOS ──────────────────────────────────────────────────────────

function openTerminalMac(
  cwd: string,
  resumeCmd: string,
  terminal: string,
  cb: (err: Error | null) => void
): void {
  const fullCmd = `cd ${escapeShellArg(cwd)} && ${resumeCmd}`;
  let script: string;

  if (terminal === "iTerm2") {
    script = `
      tell application "iTerm2"
        create window with default profile
        tell current session of current window
          write text ${escapeAppleScriptString(fullCmd)}
        end tell
      end tell
    `;
  } else if (terminal === "Warp") {
    script = `
      tell application "Warp"
        activate
      end tell
      delay 0.5
      tell application "System Events"
        tell process "Warp"
          keystroke "t" using command down
          delay 0.3
          keystroke ${escapeAppleScriptString(fullCmd)}
          key code 36
        end tell
      end tell
    `;
  } else {
    script = `
      tell application "Terminal"
        do script ${escapeAppleScriptString(fullCmd)}
        activate
      end tell
    `;
  }

  exec(`osascript -e ${escapeShellArg(script)}`, (err) => cb(err));
}

// ── Windows ────────────────────────────────────────────────────────

function openTerminalWindows(
  cwd: string,
  resumeCmd: string,
  terminal: string,
  cb: (err: Error | null) => void
): void {
  let cmd: string;

  if (terminal === "Windows Terminal") {
    cmd = `wt new-tab -d "${cwd}" cmd /k "${resumeCmd}"`;
  } else if (terminal === "PowerShell") {
    const psCmd = `Set-Location '${cwd}'; ${resumeCmd}`;
    cmd = `start powershell -NoExit -Command "${psCmd}"`;
  } else {
    // cmd.exe (default)
    cmd = `start "" cmd /k "cd /d "${cwd}" && ${resumeCmd}"`;
  }

  exec(cmd, { shell: "cmd.exe" }, (err) => cb(err));
}

// ── Linux ──────────────────────────────────────────────────────────

function openTerminalLinux(
  cwd: string,
  resumeCmd: string,
  terminal: string,
  cb: (err: Error | null) => void
): void {
  const fullCmd = `cd ${escapeShellArg(cwd)} && ${resumeCmd}`;
  const bashWrap = `bash -c ${escapeShellArg(fullCmd + "; exec bash")}`;
  let cmd: string;

  switch (terminal) {
    case "gnome-terminal":
      cmd = `gnome-terminal -- ${bashWrap}`;
      break;
    case "konsole":
      cmd = `konsole --noclose -e ${bashWrap}`;
      break;
    case "xfce4-terminal":
      cmd = `xfce4-terminal -e ${bashWrap}`;
      break;
    case "x-terminal-emulator":
      cmd = `x-terminal-emulator -e ${bashWrap}`;
      break;
    default:
      cmd = `xterm -hold -e ${bashWrap}`;
      break;
  }

  exec(cmd, (err) => cb(err));
}

// ── Escaping helpers ───────────────────────────────────────────────

function escapeShellArg(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function escapeAppleScriptString(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

// Toggle pin from dashboard
app.post("/api/pin/:id", async (req, res) => {
  const sessionId = req.params.id;
  try {
    await withLock((data) => {
      const session = data.sessions[sessionId];
      if (!session) return;
      session.pinned = !session.pinned;
      if (session.pinned && session.status === "archived") {
        session.status = "pinned";
      } else if (!session.pinned && session.status === "pinned") {
        session.status = "archived";
      }
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to toggle pin" });
  }
});

// Delete a session
app.delete("/api/sessions/:id", async (req, res) => {
  const sessionId = req.params.id;
  try {
    await withLock((data) => {
      delete data.sessions[sessionId];
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete session" });
  }
});

// PID file for management
const pidPath = path.join(__dirname, "..", "data", "server.pid");
fs.writeFileSync(pidPath, String(process.pid));

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`Session dashboard running at http://localhost:${PORT}`);
});

function cleanup() {
  try { fs.unlinkSync(pidPath); } catch {}
  server.close();
  process.exit(0);
}

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
