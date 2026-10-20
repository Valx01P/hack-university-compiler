// node --import ./tests/ide/register.mjs: the hooks in alias-hooks.mjs.
import { register } from "node:module";

register("./alias-hooks.mjs", import.meta.url);
