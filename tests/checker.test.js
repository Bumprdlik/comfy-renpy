import { describe, it, expect, beforeEach } from 'vitest';
import { runStaticChecks, extractComfyCalls, extractStageConstraints } from '../server-checker.js';
import { makeNode, makeLink, makeGraph, resetIds } from './helpers.js';

beforeEach(() => resetIds());

// ── extractComfyCalls ────────────────────────────────────────────────────────

describe('extractComfyCalls', () => {
  it('returns empty arrays for null/empty input', () => {
    const r = extractComfyCalls(null);
    expect(r.questStart).toEqual([]);
    expect(r.itemHas).toEqual([]);
    expect(r.seenRefs).toEqual([]);
  });

  it('parses comfy_quest_start', () => {
    const r = extractComfyCalls('comfy_quest_start("main_quest")');
    expect(r.questStart).toEqual(['main_quest']);
  });

  it('parses comfy_quest_advance', () => {
    const r = extractComfyCalls('$ comfy_quest_advance("side_quest")');
    expect(r.questAdvance).toEqual(['side_quest']);
  });

  it('parses comfy_has and comfy_give', () => {
    const r = extractComfyCalls('comfy_has("sword") and comfy_give("key")');
    expect(r.itemHas).toEqual(['sword']);
    expect(r.itemGive).toEqual(['key']);
  });

  it('parses _seen references', () => {
    const r = extractComfyCalls('not intro_seen and not meeting_seen');
    expect(r.seenRefs).toContain('intro');
    expect(r.seenRefs).toContain('meeting');
  });

  it('parses multiple quest functions in one string', () => {
    const r = extractComfyCalls(
      'comfy_quest_active("q1") and comfy_quest_stage("q1") >= 2 and comfy_quest_completed("q2")'
    );
    expect(r.questActive).toContain('q1');
    expect(r.questStage).toContain('q1');
    expect(r.questCompleted).toContain('q2');
  });
});

// ── extractStageConstraints ──────────────────────────────────────────────────

describe('extractStageConstraints', () => {
  it('returns empty for null/empty input', () => {
    expect(extractStageConstraints(null)).toEqual([]);
    expect(extractStageConstraints('')).toEqual([]);
  });

  it('parses >= constraint', () => {
    const r = extractStageConstraints('comfy_quest_stage("main") >= 2');
    expect(r).toEqual([{ questId: 'main', op: '>=', n: 2 }]);
  });

  it('parses == constraint', () => {
    const r = extractStageConstraints('comfy_quest_stage("q") == 1');
    expect(r).toEqual([{ questId: 'q', op: '==', n: 1 }]);
  });

  it('parses multiple constraints', () => {
    const r = extractStageConstraints(
      'comfy_quest_stage("a") >= 1 and comfy_quest_stage("b") > 3'
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ questId: 'a', op: '>=', n: 1 });
    expect(r[1]).toMatchObject({ questId: 'b', op: '>', n: 3 });
  });
});

// ── runStaticChecks ──────────────────────────────────────────────────────────

describe('runStaticChecks', () => {
  it('passes on empty graph', () => {
    const { ok, issues } = runStaticChecks(makeGraph());
    expect(ok).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('passes on clean graph with matching refs', () => {
    const quest = makeNode('renpy/quest', { id: 'q1', title: 'Test', stages: 'Fáze 1' });
    const item  = makeNode('renpy/item',  { id: 'sword', name: 'Meč' });
    const loc   = makeNode('renpy/location', { id: 'hall', exits: [] });
    const loc2  = makeNode('renpy/location', { id: 'cave', exits: [] });
    const evt   = makeNode('renpy/event', {
      id: 'start_evt',
      location_id: 'hall',
      trigger: 'menu_choice',
      prerequisite: 'comfy_quest_active("q1")',
      body_text: 'comfy_quest_start("q1") comfy_give("sword")',
    });
    const link = makeLink(loc, 0, loc2);
    const { ok, issues } = runStaticChecks(makeGraph([quest, item, loc, loc2, evt], [link]));
    expect(ok).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('detects prereq referencing unknown quest', () => {
    const evt = makeNode('renpy/event', {
      id: 'evt1', location_id: 'hall', trigger: 'menu_choice',
      prerequisite: 'comfy_quest_active("ghost_quest")',
    });
    const { issues } = runStaticChecks(makeGraph([evt]));
    expect(issues.some(i => i.code === 'prereq-unknown-quest')).toBe(true);
  });

  it('detects prereq referencing unknown item', () => {
    const evt = makeNode('renpy/event', {
      id: 'evt1', location_id: 'hall', trigger: 'menu_choice',
      prerequisite: 'comfy_has("nonexistent_item")',
    });
    const { issues } = runStaticChecks(makeGraph([evt]));
    expect(issues.some(i => i.code === 'prereq-unknown-item')).toBe(true);
  });

  it('detects body_text referencing unknown quest', () => {
    const evt = makeNode('renpy/event', {
      id: 'evt1', location_id: 'hall', trigger: 'auto_enter',
      body_text: 'comfy_quest_start("missing_quest")',
    });
    const { issues } = runStaticChecks(makeGraph([evt]));
    expect(issues.some(i => i.code === 'body-unknown-quest')).toBe(true);
  });

  it('detects body_text comfy_give referencing unknown item', () => {
    const evt = makeNode('renpy/event', {
      id: 'evt1', location_id: 'hall', trigger: 'auto_enter',
      body_text: 'comfy_give("ghost_item")',
    });
    const { issues } = runStaticChecks(makeGraph([evt]));
    expect(issues.some(i => i.code === 'body-unknown-item')).toBe(true);
  });

  it('detects _seen reference to unknown event', () => {
    const evt = makeNode('renpy/event', {
      id: 'evt1', location_id: 'hall', trigger: 'menu_choice',
      prerequisite: 'nonexistent_seen',
    });
    const { issues } = runStaticChecks(makeGraph([evt]));
    expect(issues.some(i => i.code === 'seen-flag-unknown-event')).toBe(true);
  });

  it('detects quest with no start event', () => {
    const quest = makeNode('renpy/quest', { id: 'q1', title: 'Orphan quest', stages: 'Fáze 1' });
    const { issues } = runStaticChecks(makeGraph([quest]));
    expect(issues.some(i => i.code === 'quest-no-start')).toBe(true);
  });

  it('detects quest with multiple stages but no advance', () => {
    const quest = makeNode('renpy/quest', { id: 'q1', title: 'Multi', stages: 'Fáze 1\nFáze 2' });
    const evt   = makeNode('renpy/event', {
      id: 'starter', location_id: 'hall', trigger: 'auto_enter',
      body_text: 'comfy_quest_start("q1")',
    });
    const { issues } = runStaticChecks(makeGraph([quest, evt]));
    expect(issues.some(i => i.code === 'quest-no-advance')).toBe(true);
  });

  it('detects quest stage out of range in prereq', () => {
    const quest = makeNode('renpy/quest', { id: 'q1', stages: 'Fáze 1\nFáze 2' }); // max stage = 2
    const evt   = makeNode('renpy/event', {
      id: 'evt1', location_id: 'hall', trigger: 'menu_choice',
      prerequisite: 'comfy_quest_stage("q1") == 5',
    });
    const { issues } = runStaticChecks(makeGraph([quest, evt]));
    expect(issues.some(i => i.code === 'quest-stage-out-of-range')).toBe(true);
  });

  it('returns ok:false when there are errors', () => {
    const evt = makeNode('renpy/event', {
      id: 'e', location_id: 'l', trigger: 'auto_enter',
      prerequisite: 'comfy_quest_active("no_such_quest")',
    });
    const { ok } = runStaticChecks(makeGraph([evt]));
    expect(ok).toBe(false);
  });
});
