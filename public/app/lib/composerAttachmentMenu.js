// One delegated binding survives composer navigation/replacement. Media upload
// and permission decisions remain in the existing application pipeline.
export function createComposerAttachmentMenu({ canOpen, onDenied, onFiles, onGif, label }) {
  let menu = null;
  let owner = null;
  const button = () => document.getElementById("btnAttach");
  const close = ({ restoreFocus = false } = {}) => {
    menu?.remove();
    menu = null;
    button()?.setAttribute("aria-expanded", "false");
    if (restoreFocus && owner?.isConnected) owner.focus({ preventScroll: true });
    owner = null;
  };
  const position = () => {
    if (!menu) return;
    if (!owner?.isConnected || !canOpen()) { close(); return; }
    const anchor = owner.getBoundingClientRect();
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(anchor.top - rect.height - 8, window.innerHeight - rect.height - 8))}px`;
  };
  const open = (anchor) => {
    if (!canOpen()) { onDenied(); return; }
    owner = anchor;
    menu = document.createElement("div");
    menu.id = "dmAttachmentActions";
    menu.className = "dmAttachmentActions";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", label());
    for (const [action, title] of [["file", label()], ["gif", "GIF"]]) {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.dataset.composerAction = action;
      item.textContent = title;
      menu.appendChild(item);
    }
    document.body.appendChild(menu);
    anchor.setAttribute("aria-haspopup", "menu");
    anchor.setAttribute("aria-controls", menu.id);
    anchor.setAttribute("aria-expanded", "true");
    position();
    menu?.querySelector("button")?.focus({ preventScroll: true });
  };
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const anchor = target?.closest("#btnAttach");
    if (anchor) {
      event.preventDefault();
      if (menu) close(); else open(anchor);
      return; // The opening click is not an outside click.
    }
    const action = target?.closest("#dmAttachmentActions [data-composer-action]");
    if (action && menu?.contains(action)) {
      event.preventDefault();
      const kind = action.dataset.composerAction;
      close();
      if (!canOpen()) { onDenied(); return; }
      if (kind === "gif") onGif(); else onFiles();
      return;
    }
    if (menu && !menu.contains(target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (!menu) return;
    if (event.key === "Escape") {
      event.preventDefault(); close({ restoreFocus: true });
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = [...menu.querySelectorAll("button")];
      const index = items.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    }
  });
  document.addEventListener("focusin", (event) => {
    if (menu && !menu.contains(event.target) && event.target !== owner) close();
  });
  window.addEventListener("resize", position);
  return { close };
}
