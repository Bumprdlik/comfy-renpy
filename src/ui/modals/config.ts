import { apiGetConfig, apiPutConfig, apiBrowseFolder, apiBrowseExe } from '../../api';

const overlay   = document.getElementById('cfg-overlay')  as HTMLElement;
const gamedirEl = document.getElementById('cfg-gamedir')  as HTMLInputElement;
const renpyExeEl = document.getElementById('cfg-renpyexe') as HTMLInputElement;
const statusEl2  = document.getElementById('cfg-status')   as HTMLElement;

export async function openConfig(): Promise<void> {
  statusEl2.textContent = '';
  try {
    const cfg = await apiGetConfig();
    gamedirEl.value  = cfg.gameDir  ?? '';
    renpyExeEl.value = cfg.renpyExe ?? '';
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
  statusEl2.textContent = 'Ukládám…';
  statusEl2.style.color = '#aaa';
  try {
    await apiPutConfig({ gameDir, renpyExe });
    statusEl2.textContent = '✓ Uloženo';
    statusEl2.style.color = '#2ecc71';
    setTimeout(closeConfig, 800);
  } catch (e) {
    statusEl2.textContent = '✗ Chyba: ' + (e as Error).message;
    statusEl2.style.color = '#e74c3c';
  }
}
