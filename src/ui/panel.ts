import { getSelectedNode, setSelectedNode, graph } from '../graph/state';
import { scheduleSave } from './autosave';
import { escHtml } from '../graph/helpers';
import type { LocationNode } from '../graph/nodes/LocationNode';

let _hasAnthropicKey = false;
export function setPanelHasKey(v: boolean): void { _hasAnthropicKey = v; }

const propsHeader = document.getElementById('props-header') as HTMLElement;
const propsBody   = document.getElementById('props-body')   as HTMLElement;

const TYPE_NAMES: Record<string, string> = {
  'renpy/location':  'Location',
  'renpy/event':     'Event',
  'renpy/item':      'Item',
  'renpy/character': 'Character',
  'renpy/note':      'Note',
  'renpy/quest':     'Quest',
};

function makeField(id: string, label: string, type: string, value: unknown, opts: { choices?: Array<{value: string; label: string}>; rows?: number; help?: string } = {}): string {
  if (type === 'textarea') {
    const helpHtml = opts.help ? `<div class="field-help">${escHtml(opts.help)}</div>` : '';
    return `<div class="field"><label for="${id}">${label}</label>` +
      `<textarea id="${id}" rows="${opts.rows ?? 3}">${escHtml(value ?? '')}</textarea>${helpHtml}</div>`;
  }
  if (type === 'select') {
    const options = (opts.choices ?? []).map(c =>
      `<option value="${escHtml(c.value)}" ${c.value === value ? 'selected' : ''}>${escHtml(c.label)}</option>`
    ).join('');
    return `<div class="field"><label for="${id}">${label}</label><select id="${id}">${options}</select></div>`;
  }
  if (type === 'checkbox') {
    return `<div class="field"><div class="checkbox-row">` +
      `<input type="checkbox" id="${id}" ${value ? 'checked' : ''}>` +
      `<label for="${id}" style="text-transform:none;color:#bbb;font-size:12px;">${label}</label>` +
      `</div></div>`;
  }
  return `<div class="field"><label for="${id}">${label}</label>` +
    `<input type="${type}" id="${id}" value="${escHtml(String(value ?? ''))}"></div>`;
}

export function renderPanel(node: LGraphNode): void {
  propsHeader.textContent = TYPE_NAMES[node.type] ?? node.type;
  const p = node.properties;
  let html = node.type === 'renpy/note' ? '' : makeField('prop-id', 'ID (Ren\'Py)', 'text', p['id']);

  if (node.type === 'renpy/location') {
    html += makeField('prop-label', 'Název', 'text', p['label']);
    html += makeField('prop-desc', 'Popis', 'textarea', p['description']);
    html += makeField('prop-isstart', '🏁 Start lokace', 'checkbox', p['isStart']);
    html += `<hr class="section-div"><div class="section-label">Východy (exits)</div>`;
    html += `<div id="exits-list">`;
    const exits = (p['exits'] as import('../types').LocationProps['exits']) || [];
    exits.forEach((exit, i) => {
      const bidir = exit.bidir ?? false;
      html += `<div class="exit-row">
        <button class="bidir-btn${bidir ? ' active' : ''}" onclick="toggleExitBidir(${i})" title="${bidir ? 'Obousměrný — klikni pro jednosměrný' : 'Jednosměrný — klikni pro obousměrný'}">↔</button>
        <input type="text" id="exit-${i}" value="${escHtml(exit.name || '')}"
               placeholder="${bidir ? 'tam' : 'název'}" oninput="updateExit(${i},this.value)">
        ${bidir ? `<input type="text" id="exit-ret-${i}" value="${escHtml(exit.returnName || '')}" class="exit-ret" placeholder="zpět" oninput="updateExitReturn(${i},this.value)">` : ''}
        <button class="del-btn" onclick="removeExit(${i})">×</button>
      </div>`;
    });
    html += `</div>`;
    html += `<button class="add-exit-btn" onclick="addExit()">+ Přidat exit</button>`;

  } else if (node.type === 'renpy/event') {
    html += makeField('prop-location', 'Lokace (ID)', 'text', p['location_id']);
    html += makeField('prop-trigger', 'Trigger', 'select', p['trigger'], { choices: [
      { value: 'auto_enter',   label: 'auto_enter — při vstupu' },
      { value: 'menu_choice',  label: 'menu_choice — volba v menu' },
      { value: 'condition',    label: 'condition — Python podmínka' },
    ]});
    html += makeField('prop-trigger-label', 'Trigger label / text volby', 'text', p['trigger_label']);
    html += makeField('prop-prereq', 'Prerekvizita (Python)', 'text', p['prerequisite']);
    html += makeField('prop-time', 'Čas dne', 'select', p['time'], { choices: [
      { value: 'any',       label: 'any' },
      { value: 'morning',   label: 'morning' },
      { value: 'afternoon', label: 'afternoon' },
      { value: 'evening',   label: 'evening' },
      { value: 'night',     label: 'night' },
    ]});
    html += makeField('prop-priority', 'Priorita', 'number', p['priority']);
    html += makeField('prop-repeatable', 'Opakuje se', 'checkbox', p['repeatable']);
    html += makeField('prop-notes', 'Poznámky', 'textarea', p['notes']);
    html += makeField('prop-body', 'Default dialog (jen pro první export)', 'textarea', p['body_text'], { rows: 5, help: 'Volitelně: dialog zapsaný do .rpy při prvním exportu. Comfy-renpy body marker pak nikdy nepřepíše.' });
    html += `<button class="gen-btn" onclick="openGenerate(${node.id},${_hasAnthropicKey})">✨ Generovat dialog</button>`;

  } else if (node.type === 'renpy/item') {
    html += makeField('prop-name',     'Název',              'text',     p['name']);
    html += makeField('prop-desc',     'Popis',              'textarea', p['description']);
    html += makeField('prop-location', 'Lokace (location_id)', 'text',   p['location_id']);
    html += makeField('prop-pickup-cond', 'Podmínka sebrání (Python)', 'text', p['pickup_condition'], {});
    html += makeField('prop-body', 'Default dialog (jen pro první export)', 'textarea', p['body_text'], { rows: 5, help: 'Volitelně: dialog zapsaný do .rpy při prvním exportu. Comfy-renpy body marker pak nikdy nepřepíše.' });

  } else if (node.type === 'renpy/character') {
    html += makeField('prop-name',     'Jméno',                'text',     p['name']);
    html += makeField('prop-location', 'Lokace (location_id)', 'text',     p['location_id']);
    html += makeField('prop-voice',    'Hlas / styl (pro AI)', 'textarea', p['voice']);
    html += makeField('prop-sprite',   'Sprite ID',            'text',     p['sprite_id']);

  } else if (node.type === 'renpy/note') {
    html += makeField('prop-note-text', 'Text', 'textarea', p['text']);

  } else if (node.type === 'renpy/quest') {
    html += makeField('prop-title',  'Název questu', 'text',     p['title']);
    html += makeField('prop-desc',   'Popis',         'textarea', p['description']);
    html += makeField('prop-stages', 'Fáze (každá na řádku)', 'textarea', p['stages'], { rows: 6, help: 'Tip: přidej hint za | na každém řádku, např. "Promluvit s Elarou | Sedí v hospodě"' });
  }

  propsBody.innerHTML = html;
  attachListeners(node);
}

export function clearPanel(): void {
  setSelectedNode(null);
  propsHeader.textContent = 'Vlastnosti';
  propsBody.innerHTML =
    '<div class="placeholder">Klikni na uzel<br>pro zobrazení vlastností.<br><br>Pravý klik na canvas<br>pro kontextové menu.</div>';
}

function attachListeners(node: LGraphNode): void {
  function bind(elId: string, propKey: string, transform?: (v: string) => unknown): void {
    const el = document.getElementById(elId) as HTMLInputElement | null;
    if (!el) return;
    const ev = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      node.properties[propKey] = el.type === 'checkbox' ? el.checked
        : transform ? transform(el.value)
        : el.value;
      node.setDirtyCanvas(true, true);
      scheduleSave();
    });
  }

  bind('prop-id', 'id');

  if (node.type === 'renpy/location') {
    bind('prop-label', 'label');
    bind('prop-desc',  'description');
    const startEl = document.getElementById('prop-isstart') as HTMLInputElement | null;
    if (startEl) {
      startEl.addEventListener('change', () => {
        if (startEl.checked) {
          for (const n of graph._nodes) {
            if (n !== node && n.type === 'renpy/location' && n.properties['isStart']) {
              n.properties['isStart'] = false;
              n.setDirtyCanvas(true);
            }
          }
        }
        node.properties['isStart'] = startEl.checked;
        node.setDirtyCanvas(true, true);
        scheduleSave();
      });
    }
  } else if (node.type === 'renpy/event') {
    bind('prop-location',      'location_id');
    bind('prop-trigger',       'trigger');
    bind('prop-trigger-label', 'trigger_label');
    bind('prop-prereq',        'prerequisite');
    bind('prop-time',          'time');
    bind('prop-priority',      'priority', v => parseInt(v) || 0);
    bind('prop-repeatable',    'repeatable');
    bind('prop-notes',         'notes');
    bind('prop-body',          'body_text');
  } else if (node.type === 'renpy/item') {
    bind('prop-name',         'name');
    bind('prop-desc',         'description');
    bind('prop-location',     'location_id');
    bind('prop-pickup-cond',  'pickup_condition');
    bind('prop-body',         'body_text');
  } else if (node.type === 'renpy/character') {
    bind('prop-name',     'name');
    bind('prop-location', 'location_id');
    bind('prop-voice',    'voice');
    bind('prop-sprite',   'sprite_id');
  } else if (node.type === 'renpy/note') {
    const el = document.getElementById('prop-note-text') as HTMLTextAreaElement | null;
    if (el) el.addEventListener('input', () => {
      node.properties['text'] = el.value;
      node.setDirtyCanvas(true, true);
      scheduleSave();
    });
  } else if (node.type === 'renpy/quest') {
    bind('prop-title',  'title');
    bind('prop-desc',   'description');
    bind('prop-stages', 'stages');
  }
}

export function toggleExitBidir(i: number): void {
  const node = getSelectedNode();
  if (!node || node.type !== 'renpy/location') return;
  const locNode = node as unknown as LocationNode;
  const exit = locNode.properties.exits[i];
  exit.bidir = !exit.bidir;
  if (exit.bidir) removeReverseExit(locNode, i);
  locNode.syncExitSlots();
  locNode.setDirtyCanvas(true, true);
  renderPanel(locNode);
  scheduleSave();
}

function removeReverseExit(locNode: LocationNode, outSlot: number): void {
  const linkIds = locNode.outputs[outSlot]?.links;
  if (!linkIds || linkIds.length === 0 || !locNode.graph) return;
  const g = (locNode.graph as unknown as { links: Record<number, Record<string, unknown>> }).links;
  for (const lid of linkIds) {
    const link = g[lid];
    if (!link) continue;
    const targetNode = locNode.graph.getNodeById(link['target_id'] as number);
    if (!targetNode || targetNode.type !== 'renpy/location') continue;
    const targetLoc = targetNode as unknown as LocationNode;
    if (!targetLoc.outputs) continue;
    for (let j = 0; j < targetLoc.outputs.length; j++) {
      const outLinks = targetLoc.outputs[j]?.links;
      if (!outLinks) continue;
      for (const outLid of outLinks) {
        const outLink = g[outLid];
        if (outLink && (outLink['target_id'] as number) === locNode.id && !targetLoc.properties.exits[j]?.bidir) {
          targetLoc.removeExitAt(j);
          targetLoc.setDirtyCanvas(true, true);
          return;
        }
      }
    }
  }
}

export function updateExitReturn(i: number, value: string): void {
  const node = getSelectedNode();
  if (!node || node.type !== 'renpy/location') return;
  const locNode = node as unknown as LocationNode;
  locNode.properties.exits[i].returnName = value;
  scheduleSave();
}

export function updateExit(i: number, value: string): void {
  const node = getSelectedNode();
  if (!node || node.type !== 'renpy/location') return;
  const locNode = node as unknown as LocationNode;
  locNode.properties.exits[i].name = value;
  locNode.syncExitSlots();
  locNode.setDirtyCanvas(true, true);
  scheduleSave();
}

export function removeExit(i: number): void {
  const node = getSelectedNode();
  if (!node || node.type !== 'renpy/location') return;
  const locNode = node as unknown as LocationNode;
  locNode.removeExitAt(i);
  locNode.setDirtyCanvas(true, true);
  renderPanel(locNode);
  scheduleSave();
}

export function addExit(): void {
  const node = getSelectedNode();
  if (!node || node.type !== 'renpy/location') return;
  const locNode = node as unknown as LocationNode;
  locNode.properties.exits.push({ name: 'exit_' + (locNode.properties.exits.length + 1) });
  locNode.syncExitSlots();
  locNode.setDirtyCanvas(true, true);
  renderPanel(locNode);
  scheduleSave();
}
