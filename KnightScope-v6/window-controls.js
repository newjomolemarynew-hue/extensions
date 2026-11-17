(() => {
  if (!globalThis.chrome?.windows) return;
  document.querySelectorAll('.hdr, .top').forEach((header) => {
    if (header.querySelector('.bm-window-controls')) return;
    const controls = document.createElement('div');
    controls.className = 'bm-window-controls';
    controls.innerHTML = '<button type="button" class="bm-win-btn" data-action="minimize" title="Minimize window" aria-label="Minimize window">−</button><button type="button" class="bm-win-btn bm-win-close" data-action="close" title="Close window" aria-label="Close window">×</button>';
    header.append(controls);
    controls.addEventListener('click', (event) => {
      const action = event.target.closest('button')?.dataset.action;
      if (!action) return;
      chrome.windows.getCurrent((win) => {
        if (chrome.runtime.lastError || !win?.id) return;
        if (action === 'minimize') chrome.windows.update(win.id, { state: 'minimized' });
        else if (action === 'close') chrome.windows.remove(win.id);
      });
    });
  });
})();
