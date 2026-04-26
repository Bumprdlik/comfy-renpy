import { graph } from '../graph/state';
import { apiPutGraph } from '../api';

export const statusEl = document.getElementById('save-status') as HTMLElement;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export let lastSavedJson: string | null = null;
export function setLastSavedJson(json: string): void { lastSavedJson = json; }

export function scheduleSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  statusEl.textContent = '●';
  statusEl.style.color = '#f39c12';
  saveTimer = setTimeout(() => { void saveGraph(); }, 2000);
}

export async function saveGraph(): Promise<void> {
  if (saveTimer !== null) clearTimeout(saveTimer);
  const data = graph.serialize();
  const json = JSON.stringify(data);
  if (json === lastSavedJson) {
    statusEl.textContent = '✓ uloženo';
    statusEl.style.color = '#2ecc71';
    return;
  }
  try {
    await apiPutGraph(data);
    lastSavedJson = json;
    statusEl.textContent = '✓ uloženo';
    statusEl.style.color = '#2ecc71';
  } catch (e) {
    statusEl.textContent = '✗ chyba';
    statusEl.style.color = '#e74c3c';
    console.error('Chyba uložení:', e);
  }
}
