import { graph, setSelectedNode } from '../graph/state';
import { renderPanel } from './panel';

function getNodeLabel(node: LGraphNode): string {
  const p = node.properties;
  return String(p['label'] ?? p['name'] ?? p['title'] ?? p['id'] ?? node.type.replace('renpy/', ''));
}

export function initSearch(lgCanvas: LGraphCanvas): void {
  const input    = document.getElementById('search-input')    as HTMLInputElement | null;
  const dropdown = document.getElementById('search-dropdown') as HTMLElement | null;
  if (!input || !dropdown) return;

  function refresh(): void {
    const q = input!.value.toLowerCase().trim();
    if (!q) { dropdown!.hidden = true; dropdown!.innerHTML = ''; return; }

    const matches = (graph._nodes ?? []).filter(n => {
      if (n.type === 'renpy/note') return false;
      const label = getNodeLabel(n).toLowerCase();
      const id    = String(n.properties['id'] ?? '').toLowerCase();
      return label.includes(q) || id.includes(q);
    }).slice(0, 8);

    if (matches.length === 0) { dropdown!.hidden = true; dropdown!.innerHTML = ''; return; }

    dropdown!.innerHTML = matches.map(n => {
      const label = getNodeLabel(n);
      const type  = n.type.replace('renpy/', '');
      return `<div class="search-item" data-nid="${n.id}">` +
        `<span class="search-label">${label}</span>` +
        `<span class="search-tag ${type}">${type}</span>` +
        `</div>`;
    }).join('');
    dropdown!.hidden = false;
  }

  function selectResult(item: HTMLElement): void {
    const nid  = parseInt(item.dataset.nid ?? '');
    const node = graph.getNodeById(nid);
    if (!node) return;
    lgCanvas.centerOnNode(node);
    lgCanvas.selectNode(node, false);
    setSelectedNode(node);
    renderPanel(node);
    input!.value = '';
    dropdown!.hidden = true;
    input!.blur();
  }

  input.addEventListener('input', refresh);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; dropdown!.hidden = true; }
    if (e.key === 'Enter') {
      const first = dropdown!.querySelector('.search-item') as HTMLElement | null;
      if (first) selectResult(first);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const first = dropdown!.querySelector('.search-item') as HTMLElement | null;
      if (first) (first as HTMLElement).focus();
    }
  });

  dropdown.addEventListener('mousedown', (e) => {
    const item = (e.target as HTMLElement).closest('.search-item') as HTMLElement | null;
    if (!item) return;
    e.preventDefault();
    selectResult(item);
  });

  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('#search-wrap')) {
      dropdown!.hidden = true;
    }
  });
}
