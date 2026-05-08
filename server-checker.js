'use strict';

// ── helpers ──────────────────────────────────────────────────────────────────

function extractComfyCalls(pyStr) {
  const calls = {
    questStart: [], questAdvance: [], questActive: [], questStage: [], questCompleted: [],
    itemHas: [], itemGive: [], seenRefs: [],
  };
  if (!pyStr) return calls;
  const re = /comfy_quest_(start|advance|active|stage|completed)\s*\(\s*"([^"]+)"\s*\)|comfy_(has|give)\s*\(\s*"([^"]+)"\s*\)|\b(\w+)_seen\b/g;
  let m;
  while ((m = re.exec(pyStr)) !== null) {
    if (m[1]) {
      const key = 'quest' + m[1].charAt(0).toUpperCase() + m[1].slice(1);
      calls[key].push(m[2]);
    } else if (m[3]) {
      const key = 'item' + m[3].charAt(0).toUpperCase() + m[3].slice(1);
      calls[key].push(m[4]);
    } else if (m[5]) {
      calls.seenRefs.push(m[5]);
    }
  }
  return calls;
}

function extractStageConstraints(pyStr) {
  const result = [];
  if (!pyStr) return result;
  const re = /comfy_quest_stage\s*\(\s*"([^"]+)"\s*\)\s*(==|>=|<=|<|>)\s*(\d+)/g;
  let m;
  while ((m = re.exec(pyStr)) !== null) {
    result.push({ questId: m[1], op: m[2], n: parseInt(m[3], 10) });
  }
  return result;
}

// ── main export ───────────────────────────────────────────────────────────────

function runStaticChecks(graphData) {
  const nodes = graphData.nodes || [];
  const issues = [];

  function issue(severity, code, nodeId, message, hint) {
    issues.push({ severity, code, nodeId: nodeId ?? null, message, hint: hint ?? null });
  }

  // Build lookup sets
  const questIds = new Set();
  const itemIds  = new Set();
  const eventIds = new Set();
  const locIds   = new Set();
  const locConnected = new Set(); // location ids that have at least one link

  for (const n of nodes) {
    const p = n.properties || {};
    if (!p.id) continue;
    if (n.type === 'renpy/quest')     questIds.add(p.id);
    if (n.type === 'renpy/item')      itemIds.add(p.id);
    if (n.type === 'renpy/event')     eventIds.add(p.id);
    if (n.type === 'renpy/location')  locIds.add(p.id);
  }

  // Which locations have at least one link (connected)
  const links = graphData.links || [];
  const connectedNodeIds = new Set();
  for (const link of links) {
    connectedNodeIds.add(link[1]); // origin node LG id
    connectedNodeIds.add(link[3]); // target node LG id
  }
  for (const n of nodes) {
    if (n.type === 'renpy/location' && n.properties?.id && connectedNodeIds.has(n.id)) {
      locConnected.add(n.properties.id);
    }
  }

  // Track which quests are started / advanced by events
  const questsStarted  = new Set();
  const questsAdvanced = new Set();

  for (const n of nodes) {
    const p   = n.properties || {};
    const nid = n.id;

    if (n.type === 'renpy/event') {
      if (!p.id) continue;

      const prereqCalls = extractComfyCalls(p.prerequisite);
      const bodyCalls   = extractComfyCalls(p.body_text);

      // prereq references unknown quest
      for (const qid of [...prereqCalls.questActive, ...prereqCalls.questStage, ...prereqCalls.questCompleted]) {
        if (!questIds.has(qid)) {
          issue('error', 'prereq-unknown-quest', nid,
            `Event "${p.id}": prerekvizita odkazuje na neexistující quest "${qid}".`,
            'Zkontroluj, že quest s tímto ID existuje v grafu.');
        }
      }

      // prereq references unknown item
      for (const iid of prereqCalls.itemHas) {
        if (!itemIds.has(iid)) {
          issue('error', 'prereq-unknown-item', nid,
            `Event "${p.id}": prerekvizita odkazuje na neexistující item "${iid}".`,
            'Zkontroluj, že item s tímto ID existuje v grafu.');
        }
      }

      // prereq _seen flag references unknown event
      for (const eid of prereqCalls.seenRefs) {
        if (!eventIds.has(eid)) {
          issue('warning', 'seen-flag-unknown-event', nid,
            `Event "${p.id}": prerekvizita používá "${eid}_seen", ale event "${eid}" v grafu neexistuje.`,
            'Přejmenoval ses event? Uprav prerekvizitu nebo ID eventu.');
        }
      }

      // body_text references unknown quest
      for (const qid of [...bodyCalls.questStart, ...bodyCalls.questAdvance]) {
        if (!questIds.has(qid)) {
          issue('error', 'body-unknown-quest', nid,
            `Event "${p.id}": body_text volá comfy_quest funkci pro neexistující quest "${qid}".`,
            'Přidej quest s tímto ID nebo oprav překlep.');
        }
      }

      // body_text references unknown item
      for (const iid of bodyCalls.itemGive) {
        if (!itemIds.has(iid)) {
          issue('error', 'body-unknown-item', nid,
            `Event "${p.id}": body_text volá comfy_give("${iid}"), ale item "${iid}" v grafu neexistuje.`,
            'Přidej item s tímto ID nebo oprav překlep.');
        }
      }

      // quest-stage-out-of-range
      const stageConstraints = extractStageConstraints(p.prerequisite);
      for (const { questId, op, n: stageN } of stageConstraints) {
        const qNode = nodes.find(nd => nd.type === 'renpy/quest' && nd.properties?.id === questId);
        if (!qNode) continue; // already caught by prereq-unknown-quest
        const stages = (qNode.properties.stages || '').split('\n').filter(s => s.trim());
        const maxStage = stages.length; // quest_start → stage=1, max stage = stages.length
        const impossible = (op === '==' && stageN > maxStage)
          || (op === '>'  && stageN >= maxStage)
          || (op === '>=' && stageN > maxStage);
        if (impossible) {
          issue('error', 'quest-stage-out-of-range', nid,
            `Event "${p.id}": prerekvizita testuje stage ${op} ${stageN} pro quest "${questId}", ale quest má jen ${maxStage} fází (max stage = ${maxStage}).`,
            'Přidej chybějící fáze nebo oprav číslo stage.');
        }
      }

      // event on orphan location (location exists but has no links)
      if (p.location_id && locIds.has(p.location_id) && !locConnected.has(p.location_id)) {
        issue('warning', 'event-on-orphan-location', nid,
          `Event "${p.id}" je v lokaci "${p.location_id}", která není propojena s žádnou jinou lokací.`,
          'Hráč se do lokace nedostane (pokud to není start lokace). Přidej exit nebo zkontroluj location_id.');
      }

      // empty body_text with stage advance prereq
      if (!p.body_text && stageConstraints.length > 0) {
        issue('info', 'body-text-empty-with-stage-advance', nid,
          `Event "${p.id}" má prerekvizitu na quest stage, ale nemá nastavený body_text.`,
          'Hráč uvidí prázdný dialog. Přidej body_text nebo ho vyplň přímo v exportovaném .rpy.');
      }

      // track quest interactions
      for (const qid of bodyCalls.questStart)   questsStarted.add(qid);
      for (const qid of bodyCalls.questAdvance)  questsAdvanced.add(qid);
    }

    if (n.type === 'renpy/item') {
      if (!p.id) continue;
      const cond = p.pickup_condition || '';
      if (cond) {
        const condCalls = extractComfyCalls(cond);
        for (const qid of [...condCalls.questActive, ...condCalls.questStage, ...condCalls.questCompleted]) {
          if (!questIds.has(qid)) {
            issue('error', 'prereq-unknown-quest', nid,
              `Item "${p.id}": pickup_condition odkazuje na neexistující quest "${qid}".`, null);
          }
        }
        for (const iid of condCalls.itemHas) {
          if (!itemIds.has(iid)) {
            issue('error', 'prereq-unknown-item', nid,
              `Item "${p.id}": pickup_condition odkazuje na neexistující item "${iid}".`, null);
          }
        }
      }
    }
  }

  // Quest-level checks
  for (const n of nodes) {
    if (n.type !== 'renpy/quest') continue;
    const p   = n.properties || {};
    const nid = n.id;
    if (!p.id) continue;

    const stages = (p.stages || '').split('\n').filter(s => s.trim());

    if (!questsStarted.has(p.id)) {
      issue('warning', 'quest-no-start', nid,
        `Quest "${p.id}" (${p.title || ''}): žádný event ho nespouští (comfy_quest_start).`,
        'Přidej comfy_quest_start("' + p.id + '") do body_text nějakého eventu.');
    }

    if (stages.length > 1 && !questsAdvanced.has(p.id)) {
      issue('warning', 'quest-no-advance', nid,
        `Quest "${p.id}" má ${stages.length} fází, ale žádný event ho neposouvá (comfy_quest_advance).`,
        'Přidej comfy_quest_advance("' + p.id + '") do body_text eventů pro každou fázi.');
    }
  }

  const ok = !issues.some(i => i.severity === 'error');
  return { ok, issues };
}

module.exports = { runStaticChecks, extractComfyCalls, extractStageConstraints };
