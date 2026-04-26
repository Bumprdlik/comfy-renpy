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
    drawStatusBadge(ctx, this);
    drawDuplicateBadge(ctx, this);
  }
}

ItemNode.title = 'Item';
LiteGraph.registerNodeType('renpy/item', ItemNode);
