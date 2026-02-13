import * as fs from "fs";
import * as path from "path";
import { FileLock } from "./file-lock";
import { SessionsData } from "./types";

const DATA_DIR = path.join(__dirname, "..", "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getSessionsPath(): string {
  return SESSIONS_FILE;
}

export function readSessions(): SessionsData {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { version: 1, sessions: {} };
  }
}

export function writeSessions(data: SessionsData): void {
  ensureDataDir();
  const tmp = SESSIONS_FILE + ".tmp." + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, SESSIONS_FILE);
}

export async function withLock<T>(fn: (data: SessionsData) => T): Promise<T> {
  const lock = new FileLock(SESSIONS_FILE);
  await lock.acquire();
  try {
    const data = readSessions();
    const result = fn(data);
    writeSessions(data);
    return result;
  } finally {
    lock.release();
  }
}
