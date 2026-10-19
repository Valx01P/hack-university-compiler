import type Docker from "dockerode";
import { LABEL, managedFilter, type Owner } from "./docker.ts";
import type { Log } from "./log.ts";

/**
 * Every container the runner makes has an owner and a way out (invariant I8).
 *
 * - Reconcile, at startup: job containers this runner's port left behind
 *   (it was killed mid-run, say) are removed. A job never outlives the
 *   runner that started it.
 * - The reaper, every few seconds: any job in this namespace 10 s past its
 *   deadline goes, whichever runner made it, and so does any job of this
 *   port's runner from an earlier boot.
 *
 * Both act only on containers labeled hu.managed=1 in this runner's namespace,
 * never on anything else in Docker. Workspaces arrive in P1, with their own
 * rules (re-adopt the running ones, remove stopped ones after 24 hours).
 */

const GRACE_MS = 10_000;

export interface Reaped {
  removed: string[];
}

/** Removes job containers left from earlier runs on this port. */
export async function reconcile(docker: Docker, owner: Owner, log: Log): Promise<Reaped> {
  const jobs = await docker.listContainers({ all: true, filters: managedFilter(owner.ns, "job") });
  const stale = jobs.filter((c) => c.Labels[LABEL.port] === String(owner.port) && c.Labels[LABEL.runner] !== owner.boot);
  const removed = await removeAll(docker, stale, log, "reconcile");
  if (removed.length) log.info("reconcile.done", { removed: removed.length });
  return { removed };
}

/** One pass of the reaper. */
export async function reap(docker: Docker, owner: Owner, log: Log, now = Date.now()): Promise<Reaped> {
  const jobs = await docker.listContainers({ all: true, filters: managedFilter(owner.ns, "job") });
  const doomed = jobs.filter((c) => {
    const expires = Number(c.Labels[LABEL.expires]);
    const late = Number.isFinite(expires) && expires + GRACE_MS < now;
    const orphan = c.Labels[LABEL.port] === String(owner.port) && c.Labels[LABEL.runner] !== owner.boot;
    return late || orphan;
  });
  return { removed: await removeAll(docker, doomed, log, "reap") };
}

/** Removes this runner's own jobs, for a clean shutdown. */
export async function removeOwnJobs(docker: Docker, owner: Owner, log: Log): Promise<Reaped> {
  const jobs = await docker.listContainers({ all: true, filters: managedFilter(owner.ns, "job") });
  const mine = jobs.filter((c) => c.Labels[LABEL.runner] === owner.boot);
  return { removed: await removeAll(docker, mine, log, "shutdown") };
}

async function removeAll(docker: Docker, containers: Docker.ContainerInfo[], log: Log, why: string): Promise<string[]> {
  const removed: string[] = [];
  await Promise.all(
    containers.map(async (c) => {
      const name = c.Names[0]?.replace(/^\//, "") ?? c.Id;
      try {
        await docker.getContainer(c.Id).remove({ force: true, v: true });
        removed.push(name);
        log.info("container.removed", { name, why });
      } catch (err) {
        if ((err as { statusCode?: number }).statusCode !== 404) log.warn("container.remove_failed", { name, why });
      }
    })
  );
  return removed;
}
