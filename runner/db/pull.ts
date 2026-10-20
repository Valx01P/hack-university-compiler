/**
 * The databases the project courses' codebases use, ahead of time: npm run
 * add (and npm run up) downloads them with a course that needs them, and npm
 * run remove deletes them when no course you kept needs them. The runner
 * pulls the same pinned images on demand anyway, so downloading here only
 * saves the wait the first time a workspace starts.
 *
 *   node runner/db/pull.ts postgres mongo            # download them (skips any already here)
 *   node runner/db/pull.ts --remove postgres mongo   # delete them (their data volumes stay)
 *   node runner/db/pull.ts --status                  # which are here
 */
import type Docker from "dockerode";
import { MONGO_IMAGES, POSTGRES_IMAGE, mongo8Runs } from "./services.ts";

type Image = { ref: string; tag: string };

/** Postgres, and the Mongo this machine's kernel can run (8.0, else 7.0). */
async function imagesFor(docker: Docker): Promise<Record<"postgres" | "mongo", Image>> {
  const info = await docker.info();
  const mongo = mongo8Runs(String(info.KernelVersion ?? "")) ? MONGO_IMAGES["8.0"] : MONGO_IMAGES["7.0"];
  return { postgres: POSTGRES_IMAGE, mongo };
}

/** Whether the image is here. (Its reported size depends on Docker's image
    store, so the sizes people see come from lib/components.json.) */
async function present(docker: Docker, image: Image): Promise<boolean> {
  try {
    await docker.getImage(image.ref).inspect();
    return true;
  } catch {
    return false;
  }
}

if (import.meta.main) {
  const { connect, resolveEndpoint } = await import("../docker.ts");
  const argv = process.argv.slice(2);
  const remove = argv.includes("--remove");
  const status = argv.includes("--status");
  const names = argv.filter((a) => !a.startsWith("--"));
  for (const name of names) {
    if (name !== "postgres" && name !== "mongo") {
      console.error(`There is no database named ${name}. They are postgres and mongo.`);
      process.exit(2);
    }
  }
  const docker = connect(resolveEndpoint());
  try {
    await docker.ping();
  } catch {
    console.error("Docker isn't running. Start Docker Desktop, then try again.");
    process.exit(1);
  }
  const images = await imagesFor(docker);
  const wanted = (names.length ? names : ["postgres", "mongo"]) as ("postgres" | "mongo")[];
  if (status) {
    for (const name of wanted) console.log(`${images[name].tag}  ${(await present(docker, images[name])) ? "downloaded" : "not downloaded"}`);
    process.exit(0);
  }

  for (const name of wanted) {
    const image = images[name];
    if (remove) {
      // Its stopped server goes first (the runner makes a new one when a
      // course needs it again). Its data volume stays, so nothing is lost.
      for (const c of await docker.listContainers({ all: true, filters: { ancestor: [image.ref] } })) {
        try {
          await docker.getContainer(c.Id).remove({ force: c.State !== "running" });
        } catch {
          /* running, or gone already */
        }
      }
      try {
        await docker.getImage(image.ref).remove();
        console.log(`   ✓ removed ${image.tag}`);
      } catch (err) {
        const msg = (err as Error).message;
        console.log(/no such image/i.test(msg) ? `   ✓ ${image.tag} wasn't downloaded` : `   ! couldn't remove ${image.tag}: ${msg}`);
      }
      continue;
    }
    if (await present(docker, image)) {
      console.log(`   ✓ ${image.tag} is already here`);
      continue;
    }
    console.log(`   Downloading ${image.tag}...`);
    try {
      const stream = await docker.pull(image.ref);
      await new Promise<void>((resolve, reject) => docker.modem.followProgress(stream, (err: Error | null) => (err ? reject(err) : resolve())));
      console.log(`   ✓ ${image.tag}`);
    } catch (err) {
      console.error(`\n✗ Couldn't download ${image.tag}: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}
