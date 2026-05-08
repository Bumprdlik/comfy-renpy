import './style.css';

import './graph/nodes/LocationNode';
import './graph/nodes/EventNode';
import './graph/nodes/ItemNode';
import './graph/nodes/CharacterNode';
import './graph/nodes/NoteNode';
import './graph/nodes/QuestNode';

import { graph, refreshDuplicateIds, setSelectedNode } from './graph/state';
import { apiGetGraph, apiGetConfig } from './api';
import { scheduleSave, saveGraph, setLastSavedJson, statusEl } from './ui/autosave';
import { updateStats } from './ui/stats';
import { renderPanel, clearPanel, updateExit, updateExitReturn, toggleExitBidir, removeExit, addExit, setPanelHasKey } from './ui/panel';
import { addNode, addGroup, exportRpy, doExport, scanFiles, launchRenpy, autoLayout, loadExample, openGameDir, openVsCode, toggleCompact, initCompactMode, runChecker, closeChecker, checkerOverlayClick, checkerGoto } from './ui/toolbar';
import { initHistory, captureHistory, undo, redo } from './ui/history';
import { initSearch } from './ui/search';
import { initMinimap } from './ui/minimap';
import { loadExportSnapshot } from './ui/dirtyTracker';
import { openConfig, closeConfig, cfgOverlayClick, saveConfig, clearApiKey, onAiProviderChange } from './ui/modals/config';
import { openGenerate, closeGenerate, genOverlayClick, copyGenPrompt, runGenerate, copyGenResult, writeGenResult, batchGenerateDialogues, setBatchGenVisible } from './ui/modals/generate';
import { openHelp, closeHelp, helpTab, helpOverlayClick, maybeShowHelp } from './ui/modals/help';
import { validateGraph, closeVal, valOverlayClick } from './ui/modals/validate';
import { previewRpy, closePreview, previewOverlayClick } from './ui/modals/preview';
import { closeScriptConflict, scOverlayClick, wireScript } from './ui/modals/script-conflict';
import { closeScanModal, scanOverlayClick } from './ui/modals/scan';
import { initDropdown, initDropdownGlobal } from './ui/dropdown';

LiteGraph.NODE_TITLE_HEIGHT = 22;
LiteGraph.NODE_SLOT_HEIGHT = 20;
LiteGraph.NODE_WIDTH = 220;
LiteGraph.DEFAULT_SHADOW_OFFSET_X = 0;
LiteGraph.DEFAULT_SHADOW_OFFSET_Y = 0;
LiteGraph.slot_types_default_color = {
  connection:    '#5599ee',
  'connection-bi': '#44ccaa',
  event:         '#ee9933',
  item:          '#bb55ee',
  char:          '#33cc88',
};

// Remove all built-in LiteGraph node types — only renpy/* should appear in the context menu
for (const type of Object.keys(LiteGraph.registered_node_types)) {
  if (!type.startsWith('renpy/')) delete LiteGraph.registered_node_types[type];
}
for (const key of Object.keys(LiteGraph.searchbox_extras)) {
  delete LiteGraph.searchbox_extras[key];
}

// LiteGraph reads cable (link) colors from LGraphCanvas.link_type_colors, not slot_types_default_color
const _ltColors = (LiteGraph.LGraphCanvas as unknown as { link_type_colors: Record<string, string> }).link_type_colors;
_ltColors['connection']    = '#5599ee';
_ltColors['connection-bi'] = '#44ccaa';

// Flatten the Add Node context menu: skip the "renpy" category, show types directly
(LiteGraph.LGraphCanvas as unknown as Record<string, unknown>)['onMenuAdd'] = function(
  _node: unknown, _options: unknown, e: MouseEvent, prev_menu: unknown
) {
  const entries = Object.keys(LiteGraph.registered_node_types).map(type => {
    const label = type.split('/').pop()!;
    return {
      content: label.charAt(0).toUpperCase() + label.slice(1),
      callback() { window.addNode(type); },
    };
  });
  const CtxMenu = (LiteGraph as unknown as Record<string, new (...a: unknown[]) => unknown>)['ContextMenu'];
  new CtxMenu(entries, { event: e, parentMenu: prev_menu });
};

// Render bidir connections as a double cable (two parallel lines 5px apart)
const _origRenderLink = (LiteGraph.LGraphCanvas.prototype as unknown as Record<string, unknown>)['renderLink'] as (...a: unknown[]) => unknown;
(LiteGraph.LGraphCanvas.prototype as unknown as Record<string, unknown>)['renderLink'] = function(...args: unknown[]) {
  const link = args[3] as Record<string, unknown> | null;
  if (link && link['type'] === 'connection-bi' && !args[9]) args[9] = 2;
  return _origRenderLink.apply(this, args);
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

graph.onAfterChange = () => { captureHistory(); scheduleSave(); updateStats(); refreshDuplicateIds(); };

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

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    const si = document.getElementById('search-input') as HTMLInputElement | null;
    if (si) { e.preventDefault(); si.focus(); si.select(); }
    return;
  }

  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }

  if (e.ctrlKey || e.metaKey || e.altKey) return;
  switch (e.key.toLowerCase()) {
    case 'l': addNode('renpy/location');  break;
    case 'e': addNode('renpy/event');     break;
    case 'i': addNode('renpy/item');      break;
    case 'c': addNode('renpy/character'); break;
    case 'n': addNode('renpy/note');      break;
    case 'q': addNode('renpy/quest');     break;
    case 'g': addGroup();                 break;
  }
});

window.addNode          = addNode;
window.addGroup         = addGroup;
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
window.clearApiKey        = clearApiKey;
window.onAiProviderChange = onAiProviderChange;
window.openGameDir        = openGameDir;
window.openVsCode         = openVsCode;
window.toggleCompact      = toggleCompact;
window.openGenerate     = openGenerate;
window.closeGenerate    = closeGenerate;
window.genOverlayClick  = genOverlayClick;
window.copyGenPrompt    = copyGenPrompt;
window.runGenerate      = runGenerate;
window.copyGenResult    = copyGenResult;
window.writeGenResult   = writeGenResult;
window.openHelp         = openHelp;
window.closeHelp        = closeHelp;
window.helpTab          = helpTab;
window.helpOverlayClick = helpOverlayClick;
window.closeVal         = closeVal;
window.valOverlayClick  = valOverlayClick;
window.closePreview     = closePreview;
window.previewOverlayClick = previewOverlayClick;
window.closeScriptConflict = closeScriptConflict;
window.scOverlayClick   = scOverlayClick;
window.wireScript       = wireScript;
window.closeScanModal   = closeScanModal;
window.scanOverlayClick = scanOverlayClick;
window.jumpToNode       = (lgNodeId: number) => {
  const node = graph.getNodeById(lgNodeId);
  if (!node) return;
  closeScanModal();
  lgCanvas.centerOnNode(node);
  lgCanvas.selectNode(node, false);
};
window.updateExit       = updateExit;
window.updateExitReturn = updateExitReturn;
window.toggleExitBidir  = toggleExitBidir;
window.removeExit       = removeExit;
window.addExit          = addExit;
window.loadExample        = loadExample;
window.runChecker         = runChecker;
window.closeChecker       = closeChecker;
window.checkerOverlayClick = checkerOverlayClick;
window.checkerGoto        = checkerGoto;
window.batchGenerateDialogues = batchGenerateDialogues;

(async () => {
  try {
    const [data, cfg] = await Promise.all([apiGetGraph(), apiGetConfig().catch(() => ({}))]);
    const c = cfg as import('./types').ConfigData;
    const hasAi = (c.aiProvider === 'anthropic' && !!c.hasAnthropicKey)
               || (c.aiProvider === 'openai'    && !!c.hasOpenaiKey);
    setPanelHasKey(hasAi);
    setBatchGenVisible(hasAi);
    if (!c.hasVsCode) {
      const btn = document.querySelector('button[onclick="openVsCode()"]') as HTMLElement | null;
      if (btn) btn.hidden = true;
    }
    if (data) {
      graph.configure(data);
      setLastSavedJson(JSON.stringify(graph.serialize()));
      loadExportSnapshot();
      initHistory();
      statusEl.textContent = '✓ načteno';
      statusEl.style.color = '#2ecc71';
      updateStats();
      refreshDuplicateIds();
    }
  } catch (e) {
    console.error('Chyba načítání grafu:', e);
  }
  graph.start();
  initSearch(lgCanvas);
  initMinimap(lgCanvas, canvasEl);
  initCompactMode();
  initDropdown('add-btn',   'add-panel');
  initDropdown('check-btn', 'check-panel');
  initDropdown('open-btn',  'open-panel');
  initDropdownGlobal();
  maybeShowHelp();
})();
