import { drawStatusBadge, drawDuplicateBadge } from '../helpers';
import type { CharacterProps } from '../../types';

export class CharacterNode extends LiteGraph.LGraphNode {
  declare properties: CharacterProps;

  constructor() {
    super();
    this.properties = {
      id: '',
      name: 'New Character',
      voice: '',
      sprite_id: '',
      location_id: '',
    };
    this.color   = '#0d4a30';
    this.bgcolor = '#062a1a';
    this.size = [190, 40];
  }

  getTitle(): string {
    return this.properties.name || this.properties.id || 'Character';
  }

  onDrawForeground(ctx: CanvasRenderingContext2D): void {
    if (this.flags.collapsed) return;
    if (this.properties.location_id) {
      ctx.save();
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#229966';
      ctx.textAlign = 'left';
      ctx.fillText('@ ' + this.properties.location_id, 5, 14);
      ctx.restore();
    }
    drawStatusBadge(ctx, this);
    drawDuplicateBadge(ctx, this);
  }
}

CharacterNode.title = 'Character';
LiteGraph.registerNodeType('renpy/character', CharacterNode);
