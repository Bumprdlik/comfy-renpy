import { graph, refreshDuplicateIds } from '../graph/state';
import { scheduleSave } from './autosave';
import { updateStats } from './stats';

const MAX = 50;
const past: string[] = [];
const future: string[] = [];
let _lastSnapshot: string | null = null;
let _skip = false;
let _timer: ReturnType<typeof setTimeout> | null = null;

export function initHistory(): void {
  _lastSnapshot = JSON.stringify(graph.serialize());
  past.length = 0;
  future.length = 0;
}

export function captureHistory(): void {
  if (_skip) return;
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => {
    const json = JSON.stringify(graph.serialize());
    if (json === _lastSnapshot) return;
    if (_lastSnapshot !== null) {
      past.push(_lastSnapshot);
      if (past.length > MAX) past.shift();
    }
    _lastSnapshot = json;
    future.length = 0;
  }, 800);
}

export function undo(): void {
  if (past.length === 0) return;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  const current = JSON.stringify(graph.serialize());
  future.push(current);
  const prev = past.pop()!;
  _skip = true;
  graph.configure(JSON.parse(prev));
  _lastSnapshot = prev;
  _skip = false;
  refreshDuplicateIds();
  updateStats();
  scheduleSave();
}

export function redo(): void {
  if (future.length === 0) return;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  const current = JSON.stringify(graph.serialize());
  past.push(current);
  const next = future.pop()!;
  _skip = true;
  graph.configure(JSON.parse(next));
  _lastSnapshot = next;
  _skip = false;
  refreshDuplicateIds();
  updateStats();
  scheduleSave();
}
