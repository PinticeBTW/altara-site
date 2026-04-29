const AUTH_LANG_STORAGE_KEY = "altara_app_language";
const AUTH_LANG_DEFAULT = "en";
const SUPPORTED_AUTH_LANGS = new Set(["en", "pt"]);

const authLangListeners = new Set();
let authLanguage = AUTH_LANG_DEFAULT;

const AUTH_TEXT = {
  en: {
    language: {
      switchToEnglish: "Switch to English",
      switchToPortuguese: "Switch to Portuguese",
    },
    install: {
      title: "Where friends stay close.",
      lineOne: "From late-night laughs to voice calls that feel real.",
      lineTwo: "Keep your memories alive, one message at a time.",
      momentOne: "friends",
      momentTwo: "laughs",
      momentThree: "memories",
      momentFour: "calls",
      start: "Start",
    },
    showcase: {
      title: "Where friends stay close.",
      loginText: "Your home to talk, laugh and keep the moments that matter.",
      registerText: "Create your account and join a space made for real friendships.",
      chipOne: "Real-time voice",
      chipTwo: "Servers & calls",
      chipThree: "Friends first",
    },
    login: {
      metaTitle: "Login - ALTARA",
      badge: "WELCOME BACK",
      title: "Login",
      sub: "Sign in with your email and password.",
      emailLabel: "Email",
      emailPlaceholder: "you@email.com",
      passwordLabel: "Password",
      passwordPlaceholder: "minimum 6",
      actionPrimary: "Login",
      actionAlt: "Create account",
      loading: "Signing in...",
      fillFields: "Fill email and password.",
      errorGeneric: "Login failed. Try again.",
      errorInvalidCreds: "Wrong email or password.",
      errorEmailNotConfirmed: "Confirm your email before logging in.",
      errorNetwork: "No connection. Check internet and try again.",
      errorTimeout: "Login timed out. Try again.",
      successProgress: "Signing in...",
      dmE2eeRestoreWarning: "Signed in, but ALTARA could not restore your encrypted DM key on this device. Older direct messages may stay unavailable here.",
      forgotPassword: "Forgot password?",
      forgotEmail: "Forgot email?",
      recoveryClose: "Close",
      recoverySendPassword: "Send recovery email",
      recoverySendEmailHint: "Find email hint",
      recoverySending: "Sending...",
      recoveryModePasswordTitle: "Password recovery",
      recoveryModePasswordHint: "Enter your account email. We'll send a reset email.",
      recoveryModePasswordLabel: "Email",
      recoveryModePasswordPlaceholder: "you@email.com",
      recoveryModeEmailTitle: "Email reminder",
      recoveryModeEmailHint: "Enter your username and we'll show a masked email hint.",
      recoveryModeEmailLabel: "Username",
      recoveryModeEmailPlaceholder: "e.g. pintice",
      recoveryInvalidEmail: "Type a valid email address.",
      recoveryEmailSent: "If this email exists, a reset email was sent.",
      recoveryEnterUsername: "Type your username.",
      recoveryEmailHintPrefix: "Email hint:",
      recoveryEmailHintNotFound: "No hint available for that username.",
      recoverySqlMissing: "Recovery SQL is missing. Run SQL/SUPABASE_PATCH_AUTH_RECOVERY.sql.",
      recoveryErrorGeneric: "Could not process recovery right now. Try again.",
      recoveryRedirectNotAllowed: "Recovery redirect is blocked. Add this URL to Supabase Redirect URLs:",
      recoveryResetTitle: "Set a new password",
      recoveryResetHint: "This reset link is valid. Enter your new password below.",
      recoveryResetPasswordLabel: "New password",
      recoveryResetPasswordPlaceholder: "minimum 6",
      recoveryResetConfirmLabel: "Confirm new password",
      recoveryResetConfirmPlaceholder: "repeat your new password",
      recoveryResetSubmit: "Update password",
      recoveryResetPreparing: "Verifying reset link...",
      recoveryResetReady: "Link verified. Set your new password.",
      recoveryResetInvalidLink: "Invalid reset link. Request a new one.",
      recoveryResetMissingSession: "Reset session expired. Open a fresh reset link.",
      recoveryResetWeakPassword: "Use at least 6 characters.",
      recoveryResetMismatch: "Passwords do not match.",
      recoveryResetSuccess: "Password updated. You can now log in.",
      confirmPending: "Confirm your account from your email. After confirmation, ALTARA logs you in automatically.",
      confirmPreparing: "Verifying account confirmation...",
      confirmAutoLogin: "Email confirmed. Signing you in...",
      confirmErrorGeneric: "Could not confirm your account right now. Try again.",
      confirmErrorExpired: "Confirmation link expired. Request a new one.",
      confirmErrorInvalid: "Invalid confirmation link. Request a new one.",
    },
    register: {
      metaTitle: "Create account - ALTARA",
      badge: "CREATE ACCOUNT",
      title: "Create account",
      sub: "Username is required, just like Discord.",
      usernameLabel: "Username (3-20, letters/numbers/_/. and spaces)",
      usernameHint: "Allowed: a-z 0-9 _ . and spaces.",
      usernamePlaceholder: "e.g. pintice",
      emailLabel: "Email",
      emailPlaceholder: "you@email.com",
      passwordLabel: "Password",
      passwordPlaceholder: "minimum 6",
      actionPrimary: "Create account",
      actionAlt: "Go to login",
      loading: "Creating...",
      fillFields: "Fill all fields.",
      invalidUsername: "Invalid username. Use 3-20, letters/numbers/_/. and spaces.",
      errorGeneric: "Register failed. Try again.",
      errorUserExists: "That email already has an account.",
      errorUsernameTaken: "That username is already taken.",
      errorPasswordWeak: "Weak password. Use at least 6 characters.",
      errorEmailInvalid: "Invalid email.",
      errorNetwork: "No connection. Check internet and try again.",
      errorTimeout: "Register timed out. Try again.",
      successProgress: "Account created. Now log in.",
      successPendingConfirm: "Account created. Confirm your email to continue. After confirming, login happens automatically.",
      successAutoLogin: "Account created. Signing you in...",
    },
  },
  pt: {
    language: {
      switchToEnglish: "Mudar para ingles",
      switchToPortuguese: "Mudar para portugues",
    },
    install: {
      title: "Onde os amigos ficam por perto.",
      lineOne: "Das risadas da madrugada a chamadas de voz que parecem reais.",
      lineTwo: "Guarda as tuas memorias, uma mensagem de cada vez.",
      momentOne: "amigos",
      momentTwo: "risos",
      momentThree: "memorias",
      momentFour: "chamadas",
      start: "Comecar",
    },
    showcase: {
      title: "Where friends stay close.",
      loginText: "A tua casa para conversar, rir e guardar momentos com quem importa.",
      registerText: "Cria a tua conta e entra num espaco feito para amizades reais.",
      chipOne: "Voz em tempo real",
      chipTwo: "Servidores e chamadas",
      chipThree: "Amigos primeiro",
    },
    login: {
      metaTitle: "Login - ALTARA",
      badge: "BEM VINDO",
      title: "Login",
      sub: "Entra com email e password para continuar.",
      emailLabel: "Email",
      emailPlaceholder: "tu@email.com",
      passwordLabel: "Password",
      passwordPlaceholder: "minimo 6",
      actionPrimary: "Login",
      actionAlt: "Criar conta",
      loading: "A entrar...",
      fillFields: "Preenche email e password.",
      errorGeneric: "Login falhou. Tenta outra vez.",
      errorInvalidCreds: "Email ou password incorretos.",
      errorEmailNotConfirmed: "Confirma o email antes de fazer login.",
      errorNetwork: "Sem ligacao. Verifica a internet e tenta outra vez.",
      errorTimeout: "Login demorou demasiado. Tenta outra vez.",
      successProgress: "A entrar...",
      dmE2eeRestoreWarning: "Entraste, mas a ALTARA nao conseguiu restaurar a tua chave encriptada de DM neste dispositivo. As mensagens diretas antigas podem continuar indisponiveis aqui.",
      forgotPassword: "Esqueci-me da password",
      forgotEmail: "Esqueci-me do email",
      recoveryClose: "Fechar",
      recoverySendPassword: "Enviar email de recuperacao",
      recoverySendEmailHint: "Procurar dica de email",
      recoverySending: "A enviar...",
      recoveryModePasswordTitle: "Recuperar password",
      recoveryModePasswordHint: "Introduz o email da conta. Vamos enviar um email de reset.",
      recoveryModePasswordLabel: "Email",
      recoveryModePasswordPlaceholder: "tu@email.com",
      recoveryModeEmailTitle: "Lembrete de email",
      recoveryModeEmailHint: "Introduz o teu username e mostramos uma dica do email mascarado.",
      recoveryModeEmailLabel: "Username",
      recoveryModeEmailPlaceholder: "ex: pintice",
      recoveryInvalidEmail: "Mete um email valido.",
      recoveryEmailSent: "Se este email existir, enviamos um email de reset.",
      recoveryEnterUsername: "Mete o teu username.",
      recoveryEmailHintPrefix: "Dica de email:",
      recoveryEmailHintNotFound: "Nao ha dica disponivel para esse username.",
      recoverySqlMissing: "Falta o SQL de recuperacao. Corre SQL/SUPABASE_PATCH_AUTH_RECOVERY.sql.",
      recoveryErrorGeneric: "Nao foi possivel processar a recuperacao agora. Tenta outra vez.",
      recoveryRedirectNotAllowed: "O redirect de recuperacao esta bloqueado. Adiciona este URL em Supabase Redirect URLs:",
      recoveryResetTitle: "Definir nova password",
      recoveryResetHint: "Este link de reset e valido. Mete a tua nova password abaixo.",
      recoveryResetPasswordLabel: "Nova password",
      recoveryResetPasswordPlaceholder: "minimo 6",
      recoveryResetConfirmLabel: "Confirmar nova password",
      recoveryResetConfirmPlaceholder: "repete a nova password",
      recoveryResetSubmit: "Atualizar password",
      recoveryResetPreparing: "A validar link de reset...",
      recoveryResetReady: "Link validado. Define a tua nova password.",
      recoveryResetInvalidLink: "Link de reset invalido. Pede um novo.",
      recoveryResetMissingSession: "Sessao de reset expirada. Abre um link novo.",
      recoveryResetWeakPassword: "Usa pelo menos 6 caracteres.",
      recoveryResetMismatch: "As passwords nao coincidem.",
      recoveryResetSuccess: "Password atualizada. Ja podes fazer login.",
      confirmPending: "Confirma a tua conta pelo email. Depois da confirmacao, a ALTARA faz login automatico.",
      confirmPreparing: "A validar confirmacao da conta...",
      confirmAutoLogin: "Email confirmado. A entrar automaticamente...",
      confirmErrorGeneric: "Nao foi possivel confirmar a conta agora. Tenta outra vez.",
      confirmErrorExpired: "Link de confirmacao expirado. Pede um novo.",
      confirmErrorInvalid: "Link de confirmacao invalido. Pede um novo.",
    },
    register: {
      metaTitle: "Criar conta - ALTARA",
      badge: "CRIAR CONTA",
      title: "Criar conta",
      sub: "Username e obrigatorio, como no Discord.",
      usernameLabel: "Username (3-20, letras/numeros/_/. e espacos)",
      usernameHint: "Permitido: a-z 0-9 _ . e espacos.",
      usernamePlaceholder: "ex: pintice",
      emailLabel: "Email",
      emailPlaceholder: "tu@email.com",
      passwordLabel: "Password",
      passwordPlaceholder: "minimo 6",
      actionPrimary: "Criar conta",
      actionAlt: "Ir para login",
      loading: "A criar...",
      fillFields: "Preenche tudo.",
      invalidUsername: "Username invalido. Usa 3-20, letras/numeros/_/. e espacos.",
      errorGeneric: "Registo falhou. Tenta outra vez.",
      errorUserExists: "Esse email ja tem conta.",
      errorUsernameTaken: "Esse username ja esta em uso.",
      errorPasswordWeak: "Password fraca. Usa pelo menos 6 caracteres.",
      errorEmailInvalid: "Email invalido.",
      errorNetwork: "Sem ligacao. Verifica a internet e tenta outra vez.",
      errorTimeout: "Registo demorou demasiado. Tenta outra vez.",
      successProgress: "Conta criada. Agora faz login.",
      successPendingConfirm: "Conta criada. Confirma o email para continuar. Depois da confirmacao, o login acontece automaticamente.",
      successAutoLogin: "Conta criada. A entrar automaticamente...",
    },
  },
};

function normalizeAuthLanguage(value, fallback = AUTH_LANG_DEFAULT) {
  const lang = String(value || "").trim().toLowerCase();
  if (SUPPORTED_AUTH_LANGS.has(lang)) return lang;
  return SUPPORTED_AUTH_LANGS.has(fallback) ? fallback : AUTH_LANG_DEFAULT;
}

function readStoredAuthLanguage() {
  try {
    return normalizeAuthLanguage(localStorage.getItem(AUTH_LANG_STORAGE_KEY), AUTH_LANG_DEFAULT);
  } catch (_) {
    return AUTH_LANG_DEFAULT;
  }
}

function hasStoredAuthLanguage() {
  try {
    const value = localStorage.getItem(AUTH_LANG_STORAGE_KEY);
    return SUPPORTED_AUTH_LANGS.has(String(value || "").trim().toLowerCase());
  } catch (_) {
    return false;
  }
}

function writeStoredAuthLanguage(lang) {
  try {
    localStorage.setItem(AUTH_LANG_STORAGE_KEY, normalizeAuthLanguage(lang));
  } catch (_) {}
}

function getByPath(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object" || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function textFor(lang, key, fallback = "") {
  const table = AUTH_TEXT[normalizeAuthLanguage(lang)] || AUTH_TEXT.en;
  const baseTable = AUTH_TEXT.en;
  const fromLang = getByPath(table, key);
  if (typeof fromLang === "string") return fromLang;
  const fromBase = getByPath(baseTable, key);
  if (typeof fromBase === "string") return fromBase;
  return String(fallback || "");
}

function setNodeText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value || "");
}

function setNodePlaceholder(id, value) {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.placeholder = String(value || "");
  }
}

function applyAuthTranslations(lang) {
  const next = normalizeAuthLanguage(lang, AUTH_LANG_DEFAULT);
  const page = String(document.body?.dataset?.authPage || "").trim().toLowerCase();
  const pageKey = page === "register" ? "register" : "login";

  authLanguage = next;
  document.documentElement.lang = next === "pt" ? "pt-PT" : "en";
  document.title = textFor(next, `${pageKey}.metaTitle`, document.title);

  setNodeText("authInstallWelcomeTitle", textFor(next, "install.title"));
  setNodeText("authInstallWelcomeLineOne", textFor(next, "install.lineOne"));
  setNodeText("authInstallWelcomeLineTwo", textFor(next, "install.lineTwo"));
  setNodeText("authInstallMomentOne", textFor(next, "install.momentOne"));
  setNodeText("authInstallMomentTwo", textFor(next, "install.momentTwo"));
  setNodeText("authInstallMomentThree", textFor(next, "install.momentThree"));
  setNodeText("authInstallMomentFour", textFor(next, "install.momentFour"));
  setNodeText("btnAuthInstallWelcomeStart", textFor(next, "install.start"));

  setNodeText("authShowcaseTitle", textFor(next, "showcase.title"));
  setNodeText("authShowcaseChipOne", textFor(next, "showcase.chipOne"));
  setNodeText("authShowcaseChipTwo", textFor(next, "showcase.chipTwo"));
  setNodeText("authShowcaseChipThree", textFor(next, "showcase.chipThree"));
  setNodeText(
    "authShowcaseText",
    textFor(next, pageKey === "register" ? "showcase.registerText" : "showcase.loginText")
  );

  setNodeText("authBadge", textFor(next, `${pageKey}.badge`));
  setNodeText("authCardTitle", textFor(next, `${pageKey}.title`));
  setNodeText("authCardSub", textFor(next, `${pageKey}.sub`));

  if (pageKey === "register") {
    setNodeText("authUsernameLabel", textFor(next, "register.usernameLabel"));
    setNodeText("authUsernameHint", textFor(next, "register.usernameHint"));
    setNodePlaceholder("username", textFor(next, "register.usernamePlaceholder"));
    setNodeText("authEmailLabel", textFor(next, "register.emailLabel"));
    setNodePlaceholder("email", textFor(next, "register.emailPlaceholder"));
    setNodeText("authPasswordLabel", textFor(next, "register.passwordLabel"));
    setNodePlaceholder("password", textFor(next, "register.passwordPlaceholder"));
    setNodeText("btnRegister", textFor(next, "register.actionPrimary"));
    setNodeText("authAltLink", textFor(next, "register.actionAlt"));
  } else {
    setNodeText("authEmailLabel", textFor(next, "login.emailLabel"));
    setNodePlaceholder("email", textFor(next, "login.emailPlaceholder"));
    setNodeText("authPasswordLabel", textFor(next, "login.passwordLabel"));
    setNodePlaceholder("password", textFor(next, "login.passwordPlaceholder"));
    setNodeText("btnLogin", textFor(next, "login.actionPrimary"));
    setNodeText("authAltLink", textFor(next, "login.actionAlt"));
    setNodeText("btnForgotPassword", textFor(next, "login.forgotPassword"));
    setNodeText("btnForgotEmail", textFor(next, "login.forgotEmail"));
    setNodeText("btnAuthRecoveryClose", textFor(next, "login.recoveryClose"));
    setNodeText("btnAuthRecoverySend", textFor(next, "login.recoverySendPassword"));
    setNodeText("authRecoveryTitle", textFor(next, "login.recoveryModePasswordTitle"));
    setNodeText("authRecoveryHint", textFor(next, "login.recoveryModePasswordHint"));
    setNodeText("authRecoveryLabel", textFor(next, "login.recoveryModePasswordLabel"));
    setNodePlaceholder("authRecoveryIdentifier", textFor(next, "login.recoveryModePasswordPlaceholder"));
    setNodeText("authRecoverySecretLabel", textFor(next, "login.recoveryResetConfirmLabel"));
    setNodePlaceholder("authRecoverySecret", textFor(next, "login.recoveryResetConfirmPlaceholder"));
  }

  const btnLang = document.getElementById("btnAuthLang");
  if (btnLang instanceof HTMLButtonElement) {
    const nextTarget = next === "en" ? "pt" : "en";
    btnLang.textContent = nextTarget.toUpperCase();
    const switchTitle = textFor(
      next,
      nextTarget === "pt" ? "language.switchToPortuguese" : "language.switchToEnglish"
    );
    btnLang.setAttribute("aria-label", switchTitle);
    btnLang.title = switchTitle;
  }
}

function notifyAuthLanguageChange() {
  authLangListeners.forEach((listener) => {
    try {
      listener(authLanguage);
    } catch (_) {}
  });
}

export function tAuth(key, fallback = "") {
  return textFor(authLanguage, key, fallback);
}

export function getAuthLanguage() {
  return authLanguage;
}

export function setAuthLanguage(lang, { persist = true } = {}) {
  const next = normalizeAuthLanguage(lang, AUTH_LANG_DEFAULT);
  authLanguage = next;
  if (persist) writeStoredAuthLanguage(next);
  applyAuthTranslations(next);
  notifyAuthLanguageChange();
  return next;
}

export function onAuthLanguageChange(listener) {
  if (typeof listener !== "function") return () => {};
  authLangListeners.add(listener);
  return () => authLangListeners.delete(listener);
}

export function initAuthLanguage({ defaultLanguage = AUTH_LANG_DEFAULT } = {}) {
  const fallback = normalizeAuthLanguage(defaultLanguage, AUTH_LANG_DEFAULT);
  const initial = hasStoredAuthLanguage() ? readStoredAuthLanguage() : fallback;

  if (!hasStoredAuthLanguage()) {
    writeStoredAuthLanguage(initial);
  }

  applyAuthTranslations(initial);

  const btn = document.getElementById("btnAuthLang");
  if (btn instanceof HTMLButtonElement && btn.dataset.bound !== "1") {
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const next = authLanguage === "en" ? "pt" : "en";
      setAuthLanguage(next, { persist: true });
    });
  }

  return initial;
}
