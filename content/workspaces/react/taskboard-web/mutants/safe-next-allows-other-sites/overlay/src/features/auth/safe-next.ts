// Where to go after login. The ?next= value comes from the URL, which anyone can write, so only a
// path on this site is followed: "/projects/2" yes, but "//evil.example", "https://evil.example",
// and "/\evil.example" (a browser reads the backslash as a slash) would be an open redirect.
const FALLBACK = "/projects";
const HERE = "http://taskboard.invalid";

export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/")) return FALLBACK;
  return next;
}
