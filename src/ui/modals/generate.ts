import { graph } from '../../graph/state';
import { apiGenerateDialogue } from '../../api';
import { scheduleSave } from '../autosave';

const overlay    = document.getElementById('gen-overlay')   as HTMLElement;
const titleEl    = document.getElementById('gen-title')     as HTMLElement;
const promptArea = document.getElementById('gen-prompt')    as HTMLTextAreaElement;
const resultPre  = document.getElementById('gen-result')    as HTMLElement;
const statusEl   = document.getElementById('gen-status')    as HTMLElement;
const genBtn     = document.getElementById('gen-api-btn')   as HTMLButtonElement;
const noKeyHint  = document.getElementById('gen-no-key')    as HTMLElement;

let _prompt  = '';
let _nodeId  = -1;
let _hasKey  = false;

export function buildPrompt(nodeId: number): string {
  const node = graph.getNodeById(nodeId);
  if (!node) return '';
  const p = node.properties;
  const locId = String(p['location_id'] ?? '');

  const locNode = graph._nodes.find(n => n.type === 'renpy/location' && n.properties['id'] === locId);
  const chars   = graph._nodes.filter(n => n.type === 'renpy/character' && String(n.properties['location_id']) === locId);
  const items   = graph._nodes.filter(n => n.type === 'renpy/item'      && String(n.properties['location_id']) === locId);

  const allQuests = graph._nodes.filter(n => n.type === 'renpy/quest');
  const allItems  = graph._nodes.filter(n => n.type === 'renpy/item');

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
      lines.push(`- **${ip['name']}** (id: \`${ip['id']}\`): ${ip['description'] ?? ''}`);
    }
    lines.push('');
  }

  // Global context
  lines.push('## Globální kontext (pro reference)');

  if (allQuests.length > 0) {
    lines.push('### Všechny questy v hře:');
    for (const q of allQuests) {
      const qp = q.properties;
      const stages = String(qp['stages'] ?? '').trim().split('\n').filter(Boolean);
      const stageStr = stages.join(' → ');
      lines.push(`- \`${qp['id']}\` "${qp['title']}": ${stageStr || '(žádné fáze)'}`);
    }
    lines.push('');
  }

  if (allItems.length > 0) {
    lines.push('### Všechny itemy v hře:');
    for (const it of allItems) {
      const ip = it.properties;
      lines.push(`- \`${ip['id']}\` "${ip['name']}"`);
    }
    lines.push('');
  }

  lines.push('### Helper funkce (Python calls v Ren\'Py):');
  lines.push('- `$ comfy_quest_start("id")` — spustí quest (nastav stage=1)');
  lines.push('- `$ comfy_quest_advance("id")` — posune quest na další fázi');
  lines.push('- `$ comfy_give("id")` — přidá item do inventáře');
  lines.push('- `if comfy_has("id"):` — podmínka: hráč má item');
  lines.push('- `if comfy_quest_active("id"):` — podmínka: quest běží');
  lines.push('- `if comfy_quest_completed("id"):` — podmínka: quest dokončen');
  lines.push('- `comfy_quest_stage("id")` — vrátí číslo aktuální fáze');
  lines.push('');

  // Structured quest/item instructions from node fields
  const questAction = String(p['quest_action'] ?? 'none');
  const questId     = String(p['quest_id'] ?? '').trim();
  const givesItem   = String(p['gives_item'] ?? '').trim();

  const questInstructions: string[] = [];
  if (questAction === 'start' && questId) {
    questInstructions.push(`- Na vhodném místě dialogu volej: \`$ comfy_quest_start("${questId}")\``);
  } else if (questAction === 'advance' && questId) {
    questInstructions.push(`- Na vhodném místě dialogu volej: \`$ comfy_quest_advance("${questId}")\``);
  }
  if (givesItem) {
    questInstructions.push(`- Hráč v tomto eventu obdrží item — volej: \`$ comfy_give("${givesItem}")\``);
  }

  if (questInstructions.length > 0) {
    lines.push('## Quest / inventář pokyny pro tento event');
    lines.push(...questInstructions);
    lines.push('');
  }

  // Existing body_text for revision context
  const existingBody = String(p['body_text'] ?? '').trim();
  if (existingBody) {
    lines.push('## Stávající dialog (reviduj / vylepši):');
    lines.push(existingBody);
    lines.push('');
  }

  lines.push('## Pokyny pro výstup');
  lines.push(`- Vygeneruj validní Ren\'Py kód s labelem \`label event_${p['id']}:\``);
  lines.push('- Jako mluvčí použi Ren\'Py ID postavy (malá písmena, bez diakritiky)');
  lines.push('- Respektuj hlasové profily a povahu každé postavy');
  lines.push('- Dialog piš v češtině');
  if (questInstructions.length > 0) lines.push('- Použij správně helper funkce dle pokynů výše');
  lines.push('- Na konci přidej `return`');

  return lines.join('\n');
}

export function openGenerate(nodeId: number, hasKey: boolean): void {
  const node = graph.getNodeById(nodeId);
  if (!node) return;
  _nodeId = nodeId;
  _prompt = buildPrompt(nodeId);
  _hasKey = hasKey;

  titleEl.textContent = `✨ Generovat dialog — ${node.properties['id'] ?? nodeId}`;
  promptArea.value    = _prompt;
  resultPre.textContent = '';
  resultPre.hidden    = true;
  statusEl.textContent = '';
  genBtn.hidden        = !hasKey;
  noKeyHint.hidden     = hasKey;
  const writeBtn = document.getElementById('gen-write-btn') as HTMLButtonElement | null;
  if (writeBtn) writeBtn.hidden = true;

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
  if (!_hasKey) {
    statusEl.textContent = '✗ API klíč není nastaven — nastav ho v Nastavení';
    statusEl.style.color = '#e74c3c';
    return;
  }
  statusEl.textContent = '⟳ Generuji…';
  statusEl.style.color = '#aaa';
  resultPre.hidden = true;
  genBtn.disabled = true;

  try {
    const data = await apiGenerateDialogue(_prompt);
    if (data.error) throw new Error(data.error);
    if (!data.hasKey) throw new Error('API klíč není nastaven — nastav ho v Nastavení');
    if (data.result) {
      resultPre.textContent = data.result;
      resultPre.hidden = false;
      statusEl.textContent = '✓ Hotovo';
      statusEl.style.color = '#2ecc71';
      const writeBtn = document.getElementById('gen-write-btn') as HTMLButtonElement | null;
      if (writeBtn) writeBtn.hidden = false;
    }
  } catch (e) {
    statusEl.textContent = '✗ ' + (e as Error).message;
    statusEl.style.color = '#e74c3c';
  } finally {
    genBtn.disabled = false;
  }
}

export function writeGenResult(): void {
  const content = resultPre.textContent ?? '';
  if (!content) return;
  const node = graph.getNodeById(_nodeId);
  if (!node) {
    statusEl.textContent = '✗ Uzel nenalezen';
    statusEl.style.color = '#e74c3c';
    return;
  }
  node.properties['body_text'] = content;
  scheduleSave();
  statusEl.textContent = '✓ Uloženo do body_text — zapíše se při exportu';
  statusEl.style.color = '#2ecc71';
  setTimeout(() => closeGenerate(), 800);
}

export async function copyGenResult(): Promise<void> {
  const text = resultPre.textContent ?? '';
  await navigator.clipboard.writeText(text);
  const btn = document.getElementById('gen-copy-result-btn') as HTMLButtonElement;
  const orig = btn.textContent ?? '';
  btn.textContent = '✓ Zkopírováno';
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

export function setBatchGenVisible(visible: boolean): void {
  const btn = document.getElementById('batch-gen-btn') as HTMLElement | null;
  if (btn) btn.hidden = !visible;
}

export async function batchGenerateDialogues(): Promise<void> {
  const events = graph._nodes.filter(n =>
    n.type === 'renpy/event' &&
    !String(n.properties['body_text'] ?? '').trim()
  );
  if (events.length === 0) {
    alert('Všechny eventy už mají body_text. Není co generovat.');
    return;
  }
  const approxSec = events.length * 5;
  if (!confirm(`Vygenerovat dialog pro ${events.length} eventů? (proběhne sekvenčně, ~${approxSec}s)`)) return;

  let done = 0;
  let failed = 0;
  for (const evt of events) {
    try {
      const prompt = buildPrompt(evt.id);
      const data = await apiGenerateDialogue(prompt);
      if (data.error) throw new Error(data.error);
      if (data.result) {
        evt.properties['body_text'] = data.result;
        done++;
      }
    } catch (e) {
      failed++;
      console.error(`Event ${evt.properties['id']}:`, e);
    }
  }
  scheduleSave();
  alert(`Hotovo: ${done} vygenerováno, ${failed} selhalo.`);
}
