import { graph } from '../graph/state';

const statsEl = document.getElementById('graph-stats') as HTMLElement;

export function updateStats(): void {
  const counts: Record<string, number> = { location: 0, event: 0, item: 0, character: 0, quest: 0 };
  for (const node of graph._nodes || []) {
    const t = node.type?.split('/')[1];
    if (t && t in counts) counts[t]++;
  }
  const parts: string[] = [];
  if (counts['location'])  parts.push(`${counts['location']} loc`);
  if (counts['event'])     parts.push(`${counts['event']} evt`);
  if (counts['item'])      parts.push(`${counts['item']} itm`);
  if (counts['character']) parts.push(`${counts['character']} chr`);
  if (counts['quest'])     parts.push(`${counts['quest']} qst`);
  statsEl.textContent = parts.length ? '· ' + parts.join(' · ') : '';
}
