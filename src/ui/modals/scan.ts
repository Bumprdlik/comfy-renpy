import { graph } from '../../graph/state';
import type { ScanResult, ScanStatus } from '../../types';

const overlay  = document.getElementById('scan-overlay') as HTMLElement;
const titleEl  = document.getElementById('scan-title')   as HTMLElement;
const bodyEl   = document.getElementById('scan-body')    as HTMLElement;

const STATUS_COLOR: Record<ScanStatus, string> = {
  missing: '#7f8c8d',
  drift:   '#e74c3c',
  stub:    '#f39c12',
  written: '#2ecc71',
  ok:      '#27ae60',
};

const STATUS_LABEL: Record<ScanStatus, string> = {
  missing: 'Missing',
  drift:   'Drift',
  stub:    'Stub',
  written: 'Written',
  ok:      'Ok',
};

const STATUS_HINT: Record<ScanStatus, string> = {
  missing: 'Soubor neexistuje — spusť Export .rpy',
  drift:   'Soubor bez COMFY markeru nebo orphan — zkontroluj ručně',
  stub:    'Kostra existuje, dialog chybí — napiš v IDE nebo použij ✨ Generovat',
  written: 'Dialog napsán — hotovo',
  ok:      'Strukturální soubor (quest / item) — hotovo',
};

const STATUS_ORDER: ScanStatus[] = ['missing', 'drift', 'stub', 'written', 'ok'];

const TYPE_LABEL: Record<string, string> = {
  'renpy/location':  'Location',
  'renpy/event':     'Event',
  'renpy/item':      'Item',
  'renpy/character': 'Character',
  'renpy/quest':     'Quest',
};

export function openScanModal(data: ScanResult): void {
  const byComfyId = new Map<string, LGraphNode>();
  for (const n of graph._nodes) {
    const id = n.properties['id'] as string;
    if (id) byComfyId.set(id, n);
  }

  const counts: Partial<Record<ScanStatus, number>> = {};
  for (const s of Object.values(data.nodes)) counts[s] = (counts[s] ?? 0) + 1;
  const total = Object.keys(data.nodes).length;

  titleEl.textContent = `Scan — ${total} uzlů`;

  const groups = new Map<ScanStatus, Array<{ lgId: number; label: string; type: string; comfyId: string }>>();
  for (const s of STATUS_ORDER) groups.set(s, []);

  for (const [comfyId, status] of Object.entries(data.nodes)) {
    const node  = byComfyId.get(comfyId);
    const label = node ? String(node.properties['label'] ?? node.properties['name'] ?? comfyId) : comfyId;
    const type  = node?.type ?? '';
    const lgId  = node?.id ?? -1;
    groups.get(status as ScanStatus)!.push({ lgId, label, type, comfyId });
  }

  // Summary chips
  let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">`;
  for (const s of STATUS_ORDER) {
    const c = counts[s];
    if (!c) continue;
    html += `<span style="display:flex;align-items:center;gap:5px;font-size:11px;color:#aaa;">`;
    html += `<span style="width:9px;height:9px;border-radius:50%;background:${STATUS_COLOR[s]};display:inline-block;"></span>`;
    html += `${c} ${STATUS_LABEL[s].toLowerCase()}</span>`;
  }
  html += `</div>`;

  // Sections — only actionable ones first, then ok/written
  for (const s of STATUS_ORDER) {
    const rows = groups.get(s)!;
    if (!rows.length) continue;

    html += `<div class="scan-section-header">`;
    html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${STATUS_COLOR[s]};margin-right:6px;vertical-align:middle;"></span>`;
    html += `${STATUS_LABEL[s]} (${rows.length})`;
    html += `</div>`;
    html += `<div class="scan-hint">${STATUS_HINT[s]}</div>`;

    for (const { lgId, label, type, comfyId } of rows) {
      const clickable = lgId >= 0;
      html += `<div class="scan-row"${clickable ? ` onclick="jumpToNode(${lgId})"` : ''} title="${comfyId}">`;
      html += `<span class="scan-dot" style="background:${STATUS_COLOR[s]}"></span>`;
      html += `<span class="scan-type">${TYPE_LABEL[type] ?? type}</span>`;
      html += `<span class="scan-name">${label}</span>`;
      html += `<span class="scan-id">${comfyId}</span>`;
      html += `</div>`;
    }
  }

  if (data.drift?.length) {
    html += `<div class="scan-section-header" style="margin-top:10px;">`;
    html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e74c3c;margin-right:6px;vertical-align:middle;"></span>`;
    html += `Orphan soubory (${data.drift.length})</div>`;
    html += `<div class="scan-hint">Soubory bez uzlu v grafu — zvažte smazání</div>`;
    for (const f of data.drift) html += `<div class="scan-drift">⚠ ${f}</div>`;
  }

  if (!total && !data.drift?.length) {
    html += `<div style="font-size:12px;color:#7f8c8d;padding:8px 0;">Žádné uzly k zobrazení.</div>`;
  }

  bodyEl.innerHTML = html;
  overlay.classList.add('open');
}

export function closeScanModal(): void {
  overlay.classList.remove('open');
}

export function scanOverlayClick(e: MouseEvent): void {
  if (e.target === overlay) closeScanModal();
}
