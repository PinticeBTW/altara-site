// Geometry is expressed in intrinsic-video coordinates; neither black bars nor
// the cropped-away part of a video can become an outgoing pointer position.
export function getVideoContentGeometry({ rect, width, height, objectFit = "contain", objectPosition = "50% 50%" } = {}) {
  if (![rect?.left, rect?.top, rect?.width, rect?.height, width, height].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) return null;
  let scaleX = rect.width / width;
  let scaleY = rect.height / height;
  if (objectFit === "contain") scaleX = scaleY = Math.min(scaleX, scaleY);
  else if (objectFit === "cover") scaleX = scaleY = Math.max(scaleX, scaleY);
  else if (objectFit === "scale-down") scaleX = scaleY = Math.min(1, scaleX, scaleY);
  else if (objectFit === "none") scaleX = scaleY = 1;
  else if (objectFit !== "fill") return null;
  const contentWidth = width * scaleX;
  const contentHeight = height * scaleY;
  const position = parsePosition(objectPosition, rect.width - contentWidth, rect.height - contentHeight);
  if (!position) return null;
  return {
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    contentLeft: rect.left + position.x, contentTop: rect.top + position.y,
    contentWidth, contentHeight,
  };
}

function parsePosition(value, freeX, freeY) {
  const tokens = String(value).trim().toLowerCase().split(/\s+/);
  const offset = (token, free, axis) => {
    if (token === "center") return free / 2;
    if (token === (axis === "x" ? "left" : "top")) return 0;
    if (token === (axis === "x" ? "right" : "bottom")) return free;
    if (/^-?(?:\d+\.?\d*|\.\d+)%$/.test(token)) return free * Number.parseFloat(token) / 100;
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:px)?$/.test(token)) return Number.parseFloat(token);
    return NaN;
  };
  if (tokens.length === 1) tokens.push("center");
  if (tokens.length === 2) {
    if (["top", "bottom"].includes(tokens[0]) || ["left", "right"].includes(tokens[1])) tokens.reverse();
    const x = offset(tokens[0], freeX, "x");
    const y = offset(tokens[1], freeY, "y");
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  if (tokens.length === 4) {
    let x;
    let y;
    for (let i = 0; i < 4; i += 2) {
      const [edge, token] = tokens.slice(i, i + 2);
      const axis = ["left", "right"].includes(edge) ? "x" : ["top", "bottom"].includes(edge) ? "y" : "";
      if (!axis) return null;
      const free = axis === "x" ? freeX : freeY;
      const amount = offset(token, free, axis);
      const result = ["right", "bottom"].includes(edge) ? free - amount : amount;
      if (axis === "x") x = result; else y = result;
    }
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  // Unrecognised computed transforms/positions fail closed instead of guessing.
  return null;
}

export function videoPointToNormalized(clientX, clientY, geometry) {
  if (!geometry || !Number.isFinite(clientX) || !Number.isFinite(clientY)
    || clientX < geometry.left || clientY < geometry.top
    || clientX > geometry.left + geometry.width || clientY > geometry.top + geometry.height) return null;
  const x = (clientX - geometry.contentLeft) / geometry.contentWidth;
  const y = (clientY - geometry.contentTop) / geometry.contentHeight;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export function normalizedToVideoPoint(x, y, geometry, { clip = true } = {}) {
  if (!geometry || ![x, y].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  const left = geometry.contentLeft - geometry.left + x * geometry.contentWidth;
  const top = geometry.contentTop - geometry.top + y * geometry.contentHeight;
  if (clip && (left < 0 || top < 0 || left > geometry.width || top > geometry.height)) return null;
  return { left, top };
}

const HOTKEYS = ["Alt", "Shift", "Control", "None"];
const MOUSE_BUTTONS = ["Right", "Middle", "None"];
const BINDING_STORAGE = "altara.streamPointer.binding.v2";
const BINDING_EVENT = "altara-stream-pointer-binding-changed";
const COLOR_STORAGE = "altara.streamPointer.color.v1";
const COLOR_EVENT = "altara-stream-pointer-color-changed";
const customColor = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
const INTERACTIVE = "button,input,select,textarea,a,[contenteditable=true],[role=button],[role=menu],[role=dialog]";
const normalizeBinding = value => value && HOTKEYS.includes(value.modifier) && MOUSE_BUTTONS.includes(value.mouse)
  ? { modifier: value.modifier, mouse: value.mouse } : { modifier: "Alt", mouse: "Right" };
const bindingCombination = value => [value.modifier === "None" ? "" : value.modifier,
  value.mouse === "None" ? "" : `Mouse${value.mouse}`].filter(Boolean).join("+") || "None";
const bindingHint = value => [value.modifier === "None" ? "" : value.modifier,
  value.mouse === "Right" ? "botão direito" : value.mouse === "Middle" ? "botão central" : ""].filter(Boolean).join(" + ");

export function mountStreamPointerSurface({ video, controller, streamId, getParticipantPresentation, binding, isHotkeyAvailable = () => true } = {}) {
  if (!video?.ownerDocument || !video.parentElement || !controller || !streamId) return null;
  const doc = video.ownerDocument;
  const win = doc.defaultView;
  if (!win) return null;
  const make = (tag, className, label) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (label) node.textContent = label;
    return node;
  };
  const root = make("div", "streamPointerSurface");
  root.dataset.streamPointerStream = streamId;
  const layer = make("div", "streamPointerSurface__indicators");
  layer.setAttribute("aria-hidden", "true");
  const input = make("div", "streamPointerSurface__input");
  input.setAttribute("aria-hidden", "true");
  const toolbar = make("div", "streamPointerToolbar");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Stream Pointer");
  const status = make("span", "streamPointerToolbar__status");
  status.setAttribute("role", "status");
  let mode = "";
  let held = false;
  let modifierHeld = false;
  let mouseHeld = false;
  let suppressContextMenu = false;
  let hovered = false;
  let disposed = false;
  let currentPoint = null;
  let hoverPoint = null;
  let lastClientPoint = null;
  let geometry = null;
  let frame = 0;
  let localFrame = 0;
  let pendingPoint = null;
  let localPointerNode = null;
  let localPointerColor = "";
  let expiryTimer = 0;
  let keepalive = 0;
  let controlsSignature = "";
  let snapshot = controller.snapshot(streamId);
  let policyVersion = `${snapshot.epoch}:${snapshot.revision}`;
  const nodes = new Map();
  const removals = new Map();
  const listeners = [];
  let parent = null;
  const reduced = win.matchMedia?.("(prefers-reduced-motion: reduce)");
  let reduceMotion = reduced?.matches === true;
  let selectedBinding = normalizeBinding(binding);
  let selectedColor = null;
  try { selectedColor = customColor(JSON.parse(win.localStorage.getItem(COLOR_STORAGE))?.color); } catch (_) {}
  if (!binding) {
    try {
      selectedBinding = normalizeBinding(JSON.parse(win.localStorage.getItem(BINDING_STORAGE)));
    } catch (_) { /* A blocked preference store does not block pointing. */ }
  }
  const on = (target, event, listener, options) => {
    target?.addEventListener?.(event, listener, options);
    listeners.push(() => target?.removeEventListener?.(event, listener, options));
  };
  const action = (label, title, callback, className = "") => {
    const button = make("button", `streamPointerToolbar__button ${className}`.trim(), label);
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    on(button, "click", event => { event.stopPropagation(); callback(); });
    toolbar.appendChild(button);
    return button;
  };
  const pointerButton = action("Pointer", "Ativar ou desativar Pointer", () => {
    stopPointing();
    mode = mode ? "" : "pointer";
    syncControls();
  });
  pointerButton.setAttribute("aria-pressed", "false");
  const optionsButton = action("⚙", "Opções de Stream Pointer", () => {
    options.hidden = !options.hidden;
    optionsButton.setAttribute("aria-expanded", String(!options.hidden));
    if (!options.hidden) keySelect.focus();
  });
  optionsButton.setAttribute("aria-expanded", "false");
  const options = make("section", "streamPointerOptions");
  options.hidden = true;
  options.setAttribute("aria-label", "Opções de Stream Pointer");
  const keyLabel = make("label", "streamPointerOptions__row", "Tecla temporária");
  const keySelect = make("select", "streamPointerOptions__select");
  keySelect.setAttribute("aria-label", "Tecla temporária de Pointer");
  for (const key of HOTKEYS) {
    const option = make("option", "", key === "None" ? "Sem tecla" : key);
    option.value = key;
    keySelect.appendChild(option);
  }
  keySelect.value = selectedBinding.modifier;
  keyLabel.appendChild(keySelect);
  options.appendChild(keyLabel);
  const mouseLabel = make("label", "streamPointerOptions__row", "Botão do rato");
  const mouseSelect = make("select", "streamPointerOptions__select");
  mouseSelect.setAttribute("aria-label", "Botão temporário de Pointer");
  for (const [value, label] of [["Right", "Botão direito"], ["Middle", "Botão central"], ["None", "Sem botão"]]) {
    const option = make("option", "", label);
    option.value = value;
    mouseSelect.appendChild(option);
  }
  mouseSelect.value = selectedBinding.mouse;
  mouseLabel.appendChild(mouseSelect);
  options.appendChild(mouseLabel);
  const colorLabel = make("label", "streamPointerOptions__row", "Cor do Pointer");
  const colorControls = make("span", "streamPointerOptions__colorControls");
  const colorInput = make("input", "streamPointerOptions__color");
  colorInput.type = "color";
  colorInput.setAttribute("aria-label", "Cor do Pointer");
  const autoColorButton = make("button", "streamPointerToolbar__button", "Automática");
  autoColorButton.type = "button";
  autoColorButton.setAttribute("aria-label", "Usar cor automática do Pointer");
  colorControls.append(colorInput, autoColorButton);
  colorLabel.appendChild(colorControls);
  options.appendChild(colorLabel);
  const saveColor = value => {
    const color = customColor(value);
    if (color && color === selectedColor) return;
    try {
      if (color) win.localStorage.setItem(COLOR_STORAGE, JSON.stringify({ color }));
      else win.localStorage.removeItem(COLOR_STORAGE);
    } catch (_) {}
    doc.dispatchEvent(new win.CustomEvent(COLOR_EVENT, { detail: { color } }));
  };
  on(colorInput, "input", () => saveColor(colorInput.value));
  on(colorInput, "change", () => saveColor(colorInput.value));
  on(autoColorButton, "click", () => saveColor(null));
  on(doc, COLOR_EVENT, event => applyColor(event.detail?.color));
  on(win, "storage", event => {
    if (event.key !== COLOR_STORAGE) return;
    try { applyColor(JSON.parse(event.newValue)?.color); } catch (_) { applyColor(null); }
  });
  const motionLabel = make("label", "streamPointerOptions__row", "Reduzir animações");
  const motionToggle = make("input", "");
  motionToggle.type = "checkbox";
  motionToggle.checked = reduceMotion;
  motionLabel.appendChild(motionToggle);
  options.appendChild(motionLabel);
  on(motionToggle, "change", () => { reduceMotion = motionToggle.checked; root.classList.toggle("is-reduced-motion", reduceMotion); renderIndicators(); });
  on(reduced, "change", event => {
    reduceMotion = event.matches;
    motionToggle.checked = reduceMotion;
    root.classList.toggle("is-reduced-motion", reduceMotion);
    renderIndicators();
  });
  const saveBinding = () => {
    const next = normalizeBinding({ modifier: keySelect.value, mouse: mouseSelect.value });
    try { win.localStorage.setItem(BINDING_STORAGE, JSON.stringify(next)); } catch (_) {}
    // All views in this document share one preference without transport or polling.
    doc.dispatchEvent(new win.CustomEvent(BINDING_EVENT, { detail: next }));
  };
  on(keySelect, "change", saveBinding);
  on(mouseSelect, "change", saveBinding);
  on(doc, BINDING_EVENT, event => applyBinding(event.detail));
  on(win, "storage", event => {
    if (event.key !== BINDING_STORAGE) return;
    try { applyBinding(JSON.parse(event.newValue)); } catch (_) { applyBinding(null); }
  });
  const ownerOptions = make("div", "streamPointerOptions__owner");
  const receptionLabel = make("label", "streamPointerOptions__row", "Receber pointers");
  const reception = make("input", "");
  reception.type = "checkbox";
  receptionLabel.appendChild(reception);
  ownerOptions.appendChild(receptionLabel);
  const policyLabel = make("label", "streamPointerOptions__row", "Permitir");
  const policySelect = make("select", "streamPointerOptions__select");
  for (const [value, label] of [["all", "Todos na chamada"], ["selected", "Pessoas selecionadas"]]) {
    const option = make("option", "", label);
    option.value = value;
    policySelect.appendChild(option);
  }
  policyLabel.appendChild(policySelect);
  ownerOptions.appendChild(policyLabel);
  const people = make("div", "streamPointerOptions__people");
  ownerOptions.appendChild(people);
  const hideAll = make("button", "streamPointerToolbar__button", "Ocultar todos agora");
  hideAll.type = "button";
  ownerOptions.appendChild(hideAll);
  options.appendChild(ownerOptions);
  const notice = make("p", "streamPointerOptions__notice", "Os indicadores aparecem apenas dentro do ALTARA. Esc termina o modo ativo.");
  options.appendChild(notice);
  toolbar.appendChild(status);
  root.append(input, layer, toolbar, options);
  // Pointer controls live inside clickable/focusable stream tiles. Their
  // interactions must not also focus, pop out, or open stream audio menus.
  for (const eventName of ["click", "dblclick", "pointerdown", "contextmenu"]) {
    on(root, eventName, event => {
      if (event.target?.closest?.(".streamPointerToolbar,.streamPointerOptions")
        || (eventName !== "contextmenu" && effectiveMode())) event.stopPropagation();
    });
  }
  const policyUpdate = patch => {
    const accepted = controller.setPolicy(streamId, { ...snapshot.policy, ...patch });
    if (!accepted) { controlsSignature = ""; syncControls(); }
    return accepted;
  };
  on(reception, "change", () => policyUpdate({ enabled: reception.checked }));
  on(policySelect, "change", () => policyUpdate({ mode: policySelect.value }));
  on(hideAll, "click", event => { event.stopPropagation(); controller.clear(streamId); });
  const participantRows = new Map();
  const rowListeners = [];
  let peopleSignature = "";
  let peoplePolicySignature = "";

  function presentation(identity, fallback = {}) {
    const found = getParticipantPresentation?.(identity) || fallback || {};
    const name = String(found.name || found.displayName || identity || "Participante").slice(0, 48);
    let color = customColor(fallback?.color) || customColor(found.color);
    if (!color && /^#[\da-f]{3}$/i.test(found.color || "")) color = `#${[...found.color.slice(1)].map(char => char + char).join("")}`;
    color ||= "#a8b8d4";
    return { name, color };
  }
  function syncPeople() {
    const participants = Array.isArray(snapshot.participants) ? snapshot.participants : [];
    const signature = JSON.stringify(participants.map(person => [person.identity, person.name]));
    const policySignature = JSON.stringify(snapshot.policy);
    if (signature === peopleSignature && policySignature === peoplePolicySignature) return;
    peoplePolicySignature = policySignature;
    if (signature !== peopleSignature) {
      peopleSignature = signature;
      for (const remove of rowListeners.splice(0)) remove();
      participantRows.clear();
      people.replaceChildren();
      for (const person of participants) {
        if (person.identity === snapshot.ownerIdentity) continue;
        const row = make("div", "streamPointerOptions__person");
        const allowLabel = make("label", "streamPointerOptions__allow", presentation(person.identity, person).name);
        const allow = make("input", "");
        allow.type = "checkbox";
        allow.setAttribute("aria-label", `Permitir pointers de ${presentation(person.identity, person).name}`);
        allowLabel.prepend(allow);
        const mute = make("button", "streamPointerToolbar__button");
        mute.type = "button";
        row.append(allowLabel, mute);
        people.appendChild(row);
        const changeAllowed = () => {
          const allowed = new Set(snapshot.policy?.allowed || []);
          if (allow.checked) allowed.add(person.identity); else allowed.delete(person.identity);
          policyUpdate({ allowed: [...allowed] });
        };
        const toggleMuted = event => {
          event.stopPropagation();
          const muted = new Set(snapshot.policy?.muted || []);
          if (muted.has(person.identity)) muted.delete(person.identity); else muted.add(person.identity);
          policyUpdate({ muted: [...muted] });
        };
        allow.addEventListener("change", changeAllowed);
        mute.addEventListener("click", toggleMuted);
        rowListeners.push(() => allow.removeEventListener("change", changeAllowed), () => mute.removeEventListener("click", toggleMuted));
        participantRows.set(person.identity, { allow, mute, name: presentation(person.identity, person).name });
      }
    }
    for (const [identity, row] of participantRows) {
      row.allow.disabled = snapshot.policy?.mode !== "selected";
      row.allow.checked = (snapshot.policy?.allowed || []).includes(identity);
      const muted = (snapshot.policy?.muted || []).includes(identity);
      row.mute.textContent = muted ? "Reativar" : "Silenciar";
      row.mute.setAttribute("aria-label", `${muted ? "Reativar" : "Silenciar"} pointers de ${row.name}`);
      row.mute.setAttribute("aria-pressed", String(muted));
    }
  }
  function effectiveMode() { return held ? "pointer" : mode; }
  function localColor() {
    return selectedColor || presentation(snapshot.localIdentity,
      snapshot.participants?.find(person => person.identity === snapshot.localIdentity)).color;
  }
  function applyColor(value) {
    selectedColor = customColor(value);
    syncColorControls();
    if (currentPoint) transmit(currentPoint);
  }
  function syncColorControls() {
    const color = localColor();
    if (colorInput.value !== color) colorInput.value = color;
    const automatic = String(!selectedColor);
    if (autoColorButton.getAttribute("aria-pressed") !== automatic) autoColorButton.setAttribute("aria-pressed", automatic);
  }
  function stopTemporary() {
    if (!held) return;
    held = false;
    if (!mode) stopPointing(); else syncControls();
  }
  function applyBinding(value) {
    selectedBinding = normalizeBinding(value);
    modifierHeld = false;
    mouseHeld = false;
    stopTemporary();
    keySelect.value = selectedBinding.modifier;
    mouseSelect.value = selectedBinding.mouse;
    controlsSignature = "";
    syncControls();
  }
  function modifiersMatch(event) {
    return !event.metaKey && !event.getModifierState?.("AltGraph")
      && event.altKey === (selectedBinding.modifier === "Alt")
      && event.shiftKey === (selectedBinding.modifier === "Shift")
      && event.ctrlKey === (selectedBinding.modifier === "Control");
  }
  function updateTemporary(event) {
    const combination = bindingCombination(selectedBinding);
    const ready = combination !== "None" && hovered && hoverPoint && snapshot.canSend === true
      && !doc.hidden && isHotkeyAvailable(combination)
      && (selectedBinding.modifier === "None" || modifierHeld)
      && (selectedBinding.mouse === "None" || mouseHeld);
    if (!ready) { stopTemporary(); return false; }
    held = true;
    if (selectedBinding.mouse === "Right") suppressContextMenu = true;
    transmit(hoverPoint);
    syncControls();
    event?.preventDefault();
    event?.stopPropagation();
    return true;
  }
  function stopPointing() {
    if (keepalive) win.clearInterval(keepalive);
    keepalive = 0;
    if (localFrame) win.cancelAnimationFrame(localFrame);
    localFrame = 0;
    pendingPoint = null;
    const shouldEnd = !!currentPoint;
    currentPoint = null;
    held = false;
    modifierHeld = false;
    mouseHeld = false;
    input.replaceChildren();
    localPointerNode = null;
    localPointerColor = "";
    syncControls();
    if (shouldEnd) controller.send(streamId, "end", {});
  }
  function syncControls() {
    const available = snapshot.available !== false && snapshot.connected === true;
    const canSend = available && snapshot.canSend === true;
    const hidden = !available || !geometry;
    if (root.hidden !== hidden) root.hidden = hidden;
    const interactionMode = effectiveMode();
    const combination = bindingCombination(selectedBinding);
    const keyAvailable = combination === "None" || isHotkeyAvailable(combination);
    const nextSignature = [available, canSend, !!geometry, hovered, mode, interactionMode, reduceMotion,
      combination, keyAvailable, snapshot.error || "", !!snapshot.local,
      snapshot.policy?.enabled !== false, snapshot.policy?.mode || "all"].join("|");
    // Mouse movement changes the local dot, not the toolbar. Avoid replacing
    // text/attributes on every mouse event while retaining dynamic key conflicts.
    if (controlsSignature === nextSignature) return;
    controlsSignature = nextSignature;
    root.classList.toggle("is-active", canSend && hovered && !!interactionMode);
    root.classList.toggle("is-hovered", hovered);
    root.classList.toggle("is-reduced-motion", reduceMotion);
    root.dataset.pointerMode = interactionMode;
    pointerButton.disabled = !canSend;
    pointerButton.setAttribute("aria-pressed", String(mode === "pointer"));
    status.textContent = snapshot.error === "send_failed" ? "Falha ao enviar pointer" : !canSend ? "Pointer indisponível" : combination === "None" ? "Atalho desativado" : keyAvailable ? bindingHint(selectedBinding) : "Atalho em uso";
    ownerOptions.hidden = !snapshot.local;
    reception.checked = snapshot.policy?.enabled !== false;
    policySelect.value = snapshot.policy?.mode || "all";
  }
  function updateGeometry() {
    if (disposed) return;
    if (parent !== video.parentElement) {
      parent = video.parentElement;
      parent?.appendChild(root);
    }
    const rect = video.getBoundingClientRect();
    const style = win.getComputedStyle(video);
    // Screen-share videos use untransformed pixels. Mirrored/rotated surfaces
    // cannot safely share intrinsic coordinates without a transform mapping.
    geometry = style.transform && style.transform !== "none" ? null : getVideoContentGeometry({
      rect, width: video.videoWidth, height: video.videoHeight,
      objectFit: style.objectFit || "fill", objectPosition: style.objectPosition || "50% 50%",
    });
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || !video.isConnected) geometry = null;
    // A video can gain metadata after mounting. Temporarily make its overlay
    // measurable before offsetParent lookup; syncControls restores call gating
    // synchronously, before the browser paints.
    root.hidden = !geometry;
    const offset = root.offsetParent;
    if (geometry && offset) {
      const offsetRect = offset.getBoundingClientRect();
      root.style.left = `${rect.left - offsetRect.left - offset.clientLeft + offset.scrollLeft}px`;
      root.style.top = `${rect.top - offsetRect.top - offset.clientTop + offset.scrollTop}px`;
      root.style.width = `${rect.width}px`;
      root.style.height = `${rect.height}px`;
    }
    syncControls();
    renderIndicators();
    if (currentPoint && lastClientPoint) {
      const point = videoPointToNormalized(lastClientPoint.x, lastClientPoint.y, geometry);
      if (point) { hoverPoint = point; transmit(point); } else stopPointing();
    }
  }
  function isControlTarget(target) {
    const control = target?.closest?.(INTERACTIVE);
    // Stage tiles themselves are keyboard buttons. Their descendant videos
    // remain valid pointer targets; actual toolbar/form controls do not.
    return !!control && !control.contains(video);
  }
  function pointFromEvent(event) {
    if (event.pointerType === "touch" || event.target?.closest?.(".streamPointerToolbar,.streamPointerOptions")) return null;
    const target = event.target;
    const targetSurface = target?.closest?.(".streamPointerSurface");
    if (targetSurface && targetSurface !== root) return null;
    if (!target || isControlTarget(target)) return null;
    if (!parent?.contains(target) && !target.contains?.(video)) return null;
    return videoPointToNormalized(event.clientX, event.clientY, geometry);
  }
  function transmit(point) {
    if (!point || snapshot.canSend !== true || !effectiveMode()) return;
    currentPoint = point;
    pendingPoint = point;
    if (!localFrame) localFrame = win.requestAnimationFrame(flushLocalMove);
  }
  function movePayload(point) { return selectedColor ? { ...point, color: selectedColor } : point; }
  function flushLocalMove() {
    localFrame = 0;
    const point = pendingPoint;
    pendingPoint = null;
    if (disposed || !point || !effectiveMode() || !hovered || !snapshot.canSend || doc.hidden) return;
    drawLocalPointer(point);
    controller.send(streamId, "move", movePayload(point));
    if (!keepalive && currentPoint && effectiveMode()) keepalive = win.setInterval(() => {
      if (currentPoint && hovered && effectiveMode() && snapshot.canSend === true) controller.send(streamId, "move", movePayload(currentPoint));
      else stopPointing();
    }, 350);
  }
  function drawLocalPointer(point) {
    const position = normalizedToVideoPoint(point.x, point.y, geometry);
    if (!position) return;
    const node = localPointerNode || make("span", "streamPointerIndicator streamPointerIndicator--local");
    if (!node.firstChild) node.appendChild(make("span", "streamPointerIndicator__shape"));
    node.style.transform = `translate(${position.left}px, ${position.top}px)`;
    const color = localColor();
    if (localPointerColor !== color) { node.style.setProperty("--pointer-color", color); localPointerColor = color; }
    if (!node.parentElement) input.appendChild(node);
    localPointerNode = node;
  }
  on(win, "pointermove", event => {
    lastClientPoint = { x: event.clientX, y: event.clientY };
    const point = pointFromEvent(event);
    hoverPoint = point;
    const wasHovered = hovered;
    hovered = !!point;
    if (!hovered) {
      if (wasHovered) stopPointing();
      syncControls();
      return;
    }
    const expectedButtonMask = selectedBinding.mouse === "Right" ? 2 : selectedBinding.mouse === "Middle" ? 4 : 0;
    if (held && (!modifiersMatch(event) || (expectedButtonMask && !(event.buttons & expectedButtonMask)))) stopTemporary();
    if (effectiveMode() === "pointer") transmit(point);
    syncControls();
  }, { passive: true, capture: true });
  on(win, "pointerdown", event => {
    if (event.pointerType === "touch") return;
    const expected = selectedBinding.mouse === "Right" ? 2 : selectedBinding.mouse === "Middle" ? 1 : -1;
    if (event.button === 2) suppressContextMenu = false;
    if (event.button !== expected || event.defaultPrevented) return;
    const point = pointFromEvent(event);
    if (!point) return;
    lastClientPoint = { x: event.clientX, y: event.clientY };
    hoverPoint = point;
    hovered = true;
    mouseHeld = true;
    modifierHeld = modifiersMatch(event);
    updateTemporary(event);
  }, true);
  on(win, "pointerup", event => {
    const expected = selectedBinding.mouse === "Right" ? 2 : selectedBinding.mouse === "Middle" ? 1 : -1;
    if (event.button !== expected) return;
    const consumed = held;
    mouseHeld = false;
    stopTemporary();
    if (consumed) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  on(input, "pointerdown", event => {
    if (event.button === 0 && effectiveMode()) { event.preventDefault(); event.stopPropagation(); }
  });
  on(input, "pointercancel", () => stopPointing());
  on(input, "click", event => { if (effectiveMode()) { event.preventDefault(); event.stopPropagation(); } });
  on(input, "dblclick", event => { if (effectiveMode()) { event.preventDefault(); event.stopPropagation(); } });
  on(doc, "keydown", event => {
    if (event.key === "Escape" && (mode || held || !options.hidden)) {
      stopPointing(); mode = ""; options.hidden = true;
      optionsButton.setAttribute("aria-expanded", "false");
      syncControls();
      event.preventDefault(); event.stopPropagation();
      return;
    }
    if (event.key !== selectedBinding.modifier) {
      modifierHeld = false;
      stopTemporary();
      return;
    }
    if (event.defaultPrevented || event.repeat || isControlTarget(event.target) || !hovered) return;
    modifierHeld = modifiersMatch(event);
    updateTemporary(event);
  }, true);
  on(doc, "keyup", event => {
    if (event.key === selectedBinding.modifier) {
      const consumed = held;
      modifierHeld = false;
      stopTemporary();
      if (consumed) event.preventDefault();
    }
  }, true);
  on(win, "contextmenu", event => {
    if (!suppressContextMenu) return;
    const point = pointFromEvent(event);
    if (!point) return;
    suppressContextMenu = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  const deactivate = () => { stopPointing(); mode = ""; hovered = false; hoverPoint = null; suppressContextMenu = false; syncControls(); };
  on(win, "blur", deactivate);
  on(doc, "visibilitychange", () => { if (doc.hidden) deactivate(); });
  on(doc, "pointerleave", deactivate);
  on(win, "resize", updateGeometry, { passive: true });
  on(doc, "scroll", updateGeometry, { passive: true, capture: true });
  on(doc, "fullscreenchange", updateGeometry);
  on(video, "loadedmetadata", updateGeometry);
  on(video, "resize", updateGeometry);
  const resizeObserver = win.ResizeObserver ? new win.ResizeObserver(updateGeometry) : null;
  resizeObserver?.observe(video);

  function scheduleFrame() { if (!frame && !disposed) frame = win.requestAnimationFrame(animate); }
  function animate(timestamp) {
    frame = 0;
    let pending = false;
    for (const entry of nodes.values()) {
      if (entry.type !== "move" || !entry.point || !entry.animating) continue;
      // Finish within one network sample interval, without a long trailing tail.
      const progress = reduceMotion ? 1 : Math.min(1, Math.max(0, timestamp - entry.transitionStart) / 40);
      const amount = 1 - (1 - progress) ** 3;
      entry.x = entry.startX + (entry.point.left - entry.startX) * amount;
      entry.y = entry.startY + (entry.point.top - entry.startY) * amount;
      if (Math.abs(entry.x - entry.point.left) < 0.15) entry.x = entry.point.left;
      if (Math.abs(entry.y - entry.point.top) < 0.15) entry.y = entry.point.top;
      entry.node.style.transform = `translate(${entry.x}px, ${entry.y}px)`;
      entry.animating = entry.x !== entry.point.left || entry.y !== entry.point.top;
      pending ||= entry.animating;
    }
    if (pending) scheduleFrame();
  }
  function removeIndicator(key, immediate = false) {
    const entry = nodes.get(key);
    if (!entry) return;
    nodes.delete(key);
    if (immediate || reduceMotion) entry.node.remove();
    else {
      entry.node.classList.add("is-leaving");
      const timer = win.setTimeout(() => { entry.node.remove(); removals.delete(timer); }, 130);
      removals.set(timer, { node: entry.node, identity: entry.identity });
    }
  }
  function clearLeavingIndicators(currentParticipants = null) {
    for (const [timer, entry] of removals) {
      if (currentParticipants?.has(entry.identity)) continue;
      win.clearTimeout(timer);
      entry.node.remove();
      removals.delete(timer);
    }
  }
  function renderIndicators() {
    if (disposed) return;
    if (expiryTimer) win.clearTimeout(expiryTimer);
    expiryTimer = 0;
    const now = Date.now();
    let nextExpiry = Infinity;
    const current = new Set();
    const currentParticipants = new Set((snapshot.participants || []).map(person => person.identity));
    clearLeavingIndicators(snapshot.connected && snapshot.available !== false ? currentParticipants : null);
    if (geometry && snapshot.connected && snapshot.available !== false) {
      for (const indicator of snapshot.indicators || []) {
        if (indicator.expiresAt <= now) continue;
        if (indicator.type === "move" && currentPoint && indicator.identity === snapshot.localIdentity) continue;
        const key = indicator.type === "move" ? `${indicator.identity}:move` : indicator.id || `${indicator.identity}:${indicator.type}:${indicator.sequence}`;
        const type = indicator.type;
        if (!["move", "ping", "highlight"].includes(type)) continue;
        const point = normalizedToVideoPoint(indicator.x, indicator.y, geometry, { clip: type !== "highlight" });
        if (!point) continue;
        current.add(key);
        let entry = nodes.get(key);
        if (!entry) {
          const node = make("span", `streamPointerIndicator streamPointerIndicator--${type}`);
          const dot = make("span", "streamPointerIndicator__shape");
          const label = make("span", "streamPointerIndicator__label");
          node.append(dot, label);
          entry = { node, label, type, identity: indicator.identity, x: point.left, y: point.top,
            point, animating: false, startX: point.left, startY: point.top, transitionStart: win.performance.now() };
          nodes.set(key, entry);
          layer.appendChild(node);
        }
        const look = presentation(indicator.identity, indicator);
        if (entry.label.textContent !== look.name) entry.label.textContent = look.name;
        if (entry.color !== look.color) { entry.node.style.setProperty("--pointer-color", look.color); entry.color = look.color; }
        if (entry.point.left !== point.left || entry.point.top !== point.top) {
          entry.startX = entry.x; entry.startY = entry.y;
          entry.transitionStart = win.performance.now();
          entry.point = point;
          entry.animating = true;
        }
        if (type !== "highlight") {
          entry.node.classList.toggle("is-edge-right", point.left > geometry.width - 115);
          entry.node.classList.toggle("is-edge-bottom", point.top > geometry.height - 28);
        }
        if (type === "highlight") {
          const end = normalizedToVideoPoint(indicator.x2, indicator.y2, geometry, { clip: false });
          if (!end) { removeIndicator(key, true); continue; }
          Object.assign(entry.node.style, { left: `${point.left}px`, top: `${point.top}px`, width: `${end.left - point.left}px`, height: `${end.top - point.top}px` });
        } else if (type === "ping") entry.node.style.transform = `translate(${point.left}px, ${point.top}px)`;
        else if (reduceMotion || !entry.animating) {
          entry.x = point.left; entry.y = point.top; entry.animating = false;
          entry.node.style.transform = `translate(${entry.x}px, ${entry.y}px)`;
        } else scheduleFrame();
        if (Number.isFinite(indicator.expiresAt)) nextExpiry = Math.min(nextExpiry, indicator.expiresAt);
      }
    }
    for (const [key, entry] of nodes) {
      if (!current.has(key)) removeIndicator(key, !snapshot.connected || snapshot.available === false || !currentParticipants.has(entry.identity));
    }
    if (Number.isFinite(nextExpiry)) expiryTimer = win.setTimeout(renderIndicators, Math.max(1, nextExpiry - Date.now() + 1));
  }
  const unsubscribe = controller.subscribe((changed, detail) => {
    if (changed && changed !== streamId) return;
    // The local dot already follows input. Its authenticated transport echo
    // cannot improve that preview; lifecycle/policy/error notices still run.
    if (detail?.kind === "event" && detail.type === "move"
      && detail.identity === snapshot.localIdentity && currentPoint) return;
    const previousError = snapshot.error;
    snapshot = controller.snapshot(streamId);
    const nextPolicyVersion = `${snapshot.epoch}:${snapshot.revision}`;
    if (nextPolicyVersion !== policyVersion) {
      policyVersion = nextPolicyVersion;
      for (const key of nodes.keys()) removeIndicator(key, true);
      clearLeavingIndicators();
      stopPointing();
    }
    if (!snapshot.canSend || !snapshot.connected || snapshot.available === false || snapshot.error === "send_failed") deactivate();
    if (!detail || detail.kind !== "event") {
      syncControls();
      if (snapshot.local) syncPeople();
      syncColorControls();
    } else if (previousError !== snapshot.error) syncControls();
    renderIndicators();
  });
  updateGeometry();
  syncPeople();
  syncColorControls();
  return {
    update: updateGeometry,
    dispose() {
      if (disposed) return;
      stopPointing();
      disposed = true;
      unsubscribe?.();
      resizeObserver?.disconnect();
      for (const remove of listeners) remove();
      for (const remove of rowListeners.splice(0)) remove();
      if (frame) win.cancelAnimationFrame(frame);
      if (expiryTimer) win.clearTimeout(expiryTimer);
      for (const timer of removals.keys()) win.clearTimeout(timer);
      removals.clear();
      root.remove();
      nodes.clear();
    },
  };
}
