import { apiWireScript } from '../../api';
import type { ScriptConflict } from '../../types';

const overlay  = document.getElementById('sc-overlay')  as HTMLElement;
const previewEl = document.getElementById('sc-preview') as HTMLPreElement;
const hintEl   = document.getElementById('sc-hint')     as HTMLElement;

let _startId = '';

export function openScriptConflictModal(data: ScriptConflict): void {
  _startId = data.startId;
  previewEl.textContent = data.existingPreview + (data.existingPreview.length >= 500 ? '\n…' : '');
  hintEl.textContent = `Ruční přidání: jump location_${data.startId}`;
  overlay.classList.add('open');
}

export function closeScriptConflict(): void {
  overlay.classList.remove('open');
}

export function scOverlayClick(e: MouseEvent): void {
  if (e.target === overlay) closeScriptConflict();
}

export async function wireScript(mode: string): Promise<void> {
  try {
    const res = await apiWireScript(mode as 'overwrite' | 'append', _startId);
    if (!res.ok) { alert('Chyba: ' + (res.error ?? 'neznámá')); return; }
    closeScriptConflict();
  } catch (e) {
    alert('Chyba: ' + (e as Error).message);
  }
}
