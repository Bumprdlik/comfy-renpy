#!/usr/bin/env node
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib/litegraph', express.static(path.join(__dirname, 'node_modules/litegraph.js')));

// projectDir = where the user launched the server from (game dir when run from project)
const projectDir = process.cwd();
const serverDir  = __dirname;

const CONFIG_PATH = path.join(projectDir, '.comfy.json');
const { execSync } = require('child_process');
let hasVsCode = false;
try { execSync(process.platform === 'win32' ? 'where code' : 'which code', { stdio: 'ignore' }); hasVsCode = true; } catch {}

let config = {
  port: 3001, gameDir: '', renpyExe: '',
  aiProvider: 'none',    // 'none' | 'anthropic' | 'openai'
  anthropicKey: '',
  openaiKey: '', openaiBaseUrl: '', openaiModel: '',
};
let lastBackupTime = 0;

if (fs.existsSync(CONFIG_PATH)) {
  try {
    Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch (e) {
    console.error('Chyba při čtení .comfy.json:', e.message);
  }
}

console.log(`Comfy-Renpy │ projekt: ${projectDir}`);
if (projectDir !== serverDir) {
  console.log(`             │ server:  ${serverDir}`);
}

function openPath(p) {
  const { execFile, exec } = require('child_process');
  if (process.platform === 'win32') {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Invoke-Item -LiteralPath '${p.replace(/'/g, "''")}'`]);
  } else if (process.platform === 'darwin') {
    execFile('open', [p]);
  } else {
    exec(`xdg-open "${p}"`);
  }
}

function graphFile() {
  const dir = config.gameDir || projectDir;
  return path.join(dir, 'comfy-graph.json');
}

// GET /api/config — includes projectDir; never exposes raw keys
app.get('/api/config', (req, res) => {
  const { anthropicKey, openaiKey, ...safe } = config;
  res.json({ ...safe, projectDir, hasAnthropicKey: !!anthropicKey, hasOpenaiKey: !!openaiKey, hasVsCode });
});

// PUT /api/config
app.put('/api/config', (req, res) => {
  Object.assign(config, req.body);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  res.json({ ok: true });
});

// GET /api/check-gamedir?path=... — validates that a directory looks like a Ren'Py game/ folder
app.get('/api/check-gamedir', (req, res) => {
  const dir = String(req.query.path || '').trim();
  if (!dir) return res.json({ ok: true, warnings: [] });

  if (!fs.existsSync(dir)) {
    return res.json({ ok: false, warnings: [`Adresář neexistuje: ${dir}`] });
  }

  const warnings = [];
  const entries = fs.readdirSync(dir);
  const hasRpy = entries.some(e => e.endsWith('.rpy'));
  const hasRenpySdk = fs.existsSync(path.join(dir, 'renpy')) || fs.existsSync(path.join(dir, 'launcher'));
  const basename = path.basename(dir).toLowerCase();

  if (hasRenpySdk) {
    warnings.push('Vypadá to jako kořen Ren\'Py SDK, ne složka game/ projektu.');
  } else if (basename !== 'game') {
    const hasGameSubdir = fs.existsSync(path.join(dir, 'game'));
    if (hasGameSubdir) {
      warnings.push(`Složka obsahuje podsložku "game/" — správná cesta je pravděpodobně: ${path.join(dir, 'game')}`);
    } else {
      warnings.push(`Složka se nejmenuje "game" (je to "${path.basename(dir)}") — zkontroluj cestu.`);
    }
  }

  if (!hasRpy && !hasRenpySdk) {
    warnings.push('Nenalezeny žádné .rpy soubory — je toto správná složka game/?');
  }

  return res.json({ ok: warnings.length === 0, warnings });
});

// POST /api/browse-folder  — PowerShell + Shell.Application COM (no WinForms, fast)
app.post('/api/browse-folder', (req, res) => {
  if (process.platform !== 'win32') return res.json({ path: null });
  const { execFile } = require('child_process');
  const os = require('os');
  const initial = String(req.body?.initial || '').replace(/'/g, '');
  const ps = [
    '$shell = New-Object -ComObject Shell.Application',
    initial
      ? `$folder = $shell.BrowseForFolder(0, "Vyberte herní adresář (game/)", 0, '${initial}')`
      : `$folder = $shell.BrowseForFolder(0, "Vyberte herní adresář (game/)", 0)`,
    'if ($folder) { Write-Output $folder.Self.Path }',
  ].join('\n');
  const tmp = path.join(os.tmpdir(), `comfy-folder-${Date.now()}.ps1`);
  fs.writeFileSync(tmp, ps, 'utf8');
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', tmp],
    { timeout: 120000 }, (_err, stdout) => {
      try { fs.unlinkSync(tmp); } catch {}
      res.json({ path: stdout.trim() || null });
    });
});

// POST /api/browse-exe  — WPF OpenFileDialog (works from child process without message pump)
app.post('/api/browse-exe', (req, res) => {
  if (process.platform !== 'win32') return res.json({ path: null });
  const { execFile } = require('child_process');
  const os = require('os');
  const initial = String(req.body?.initial || '').replace(/'/g, '');
  const initDir = initial ? path.dirname(initial) : '';
  const ps = [
    'Add-Type -AssemblyName PresentationFramework',
    '$d = New-Object Microsoft.Win32.OpenFileDialog',
    '$d.Title = "Vyberte Ren\'Py spustitelný soubor"',
    '$d.Filter = "Ren\'Py (renpy.exe)|renpy.exe|Executable (*.exe)|*.exe|All files (*.*)|*.*"',
    initDir ? `$d.InitialDirectory = '${initDir}'` : '',
    '$null = $d.ShowDialog()',
    'if ($d.FileName) { Write-Output $d.FileName }',
  ].filter(Boolean).join('\n');
  const tmp = path.join(os.tmpdir(), `comfy-exe-${Date.now()}.ps1`);
  fs.writeFileSync(tmp, ps, 'utf8');
  execFile('powershell', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', tmp],
    { timeout: 120000 }, (_err, stdout) => {
      try { fs.unlinkSync(tmp); } catch {}
      res.json({ path: stdout.trim() || null });
    });
});

// GET /api/check-graph  — checks if comfy-graph.json exists in current gameDir
app.get('/api/check-graph', (req, res) => {
  const p = graphFile();
  if (!fs.existsSync(p)) return res.json({ exists: false, nodeCount: 0 });
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    res.json({ exists: true, nodeCount: (data.nodes || []).length });
  } catch {
    res.json({ exists: false, nodeCount: 0 });
  }
});

// GET /api/graph
app.get('/api/graph', (req, res) => {
  const p = graphFile();
  if (!fs.existsSync(p)) return res.json(null);
  try {
    res.json(JSON.parse(fs.readFileSync(p, 'utf8')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/graph
app.put('/api/graph', (req, res) => {
  try {
    const gf = graphFile();
    const now = Date.now();
    if (fs.existsSync(gf) && now - lastBackupTime > 2 * 60 * 1000) {
      const backupDir = path.join(__dirname, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fs.copyFileSync(gf, path.join(backupDir, `comfy-graph_${ts}.json`));
      lastBackupTime = now;
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('comfy-graph_') && f.endsWith('.json'))
        .sort();
      while (files.length > 10) fs.unlinkSync(path.join(backupDir, files.shift()));
    }
    fs.writeFileSync(gf, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/export-rpy
app.post('/api/export-rpy', (req, res) => {
  const graphData = req.body;
  const gameDir = config.gameDir || projectDir;
  const locDir  = path.join(gameDir, 'locations');
  const evtDir  = path.join(gameDir, 'events');

  try {
    fs.mkdirSync(locDir, { recursive: true });
    fs.mkdirSync(evtDir, { recursive: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Nelze vytvořit výstupní adresáře: ' + e.message });
  }

  // Index nodes by LiteGraph ID
  const nodeById = {};
  for (const n of (graphData.nodes || [])) nodeById[n.id] = n;

  // Map location_id → lists of items, characters, and events present there
  const locItems = {}, locChars = {}, locItemNodes = {}, locCharNodes = {}, locEventNodes = {};
  for (const n of (graphData.nodes || [])) {
    const lid = n.properties && n.properties.location_id;
    if (!lid) continue;
    if (n.type === 'renpy/item') {
      (locItems[lid]     = locItems[lid]     || []).push(n.properties.name || n.properties.id);
      (locItemNodes[lid] = locItemNodes[lid] || []).push(n.properties);
    }
    if (n.type === 'renpy/character') {
      (locChars[lid]     = locChars[lid]     || []).push(n.properties.name || n.properties.id);
      (locCharNodes[lid] = locCharNodes[lid] || []).push(n.properties);
    }
    if (n.type === 'renpy/event') {
      (locEventNodes[lid] = locEventNodes[lid] || []).push(n.properties);
    }
  }

  // Build exit connection map: {nodeId: {outputSlot: targetLocationId}}
  const exitTargets = {};
  for (const link of (graphData.links || [])) {
    const [, originId, originSlot, targetId] = link;
    const src = nodeById[originId];
    const dst = nodeById[targetId];
    if (!src || !dst || src.type !== 'renpy/location') continue;
    if (!exitTargets[originId]) exitTargets[originId] = {};
    exitTargets[originId][originSlot] = dst.properties.id;
  }

  // Pre-build reverse exits injected by bidir connections
  const reverseExits = {}; // { targetLocId: [{ name, fromLocId }] }
  for (const node of Object.values(nodeById)) {
    if (node.type !== 'renpy/location') continue;
    const exits  = node.properties.exits || [];
    const connMap = exitTargets[node.id] || {};
    for (let i = 0; i < exits.length; i++) {
      if (!exits[i].bidir) continue;
      const targetLocId = connMap[i];
      if (!targetLocId) continue;
      const returnName = exits[i].returnName || 'zpět';
      (reverseExits[targetLocId] = reverseExits[targetLocId] || []).push({ name: returnName, fromLocId: node.properties.id });
    }
  }

  const created = [], updated = [], errors = [];

  // ── Location nodes ──
  for (const node of Object.values(nodeById)) {
    if (node.type !== 'renpy/location') continue;
    const p = node.properties;
    if (!p.id) { errors.push('Location bez ID přeskočena'); continue; }

    const locId     = p.id;
    const labelName = `location_${locId}`;
    const filePath  = path.join(locDir, `${locId}.rpy`);
    const connMap   = exitTargets[node.id] || {};
    const exits     = p.exits || [];

    // header region — label + roster comments
    const rosterLines = [];
    if (locChars[locId] && locChars[locId].length) rosterLines.push(`# Postavy: ${locChars[locId].join(', ')}`);
    if (locItems[locId] && locItems[locId].length)  rosterLines.push(`# Itemy:   ${locItems[locId].join(', ')}`);
    const headerContent = [`label ${labelName}:`, ...rosterLines].join('\n');

    // Collect all exits: own + injected reverse bidir exits
    const allExits = exits.map((e, i) => ({ name: e.name || `exit_${i + 1}`, targetId: connMap[i] }));
    for (const rev of (reverseExits[locId] || [])) {
      allExits.push({ name: rev.name, targetId: rev.fromLocId });
    }

    // exits region — navigation menu at the bottom of the location
    let exitsLines = [];
    const itemsHere  = locItemNodes[locId]  || [];
    const eventsHere = locEventNodes[locId] || [];
    const autoEvents = eventsHere.filter(e => e.trigger === 'auto_enter').sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const menuEvents = eventsHere.filter(e => e.trigger === 'menu_choice').sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // auto_enter events: called before menu (event header handles its own prereq guard)
    for (const evt of autoEvents) {
      exitsLines.push(`    call ${evt.id}`);
    }

    const hasMenu = allExits.length > 0 || itemsHere.length > 0 || menuEvents.length > 0;
    if (!hasMenu) {
      exitsLines.push('    return');
    } else {
      exitsLines.push('    menu:');
      // menu_choice events
      for (const evt of menuEvents) {
        if (!evt.id) continue;
        const trigLabel = (evt.trigger_label || evt.id).replace(/"/g, '\\"');
        const showCond  = !evt.repeatable ? ` if not ${evt.id}_seen` : '';
        exitsLines.push(`        "${trigLabel}"${showCond}:`);
        exitsLines.push(`            call ${evt.id}`);
      }
      // navigation exits
      for (const exit of allExits) {
        if (exit.targetId) {
          exitsLines.push(`        "${exit.name}":`);
          exitsLines.push(`            jump location_${exit.targetId}`);
        } else {
          exitsLines.push(`        "${exit.name}":  # nepropojeno`);
          exitsLines.push(`            pass`);
        }
      }
      // item pickups
      for (const item of itemsHere) {
        if (!item.id) continue;
        const pickupName = (item.name || item.id).replace(/"/g, '\\"');
        exitsLines.push(`        "Sebrat: ${pickupName}" if not comfy_has("${item.id}"):`);
        exitsLines.push(`            call item_${item.id}`);
      }
      exitsLines.push(`    jump ${labelName}`);
    }

    // body region — description as narrator line (only written on first export)
    const desc = (p.description || '').trim().replace(/"/g, '\\"');
    const bodyContent = desc ? `    "${desc}"` : '    pass  # obsah lokace';

    try {
      const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
      let content;
      if (!existing) {
        content = [
          markerBlock(locId, 'header', headerContent),
          '',
          markerBlock(locId, 'body', bodyContent),
          '',
          markerBlock(locId, 'exits', exitsLines.join('\n')),
          '',
        ].join('\n');
        created.push(`locations/${locId}.rpy`);
      } else {
        content = updateMarkerRegion(existing, locId, 'header', headerContent);
        // body is human/AI territory — never overwrite on re-export
        content = updateMarkerRegion(content,  locId, 'exits',  exitsLines.join('\n'));
        updated.push(`locations/${locId}.rpy`);
      }
      fs.writeFileSync(filePath, content, 'utf8');
    } catch (e) {
      errors.push(`locations/${locId}.rpy: ${e.message}`);
    }
  }

  // ── Event nodes ──
  for (const node of Object.values(nodeById)) {
    if (node.type !== 'renpy/event') continue;
    const p = node.properties;
    if (!p.id) { errors.push('Event bez ID přeskočen'); continue; }

    const evtId    = p.id;
    const filePath = path.join(evtDir, `${evtId}.rpy`);

    // header: label + optional prerequisite guard
    const headerLines = [`label ${evtId}:`];
    if (p.prerequisite) {
      headerLines.push(`    if not (${p.prerequisite}):`);
      headerLines.push(`        return`);
    }

    // footer: mark event seen and return to caller (location exits loop handles the jump)
    const footerContent = `    $ ${evtId}_seen = True\n    return`;

    // body: body_text override (only written on first export — body is human/AI territory)
    let evtBodyContent;
    if (p.body_text && String(p.body_text).trim()) {
      evtBodyContent = String(p.body_text).split('\n').map(l => '    ' + l).join('\n');
    } else {
      const trigLabel = (p.trigger_label || p.trigger || evtId).replace(/"/g, '\\"');
      evtBodyContent = `    "… ${trigLabel} …"  # nahraď vlastním dialogem`;
    }

    try {
      const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
      let content;
      if (!existing) {
        content = [
          markerBlock(evtId, 'header', headerLines.join('\n')),
          '',
          markerBlock(evtId, 'body', evtBodyContent),
          '',
          markerBlock(evtId, 'footer', footerContent),
          '',
        ].join('\n');
        created.push(`events/${evtId}.rpy`);
      } else {
        content = updateMarkerRegion(existing, evtId, 'header', headerLines.join('\n'));
        // body is human/AI territory — never overwrite on re-export
        content = updateMarkerRegion(content,  evtId, 'footer', footerContent);
        updated.push(`events/${evtId}.rpy`);
      }
      fs.writeFileSync(filePath, content, 'utf8');
    } catch (e) {
      errors.push(`events/${evtId}.rpy: ${e.message}`);
    }
  }

  // ── Quest nodes ──
  const questDir = path.join(gameDir, 'quests');
  for (const node of Object.values(nodeById)) {
    if (node.type !== 'renpy/quest') continue;
    const p = node.properties;
    if (!p.id) { errors.push('Quest bez ID přeskočen'); continue; }

    const questId = p.id;
    const filePath = path.join(questDir, `${questId}.rpy`);
    try { fs.mkdirSync(questDir, { recursive: true }); } catch (_e) {}

    const stages = parseStages(p.stages);
    const headerLines = [
      `# Quest: ${p.title || questId}`,
      ...(p.description ? [`# ${p.description}`] : []),
      `default ${questId}_active = False`,
      `default ${questId}_stage = 0`,
      `default ${questId}_completed = False`,
      ...(stages.length ? ['# Fáze:', ...stages.map((s, i) => `#   ${i}: ${s.text}${s.hint ? ` | ${s.hint}` : ''}`)] : []),
    ].join('\n');

    try {
      const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
      let content;
      if (!existing) {
        content = [
          markerBlock(questId, 'header', headerLines),
          '',
          '# Zde piš quest logiku (podmínky, checkpointy, apod.)',
          '',
        ].join('\n');
        created.push(`quests/${questId}.rpy`);
      } else {
        content = updateMarkerRegion(existing, questId, 'header', headerLines);
        updated.push(`quests/${questId}.rpy`);
      }
      fs.writeFileSync(filePath, content, 'utf8');
    } catch (e) {
      errors.push(`quests/${questId}.rpy: ${e.message}`);
    }
  }

  // ── Item nodes ──
  const itemDir = path.join(gameDir, 'items');
  for (const node of Object.values(nodeById)) {
    if (node.type !== 'renpy/item') continue;
    const p = node.properties;
    if (!p.id) { errors.push('Item bez ID přeskočen'); continue; }
    const itemId  = p.id;
    const filePath = path.join(itemDir, `${itemId}.rpy`);
    try { fs.mkdirSync(itemDir, { recursive: true }); } catch (_e) {}

    const itemName = (p.name || itemId).replace(/"/g, '\\"');
    const itemDesc = (p.description || '').trim().replace(/"/g, '\\"');
    const itemHeaderContent = `label item_${itemId}:`;
    let itemBodyLines;
    if (p.body_text && String(p.body_text).trim()) {
      itemBodyLines = String(p.body_text).split('\n').map(l => '    ' + l);
    } else {
      itemBodyLines = [
        `    "Sebral jsi: ${itemName}."`,
        ...(itemDesc ? [`    "${itemDesc}"`] : []),
        `    $ comfy_give("${itemId}")`,
      ];
    }
    const itemFooterContent = '    return';

    try {
      const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
      let content;
      if (!existing) {
        content = [
          markerBlock(itemId, 'header', itemHeaderContent),
          '',
          markerBlock(itemId, 'body', itemBodyLines.join('\n')),
          '',
          markerBlock(itemId, 'footer', itemFooterContent),
          '',
        ].join('\n');
        created.push(`items/${itemId}.rpy`);
      } else {
        content = updateMarkerRegion(existing, itemId, 'header', itemHeaderContent);
        content = updateMarkerRegion(content,  itemId, 'footer', itemFooterContent);
        updated.push(`items/${itemId}.rpy`);
      }
      fs.writeFileSync(filePath, content, 'utf8');
    } catch (e) {
      errors.push(`items/${itemId}.rpy: ${e.message}`);
    }
  }

  // ── comfy_init.rpy — inventory helpers + character defines ──
  const initFile = path.join(gameDir, 'comfy_init.rpy');
  const allChars = Object.values(nodeById).filter(n => n.type === 'renpy/character').map(n => n.properties);
  const initContent = [
    'default comfy_inventory = []',
    '',
    'init python:',
    '    def comfy_has(item_id):',
    '        return item_id in comfy_inventory',
    '',
    '    def comfy_give(item_id):',
    '        if item_id not in comfy_inventory:',
    '            comfy_inventory.append(item_id)',
    '            return True',
    '        return False',
    '',
    '    def comfy_quest_start(quest_id):',
    '        setattr(store, quest_id + "_active", True)',
    '        setattr(store, quest_id + "_stage", 1)',
    '        setattr(store, quest_id + "_completed", False)',
    '',
    '    def comfy_quest_stage(quest_id):',
    '        return getattr(store, quest_id + "_stage", 0)',
    '',
    '    def comfy_quest_advance(quest_id):',
    '        meta = comfy_quests_meta.get(quest_id)',
    '        if not meta: return',
    '        cur = getattr(store, quest_id + "_stage", 0)',
    '        nxt = cur + 1',
    '        if nxt >= len(meta["stages"]):',
    '            setattr(store, quest_id + "_active", False)',
    '            setattr(store, quest_id + "_completed", True)',
    '        else:',
    '            setattr(store, quest_id + "_stage", nxt)',
    '',
    '    def comfy_quest_active(quest_id):',
    '        return getattr(store, quest_id + "_active", False)',
    '',
    '    def comfy_quest_completed(quest_id):',
    '        return getattr(store, quest_id + "_completed", False)',
  ].join('\n');

  // comfy_quests_meta — quest metadata dict (stages + hints), regenerated each export
  const allQuestNodes = Object.values(nodeById).filter(n => n.type === 'renpy/quest');
  const questsMetaPy = allQuestNodes.length
    ? `default comfy_quests_meta = {\n${allQuestNodes.map(q => {
        const qStages = parseStages(q.properties.stages);
        const stagesArr = qStages.map(s => `"${s.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(', ');
        const hintsArr  = qStages.map(s => `"${s.hint.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(', ');
        const qTitle = (q.properties.title || q.properties.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `    "${q.properties.id}": {"title": "${qTitle}", "stages": [${stagesArr}], "hints": [${hintsArr}]},`;
      }).join('\n')}\n}`
    : `default comfy_quests_meta = {}`;

  // event_flags — default {evtId}_seen for each event node
  const allEventNodes = Object.values(nodeById).filter(n => n.type === 'renpy/event' && n.properties?.id);
  const eventFlagsContent = allEventNodes.length
    ? allEventNodes.map(n => `default ${n.properties.id}_seen = False`).join('\n')
    : '# Žádné eventy';

  const charLines = allChars.filter(c => c.id).map(c => {
    const name = (c.name || c.id).replace(/"/g, '\\"');
    const extra = c.sprite_id ? `, image="${c.sprite_id}"` : '';
    return `define ${c.id} = Character("${name}"${extra})`;
  });
  const charsContent = charLines.length ? charLines.join('\n') : '# Žádné postavy';

  try {
    const existingInit = fs.existsSync(initFile) ? fs.readFileSync(initFile, 'utf8') : null;
    let initFileContent;
    if (!existingInit) {
      initFileContent = [
        markerBlock('__comfy__', 'init', initContent),
        '',
        markerBlock('__comfy__', 'quests_meta', questsMetaPy),
        '',
        markerBlock('__comfy__', 'event_flags', eventFlagsContent),
        '',
        markerBlock('__comfy__', 'characters', charsContent),
        '',
      ].join('\n');
      created.push('comfy_init.rpy');
    } else {
      initFileContent = updateMarkerRegion(existingInit, '__comfy__', 'init', initContent);
      initFileContent = updateMarkerRegion(initFileContent, '__comfy__', 'quests_meta', questsMetaPy);
      initFileContent = updateMarkerRegion(initFileContent, '__comfy__', 'event_flags', eventFlagsContent);
      initFileContent = updateMarkerRegion(initFileContent, '__comfy__', 'characters', charsContent);
      updated.push('comfy_init.rpy');
    }
    fs.writeFileSync(initFile, initFileContent, 'utf8');
  } catch (e) {
    errors.push(`comfy_init.rpy: ${e.message}`);
  }

  const note = null;

  // Emit comfy_screens.rpy (quest log UI) — only on first export, never overwrite
  const screensFile = path.join(gameDir, 'comfy_screens.rpy');
  if (!fs.existsSync(screensFile)) {
    const screensContent = [
      '# comfy-renpy: Quest log UI',
      '# Tento soubor byl vygenerován při prvním exportu.',
      '# Můžeš ho libovolně upravit — comfy-renpy ho znovu nepřepíše.',
      '# Pokud chceš výchozí podobu obnovit, smaž soubor a spusť Export znovu.',
      '',
      'screen comfy_quest_button():',
      '    zorder 100',
      '    if comfy_quests_meta:',
      '        $ active_count = sum(1 for q in comfy_quests_meta if comfy_quest_active(q))',
      '        $ done_count = sum(1 for q in comfy_quests_meta if comfy_quest_completed(q))',
      '        if active_count + done_count > 0:',
      '            frame:',
      '                align (0.98, 0.02)',
      '                background "#000000aa"',
      '                padding (10, 6)',
      '                textbutton "Questy [active_count]" action Show("comfy_quest_log"):',
      '                    text_size 18',
      '                    text_color "#ffffff"',
      '                    text_hover_color "#f1c40f"',
      '',
      'screen comfy_quest_log():',
      '    modal True',
      '    zorder 200',
      '    frame:',
      '        align (0.5, 0.5)',
      '        xsize 640',
      '        background "#1a1a1aee"',
      '        padding (24, 20)',
      '        vbox:',
      '            spacing 12',
      '            text "Questy" size 28 color "#ecf0f1"',
      '            $ actives = [q for q in comfy_quests_meta if comfy_quest_active(q)]',
      '            $ dones = [q for q in comfy_quests_meta if comfy_quest_completed(q)]',
      '            if actives:',
      '                text "Aktivní" size 18 color "#f39c12"',
      '                for qid in actives:',
      '                    $ meta = comfy_quests_meta[qid]',
      '                    $ stage = comfy_quest_stage(qid)',
      '                    $ stage_text = meta["stages"][stage] if stage < len(meta["stages"]) else ""',
      '                    $ hint_text = meta["hints"][stage] if stage < len(meta["hints"]) else ""',
      '                    $ stage_plus_one = stage + 1',
      '                    $ total = len(meta["stages"])',
      '                    frame:',
      '                        background "#2c3e5099"',
      '                        padding (12, 8)',
      '                        xfill True',
      '                        vbox:',
      '                            spacing 4',
      '                            text meta["title"] size 16 color "#ecf0f1"',
      '                            text "Krok [stage_plus_one]/[total]: [stage_text]" size 14 color "#bdc3c7"',
      '                            if hint_text:',
      '                                text "Hint: [hint_text]" size 13 color "#95a5a6" italic True',
      '            if dones:',
      '                text "Dokončené" size 18 color "#27ae60"',
      '                for qid in dones:',
      '                    $ meta = comfy_quests_meta[qid]',
      '                    text meta["title"] size 14 color "#7f8c8d"',
      '            if not actives and not dones:',
      '                text "Žádné questy." size 14 color "#7f8c8d"',
      '            textbutton "Zavřít" action Hide("comfy_quest_log"):',
      '                xalign 1.0',
      '                text_size 16',
    ].join('\n');
    try {
      fs.writeFileSync(screensFile, screensContent + '\n', 'utf8');
      created.push('comfy_screens.rpy');
    } catch (e) {
      errors.push(`comfy_screens.rpy: ${e.message}`);
    }
  }

  // Wire up script.rpy to jump to start location
  let scriptConflict = null;
  const startLoc = pickStartLocation(graphData.nodes);
  if (startLoc) {
    const scriptFile = path.join(gameDir, 'script.rpy');
    const startLabel = `label start:\n    show screen comfy_quest_button\n    jump location_${startLoc.properties.id}`;
    try {
      if (!fs.existsSync(scriptFile)) {
        fs.writeFileSync(scriptFile, markerBlock('__comfy__', 'start', startLabel) + '\n', 'utf8');
        created.push('script.rpy');
      } else {
        const existing = fs.readFileSync(scriptFile, 'utf8');
        const hasMarker = /# \[COMFY-START id=__comfy__ kind=start\]/.test(existing);
        const isDefault = !hasMarker
          && /You've created a new Ren'Py game\./.test(existing)
          && /define e = Character\("Eileen"\)/.test(existing);
        if (hasMarker) {
          fs.writeFileSync(scriptFile, updateMarkerRegion(existing, '__comfy__', 'start', startLabel), 'utf8');
          updated.push('script.rpy');
        } else if (isDefault) {
          fs.writeFileSync(scriptFile, markerBlock('__comfy__', 'start', startLabel) + '\n', 'utf8');
          updated.push('script.rpy');
        } else {
          scriptConflict = { startId: startLoc.properties.id, existingPreview: existing.slice(0, 500) };
        }
      }
    } catch (e) {
      errors.push(`script.rpy: ${e.message}`);
    }
  }

  res.json({ ok: true, created, updated, errors, note, scriptConflict });
});

// POST /api/write-dialogue — write AI-generated content into kind=body marker
app.post('/api/write-dialogue', (req, res) => {
  const { lgNodeId, content, graphData } = req.body;
  const gameDir = config.gameDir || projectDir;

  const nodeById = {};
  for (const n of (graphData.nodes || [])) nodeById[n.id] = n;
  const node = nodeById[lgNodeId];
  if (!node) return res.status(404).json({ ok: false, error: 'Uzel nenalezen' });

  const p = node.properties || {};
  const id = p.id;
  if (!id) return res.status(400).json({ ok: false, error: 'Uzel nemá ID' });

  let filePath;
  if (node.type === 'renpy/location')   filePath = path.join(gameDir, 'locations', `${id}.rpy`);
  else if (node.type === 'renpy/event') filePath = path.join(gameDir, 'events',    `${id}.rpy`);
  else return res.status(400).json({ ok: false, error: 'Zápis podporován jen pro Location a Event uzly' });

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: `Soubor neexistuje. Nejdřív proveď Export .rpy.` });
  }

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = fs.readFileSync(filePath, 'utf8');
  const bodyBlock = markerBlock(id, 'body', content);
  const bodyRe = new RegExp(`# \\[COMFY-START id=${esc(id)} kind=body\\][\\s\\S]*?# \\[COMFY-END\\]`);

  let updated;
  if (bodyRe.test(existing)) {
    updated = existing.replace(bodyRe, bodyBlock);
  } else {
    // Insert before exits or footer marker if no body marker exists yet
    const anchorRe = new RegExp(`(# \\[COMFY-START id=${esc(id)} kind=(?:exits|footer)\\])`);
    updated = anchorRe.test(existing)
      ? existing.replace(anchorRe, bodyBlock + '\n\n$1')
      : existing.trimEnd() + '\n\n' + bodyBlock + '\n';
  }

  try {
    fs.writeFileSync(filePath, updated, 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/scan — accepts graph data from frontend (same as export, avoids disk read race)
app.post('/api/scan', (req, res) => {
  const gameDir  = config.gameDir || projectDir;
  const locDir   = path.join(gameDir, 'locations');
  const evtDir   = path.join(gameDir, 'events');
  const questDir = path.join(gameDir, 'quests');
  const itemDir  = path.join(gameDir, 'items');

  const graphData = req.body && req.body.nodes ? req.body : null;

  if (!graphData) return res.json({ nodes: {}, drift: [] });

  const nodeStatuses = {};
  const drift = [];

  for (const node of (graphData.nodes || [])) {
    const p    = node.properties;
    const id   = p && p.id;
    if (!id) continue;

    let filePath;
    if (node.type === 'renpy/location')   filePath = path.join(locDir,   `${id}.rpy`);
    else if (node.type === 'renpy/event') filePath = path.join(evtDir,   `${id}.rpy`);
    else if (node.type === 'renpy/quest') filePath = path.join(questDir, `${id}.rpy`);
    else if (node.type === 'renpy/item')  filePath = path.join(itemDir,  `${id}.rpy`);
    else continue;

    if (!fs.existsSync(filePath)) {
      nodeStatuses[id] = 'missing';
      continue;
    }

    const content  = fs.readFileSync(filePath, 'utf8');
    const kind     = node.type === 'renpy/location' ? 'header' : 'header';
    const hasMarker = content.includes(`# [COMFY-START id=${id} kind=${kind}]`);

    if (!hasMarker) {
      drift.push(`${id}: soubor existuje, ale chybí COMFY markery`);
      nodeStatuses[id] = 'drift';
      continue;
    }

    // Quest and Item files are structural-only — no dialog needed, marker = ok
    if (node.type === 'renpy/quest' || node.type === 'renpy/item') {
      nodeStatuses[id] = 'ok';
      continue;
    }

    // written = has dialogue content beyond just "pass"
    const bodyLines = content
      .split('\n')
      .filter(l => !l.trim().startsWith('#') && l.trim() !== '' && l.trim() !== 'pass');
    const hasDialogue = bodyLines.some(l =>
      /^\s+("|[a-z]\s+"|narrator\s+"|return|jump|menu|if|show|hide|play)/.test(l)
    );

    nodeStatuses[id] = hasDialogue ? 'written' : 'stub';
  }

  // Detect orphan labels (files not referenced in graph)
  const knownIds = new Set(
    (graphData.nodes || []).map(n => n.properties && n.properties.id).filter(Boolean)
  );
  for (const dir of [locDir, evtDir, questDir, itemDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.rpy')) continue;
      const fileId = file.replace(/\.rpy$/, '');
      if (!knownIds.has(fileId)) {
        drift.push(`${fileId}: soubor existuje, ale uzel v grafu chybí (orphan)`);
      }
    }
  }

  res.json({ nodes: nodeStatuses, drift });
});

// POST /api/validate
app.post('/api/validate', (req, res) => {
  const graphData = req.body;
  const nodes  = graphData.nodes  || [];
  const links  = graphData.links  || [];
  const errors   = [];
  const warnings = [];

  const locationIds = new Set();
  const idCount = {};

  for (const node of nodes) {
    const type = node.type;
    if (!['renpy/location','renpy/event','renpy/item','renpy/character','renpy/quest'].includes(type)) continue;
    const p  = node.properties || {};
    const id = p.id;
    if (!id) {
      const display = p.label || p.name || `uzel #${node.id}`;
      errors.push(`${type.split('/')[1]}: "${display}" nemá nastavené ID`);
    } else {
      idCount[id] = (idCount[id] || 0) + 1;
      if (type === 'renpy/location') locationIds.add(id);
    }
  }

  for (const [id, count] of Object.entries(idCount)) {
    if (count > 1) errors.push(`Duplicitní ID "${id}" — použito ${count}×`);
  }

  for (const node of nodes) {
    if (node.type !== 'renpy/event') continue;
    const p = node.properties || {};
    if (!p.id) continue;
    if (!p.location_id) {
      warnings.push(`Event "${p.id}" nemá nastavenou lokaci (location_id)`);
    } else if (!locationIds.has(p.location_id)) {
      errors.push(`Event "${p.id}" odkazuje na neexistující lokaci "${p.location_id}"`);
    }
  }

  for (const node of nodes) {
    if (!['renpy/item', 'renpy/character'].includes(node.type)) continue;
    const p = node.properties || {};
    if (!p.id || !p.location_id) continue;
    if (!locationIds.has(p.location_id)) {
      const kind = node.type === 'renpy/item' ? 'Item' : 'Character';
      warnings.push(`${kind} "${p.id}" odkazuje na neexistující lokaci "${p.location_id}"`);
    }
  }

  const connectedLgIds = new Set();
  for (const link of links) { connectedLgIds.add(link[1]); connectedLgIds.add(link[3]); }
  for (const node of nodes) {
    if (node.type !== 'renpy/location') continue;
    const p = node.properties || {};
    if (p.id && !connectedLgIds.has(node.id)) {
      warnings.push(`Location "${p.id}" (${p.label || ''}) není propojena s žádnou jinou lokací`);
    }
  }

  const startLocs = nodes.filter(n => n.type === 'renpy/location' && n.properties?.isStart);
  if (startLocs.length > 1) {
    const ids = startLocs.map(n => n.properties.id).join(', ');
    warnings.push(`Více lokací označeno jako Start (${ids}) — bude použita první.`);
  }

  res.json({ errors, warnings, ok: errors.length === 0 });
});

// POST /api/preview-rpy
app.post('/api/preview-rpy', (req, res) => {
  const { graphData, lgNodeId } = req.body;
  const nodeById = {};
  for (const n of (graphData.nodes || [])) nodeById[n.id] = n;
  const node = nodeById[lgNodeId];
  if (!node) return res.status(404).json({ error: 'Uzel nenalezen' });

  const exitTargets = {};
  for (const link of (graphData.links || [])) {
    const [, originId, originSlot, targetId] = link;
    const src = nodeById[originId], dst = nodeById[targetId];
    if (!src || !dst || src.type !== 'renpy/location') continue;
    if (!exitTargets[originId]) exitTargets[originId] = {};
    exitTargets[originId][originSlot] = dst.properties.id;
  }

  const p = node.properties || {};
  if (node.type === 'renpy/location') {
    if (!p.id) return res.json({ content: '# Chyba: Location bez ID', filename: null });
    const locId = p.id;
    const connMap = exitTargets[node.id] || {};
    const exits = p.exits || [];
    let exitsLines = [];
    if (exits.length === 0) {
      exitsLines = ['    return'];
    } else {
      exitsLines.push('    menu:');
      for (let i = 0; i < exits.length; i++) {
        const name = exits[i].name || `exit_${i + 1}`;
        const targetId = connMap[i];
        if (targetId) {
          exitsLines.push(`        "${name}":`, `            jump location_${targetId}`);
        } else {
          exitsLines.push(`        "${name}":  # nepropojeno`, `            pass`);
        }
      }
      exitsLines.push(`    jump location_${locId}`);
    }
    const content = [
      markerBlock(locId, 'header', `label location_${locId}:`),
      '', '    pass  # obsah lokace', '',
      markerBlock(locId, 'exits', exitsLines.join('\n')),
    ].join('\n');
    return res.json({ content, filename: `locations/${locId}.rpy` });

  } else if (node.type === 'renpy/event') {
    if (!p.id) return res.json({ content: '# Chyba: Event bez ID', filename: null });
    const evtId = p.id;
    const headerLines = [`label ${evtId}:`];
    if (p.prerequisite) { headerLines.push(`    if not (${p.prerequisite}):`, `        return`); }
    const footerContent = p.location_id ? `    jump location_${p.location_id}` : '    return';
    const content = [
      markerBlock(evtId, 'header', headerLines.join('\n')),
      '', '    pass  # dialog eventu', '',
      markerBlock(evtId, 'footer', footerContent),
    ].join('\n');
    return res.json({ content, filename: `events/${evtId}.rpy` });

  } else {
    return res.json({ content: `# ${node.type} — tento typ uzlu se neexportuje do .rpy`, filename: null });
  }
});

// POST /api/open-vscode — open gameDir in VS Code
app.post('/api/open-vscode', (req, res) => {
  const dir = config.gameDir || projectDir;
  const { execFile } = require('child_process');
  execFile('code', [dir], { shell: true }, (err) => {
    if (err) res.status(500).json({ error: 'VS Code (code) není dostupný v PATH.' });
    else res.json({ ok: true });
  });
});

// POST /api/open-game-dir — open gameDir in system file manager
app.post('/api/open-game-dir', (req, res) => {
  const dir = config.gameDir || projectDir;
  openPath(dir);
  res.json({ ok: true });
});

// POST /api/open-file — open .rpy file in the OS default editor
app.post('/api/open-file', (req, res) => {
  const { id, nodeType } = req.body;
  const gameDir = config.gameDir || projectDir;
  const subdir = nodeType === 'renpy/location' ? 'locations'
               : nodeType === 'renpy/event'    ? 'events'
               : nodeType === 'renpy/quest'    ? 'quests'
               : null;
  if (!subdir) return res.status(400).json({ error: 'Nepodporovaný typ uzlu' });
  const filePath = path.join(gameDir, subdir, `${id}.rpy`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: `Soubor neexistuje: ${filePath}` });
  openPath(filePath);
  res.json({ ok: true });
});

// POST /api/generate-dialogue — Anthropic or OpenAI-compatible
app.post('/api/generate-dialogue', async (req, res) => {
  const { prompt } = req.body;
  const provider = config.aiProvider || 'none';

  if (provider === 'anthropic' && config.anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
      return res.json({ result: data.content[0].text, hasKey: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (provider === 'openai' && config.openaiKey) {
    const baseUrl = (config.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model   = config.openaiModel || 'gpt-4o-mini';
    try {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
      return res.json({ result: data.choices?.[0]?.message?.content ?? '', hasKey: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.json({ prompt, hasKey: false });
});

// POST /api/launch
app.post('/api/launch', (req, res) => {
  if (!config.renpyExe) {
    return res.status(400).json({ error: 'renpyExe není nakonfigurováno v Nastavení' });
  }
  if (!fs.existsSync(config.renpyExe)) {
    return res.status(400).json({ error: `Soubor nenalezen: ${config.renpyExe}` });
  }
  const { spawn } = require('child_process');
  const launchDir = config.gameDir ? path.dirname(config.gameDir) : '';
  const args = launchDir ? [launchDir] : [];

  let responded = false;
  const child = spawn(config.renpyExe, args, {
    detached: true,
    stdio:    'ignore',
    cwd:      path.dirname(config.renpyExe), // SDK needs to run from its own dir
  });
  child.on('error', err => {
    console.error('[launch] chyba:', err.message);
    if (!responded) { responded = true; res.status(500).json({ error: err.message }); }
  });
  // wait 600 ms for early spawn failure before declaring success
  setTimeout(() => {
    if (!responded) { responded = true; child.unref(); res.json({ ok: true }); }
  }, 600);
});

// POST /api/wire-script — manually wire script.rpy after conflict
app.post('/api/wire-script', (req, res) => {
  const { mode, startId } = req.body;
  if (!startId) return res.status(400).json({ ok: false, error: 'Chybí startId' });
  const gameDir = config.gameDir || projectDir;
  const scriptFile = path.join(gameDir, 'script.rpy');
  const startLabel = `label start:\n    jump location_${startId}`;
  try {
    if (mode === 'overwrite') {
      fs.writeFileSync(scriptFile, markerBlock('__comfy__', 'start', startLabel) + '\n', 'utf8');
    } else if (mode === 'append') {
      const existing = fs.existsSync(scriptFile) ? fs.readFileSync(scriptFile, 'utf8') : '';
      const comment = `# Přidej do svého label start: jump location_${startId}\n`;
      fs.writeFileSync(scriptFile,
        existing.trimEnd() + '\n\n' + comment + markerBlock('__comfy__', 'start', startLabel) + '\n',
        'utf8');
    } else {
      return res.status(400).json({ ok: false, error: 'Neznámý mode' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Helpers ──

function pickStartLocation(nodes) {
  const locs = (nodes || []).filter(n => n.type === 'renpy/location' && n.properties?.id);
  return locs.find(n => n.properties.isStart) || locs[0] || null;
}

function parseStages(stagesStr) {
  return (stagesStr || '').split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const idx = trimmed.indexOf('|');
    if (idx === -1) return { text: trimmed, hint: '' };
    return { text: trimmed.slice(0, idx).trim(), hint: trimmed.slice(idx + 1).trim() };
  }).filter(Boolean);
}

function markerBlock(id, kind, content) {
  return `# [COMFY-START id=${id} kind=${kind}]\n${content}\n# [COMFY-END]`;
}

function updateMarkerRegion(fileContent, id, kind, newInner) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `# \\[COMFY-START id=${esc(id)} kind=${esc(kind)}\\][\\s\\S]*?# \\[COMFY-END\\]`
  );
  const block = markerBlock(id, kind, newInner);
  return re.test(fileContent)
    ? fileContent.replace(re, block)
    : fileContent.trimEnd() + '\n\n' + block + '\n';
}

const port = config.port || 3001;
const server = app.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`⬡  Comfy-Renpy běží na ${url}`);
  console.log(`   Graf: ${graphFile()}`);

  // Auto-open browser when run as CLI (not during npm run dev where Vite handles it)
  if (process.env.npm_lifecycle_event !== 'dev') {
    const { exec } = require('child_process');
    const cmd = process.platform === 'win32'   ? `start "" "${url}"`
              : process.platform === 'darwin'   ? `open "${url}"`
              :                                   `xdg-open "${url}"`;
    exec(cmd);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✗  Port ${port} je obsazený — pravděpodobně už běží jiná instance Comfy-Renpy.`);
    console.error(`   Otevři prohlížeč na http://localhost:${port} nebo ukonči předchozí instanci.\n`);
    process.exit(1);
  } else {
    throw err;
  }
});
