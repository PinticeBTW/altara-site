"use client";

import { useEffect, useRef, useState } from "react";

export type BotImageKind = "avatar" | "banner";

export function BotImageEditor({ file, url, kind, onApply, onCancel }: {
  file: File;
  url: string;
  kind: BotImageKind;
  onApply: (file: File) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const source = useRef<HTMLImageElement | null>(null);
  const alive = useRef(true);
  const exporting = useRef(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const animated = file.type === "image/gif";
  const ratio = kind === "avatar" ? 1 : 4;
  const cropWidth = size ? Math.min(size.width, size.height * ratio) / zoom : 1;
  const cropHeight = cropWidth / ratio;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));

  useEffect(() => {
    alive.current = true;
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      alive.current = false;
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!url) return;
    let current = true;
    const image = new Image();
    image.onload = () => {
      if (!current) return;
      source.current = image;
      setSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => { if (current) setError("This image could not be opened. Choose another image."); };
    image.src = url;
    return () => { current = false; source.current = null; image.onload = null; image.onerror = null; };
  }, [url]);

  async function apply() {
    if (!size || !source.current || exporting.current) return;
    if (animated) { onApply(file); return; }
    exporting.current = true;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = kind === "avatar" ? 512 : 1600;
      canvas.height = kind === "avatar" ? 512 : 400;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image editing is unavailable in this browser.");
      context.drawImage(source.current, (size.width - cropWidth) * position.x,
        (size.height - cropHeight) * position.y, cropWidth, cropHeight,
        0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        value => value ? resolve(value) : reject(new Error("Could not prepare this image. Try again.")), "image/png"));
      if (alive.current) onApply(new File([blob], `${kind}.png`, { type: "image/png" }));
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "Could not prepare this image.");
    } finally {
      exporting.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function cancel() {
    alive.current = false;
    onCancel();
  }

  return <dialog ref={dialog} className="developerImageEditor" aria-labelledby="botImageEditorTitle"
    onCancel={event => { event.preventDefault(); cancel(); }} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const items = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]');
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <header className="botImageEditorHeader">
      <h2 id="botImageEditorTitle">Adjust {kind}</h2>
      <button type="button" className="botImageEditorClose" aria-label="Close image editor" onClick={cancel}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </header>
    <p>{animated ? "GIFs keep their original animation and framing." : "Drag to reposition, or use the arrow keys. Use the slider to zoom."}</p>
    <div className={`botImageCrop botImageCrop--${kind}${animated ? " botImageCrop--animated" : ""}`} tabIndex={animated ? undefined : 0}
      role={animated ? undefined : "group"} aria-label={`Adjust ${kind} position`}
      onKeyDown={event => {
        if (busy || animated) return;
        const delta = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[event.key];
        if (!delta) return;
        event.preventDefault();
        setPosition(p => ({ x: clamp(p.x + delta[0]), y: clamp(p.y + delta[1]) }));
      }}
      onPointerDown={event => {
        if (busy || animated || !size || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, left: position.x, top: position.y };
      }}
      onPointerMove={event => {
        if (!drag.current || !size || busy) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const dx = (event.clientX - drag.current.x) * cropWidth / rect.width;
        const dy = (event.clientY - drag.current.y) * cropHeight / rect.height;
        setPosition({ x: size.width > cropWidth ? clamp(drag.current.left - dx / (size.width - cropWidth)) : 0.5,
          y: size.height > cropHeight ? clamp(drag.current.top - dy / (size.height - cropHeight)) : 0.5 });
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {/* Local blob previews must remain unoptimized to show the selected file and crop exactly. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && size ? <img src={url} alt={`${kind} preview`} draggable={false} style={animated ? undefined : {
        width: `${size.width / cropWidth * 100}%`, height: `${size.height / cropHeight * 100}%`,
        left: `${-(size.width - cropWidth) * position.x / cropWidth * 100}%`,
        top: `${-(size.height - cropHeight) * position.y / cropHeight * 100}%`,
      }} /> : <span>{error ? "Image unavailable" : "Opening image..."}</span>}
    </div>
    {!animated ? <label className="botImageZoom">Zoom
      <input type="range" aria-label="Zoom" min="1" max="4" step="0.01" value={zoom} disabled={busy || !size}
        onChange={event => setZoom(Number(event.target.value))} />
      <output>{Math.round(zoom * 100)}%</output>
    </label> : null}
    {error ? <p role="alert">{error}</p> : null}
    <footer className="botImageEditorActions">
      {!animated ? <button type="button" className="devButton secondary botImageEditorReset" disabled={busy || !size}
        onClick={() => { drag.current = null; setZoom(1); setPosition({ x: 0.5, y: 0.5 }); }}>Reset</button> : <span />}
      <button type="button" className="devButton secondary" onClick={cancel}>Cancel</button>
      <button type="button" className="devButton primary" disabled={busy || !size || Boolean(error)} onClick={() => { void apply(); }}>
        {busy ? "Preparing..." : "Apply"}
      </button>
    </footer>
  </dialog>;
}
