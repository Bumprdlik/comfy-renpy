import { graph } from '../../graph/state';
import { apiGenerateDialogue } from '../../api';

const overlay    = document.getElementById('gen-overlay')   as HTMLElement;
const titleEl    = document.getElementById('gen-title')     as HTMLElement;
const promptArea = document.getElementById('gen-prompt')    as HTMLTextAreaElement;
const resultPre  = document.getElementById('gen-result')    as HTMLElement;
const statusEl   = document.getElementById('gen-status')    as HTMLElement;
const genBtn     = document.getElementById('gen-api-btn')   as HTMLButtonElement;
const noKeyHint  = document.getElementById('gen-no-key')    as HTMLElement;

let _prompt = '';

function buildPrompt(nodeId: number): string {
  const node = graph.getNodeById(nodeId);
  if (!node) return '';
  const p = node.properties;
  const locId = String(p['location_id'] ?? '');

  const locNode = graph._nodes.find(n => n.type === 'renpy/location' && n.properties['id'] === locId);
  const chars   = graph._nodes.filter(n => n.type === 'renpy/character' && String(n.properties['location_id']) === locId);
  const items   = graph._nodes.filter(n => n.type === 'renpy/item'      && String(n.properties['location_id']) === locId);

  const lines: string[] = [
    'Jsi expert na psaní Ren\'Py dialogů v češtině. Vygeneruj dialog pro následující událost.',
    '',
  ];

  if (locNode) {
    const lp = locNode.properties;
    lines.push(`## Lokace: ${lp['label'] ?? locId}`);
    if (lp['description']) lines.push(String(lp['description']));
    lines.push('');
  }

  lines.push(`## Event: ${p['id']}`);
  if (p['trigger_label']) lines.push(`Trigger volby: "${p['trigger_label']}"`);
  else lines.push(`Trigger: ${p['trigger']}`);
  if (p['prerequisite']) lines.push(`Prerekvizita: \`${p['prerequisite']}\``);
  if (p['time'] && p['time'] !== 'any') lines.push(`Čas: ${p['time']}`);
  if (p['notes']) { lines.push(''); lines.push(`Kontext / poznámky: ${p['notes']}`); }
  lines.push('');

  if (chars.length > 0) {
    lines.push('## Postavy v lokaci:');
    for (const c of chars) {
      const cp = c.properties;
      lines.push(`- **${cp['name']}** (ren\'py id: \`${cp['id']}\`) — ${cp['voice'] || 'bez hlasového profilu'}`);
    }
    lines.push('');
  }

  if (items.length > 0) {
    lines.push('## Itemy v lokaci:');
    for (const it of items) {
      const ip = it.properties;
      lines.push(`- **${ip['name']}**: ${ip['description'] ?? ''}`);
    }
    lines.push('');
  }

  lines.push('## Pokyny pro výstup');
  lines.push(`- Vygeneruj validní Ren\'Py kód s labelem \`label event_${p['id']}:\``);
  lines.push('- Jako mluvčí použi Ren\'Py ID postavy (malá písmena, bez diakritiky)');
  lines.push('- Respektuj hlasové profily a povahu každé postavy');
  lines.push('- Dialog piš v češtině');
  lines.push('- Na konci přidej \`return\`');

  return lines.join('\n');
}

export function openGenerate(nodeId: number, hasKey: boolean): void {
  const node = graph.getNodeById(nodeId);
  if (!node) return;
  _prompt = buildPrompt(nodeId);

  titleEl.textContent = `✨ Generovat dialog — ${node.properties['id'] ?? nodeId}`;
  promptArea.value    = _prompt;
  resultPre.textContent = '';
  resultPre.hidden    = true;
  statusEl.textContent = '';
  genBtn.hidden        = !hasKey;
  noKeyHint.hidden     = hasKey;

  overlay.classList.add('open');
}

export function closeGenerate(): void {
  overlay.classList.remove('open');
}

export function genOverlayClick(e: MouseEvent): void {
  if (e.target === overlay) closeGenerate();
}

export async function copyGenPrompt(): Promise<void> {
  await navigator.clipboard.writeText(_prompt);
  const btn = document.getElementById('gen-copy-btn') as HTMLButtonElement;
  const orig = btn.textContent ?? '';
  btn.textContent = '✓ Zkopírováno';
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

export async function runGenerate(): Promise<void> {
  statusEl.textContent = '⟳ Generuji…';
  statusEl.style.color = '#aaa';
  resultPre.hidden = true;
  genBtn.disabled = true;

  try {
    const data = await apiGenerateDialogue(_prompt);
    if (data.error) throw new Error(data.error);
    if (data.result) {
      resultPre.textContent = data.result;
      resultPre.hidden = false;
      statusEl.textContent = '✓ Hotovo';
      statusEl.style.color = '#2ecc71';
    }
  } catch (e) {
    statusEl.textContent = '✗ ' + (e as Error).message;
    statusEl.style.color = '#e74c3c';
  } finally {
    genBtn.disabled = false;
  }
}

export async function copyGenResult(): Promise<void> {
  const text = resultPre.textContent ?? '';
  await navigator.clipboard.writeText(text);
  const btn = document.getElementById('gen-copy-result-btn') as HTMLButtonElement;
  const orig = btn.textContent ?? '';
  btn.textContent = '✓ Zkopírováno';
  setTimeout(() => { btn.textContent = orig; }, 1500);
}
