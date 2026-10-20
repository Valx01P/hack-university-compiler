# Stockroom

The command-line tool a small shop uses to keep track of its stock, in `data/inventory.json`.
Node 26 runs the TypeScript directly (no build step), and TypeScript 7 checks it.

Everything is in one file for now: `src/cli.ts` holds the item types and rules, the checks
that the data file is valid, reading and writing it, the plain-text table, and the commands.

```sh
node src/cli.ts list --low
node src/cli.ts report
```

| Command | What it does |
| --- | --- |
| `list [--low] [--json]` | Shows the items, or only those at or below `STOCKROOM_LOW_STOCK` (5) |
| `add <sku> --name <name> --qty <n> --price <12.50> --category <name>` | Adds an item. SKUs look like `MUG-001` |
| `remove <sku>` | Removes an item (exit code 3 if there is no such SKU) |
| `report [--format table\|csv\|json]` | Units and stock value per category, and the total |

`npm run cli -- <command>` runs the same thing. The tests in `test/cli.test.ts` run the CLI
as a child process against a copy of `fixtures/seed.json`: `node --test "test/**/*.test.ts"`.
