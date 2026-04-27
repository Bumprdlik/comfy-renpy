import { apiGetConfig, apiPutConfig, apiBrowseFolder, apiBrowseExe, apiCheckGraph, apiGetGraph } from '../../api';
import { graph, refreshDuplicateIds } from '../../graph/state';
import { saveGraph, setLastSavedJson } from '../autosave';
import { updateStats } from '../stats';
import { initHistory } from '../history';
import { loadExportSnapshot } from '../dirtyTracker';

const overlay         = document.getElementById('cfg-overlay')         as HTMLElement;
const gamedirEl       = document.getElementById('cfg-gamedir')         as HTMLInputElement;
const renpyExeEl      = document.getElementById('cfg-renpyexe')        as HTMLInputElement;
const statusEl2       = document.getElementById('cfg-status')          as HTMLElement;
const projectDirRow   = document.getElementById('cfg-projectdir-row')  as HTMLElement;
const projectDirEl    = document.getElementById('cfg-projectdir')      as HTMLElement;
const gamedirAutoEl   = document.getElementById('cfg-gamedir-auto')    as HTMLElement;

let _openedGameDir = '';
let _projectDir    = '';

export async function openConfig(): Promise<void> {
  statusEl2.textContent = '';
  try {
    const cfg = await apiGetConfig();
    gamedirEl.value  = cfg.gameDir  ?? '';
    renpyExeEl.value = cfg.renpyExe ?? '';
    _openedGameDir   = cfg.gameDir  ?? '';
    _projectDir      = cfg.projectDir ?? '';

    if (_projectDir) {
      projectDirEl.textContent  = _projectDir;
      projectDirRow.style.display = 'block';
      gamedirAutoEl.textContent = cfg.gameDir
        ? ''
        : `Prázdné = použije se spouštěcí adresář (${_projectDir})`;
    }
  } catch (e) {
    statusEl2.textContent = 'Chyba načítání: ' + (e as Error).message;
    statusEl2.style.color = '#e74c3c';
  }
  overlay.classList.add('open');
  gamedirEl.focus();
}

export function closeConfig(): void {
  overlay.classList.remove('open');
}

export function cfgOverlayClick(e: MouseEvent): void {
  if (e.target === overlay) closeConfig();
}

export async function browseGameDir(): Promise<void> {
  const p = await apiBrowseFolder(gamedirEl.value);
  if (p) gamedirEl.value = p;
}

export async function browseRenpyExe(): Promise<void> {
  const p = await apiBrowseExe(renpyExeEl.value);
  if (p) renpyExeEl.value = p;
}

export async function saveConfig(): Promise<void> {
  const gameDir  = gamedirEl.value.trim();
  const renpyExe = renpyExeEl.value.trim();
  const gameDirChanged = gameDir !== _openedGameDir;

  statusEl2.textContent = 'Ukládám…';
  statusEl2.style.color = '#aaa';

  try {
    await apiPutConfig({ gameDir, renpyExe });

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
