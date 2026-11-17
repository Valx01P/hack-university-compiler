// Lets ES modules import the packages installed globally in this runtime, the
// way CommonJS require() already finds them through lib/node, and gives them
// require() too, for the program's own file, so one that's a module only for
// awaiting at its top level (lib/source-file.mjs isEsModule) can still
// require what it needs. The node runtime's run script loads it for .mjs
// programs only (see ./run).
import { createRequire, register } from "node:module";

register("./hu-global-imports-hooks.mjs", import.meta.url);
globalThis.require ??= createRequire(process.argv[1]);
