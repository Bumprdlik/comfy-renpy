export interface LocationProps {
  [key: string]: unknown;
  id: string;
  label: string;
  description: string;
  exits: Array<{ name: string; bidir?: boolean; returnName?: string }>;
  isStart?: boolean;
}

export interface EventProps {
  [key: string]: unknown;
  id: string;
  location_id: string;
  trigger: string;
  trigger_label: string;
  prerequisite: string;
  time: string;
  repeatable: boolean;
  priority: number;
  notes: string;
  body_text?: string;
}

export interface ItemProps {
  [key: string]: unknown;
  id: string;
  name: string;
  description: string;
  location_id: string;
  body_text?: string;
}

export interface CharacterProps {
  [key: string]: unknown;
  id: string;
  name: string;
  voice: string;
  sprite_id: string;
  location_id: string;
}

export interface NoteProps {
  [key: string]: unknown;
  text: string;
}

export interface QuestProps {
  [key: string]: unknown;
  id: string;
  title: string;
  description: string;
  stages: string;
}

export type ScanStatus = 'written' | 'stub' | 'missing' | 'drift' | 'ok';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface ScriptConflict {
  startId: string;
  existingPreview: string;
}

export interface ExportResult {
  ok: boolean;
  created: string[];
  updated: string[];
  errors?: string[];
  note?: string;
  error?: string;
  message?: string;
  scriptConflict?: ScriptConflict | null;
}

export interface PreviewResult {
  filename?: string;
  content?: string;
  error?: string;
}

export interface ConfigData {
  gameDir?: string;
  renpyExe?: string;
  aiProvider?: string;
  anthropicKey?: string;
  openaiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  port?: number;
  projectDir?: string;
  hasAnthropicKey?: boolean;
  hasOpenaiKey?: boolean;
  hasVsCode?: boolean;
}

export interface ScanResult {
  nodes: Record<string, ScanStatus>;
  drift: string[];
}
