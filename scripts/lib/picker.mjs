// The terminal checklist npm run up shows on a first run (and npm run choose
// any time): every component with what it adds on disk, the running total,
// and the free space on this disk. Arrow keys move, Space ticks, Enter goes.
// Only Node's own modules here: it runs before npm install.
import readline from "node:readline";
import { CATALOG, COMPONENTS, GROUPS, and, defaults, formatMB, freeMB, heldBy, removePlan, sizeMB, uses } from "./components.mjs";

const ESC = "\u001b[";
const bold = (s) => `${ESC}1m${s}${ESC}22m`;
const dim = (s) => `${ESC}2m${s}${ESC}22m`;
const accent = (s) => `${ESC}36m${s}${ESC}39m`;
const good = (s) => `${ESC}32m${s}${ESC}39m`;
const warnc = (s) => `${ESC}33m${s}${ESC}39m`;

/**
 * Lets you tick components. `selected` starts ticked and `installed` is marked
 * (unticking one of those means removing it, which the caller confirms).
 * Resolves to the ticked ids, or null when you quit.
 */
export function chooseComponents({ selected, installed = new Set(), intro = "" }) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return Promise.resolve(null);
  const ticked = new Set(selected);
  const ids = COMPONENTS.map((c) => c.id);
  let at = 0;
  const out = process.stdout;
  const free = freeMB();

  const labelWidth = Math.max(...COMPONENTS.map((c) => c.label.length), CATALOG.app.label.length) + 2;

  /** What ticking this one adds on disk, next to everything else ticked. */
  const cost = (id) => {
    const others = [...ticked].filter((t) => t !== id);
    return sizeMB([...others, id]) - sizeMB(others);
  };

  function render() {
    const rows = [];
    rows.push("");
    rows.push(`  ${bold("Hack University")} ${dim("·")} ${bold("choose what to install")}`);
    if (intro) rows.push(`  ${dim(intro)}`);
    rows.push(`  ${dim("↑ ↓ move   space tick   a all   n none   d defaults   enter install   q quit")}`);
    rows.push("");
    rows.push(`    ${good("●")} ${CATALOG.app.label.padEnd(labelWidth)}${formatMB(CATALOG.app.mb).padStart(8)}  ${dim("always: " + CATALOG.app.detail)}`);
    for (const g of GROUPS) {
      rows.push("");
      rows.push(`  ${dim(g.label.toUpperCase())}`);
      for (const c of COMPONENTS.filter((x) => x.group === g.id)) {
        const i = ids.indexOf(c.id);
        const here = i === at;
        const on = ticked.has(c.id);
        const box = on ? good("◉") : dim("○");
        const pointer = here ? accent("❯") : " ";
        const label = here ? bold(c.label.padEnd(labelWidth)) : c.label.padEnd(labelWidth);
        const size = formatMB(cost(c.id)).padStart(8);
        let note = "";
        const held = installed.has(c.id) && !on ? heldBy(c.id, [...ticked]) : [];
        if (held.length) note = dim(`stays: ${and(held)} ${uses(held)} the same parts`);
        else if (installed.has(c.id)) note = on ? dim("installed") : warnc("installed, will be removed");
        else if (on) note = dim("will be installed");
        if (c.courses && !note) note = dim(c.databases ? `with ${c.databases.map((d) => (d === "postgres" ? "PostgreSQL" : "MongoDB")).join(" and ")}` : "");
        rows.push(`  ${pointer} ${box} ${label}${on || here ? size : dim(size)}  ${note}`);
      }
    }
    const chosen = [...ticked];
    const total = CATALOG.app.mb + sizeMB(chosen);
    const keepInstalled = chosen.filter((id) => installed.has(id));
    const download = sizeMB(chosen) - sizeMB(keepInstalled);
    const removing = [...installed].filter((id) => !ticked.has(id));
    const freed = removing.length ? removePlan(removing, [...new Set([...installed, ...ticked])]).mb : 0;
    rows.push("");
    rows.push(`  ${bold("Total on disk")}  ${bold(formatMB(total))}${dim(", the app included")}`);
    const lines = [`To download now: ${formatMB(download)}`];
    if (freed > 0) lines.push(`to remove: ${formatMB(freed)}`);
    if (free !== null) lines.push(`free on this disk: ${formatMB(free)}`);
    rows.push(`  ${dim(lines.join("   "))}`);
    if (free !== null && download > free) rows.push(`  ${warnc("That's more than this disk has free.")}`);
    rows.push(`  ${dim("Sizes count shared parts once (the compiler sandbox, the Node image, PostgreSQL).")}`);
    rows.push(`  ${dim("Add or remove parts later with npm run add, npm run remove, or npm run choose.")}`);
    out.write(`${ESC}H${ESC}2J${rows.join("\n")}\n`);
  }

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    out.write(`${ESC}?1049h${ESC}?25l`);
    const finish = (result) => {
      process.stdin.off("keypress", onKey);
      out.off("resize", render);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      out.write(`${ESC}?25h${ESC}?1049l`);
      resolve(result);
    };
    const onKey = (str, key = {}) => {
      if ((key.ctrl && key.name === "c") || key.name === "q" || key.name === "escape") return finish(null);
      if (key.name === "return" || key.name === "enter") return finish([...ticked]);
      if (key.name === "up" || key.name === "k") at = (at - 1 + ids.length) % ids.length;
      else if (key.name === "down" || key.name === "j" || key.name === "tab") at = (at + 1) % ids.length;
      else if (key.name === "space" || str === "x") {
        const id = ids[at];
        if (ticked.has(id)) ticked.delete(id);
        else ticked.add(id);
      } else if (str === "a") ids.forEach((id) => ticked.add(id));
      else if (str === "n") ticked.clear();
      else if (str === "d") {
        ticked.clear();
        defaults().forEach((id) => ticked.add(id));
      } else return;
      render();
    };
    process.stdin.on("keypress", onKey);
    out.on("resize", render);
    render();
  });
}

/** A yes or no question; no answer (or no terminal) is `fallback`. */
export function confirm(question, fallback = false) {
  if (!process.stdin.isTTY) return Promise.resolve(fallback);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const hint = fallback ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`${question} ${dim(`(${hint})`)} `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a ? a === "y" || a === "yes" : fallback);
    });
  });
}
