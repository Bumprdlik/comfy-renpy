import { describe, it, expect, beforeEach } from 'vitest';
import { runSimulation, evalPrereq } from '../server-simulator.js';
import { makeNode, makeLink, makeGraph, emptyState, resetIds } from './helpers.js';

beforeEach(() => resetIds());

// ── evalPrereq ───────────────────────────────────────────────────────────────

describe('evalPrereq', () => {
  it('returns true for empty/null prerequisite', () => {
    expect(evalPrereq('', emptyState())).toBe(true);
    expect(evalPrereq(null, emptyState())).toBe(true);
  });

  it('evaluates True/False literals', () => {
    expect(evalPrereq('True',  emptyState())).toBe(true);
    expect(evalPrereq('False', emptyState())).toBe(false);
  });

  it('evaluates comfy_quest_active', () => {
    expect(evalPrereq('comfy_quest_active("q1")', emptyState({ qActive: { q1: 1 } }))).toBe(true);
    expect(evalPrereq('comfy_quest_active("q1")', emptyState())).toBe(false);
  });

  it('evaluates comfy_quest_completed', () => {
    expect(evalPrereq('comfy_quest_completed("q1")', emptyState({ qDone: ['q1'] }))).toBe(true);
    expect(evalPrereq('comfy_quest_completed("q1")', emptyState())).toBe(false);
  });

  it('evaluates comfy_quest_stage comparisons', () => {
    const s2 = emptyState({ qActive: { q1: 2 } });
    expect(evalPrereq('comfy_quest_stage("q1") >= 2', s2)).toBe(true);
    expect(evalPrereq('comfy_quest_stage("q1") >= 3', s2)).toBe(false);
    expect(evalPrereq('comfy_quest_stage("q1") == 2', s2)).toBe(true);
    expect(evalPrereq('comfy_quest_stage("q1") == 1', s2)).toBe(false);
  });

  it('evaluates comfy_has', () => {
    expect(evalPrereq('comfy_has("sword")', emptyState({ inv: ['sword'] }))).toBe(true);
    expect(evalPrereq('comfy_has("sword")', emptyState())).toBe(false);
  });

  it('evaluates _seen flag', () => {
    expect(evalPrereq('intro_seen', emptyState({ seen: ['intro'] }))).toBe(true);
    expect(evalPrereq('intro_seen', emptyState())).toBe(false);
  });

  it('evaluates not operator', () => {
    expect(evalPrereq('not comfy_has("sword")', emptyState())).toBe(true);
    expect(evalPrereq('not comfy_has("sword")', emptyState({ inv: ['sword'] }))).toBe(false);
  });

  it('evaluates and / or operators', () => {
    const s = emptyState({ qActive: { q1: 1 }, inv: ['key'] });
    expect(evalPrereq('comfy_quest_active("q1") and comfy_has("key")', s)).toBe(true);
    expect(evalPrereq('comfy_quest_active("q1") and comfy_has("sword")', s)).toBe(false);
    expect(evalPrereq('comfy_quest_active("q2") or comfy_has("key")', s)).toBe(true);
  });

  it('returns null for unknown variables', () => {
    expect(evalPrereq('some_custom_python_var', emptyState())).toBe(null);
  });
});

// ── runSimulation ────────────────────────────────────────────────────────────

describe('runSimulation', () => {
  it('returns no-locations warning for empty graph', () => {
    const { issues } = runSimulation(makeGraph());
    expect(issues.some(i => i.code === 'no-locations')).toBe(true);
  });

  it('reports no issues for two connected locations with no events', () => {
    const a = makeNode('renpy/location', { id: 'hall', exits: [{ name: 'east', target: 'cave' }] });
    const b = makeNode('renpy/location', { id: 'cave', exits: [] });
    const link = makeLink(a, 0, b);
    const { issues } = runSimulation(makeGraph([a, b], [link]));
    expect(issues).toHaveLength(0);
  });

  it('marks auto_enter event in start location as reachable', () => {
    const loc = makeNode('renpy/location', { id: 'hall', exits: [] });
    const evt = makeNode('renpy/event', {
      id: 'intro', location_id: 'hall', trigger: 'auto_enter',
      prerequisite: '', body_text: '',
    });
    const { issues } = runSimulation(makeGraph([loc, evt]));
    expect(issues.some(i => i.code === 'event-unreachable' && i.message.includes('intro'))).toBe(false);
  });

  it('flags event-unreachable when prereq can never be satisfied', () => {
    const loc  = makeNode('renpy/location', { id: 'hall', exits: [] });
    const quest = makeNode('renpy/quest', { id: 'q1', stages: 'Fáze 1' });
    const evt  = makeNode('renpy/event', {
      id: 'gated', location_id: 'hall', trigger: 'menu_choice',
      prerequisite: 'comfy_quest_active("q1")',
      body_text: '',
    });
    // No event ever starts q1, so comfy_quest_active("q1") is always false
    const { issues } = runSimulation(makeGraph([loc, quest, evt]));
    expect(issues.some(i => i.code === 'event-unreachable' && i.message.includes('gated'))).toBe(true);
  });

  it('does NOT flag event-unreachable when prereq can be satisfied', () => {
    const loc    = makeNode('renpy/location', { id: 'hall', exits: [] });
    const quest  = makeNode('renpy/quest', { id: 'q1', stages: 'Fáze 1\nFáze 2' });
    const starter = makeNode('renpy/event', {
      id: 'start_q', location_id: 'hall', trigger: 'auto_enter',
      prerequisite: '', body_text: 'comfy_quest_start("q1")',
    });
    const gated = makeNode('renpy/event', {
      id: 'gated', location_id: 'hall', trigger: 'menu_choice',
      prerequisite: 'comfy_quest_active("q1")',
      body_text: 'comfy_quest_advance("q1")',
    });
    const { issues } = runSimulation(makeGraph([loc, quest, starter, gated]));
    expect(issues.some(i => i.code === 'event-unreachable' && i.message.includes('gated'))).toBe(false);
  });

  it('flags quest-no-completion-path when quest is never finished', () => {
    const loc   = makeNode('renpy/location', { id: 'hall', exits: [] });
    const quest = makeNode('renpy/quest', { id: 'q1', title: 'Nedokončitelný', stages: 'Fáze 1\nFáze 2' });
    const start = makeNode('renpy/event', {
      id: 'start_q', location_id: 'hall', trigger: 'auto_enter',
      body_text: 'comfy_quest_start("q1")',
    });
    // No advance event → quest never completes
    const { issues } = runSimulation(makeGraph([loc, quest, start]));
    expect(issues.some(i => i.code === 'quest-no-completion-path')).toBe(true);
  });

  it('does NOT flag quest-no-completion-path when quest can be completed', () => {
    const loc   = makeNode('renpy/location', { id: 'hall', exits: [] });
    const quest = makeNode('renpy/quest', { id: 'q1', stages: 'Fáze 1' });
    const start = makeNode('renpy/event', {
      id: 'start_q', location_id: 'hall', trigger: 'auto_enter',
      body_text: 'comfy_quest_start("q1") comfy_quest_advance("q1")',
    });
    const { issues } = runSimulation(makeGraph([loc, quest, start]));
    expect(issues.some(i => i.code === 'quest-no-completion-path')).toBe(false);
  });

  it('flags item-unpickable when item is in unreachable location', () => {
    const hall = makeNode('renpy/location', { id: 'hall', exits: [] });
    const cave = makeNode('renpy/location', { id: 'cave', exits: [] }); // not connected
    const item = makeNode('renpy/item', { id: 'key', name: 'Klíč', location_id: 'cave' });
    // No link between hall and cave → cave is unreachable
    const { issues } = runSimulation(makeGraph([hall, cave, item]));
    expect(issues.some(i => (i.code === 'item-unpickable' || i.code === 'item-unpickable-but-required') && i.message.includes('key'))).toBe(true);
  });

  it('marks item as reachable when in connected location', () => {
    const hall = makeNode('renpy/location', { id: 'hall', exits: [{ name: 'east' }] });
    const cave = makeNode('renpy/location', { id: 'cave', exits: [] });
    const item = makeNode('renpy/item', { id: 'key', name: 'Klíč', location_id: 'cave' });
    const link = makeLink(hall, 0, cave);
    const { issues } = runSimulation(makeGraph([hall, cave, item], [link]));
    expect(issues.some(i => i.message.includes('key'))).toBe(false);
  });

  it('returns stats with state count', () => {
    const loc = makeNode('renpy/location', { id: 'hall', exits: [] });
    const { stats } = runSimulation(makeGraph([loc]));
    expect(stats.states).toBeGreaterThan(0);
  });
});
