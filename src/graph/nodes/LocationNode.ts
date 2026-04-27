import { drawStatusBadge, drawDuplicateBadge, drawDirtyBadge } from '../helpers';
import type { LocationProps } from '../../types';
import { apiOpenFile } from '../../api';
import { graph } from '../state';

export class LocationNode extends LiteGraph.LGraphNode {
  declare properties: LocationProps;

  constructor() {
    super();
    this.addInput('', 'connection');
    this.properties = {
      id: '',
      label: 'New Location',
      description: '',
      exits: [{ name: 'exit' }],
    };
    this.color   = '#1a4f72';
    this.bgcolor = '#0d2d42';
    this._status = null;
    this.syncExitSlots();
  }

  getTitle(): string {
    return this.properties.label || this.properties.id || 'Location';
  }

  _ensureOneBlankInput(): void {
    if (!this.inputs) { this.addInput('', 'connection'); return; }
    let blanks = 0;
    for (let i = this.inputs.length - 1; i >= 0; i--) {
      if (!this.inputs[i].link) blanks++;
      else break;
    }
    while (blanks > 1) {
      this.removeInput(this.inputs.length - 1);
      blanks--;
    }
    if (blanks === 0) this.addInput('', 'connection');
  }

  onConnectionsChange(type: number): void {
    if (type !== LiteGraph.INPUT) return;
    this._ensureOneBlankInput();
    this.setDirtyCanvas(true, true);
  }

  syncExitSlots(): void {
    while (this.outputs && this.outputs.length > 0) {
      this.removeOutput(this.outputs.length - 1);
    }
    for (const exit of (this.properties.exits || [])) {
      this.addOutput(exit.name || 'exit', exit.bidir ? 'connection-bi' : 'connection');
    }
    if (this.size) this.size[0] = Math.max(this.size[0], 200);
  }

  onConfigure(): void {
    // Safe in-place sync — do NOT call syncExitSlots() here.
    // removeOutput() → disconnectOutput() would delete graph.links entries
    // during graph.configure(), destroying all connections on reload.
    const exits = this.properties.exits || [];
    if (this.outputs) {
      for (let i = 0; i < Math.min(exits.length, this.outputs.length); i++) {
        this.outputs[i].name = exits[i].name || 'exit';
      }
      while (this.outputs.length > exits.length) this.removeOutput(this.outputs.length - 1);
      for (let i = this.outputs.length; i < exits.length; i++) {
        this.addOutput(exits[i].name || 'exit', exits[i].bidir ? 'connection-bi' : 'connection');
      }
    }
    this._ensureOneBlankInput();
    if (this.size) this.size[0] = Math.max(this.size[0], 200);
  }

  onDrawForeground(ctx: CanvasRenderingContext2D): void {
    if (this.flags.collapsed) return;
    drawStatusBadge(ctx, this);
    drawDuplicateBadge(ctx, this);
    drawDirtyBadge(ctx, this);

    const id = this.properties.id;
    if (id) {
      const count = graph._nodes.filter(
        n => n.type === 'renpy/event' && n.properties['location_id'] === id
      ).length;
      if (count > 0) {
        ctx.save();
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#3a7aaa';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`◈ ${count} event${count > 1 ? 's' : ''}`, 6, this.size[1] - 4);
        ctx.restore();
      }
    }
  }

  getExtraMenuOptions(_canvas: LGraphCanvas, _options: unknown[]) {
    const id = String(this.properties.id ?? '');
    if (!id) return null;
    const self = this;
    return [null, { content: '📄 Otevřít soubor', callback() { apiOpenFile(id, self.type).then(r => { if (r.error) alert('Soubor neexistuje — nejdřív spusť Export .rpy'); }); } }];
  }
}

LocationNode.title = 'Location';
LiteGraph.registerNodeType('renpy/location', LocationNode);
