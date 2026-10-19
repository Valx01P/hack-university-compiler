// Lets ES modules import the packages installed globally in this runtime, the
// way CommonJS require() already finds them through lib/node. The node
// runtime's run script loads it for .mjs programs only (see ./run).
import { register } from "node:module";

register("./hu-global-imports-hooks.mjs", import.meta.url);
