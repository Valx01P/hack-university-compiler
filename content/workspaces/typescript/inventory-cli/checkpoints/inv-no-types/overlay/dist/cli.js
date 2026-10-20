import { commands, isCommandName } from "./commands/index.js";
import { JsonStore } from "./storage/json-store.js";
import { loadConfig } from "./config.js";
import { CliError } from "./errors.js";
const [name, ...rest] = process.argv.slice(2);
if (name === undefined || !isCommandName(name)) {
    console.error("Usage: stockroom <command> [options]");
    process.exitCode = 2;
}
else {
    const config = loadConfig(process.env, process.cwd());
    try {
        process.exitCode = await commands[name].run(rest, { store: new JsonStore(config.dataPath), clock: config.clock, lowStock: config.lowStock, out: (line) => console.log(line) });
    }
    catch (error) {
        if (!(error instanceof CliError))
            throw error;
        console.error(error.message);
        process.exitCode = error.exitCode;
    }
}
