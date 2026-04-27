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

  // Map location_id → lists of items and characters present there
  const locItems = {}, locChars = {};
  for (const n of (graphData.nodes || [])) {
    const lid = n.properties && n.properties.location_id;
    if (!lid) continue;
    if (n.type === 'renpy/item')      (locItems[lid] = locItems[lid] || []).push(n.properties.name || n.properties.id);
    if (n.type === 'renpy/character') (locChars[lid] = locChars[lid] || []).push(n.properties.name || n.properties.id);
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
    if (allExits.length === 0) {
      exitsLines = ['    return'];
    } else {
      exitsLines.push('    menu:');
      for (const exit of allExits) {
        if (exit.targetId) {
          exitsLines.push(`        "${exit.name}":`);
          exitsLines.push(`            jump location_${exit.targetId}`);
        } else {
          exitsLines.push(`        "${exit.name}":  # nepropojeno`);
          exitsLines.push(`            pass`);
        }
      }
      exitsLines.push(`    jump ${labelName}`);
    }

    try {
      const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
      let content;
      if (!existing) {
        content = [
          markerBlock(locId, 'header', headerContent),
          '',
          '    pass  # obsah lokace',
          '',
          markerBlock(locId, 'exits', exitsLines.join('\n')),
          '',
        ].join('\n');
        created.push(`locations/${locId}.rpy`);
      } else {
        content = updateMarkerRegion(existing, locId, 'header', headerContent);
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

    // footer: jump back to location or return
    const footerContent = p.location_id
      ? `    jump location_${p.location_id}`
      : '    return';

    try {
      const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
      let content;
      if (!existing) {
        content = [
          markerBlock(evtId, 'header', headerLines.join('\n')),
          '',
          '    pass  # dialog eventu',
          '',
          markerBlock(evtId, 'footer', footerContent),
          '',
        ].join('\n');
        created.push(`events/${evtId}.rpy`);
      } else {
        content = updateMarkerRegion(existing, evtId, 'header', headerLines.join('\n'));
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

    const stages = (p.stages || '').split('\n').map(s => s.trim()).filter(Boolean);
    const headerLines = [
      `# Quest: ${p.title || questId}`,
      ...(p.description ? [`# ${p.description}`] : []),
      `default ${questId}_active = False`,
      `default ${questId}_stage = 0`,
      ...(stages.length ? ['# Fáze:', ...stages.map((s, i) => `#   ${i}: ${s}`)] : []),
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

  const note = null;

  res.json({ ok: true, created, updated, errors, note });
});

// GET /api/scan
app.get('/api/scan', (req, res) => {
  const gameDir  = config.gameDir || projectDir;
  const locDir   = path.join(gameDir, 'locations');
  const evtDir   = path.join(gameDir, 'events');
  const questDir = path.join(gameDir, 'quests');

  const graphData = (() => {
    const p = graphFile();
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
  })();

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
  for (const dir of [locDir, evtDir, questDir]) {
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
    return res.status(400).json({ error: 'renpyExe není nakonfigurováno v .comfy.json' });
  }
  const { spawn } = require('child_process');
  const projectDir = config.gameDir ? path.dirname(config.gameDir) : '';
  spawn(config.renpyExe, [projectDir].filter(Boolean), { detached: true, stdio: 'ignore' }).unref();
  res.json({ ok: true });
});

// ── Helpers ──

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
