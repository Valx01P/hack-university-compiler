// Types for lib/workspace-layers.mjs (plain JavaScript so the build script
// and the server share it).

export interface LayerEntry {
  path: string;
  type: "file" | "dir";
  size?: number;
  mode: number;
  sha256?: string;
}

export function workspacesRoot(root: string): string;
export function templateDir(root: string, course: string, template: string): string | null;
export function readTemplate(root: string, course: string, template: string): Record<string, unknown> | null;
export function listTemplates(root: string, course: string): string[];
export function checkpointLayers(root: string, course: string, template: string, checkpoint?: string | null): string[];
export function layerSource(root: string, course: string, template: string, layer: string): { dir: string; deletes: string[]; notes: boolean };
export function layerTree(root: string, course: string, template: string, layers: string[]): Map<string, LayerEntry>;
export function sortedEntries(tree: Map<string, LayerEntry>): LayerEntry[];
export function treeHash(tree: Map<string, LayerEntry>): string;
