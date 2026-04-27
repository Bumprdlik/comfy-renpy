export interface LocationProps {
  [key: string]: unknown;
  id: string;
  label: string;
  description: string;
  exits: Array<{ name: string }>;
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
}

export interface ItemProps {
  [key: string]: unknown;
  id: string;
  name: string;
  description: string;
  location_id: string;
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

export type ScanStatus = 'written' | 'stub' | 'missing' | 'drift';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExportResult {
  ok: boolean;
  created: string[];
  updated: string[];
  errors?: string[];
  note?: string;
  error?: string;
  message?: string;
}

export interface PreviewResult {
  filename?: string;
  content?: string;
  error?: string;
}

export interface ConfigData {
  gameDir?: string;
  renpyExe?: string;
  anthropicKey?: string;
  port?: number;
  projectDir?: string;
  hasAnthropicKey?: boolean;
}

export interface ScanResult {
  nodes: Record<string, ScanStatus>;
  drift: string[];
}
