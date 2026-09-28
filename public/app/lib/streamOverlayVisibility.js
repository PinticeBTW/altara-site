// Presentation only. One timer/listener binding per existing stage; never touches media.
const bindings = new WeakMap();
export function syncStreamOverlayVisibility(stage) {
  if (!stage) return null;
  let binding = bindings.get(stage);
  if (binding) { binding.sync(); return binding; }
  const doc = stage.ownerDocument;
  const win = doc.defaultView;
  const idleMs = 2500;
  const controlSelector = 'button, input, select, a, [role="menu"], [data-stream-audio-status]';
  let timer = null;
  let dragging = false;
  let placementFrame = null;
  const placeFullscreen = () => {
    if (placementFrame !== null) return;
    placementFrame = win.requestAnimationFrame(() => {
      placementFrame = null;
      const viewport = stage.querySelector('.callStageViewport');
      const button = stage.querySelector('#btnFullscreenStage');
      if (!viewport || !button || stage.hidden) return;
      const box = viewport.getBoundingClientRect();
      const focusedCanvas = viewport.querySelector('.callParticipantFocusPrimary [data-call-grid-entry="1"]')?.getBoundingClientRect();
      const canvases = focusedCanvas?.width > 0 && focusedCanvas.height > 0 ? [focusedCanvas] : [...viewport.querySelectorAll('[data-call-grid-entry="1"], .serverVoiceScreensharePanel')]
        .map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
      const fullscreen = doc.fullscreenElement === viewport;
      const top = fullscreen || !canvases.length ? box.top : Math.min(...canvases.map(r => r.top));
      const right = fullscreen || !canvases.length ? box.right : Math.max(...canvases.map(r => r.right));
      // Keep the control inside the actual visible canvas, even when a solo
      // tile is centred in a much larger viewport. No media/layout mutations.
      button.style.setProperty('--stage-fullscreen-top', `${Math.max(12, top - box.top + 12)}px`);
      button.style.setProperty('--stage-fullscreen-right', `${Math.max(12, box.right - right + 12)}px`);
    });
  };
  if (win.ResizeObserver) {
    const observer = new win.ResizeObserver(placeFullscreen);
    observer.observe(stage);
    const viewport = stage.querySelector('.callStageViewport');
    if (viewport) observer.observe(viewport);
  }
  doc.addEventListener('fullscreenchange', placeFullscreen);
  const isActive = () => stage.isConnected && !stage.hidden && !!stage.querySelector(
    '[data-share-viewer-state="watching"], .callSharePrimary video, .callMultiShareCell video'
  );
  const locked = () => dragging
    || !!doc.querySelector('#privateShareAudioMenu:not([hidden]), #callAudioMenu.is-open, #callShareMenu.is-open')
    || (stage.contains(doc.activeElement) && !!doc.activeElement?.closest(controlSelector))
    || !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clear = () => { if (timer !== null) win.clearTimeout(timer); timer = null; };
  const schedule = () => {
    clear();
    if (!isActive()) return;
    timer = win.setTimeout(() => {
      timer = null;
      if (!isActive()) { stage.removeAttribute('data-stream-overlays'); return; }
      if (locked()) { show(); return; }
      stage.setAttribute('data-stream-overlays', 'idle');
    }, idleMs);
  };
  const show = () => { stage.setAttribute('data-stream-overlays', 'visible'); schedule(); };
  const release = () => { if (dragging) { dragging = false; show(); } };
  stage.addEventListener('pointermove', show, { passive: true });
  stage.addEventListener('pointerdown', event => {
    if (event.target.closest(controlSelector)) dragging = true;
    show();
  }, { passive: true });
  stage.addEventListener('focusin', show);
  stage.addEventListener('focusout', schedule);
  stage.addEventListener('keydown', show);
  doc.addEventListener('pointerup', release, { passive: true });
  doc.addEventListener('pointercancel', release, { passive: true });
  win.addEventListener('blur', release);
  binding = {
    show,
    sync() {
      placeFullscreen();
      if (!isActive()) { clear(); stage.removeAttribute('data-stream-overlays'); return; }
      if (locked()) { if (stage.getAttribute('data-stream-overlays') === 'idle') show(); }
      if (timer === null && stage.getAttribute('data-stream-overlays') !== 'idle') schedule();
    },
  };
  bindings.set(stage, binding);
  binding.sync();
  return binding;
}
