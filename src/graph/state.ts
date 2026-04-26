export const graph = new LiteGraph.LGraph();

export let duplicateIds = new Set<string>();

let _selectedNode: LGraphNode | null = null;
export function getSelectedNode(): LGraphNode | null { return _selectedNode; }
export function setSelectedNode(n: LGraphNode | null): void { _selectedNode = n; }

export function refreshDuplicateIds(): void {
  const counts: Record<string, number> = {};
  for (const node of graph._nodes || []) {
    const id = node.properties['id'] as string | undefined;
    if (id) counts[id] = (counts[id] || 0) + 1;
  }
  duplicateIds = new Set(
    Object.entries(counts).filter(([, c]) => c > 1).map(([id]) => id)
  );
  if (duplicateIds.size) graph.setDirtyCanvas(true, true);
}
