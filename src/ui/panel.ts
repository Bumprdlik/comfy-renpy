import { getSelectedNode, setSelectedNode } from '../graph/state';
import { scheduleSave } from './autosave';
import { escHtml } from '../graph/helpers';
import type { LocationNode } from '../graph/nodes/LocationNode';

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

function makeField(id: string, label: string, type: string, value: unknown, opts: { choices?: Array<{value: string; label: string}> } = {}): string {
  if (type === 'textarea') {
    return `<div class="field"><label for="${id}">${label}</label>` +
      `<textarea id="${id}" rows="3">${escHtml(value ?? '')}</textarea></div>`;
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
    html += `<hr class="section-div"><div class="section-label">Východy (exits)</div>`;
    html += `<div id="exits-list">`;
    const exits = (p['exits'] as Array<{name: string}>) || [];
    exits.forEach((exit, i) => {
      html += `<div class="exit-row">
        <input type="text" id="exit-${i}" value="${escHtml(exit.name || '')}"
               placeholder="název" oninput="updateExit(${i},this.value)">
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

  } else if (node.type === 'renpy/item') {
    html += makeField('prop-name', 'Název', 'text', p['name']);
    html += makeField('prop-desc', 'Popis', 'textarea', p['description']);

  } else if (node.type === 'renpy/character') {
    html += makeField('prop-name', 'Jméno', 'text', p['name']);
    html += makeField('prop-voice', 'Hlas / styl (pro AI)', 'textarea', p['voice']);
    html += makeField('prop-sprite', 'Sprite ID', 'text', p['sprite_id']);

  } else if (node.type === 'renpy/note') {
    html += makeField('prop-note-text', 'Text', 'textarea', p['text']);

  } else if (node.type === 'renpy/quest') {
    html += makeField('prop-title',  'Název questu', 'text',     p['title']);
    html += makeField('prop-desc',   'Popis',         'textarea', p['description']);
    html += makeField('prop-stages', 'Fáze (každá na řádku)', 'textarea', p['stages']);
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
  } else if (node.type === 'renpy/event') {
    bind('prop-location',      'location_id');
    bind('prop-trigger',       'trigger');
    bind('prop-trigger-label', 'trigger_label');
    bind('prop-prereq',        'prerequisite');
    bind('prop-time',          'time');
    bind('prop-priority',      'priority', v => parseInt(v) || 0);
    bind('prop-repeatable',    'repeatable');
    bind('prop-notes',         'notes');
  } else if (node.type === 'renpy/item') {
    bind('prop-name', 'name');
    bind('prop-desc', 'description');
  } else if (node.type === 'renpy/character') {
    bind('prop-name',   'name');
    bind('prop-voice',  'voice');
    bind('prop-sprite', 'sprite_id');
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
  locNode.properties.exits.splice(i, 1);
  locNode.syncExitSlots();
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
