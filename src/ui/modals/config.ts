import { apiGetConfig, apiPutConfig, apiCheckGraph, apiGetGraph } from '../../api';
import { graph, refreshDuplicateIds } from '../../graph/state';
import { saveGraph, setLastSavedJson } from '../autosave';
import { updateStats } from '../stats';
import { initHistory } from '../history';
import { loadExportSnapshot } from '../dirtyTracker';
import { setPanelHasKey } from '../panel';

const overlay         = document.getElementById('cfg-overlay')         as HTMLElement;
const gamedirEl       = document.getElementById('cfg-gamedir')         as HTMLInputElement;
const renpyExeEl      = document.getElementById('cfg-renpyexe')        as HTMLInputElement;
const providerEl      = document.getElementById('cfg-ai-provider')     as HTMLSelectElement;
const sectionAnthrop  = document.getElementById('cfg-ai-anthropic')    as HTMLElement;
const sectionOpenai   = document.getElementById('cfg-ai-openai')       as HTMLElement;
const anthropicKeyEl  = document.getElementById('cfg-apikey')          as HTMLInputElement;
const clearKeyBtn     = document.getElementById('cfg-clearkey-btn')    as HTMLButtonElement;
const openaiKeyEl     = document.getElementById('cfg-openai-key')      as HTMLInputElement;
const openaiUrlEl     = document.getElementById('cfg-openai-url')      as HTMLInputElement;
const openaiModelEl   = document.getElementById('cfg-openai-model')    as HTMLInputElement;
const statusEl2       = document.getElementById('cfg-status')          as HTMLElement;
const projectDirRow   = document.getElementById('cfg-projectdir-row')  as HTMLElement;
const projectDirEl    = document.getElementById('cfg-projectdir')      as HTMLElement;

let _openedGameDir  = '';
let _projectDir     = '';
let _hasAnthropKey  = false;
let _hasOpenaiKey   = false;
let _clearAnthropKey = false;
let _clearOpenaiKey  = false;

export function onAiProviderChange(value: string): void {
  sectionAnthrop.hidden = value !== 'anthropic';
  sectionOpenai.hidden  = value !== 'openai';
}

export async function openConfig(): Promise<void> {
  statusEl2.textContent = '';
  _clearAnthropKey = false;
  _clearOpenaiKey  = false;
  try {
    const cfg = await apiGetConfig();
    _projectDir    = cfg.projectDir ?? '';
    _hasAnthropKey = cfg.hasAnthropicKey ?? false;
    _hasOpenaiKey  = cfg.hasOpenaiKey    ?? false;

    const effectiveGameDir = cfg.gameDir || _projectDir;
    gamedirEl.value  = effectiveGameDir;
    renpyExeEl.value = cfg.renpyExe ?? '';
    _openedGameDir   = effectiveGameDir;

    providerEl.value = cfg.aiProvider ?? 'none';
    onAiProviderChange(providerEl.value);

    anthropicKeyEl.value       = '';
    anthropicKeyEl.placeholder = _hasAnthropKey ? '(nastaven — zadej nový pro změnu)' : 'sk-ant-...';
    clearKeyBtn.style.display  = _hasAnthropKey ? 'inline-block' : 'none';

    openaiKeyEl.value   = '';
    openaiKeyEl.placeholder = _hasOpenaiKey ? '(nastaven — zadej nový pro změnu)' : 'sk-...';
    openaiUrlEl.value   = cfg.openaiBaseUrl ?? '';
    openaiModelEl.value = cfg.openaiModel   ?? '';

    if (_projectDir) {
      projectDirEl.textContent    = _projectDir;
      projectDirRow.style.display = 'block';
    }
  } catch (e) {
    statusEl2.textContent = 'Chyba načítání: ' + (e as Error).message;
    statusEl2.style.color = '#e74c3c';
  }
  overlay.classList.add('open');
  gamedirEl.focus();
}

export function clearApiKey(): void {
  _clearAnthropKey = true;
  anthropicKeyEl.value = '';
  anthropicKeyEl.placeholder = 'sk-ant-...';
  clearKeyBtn.style.display = 'none';
}

export function closeConfig(): void {
  overlay.classList.remove('open');
}

export function cfgOverlayClick(e: MouseEvent): void {
  if (e.target === overlay) closeConfig();
}

export async function saveConfig(): Promise<void> {
  const gameDir      = gamedirEl.value.trim();
  const renpyExe     = renpyExeEl.value.trim();
  const provider     = providerEl.value;
  const anthropKey   = anthropicKeyEl.value.trim();
  const openaiKey    = openaiKeyEl.value.trim();
  const gameDirChanged = gameDir !== _openedGameDir;

  statusEl2.textContent = 'Ukládám…';
  statusEl2.style.color = '#aaa';

  try {
    const body: Record<string, string | number> = {
      gameDir, renpyExe, aiProvider: provider,
      openaiBaseUrl: openaiUrlEl.value.trim(),
      openaiModel:   openaiModelEl.value.trim(),
    };
    if (anthropKey)          body.anthropicKey = anthropKey;
    else if (_clearAnthropKey) body.anthropicKey = '';
    if (openaiKey)           body.openaiKey = openaiKey;
    else if (_clearOpenaiKey)  body.openaiKey = '';
    await apiPutConfig(body as import('../../types').ConfigData);

    const newHasAnthrop = anthropKey ? true : _clearAnthropKey ? false : _hasAnthropKey;
    const newHasOpenai  = openaiKey  ? true : _clearOpenaiKey  ? false : _hasOpenaiKey;
    const hasAi = (provider === 'anthropic' && newHasAnthrop) || (provider === 'openai' && newHasOpenai);
    setPanelHasKey(hasAi);
    _hasAnthropKey = newHasAnthrop;
    _hasOpenaiKey  = newHasOpenai;

    if (gameDirChanged && gameDir) {
      statusEl2.textContent = 'Kontroluji projekt…';
      const check = await apiCheckGraph();

      if (check.exists && check.nodeCount > 0) {
        const load = confirm(
          `V novém herním adresáři byl nalezen existující graf (${check.nodeCount} uzlů).\n\n` +
          `Načíst ho? Klikni OK pro načtení, Zrušit pro uložení aktuálního grafu do nového adresáře.`
        );
        if (load) {
          const data = await apiGetGraph();
          if (data) {
            graph.configure(data);
            const json = JSON.stringify(graph.serialize());
            setLastSavedJson(json);
            loadExportSnapshot();
            initHistory();
            updateStats();
            refreshDuplicateIds();
            graph.setDirtyCanvas(true, true);
          }
        } else {
          await saveGraph();
        }
      } else {
        await saveGraph();
      }
    }

    statusEl2.textContent = '✓ Uloženo';
    statusEl2.style.color = '#2ecc71';
    setTimeout(closeConfig, 900);
  } catch (e) {
    statusEl2.textContent = '✗ Chyba: ' + (e as Error).message;
    statusEl2.style.color = '#e74c3c';
  }
}
