import { supabase } from "./supabaseClient.js";
import { $, setDebug, enhancePasswordVisibilityToggles } from "./ui.js";
import { initAuthInstallWelcome } from "./authOnboarding.js";
import { initAuthLanguage, onAuthLanguageChange, tAuth } from "./authI18n.js";
import { pickRandomDefaultAvatarUrl } from "./defaultAvatarPool.js";

const $username = $("username");
const $email = $("email");
const $password = $("password");
const $btn = $("btnRegister");
const $feedback = $("authFeedback");
let registerInFlight = false;
let registerButtonDefaultText = "Create account";
const PENDING_CONFIRM_EMAIL_STORAGE_KEY = "altara_pending_confirm_email";
const DESKTOP_SIGNUP_REDIRECT_URL = "altara://auth/confirm";
const PROFILE_AVATAR_SYNC_RETRIES = 4;
const PROFILE_AVATAR_SYNC_DELAY_MS = 180;

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

function validUsername(u) {
  return /^(?=.{3,20}$)(?=.*[a-z0-9_.])[a-z0-9_. ]+$/i.test(String(u || "").trim());
}

function getDesktopBridge() {
  const bridge = window?.altaraDesktop;
  if (!bridge || typeof bridge !== "object") return null;
  return bridge;
}

function resolveSignupEmailRedirectUrl() {
  if (getDesktopBridge()?.isDesktopApp) return DESKTOP_SIGNUP_REDIRECT_URL;
  const origin = String(window.location?.origin || "").trim();
  if (!/^https?:\/\//i.test(origin)) return "";
  const path = String(window.location?.pathname || "").trim() || "/login.html";
  return `${origin}${path}`;
}

function setPendingConfirmationEmail(emailInput = "") {
  const email = String(emailInput || "").trim().toLowerCase();
  try {
    if (email && email.includes("@")) {
      localStorage.setItem(PENDING_CONFIRM_EMAIL_STORAGE_KEY, email);
    } else {
      localStorage.removeItem(PENDING_CONFIRM_EMAIL_STORAGE_KEY);
    }
  } catch (_) {}
}

function syncRegisterStaticCopy() {
  registerButtonDefaultText = tAuth("register.actionPrimary", "Create account");
  if ($btn && !registerInFlight) {
    $btn.textContent = registerButtonDefaultText;
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

function readRegisterErrorMessage(err) {
  const raw = String(err?.message || err || "").trim();
  const msg = raw.toLowerCase();
  if (!raw) return tAuth("register.errorGeneric", "Register failed. Try again.");
  const hasUniqueViolationHint = msg.includes("duplicate key value") || msg.includes("unique constraint") || msg.includes("23505");
  const looksLikeEmailConflict =
    msg.includes("user already registered")
    || msg.includes("email already")
    || msg.includes("users_email_key")
    || (hasUniqueViolationHint && msg.includes("email"));
  if (looksLikeEmailConflict) return tAuth("register.errorUserExists", "That email already has an account.");

  const looksLikeUsernameConflict =
    msg.includes("database error saving new user")
    || msg.includes("username ja existe")
    || msg.includes("username já existe")
    || msg.includes("profiles_username_key")
    || (hasUniqueViolationHint && msg.includes("username"));
  if (looksLikeUsernameConflict) return tAuth("register.errorUsernameTaken", "That username is already taken.");

  if (msg.includes("password should be at least")) return tAuth("register.errorPasswordWeak", "Weak password. Use at least 6 characters.");
  if (msg.includes("unable to validate email")) return tAuth("register.errorEmailInvalid", "Invalid email.");
  if (msg.includes("network") || msg.includes("failed to fetch")) return tAuth("register.errorNetwork", "No connection. Check internet and try again.");
  if (msg.includes("timeout")) return tAuth("register.errorTimeout", "Register timed out. Try again.");
  return raw;
}

function getAuthInputs() {
  return [$username, $email, $password].filter(Boolean);
}

function ensureRegisterInputsReady() {
  getAuthInputs().forEach((el) => {
    try {
      el.disabled = false;
      el.readOnly = false;
      el.removeAttribute("inert");
      el.style.pointerEvents = "auto";
    } catch (_) {}
  });
}

function focusBestRegisterInput() {
  if (isAuthInstallWelcomeOpen()) return;
  const active = document.activeElement;
  if (active && (active === $username || active === $email || active === $password)) return;
  const username = String($username?.value || "").trim();
  const email = String($email?.value || "").trim();
  const target = username ? (email ? $password : $email) : $username;
  try {
    target?.focus({ preventScroll: true });
  } catch (_) {
    try { target?.focus(); } catch (_) {}
  }
}

function withTimeout(promiseLike, timeoutMs = 15000) {
  return Promise.race([
    Promise.resolve(promiseLike),
    new Promise((_, reject) => setTimeout(() => reject(new Error(tAuth("register.errorTimeout", "Register timed out. Try again."))), timeoutMs)),
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

async function ensureSignupAvatarOnProfile(userIdInput = "", avatarUrlInput = "") {
  const userId = String(userIdInput || "").trim();
  const avatarUrl = String(avatarUrlInput || "").trim();
  if (!userId || !avatarUrl) return;

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
          .update({ avatar_url: avatarUrl })
          .eq("id", userId);
        if (!updateError) return;
      }
    } catch (_) {}

    await sleep(PROFILE_AVATAR_SYNC_DELAY_MS * (attempt + 1));
  }
}

function isLikelyExistingEmailSignupResult(signUpData) {
  const user = signUpData?.user;
  if (!user || signUpData?.session) return false;
  const identities = user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}

async function doRegister() {
  if (registerInFlight) return;
  ensureRegisterInputsReady();
  setAuthFeedback("");

  const username = String($username?.value || "").trim();
  const email = String($email?.value || "").trim();
  const password = String($password?.value || "");

  if (!username || !email || !password) {
    setAuthFeedback(tAuth("register.fillFields", "Fill all fields."));
    focusBestRegisterInput();
    return;
  }
  if (!validUsername(username)) {
    setAuthFeedback(tAuth("register.invalidUsername", "Invalid username. Use 3-20, letters/numbers/_/. and spaces."));
    focusBestRegisterInput();
    return;
  }

  registerInFlight = true;
  if ($btn) {
    $btn.disabled = true;
    $btn.textContent = tAuth("register.loading", "Creating...");
  }

  try {
    const defaultAvatarUrl = await pickRandomDefaultAvatarUrl();
    const redirectTo = resolveSignupEmailRedirectUrl();
    const signUpOptions = {
      data: {
        username,
        ...(defaultAvatarUrl ? { avatar_url: defaultAvatarUrl } : {}),
      },
    };
    if (redirectTo) {
      signUpOptions.emailRedirectTo = redirectTo;
    }

    const { data, error } = await withTimeout(
      supabase.auth.signUp({
        email,
        password,
        options: signUpOptions,
      }),
      15000
    );

    setDebug({ register: { error, user: data?.user?.id, defaultAvatarUrl } });
    if (error) throw error;

    if (isLikelyExistingEmailSignupResult(data)) {
      setPendingConfirmationEmail("");
      setAuthFeedback(tAuth("register.errorUserExists", "That email already has an account."), "error");
      return;
    }

    const hasSession = !!data?.session;
    if (hasSession) {
      if (data?.user?.id && defaultAvatarUrl) {
        await ensureSignupAvatarOnProfile(data.user.id, defaultAvatarUrl);
      }
      if ($password) $password.value = "";
      setDebug({
        register: {
          error,
          user: data?.user?.id,
          defaultAvatarUrl,
        },
      });
      setPendingConfirmationEmail("");
      setAuthFeedback(tAuth("register.successAutoLogin", "Account created. Signing you in..."), "success");
      setTimeout(() => {
        window.location.replace("./index.html");
      }, 220);
      return;
    }

    setPendingConfirmationEmail(email);
    setAuthFeedback(
      tAuth(
        "register.successPendingConfirm",
        "Account created. Confirm your email to continue. After confirming, login happens automatically."
      ),
      "success",
    );
    setTimeout(() => {
      const emailParam = encodeURIComponent(email);
      window.location.replace(`./login.html?awaiting_confirm=1&email=${emailParam}`);
    }, 900);
  } catch (e) {
    setPendingConfirmationEmail("");
    setAuthFeedback(readRegisterErrorMessage(e), "error");
  } finally {
    registerInFlight = false;
    if ($btn) {
      $btn.disabled = false;
      $btn.textContent = registerButtonDefaultText;
    }
    ensureRegisterInputsReady();
    focusBestRegisterInput();
  }
}

$btn?.addEventListener("click", () => {
  void doRegister();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.isComposing) return;
  const target = e.target;
  if (target instanceof HTMLTextAreaElement) return;
  if (target instanceof HTMLButtonElement && target !== $btn) return;
  if (!(target instanceof HTMLElement) || !target.closest(".authCard")) return;
  e.preventDefault();
  void doRegister();
});

document.addEventListener("pointerdown", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const shell = target.closest(".authShell");
  if (!shell) return;
  const input = target.closest("input");
  requestAnimationFrame(() => {
    ensureRegisterInputsReady();
    if (input instanceof HTMLInputElement && (input === $username || input === $email || input === $password)) {
      try {
        input.focus({ preventScroll: true });
      } catch (_) {
        try { input.focus(); } catch (_) {}
      }
      return;
    }
    if (isAuthControlTarget(target)) return;
    focusBestRegisterInput();
  });
}, true);

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length !== 1) return;
  if (isAuthInstallWelcomeOpen()) return;
  if (!(document.body instanceof HTMLElement) || !document.body.classList.contains("authPage")) return;
  const active = document.activeElement;
  if (isTypingTarget(active)) return;

  const username = String($username?.value || "").trim();
  const email = String($email?.value || "").trim();
  const input = username ? (email ? $password : $email) : $username;
  if (!(input instanceof HTMLInputElement)) return;

  ensureRegisterInputsReady();
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
  ensureRegisterInputsReady();
  focusBestRegisterInput();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  ensureRegisterInputsReady();
  focusBestRegisterInput();
});

window.addEventListener("pageshow", () => {
  ensureRegisterInputsReady();
  focusBestRegisterInput();
});

initAuthLanguage({ defaultLanguage: "en" });
onAuthLanguageChange(() => {
  syncRegisterStaticCopy();
});
syncRegisterStaticCopy();

ensureRegisterInputsReady();
enhancePasswordVisibilityToggles(document);
void initAuthInstallWelcome({
  onDone: ({ shown }) => {
    ensureRegisterInputsReady();
    if (!shown) focusBestRegisterInput();
  },
  onDismiss: () => {
    ensureRegisterInputsReady();
    focusBestRegisterInput();
  },
});
