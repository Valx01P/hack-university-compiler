// A workspace's identity (architecture §4.2.1). A workspace is named by its
// scope, which says where it lives in the app:
//
//   learn/<course>/<lesson>/<part>/practice       a part's Your workspace tab
//   learn/<course>/<lesson>/<part>/example-<k>    a part's run example k
//   learn/<course>/<lesson>/<part>/examples       a part's examples, in templates that share one
//   challenge/<course>/<id>                       /<course>/challenges/<id>
//   playground/<course>                           /<course>/playground
//   playground/<course>/<n>                       /<course>/playground/<n>, scratch playgrounds 1 to 3
//   sandbox/<course>/<template>                   /<course>/playground/<template>, a codebase to play in
//
// Its id is "w" and the first 10 characters of the lowercase base32 of
// SHA-256(scope), so the route (and the tab) alone find the same workspace
// after a reload, in a second tab, or from a copied link, and nothing in the
// address names it. The id is safe as a Docker name, a PostgreSQL
// identifier, and a folder name. Next.js, the runner, and the verifiers all
// compute it here. Plain JavaScript on node:crypto, so it runs on the server
// only: pages pass the id they computed to the browser.

import { createHash } from "node:crypto";

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** A workspace id: "w" and 10 lowercase base32 characters. */
export const WORKSPACE_ID = /^w[a-z2-7]{10}$/;

// A course, lesson, challenge, or template id: lowercase words and dashes.
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SCOPE = new RegExp(
  "^(?:" +
    [
      `learn/${SLUG}/${SLUG}/[1-9]\\d{0,2}/(?:practice|examples|example-[1-3])`,
      `challenge/${SLUG}/${SLUG}`,
      `playground/${SLUG}(?:/[1-3])?`,
      `sandbox/${SLUG}/${SLUG}`,
    ].join("|") +
    ")$"
);

/** Whether a string is a scope (a workspace's name, above). */
export function isScope(scope) {
  return typeof scope === "string" && scope.length <= 256 && SCOPE.test(scope);
}

/** The workspace id of a scope. */
export function workspaceId(scope) {
  if (!isScope(scope)) throw new Error(`Not a workspace scope: ${JSON.stringify(scope)}`);
  const digest = createHash("sha256").update(scope, "utf8").digest();
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 10) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length === 10) break;
    value &= (1 << bits) - 1;
  }
  return `w${out}`;
}

/** What a scope names: its kind, course, and the rest of its parts. */
export function parseScope(scope) {
  if (!isScope(scope)) return null;
  const parts = scope.split("/");
  switch (parts[0]) {
    case "learn": {
      const tab = parts[4];
      const example = /^example-(\d)$/.exec(tab);
      return {
        kind: "learn",
        course: parts[1],
        lesson: parts[2],
        part: Number(parts[3]),
        tab: example ? "example" : tab,
        example: example ? Number(example[1]) : null,
      };
    }
    case "challenge":
      return { kind: "challenge", course: parts[1], challenge: parts[2] };
    case "playground":
      return { kind: "playground", course: parts[1], slot: parts[2] ? Number(parts[2]) : null };
    case "sandbox":
      return { kind: "sandbox", course: parts[1], template: parts[2] };
    default:
      return null;
  }
}

/** The scope a playground route opens: /<course>/playground is the course's
    playground, /<course>/playground/<n> scratch playground n (1 to 3), and
    /<course>/playground/<template> that codebase as a sandbox. Template ids
    never consist only of digits, so the two forms never collide. */
export function playgroundScope(course, slot) {
  if (slot === undefined || slot === null || slot === "") return `playground/${course}`;
  return /^[1-3]$/.test(String(slot)) ? `playground/${course}/${slot}` : `sandbox/${course}/${slot}`;
}

/** The scope of a Learn part's tab: Your workspace, or run example k. */
export function learnScope(course, lesson, part, tab) {
  return `learn/${course}/${lesson}/${part}/${tab === "practice" ? "practice" : tab}`;
}
