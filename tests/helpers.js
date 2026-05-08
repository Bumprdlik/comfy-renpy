'use strict';

let _nextId = 1;
export function resetIds() { _nextId = 1; }

export function makeNode(type, props = {}) {
  return { id: _nextId++, type, properties: props };
}

export function makeLink(originNode, originSlot, targetNode) {
  return [_nextId++, originNode.id, originSlot, targetNode.id, 0, 'connection'];
}

export function makeGraph(nodes = [], links = []) {
  return { nodes, links };
}

export function emptyState(overrides = {}) {
  return { loc: 'start', inv: [], qActive: {}, qDone: [], seen: [], ...overrides };
}
