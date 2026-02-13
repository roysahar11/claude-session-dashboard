import * as path from "path";
import * as net from "net";
import { spawn } from "child_process";
import { withLock } from "./sessions-store";
import { HookInput, Session } from "./types";
import * as fs from "fs";

const CONFIG_PATH = path.join(__dirname, "..", "config.json");

function readConfig(): { terminal: string; port: number } {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { terminal: "Terminal", port: 3457 };
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    // If stdin is a TTY or empty, resolve quickly
    if (process.stdin.isTTY) resolve("");
    setTimeout(() => resolve(data), 2000);
  });
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: "127.0.0.1" });
    s.on("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    setTimeout(() => {
      s.destroy();
      resolve(false);
    }, 500);
  });
}

function autoStartServer(port: number): void {
  const serverPath = path.join(__dirname, "server.js");
  const logPath = path.join(__dirname, "..", "data", "server.log");
  const out = fs.openSync(logPath, "a");
  const child = spawn("node", [serverPath], {
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, PORT: String(port) },
  });
  child.unref();
}

function now(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) return;

  let input: HookInput;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }

  const { hook_event_name, session_id } = input;
  if (!session_id) return;

  const cwd = input.cwd || process.cwd();
  const projectName = cwd === process.env.HOME ? "~" : path.basename(cwd);

  await withLock((data) => {
    const existing = data.sessions[session_id];

    switch (hook_event_name) {
      case "SessionStart": {
        const hookSource = (input.source as string) || "startup";

        // Archive stale "active" sessions (no activity for 2+ minutes)
        const staleThreshold = Date.now() - 2 * 60 * 1000;
        for (const s of Object.values(data.sessions)) {
          if (
            s.status === "active" &&
            s.session_id !== session_id &&
            new Date(s.last_activity_at).getTime() < staleThreshold
          ) {
            s.status = s.pinned ? "pinned" : "archived";
            s.ended_at = now();
          }
        }

        if (existing && existing.pinned) {
          // Resuming a pinned session
          existing.status = "active";
          existing.last_activity_at = now();
          existing.ended_at = null;
          existing.source = hookSource;
        } else if (!existing) {
          const session: Session = {
            session_id,
            cwd,
            project_name: projectName,
            status: "active",
            summary: "",
            started_at: now(),
            last_activity_at: now(),
            ended_at: null,
            source: hookSource,
            prompt_count: 0,
            stop_count: 0,
            transcript_path: input.transcript_path || "",
            pinned: false,
          };
          data.sessions[session_id] = session;
        } else {
          // Existing session restarting
          existing.status = "active";
          existing.last_activity_at = now();
          existing.ended_at = null;
        }
        break;
      }

      case "UserPromptSubmit": {
        if (existing) {
          existing.prompt_count++;
          existing.last_activity_at = now();
          const prompt = input.prompt || "";
          if (prompt.length > 15) {
            existing.summary = prompt.slice(0, 200);
          }
        }
        break;
      }

      case "Stop": {
        if (existing) {
          existing.stop_count++;
          existing.last_activity_at = now();
        }
        break;
      }

      case "SessionEnd": {
        if (existing) {
          existing.ended_at = now();
          existing.last_activity_at = now();
          if (existing.pinned) {
            existing.status = "pinned";
          } else {
            existing.status = "archived";
          }
        }
        break;
      }
    }
  });

  // Auto-start server on SessionStart
  if (hook_event_name === "SessionStart") {
    const config = readConfig();
    const inUse = await isPortInUse(config.port);
    if (!inUse) {
      autoStartServer(config.port);
    }
  }
}

main().catch(() => process.exit(0));
