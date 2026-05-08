'use strict';

const { extractComfyCalls, extractStageConstraints } = require('./server-checker');

const MAX_STATES = 50000;

// ── prereq evaluator ──────────────────────────────────────────────────────────

// Returns true/false/null (null = unknown variable → branch both ways)
function evalPrereq(pyStr, state) {
  if (!pyStr || !pyStr.trim()) return true;
  try {
    return evalExpr(tokenize(pyStr.trim()), state);
  } catch (_) {
    return null;
  }
}

function tokenize(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    if (s.slice(i, i + 3) === 'not') { tokens.push('not'); i += 3; continue; }
    if (s.slice(i, i + 3) === 'and') { tokens.push('and'); i += 3; continue; }
    if (s.slice(i, i + 2) === 'or')  { tokens.push('or');  i += 2; continue; }
    if (s[i] === '(') { tokens.push('('); i++; continue; }
    if (s[i] === ')') { tokens.push(')'); i++; continue; }
    // Grab word/number/operator token
    const m = s.slice(i).match(/^(comfy_quest_(?:active|stage|completed|active)\s*\(\s*"[^"]+"\s*\)\s*(?:[><=!]=?)\s*\d+|comfy_quest_(?:active|completed)\s*\(\s*"[^"]+"\s*\)|comfy_has\s*\(\s*"[^"]+"\s*\)|\w+_seen|True|False|\d+)/);
    if (m) { tokens.push(m[1]); i += m[1].length; continue; }
    i++; // skip unknown char
  }
  return tokens;
}

function evalExpr(tokens, state) {
  let pos = 0;

  function peek() { return tokens[pos]; }
  function consume() { return tokens[pos++]; }

  function parseOr() {
    let left = parseAnd();
    while (peek() === 'or') {
      consume();
      const right = parseAnd();
      if (left === true || right === true) left = true;
      else if (left === null || right === null) left = null;
      else left = false;
    }
    return left;
  }

  function parseAnd() {
    let left = parseNot();
    while (peek() === 'and') {
      consume();
      const right = parseNot();
      if (left === false || right === false) left = false;
      else if (left === null || right === null) left = null;
      else left = true;
    }
    return left;
  }

  function parseNot() {
    if (peek() === 'not') {
      consume();
      const val = parseNot();
      if (val === null) return null;
      return !val;
    }
    return parseAtom();
  }

  function parseAtom() {
    if (peek() === '(') {
      consume();
      const val = parseOr();
      if (peek() === ')') consume();
      return val;
    }
    const tok = consume();
    if (!tok) return null;

    if (tok === 'True')  return true;
    if (tok === 'False') return false;

    // comfy_quest_active("X")
    {
      const m = tok.match(/^comfy_quest_active\s*\(\s*"([^"]+)"\s*\)$/);
      if (m) return state.qActive[m[1]] !== undefined;
    }
    // comfy_quest_completed("X")
    {
      const m = tok.match(/^comfy_quest_completed\s*\(\s*"([^"]+)"\s*\)$/);
      if (m) return state.qDone.includes(m[1]);
    }
    // comfy_quest_stage("X") <op> N  (might be combined in token or split)
    {
      const m = tok.match(/^comfy_quest_stage\s*\(\s*"([^"]+)"\s*\)\s*(==|>=|<=|<|>)\s*(\d+)$/);
      if (m) {
        const stage = state.qActive[m[1]] ?? 0;
        const n = parseInt(m[3], 10);
        return applyOp(stage, m[2], n);
      }
    }
    // comfy_has("X")
    {
      const m = tok.match(/^comfy_has\s*\(\s*"([^"]+)"\s*\)$/);
      if (m) return state.inv.includes(m[1]);
    }
    // <id>_seen
    {
      const m = tok.match(/^(\w+)_seen$/);
      if (m) return state.seen.includes(m[1]);
    }
    // Unknown → null
    return null;
  }

  return parseOr();
}

function applyOp(a, op, b) {
  if (op === '==') return a === b;
  if (op === '!=') return a !== b;
  if (op === '>=' ) return a >= b;
  if (op === '<=' ) return a <= b;
  if (op === '>'  ) return a >  b;
  if (op === '<'  ) return a <  b;
  return null;
}

// ── state utilities ───────────────────────────────────────────────────────────

function hashState(s) {
  return s.loc + '|' +
    s.inv.slice().sort().join(',') + '|' +
    Object.entries(s.qActive).sort().map(([k, v]) => k + ':' + v).join(',') + '|' +
    s.qDone.slice().sort().join(',') + '|' +
    s.seen.slice().sort().join(',');
}

function cloneState(s) {
  return {
    loc:     s.loc,
    inv:     s.inv.slice(),
    qActive: Object.assign({}, s.qActive),
    qDone:   s.qDone.slice(),
    seen:    s.seen.slice(),
  };
}

// Apply body_text effects to state; returns modified clone
function applyEffects(bodyText, evtId, questMeta, state) {
  const ns = cloneState(state);
  if (!ns.seen.includes(evtId)) ns.seen.push(evtId);

  if (!bodyText) return ns;
  const calls = extractComfyCalls(bodyText);

  for (const qid of calls.questStart) {
    if (!ns.qActive[qid] && !ns.qDone.includes(qid)) {
      ns.qActive[qid] = 1;
    }
  }
  for (const qid of calls.questAdvance) {
    if (ns.qActive[qid] !== undefined) {
      const meta = questMeta[qid];
      const stageCount = meta ? meta.stages.length : 0;
      const next = (ns.qActive[qid] || 0) + 1;
      if (stageCount && next >= stageCount) {
        delete ns.qActive[qid];
        if (!ns.qDone.includes(qid)) ns.qDone.push(qid);
      } else {
        ns.qActive[qid] = next;
      }
    }
  }
  for (const iid of calls.itemGive) {
    if (!ns.inv.includes(iid)) ns.inv.push(iid);
  }

  return ns;
}

// ── BFS simulator ─────────────────────────────────────────────────────────────

function runSimulation(graphData) {
  const nodes = graphData.nodes || [];
  const links = graphData.links || [];

  // Build lookups
  const nodeById = {};
  for (const n of nodes) nodeById[n.id] = n;

  const locationNodes = nodes.filter(n => n.type === 'renpy/location' && n.properties?.id);
  const eventNodes    = nodes.filter(n => n.type === 'renpy/event'    && n.properties?.id);
  const itemNodes     = nodes.filter(n => n.type === 'renpy/item'     && n.properties?.id);
  const questNodes    = nodes.filter(n => n.type === 'renpy/quest'    && n.properties?.id);

  // quest meta (for stage counting)
  const questMeta = {};
  for (const q of questNodes) {
    const p = q.properties;
    const stages = (p.stages || '').split('\n').filter(s => s.trim()).map(line => {
      const idx = line.indexOf('|');
      return idx === -1 ? line.trim() : line.slice(0, idx).trim();
    });
    questMeta[p.id] = { stages };
  }

  // Build adjacency: locId → [targetLocId]
  const exitTargets = {}; // { nodeId → { outSlot → targetPropId } }
  for (const link of links) {
    const [, originId, originSlot, targetId] = link;
    const src = nodeById[originId], dst = nodeById[targetId];
    if (!src || !dst || src.type !== 'renpy/location') continue;
    if (!exitTargets[originId]) exitTargets[originId] = {};
    exitTargets[originId][originSlot] = dst.properties.id;
  }

  const locAdjacency = {}; // propId → [targetPropId]
  for (const n of locationNodes) {
    const targets = Object.values(exitTargets[n.id] || {}).filter(Boolean);
    locAdjacency[n.properties.id] = targets;
    // bidir reverse
    const exits = n.properties.exits || [];
    exits.forEach((e, i) => {
      if (!e.bidir) return;
      const tid = (exitTargets[n.id] || {})[i];
      if (!tid) return;
      if (!locAdjacency[tid]) locAdjacency[tid] = [];
      if (!locAdjacency[tid].includes(n.properties.id)) locAdjacency[tid].push(n.properties.id);
    });
  }

  // events per location
  const locEvents = {};  // locId → EventProps[]
  const locItems  = {};  // locId → ItemProps[]
  for (const n of eventNodes) {
    const lid = n.properties.location_id;
    if (!lid) continue;
    (locEvents[lid] = locEvents[lid] || []).push(n.properties);
  }
  for (const n of itemNodes) {
    const lid = n.properties.location_id;
    if (!lid) continue;
    (locItems[lid] = locItems[lid] || []).push(n.properties);
  }

  // Find start location
  const startLoc = locationNodes.find(n => n.properties.isStart) || locationNodes[0];
  if (!startLoc) {
    return { issues: [{ severity: 'warning', code: 'no-locations', nodeId: null, message: 'Graf neobsahuje žádné lokace.', hint: null }], stats: {} };
  }

  const initialState = {
    loc:     startLoc.properties.id,
    inv:     [],
    qActive: {},
    qDone:   [],
    seen:    [],
  };

  const reachableEvents = new Set();
  const reachableItems  = new Set();
  const reachableStages = new Set(); // "questId:N" or "questId:done"
  const nondeterministicPrereqs = new Set(); // event ids with null prereq eval

  // Fire auto_enter events at the start location before BFS begins
  const autoEvtsAtStart = (locEvents[startLoc.properties.id] || [])
    .filter(e => e.trigger === 'auto_enter')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  let initialStates = [initialState];
  for (const evt of autoEvtsAtStart) {
    if (!evt.id) continue;
    const nextStates = [];
    for (const st of initialStates) {
      if (st.seen.includes(evt.id)) { nextStates.push(st); continue; }
      const ev = evalPrereq(evt.prerequisite, st);
      if (ev === null) {
        nondeterministicPrereqs.add(evt.id);
        nextStates.push(st);
        nextStates.push(applyEffects(evt.body_text, evt.id, questMeta, st));
        reachableEvents.add(evt.id);
      } else if (ev) {
        nextStates.push(applyEffects(evt.body_text, evt.id, questMeta, st));
        reachableEvents.add(evt.id);
      } else {
        nextStates.push(st);
      }
    }
    initialStates = nextStates;
  }

  const visited = new Set(initialStates.map(hashState));
  const queue   = [...initialStates];
  initialStates.forEach(s => recordStages(s, reachableStages));

  let exploded = false;

  while (queue.length > 0) {
    if (visited.size >= MAX_STATES) { exploded = true; break; }
    const s = queue.shift();

    const neighbors = locAdjacency[s.loc] || [];
    const eventsHere = locEvents[s.loc] || [];
    const itemsHere  = locItems[s.loc]  || [];

    // Generate next states

    // 1. Move to adjacent location
    for (const nextLoc of neighbors) {
      const ns = cloneState(s);
      ns.loc = nextLoc;

      // Auto-enter events at nextLoc (apply in priority order, if prereq met and not seen)
      const autoEvts = (locEvents[nextLoc] || [])
        .filter(e => e.trigger === 'auto_enter')
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));

      let states = [ns];
      for (const evt of autoEvts) {
        if (!evt.id) continue;
        const nextStates = [];
        for (const st of states) {
          if (st.seen.includes(evt.id)) { nextStates.push(st); continue; }
          const ev = evalPrereq(evt.prerequisite, st);
          if (ev === null) {
            nondeterministicPrereqs.add(evt.id);
            // branch: fire and not fire
            nextStates.push(st);
            nextStates.push(applyEffects(evt.body_text, evt.id, questMeta, st));
            reachableEvents.add(evt.id);
          } else if (ev) {
            nextStates.push(applyEffects(evt.body_text, evt.id, questMeta, st));
            reachableEvents.add(evt.id);
          } else {
            nextStates.push(st);
          }
        }
        states = nextStates;
      }

      for (const finalState of states) {
        recordStages(finalState, reachableStages);
        const h = hashState(finalState);
        if (!visited.has(h)) { visited.add(h); queue.push(finalState); }
      }
    }

    // 2. Menu choice events
    for (const evt of eventsHere) {
      if (evt.trigger !== 'menu_choice') continue;
      if (!evt.id) continue;
      if (s.seen.includes(evt.id)) continue;
      const ev = evalPrereq(evt.prerequisite, s);
      let fireStates = [];
      if (ev === null) {
        nondeterministicPrereqs.add(evt.id);
        fireStates = [s]; // branch: also try firing
      } else if (ev) {
        fireStates = [s];
      }
      for (const fs of fireStates) {
        reachableEvents.add(evt.id);
        const ns = applyEffects(evt.body_text, evt.id, questMeta, fs);
        recordStages(ns, reachableStages);
        const h = hashState(ns);
        if (!visited.has(h)) { visited.add(h); queue.push(ns); }
      }
    }

    // 3. Item pickups
    for (const item of itemsHere) {
      if (!item.id) continue;
      if (s.inv.includes(item.id)) continue;
      const condEv = evalPrereq(item.pickup_condition, s);
      let canPick = false;
      if (condEv === null || condEv === true) canPick = true;
      if (!canPick) continue;
      reachableItems.add(item.id);
      // Apply comfy_give + body_text effects
      const ns = cloneState(s);
      if (!ns.inv.includes(item.id)) ns.inv.push(item.id);
      if (item.body_text) {
        const bodyCalls = extractComfyCalls(item.body_text);
        for (const qid of bodyCalls.questAdvance) {
          if (ns.qActive[qid] !== undefined) {
            const meta = questMeta[qid];
            const stageCount = meta ? meta.stages.length : 0;
            const next = (ns.qActive[qid] || 0) + 1;
            if (stageCount && next >= stageCount) {
              delete ns.qActive[qid];
              if (!ns.qDone.includes(qid)) ns.qDone.push(qid);
            } else {
              ns.qActive[qid] = next;
            }
          }
        }
      }
      recordStages(ns, reachableStages);
      const h = hashState(ns);
      if (!visited.has(h)) { visited.add(h); queue.push(ns); }
    }
  }

  // ── Build issues from reachability ──────────────────────────────────────────
  const issues = [];

  // Event unreachable
  for (const n of eventNodes) {
    const p = n.properties;
    if (!reachableEvents.has(p.id)) {
      issues.push({
        severity: 'error',
        code: 'event-unreachable',
        nodeId: n.id,
        message: `Event "${p.id}" je nedosažitelný — jeho prerekvizita nikdy není splněna v žádném dosažitelném stavu.`,
        hint: 'Zkontroluj, zda předcházející eventy správně pokračují quest (comfy_quest_advance), nebo jestli prerekvizita odpovídá skutečnému průběhu hry.',
      });
    }
  }

  // Item unpickable / required-but-unpickable
  const allRequiredItems = new Set();
  for (const n of eventNodes) {
    const calls = extractComfyCalls((n.properties.prerequisite || '') + ' ' + (n.properties.body_text || ''));
    for (const iid of calls.itemHas) allRequiredItems.add(iid);
  }
  for (const n of itemNodes) {
    const p = n.properties;
    if (!reachableItems.has(p.id)) {
      const required = allRequiredItems.has(p.id);
      issues.push({
        severity: required ? 'error' : 'warning',
        code: required ? 'item-unpickable-but-required' : 'item-unpickable',
        nodeId: n.id,
        message: required
          ? `Item "${p.id}" je vyžadován prerekvizitou, ale nikdy nemůže být sebrán (pickup_condition nebo lokace nedosažitelná).`
          : `Item "${p.id}" nemůže být sebrán — lokace je nedosažitelná nebo pickup_condition nikdy není splněna.`,
        hint: required
          ? 'Toto je deadlock: quest nemůže pokročit. Zkontroluj pickup_condition a dostupnost lokace.'
          : 'Zkontroluj, zda je lokace propojena s grafem a pickup_condition je dosažitelná.',
      });
    }
  }

  // Quest completion path
  for (const q of questNodes) {
    const p = q.properties;
    const stages = questMeta[p.id]?.stages || [];
    if (!reachableStages.has(p.id + ':done')) {
      // Check whether quest is even started
      const started = reachableStages.has(p.id + ':1') || Object.keys(questMeta[p.id] || {}).length === 0;
      if (started || stages.length > 0) {
        issues.push({
          severity: 'error',
          code: 'quest-no-completion-path',
          nodeId: q.id,
          message: `Quest "${p.id}" (${p.title || ''}) nemá žádnou dosažitelnou cestu k dokončení.`,
          hint: 'Zkontroluj, zda existují eventy se správnými prerekvizitami pro každou fázi a comfy_quest_advance pro poslední.',
        });
      }
    }
    // Quest stages unreachable
    for (let i = 2; i <= stages.length; i++) {
      if (!reachableStages.has(p.id + ':' + i) && !reachableStages.has(p.id + ':done')) {
        issues.push({
          severity: 'warning',
          code: 'quest-stage-unreachable',
          nodeId: q.id,
          message: `Quest "${p.id}": fáze ${i} ("${stages[i - 1] || ''}") je nedosažitelná — žádný event neposune quest na stage ${i}.`,
          hint: `Přidej event s prerekvizitou stage == ${i - 1} a comfy_quest_advance("${p.id}").`,
        });
      }
    }
  }

  // Nondeterministic prereqs
  for (const eid of nondeterministicPrereqs) {
    const evtNode = eventNodes.find(n => n.properties.id === eid);
    issues.push({
      severity: 'info',
      code: 'nondeterministic-prereq',
      nodeId: evtNode?.id ?? null,
      message: `Event "${eid}": prerekvizita obsahuje neznámou proměnnou (simulátor větvil oba výsledky).`,
      hint: 'Simulátor nezná vlastní Ren\'Py proměnné mimo comfy_* funkce. Výsledky pro tento event jsou přibližné.',
    });
  }

  if (exploded) {
    issues.push({
      severity: 'info',
      code: 'state-explosion',
      nodeId: null,
      message: `Simulátor dosáhl limitu ${MAX_STATES} stavů — výsledky mohou být neúplné.`,
      hint: 'Zkus zjednodušit podmínky prerekvizit nebo snížit počet kombinací itemů/questů.',
    });
  }

  const stats = {
    states:          visited.size,
    reachableEvents: reachableEvents.size,
    reachableItems:  reachableItems.size,
    reachableStages: reachableStages.size,
    exploded,
  };

  return { issues, stats };
}

function recordStages(state, set) {
  for (const [qid, stage] of Object.entries(state.qActive)) set.add(qid + ':' + stage);
  for (const qid of state.qDone) set.add(qid + ':done');
}

module.exports = { runSimulation, evalPrereq };
