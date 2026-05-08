export function initDropdown(triggerId: string, panelId: string): void {
  const trigger = document.getElementById(triggerId)!;
  const panel   = document.getElementById(panelId)!;
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = panel.classList.toggle('open');
    if (open) {
      document.querySelectorAll('.dropdown-panel.open').forEach(p => {
        if (p !== panel) p.classList.remove('open');
      });
    }
  });
  panel.addEventListener('click', () => panel.classList.remove('open'));
}

export function initDropdownGlobal(): void {
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.dropdown-wrap')) {
      document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open'));
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open'));
    }
  });
}
