import type { QuestProps } from '../../types';
import { drawDirtyBadge } from '../helpers';

export class QuestNode extends LiteGraph.LGraphNode {
  declare properties: QuestProps;

  constructor() {
    super();
    this.properties = {
      id: '',
      title: 'New Quest',
      description: '',
      stages: 'Fáze 1\nFáze 2\nFáze 3',
    };
    this.color   = '#4a0a10';
    this.bgcolor = '#2d0608';
    this.size = [220, 55];
  }

  getTitle(): string {
    return this.properties.title || this.properties.id || 'Quest';
  }

  onDrawForeground(ctx: CanvasRenderingContext2D): void {
    if (this.flags.collapsed) return;
    const stages = String(this.properties.stages || '').split('\n').filter(Boolean);
    if (!stages.length) return;
    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#aa5555';
    ctx.textAlign = 'left';
    ctx.fillText(`${stages.length} fází`, 5, 14);
    ctx.restore();
    drawDirtyBadge(ctx, this);
  }
}

QuestNode.title = 'Quest';
LiteGraph.registerNodeType('renpy/quest', QuestNode);
