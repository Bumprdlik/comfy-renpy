import { graph } from '../../graph/state';
import { apiValidate } from '../../api';
import { escHtml } from '../../graph/helpers';
import type { ValidationResult } from '../../types';

const overlay   = document.getElementById('val-overlay')    as HTMLElement;
const valBody   = document.getElementById('val-body')       as HTMLElement;
const exportBtn = document.getElementById('val-export-btn') as HTMLElement;

export async function validateGraph(): Promise<void> {
  try {
    const data = await apiValidate(graph.serialize());
    showValModal(data, false);
  } catch (e) {
    alert('Chyba validace: ' + (e as Error).message);
  }
}

export function showValModal(data: ValidationResult, canExport: boolean): void {
  let html = '';
  if (!data.errors.length && !data.warnings.length) {
    html = '<div class="val-ok">✓ Vše v pořádku — žádné chyby ani varování.</div>';
  }
  if (data.errors.length) {
    html += `<div class="val-section">Chyby (${data.errors.length})</div>`;
    data.errors.forEach(e => {
      html += `<div class="val-item"><span class="val-icon" style="color:#e74c3c">✗</span><span class="val-text" style="color:#e87070">${escHtml(e)}</span></div>`;
    });
  }
  if (data.warnings.length) {
    html += `<div class="val-section">Varování (${data.warnings.length})</div>`;
    data.warnings.forEach(w => {
      html += `<div class="val-item"><span class="val-icon" style="color:#f39c12">⚠</span><span class="val-text" style="color:#c8a050">${escHtml(w)}</span></div>`;
    });
  }
  valBody.innerHTML = html;
  exportBtn.style.display = canExport ? '' : 'none';
  overlay.classList.add('open');
}

export function closeVal(): void {
  overlay.classList.remove('open');
}

export function valOverlayClick(e: MouseEvent): void {
  if (e.target === overlay) closeVal();
}
