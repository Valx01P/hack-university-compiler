// TypeScript, TSX, and JSX for the tokenizer (lib/tokenize.mjs), read by
// Lezer's JavaScript parser (the one the editors already load), so generics,
// template literals, decorators, and JSX come out right. Its highlight tags
// map onto the same token types as the regex languages: keywords, strings,
// numbers, comments, calls and definitions as `fn`, and escapes. Like the
// regex languages, a name followed by its arguments is `fn` (calls, methods,
// `new Map<K, V>()`), the predefined types are keywords, and escapes are
// strings in `String.raw`. Interpolation's `${` and `}` take the keyword
// color, and JSX's `{/* ... */}` is one comment, braces included, so hiding
// comments takes the braces too.

import { parser } from "@lezer/javascript";
import { getStyleTags, styleTags, tagHighlighter, tags as t } from "@lezer/highlight";

const DIALECTS = { typescript: "ts", tsx: "ts jsx", jsx: "jsx" };
const parsers = {};
// Template literal types (`/${string}`) are strings too.
const EXTRA_TAGS = styleTags({ TemplateType: t.special(t.string) });

/** Whether Lezer reads this language (a canonical id, see tokenize). */
export const isLezerLanguage = (language) => language in DIALECTS;

// Tag to type, most specific tag first. Names, properties, and types are
// plain unless their place in the tree says otherwise (see refine).
const HIGHLIGHTER = tagHighlighter([
  { tag: t.comment, class: "comment" },
  { tag: [t.string, t.regexp], class: "string" },
  { tag: t.escape, class: "escape" },
  { tag: t.number, class: "number" },
  { tag: [t.keyword, t.bool, t.tagName], class: "keyword" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.attributeName], class: "fn" },
  { tag: t.special(t.brace), class: "interpolation" },
  { tag: t.typeName, class: "type" },
  { tag: t.variableName, class: "variable" },
]);

// The predefined types, colored like keywords (Go's int and string are too).
const PRIMITIVES = new Set([
  "string", "number", "boolean", "bigint", "symbol", "object", "any", "unknown", "never", "void", "undefined", "null",
]);

function baseType(cls, text) {
  const kind = cls.split(" ")[0];
  if (kind === "interpolation") return "keyword";
  if (kind === "type") return PRIMITIVES.has(text) ? "keyword" : null;
  if (kind === "variable") return text === "undefined" ? "keyword" : null;
  return kind;
}

/** The node that names what an expression calls: `f`, `obj.method`, `f<T>`. */
function calleeName(node) {
  if (!node) return null;
  if (node.name === "VariableName") return node;
  if (node.name === "MemberExpression") return node.lastChild?.name === "PropertyName" ? node.lastChild : null;
  if (node.name === "InstantiationExpression") return calleeName(node.firstChild);
  return null;
}

/** What the tags can't tell: where a name sits in the tree. */
function refine(tree, code, types) {
  const fill = (type, from, to) => types.fill(type, from, to);
  tree.iterate({
    enter(ref) {
      const node = ref.node;
      switch (ref.name) {
        case "Decorator": {
          // `@name`, `@a.b`, or `@name(args)`: the at sign and the name.
          const expr = node.lastChild;
          const end = expr?.name === "CallExpression" ? expr.firstChild?.to : expr?.to;
          fill("fn", node.from, end ?? node.to);
          break;
        }
        case "MethodDeclaration":
        case "MethodType":
        case "Property": {
          // A method's name: the definition that comes before its parameters.
          const def = node.getChild("PropertyDefinition") ?? node.getChild("PrivatePropertyDefinition");
          let next = def?.nextSibling;
          while (next && next.name === "TypeParamList") next = next.nextSibling;
          if (def && next?.name === "ParamList") fill("fn", def.from, def.to);
          break;
        }
        case "NewExpression": {
          const name = node.getChild("ArgList") && calleeName(node.firstChild?.nextSibling);
          if (name) fill("fn", name.from, name.to);
          break;
        }
        case "CallExpression": {
          // `f<T>(x)`: the tags only know a plain `f(x)`.
          const callee = node.firstChild;
          const name = callee?.name === "InstantiationExpression" && calleeName(callee);
          if (name) fill("fn", name.from, name.to);
          break;
        }
        case "Escape": {
          // No escapes in String.raw`...`.
          const tagged = node.parent?.name === "TemplateString" && node.parent.parent;
          if (tagged?.name === "TaggedTemplateExpression") {
            const tag = tagged.firstChild;
            if (tag && code.slice(tag.from, tag.to).replace(/\s+/g, "") === "String.raw") fill("string", node.from, node.to);
          }
          break;
        }
        case "JSXEscape": {
          // `{/* ... */}` holds nothing but a comment: it's one comment.
          const kids = [];
          for (let k = node.firstChild; k; k = k.nextSibling) kids.push(k.name);
          const comments = kids.filter((k) => k === "BlockComment" || k === "LineComment").length;
          if (!comments || kids.some((k) => !["{", "}", "BlockComment", "LineComment", "⚠"].includes(k))) break;
          // The closing brace can end up in the JSX text after it.
          const close = /^\s*\}/.exec(code.slice(node.lastChild.to));
          const end = kids.includes("}") ? node.to : close ? node.lastChild.to + close[0].length : -1;
          if (end > 0) fill("comment", node.from, end);
          break;
        }
      }
    },
  });
}

/** TypeScript, TSX, or JSX source as typed pieces (null type = plain text). */
export function lezerTokens(code, language) {
  parsers[language] ??= parser.configure({ dialect: DIALECTS[language], props: [EXTRA_TAGS] });
  const tree = parsers[language].parse(code);
  const types = new Array(code.length).fill(null);
  // Where each escape starts, so two in a row stay two tokens.
  const escapes = new Set();
  // Each node's tags, inner nodes over outer ones, as highlightTree reads
  // them. Not through highlightTree itself: where the parser stores part of
  // a long file's tree in blocks, its cursor (@lezer/common 1.5.3) can test
  // a rule like `FunctionDeclaration/VariableDefinition` against a node's
  // neighbor instead of its parent, so a function's name comes out plain,
  // or a plain name after a long call comes out a call. A node knows its
  // real parent.
  tree.iterate({
    enter(ref) {
      const node = ref.node;
      const rule = getStyleTags(node);
      const cls = rule && HIGHLIGHTER.style(rule.tags);
      const type = cls ? baseType(cls, code.slice(node.from, node.to)) : null;
      types.fill(type, node.from, node.to);
      if (type === "escape") escapes.add(node.from);
    },
  });
  refine(tree, code, types);
  // Runs of one type become one token.
  const tokens = [];
  for (let i = 0; i < code.length; ) {
    let j = i + 1;
    while (j < code.length && types[j] === types[i] && !(types[j] === "escape" && escapes.has(j))) j++;
    tokens.push({ type: types[i], text: code.slice(i, j) });
    i = j;
  }
  return tokens;
}
