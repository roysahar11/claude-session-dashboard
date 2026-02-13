#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const INSTALL_DIR = path.dirname(__filename);
const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");
const SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
const SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
const IS_WINDOWS = process.platform === "win32";

function log(msg) {
  console.log(`  ${msg}`);
}

function logStep(msg) {
  console.log(`\n=> ${msg}`);
}

console.log("╔══════════════════════════════════════════════╗");
console.log("║   Claude Code Session Dashboard — Install    ║");
console.log("╚══════════════════════════════════════════════╝");
console.log(`\n   Directory: ${INSTALL_DIR}`);
console.log(`   Platform:  ${process.platform} (${os.arch()})`);

// ── Step 1: Install dependencies ───────────────────────────────────

logStep("Installing dependencies...");
execSync("npm install --production", { cwd: INSTALL_DIR, stdio: "inherit" });

// Dev deps needed for build
logStep("Installing dev dependencies for build...");
execSync("npm install", { cwd: INSTALL_DIR, stdio: "inherit" });

logStep("Building...");
execSync("npm run build", { cwd: INSTALL_DIR, stdio: "inherit" });

// ── Step 2: Create data directory ──────────────────────────────────

logStep("Setting up data directory...");
const dataDir = path.join(INSTALL_DIR, "data");
fs.mkdirSync(dataDir, { recursive: true });
const sessionsFile = path.join(dataDir, "sessions.json");
if (!fs.existsSync(sessionsFile)) {
  fs.writeFileSync(
    sessionsFile,
    JSON.stringify({ version: 1, sessions: {} }, null, 2)
  );
  log("Created sessions.json");
} else {
  log("sessions.json already exists");
}

// ── Step 3: Generate SKILL.md from templates ───────────────────────

logStep("Generating skill files...");
const skills = ["pin", "sessions"];
for (const skill of skills) {
  const templatePath = path.join(
    INSTALL_DIR,
    "skills",
    skill,
    "SKILL.template.md"
  );
  const outputPath = path.join(INSTALL_DIR, "skills", skill, "SKILL.md");

  if (!fs.existsSync(templatePath)) {
    log(`WARNING: Template not found: ${templatePath}`);
    continue;
  }

  let content = fs.readFileSync(templatePath, "utf8");
  // Replace placeholder with actual install path
  content = content.replace(/\{\{INSTALL_DIR\}\}/g, INSTALL_DIR);
  fs.writeFileSync(outputPath, content);
  log(`Generated skills/${skill}/SKILL.md`);
}

// ── Step 4: Create skill symlinks ──────────────────────────────────

logStep("Linking skills into Claude Code...");
fs.mkdirSync(SKILLS_DIR, { recursive: true });

for (const skill of skills) {
  const target = path.join(INSTALL_DIR, "skills", skill);
  const link = path.join(SKILLS_DIR, skill);

  // Remove existing link or directory
  try {
    const stat = fs.lstatSync(link);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(link);
    } else if (stat.isDirectory()) {
      fs.rmSync(link, { recursive: true });
    }
  } catch {
    // Doesn't exist — fine
  }

  // Create symlink (junction on Windows — no admin needed)
  fs.symlinkSync(target, link, IS_WINDOWS ? "junction" : "dir");
  log(`${skill} → ${link}`);
}

// ── Step 5: Configure hooks in settings.json ───────────────────────

logStep("Configuring hooks...");

const hookCommand = `node "${path.join(INSTALL_DIR, "dist", "hook-handler.js")}"`;
const hookEvents = ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd"];

let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
} catch {
  // File doesn't exist or is invalid — start fresh
}

if (!settings.hooks) {
  settings.hooks = {};
}

for (const event of hookEvents) {
  if (!Array.isArray(settings.hooks[event])) {
    settings.hooks[event] = [];
  }

  // Check if our hook already exists (by command match)
  const exists = settings.hooks[event].some((group) =>
    group.hooks?.some((h) => h.command === hookCommand)
  );

  if (!exists) {
    // Remove any old session-dashboard hooks (different install path)
    settings.hooks[event] = settings.hooks[event].filter(
      (group) =>
        !group.hooks?.some((h) =>
          typeof h.command === "string" &&
          h.command.includes("session-dashboard") &&
          h.command.includes("hook-handler")
        )
    );

    settings.hooks[event].push({
      matcher: "",
      hooks: [{ type: "command", command: hookCommand }],
    });
    log(`Added hook for ${event}`);
  } else {
    log(`Hook for ${event} already configured`);
  }
}

fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");

// ── Done ───────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════╗");
console.log("║              Installation complete!           ║");
console.log("╚══════════════════════════════════════════════╝");
console.log(`
  The dashboard will auto-start when you open a Claude Code session.

  Manual commands:
    Start:  node "${path.join(INSTALL_DIR, "dist", "server.js")}"
    Open:   http://localhost:3457

  Skills installed:
    /pin       — Pin current session to keep it in the dashboard
    /sessions  — Start/stop/status of the dashboard server

  Configuration:
    ${path.join(INSTALL_DIR, "config.json")}
`);
