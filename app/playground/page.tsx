import type { Metadata } from "next";
import { CompilerShell } from "@/components/chrome/compiler-shell";
import { InlineScript } from "@/components/inline-script";
import { PlaygroundApp } from "@/components/playground/playground-app";
import { IDE_GATE } from "@/lib/url-state";
import { workspaceProps } from "@/lib/workspaces";

export const metadata: Metadata = { title: "Playground" };

/**
 * /playground: the one playground, a folder on this computer with an
 * Explorer, an editor, and a terminal (components/playground). Prerendered,
 * painted from its template's starting tree, and never a homepage target:
 * it doesn't set the hu-lang cookie, so / still reopens the last compiler.
 * Each course's old /<course>/playground redirects here (next.config.ts).
 */
export default async function PlaygroundPage() {
  const workspace = await workspaceProps("playground");
  return (
    <CompilerShell>
      {/* Its tabs and tree always come back from this browser, so the
          region stays hidden until they have (the rail and the bar show). */}
      <InlineScript html={IDE_GATE("data-restore-editor")} />
      <PlaygroundApp props={workspace} />
    </CompilerShell>
  );
}
