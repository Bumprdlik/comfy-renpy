import type { NoteProps } from '../../types';

export class NoteNode extends LiteGraph.LGraphNode {
  declare properties: NoteProps;

  constructor() {
    super();
    this.properties = { text: 'Poznámka…' };
    this.color   = '#3d3010';
    this.bgcolor = '#28200a';
    this.size = [200, 80];
  }

  getTitle(): string { return 'Note'; }

  onDrawForeground(ctx: CanvasRenderingContext2D): void {
    if (this.flags.collapsed) return;
    const text = this.properties.text || '';
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#cc9944';
    ctx.textAlign = 'left';
    const maxWidth = this.size[0] - 14;
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      const words = para.split(' ');
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
        else line = test;
      }
      if (line) lines.push(line);
    }
    lines.forEach((l, i) => ctx.fillText(l, 7, 14 + i * 14));
    ctx.restore();
  }
}

NoteNode.title = 'Note';
LiteGraph.registerNodeType('renpy/note', NoteNode);
