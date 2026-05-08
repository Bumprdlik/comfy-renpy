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
      isStart: false,
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

  private _refreshLinkType(slotIndex: number, slotType: string): void {
    const linkIds = this.outputs[slotIndex]?.links;
    if (!linkIds || !this.graph) return;
    for (const lid of linkIds) {
      const link = this.graph.links[lid] as Record<string, unknown> | null;
      if (link) { link['type'] = slotType; link['color'] = null; }
    }
  }

  removeExitAt(j: number): void {
    if (!this.outputs || j < 0 || j >= this.outputs.length) return;
    const g = (this.graph as unknown as { links: Record<number, Record<string, unknown>> } | null)?.links;

    // Disconnect all links currently at slot j
    const toRemove = [...(this.outputs[j]?.links ?? [])];
    for (const lid of toRemove) {
      const link = g?.[lid];
      if (!link) continue;
      const tgtNode = this.graph?.getNodeById(link['target_id'] as number);
      const ts = link['target_slot'] as number;
      if (tgtNode?.inputs?.[ts]) tgtNode.inputs[ts].link = null;
      const idx = this.outputs[j].links!.indexOf(lid);
      if (idx >= 0) this.outputs[j].links!.splice(idx, 1);
      if (g) delete g[lid];
    }

    // Shift connections from slots k+1 → k for all slots after j
    for (let k = j; k < this.outputs.length - 1; k++) {
      const nextLinks = [...(this.outputs[k + 1]?.links ?? [])];
      this.outputs[k].links = nextLinks;
      for (const lid of nextLinks) {
        if (g?.[lid]) g[lid]['origin_slot'] = k;
      }
      if (this.outputs[k + 1].links) this.outputs[k + 1].links = [];
    }

    // Remove the last output (now empty after shift)
    this.removeOutput(this.outputs.length - 1);

    // Remove exit from properties and update remaining slot names/types
    this.properties.exits.splice(j, 1);
    const exits = this.properties.exits;
    for (let i = 0; i < exits.length && this.outputs && i < this.outputs.length; i++) {
      const slotType = exits[i].bidir ? 'connection-bi' : 'connection';
      this.outputs[i].name = exits[i].name || 'exit';
      this.outputs[i].type = slotType;
      this._refreshLinkType(i, slotType);
    }
    if (this.size) this.size[0] = Math.max(this.size[0], 200);
  }

  syncExitSlots(): void {
    const exits = this.properties.exits || [];
    const existing = this.outputs?.length ?? 0;
    for (let i = 0; i < Math.min(exits.length, existing); i++) {
      const slotType = exits[i].bidir ? 'connection-bi' : 'connection';
      this.outputs[i].name = exits[i].name || 'exit';
      this.outputs[i].type = slotType;
      this._refreshLinkType(i, slotType);
    }
    while (this.outputs && this.outputs.length > exits.length) {
      this.removeOutput(this.outputs.length - 1);
    }
    for (let i = (this.outputs?.length ?? 0); i < exits.length; i++) {
      this.addOutput(exits[i].name || 'exit', exits[i].bidir ? 'connection-bi' : 'connection');
    }
    if (this.size) this.size[0] = Math.max(this.size[0], 200);
  }

  onConfigure(): void {
    const exits = this.properties.exits || [];
    if (this.outputs) {
      for (let i = 0; i < Math.min(exits.length, this.outputs.length); i++) {
        const slotType = exits[i].bidir ? 'connection-bi' : 'connection';
        this.outputs[i].name = exits[i].name || 'exit';
        this.outputs[i].type = slotType;
        this._refreshLinkType(i, slotType);
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
