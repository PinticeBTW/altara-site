let desktopWindowControlsBound = false;

function getDesktopWindowBridge() {
  const bridge = globalThis?.window?.altaraDesktop;
  if (!bridge || bridge.isDesktopApp !== true) return null;
  return bridge;
}

function supportsCustomDesktopFrame(bridge) {
  const platform = String(bridge?.platform || "").trim().toLowerCase();
  return platform === "win32" || platform === "linux";
}

async function refreshDesktopWindowMaximizeState(bridge) {
  const button = document.getElementById("btnDesktopWindowMax");
  if (!(button instanceof HTMLButtonElement)) return;
  let maximized = false;
  try {
    const result = await bridge?.isWindowMaximized?.();
    maximized = result?.maximized === true;
  } catch (_) {}
  button.classList.toggle("is-maximized", maximized);
  button.setAttribute("aria-label", maximized ? "Restore" : "Maximize");
  button.setAttribute("title", maximized ? "Restore" : "Maximize");
}

export function initDesktopWindowControls() {
  const bridge = getDesktopWindowBridge();
  const controls = document.getElementById("desktopWindowControls");
  const dragRegion = document.querySelector(".authDesktopDragRegion");
  const useCustomFrame = !!(
    bridge
    && supportsCustomDesktopFrame(bridge)
    && typeof bridge.minimizeWindow === "function"
    && typeof bridge.toggleMaximizeWindow === "function"
    && typeof bridge.isWindowMaximized === "function"
    && typeof bridge.closeWindow === "function"
  );

  document.body?.classList?.toggle("desktop-titlebar-overlay", useCustomFrame);
  document.body?.classList?.toggle("desktop-native-titlebar-overlay", useCustomFrame);
  controls?.classList?.toggle("hidden", !useCustomFrame);
  dragRegion?.classList?.toggle("hidden", !useCustomFrame);
  if (!useCustomFrame || !(controls instanceof HTMLElement)) return false;
  if (desktopWindowControlsBound) {
    void refreshDesktopWindowMaximizeState(bridge);
    return true;
  }
  desktopWindowControlsBound = true;

  document.getElementById("btnDesktopWindowMin")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void bridge.minimizeWindow();
  });
  document.getElementById("btnDesktopWindowMax")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void Promise.resolve(bridge.toggleMaximizeWindow())
      .finally(() => refreshDesktopWindowMaximizeState(bridge));
  });
  document.getElementById("btnDesktopWindowClose")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void bridge.closeWindow();
  });
  dragRegion?.addEventListener("dblclick", () => {
    void Promise.resolve(bridge.toggleMaximizeWindow())
      .finally(() => refreshDesktopWindowMaximizeState(bridge));
  });
  window.addEventListener("resize", () => {
    void refreshDesktopWindowMaximizeState(bridge);
  });
  void refreshDesktopWindowMaximizeState(bridge);
  return true;
}
