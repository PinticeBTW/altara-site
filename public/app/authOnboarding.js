import { readAltaraLocalePreference } from "./lib/locale.js";
import { readPendingServerInvite, isPendingServerInviteEntry } from "./lib/pendingServerInvite.js";
import { FIRST_LIGHT_STORAGE_KEY, FIRST_LIGHT_SESSION_KEY, isFirstLightPreview, shouldShowFirstLight, playFirstLight, mountFirstLightPreview } from "./lib/firstLight.js";

let initialization = null;
let visible = false;
const dismissListeners = new Set();

function hasSeenWelcome() {
  try { if (localStorage.getItem(FIRST_LIGHT_STORAGE_KEY) === "1") return true; } catch (_) {}
  try { if (sessionStorage.getItem(FIRST_LIGHT_SESSION_KEY) === "1") return true; } catch (_) {}
  return false;
}

function markWelcomeSeen() {
  try { localStorage.setItem(FIRST_LIGHT_STORAGE_KEY, "1"); } catch (_) {}
  try { sessionStorage.setItem(FIRST_LIGHT_SESSION_KEY, "1"); } catch (_) {}
}

async function initialize() {
  const root = document.getElementById("authInstallWelcomeOverlay");
  const preview = isFirstLightPreview(window.location);
  const bridge = window.altaraDesktop;
  let metaTimer;
  try {
    if (!preview) {
      // Preserve direct invite, confirmation and recovery entry points.
      if (readPendingServerInvite()) return false;
      if (isPendingServerInviteEntry(window.location.href)) return false;
      if (/[?&#](?:code|type|token_hash|access_token|auth_recovery|awaiting_confirm)=/.test(window.location.search + window.location.hash)) return false;
    }
    if (!root || (!preview && (hasSeenWelcome() || bridge?.isDesktopApp !== true))) return false;
    document.body.classList.add("first-light-pending");
    const meta = preview ? null : await Promise.race([
      Promise.resolve().then(() => bridge.getMeta()),
      new Promise((resolve) => { metaTimer = setTimeout(() => resolve(null), 800); }),
    ]);
    if (!shouldShowFirstLight({ preview, freshInstall: !!meta?.freshInstallLaunch, seen: hasSeenWelcome() })) return false;
    visible = true;
    if (!preview) markWelcomeSeen();
    const options = { root, locale: readAltaraLocalePreference(), onFinish: () => {
      visible = false;
      for (const callback of dismissListeners) { try { callback(); } catch (_) {} }
      dismissListeners.clear();
      if (!document.activeElement?.matches?.("input,textarea,select")) document.querySelector("#email, #username")?.focus({ preventScroll: true });
    } };
    if (preview) mountFirstLightPreview({ ...options, onStart: () => { visible = true; } });
    else playFirstLight(options);
    return true;
  } catch (_) {
    visible = false;
    root?.classList.add("hidden");
    return false;
  } finally {
    clearTimeout(metaTimer);
    document.body.classList.remove("first-light-pending", "auth-checking");
  }
}

// Called early by the auth HTML; login/register attach their existing focus callbacks later.
export async function initAuthInstallWelcome({ onDone = null, onDismiss = null } = {}) {
  if (!initialization) initialization = initialize();
  await initialization;
  if (visible && typeof onDismiss === "function") dismissListeners.add(onDismiss);
  if (typeof onDone === "function") onDone({ shown: visible });
  return visible;
}
