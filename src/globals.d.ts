// LiteGraph 0.7.18 global type declarations (loaded as IIFE script, not an ES module)

interface LGNodeInput {
  name: string;
  type: string;
  link: number | null;
}

interface LGNodeOutput {
  name: string;
  type: string;
  links: number[] | null;
}

declare class LGraphNode {
  static title: string;

  id: number;
  type: string;
  pos: [number, number];
  size: [number, number];
  properties: Record<string, unknown>;
  inputs: LGNodeInput[];
  outputs: LGNodeOutput[];
  color: string;
  bgcolor: string;
  flags: { collapsed?: boolean };
  graph: LGraph;
  _status?: string | null;

  addInput(name: string, type: string): void;
  addOutput(name: string, type: string): void;
  removeInput(slot: number): void;
  removeOutput(slot: number): void;
  setDirtyCanvas(fg: boolean, bg?: boolean): void;
  serialize(): Record<string, unknown>;
  configure(data: Record<string, unknown>): void;
}

declare class LGraphGroup {
  title: string;
  color: string;
  font_size: number;
  pos: [number, number];
  size: [number, number];
  constructor(title?: string);
}

declare class LGraph {
  _nodes: LGraphNode[];
  _groups: LGraphGroup[];
  links: Record<number, unknown>;
  onAfterChange?: () => void;

  add(node: LGraphNode | LGraphGroup): void;
  getNodeById(id: number): LGraphNode | null;
  serialize(): Record<string, unknown>;
  configure(data: Record<string, unknown>): void;
  start(): void;
  setDirtyCanvas(fg: boolean, bg?: boolean): void;
}

declare class LGraphCanvas {
  render_canvas_border: boolean;
  render_connections_shadows: boolean;
  background_image: string;
  selected_nodes: Record<number, LGraphNode>;
  onNodeSelected?: (node: LGraphNode) => void;

  constructor(canvas: HTMLCanvasElement, graph: LGraph);
  setDirty(fg: boolean, bg?: boolean): void;
  convertOffsetToCanvas(pos: [number, number]): [number, number];
  centerOnNode(node: LGraphNode): void;
  selectNode(node: LGraphNode, add?: boolean): void;
}

declare const LiteGraph: {
  INPUT: number;
  OUTPUT: number;
  NODE_TITLE_HEIGHT: number;
  NODE_SLOT_HEIGHT: number;
  NODE_WIDTH: number;
  DEFAULT_SHADOW_OFFSET_X: number;
  DEFAULT_SHADOW_OFFSET_Y: number;
  slot_types_default_color: Record<string, string>;
  registered_node_types: Record<string, unknown>;
  searchbox_extras: Record<string, unknown>;
  LGraph: typeof LGraph;
  LGraphNode: typeof LGraphNode;
  LGraphCanvas: typeof LGraphCanvas;

  LGraphGroup: typeof LGraphGroup;

  registerNodeType(type: string, nodeClass: new () => LGraphNode): void;
  createNode(type: string): LGraphNode | null;
};

interface Window {
  addNode(type: string): void;
  saveGraph(): Promise<void>;
  validateGraph(): Promise<void>;
  exportRpy(): Promise<void>;
  doExport(): Promise<void>;
  scanFiles(): Promise<void>;
  previewRpy(): Promise<void>;
  autoLayout(): void;
  launchRenpy(): Promise<void>;
  openConfig(): Promise<void>;
  closeConfig(): void;
  cfgOverlayClick(e: MouseEvent): void;
  saveConfig(): Promise<void>;
  openHelp(): void;
  closeHelp(): void;
  helpTab(btn: HTMLElement, id: string): void;
  helpOverlayClick(e: MouseEvent): void;
  closeVal(): void;
  valOverlayClick(e: MouseEvent): void;
  closePreview(): void;
  previewOverlayClick(e: MouseEvent): void;
  updateExit(i: number, value: string): void;
  removeExit(i: number): void;
  addExit(): void;
  loadExample(): Promise<void>;
  addGroup(): void;
  browseGameDir(): Promise<void>;
  browseRenpyExe(): Promise<void>;
  openGenerate(nodeId: number, hasKey: boolean): void;
  closeGenerate(): void;
  genOverlayClick(e: MouseEvent): void;
  copyGenPrompt(): Promise<void>;
  runGenerate(): Promise<void>;
  copyGenResult(): Promise<void>;
  clearApiKey(): void;
}
