import './style.css';

import './graph/nodes/LocationNode';
import './graph/nodes/EventNode';
import './graph/nodes/ItemNode';
import './graph/nodes/CharacterNode';
import './graph/nodes/NoteNode';
import './graph/nodes/QuestNode';

import { graph, refreshDuplicateIds, setSelectedNode } from './graph/state';
import { apiGetGraph } from './api';
import { scheduleSave, saveGraph, setLastSavedJson, statusEl } from './ui/autosave';
import { updateStats } from './ui/stats';
import { renderPanel, clearPanel, updateExit, removeExit, addExit } from './ui/panel';
import { addNode, exportRpy, doExport, scanFiles, launchRenpy, autoLayout, loadExample } from './ui/toolbar';
import { openConfig, closeConfig, cfgOverlayClick, saveConfig } from './ui/modals/config';
import { openHelp, closeHelp, helpTab, helpOverlayClick, maybeShowHelp } from './ui/modals/help';
import { validateGraph, closeVal, valOverlayClick } from './ui/modals/validate';
import { previewRpy, closePreview, previewOverlayClick } from './ui/modals/preview';

LiteGraph.NODE_TITLE_HEIGHT = 22;
LiteGraph.NODE_SLOT_HEIGHT = 20;
LiteGraph.NODE_WIDTH = 220;
LiteGraph.DEFAULT_SHADOW_OFFSET_X = 0;
LiteGraph.DEFAULT_SHADOW_OFFSET_Y = 0;
LiteGraph.slot_types_default_color = {
  connection: '#5599ee',
  event:      '#ee9933',
  item:       '#bb55ee',
  char:       '#33cc88',
};

const canvasEl  = document.getElementById('graph-canvas') as HTMLCanvasElement;
const canvasWrap = document.getElementById('canvas-wrap') as HTMLElement;
const lgCanvas  = new LiteGraph.LGraphCanvas(canvasEl, graph);

lgCanvas.render_canvas_border = false;
lgCanvas.render_connections_shadows = false;
lgCanvas.background_image = '';

function resizeCanvas(): void {
  canvasEl.width  = canvasWrap.clientWidth;
  canvasEl.height = canvasWrap.clientHeight;
  lgCanvas.setDirty(true, true);
}
const ro = new ResizeObserver(resizeCanvas);
ro.observe(canvasWrap);
resizeCanvas();

graph.onAfterChange = () => { scheduleSave(); updateStats(); refreshDuplicateIds(); };

lgCanvas.onNodeSelected = (node: LGraphNode) => {
  setSelectedNode(node);
  renderPanel(node);
};

canvasEl.addEventListener('pointerdown', () => {
  requestAnimationFrame(() => {
    const sel = lgCanvas.selected_nodes;
    if (!sel || Object.keys(sel).length === 0) clearPanel();
  });
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') { closeConfig(); closeHelp(); closeVal(); closePreview(); return; }
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  switch (e.key.toLowerCase()) {
    case 'l': addNode('renpy/location');  break;
    case 'e': addNode('renpy/event');     break;
    case 'i': addNode('renpy/item');      break;
    case 'c': addNode('renpy/character'); break;
    case 'n': addNode('renpy/note');      break;
  }
});

window.addNode          = addNode;
window.saveGraph        = saveGraph;
window.validateGraph    = validateGraph;
window.exportRpy        = exportRpy;
window.doExport         = doExport;
window.scanFiles        = scanFiles;
window.previewRpy       = previewRpy;
window.autoLayout       = autoLayout;
window.launchRenpy      = launchRenpy;
window.openConfig       = openConfig;
window.closeConfig      = closeConfig;
window.cfgOverlayClick  = cfgOverlayClick;
window.saveConfig       = saveConfig;
window.openHelp         = openHelp;
window.closeHelp        = closeHelp;
window.helpTab          = helpTab;
window.helpOverlayClick = helpOverlayClick;
window.closeVal         = closeVal;
window.valOverlayClick  = valOverlayClick;
window.closePreview     = closePreview;
window.previewOverlayClick = previewOverlayClick;
window.updateExit       = updateExit;
window.removeExit       = removeExit;
window.addExit          = addExit;
window.loadExample      = loadExample;

(async () => {
  try {
    const data = await apiGetGraph();
    if (data) {
      graph.configure(data);
      setLastSavedJson(JSON.stringify(graph.serialize()));
      statusEl.textContent = '✓ načteno';
      statusEl.style.color = '#2ecc71';
      updateStats();
      refreshDuplicateIds();
    }
  } catch (e) {
    console.error('Chyba načítání grafu:', e);
  }
  graph.start();
  maybeShowHelp();
})();
