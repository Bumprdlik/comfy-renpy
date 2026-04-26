import { drawStatusBadge, drawDuplicateBadge, drawDirtyBadge } from '../helpers';
import type { EventProps } from '../../types';

export class EventNode extends LiteGraph.LGraphNode {
  declare properties: EventProps;

  constructor() {
    super();
    this.properties = {
      id: '',
      location_id: '',
      trigger: 'auto_enter',
      trigger_label: '',
      prerequisite: '',
      time: 'any',
      repeatable: false,
      priority: 0,
      notes: '',
    };
    this.color   = '#6a2800';
    this.bgcolor = '#3d1800';
    this._status = null;
    this.size = [210, 60];
  }

  getTitle(): string {
    return this.properties.id || 'Event';
  }

  onDrawForeground(ctx: CanvasRenderingContext2D): void {
    if (this.flags.collapsed) return;
    if (this.properties.location_id) {
      ctx.save();
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#996644';
      ctx.textAlign = 'left';
      ctx.fillText('@ ' + this.properties.location_id, 5, 14);
      ctx.restore();
    }
    const triggerColors: Record<string, string> = {
      auto_enter:  '#885522',
      menu_choice: '#225588',
      condition:   '#228855',
    };
    ctx.save();
    ctx.font = '9px sans-serif';
    ctx.fillStyle = triggerColors[this.properties.trigger] || '#666';
    ctx.fillText(this.properties.trigger || '', 4, this.size[1] - 4);
    ctx.restore();
    drawStatusBadge(ctx, this);
    drawDuplicateBadge(ctx, this);
    drawDirtyBadge(ctx, this);
  }
}

EventNode.title = 'Event';
LiteGraph.registerNodeType('renpy/event', EventNode);
