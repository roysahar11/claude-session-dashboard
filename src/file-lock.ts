import * as fs from "fs";
import * as path from "path";

const LOCK_TIMEOUT_MS = 5000;
const RETRY_INTERVAL_MS = 20;

export class FileLock {
  private lockDir: string;

  constructor(filePath: string) {
    this.lockDir = filePath + ".lock";
  }

  async acquire(): Promise<void> {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        fs.mkdirSync(this.lockDir);
        // Write our PID for stale detection
        fs.writeFileSync(path.join(this.lockDir, "pid"), String(process.pid));
        return;
      } catch (err: any) {
        if (err.code === "EEXIST") {
          // Check if the lock holder is still alive
          if (this.isStale()) {
            this.forceRelease();
            continue;
          }
          await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
        } else {
          throw err;
        }
      }
    }

    // Timeout — force acquire
    this.forceRelease();
    fs.mkdirSync(this.lockDir);
    fs.writeFileSync(path.join(this.lockDir, "pid"), String(process.pid));
  }

  release(): void {
    try {
      const pidFile = path.join(this.lockDir, "pid");
      if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
      fs.rmdirSync(this.lockDir);
    } catch {
      // Already released
    }
  }

  private isStale(): boolean {
    try {
      const pidFile = path.join(this.lockDir, "pid");
      const pid = parseInt(fs.readFileSync(pidFile, "utf8"), 10);
      if (isNaN(pid)) return true;
      // Check if process is alive
      try {
        process.kill(pid, 0);
        return false; // Process exists
      } catch {
        return true; // Process gone — stale lock
      }
    } catch {
      return true; // Can't read PID — stale
    }
  }

  private forceRelease(): void {
    try {
      const pidFile = path.join(this.lockDir, "pid");
      if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
      fs.rmdirSync(this.lockDir);
    } catch {
      // Best effort
    }
  }
}
