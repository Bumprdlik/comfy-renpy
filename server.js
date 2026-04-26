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

// POST /api/export-rpy  — Fáze 3
app.post('/api/export-rpy', (req, res) => {
  res.json({ ok: false, message: 'Export .rpy bude implementován ve Fázi 3.' });
});

// GET /api/scan  — Fáze 4
app.get('/api/scan', (req, res) => {
  res.json({ nodes: {}, drift: [] });
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

const port = config.port || 3001;
app.listen(port, () => {
  console.log(`⬡  Comfy-Renpy běží na http://localhost:${port}`);
  console.log(`   Graf: ${graphFile()}`);
});
