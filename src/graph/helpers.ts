import { duplicateIds } from './state';
import { isDirty } from '../ui/dirtyTracker';

export const STATUS_COLOR: Record<string, string> = {
  written: '#2ecc71',
  stub:    '#f39c12',
  missing: '#7f8c8d',
  drift:   '#e74c3c',
};

export function drawStatusBadge(ctx: CanvasRenderingContext2D, node: LGraphNode): void {
  const status = node._status;
  if (!status) return;
  const c = STATUS_COLOR[status];
  if (!c) return;
  ctx.save();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(node.size[0] - 9, 9, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawDuplicateBadge(ctx: CanvasRenderingContext2D, node: LGraphNode): void {
  const id = node.properties['id'] as string | undefined;
  if (!id || !duplicateIds.has(id)) return;
  ctx.save();
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.arc(8, 8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 8, 8);
  ctx.restore();
}

export function drawDirtyBadge(ctx: CanvasRenderingContext2D, node: LGraphNode): void {
  if (!isDirty(node)) return;
  const x = node.size[0] - 9;
  const y = node.size[1] - 9;
  ctx.save();
  ctx.fillStyle = '#e67e22';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('~', x, y);
  ctx.restore();
}

export function escHtml(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
