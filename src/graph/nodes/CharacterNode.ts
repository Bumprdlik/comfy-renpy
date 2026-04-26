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
    drawStatusBadge(ctx, this);
    drawDuplicateBadge(ctx, this);
  }
}

CharacterNode.title = 'Character';
LiteGraph.registerNodeType('renpy/character', CharacterNode);
