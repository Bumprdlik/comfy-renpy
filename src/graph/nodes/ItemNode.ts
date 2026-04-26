import { drawStatusBadge, drawDuplicateBadge } from '../helpers';
import type { ItemProps } from '../../types';

export class ItemNode extends LiteGraph.LGraphNode {
  declare properties: ItemProps;

  constructor() {
    super();
    this.properties = {
      id: '',
      name: 'New Item',
      description: '',
      location_id: '',
    };
    this.color   = '#4a1a66';
    this.bgcolor = '#2a0e3d';
    this.size = [190, 40];
  }

  getTitle(): string {
    return this.properties.name || this.properties.id || 'Item';
  }

  onDrawForeground(ctx: CanvasRenderingContext2D): void {
    if (this.flags.collapsed) return;
    if (this.properties.location_id) {
      ctx.save();
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#885599';
      ctx.textAlign = 'left';
      ctx.fillText('@ ' + this.properties.location_id, 5, 14);
      ctx.restore();
    }
    drawStatusBadge(ctx, this);
    drawDuplicateBadge(ctx, this);
  }
}

ItemNode.title = 'Item';
LiteGraph.registerNodeType('renpy/item', ItemNode);
