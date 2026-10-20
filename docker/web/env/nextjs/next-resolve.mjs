// next-resolve.mjs: a resolve hook for single-file Next.js programs, loaded
// with node --import before main.ts. Next.js publishes no exports map, so
// Node's ES module loader finds next/server only as next/server.js, while
// every Next.js app (and lesson) writes next/server. This retries a next/*
// import that Node couldn't find with .js added.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err?.code !== "ERR_MODULE_NOT_FOUND" || !/^next\/[^.]+$/.test(specifier)) throw err;
      return nextResolve(`${specifier}.js`, context);
    }
  },
});
