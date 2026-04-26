import { graph } from '../graph/state';
import { scheduleSave, saveGraph, statusEl } from './autosave';
import { apiExportRpy, apiScan, apiLaunch, apiValidate } from '../api';
import { showValModal } from './modals/validate';

const canvasEl = document.getElementById('graph-canvas') as HTMLCanvasElement;

let nodeCounter: Record<string, number> = {};

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

  const COLS = 3, COL_W = 290, COL_H = 130;
  const START_X = 60, START_Y = 80;

  const locPos: Record<string, [number, number]> = {};
  locs.forEach((node, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    node.pos = [START_X + col * COL_W, START_Y + row * COL_H];
    const id = node.properties['id'] as string;
    if (id) locPos[id] = node.pos;
  });

  const locRows: Record<string, number> = {};
  const EVT_H = 75, EVT_OFFSET = 150;
  const unplacedEvts: LGraphNode[] = [];
  evts.forEach(node => {
    const lid = node.properties['location_id'] as string;
    const lp = locPos[lid];
    if (lp) {
      const row = locRows[lid] || 0;
      locRows[lid] = row + 1;
      node.pos = [lp[0], lp[1] + EVT_OFFSET + row * EVT_H];
    } else { unplacedEvts.push(node); }
  });

  const RIGHT_X = START_X + COLS * COL_W + 50;
  unplacedEvts.forEach((node, i) => { node.pos = [RIGHT_X, START_Y + i * EVT_H]; });

  const SIDE_Y = START_Y + unplacedEvts.length * EVT_H + (unplacedEvts.length ? 40 : 0);
  items.forEach((node, i) => { node.pos = [RIGHT_X, SIDE_Y + i * 70]; });

  const CHAR_X = RIGHT_X + 240;
  chars.forEach((node, i) => { node.pos = [CHAR_X, START_Y + i * 70]; });
  notes.forEach((node, i) => { node.pos = [CHAR_X, START_Y + chars.length * 70 + 50 + i * 110]; });

  graph.setDirtyCanvas(true, true);
  scheduleSave();
}

export { saveGraph };
