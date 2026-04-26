const STORAGE_KEY = 'comfy-export-snapshot';

// nodeId → JSON of exported properties at last export
let snapshot: Record<string, string> = {};

function exportableProps(node: LGraphNode): Record<string, unknown> | null {
  const p = node.properties;
  switch (node.type) {
    case 'renpy/location':
      return { id: p['id'], label: p['label'], description: p['description'], exits: p['exits'] };
    case 'renpy/event':
      return {
        id: p['id'], location_id: p['location_id'], trigger: p['trigger'],
        trigger_label: p['trigger_label'], prerequisite: p['prerequisite'],
        time: p['time'], repeatable: p['repeatable'], priority: p['priority'],
      };
    case 'renpy/quest':
      return { id: p['id'], title: p['title'], description: p['description'], stages: p['stages'] };
    default:
      return null;
  }
}

export function saveExportSnapshot(nodes: LGraphNode[]): void {
  snapshot = {};
  for (const n of nodes) {
    const id = String(n.properties['id'] ?? '');
    if (!id) continue;
    const props = exportableProps(n);
    if (props) snapshot[id] = JSON.stringify(props);
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* ignore */ }
}

export function loadExportSnapshot(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) snapshot = JSON.parse(raw) as Record<string, string>;
  } catch { /* ignore */ }
}

export function isDirty(node: LGraphNode): boolean {
  const id = String(node.properties['id'] ?? '');
  if (!id) return false;
  const saved = snapshot[id];
  if (saved === undefined) return false; // never exported — not dirty yet
  return JSON.stringify(exportableProps(node)) !== saved;
}
