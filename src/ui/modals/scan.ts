import { graph } from '../../graph/state';
import type { ScanResult, ScanStatus } from '../../types';

const overlay  = document.getElementById('scan-overlay') as HTMLElement;
const titleEl  = document.getElementById('scan-title')   as HTMLElement;
const bodyEl   = document.getElementById('scan-body')    as HTMLElement;

const STATUS_COLOR: Record<ScanStatus, string> = {
  written: '#2ecc71',
  stub:    '#f39c12',
  missing: '#7f8c8d',
  drift:   '#e74c3c',
};
const STATUS_ORDER: ScanStatus[] = ['missing', 'drift', 'stub', 'written'];
const STATUS_LABEL: Record<ScanStatus, string> = {
  written: 'written',
  stub:    'stub',
  missing: 'missing',
  drift:   'drift',
};
const TYPE_LABEL: Record<string, string> = {
  'renpy/location':  'Location',
  'renpy/event':     'Event',
  'renpy/item':      'Item',
  'renpy/character': 'Character',
  'renpy/quest':     'Quest',
};

export function openScanModal(data: ScanResult): void {
  // Build id→lgNode map
  const byComfyId = new Map<string, LGraphNode>();
  for (const n of graph._nodes) {
    const id = n.properties['id'] as string;
    if (id) byComfyId.set(id, n);
  }

  // Count by status
  const counts: Record<ScanStatus, number> = { written: 0, stub: 0, missing: 0, drift: 0 };
  for (const s of Object.values(data.nodes)) counts[s] = (counts[s] ?? 0) + 1;
  const total = Object.keys(data.nodes).length;

  titleEl.textContent = `Scan — ${total} uzlů`;

  // Group nodes by status
  const groups = new Map<ScanStatus, Array<{ lgId: number; label: string; type: string; comfyId: string }>>();
  for (const s of STATUS_ORDER) groups.set(s, []);

  for (const [comfyId, status] of Object.entries(data.nodes)) {
    const node = byComfyId.get(comfyId);
    const label = node
      ? String(node.properties['label'] ?? node.properties['name'] ?? comfyId)
      : comfyId;
    const type  = node?.type ?? '';
    const lgId  = node?.id ?? -1;
    groups.get(status as ScanStatus)!.push({ lgId, label, type, comfyId });
  }

  let html = `<div style="font-size:11px;color:#888;margin-bottom:10px;">`;
  for (const s of STATUS_ORDER) {
    if (counts[s]) {
      html += `<span style="margin-right:10px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${STATUS_COLOR[s]};vertical-align:middle;margin-right:4px;"></span>${counts[s]} ${STATUS_LABEL[s]}</span>`;
    }
  }
  html += `</div>`;

  for (const s of STATUS_ORDER) {
    const rows = groups.get(s)!;
    if (!rows.length) continue;
    html += `<div class="scan-section">${STATUS_LABEL[s]} (${rows.length})</div>`;
    for (const { lgId, label, type, comfyId } of rows) {
      const clickable = lgId >= 0;
      html += `<div class="scan-row" ${clickable ? `onclick="jumpToNode(${lgId})"` : ''} title="${comfyId}">`;
      html += `<span class="scan-dot" style="background:${STATUS_COLOR[s]}"></span>`;
      html += `<span class="scan-type">${TYPE_LABEL[type] ?? type}</span>`;
      html += `<span class="scan-name">${label}</span>`;
      html += `<span class="scan-status">${comfyId}</span>`;
      html += `</div>`;
    }
  }

  if (data.drift?.length) {
    html += `<div class="scan-section">Drift soubory (${data.drift.length})</div>`;
    for (const f of data.drift) {
      html += `<div class="scan-drift">⚠ ${f}</div>`;
    }
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
