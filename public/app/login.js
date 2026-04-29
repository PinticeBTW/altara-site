import { supabase } from "./supabaseClient.js";
import { $, setDebug, enhancePasswordVisibilityToggles } from "./ui.js";
import { initAuthInstallWelcome } from "./authOnboarding.js";
import { initAuthLanguage, onAuthLanguageChange, tAuth } from "./authI18n.js";

const $email = $("email");
const $password = $("password");
const $btn = $("btnLogin");
const $feedback = $("authFeedback");
const $forgotPasswordBtn = $("btnForgotPassword");
const $forgotEmailBtn = $("btnForgotEmail");
const $recoveryCard = $("authRecoveryCard");
const $recoveryTitle = $("authRecoveryTitle");
const $recoveryHint = $("authRecoveryHint");
const $recoveryLabel = $("authRecoveryLabel");
const $recoveryIdentifier = $("authRecoveryIdentifier");
const $recoverySecretWrap = $("authRecoverySecretWrap");
const $recoverySecretLabel = $("authRecoverySecretLabel");
const $recoverySecret = $("authRecoverySecret");
const $recoverySendBtn = $("btnAuthRecoverySend");
const $recoveryCloseBtn = $("btnAuthRecoveryClose");
const $recoveryResult = $("authRecoveryResult");

const RECOVERY_MODE_PASSWORD = "password";
const RECOVERY_MODE_EMAIL = "email";
const RECOVERY_MODE_RESET = "reset";
const LAST_LOGIN_EMAIL_STORAGE_KEY = "altara_last_login_email";
const PENDING_CONFIRM_EMAIL_STORAGE_KEY = "altara_pending_confirm_email";
const DESKTOP_RECOVERY_REDIRECT_URL = "altara://auth/recovery";
const CONFIRMABLE_OTP_TYPES = new Set(["signup", "magiclink", "invite", "email", "email_change"]);
const RECOVERY_URL_PARAM_KEYS = Object.freeze([
  "type",
  "code",
  "access_token",
  "refresh_token",
  "token_hash",
  "token",
  "expires_in",
  "expires_at",
  "provider_token",
  "provider_refresh_token",
  "auth_recovery",
]);
const PROFILE_AVATAR_SYNC_RETRIES = 4;
const PROFILE_AVATAR_SYNC_DELAY_MS = 180;
const DM_E2EE_LOGIN_SYNC_NOTICE_KEY = "altara_dm_e2ee_login_sync_notice";

let loginInFlight = false;
let recoveryInFlight = false;
let loginButtonDefaultText = "Login";
let recoveryButtonDefaultText = "Send recovery email";
let recoveryMode = RECOVERY_MODE_PASSWORD;
let recoverySessionReady = false;
let lastRecoveryPayloadKey = "";

function writeDmE2eeLoginSyncNotice(message = "", level = "info", meta = null) {
  const text = String(message || "").trim();
  if (!text) {
    try { sessionStorage.removeItem(DM_E2EE_LOGIN_SYNC_NOTICE_KEY); } catch (_) {}
    return;
  }
  const extra = (meta && typeof meta === "object" && !Array.isArray(meta)) ? meta : {};
  try {
    sessionStorage.setItem(DM_E2EE_LOGIN_SYNC_NOTICE_KEY, JSON.stringify({
      message: text,
      level: String(level || "info").trim() || "info",
      createdAt: Date.now(),
      ...extra,
    }));
  } catch (_) {}
}

function getDesktopBridge() {
  const bridge = window?.altaraDesktop;
  if (!bridge || typeof bridge !== "object") return null;
  return bridge;
}

function isTypingTarget(el) {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

function isAuthControlTarget(el) {
  if (!(el instanceof HTMLElement)) return false;
  return !!el.closest("input, textarea, select, button, a, [role='button'], label");
}

function isAuthInstallWelcomeOpen() {
  const overlay = document.getElementById("authInstallWelcomeOverlay");
  return !!(overlay && !overlay.classList.contains("hidden"));
}

function isRecoveryCardOpen() {
  return !!($recoveryCard instanceof HTMLElement && !$recoveryCard.hidden);
}

function isValidUsernameLike(value) {
  return /^(?=.{3,20}$)(?=.*[a-z0-9_.])[a-z0-9_. ]+$/i.test(String(value || "").trim());
}

function isRedirectUrlNotAllowedError(errorInput) {
  const raw = String(errorInput?.message || errorInput || "").toLowerCase();
  return (
    raw.includes("redirect")
    && (
      raw.includes("not allowed")
      || raw.includes("invalid")
      || raw.includes("not whitelisted")
      || raw.includes("not configured")
    )
  );
}

function withTimeout(promiseLike, timeoutMs = 12000) {
  return Promise.race([
    Promise.resolve(promiseLike),
    new Promise((_, reject) => setTimeout(() => reject(new Error(tAuth("login.errorTimeout", "Login timed out. Try again."))), timeoutMs)),
  ]);
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isProfileNotFoundError(errorInput) {
  const raw = String(errorInput?.message || errorInput || "").toLowerCase();
  const code = String(errorInput?.code || "").trim().toUpperCase();
  return code === "PGRST116" || raw.includes("0 rows") || raw.includes("no rows");
}

function readSessionMetadataAvatarUrl(sessionInput) {
  const user = sessionInput?.user || null;
  const direct = String(user?.user_metadata?.avatar_url || "").trim();
  if (direct) return direct;
  return String(user?.raw_user_meta_data?.avatar_url || "").trim();
}

async function syncProfileAvatarFromSessionMetadata(sessionInput) {
  const userId = String(sessionInput?.user?.id || "").trim();
  const metadataAvatar = readSessionMetadataAvatarUrl(sessionInput);
  if (!userId || !metadataAvatar) return;

  for (let attempt = 0; attempt < PROFILE_AVATAR_SYNC_RETRIES; attempt += 1) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (error && !isProfileNotFoundError(error)) return;

      const hasProfile = !!String(data?.id || "").trim();
      const currentAvatar = String(data?.avatar_url || "").trim();
      if (hasProfile && currentAvatar) return;

      if (hasProfile) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: metadataAvatar })
          .eq("id", userId);
        if (!updateError) return;
      }
    } catch (_) {}

    await sleep(PROFILE_AVATAR_SYNC_DELAY_MS * (attempt + 1));
  }
}

function setAuthFeedback(message = "", type = "error") {
  if (!$feedback) return;
  const text = String(message || "").trim();
  $feedback.classList.remove("is-error", "is-success");
  if (!text) {
    $feedback.hidden = true;
    $feedback.textContent = "";
    return;
  }
  $feedback.hidden = false;
  $feedback.textContent = text;
  $feedback.classList.add(type === "success" ? "is-success" : "is-error");
}

function setRecoveryResult(message = "", type = "error") {
  if (!$recoveryResult) return;
  const text = String(message || "").trim();
  $recoveryResult.classList.remove("is-error", "is-success");
  if (!text) {
    $recoveryResult.hidden = true;
    $recoveryResult.textContent = "";
    return;
  }
  $recoveryResult.hidden = false;
  $recoveryResult.textContent = text;
  $recoveryResult.classList.add(type === "success" ? "is-success" : "is-error");
}

function readLoginErrorMessage(err) {
  const raw = String(err?.message || err || "").trim();
  const msg = raw.toLowerCase();
  if (!raw) return tAuth("login.errorGeneric", "Login failed. Try again.");
  if (msg.includes("invalid login credentials")) return tAuth("login.errorInvalidCreds", "Wrong email or password.");
  if (msg.includes("email not confirmed")) return tAuth("login.errorEmailNotConfirmed", "Confirm your email before logging in.");
  if (msg.includes("network") || msg.includes("failed to fetch")) return tAuth("login.errorNetwork", "No connection. Check internet and try again.");
  if (msg.includes("timeout")) return tAuth("login.errorTimeout", "Login timed out. Try again.");
  return raw;
}

function readRecoveryErrorMessage(err) {
  const raw = String(err?.message || err || "").trim();
  if (!raw) return tAuth("login.recoveryErrorGeneric", "Could not process recovery right now. Try again.");
  const msg = raw.toLowerCase();
  if (msg.includes("network") || msg.includes("failed to fetch")) return tAuth("login.errorNetwork", "No connection. Check internet and try again.");
  if (msg.includes("timeout")) return tAuth("login.errorTimeout", "Login timed out. Try again.");
  if (msg.includes("auth session missing")) return tAuth("login.recoveryResetMissingSession", "Reset session expired. Open a fresh reset link.");
  if (msg.includes("otp") && msg.includes("expired")) return tAuth("login.recoveryResetInvalidLink", "Invalid reset link. Request a new one.");
  if (msg.includes("invalid") && msg.includes("token")) return tAuth("login.recoveryResetInvalidLink", "Invalid reset link. Request a new one.");
  if (msg.includes("password")) return tAuth("login.recoveryResetWeakPassword", "Use at least 6 characters.");
  return raw;
}

function readConfirmationErrorMessage(err) {
  const raw = String(err?.message || err || "").trim();
  if (!raw) return tAuth("login.confirmErrorGeneric", "Could not confirm your account right now. Try again.");
  const msg = raw.toLowerCase();
  if (msg.includes("network") || msg.includes("failed to fetch")) return tAuth("login.errorNetwork", "No connection. Check internet and try again.");
  if (msg.includes("timeout")) return tAuth("login.errorTimeout", "Login timed out. Try again.");
  if (msg.includes("expired")) return tAuth("login.confirmErrorExpired", "Confirmation link expired. Request a new one.");
  if (msg.includes("invalid") && msg.includes("token")) return tAuth("login.confirmErrorInvalid", "Invalid confirmation link. Request a new one.");
  if (msg.includes("otp") && msg.includes("invalid")) return tAuth("login.confirmErrorInvalid", "Invalid confirmation link. Request a new one.");
  return raw;
}

function maskEmailForHint(emailInput) {
  const email = String(emailInput || "").trim();
  if (!email || !email.includes("@")) return "";
  const parts = email.split("@");
  const local = String(parts[0] || "").trim();
  const domain = String(parts[1] || "").trim();
  if (!local || !domain) return "";
  const localMasked = local.length <= 1
    ? `${local || "*"}***`
    : `${local[0]}${"*".repeat(Math.min(4, Math.max(2, local.length - 1)))}`;
  const domainParts = domain.split(".");
  const host = String(domainParts.shift() || "").trim();
  const tld = domainParts.join(".");
  const hostMasked = host.length <= 1
    ? `${host || "*"}**`
    : `${host[0]}${"*".repeat(Math.min(3, Math.max(2, host.length - 1)))}`;
  return tld ? `${localMasked}@${hostMasked}.${tld}` : `${localMasked}@${hostMasked}`;
}

function writeLastLoginEmail(emailInput) {
  const email = String(emailInput || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return;
  try {
    localStorage.setItem(LAST_LOGIN_EMAIL_STORAGE_KEY, email);
  } catch (_) {}
}

function readLastLoginEmailHint() {
  try {
    return maskEmailForHint(localStorage.getItem(LAST_LOGIN_EMAIL_STORAGE_KEY));
  } catch (_) {
    return "";
  }
}

function readPendingConfirmationEmail() {
  try {
    return String(localStorage.getItem(PENDING_CONFIRM_EMAIL_STORAGE_KEY) || "").trim().toLowerCase();
  } catch (_) {
    return "";
  }
}

function clearPendingConfirmationEmail() {
  try {
    localStorage.removeItem(PENDING_CONFIRM_EMAIL_STORAGE_KEY);
  } catch (_) {}
}
function isMissingRecoveryRpcError(err) {
  const raw = String(err?.message || err || "").toLowerCase();
  return (
    (raw.includes("recover_login_email_hint") && raw.includes("function"))
    || raw.includes("could not find the function public.recover_login_email_hint")
    || raw.includes("recover_login_email_hint(p_username)")
  );
}

function getAuthInputs() {
  return [$email, $password, $recoveryIdentifier, $recoverySecret].filter(Boolean);
}

function ensureLoginInputsReady() {
  getAuthInputs().forEach((el) => {
    try {
      el.disabled = false;
      el.readOnly = false;
      el.removeAttribute("inert");
      el.style.pointerEvents = "auto";
    } catch (_) {}
  });
}

function focusRecoveryInput() {
  const isResetMode = recoveryMode === RECOVERY_MODE_RESET;
  const shouldFocusConfirm = isResetMode
    && $recoveryIdentifier instanceof HTMLInputElement
    && $recoverySecret instanceof HTMLInputElement
    && String($recoveryIdentifier.value || "").length >= 6
    && !$recoverySecret.value;
  const target = shouldFocusConfirm ? $recoverySecret : $recoveryIdentifier;
  if (!(target instanceof HTMLInputElement)) return;
  try {
    target.focus({ preventScroll: true });
  } catch (_) {
    try { target.focus(); } catch (_) {}
  }
}

function focusBestAuthInput() {
  if (isAuthInstallWelcomeOpen()) return;
  const active = document.activeElement;
  if (isRecoveryCardOpen()) {
    if (active && (active === $recoveryIdentifier || active === $recoverySecret)) return;
    focusRecoveryInput();
    return;
  }
  if (active && (active === $email || active === $password)) return;
  const target = String($email?.value || "").trim() ? $password : $email;
  try {
    target?.focus({ preventScroll: true });
  } catch (_) {
    try { target?.focus(); } catch (_) {}
  }
}

function decodePathSegmentSafe(segment) {
  const raw = String(segment || "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch (_) {
    return raw;
  }
}

function readHashParams(hashInput = "") {
  const hash = String(hashInput || "");
  if (!hash || !hash.includes("=")) return new URLSearchParams();
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  const normalizedBody = body.startsWith("?") ? body.slice(1) : body;
  return new URLSearchParams(normalizedBody);
}

function mergeUrlParams(urlObj) {
  const merged = new URLSearchParams(String(urlObj?.search || ""));
  const hashParams = readHashParams(urlObj?.hash || "");
  hashParams.forEach((value, key) => {
    if (!merged.has(key)) merged.set(key, value);
  });
  return merged;
}

function normalizeAuthOtpType(typeInput = "") {
  const type = String(typeInput || "").trim().toLowerCase();
  if (!type) return "";
  if (type === "recovery" || type === "signup" || type === "magiclink" || type === "invite" || type === "email" || type === "email_change") {
    return type;
  }
  return "";
}

function extractRecoveryPayloadFromUrlLike(rawUrl = "") {
  const raw = String(rawUrl || "").trim();
  if (!raw) return null;

  let urlObj = null;
  try {
    urlObj = new URL(raw, window.location?.href || undefined);
  } catch (_) {
    return null;
  }

  const params = mergeUrlParams(urlObj);
  const type = normalizeAuthOtpType(params.get("type"));
  const code = String(params.get("code") || "").trim();
  const accessToken = String(params.get("access_token") || "").trim();
  const refreshToken = String(params.get("refresh_token") || "").trim();
  const tokenHash = String(params.get("token_hash") || "").trim();
  const token = String(params.get("token") || "").trim();
  const email = String(params.get("email") || "").trim().toLowerCase();

  const host = String(urlObj.hostname || urlObj.host || "").trim().toLowerCase();
  const segments = String(urlObj.pathname || "")
    .split("/")
    .map((segment) => decodePathSegmentSafe(segment).trim().toLowerCase())
    .filter(Boolean);

  const isRecoveryPath = (
    (host === "auth" && segments[0] === "recovery")
    || host === "recovery"
    || (segments[0] === "auth" && segments[1] === "recovery")
    || segments[0] === "recovery"
  );
  const hasRecoveryTokens = !!(
    code
    || (accessToken && refreshToken)
    || tokenHash
    || token
  );
  const hasRecoverySignal = type === "recovery" || isRecoveryPath;
  if (!hasRecoverySignal || !hasRecoveryTokens) return null;

  return {
    rawUrl: raw,
    type: type || "recovery",
    code,
    accessToken,
    refreshToken,
    tokenHash,
    token,
    email,
  };
}

function extractConfirmationPayloadFromUrlLike(rawUrl = "") {
  const raw = String(rawUrl || "").trim();
  if (!raw) return null;

  let urlObj = null;
  try {
    urlObj = new URL(raw, window.location?.href || undefined);
  } catch (_) {
    return null;
  }

  const params = mergeUrlParams(urlObj);
  const type = normalizeAuthOtpType(params.get("type"));
  if (type === "recovery") return null;

  const code = String(params.get("code") || "").trim();
  const accessToken = String(params.get("access_token") || "").trim();
  const refreshToken = String(params.get("refresh_token") || "").trim();
  const tokenHash = String(params.get("token_hash") || "").trim();
  const token = String(params.get("token") || "").trim();
  const email = String(params.get("email") || "").trim().toLowerCase();

  const host = String(urlObj.hostname || urlObj.host || "").trim().toLowerCase();
  const segments = String(urlObj.pathname || "")
    .split("/")
    .map((segment) => decodePathSegmentSafe(segment).trim().toLowerCase())
    .filter(Boolean);

  const isConfirmPath = (
    (host === "auth" && (segments[0] === "confirm" || segments[0] === "callback" || segments[0] === "verify"))
    || host === "confirm"
    || host === "callback"
    || (segments[0] === "auth" && (segments[1] === "confirm" || segments[1] === "callback" || segments[1] === "verify"))
    || segments[0] === "confirm"
    || segments[0] === "callback"
    || segments[0] === "verify"
  );

  const hasAuthTokens = !!(
    code
    || (accessToken && refreshToken)
    || tokenHash
    || token
  );
  const hasConfirmSignal = isConfirmPath || (type && CONFIRMABLE_OTP_TYPES.has(type));
  if (!hasAuthTokens || !hasConfirmSignal) return null;

  return {
    rawUrl: raw,
    type: type || "signup",
    code,
    accessToken,
    refreshToken,
    tokenHash,
    token,
    email,
  };
}

function buildRecoveryPayloadKey(payload) {
  if (!payload || typeof payload !== "object") return "";
  const code = String(payload.code || "").trim();
  if (code) return `code:${code}`;
  const tokenHash = String(payload.tokenHash || "").trim();
  if (tokenHash) return `token_hash:${tokenHash}`;
  const token = String(payload.token || "").trim();
  if (token) return `token:${token}`;
  const accessToken = String(payload.accessToken || "").trim();
  const refreshToken = String(payload.refreshToken || "").trim();
  if (accessToken || refreshToken) {
    return `session:${accessToken.slice(0, 18)}:${refreshToken.slice(0, 18)}`;
  }
  return "";
}

function clearRecoveryParamsFromCurrentLocation() {
  try {
    const url = new URL(window.location.href);
    let changed = false;

    RECOVERY_URL_PARAM_KEYS.forEach((key) => {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    });

    if (String(url.hash || "").includes("=")) {
      const hashParams = readHashParams(url.hash);
      RECOVERY_URL_PARAM_KEYS.forEach((key) => {
        if (hashParams.has(key)) {
          hashParams.delete(key);
          changed = true;
        }
      });
      const nextHashBody = hashParams.toString();
      url.hash = nextHashBody ? `#${nextHashBody}` : "";
    }

    if (!changed) return;
    const nextSearch = url.searchParams.toString();
    const nextHref = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash || ""}`;
    window.history?.replaceState?.(window.history.state || null, "", nextHref);
  } catch (_) {}
}

function showPendingConfirmationHintFromUrlOrStorage() {
  let pendingEmail = readPendingConfirmationEmail();
  let shouldShow = !!pendingEmail;

  try {
    const url = new URL(window.location.href);
    const awaitingRaw = String(url.searchParams.get("awaiting_confirm") || "").trim().toLowerCase();
    const emailFromQuery = String(url.searchParams.get("email") || "").trim().toLowerCase();
    if (emailFromQuery && emailFromQuery.includes("@")) pendingEmail = emailFromQuery;
    if (awaitingRaw === "1" || awaitingRaw === "true" || emailFromQuery) shouldShow = true;

    let changed = false;
    if (url.searchParams.has("awaiting_confirm")) {
      url.searchParams.delete("awaiting_confirm");
      changed = true;
    }
    if (url.searchParams.has("email")) {
      url.searchParams.delete("email");
      changed = true;
    }
    if (changed) {
      const nextSearch = url.searchParams.toString();
      const nextHref = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash || ""}`;
      window.history?.replaceState?.(window.history.state || null, "", nextHref);
    }
  } catch (_) {}

  if (!shouldShow) return;
  if ($email instanceof HTMLInputElement && !$email.value && pendingEmail) {
    $email.value = pendingEmail;
  }
  if (pendingEmail) {
    writeLastLoginEmail(pendingEmail);
  }
  setAuthFeedback(
    tAuth(
      "login.confirmPending",
      "Confirm your account from your email. After confirmation, ALTARA logs you in automatically."
    ),
    "success",
  );
}

function resolvePasswordRecoveryRedirectUrl() {
  if (getDesktopBridge()?.isDesktopApp) return DESKTOP_RECOVERY_REDIRECT_URL;

  const origin = String(window.location?.origin || "").trim();
  if (!/^https?:\/\//i.test(origin)) return "";

  const path = String(window.location?.pathname || "").trim() || "/login.html";
  return `${origin}${path}`;
}
function syncRecoveryModeCopy() {
  const isEmailMode = recoveryMode === RECOVERY_MODE_EMAIL;
  const isResetMode = recoveryMode === RECOVERY_MODE_RESET;

  if ($recoveryTitle) {
    $recoveryTitle.textContent = isResetMode
      ? tAuth("login.recoveryResetTitle", "Set a new password")
      : (isEmailMode
        ? tAuth("login.recoveryModeEmailTitle", "Email reminder")
        : tAuth("login.recoveryModePasswordTitle", "Password recovery"));
  }
  if ($recoveryHint) {
    $recoveryHint.textContent = isResetMode
      ? tAuth("login.recoveryResetHint", "This reset link is valid. Enter your new password below.")
      : (isEmailMode
        ? tAuth("login.recoveryModeEmailHint", "Enter your username and we'll show a masked email hint.")
        : tAuth("login.recoveryModePasswordHint", "Enter your account email. We'll send a reset email."));
  }
  if ($recoveryLabel) {
    $recoveryLabel.textContent = isResetMode
      ? tAuth("login.recoveryResetPasswordLabel", "New password")
      : (isEmailMode
        ? tAuth("login.recoveryModeEmailLabel", "Username")
        : tAuth("login.recoveryModePasswordLabel", "Email"));
  }
  if ($recoveryIdentifier instanceof HTMLInputElement) {
    if (isResetMode) {
      $recoveryIdentifier.type = "password";
      $recoveryIdentifier.autocomplete = "new-password";
      $recoveryIdentifier.placeholder = tAuth("login.recoveryResetPasswordPlaceholder", "minimum 6");
    } else if (isEmailMode) {
      $recoveryIdentifier.type = "text";
      $recoveryIdentifier.autocomplete = "username";
      $recoveryIdentifier.placeholder = tAuth("login.recoveryModeEmailPlaceholder", "e.g. pintice");
    } else {
      $recoveryIdentifier.type = "email";
      $recoveryIdentifier.autocomplete = "email";
      $recoveryIdentifier.placeholder = tAuth("login.recoveryModePasswordPlaceholder", "you@email.com");
    }
  }

  if ($recoverySecretWrap instanceof HTMLElement) {
    $recoverySecretWrap.hidden = !isResetMode;
  }
  if ($recoverySecretLabel) {
    $recoverySecretLabel.textContent = tAuth("login.recoveryResetConfirmLabel", "Confirm new password");
  }
  if ($recoverySecret instanceof HTMLInputElement) {
    $recoverySecret.type = "password";
    $recoverySecret.autocomplete = "new-password";
    $recoverySecret.placeholder = tAuth("login.recoveryResetConfirmPlaceholder", "repeat your new password");
    $recoverySecret.disabled = !isResetMode;
    if (!isResetMode) $recoverySecret.value = "";
  }

  recoveryButtonDefaultText = isResetMode
    ? tAuth("login.recoveryResetSubmit", "Update password")
    : (isEmailMode
      ? tAuth("login.recoverySendEmailHint", "Find email hint")
      : tAuth("login.recoverySendPassword", "Send recovery email"));
  if ($recoverySendBtn && !recoveryInFlight) {
    $recoverySendBtn.textContent = recoveryButtonDefaultText;
  }
}

function syncLoginStaticCopy() {
  loginButtonDefaultText = tAuth("login.actionPrimary", "Login");
  if ($btn && !loginInFlight) {
    $btn.textContent = loginButtonDefaultText;
  }
  if ($forgotPasswordBtn) $forgotPasswordBtn.textContent = tAuth("login.forgotPassword", "Forgot password?");
  if ($forgotEmailBtn) $forgotEmailBtn.textContent = tAuth("login.forgotEmail", "Forgot email?");
  if ($recoveryCloseBtn) $recoveryCloseBtn.textContent = tAuth("login.recoveryClose", "Close");
  syncRecoveryModeCopy();
}

function openRecoveryCard(mode = RECOVERY_MODE_PASSWORD, { preserveResult = false } = {}) {
  recoveryMode = mode === RECOVERY_MODE_EMAIL
    ? RECOVERY_MODE_EMAIL
    : (mode === RECOVERY_MODE_RESET ? RECOVERY_MODE_RESET : RECOVERY_MODE_PASSWORD);

  if ($recoveryCard) $recoveryCard.hidden = false;
  if (!preserveResult) setRecoveryResult("");
  syncRecoveryModeCopy();

  if ($recoveryIdentifier && recoveryMode === RECOVERY_MODE_PASSWORD) {
    const email = String($email?.value || "").trim();
    if (email) $recoveryIdentifier.value = email;
  } else if ($recoveryIdentifier && recoveryMode === RECOVERY_MODE_EMAIL) {
    const savedHint = readLastLoginEmailHint();
    if (savedHint && !preserveResult) {
      setRecoveryResult(
        `${tAuth("login.recoveryEmailHintPrefix", "Email hint:")} ${savedHint}`,
        "success",
      );
    }
  } else if ($recoveryIdentifier && recoveryMode === RECOVERY_MODE_RESET) {
    $recoveryIdentifier.value = "";
    if ($recoverySecret) $recoverySecret.value = "";
  }

  requestAnimationFrame(() => {
    focusRecoveryInput();
  });
}

function closeRecoveryCard() {
  if ($recoveryCard) $recoveryCard.hidden = true;
  if ($recoveryIdentifier) $recoveryIdentifier.value = "";
  if ($recoverySecret) $recoverySecret.value = "";
  setRecoveryResult("");
  recoveryMode = RECOVERY_MODE_PASSWORD;
  recoverySessionReady = false;
  syncRecoveryModeCopy();
}

async function fetchMaskedEmailHintByUsername(usernameInput) {
  const username = String(usernameInput || "").trim().toLowerCase();
  const { data, error } = await withTimeout(
    supabase.rpc("recover_login_email_hint", { p_username: username }),
    12000,
  );
  setDebug({ auth_recover_email_hint: { username, error, hasData: !!data } });
  if (error) throw error;
  const first = Array.isArray(data) ? data[0] : data;
  return String(first?.masked_email || "").trim();
}

async function ensureRecoverySessionFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error(tAuth("login.recoveryResetInvalidLink", "Invalid reset link. Request a new one."));
  }

  if (payload.code) {
    const exchange = await withTimeout(
      supabase.auth.exchangeCodeForSession(payload.code),
      12000,
    );
    if (exchange?.error) throw exchange.error;
  } else if (payload.accessToken && payload.refreshToken) {
    const setSessionResult = await withTimeout(
      supabase.auth.setSession({
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken,
      }),
      12000,
    );
    if (setSessionResult?.error) throw setSessionResult.error;
  } else if (payload.tokenHash) {
    const verifyResult = await withTimeout(
      supabase.auth.verifyOtp({
        token_hash: payload.tokenHash,
        type: "recovery",
      }),
      12000,
    );
    if (verifyResult?.error) throw verifyResult.error;
  } else if (payload.token) {
    // Supabase can provide either token_hash or token depending on template/flow.
    let verifyResult = await withTimeout(
      supabase.auth.verifyOtp({
        token_hash: payload.token,
        type: "recovery",
      }),
      12000,
    );
    if (verifyResult?.error && payload.email) {
      verifyResult = await withTimeout(
        supabase.auth.verifyOtp({
          email: payload.email,
          token: payload.token,
          type: "recovery",
        }),
        12000,
      );
    }
    if (verifyResult?.error) throw verifyResult.error;
  } else {
    throw new Error(tAuth("login.recoveryResetInvalidLink", "Invalid reset link. Request a new one."));
  }

  const sessionResult = await withTimeout(supabase.auth.getSession(), 12000);
  if (sessionResult?.error) throw sessionResult.error;
  if (!sessionResult?.data?.session) {
    throw new Error(tAuth("login.recoveryResetMissingSession", "Reset session expired. Open a fresh reset link."));
  }
  return sessionResult.data.session;
}

async function ensureConfirmationSessionFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error(tAuth("login.confirmErrorInvalid", "Invalid confirmation link. Request a new one."));
  }

  const otpType = normalizeAuthOtpType(payload.type) || "signup";

  if (payload.code) {
    const exchange = await withTimeout(
      supabase.auth.exchangeCodeForSession(payload.code),
      12000,
    );
    if (exchange?.error) throw exchange.error;
  } else if (payload.accessToken && payload.refreshToken) {
    const setSessionResult = await withTimeout(
      supabase.auth.setSession({
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken,
      }),
      12000,
    );
    if (setSessionResult?.error) throw setSessionResult.error;
  } else if (payload.tokenHash) {
    let verifyResult = await withTimeout(
      supabase.auth.verifyOtp({
        token_hash: payload.tokenHash,
        type: otpType,
      }),
      12000,
    );
    if (verifyResult?.error && otpType !== "signup") {
      verifyResult = await withTimeout(
        supabase.auth.verifyOtp({
          token_hash: payload.tokenHash,
          type: "signup",
        }),
        12000,
      );
    }
    if (verifyResult?.error) throw verifyResult.error;
  } else if (payload.token) {
    let verifyResult = await withTimeout(
      supabase.auth.verifyOtp({
        token_hash: payload.token,
        type: otpType,
      }),
      12000,
    );
    if (verifyResult?.error && payload.email) {
      verifyResult = await withTimeout(
        supabase.auth.verifyOtp({
          email: payload.email,
          token: payload.token,
          type: otpType,
        }),
        12000,
      );
    }
    if (verifyResult?.error && otpType !== "signup") {
      verifyResult = await withTimeout(
        supabase.auth.verifyOtp({
          token_hash: payload.token,
          type: "signup",
        }),
        12000,
      );
    }
    if (verifyResult?.error) throw verifyResult.error;
  } else {
    throw new Error(tAuth("login.confirmErrorInvalid", "Invalid confirmation link. Request a new one."));
  }

  const sessionResult = await withTimeout(supabase.auth.getSession(), 12000);
  if (sessionResult?.error) throw sessionResult.error;
  if (!sessionResult?.data?.session) {
    throw new Error(tAuth("login.confirmErrorInvalid", "Invalid confirmation link. Request a new one."));
  }
  return sessionResult.data.session;
}

async function consumeRecoveryUrlIfPresent(rawUrl, { clearCurrentLocation = false } = {}) {
  const payload = extractRecoveryPayloadFromUrlLike(rawUrl);
  if (!payload) return false;

  const payloadKey = buildRecoveryPayloadKey(payload);
  if (payloadKey && payloadKey === lastRecoveryPayloadKey) return true;
  if (payloadKey) lastRecoveryPayloadKey = payloadKey;

  if (clearCurrentLocation) clearRecoveryParamsFromCurrentLocation();

  openRecoveryCard(RECOVERY_MODE_RESET, { preserveResult: false });
  setRecoveryResult(tAuth("login.recoveryResetPreparing", "Verifying reset link..."), "success");

  try {
    const session = await ensureRecoverySessionFromPayload(payload);
    recoverySessionReady = true;
    const email = String(session?.user?.email || "").trim().toLowerCase();
    if (email && $email) $email.value = email;
    setRecoveryResult(tAuth("login.recoveryResetReady", "Link verified. Set your new password."), "success");
    focusRecoveryInput();
    setDebug({
      auth_recovery_link: {
        ok: true,
        hasCode: !!payload.code,
        hasTokenHash: !!payload.tokenHash,
        hasToken: !!payload.token,
        hasSessionTokens: !!(payload.accessToken && payload.refreshToken),
      },
    });
    return true;
  } catch (error) {
    recoverySessionReady = false;
    setRecoveryResult(readRecoveryErrorMessage(error), "error");
    setDebug({
      auth_recovery_link: {
        ok: false,
        message: String(error?.message || error || "").slice(0, 240),
      },
    });
    return false;
  }
}

async function consumeConfirmationUrlIfPresent(rawUrl, { clearCurrentLocation = false } = {}) {
  const payload = extractConfirmationPayloadFromUrlLike(rawUrl);
  if (!payload) return false;

  const payloadKey = buildRecoveryPayloadKey(payload);
  if (payloadKey && payloadKey === lastRecoveryPayloadKey) return true;
  if (payloadKey) lastRecoveryPayloadKey = payloadKey;

  if (clearCurrentLocation) clearRecoveryParamsFromCurrentLocation();
  closeRecoveryCard();
  setAuthFeedback(tAuth("login.confirmPreparing", "Verifying account confirmation..."), "success");

  try {
    const session = await ensureConfirmationSessionFromPayload(payload);
    await syncProfileAvatarFromSessionMetadata(session);
    const email = String(session?.user?.email || payload.email || "").trim().toLowerCase();
    if (email && $email) $email.value = email;
    if (email) writeLastLoginEmail(email);
    clearPendingConfirmationEmail();
    setAuthFeedback(tAuth("login.confirmAutoLogin", "Email confirmed. Signing you in..."), "success");
    setDebug({
      auth_confirm_link: {
        ok: true,
        type: String(payload.type || "signup"),
        hasCode: !!payload.code,
        hasTokenHash: !!payload.tokenHash,
        hasToken: !!payload.token,
        hasSessionTokens: !!(payload.accessToken && payload.refreshToken),
      },
    });
    setTimeout(() => {
      window.location.replace("./index.html");
    }, 220);
    return true;
  } catch (error) {
    setAuthFeedback(readConfirmationErrorMessage(error), "error");
    setDebug({
      auth_confirm_link: {
        ok: false,
        type: String(payload.type || "signup"),
        message: String(error?.message || error || "").slice(0, 240),
      },
    });
    return false;
  }
}

async function consumeAuthUrlIfPresent(rawUrl, options = {}) {
  const handledRecovery = await consumeRecoveryUrlIfPresent(rawUrl, options);
  if (handledRecovery) return true;
  return consumeConfirmationUrlIfPresent(rawUrl, options);
}

function bindDesktopAuthDeepLinks() {
  const bridge = getDesktopBridge();
  if (!bridge) return;

  if (typeof bridge.onDeepLink === "function") {
    bridge.onDeepLink((payload) => {
      const rawUrl = String(payload?.url || payload || "").trim();
      if (!rawUrl) return;
      void consumeAuthUrlIfPresent(rawUrl);
    });
  }

  if (typeof bridge.getPendingDeepLink === "function") {
    Promise.resolve(bridge.getPendingDeepLink())
      .then((payload) => {
        const rawUrl = String(payload?.url || payload || "").trim();
        if (!rawUrl) return;
        void consumeAuthUrlIfPresent(rawUrl);
      })
      .catch(() => {});
  }
}
async function applyResetPassword() {
  const newPassword = String($recoveryIdentifier?.value || "");
  const confirmPassword = String($recoverySecret?.value || "");

  if (newPassword.length < 6) {
    setRecoveryResult(tAuth("login.recoveryResetWeakPassword", "Use at least 6 characters."), "error");
    focusRecoveryInput();
    return;
  }
  if (newPassword !== confirmPassword) {
    setRecoveryResult(tAuth("login.recoveryResetMismatch", "Passwords do not match."), "error");
    if ($recoverySecret instanceof HTMLInputElement) {
      try {
        $recoverySecret.focus({ preventScroll: true });
      } catch (_) {
        try { $recoverySecret.focus(); } catch (_) {}
      }
    }
    return;
  }

  const sessionResult = await withTimeout(supabase.auth.getSession(), 12000);
  if (sessionResult?.error) throw sessionResult.error;
  if (!sessionResult?.data?.session || !recoverySessionReady) {
    throw new Error(tAuth("login.recoveryResetMissingSession", "Reset session expired. Open a fresh reset link."));
  }

  const recoveredEmail = String(sessionResult.data.session.user?.email || "").trim().toLowerCase();
  const updateRes = await withTimeout(
    supabase.auth.updateUser({ password: newPassword }),
    12000,
  );
  if (updateRes?.error) throw updateRes.error;

  recoverySessionReady = false;
  if ($email && recoveredEmail) {
    $email.value = recoveredEmail;
    writeLastLoginEmail(recoveredEmail);
  }
  if ($password) $password.value = "";
  if ($recoveryIdentifier) $recoveryIdentifier.value = "";
  if ($recoverySecret) $recoverySecret.value = "";

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (_) {}

  setRecoveryResult(tAuth("login.recoveryResetSuccess", "Password updated. You can now log in."), "success");
}

async function sendRecoveryRequest() {
  if (recoveryInFlight) return;
  if (!$recoveryIdentifier) return;
  ensureLoginInputsReady();
  setAuthFeedback("");

  const raw = String($recoveryIdentifier.value || "").trim();
  if (!raw) {
    const missingMessage = recoveryMode === RECOVERY_MODE_EMAIL
      ? tAuth("login.recoveryEnterUsername", "Type your username.")
      : (recoveryMode === RECOVERY_MODE_RESET
        ? tAuth("login.recoveryResetWeakPassword", "Use at least 6 characters.")
        : tAuth("login.recoveryInvalidEmail", "Type a valid email address."));
    setRecoveryResult(missingMessage, "error");
    focusRecoveryInput();
    return;
  }

  recoveryInFlight = true;
  if ($recoverySendBtn) {
    $recoverySendBtn.disabled = true;
    $recoverySendBtn.textContent = tAuth("login.recoverySending", "Sending...");
  }

  try {
    if (recoveryMode === RECOVERY_MODE_EMAIL) {
      if (!isValidUsernameLike(raw)) {
        setRecoveryResult(tAuth("login.recoveryEnterUsername", "Type your username."), "error");
        return;
      }
      let hint = "";
      try {
        hint = await fetchMaskedEmailHintByUsername(raw);
      } catch (error) {
        if (isMissingRecoveryRpcError(error)) {
          setRecoveryResult(tAuth("login.recoverySqlMissing", "Recovery SQL is missing. Run SQL/SUPABASE_PATCH_AUTH_RECOVERY.sql."), "error");
          return;
        }
        throw error;
      }
      if (hint) {
        setRecoveryResult(`${tAuth("login.recoveryEmailHintPrefix", "Email hint:")} ${hint}`, "success");
      } else {
        setRecoveryResult(tAuth("login.recoveryEmailHintNotFound", "No hint available for that username."), "error");
      }
      return;
    }

    if (recoveryMode === RECOVERY_MODE_RESET) {
      await applyResetPassword();
      return;
    }

    const email = raw.toLowerCase();
    if (!email.includes("@")) {
      setRecoveryResult(tAuth("login.recoveryInvalidEmail", "Type a valid email address."), "error");
      return;
    }

    const redirectTo = resolvePasswordRecoveryRedirectUrl();
    const { error } = await withTimeout(
      supabase.auth.resetPasswordForEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      ),
      12000,
    );
    setDebug({
      auth_recover_password: {
        email,
        error,
        usedRedirectTo: !!redirectTo,
      },
    });
    if (error && isRedirectUrlNotAllowedError(error)) {
      const hintBase = tAuth(
        "login.recoveryRedirectNotAllowed",
        "Recovery redirect is blocked. Add this URL to Supabase Redirect URLs:",
      );
      const urlHint = redirectTo || DESKTOP_RECOVERY_REDIRECT_URL;
      setRecoveryResult(`${hintBase} ${urlHint}`, "error");
      return;
    }
    if (error) throw error;
    writeLastLoginEmail(email);
    setRecoveryResult(tAuth("login.recoveryEmailSent", "If this email exists, a reset email was sent."), "success");
  } catch (error) {
    setRecoveryResult(readRecoveryErrorMessage(error), "error");
  } finally {
    recoveryInFlight = false;
    if ($recoverySendBtn) {
      $recoverySendBtn.disabled = false;
      $recoverySendBtn.textContent = recoveryButtonDefaultText;
    }
    ensureLoginInputsReady();
  }
}

async function doLogin() {
  if (loginInFlight) return;
  ensureLoginInputsReady();
  setAuthFeedback("");
  writeDmE2eeLoginSyncNotice("");

  const email = String($email?.value || "").trim();
  let password = String($password?.value || "");
  if (!email || !password) {
    setAuthFeedback(tAuth("login.fillFields", "Fill email and password."));
    focusBestAuthInput();
    return;
  }

  loginInFlight = true;
  if ($btn) {
    $btn.disabled = true;
    $btn.textContent = tAuth("login.loading", "Signing in...");
  }

  try {
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      12000,
    );
    if (error) throw error;
    writeDmE2eeLoginSyncNotice("");
    await syncProfileAvatarFromSessionMetadata(data?.session);
    password = "";
    if ($password) $password.value = "";
    setDebug({
      login: {
        error,
        user: data?.user?.id,
      },
    });
    writeLastLoginEmail(email);
    clearPendingConfirmationEmail();
    setAuthFeedback(tAuth("login.successProgress", "Signing in..."), "success");
    window.location.replace("./index.html");
  } catch (e) {
    setAuthFeedback(readLoginErrorMessage(e), "error");
  } finally {
    loginInFlight = false;
    if ($btn) {
      $btn.disabled = false;
      $btn.textContent = loginButtonDefaultText;
    }
    ensureLoginInputsReady();
    focusBestAuthInput();
    password = "";
  }
}

$btn?.addEventListener("click", () => {
  void doLogin();
});

$forgotPasswordBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  recoverySessionReady = false;
  openRecoveryCard(RECOVERY_MODE_PASSWORD);
});

$forgotEmailBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  recoverySessionReady = false;
  openRecoveryCard(RECOVERY_MODE_EMAIL);
});

$recoverySendBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  void sendRecoveryRequest();
});

$recoveryCloseBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeRecoveryCard();
  focusBestAuthInput();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.isComposing) return;
  const target = e.target;
  if (target instanceof HTMLTextAreaElement) return;
  if (!(target instanceof HTMLElement) || !target.closest(".authCard")) return;

  if (isRecoveryCardOpen() && target.closest("#authRecoveryCard")) {
    if (target instanceof HTMLButtonElement && target !== $recoverySendBtn) return;
    e.preventDefault();
    void sendRecoveryRequest();
    return;
  }

  if (target instanceof HTMLButtonElement && target !== $btn) return;
  e.preventDefault();
  void doLogin();
});

document.addEventListener("pointerdown", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const shell = target.closest(".authShell");
  if (!shell) return;
  const input = target.closest("input");
  requestAnimationFrame(() => {
    ensureLoginInputsReady();
    if (input instanceof HTMLInputElement) {
      try {
        input.focus({ preventScroll: true });
      } catch (_) {
        try { input.focus(); } catch (_) {}
      }
      return;
    }
    if (isAuthControlTarget(target)) return;
    focusBestAuthInput();
  });
}, true);

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length !== 1) return;
  if (isAuthInstallWelcomeOpen()) return;
  if (!(document.body instanceof HTMLElement) || !document.body.classList.contains("authPage")) return;
  const active = document.activeElement;
  if (isTypingTarget(active)) return;

  const input = isRecoveryCardOpen()
    ? $recoveryIdentifier
    : (String($email?.value || "").trim() ? $password : $email);
  if (!(input instanceof HTMLInputElement)) return;

  ensureLoginInputsReady();
  try {
    input.focus({ preventScroll: true });
  } catch (_) {
    try { input.focus(); } catch (_) {}
  }

  if (input.disabled || input.readOnly) return;
  const curValue = String(input.value || "");
  const selStart = Number.isFinite(input.selectionStart) ? input.selectionStart : curValue.length;
  const selEnd = Number.isFinite(input.selectionEnd) ? input.selectionEnd : curValue.length;
  const nextValue = `${curValue.slice(0, selStart)}${e.key}${curValue.slice(selEnd)}`;
  input.value = nextValue;
  const nextCursor = selStart + e.key.length;
  try { input.setSelectionRange(nextCursor, nextCursor); } catch (_) {}
  input.dispatchEvent(new Event("input", { bubbles: true }));
  e.preventDefault();
}, true);

window.addEventListener("focus", () => {
  ensureLoginInputsReady();
  focusBestAuthInput();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  ensureLoginInputsReady();
  focusBestAuthInput();
});

window.addEventListener("pageshow", () => {
  ensureLoginInputsReady();
  focusBestAuthInput();
});

initAuthLanguage({ defaultLanguage: "en" });
onAuthLanguageChange(() => {
  syncLoginStaticCopy();
});
syncLoginStaticCopy();

bindDesktopAuthDeepLinks();
void (async () => {
  const handledAuthUrl = await consumeAuthUrlIfPresent(window.location.href, { clearCurrentLocation: true });
  if (!handledAuthUrl) {
    showPendingConfirmationHintFromUrlOrStorage();
  }
})();

ensureLoginInputsReady();
enhancePasswordVisibilityToggles(document);
void initAuthInstallWelcome({
  onDone: ({ shown }) => {
    ensureLoginInputsReady();
    if (!shown) focusBestAuthInput();
  },
  onDismiss: () => {
    ensureLoginInputsReady();
    focusBestAuthInput();
  },
});
