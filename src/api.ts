import type { ValidationResult, ExportResult, PreviewResult, ConfigData, ScanResult } from './types';

export async function apiGetGraph(): Promise<Record<string, unknown>> {
  const r = await fetch('/api/graph');
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<Record<string, unknown>>;
}

export async function apiPutGraph(data: Record<string, unknown>): Promise<void> {
  const r = await fetch('/api/graph', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function apiValidate(graphData: Record<string, unknown>): Promise<ValidationResult> {
  const r = await fetch('/api/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(graphData),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<ValidationResult>;
}

export async function apiExportRpy(graphData: Record<string, unknown>): Promise<ExportResult> {
  const r = await fetch('/api/export-rpy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(graphData),
  });
  return r.json() as Promise<ExportResult>;
}

export async function apiPreviewRpy(graphData: Record<string, unknown>, lgNodeId: number): Promise<PreviewResult> {
  const r = await fetch('/api/preview-rpy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graphData, lgNodeId }),
  });
  return r.json() as Promise<PreviewResult>;
}

export async function apiScan(): Promise<ScanResult> {
  const r = await fetch('/api/scan');
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<ScanResult>;
}

export async function apiGetConfig(): Promise<ConfigData> {
  const r = await fetch('/api/config');
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<ConfigData>;
}

export async function apiPutConfig(config: ConfigData): Promise<void> {
  const r = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function apiCheckGraph(): Promise<{ exists: boolean; nodeCount: number }> {
  const r = await fetch('/api/check-graph');
  if (!r.ok) return { exists: false, nodeCount: 0 };
  return r.json() as Promise<{ exists: boolean; nodeCount: number }>;
}

export async function apiOpenGameDir(): Promise<void> {
  await fetch('/api/open-game-dir', { method: 'POST' });
}

export async function apiOpenFile(id: string, nodeType: string): Promise<{ ok?: boolean; error?: string }> {
  const r = await fetch('/api/open-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, nodeType }),
  });
  return r.json() as Promise<{ ok?: boolean; error?: string }>;
}

export async function apiGenerateDialogue(prompt: string): Promise<{ prompt?: string; result?: string; hasKey: boolean; error?: string }> {
  const r = await fetch('/api/generate-dialogue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return r.json() as Promise<{ prompt?: string; result?: string; hasKey: boolean; error?: string }>;
}

export async function apiBrowseFolder(initial?: string): Promise<string | null> {
  const r = await fetch('/api/browse-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initial: initial ?? '' }),
  });
  const d = await r.json() as { path: string | null };
  return d.path;
}

export async function apiBrowseExe(initial?: string): Promise<string | null> {
  const r = await fetch('/api/browse-exe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initial: initial ?? '' }),
  });
  const d = await r.json() as { path: string | null };
  return d.path;
}

export async function apiLaunch(): Promise<{ error?: string; statusText?: string }> {
  const r = await fetch('/api/launch', { method: 'POST' });
  if (!r.ok) return r.json() as Promise<{ error?: string }>;
  return { statusText: r.statusText };
}
