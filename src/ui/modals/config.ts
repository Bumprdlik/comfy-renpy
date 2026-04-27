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
const anthropicKeyEl  = document.getElementById('cfg-apikey')          as HTMLInputElement;
const clearKeyBtn     = document.getElementById('cfg-clearkey-btn')    as HTMLButtonElement;
const statusEl2       = document.getElementById('cfg-status')          as HTMLElement;
const projectDirRow   = document.getElementById('cfg-projectdir-row')  as HTMLElement;
const projectDirEl    = document.getElementById('cfg-projectdir')      as HTMLElement;

let _openedGameDir = '';
let _projectDir    = '';
let _hasKey        = false;
let _clearKey      = false;

export async function openConfig(): Promise<void> {
  statusEl2.textContent = '';
  _clearKey = false;
  try {
    const cfg = await apiGetConfig();
    _projectDir = cfg.projectDir ?? '';
    _hasKey     = cfg.hasAnthropicKey ?? false;

    const effectiveGameDir = cfg.gameDir || _projectDir;
    gamedirEl.value  = effectiveGameDir;
    renpyExeEl.value = cfg.renpyExe ?? '';
    _openedGameDir   = effectiveGameDir;

    anthropicKeyEl.value = '';
    anthropicKeyEl.placeholder = _hasKey ? '(nastaven — zadej nový pro změnu)' : 'sk-ant-...';
    clearKeyBtn.style.display  = _hasKey ? 'inline-block' : 'none';

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
  _clearKey = true;
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
  const gameDir  = gamedirEl.value.trim();
  const renpyExe = renpyExeEl.value.trim();
  const apiKey   = anthropicKeyEl.value.trim();
  const gameDirChanged = gameDir !== _openedGameDir;

  statusEl2.textContent = 'Ukládám…';
  statusEl2.style.color = '#aaa';

  try {
    const body: Record<string, string | number> = { gameDir, renpyExe };
    if (apiKey)       body.anthropicKey = apiKey;
    else if (_clearKey) body.anthropicKey = '';
    await apiPutConfig(body as import('../../types').ConfigData);

    const newHasKey = apiKey ? true : _clearKey ? false : _hasKey;
    setPanelHasKey(newHasKey);
    _hasKey = newHasKey;

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
