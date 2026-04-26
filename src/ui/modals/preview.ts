import { graph, getSelectedNode } from '../../graph/state';
import { apiPreviewRpy } from '../../api';

const overlay     = document.getElementById('preview-overlay')  as HTMLElement;
const filenameEl  = document.getElementById('preview-filename') as HTMLElement;
const contentEl   = document.getElementById('preview-content')  as HTMLElement;

export async function previewRpy(): Promise<void> {
  const node = getSelectedNode();
  if (!node) { alert('Nejprve klikni na Location nebo Event uzel.'); return; }
  if (!['renpy/location', 'renpy/event'].includes(node.type)) {
    alert('Preview je dostupný jen pro Location a Event uzly.');
    return;
  }
  try {
    const data = await apiPreviewRpy(graph.serialize(), node.id);
    filenameEl.textContent = data.filename ? '→ ' + data.filename : '';
    contentEl.textContent  = data.content ?? '';
    overlay.classList.add('open');
  } catch (e) {
    alert('Chyba preview: ' + (e as Error).message);
  }
}

export function closePreview(): void {
  overlay.classList.remove('open');
}

export function previewOverlayClick(e: MouseEvent): void {
  if (e.target === overlay) closePreview();
}
