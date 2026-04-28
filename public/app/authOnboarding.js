const DESKTOP_INSTALL_WELCOME_STORAGE_KEY = "altara_desktop_install_welcome_seen_v2_global";
const AUTH_INSTALL_WELCOME_SESSION_KEY = "altara_auth_install_welcome_seen_session_v1";

let authInstallWelcomeInitPromise = null;

function getDesktopBridge() {
  const bridge = window?.altaraDesktop;
  if (!bridge || bridge.isDesktopApp !== true) return null;
  return bridge;
}

function getOverlayEls() {
  return {
    root: document.getElementById("authInstallWelcomeOverlay"),
    btnStart: document.getElementById("btnAuthInstallWelcomeStart"),
  };
}

function hasSeenInstallWelcome() {
  try {
    if (localStorage.getItem(DESKTOP_INSTALL_WELCOME_STORAGE_KEY) === "1") return true;
  } catch (_) {}
  try {
    if (sessionStorage.getItem(AUTH_INSTALL_WELCOME_SESSION_KEY) === "1") return true;
  } catch (_) {}
  return false;
}

function markInstallWelcomeSeen() {
  try { localStorage.setItem(DESKTOP_INSTALL_WELCOME_STORAGE_KEY, "1"); } catch (_) {}
  try { sessionStorage.setItem(AUTH_INSTALL_WELCOME_SESSION_KEY, "1"); } catch (_) {}
}

async function shouldShowAuthInstallWelcome() {
  const bridge = getDesktopBridge();
  if (!bridge || typeof bridge.getMeta !== "function") return false;
  if (hasSeenInstallWelcome()) return false;
  try {
    const meta = await bridge.getMeta();
    return !!meta?.freshInstallLaunch;
  } catch (_) {
    return false;
  }
}

function setAuthInstallWelcomeVisible(yes) {
  const { root, btnStart } = getOverlayEls();
  if (!(root instanceof HTMLElement)) return;
  const show = !!yes;
  root.classList.toggle("hidden", !show);
  root.setAttribute("aria-hidden", show ? "false" : "true");
  document.body?.classList?.toggle("auth-install-welcome-open", show);
  if (!show) return;
  requestAnimationFrame(() => {
    try {
      btnStart?.focus?.({ preventScroll: true });
    } catch (_) {
      try { btnStart?.focus?.(); } catch (_) {}
    }
  });
}

function bindAuthInstallWelcomeOnce(onDismiss) {
  const { root, btnStart } = getOverlayEls();
  if (!(root instanceof HTMLElement)) return;
  if (root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const dismiss = () => {
    markInstallWelcomeSeen();
    setAuthInstallWelcomeVisible(false);
    if (typeof onDismiss === "function") onDismiss();
  };

  btnStart?.addEventListener("click", dismiss);

  root.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains("authInstallWelcomeOverlay__backdrop")) dismiss();
  });

  document.addEventListener("keydown", (e) => {
    const { root: currentRoot } = getOverlayEls();
    if (!(currentRoot instanceof HTMLElement)) return;
    if (currentRoot.classList.contains("hidden")) return;
    if (e.key !== "Escape" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    dismiss();
  }, true);
}

export async function initAuthInstallWelcome({ onDone = null, onDismiss = null } = {}) {
  if (authInstallWelcomeInitPromise) return authInstallWelcomeInitPromise;

  authInstallWelcomeInitPromise = (async () => {
    const body = document.body;
    const { root } = getOverlayEls();
    if (!(body instanceof HTMLElement) || !(root instanceof HTMLElement)) {
      body?.classList?.remove("auth-checking");
      if (typeof onDone === "function") onDone({ shown: false });
      return false;
    }

    bindAuthInstallWelcomeOnce(() => {
      if (typeof onDismiss === "function") onDismiss();
    });

    const show = await shouldShowAuthInstallWelcome();
    setAuthInstallWelcomeVisible(show);

    body.classList.remove("auth-checking");
    if (typeof onDone === "function") onDone({ shown: show });
    return show;
  })().finally(() => {
    authInstallWelcomeInitPromise = null;
  });

  return authInstallWelcomeInitPromise;
}
