import { graph } from '../../graph/state';
import { escHtml } from '../../graph/helpers';
import type { CheckIssue } from '../../types';

const overlay     = document.getElementById('checker-overlay') as HTMLElement;
const body        = document.getElementById('checker-body')    as HTMLElement;
const statsEl     = document.getElementById('checker-stats')   as HTMLElement;

function severityIcon(s: string): string {
  if (s === 'error')   return '<span class="val-icon" style="color:#e74c3c">✗</span>';
  if (s === 'warning') return '<span class="val-icon" style="color:#f39c12">⚠</span>';
  return                      '<span class="val-icon" style="color:#3498db">ℹ</span>';
}

function renderIssues(issues: CheckIssue[], heading: string): string {
  if (!issues.length) return '';
  const items = issues.map(issue => {
    const nav = issue.nodeId !== null
      ? `<button class="checker-goto" onclick="checkerGoto(${issue.nodeId})" title="Přejít na uzel">→</button>`
      : '';
    const hint = issue.hint ? `<div class="checker-hint">${escHtml(issue.hint)}</div>` : '';
    return `<div class="val-item checker-item">
      ${severityIcon(issue.severity)}
      <span class="val-text">${escHtml(issue.message)}${hint}</span>
      ${nav}
    </div>`;
  }).join('');
  return `<div class="val-section">${escHtml(heading)}</div>${items}`;
}

export function openCheckerModal(
  staticIssues: CheckIssue[],
  simIssues: CheckIssue[],
  stats: { states?: number; reachableEvents?: number; reachableItems?: number; reachableStages?: number; exploded?: boolean },
  loading?: boolean,
): void {
  if (loading) {
    body.innerHTML = '<div class="val-ok" style="color:#aaa">⟳ Analyzuji…</div>';
    statsEl.textContent = '';
    overlay.classList.add('open');
    return;
  }

  const allIssues = [...staticIssues, ...simIssues];
  const staticErrors   = staticIssues.filter(i => i.severity === 'error');
  const staticWarnings = staticIssues.filter(i => i.severity === 'warning');
  const staticInfos    = staticIssues.filter(i => i.severity === 'info');
  const simErrors      = simIssues.filter(i => i.severity === 'error');
  const simWarnings    = simIssues.filter(i => i.severity === 'warning');
  const simInfos       = simIssues.filter(i => i.severity === 'info');

  if (!allIssues.length) {
    body.innerHTML = '<div class="val-ok">✓ Žádné problémy s logikou questů.</div>';
  } else {
    let html = '';
    if (staticErrors.length || staticWarnings.length || staticInfos.length) {
      html += '<div class="checker-phase-heading">Statická analýza</div>';
      html += renderIssues(staticErrors,   `Chyby (${staticErrors.length})`);
      html += renderIssues(staticWarnings, `Varování (${staticWarnings.length})`);
      html += renderIssues(staticInfos,    `Info (${staticInfos.length})`);
    }
    if (simErrors.length || simWarnings.length || simInfos.length) {
      html += '<div class="checker-phase-heading">Simulace stavů</div>';
      html += renderIssues(simErrors,   `Chyby (${simErrors.length})`);
      html += renderIssues(simWarnings, `Varování (${simWarnings.length})`);
      html += renderIssues(simInfos,    `Info (${simInfos.length})`);
    }
    body.innerHTML = html;
  }

  if (stats && stats.states !== undefined) {
    const expl = stats.exploded ? ' (limit dosažen, výsledky neúplné)' : '';
    statsEl.textContent =
      `Prošlých stavů: ${stats.states}${expl} | Eventy: ${stats.reachableEvents ?? '?'} | Itemy: ${stats.reachableItems ?? '?'} | Quest stages: ${stats.reachableStages ?? '?'}`;
  } else {
    statsEl.textContent = '';
  }

  overlay.classList.add('open');
}

export function closeChecker(): void {
  overlay.classList.remove('open');
}

export function checkerOverlayClick(e: MouseEvent): void {
  if (e.target === overlay) closeChecker();
}

export function checkerGoto(lgNodeId: number): void {
  const node = graph.getNodeById(lgNodeId);
  if (!node) return;
  const lgCanvas = (graph as unknown as { canvas: LGraphCanvas }).canvas;
  if (lgCanvas) {
    lgCanvas.selectNode(node, false);
    lgCanvas.centerOnNode(node);
  }
}
