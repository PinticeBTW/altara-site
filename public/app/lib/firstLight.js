import { normalizeAltaraLocale } from "./locale.js";
import { playFirstLightSound, readFirstLightSoundPreference, saveFirstLightSoundPreference } from "./firstLightSound.js";

export const FIRST_LIGHT_STORAGE_KEY = "altara_desktop_install_welcome_seen_v2_global";
export const FIRST_LIGHT_SESSION_KEY = "altara_auth_install_welcome_seen_session_v1";

export function isFirstLightPreview(locationLike = {}) {
  return ["127.0.0.1", "localhost", "[::1]"].includes(locationLike.hostname)
    && new URLSearchParams(locationLike.search || "").get("firstLightPreview") === "1";
}

export function shouldShowFirstLight({ freshInstall = false, seen = false, preview = false } = {}) {
  return preview || (freshInstall && !seen);
}

const labels = {
  en: { soundOn: "Enable sound", soundOff: "Mute sound", skip: "Skip animation", welcome: "Welcome to ALTARA", preview: "Animation preview", hint: "Play the animation with its soft startup sound, then see the sign-in screen.", play: "Play animation", replay: "Replay animation" },
  "pt-PT": { soundOn: "Ativar som", soundOff: "Silenciar", skip: "Saltar animação", welcome: "Bem-vindo ao ALTARA", preview: "Pré-visualização da animação", hint: "Vê a animação com um som suave e a passagem para o início de sessão.", play: "Reproduzir animação", replay: "Repetir animação" },
  "pt-BR": { soundOn: "Ativar som", soundOff: "Silenciar", skip: "Pular animação", welcome: "Boas-vindas ao ALTARA", preview: "Prévia da animação", hint: "Veja a animação com um som suave e a passagem para a tela de login.", play: "Reproduzir animação", replay: "Repetir animação" },
};

// No account data or navigation: this layer only reveals the auth page beneath it.
export function playFirstLight({ root, locale = "en", onFinish = () => {}, previewMotion = false, sound = readFirstLightSoundPreference() }) {
  const copy = labels[normalizeAltaraLocale(locale)];
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  // Full motion is an explicit, local preview action; production always respects the OS.
  const fullPreviewMotion = previewMotion && isFirstLightPreview(window.location);
  const reducedMotion = () => !fullPreviewMotion && motion.matches;
  const shell = document.querySelector(".authShell");
  const originalInert = shell?.inert || false;
  let finished = false;
  let revealTimer;
  let removeTimer;
  let stopSound = () => {};
  let soundEnabled = sound;
  root.className = "authInstallWelcomeOverlay firstLightSplash";
  root.classList.toggle("firstLightSplash--preview-motion", fullPreviewMotion);
  root.setAttribute("aria-hidden", "false");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", copy.welcome);
  root.innerHTML = `
    <div class="firstLightSplash__light" aria-hidden="true"></div>
    <div class="firstLightSplash__horizon" aria-hidden="true"></div>
    <div class="firstLightSplash__brand" aria-hidden="true">
      <svg class="firstLightSplash__mark" viewBox="120 430 1010 340" fill="none">
        <defs><linearGradient id="firstLightGold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff3df"/><stop offset=".5" stop-color="#e8cfae"/><stop offset="1" stop-color="#ad8158"/></linearGradient></defs>
        <g fill="url(#firstLightGold)" stroke="#f8e5ca" stroke-width="2">
          <polygon pathLength="1" points="145.95 733.36 406.42 469.04 412.51 463.93 419.6 460.74 426.63 458.75 434.3 457.85 439.14 457.71 447.68 459.53 454.71 463.49 460.49 468.81 464.35 474.42 467.75 481.99 577.55 734.48 297.27 734.48 368.28 660.24 457.59 659.97 418.58 562.33 245.89 734.75 145.95 733.36"/>
          <polygon pathLength="1" points="554.06 626.21 597.91 460.51 673.49 460.78 623.19 659.29 810.41 660.1 792.65 735.15 601.13 735.42 554.06 626.21"/>
          <polygon pathLength="1" points="874.42 735.78 916.03 735.33 963.37 547.58 1041.11 547.58 1104.05 461.23 769.34 461.86 747.1 546.86 876.94 548.29 834.97 735.51 874.42 735.78"/>
        </g>
      </svg>
      <span class="firstLightSplash__name">ALTARA</span>
    </div>
    <button class="firstLightSplash__sound" type="button"></button>
    <button class="firstLightSplash__skip" type="button">${copy.skip}</button>`;
  if (shell) shell.inert = true;
  document.body.classList.remove("first-light-pending", "auth-checking");
  document.body.classList.add("auth-install-welcome-open", "first-light-playing");
  document.body.classList.toggle("first-light-preview-motion", fullPreviewMotion);

  const finish = () => {
    if (finished) return;
    finished = true;
    stopSound();
    clearTimeout(revealTimer);
    clearTimeout(removeTimer);
    motion.removeEventListener("change", reveal);
    root.removeEventListener("keydown", onKey);
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("auth-install-welcome-open", "first-light-playing", "first-light-revealing", "first-light-preview-motion");
    if (shell) shell.inert = originalInert;
    onFinish();
  };
  const reveal = () => {
    if (finished) return;
    clearTimeout(revealTimer);
    clearTimeout(removeTimer);
    root.classList.add("is-revealing");
    document.body.classList.add("first-light-revealing");
    if (reducedMotion()) finish();
    else removeTimer = setTimeout(finish, 620);
  };
  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      stopSound();
      reveal();
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const buttons = [...root.querySelectorAll("button")];
      buttons[(buttons.indexOf(document.activeElement) + 1) % buttons.length].focus({ preventScroll: true });
    }
  };
  root.addEventListener("keydown", onKey);
  root.querySelector(".firstLightSplash__skip").addEventListener("click", () => { stopSound(); reveal(); });
  const soundButton = root.querySelector(".firstLightSplash__sound");
  const updateSoundButton = () => {
    soundButton.textContent = soundEnabled ? copy.soundOff : copy.soundOn;
    soundButton.setAttribute("aria-pressed", String(soundEnabled));
  };
  soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    saveFirstLightSoundPreference(soundEnabled);
    stopSound();
    if (soundEnabled) stopSound = playFirstLightSound();
    updateSoundButton();
  });
  updateSoundButton();
  if (soundEnabled && !reducedMotion()) stopSound = playFirstLightSound();
  motion.addEventListener("change", reveal);
  root.querySelector(".firstLightSplash__skip").focus({ preventScroll: true });
  revealTimer = setTimeout(reveal, reducedMotion() ? 180 : 2150);
  return { finish, reveal };
}

// Local preview waits for a click so an automatic short animation cannot be missed.
export function mountFirstLightPreview({ root, locale = "en", onStart = () => {}, onFinish = () => {} }) {
  if (!isFirstLightPreview(window.location)) return false;
  const copy = labels[normalizeAltaraLocale(locale)];
  const shell = document.querySelector(".authShell");
  const originalInert = shell?.inert || false;
  const replay = document.createElement("button");
  replay.type = "button";
  replay.className = "firstLightPreviewReplay";
  replay.textContent = copy.replay;
  replay.hidden = true;
  document.body.append(replay);
  root.className = "authInstallWelcomeOverlay firstLightPreviewGate";
  root.setAttribute("aria-hidden", "false");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", copy.preview);
  root.innerHTML = `<div class="firstLightPreviewGate__card"><span>ALTARA</span><h1>${copy.preview}</h1><p>${copy.hint}</p><button type="button">${copy.play} <span aria-hidden="true">▶</span></button></div>`;
  if (shell) shell.inert = true;
  const finished = () => {
    replay.hidden = false;
    onFinish();
  };
  const launch = () => {
    replay.hidden = true;
    if (shell) shell.inert = originalInert;
    root.removeEventListener("keydown", gateKeys);
    onStart();
    // Clicking the clearly labelled sound preview is explicit consent for this playback.
    playFirstLight({ root, locale, previewMotion: true, sound: true, onFinish: finished });
  };
  const gateKeys = (event) => {
    if (event.key === "Tab") { event.preventDefault(); root.querySelector("button").focus(); }
    if (event.key === "Escape") {
      root.classList.add("hidden");
      root.setAttribute("aria-hidden", "true");
      root.removeEventListener("keydown", gateKeys);
      if (shell) shell.inert = originalInert;
      finished();
    }
  };
  root.addEventListener("keydown", gateKeys);
  root.querySelector("button").addEventListener("click", launch);
  replay.addEventListener("click", launch);
  root.querySelector("button").focus({ preventScroll: true });
  return true;
}
