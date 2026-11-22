// node --test lib/diagram.test.mjs
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { DIAGRAM_CLASSES, MARKERS, diagramNames, parseDiagram } from "./diagram.mjs";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const DESC = "The browser asks a resolver for the address, then connects to the server and sends its request, which the server answers.";
/** A valid diagram around `body`. */
const svg = (body, root = `${NS} viewBox="0 0 680 200"`) => `<svg ${root}>\n  <title>A request</title>\n  <desc>${DESC}</desc>\n${body}\n</svg>\n`;
const errorsOf = (text) => parseDiagram(text, "t").errors;
const fails = (text, pattern) => {
  const errors = errorsOf(text);
  assert.ok(errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}, got ${JSON.stringify(errors)}`);
};

test("a valid diagram becomes a tree, its title and desc lifted out", () => {
  const { data, errors, warnings } = parseDiagram(
    `<?xml version="1.0" encoding="UTF-8"?>\n<!-- drawn by hand -->\n` +
      svg(`  <rect class="dg-hot" x="20" y="80" width="140" height="56" rx="8"/>
  <text class="dg-on-hot" x="90" y="108" dy="0.35em" text-anchor="middle">Server
    <tspan class="dg-note" x="90" dy="1.3em">it &amp; &#x41;&#66; &lt;3</tspan>
  </text>
  <g transform="translate(10, 0)"><path class="dg-flow dg-dashed" d="M160 120 H516" marker-end="url(#arrow-flow)"/></g>
  <line class="dg-line" x1="0" y1="0" x2="10" y2="0" marker-start="url(#dot)" marker-end="url(#arrow)"/>`),
    "request"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(data.name, "request");
  assert.equal(data.title, "A request");
  assert.equal(data.desc, DESC);
  assert.equal(data.width, 680);
  assert.equal(data.height, 200);
  assert.deepEqual(data.nodes[0], { tag: "rect", attrs: { class: "dg-hot", x: "20", y: "80", width: "140", height: "56", rx: "8" }, children: [] });
  // Indentation around a tspan goes, the text inside it keeps its spaces,
  // and entities are decoded to plain text.
  assert.deepEqual(data.nodes[1].children, ["Server", { tag: "tspan", attrs: { class: "dg-note", x: "90", dy: "1.3em" }, children: ["it & AB <3"] }]);
  assert.equal(data.nodes[2].children[0].attrs["marker-end"], "url(#arrow-flow)");
  assert.equal(/"tag":"(title|desc)"/.test(JSON.stringify(data.nodes)), false);
});

test("spaces between inline pieces of text stay", () => {
  const { data } = parseDiagram(svg(`<text x="0" y="20">GET <tspan class="dg-code">/tasks</tspan> now</text>`));
  assert.deepEqual(data.nodes[0].children, ["GET ", { tag: "tspan", attrs: { class: "dg-code" }, children: ["/tasks"] }, " now"]);
});

test("XML outside the subset is an error, with its line and column", () => {
  fails(`<!DOCTYPE svg>\n${svg("<rect/>")}`, /^line 1, column 1: no DOCTYPE/);
  fails(svg(`<text><![CDATA[x]]></text>`), /line 4, column 7: no CDATA/);
  fails(svg(`<?pi x?><rect/>`), /no processing instructions/);
  fails(`\n<?xml version="1.0"?>${svg("<rect/>")}`, /only at the very start/);
  fails(svg(`<svg:rect/>`), /no namespace prefixes/);
  fails(svg(`<rect x="1" x="2"/>`), /duplicate attribute x/);
  fails(svg(`<rect x=1/>`), /must be in quotes/);
  fails(svg(`<text>&nbsp;</text>`), /unknown entity &nbsp;/);
  fails(svg(`<text>a & b</text>`), /&amp; for a literal ampersand/);
  fails(svg(`<g><rect/></text>`), /<\/text> closes <g>/);
  fails(svg(`<rect/>`) + "<rect/>", /nothing may follow/);
  fails(svg(`<g>loose words</g>`), /text inside <g>/);
  fails(svg(`<rect/>stray`), /text outside a title, desc, text, or tspan/);
});

test("the root takes the namespace and a viewBox, nothing else", () => {
  fails(svg("<rect/>", `viewBox="0 0 680 200"`), /needs xmlns/);
  fails(svg("<rect/>", `${NS}`), /needs viewBox/);
  fails(svg("<rect/>", `${NS} viewBox="0 0 680 200" width="680"`), /no width on <svg>/);
  fails(svg("<rect/>", `${NS} viewBox="0 0 680 200" xmlns:xlink="http://www.w3.org/1999/xlink"`), /takes only xmlns and viewBox/);
  fails(svg("<rect/>", `${NS} viewBox="0 0 900 200"`), /the width is 900/);
  fails(svg("<rect/>", `${NS} viewBox="0 0 680 80"`), /the height is 80/);
  fails(svg("<rect/>", `${NS} viewBox="10 0 680 200"`), /"0 0 W H"/);
  fails(`<g ${NS}><title>x</title><desc>${DESC}</desc><rect/></g>`, /the root must be <svg>/);
  const { warnings } = parseDiagram(svg("<rect/>", `${NS} viewBox="0 0 600 190"`));
  assert.equal(warnings.length, 2);
});

test("the title and desc come first, once each, as plain text", () => {
  fails(`<svg ${NS} viewBox="0 0 680 200"><desc>${DESC}</desc><title>x</title><rect/></svg>`, /first element inside <svg> must be <title>/);
  fails(`<svg ${NS} viewBox="0 0 680 200"><title>x</title><rect/></svg>`, /second element inside <svg> must be <desc>/);
  fails(svg(`<title>again</title>`), /only one <title>/);
  fails(`<svg ${NS} viewBox="0 0 680 200"><title>x</title><desc>Too short to say it all.</desc><rect/></svg>`, /the desc is 6 words/);
  fails(`<svg ${NS} viewBox="0 0 680 200"><title>${"x".repeat(101)}</title><desc>${DESC}</desc><rect/></svg>`, /101 characters/);
  fails(`<svg ${NS} viewBox="0 0 680 200"><title>a <tspan>b</tspan></title><desc>${DESC}</desc><rect/></svg>`, /plain text only/);
});

test("only the listed elements, and nothing that sets colors, fonts, or ids", () => {
  for (const tag of ["defs", "marker", "use", "a", "image", "style", "script", "foreignObject", "clipPath", "filter", "linearGradient", "animate"]) {
    fails(svg(`<${tag}/>`), new RegExp(`no <${tag}>`));
  }
  fails(svg(`<rect id="box"/>`), /no ids/);
  fails(svg(`<rect style="fill:red"/>`), /no style/);
  fails(svg(`<rect fill="red"/>`), /no fill/);
  fails(svg(`<line stroke-width="3"/>`), /no stroke-width/);
  fails(svg(`<rect opacity="0.5"/>`), /no opacity/);
  fails(svg(`<text font-size="20">x</text>`), /no font-size/);
  fails(svg(`<rect onclick="x()"/>`), /no event handlers/);
  fails(svg(`<path href="#x"/>`), /no links/);
  fails(svg(`<text xml:space="preserve">x</text>`), /no xml:space/);
  fails(svg(`<rect cx="1"/>`), /no cx on <rect>/);
  fails(svg(`<tspan>x</tspan>`), /goes inside a <text>/);
  fails(svg(`<text><rect/></text>`), /no <rect> inside a <text>/);
  fails(svg(`<rect><circle/></rect>`), /<rect> holds nothing/);
});

test("attribute values follow their rules", () => {
  fails(svg(`<rect x="10px"/>`), /x="10px" must be a plain number/);
  fails(svg(`<text dy="1.3rem">x</text>`), /an em value/);
  fails(svg(`<path d="M0 0 L10 10 url(x)"/>`), /path commands/);
  fails(svg(`<polyline points="0,0 a,b"/>`), /numbers, commas, and spaces/);
  fails(svg(`<g transform="matrix(1 0 0 1 0 0)"/>`), /translate, rotate, or scale/);
  fails(svg(`<text text-anchor="left">x</text>`), /start, middle, or end/);
  fails(svg(`<line class="dg-line" marker-end="url(#other)"/>`), /marker-end must be/);
  fails(svg(`<line class="dg-line" marker-start="url(#arrow)"/>`), /marker-start must be url\(#dot\)/);
  fails(svg(`<line class="dg-line" marker-end="url(#arrow-flow)"/>`), /ends a dg-flow line/);
  fails(svg(`<line class="dg-flow" marker-end="url(#arrow)"/>`), /a dg-flow line ends in url\(#arrow-flow\)/);
  fails(svg(`<rect marker-end="url(#arrow)"/>`), /no marker-end on <rect>/);
});

test("classes come from the vocabulary and suit their element", () => {
  fails(svg(`<rect class="box"/>`), /unknown class "box"/);
  fails(svg(`<rect class="dg-line"/>`), /doesn't go on <rect>/);
  fails(svg(`<text class="dg-box">x</text>`), /doesn't go on <text>/);
  fails(svg(`<rect class="dg-box dg-hot"/>`), /at a time/);
  fails(svg(`<line class="dg-dashed"/>`), /dg-dashed goes with/);
  fails(svg(`<path class="dg-box dg-line"/>`), /don't mix/);
  fails(svg(`<text class="dg-note dg-faint">x</text>`), /at a time/);
  fails(svg(`<text class="dg-code dg-heading">x</text>`), /not both/);
  fails(svg(`<g class="dg-box"/>`), /doesn't go on <g>/);
  assert.deepEqual(errorsOf(svg(`<text class="dg-code dg-on-hot">x</text><path class="dg-hot" d="M0 0 H10 V10 Z"/>`)), []);
  for (const [name, tags] of Object.entries(DIAGRAM_CLASSES)) assert.ok(name.startsWith("dg-") && tags.length, name);
});

test("size limits", () => {
  fails(svg(`<rect/>`.repeat(401)), /elements, at most 400/);
  fails(svg(`${"<g>".repeat(8)}<rect/>${"</g>".repeat(8)}`), /nested 9 deep/);
  fails(svg(`<!-- ${"x".repeat(33 * 1024)} --><rect/>`), /at most 32 KB/);
  fails(svg(``), /draws nothing/);
});

test("the markers are the three the renderer defines", () => {
  assert.deepEqual(MARKERS.map((m) => m.id), ["arrow", "arrow-flow", "dot"]);
});

test("diagramNames finds each diagram fence, as written", () => {
  const md = "Intro.\n\n```diagram dns-Lookup\nA caption.\n```\n\n```bash\necho diagram\n```\n\n```Diagram url-parts\n```\n\n```diagrams nope\n```";
  assert.deepEqual(diagramNames(md), ["dns-Lookup", "url-parts"]);
  assert.deepEqual(diagramNames(undefined), []);
});

test("every diagram in content/learn parses cleanly", () => {
  const learn = path.join(import.meta.dirname, "..", "content", "learn");
  for (const course of readdirSync(learn, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const dir = path.join(learn, course.name, "diagrams");
    let files = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".svg"));
    } catch {
      continue;
    }
    for (const file of files) {
      const { errors } = parseDiagram(readFileSync(path.join(dir, file), "utf8"), file.slice(0, -4));
      assert.deepEqual(errors, [], `${course.name}/diagrams/${file}`);
    }
  }
});
