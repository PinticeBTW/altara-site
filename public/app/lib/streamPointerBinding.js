import { createStreamPointerController } from './streamPointer.js';
import { mountStreamPointerSurface } from './streamPointerSurface.js';

// One controller per existing call Room/context. Presentation can have several
// views of the same publication; it never owns or reattaches their media.
export function createStreamPointerBinding(options) {
  const controller = createStreamPointerController(options);
  const surfaces = new Map();
  let viewport = null;
  let records = [];
  let observer = null;
  let disposed = false;
  let scheduled = false;

  function syncViews() {
    if (disposed) return;
    const streams = new Set(controller.getStreams().map(stream => stream.streamId));
    const wanted = new Map();
    for (const video of viewport?.querySelectorAll?.('video') || []) {
      const tracks = video.srcObject?.getVideoTracks?.() || [];
      const sid = video.getAttribute?.('data-livekit-screenshare-track-id');
      const record = records.find(candidate => streams.has(candidate.trackSid)
        && (candidate.video === video || (sid && sid === candidate.trackSid)
          || tracks.some(track => track === candidate.track
            || (track.id && track.id === candidate.trackId))));
      if (record) wanted.set(video, record.trackSid);
    }
    for (const [video, entry] of surfaces) {
      if (wanted.get(video) !== entry.streamId) {
        entry.surface.dispose();
        surfaces.delete(video);
      }
    }
    for (const [video, streamId] of wanted) {
      const existing = surfaces.get(video);
      if (existing) existing.surface.update();
      else {
        const surface = mountStreamPointerSurface({
          video, controller, streamId, isHotkeyAvailable: options.isHotkeyAvailable,
        });
        if (surface) surfaces.set(video, { streamId, surface });
      }
    }
  }

  function scheduleViews() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; syncViews(); });
  }

  return {
    sync(nextViewport, nextRecords) {
      if (disposed) return;
      records = nextRecords;
      if (nextViewport !== viewport) {
        observer?.disconnect();
        viewport = nextViewport;
        if (viewport && typeof MutationObserver === 'function') {
          observer = new MutationObserver(mutations => {
            // Marker animation/toolbar changes must not cause layout scans.
            if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes]
              .some(node => node.nodeName === 'VIDEO' || node.querySelector?.('video')))) scheduleViews();
          });
          observer.observe(viewport, { childList: true, subtree: true });
        }
      }
      syncViews();
    },
    reconcile() { controller.reconcile(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      for (const { surface } of surfaces.values()) surface.dispose();
      surfaces.clear();
      controller.dispose();
    },
  };
}
