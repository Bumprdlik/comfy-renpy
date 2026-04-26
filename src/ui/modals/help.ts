const HELP_SEEN_KEY = 'comfyrenpy_help_seen';
const overlay = document.getElementById('help-overlay') as HTMLElement;

export function openHelp(): void {
  overlay.classList.add('open');
}

export function closeHelp(): void {
  overlay.classList.remove('open');
  localStorage.setItem(HELP_SEEN_KEY, '1');
}

export function helpTab(btn: HTMLElement, id: string): void {
  document.querySelectorAll<HTMLElement>('.help-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll<HTMLElement>('.help-page').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('help-page-' + id)?.classList.add('active');
}

export function helpOverlayClick(e: MouseEvent): void {
  if (e.target === overlay) closeHelp();
}

export function maybeShowHelp(): void {
  if (!localStorage.getItem(HELP_SEEN_KEY)) openHelp();
}
