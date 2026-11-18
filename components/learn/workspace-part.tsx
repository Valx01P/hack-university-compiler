"use client";

import dynamic from "next/dynamic";

/**
 * The Learn part in the workspace format (components/ide/workspace-part-view.tsx,
 * the IDE where the editor was), as a chunk of its own. The part page holds
 * every format, and most parts are single-file, so this keeps the IDE's code
 * and styles (the explorer, the terminal, the file icons) to the parts that
 * show it. It still renders on the server, with its chunks and styles linked
 * from the page, so it paints the same.
 */
export const WorkspacePartView = dynamic(() => import("@/components/ide/workspace-part-view").then((m) => m.WorkspacePartView));
