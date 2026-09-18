// A second rendering surface for an existing subscription. This controller never
// creates a peer connection, clones a track, changes a subscription or stops media.
export function createStreamPopoutController({
  hostWindow = globalThis.window,
  onChange = () => {},
  onError = () => {},
  pollMs = 1000,
} = {}) {
  const entries = new Map();
  let timer = null;
  let disposed = false;
  let sequence = 0;
  const safe = (action) => { try { return action(); } catch (_) { return undefined; } };
  const liveStream = (entry) => {
    if (!entry.isCurrent()) return null;
    const stream = entry.getStream();
    return stream?.getVideoTracks?.().some((track) => track.readyState === "live") ? stream : null;
  };
  const stopTimerWhenIdle = () => {
    if (entries.size || timer === null) return;
    hostWindow.clearInterval(timer);
    timer = null;
  };
  function close(key = "", { fromWindow = false } = {}) {
    const targets = key ? [entries.get(String(key))].filter(Boolean) : [...entries.values()];
    for (const entry of targets) {
      entries.delete(entry.key);
      for (const cleanup of entry.cleanup.splice(0)) safe(cleanup);
      safe(() => { entry.video.pause(); entry.video.srcObject = null; });
      if (!fromWindow) safe(() => entry.popup.close());
    }
    stopTimerWhenIdle();
    if (targets.length) safe(onChange);
    return targets.length > 0;
  }
  function reconcile() {
    for (const entry of [...entries.values()]) {
      const stream = safe(() => liveStream(entry));
      if (entry.popup.closed || !stream) { close(entry.key); continue; }
      if (entry.video.srcObject !== stream) {
        entry.video.srcObject = stream;
        safe(() => entry.video.play()?.catch(() => {}));
      }
    }
  }
  function open({ key, title = "Stream", getStream, isCurrent = () => true, onReturn = () => {} } = {}) {
    if (disposed || typeof getStream !== "function" || !key) return { ok: false, reason: "unavailable" };
    const normalizedKey = String(key);
    reconcile();
    const existing = entries.get(normalizedKey);
    if (existing) {
      safe(() => existing.popup.focus());
      return { ok: true, reused: true, window: existing.popup };
    }
    const source = { getStream, isCurrent };
    const stream = safe(() => liveStream(source));
    if (!stream) return { ok: false, reason: "unavailable" };
    // Open synchronously inside the originating click. Awaiting playback/imports
    // first loses the browser's transient user activation and can block the popup.
    let popup;
    try {
      popup = hostWindow.open("about:blank", `altara-stream-popout-${++sequence}`,
        "popup=yes,width=960,height=600,resizable=yes,scrollbars=no");
    } catch (_) {}
    if (!popup || popup.closed) {
      safe(() => onError("blocked"));
      return { ok: false, reason: "blocked" };
    }
    try {
      const doc = popup.document;
      doc.open();
      doc.write("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body></body></html>");
      doc.close();
      doc.title = `${String(title).slice(0, 120)} · ALTARA`;
      const style = doc.createElement("style");
      style.textContent = `
        :root{color-scheme:dark;font:14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#eee7dc;background:#000}
        *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
        body{display:flex;flex-direction:column;padding:12px;gap:10px}
        header{display:flex;align-items:center;gap:9px;min-height:34px;padding:0 4px;flex:none}
        .live{font-size:10px;font-weight:750;letter-spacing:.08em;background:#9a3f46;color:#fff;border:1px solid #c65a64;border-radius:5px;padding:2px 5px;cursor:default}
        .identity{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c8bfb1;font-size:12px;cursor:default}
        main{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#000;border:1px solid #e9d5b92b;border-radius:14px;overflow:hidden}
        video{display:block;width:100%;height:100%;object-fit:contain;background:#000}
        footer{display:flex;gap:8px;justify-content:center;flex:none}
        button{height:36px;padding:0 13px;border:1px solid #e9d5b92b;border-radius:10px;color:#eee7dc;background:#242321;font:600 12px/1 system-ui;cursor:pointer}
        button:hover{background:#34302b;border-color:#dfc29d66}button:focus-visible{outline:2px solid #dfc29d;outline-offset:2px}
        main:fullscreen{border:0;border-radius:0}main:fullscreen video{height:100vh}
        @media(max-width:480px){body{padding:8px;gap:8px}button{padding:0 10px}}
      `;
      doc.head.append(style);
      const header = doc.createElement("header");
      const live = doc.createElement("span"); live.className = "live"; live.textContent = "LIVE";
      const identity = doc.createElement("span"); identity.className = "identity"; identity.textContent = String(title);
      header.append(live, identity);
      const viewport = doc.createElement("main");
      const video = doc.createElement("video");
      video.autoplay = true; video.playsInline = true;
      // Existing app audio remains authoritative (including mute/volume/Deafen).
      // A muted visual surface avoids playing screen audio twice.
      video.muted = true;
      video.setAttribute("aria-label", `${String(title)} stream`);
      viewport.append(video);
      const footer = doc.createElement("footer");
      const makeButton = (text, action) => {
        const button = doc.createElement("button"); button.type = "button";
        button.textContent = text; button.addEventListener("click", action);
        footer.append(button);
        return () => button.removeEventListener("click", action);
      };
      const entry = { ...source, key: normalizedKey, popup, video, cleanup: [] };
      entry.cleanup.push(makeButton("Back to call", () => { safe(onReturn); safe(() => hostWindow.focus()); }));
      if (typeof viewport.requestFullscreen === "function") {
        entry.cleanup.push(makeButton("Fullscreen", () => {
          const request = doc.fullscreenElement ? doc.exitFullscreen() : viewport.requestFullscreen();
          request?.catch?.(() => {});
        }));
      }
      entry.cleanup.push(makeButton("Close", () => close(normalizedKey)));
      doc.body.append(header, viewport, footer);
      const onPageHide = () => close(normalizedKey, { fromWindow: true });
      popup.addEventListener("pagehide", onPageHide);
      entry.cleanup.push(() => popup.removeEventListener("pagehide", onPageHide));
      entries.set(normalizedKey, entry);
      video.srcObject = stream;
      safe(() => video.play()?.catch(() => {}));
      if (timer === null) timer = hostWindow.setInterval(reconcile, Math.max(500, Number(pollMs) || 1000));
      safe(() => popup.focus());
      safe(onChange);
      return { ok: true, reused: false, window: popup };
    } catch (_) {
      close(normalizedKey);
      safe(() => popup.close());
      safe(() => onError("unavailable"));
      return { ok: false, reason: "unavailable" };
    }
  }
  const onHostPageHide = () => close();
  hostWindow?.addEventListener?.("pagehide", onHostPageHide);
  return {
    open, close, reconcile,
    isOpen: (key = "") => key ? !!entries.get(String(key)) && !entries.get(String(key)).popup.closed
      : [...entries.values()].some((entry) => !entry.popup.closed),
    get size() { return entries.size; },
    dispose() {
      if (disposed) return;
      disposed = true;
      close();
      hostWindow?.removeEventListener?.("pagehide", onHostPageHide);
    },
  };
}
