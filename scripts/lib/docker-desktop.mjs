// Docker Desktop, started when it's installed but not running, so npm run up
// (and add, remove, choose, and uninstall) need no "open Docker first" step.
// On a Mac it starts hidden, in the background. Linux's Docker is a service,
// started its own way, so there this does nothing. HU_START_DOCKER=0 turns it
// off, and HU_DOCKER_WAIT_MS sets how long to wait (2 minutes).
// Only Node's own modules here: npm run up loads it before npm install.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Whether Docker's engine answers. */
export function dockerAnswers() {
  const r = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { stdio: "pipe", encoding: "utf8", timeout: 15_000 });
  return !r.error && r.status === 0;
}

/** Docker Desktop's app on this computer, or null. */
function desktopApp() {
  if (process.platform === "darwin") {
    return ["/Applications/Docker.app", path.join(os.homedir(), "Applications", "Docker.app")].find((p) => existsSync(p)) ?? null;
  }
  if (process.platform === "win32") {
    const exe = path.join(process.env.ProgramFiles || "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe");
    return existsSync(exe) ? exe : null;
  }
  return null;
}

/** Whether Docker Desktop is installed here (its app, set up or not). */
export const hasDockerDesktop = () => desktopApp() !== null;

/**
 * Starts Docker Desktop when it's installed and its engine isn't answering,
 * and waits for the engine. `say` hears what's going on. Resolves to whether
 * the engine answers now (false where there's no Docker Desktop to start).
 */
export async function startDockerDesktop(say = () => {}) {
  if (process.env.HU_START_DOCKER === "0") return false;
  const app = desktopApp();
  if (!app) return false;
  say("Starting Docker Desktop, which can take a minute…");
  if (process.platform === "darwin") {
    // -g: in the background, -j: hidden (no window, the engine starts anyway).
    if (spawnSync("open", ["-g", "-j", "-a", app]).status !== 0) return false;
  } else {
    try {
      spawn(app, [], { detached: true, stdio: "ignore" }).unref();
    } catch {
      return false;
    }
  }
  const end = Date.now() + (Number(process.env.HU_DOCKER_WAIT_MS) || 120_000);
  while (Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (dockerAnswers()) return true;
  }
  return false;
}
