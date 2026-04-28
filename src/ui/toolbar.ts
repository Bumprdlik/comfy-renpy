import { graph, refreshDuplicateIds } from '../graph/state';
import { scheduleSave, saveGraph, setLastSavedJson, statusEl } from './autosave';
import { saveExportSnapshot } from './dirtyTracker';
import { apiExportRpy, apiScan, apiLaunch, apiValidate, apiOpenGameDir, apiOpenVsCode } from '../api';
import { showValModal } from './modals/validate';
import { updateStats } from './stats';

const canvasEl = document.getElementById('graph-canvas') as HTMLCanvasElement;

let nodeCounter: Record<string, number> = {};
let groupCounter = 0;

export function addNode(type: string): void {
  const node = LiteGraph.createNode(type);
  if (!node) return;

  const shortType = type.split('/')[1];
  nodeCounter[shortType] = (nodeCounter[shortType] || 0) + 1;
  const n = nodeCounter[shortType];

  node.properties['id'] = shortType + '_' + n;
  if ('label' in node.properties) node.properties['label'] = shortType + ' ' + n;
  if ('name'  in node.properties) node.properties['name']  = shortType + ' ' + n;

  const lgCanvas = (graph as unknown as { canvas: LGraphCanvas }).canvas;
  let center: [number, number] = [canvasEl.width * 0.5, canvasEl.height * 0.5];
  if (lgCanvas?.convertOffsetToCanvas) {
    center = lgCanvas.convertOffsetToCanvas([canvasEl.width * 0.5, canvasEl.height * 0.5]);
  }
  node.pos = [
    center[0] - node.size[0] * 0.5 + (Math.random() - 0.5) * 120,
    center[1] - node.size[1] * 0.5 + (Math.random() - 0.5) * 80,
  ];

  graph.add(node);
}

export function addGroup(): void {
  const group = new LiteGraph.LGraphGroup('Kapitola ' + (++groupCounter));
  group.color = '#1e3347';
  group.font_size = 18;

  const lgCanvas = (graph as unknown as { canvas: LGraphCanvas }).canvas;
  let center: [number, number] = [canvasEl.width * 0.5, canvasEl.height * 0.5];
  if (lgCanvas?.convertOffsetToCanvas) {
    center = lgCanvas.convertOffsetToCanvas([canvasEl.width * 0.5, canvasEl.height * 0.5]);
  }
  group.pos  = [center[0] - 220, center[1] - 130];
  group.size = [440, 300];

  graph.add(group);
  scheduleSave();
}

export async function exportRpy(): Promise<void> {
  try {
    const vdata = await apiValidate(graph.serialize());
    if (!vdata.ok) { showValModal(vdata, false); return; }
    if (vdata.warnings.length) { showValModal(vdata, true); return; }
  } catch (e) { console.warn('Validation skipped:', e); }
  await doExport();
}

export async function doExport(): Promise<void> {
  statusEl.textContent = '⟳ export…';
  statusEl.style.color = '#aaa';
  try {
    const data = await apiExportRpy(graph.serialize());
    if (!data.ok) {
      statusEl.textContent = '✗ export selhal';
      statusEl.style.color = '#e74c3c';
      alert(data.error ?? data.message ?? 'Export selhal');
      return;
    }
    const n = data.created.length + data.updated.length;
    statusEl.textContent = `✓ export: ${n} souborů`;
    statusEl.style.color = '#2ecc71';
    saveExportSnapshot(graph._nodes);
    graph.setDirtyCanvas(true, true);
    if (data.note) alert('ℹ ' + data.note);
    if (data.errors?.length) alert('Chyby při exportu:\n' + data.errors.join('\n'));
  } catch (e) {
    statusEl.textContent = '✗ export chyba';
    statusEl.style.color = '#e74c3c';
    alert('Chyba exportu: ' + (e as Error).message);
  }
}

export async function scanFiles(): Promise<void> {
  try {
    const data = await apiScan();
    for (const node of graph._nodes) {
      const s = data.nodes[node.properties['id'] as string];
      if (s !== undefined) { node._status = s; node.setDirtyCanvas(true); }
    }
    if (data.drift?.length) {
      alert('Drift detekce:\n' + data.drift.join('\n'));
    } else {
      statusEl.textContent = 'Scan OK';
      statusEl.style.color = '#2ecc71';
    }
  } catch (e) {
    alert('Chyba scanu: ' + (e as Error).message);
  }
}

export async function launchRenpy(): Promise<void> {
  try {
    const d = await apiLaunch();
    if (d.error) alert('Nelze spustit: ' + d.error);
  } catch (e) {
    alert('Chyba při spouštění: ' + (e as Error).message);
  }
}

export function autoLayout(): void {
  const nodes = graph._nodes || [];
  const locs  = nodes.filter(n => n.type === 'renpy/location').sort((a, b) => String(a.properties['id'] || '').localeCompare(String(b.properties['id'] || '')));
  const evts  = nodes.filter(n => n.type === 'renpy/event').sort((a, b) => String(a.properties['id'] || '').localeCompare(String(b.properties['id'] || '')));
  const items = nodes.filter(n => n.type === 'renpy/item').sort((a, b) => String(a.properties['id'] || '').localeCompare(String(b.properties['id'] || '')));
  const chars = nodes.filter(n => n.type === 'renpy/character').sort((a, b) => String(a.properties['id'] || '').localeCompare(String(b.properties['id'] || '')));
  const notes = nodes.filter(n => n.type === 'renpy/note');

  const quests = nodes.filter(n => n.type === 'renpy/quest').sort((a, b) => String(a.properties['id'] || '').localeCompare(String(b.properties['id'] || '')));

  const COLS = 3, COL_W = 290, COL_H = 130;
  const START_X = 60, START_Y = 80;

  // Locations: simple fixed-height grid (no events below them)
  locs.forEach((node, i) => {
    node.pos = [START_X + (i % COLS) * COL_W, START_Y + Math.floor(i / COLS) * COL_H];
  });

  // Right-side columns
  const RIGHT_X = START_X + COLS * COL_W + 60;

  // Col 1 — Events, sorted by location_id so same-location events are adjacent
  evts.sort((a, b) => {
    const la = String(a.properties['location_id'] || '');
    const lb = String(b.properties['location_id'] || '');
    return la !== lb ? la.localeCompare(lb) : String(a.properties['id'] || '').localeCompare(String(b.properties['id'] || ''));
  });
  evts.forEach((node, i) => { node.pos = [RIGHT_X, START_Y + i * 80]; });

  // Col 2 — Items, then Quests below
  const IQ_X = RIGHT_X + 260;
  items.forEach((node, i) => { node.pos = [IQ_X, START_Y + i * 70]; });
  const questY = START_Y + items.length * 70 + (items.length ? 30 : 0);
  quests.forEach((node, i) => { node.pos = [IQ_X, questY + i * 110]; });

  // Col 3 — Characters, then Notes below
  const CN_X = IQ_X + 240;
  chars.forEach((node, i) => { node.pos = [CN_X, START_Y + i * 70]; });
  const noteY = START_Y + chars.length * 70 + (chars.length ? 30 : 0);
  notes.forEach((node, i) => { node.pos = [CN_X, noteY + i * 110]; });

  graph.setDirtyCanvas(true, true);
  scheduleSave();
}

export async function loadExample(): Promise<void> {
  if (!confirm('Načtením příkladu se přepíše aktuální graf. Pokračovat?')) return;
  try {
    const r = await fetch('/example-graph.json');
    if (!r.ok) throw new Error('Soubor nenalezen');
    const data = await r.json() as Record<string, unknown>;
    graph.configure(data);
    const json = JSON.stringify(graph.serialize());
    setLastSavedJson(json);
    await saveGraph();
    updateStats();
    refreshDuplicateIds();
    graph.setDirtyCanvas(true, true);
  } catch (e) {
    alert('Chyba načítání příkladu: ' + (e as Error).message);
  }
}

export async function openGameDir(): Promise<void> {
  await apiOpenGameDir();
}

export async function openVsCode(): Promise<void> {
  await apiOpenVsCode();
}

export function toggleCompact(): void {
  const tb = document.getElementById('toolbar')!;
  const btn = document.getElementById('compact-toggle')!;
  const compact = tb.classList.toggle('compact');
  localStorage.setItem('comfy-compact', compact ? '1' : '0');
  btn.textContent = compact ? '⊞' : '⊟';
  btn.title = compact ? 'Klasický mód' : 'Kompaktní mód';
}

export function initCompactMode(): void {
  if (localStorage.getItem('comfy-compact') !== '1') return;
  document.getElementById('toolbar')!.classList.add('compact');
  const btn = document.getElementById('compact-toggle');
  if (btn) { btn.textContent = '⊞'; btn.title = 'Klasický mód'; }
}

export { saveGraph };
