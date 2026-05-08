import { graph } from '../graph/state';

const W = 190;
const H = 130;
const PAD = 12;

const NODE_COLORS: Record<string, string> = {
  'renpy/location':  '#2471a3',
  'renpy/event':     '#c0601a',
  'renpy/item':      '#8e44ad',
  'renpy/character': '#1a8a5e',
  'renpy/note':      '#886600',
  'renpy/quest':     '#8b1a1a',
};

interface DS { offset: [number, number]; scale: number; }

export function initMinimap(lgCanvas: LGraphCanvas, mainCanvas: HTMLCanvasElement): void {
  const mini = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
  if (!mini) return;

  mini.width  = W;
  mini.height = H;

  const ctx = mini.getContext('2d')!;
  const ds  = (): DS => (lgCanvas as unknown as { ds: DS }).ds;

  function graphBounds(): { minX: number; minY: number; rangeX: number; rangeY: number } {
    const nodes = graph._nodes;
    if (!nodes.length) return { minX: 0, minY: 0, rangeX: 400, rangeY: 300 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.pos[0] < minX) minX = n.pos[0];
      if (n.pos[1] < minY) minY = n.pos[1];
      if (n.pos[0] + n.size[0] > maxX) maxX = n.pos[0] + n.size[0];
      if (n.pos[1] + n.size[1] > maxY) maxY = n.pos[1] + n.size[1];
    }
    return { minX, minY, rangeX: Math.max(maxX - minX, 200), rangeY: Math.max(maxY - minY, 150) };
  }

  function render(): void {
    const { minX, minY, rangeX, rangeY } = graphBounds();
    const sx = (W - PAD * 2) / rangeX;
    const sy = (H - PAD * 2) / rangeY;
    const s  = Math.min(sx, sy);
    const ox = PAD - minX * s;
    const oy = PAD - minY * s;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = 'rgba(14, 14, 20, 0.88)';
    ctx.strokeStyle = 'rgba(80,120,180,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 4);
    ctx.fill();
    ctx.stroke();

    // Nodes
    for (const n of graph._nodes) {
      const x = n.pos[0] * s + ox;
      const y = n.pos[1] * s + oy;
      const w = Math.max(n.size[0] * s, 5);
      const h = Math.max(n.size[1] * s, 4);
      ctx.fillStyle = NODE_COLORS[n.type] ?? '#444';
      ctx.fillRect(x, y, w, h);
    }

    // Viewport rect
    const { offset, scale } = ds();
    const vpX = -offset[0];
    const vpY = -offset[1];
    const vpW = mainCanvas.width  / scale;
    const vpH = mainCanvas.height / scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX * s + ox, vpY * s + oy, vpW * s, vpH * s);

    requestAnimationFrame(render);
  }

  render();

  // Scroll wheel to zoom (toward viewport center)
  mini.addEventListener('wheel', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const { scale, offset } = ds();
    const factor   = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newScale = Math.min(Math.max(scale * factor, 0.1), 10);
    const cx = mainCanvas.width  / 2;
    const cy = mainCanvas.height / 2;
    const ratio = newScale / scale;
    ds().scale     = newScale;
    ds().offset[0] = cx + (offset[0] - cx) * ratio;
    ds().offset[1] = cy + (offset[1] - cy) * ratio;
    lgCanvas.setDirty(true, true);
  }, { passive: false });

  // Click + drag to pan
  mini.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const rect = mini.getBoundingClientRect();

    function applyPan(clientX: number, clientY: number): void {
      const { minX, minY, rangeX, rangeY } = graphBounds();
      const sx = (W - PAD * 2) / rangeX;
      const sy = (H - PAD * 2) / rangeY;
      const s  = Math.min(sx, sy);
      const ox = PAD - minX * s;
      const oy = PAD - minY * s;

      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const gx = (mx - ox) / s;
      const gy = (my - oy) / s;

      const { scale } = ds();
      ds().offset[0] = -(gx * scale) + mainCanvas.width  / 2;
      ds().offset[1] = -(gy * scale) + mainCanvas.height / 2;
      lgCanvas.setDirty(true, true);
    }

    applyPan(e.clientX, e.clientY);

    const onMove = (e: MouseEvent) => applyPan(e.clientX, e.clientY);
    const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}
