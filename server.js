const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const CONFIG_PATH = path.join(__dirname, '.comfy.json');
let config = { port: 3001, gameDir: '', renpyExe: '' };

if (fs.existsSync(CONFIG_PATH)) {
  try {
    Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch (e) {
    console.error('Chyba při čtení .comfy.json:', e.message);
  }
}

function graphFile() {
  const dir = config.gameDir || __dirname;
  return path.join(dir, 'comfy-graph.json');
}

// GET /api/config
app.get('/api/config', (req, res) => res.json(config));

// PUT /api/config
app.put('/api/config', (req, res) => {
  Object.assign(config, req.body);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  res.json({ ok: true });
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
    fs.writeFileSync(graphFile(), JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/export-rpy
app.post('/api/export-rpy', (req, res) => {
  const graphData = req.body;
  const gameDir = config.gameDir || path.join(__dirname, 'output');
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

    // header region — just the label declaration
    const headerContent = `label ${labelName}:`;

    // exits region — navigation menu at the bottom of the location
    let exitsLines = [];
    const connected = exits.filter((_, i) => connMap[i]);

    if (exits.length === 0) {
      exitsLines = ['    return'];
    } else {
      exitsLines.push('    menu:');
      for (let i = 0; i < exits.length; i++) {
        const name     = exits[i].name || `exit_${i + 1}`;
        const targetId = connMap[i];
        if (targetId) {
          exitsLines.push(`        "${name}":`);
          exitsLines.push(`            jump location_${targetId}`);
        } else {
          exitsLines.push(`        "${name}":  # nepropojeno`);
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

  const note = !config.gameDir
    ? `gameDir není nastaven — soubory uloženy do ${path.join(__dirname, 'output')}`
    : null;

  res.json({ ok: true, created, updated, errors, note });
});

// GET /api/scan
app.get('/api/scan', (req, res) => {
  const gameDir = config.gameDir || path.join(__dirname, 'output');
  const locDir  = path.join(gameDir, 'locations');
  const evtDir  = path.join(gameDir, 'events');

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
    if (node.type === 'renpy/location') filePath = path.join(locDir, `${id}.rpy`);
    else if (node.type === 'renpy/event') filePath = path.join(evtDir, `${id}.rpy`);
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
  for (const dir of [locDir, evtDir]) {
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
app.listen(port, () => {
  console.log(`⬡  Comfy-Renpy běží na http://localhost:${port}`);
  console.log(`   Graf: ${graphFile()}`);
});
