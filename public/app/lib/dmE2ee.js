import { supabase } from "../supabaseClient.js";

export const DM_E2EE_MESSAGE_MODE = "dm_e2ee_v1";
export const DM_E2EE_CONTENT_PLACEHOLDER = "[ALTARA_DM_E2EE_V1]";
export const DM_E2EE_CIPHER_ALG = "AES-GCM-256";
export const DM_E2EE_CIPHER_VERSION = 1;
export const DM_E2EE_BACKUP_VERSION = 1;
export const DM_E2EE_BACKUP_PASSWORD_MIN_LENGTH = 6;
export const DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN = "account_login";
export const DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL = "manual";
const ACCOUNT_PASSWORD_MIN_LENGTH = 6;

const IDB_NAME = "altara-dm-e2ee-v1";
const IDB_VERSION = 1;
const IDENTITY_STORE = "identityKeys";
const BACKUP_TABLE = "dm_e2ee_user_key_backups";
const KEY_ALGORITHM = "ECDH-P256";
// PBKDF2 is the practical browser-native KDF we can ship today in Electron/Web Crypto.
const BACKUP_KDF_ALGORITHM = "PBKDF2-SHA-256";
const BACKUP_KDF_HASH = "SHA-256";
const BACKUP_PBKDF2_ITERATIONS = 600000;
const BACKUP_CIPHER_ALGORITHM = "AES-GCM-256";
const encoder = new TextEncoder();
const identityCache = new Map();
const publicKeyCacheByUserId = new Map();
const publicKeyCacheById = new Map();
const derivedKeyCache = new Map();
const keyBackupCacheByUserId = new Map();
let idbPromise = null;

function normalizeId(value = "") {
  return String(value || "").trim();
}

function normalizeBackupPasswordSource(value = "") {
  const source = String(value || "").trim().toLowerCase();
  if (
    source === DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN
    || source === DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL
  ) {
    return source;
  }
  return "";
}

function resolveBackupPasswordMinLength(passwordSource = DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL) {
  return normalizeBackupPasswordSource(passwordSource) === DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN
    ? ACCOUNT_PASSWORD_MIN_LENGTH
    : DM_E2EE_BACKUP_PASSWORD_MIN_LENGTH;
}

function logDmE2ee(event = "", details = null) {
  const label = String(event || "").trim();
  if (!label) return;
  if (details && typeof details === "object") {
    console.info("[ALTARA][dm-e2ee]", label, details);
    return;
  }
  console.info("[ALTARA][dm-e2ee]", label);
}

function normalizePublicKeyJwk(input = null) {
  if (!input || typeof input !== "object") return null;
  const jwk = { ...input };
  if (!jwk.kty || !jwk.crv || !jwk.x || !jwk.y) return null;
  return {
    kty: String(jwk.kty),
    crv: String(jwk.crv),
    x: String(jwk.x),
    y: String(jwk.y),
    ext: true,
    key_ops: [],
  };
}

function normalizeKeyRow(row = null) {
  if (!row || typeof row !== "object") return null;
  const id = normalizeId(row.id || "");
  const userId = normalizeId(row.user_id || row.userId || "");
  const publicKeyJwk = normalizePublicKeyJwk(row.public_key_jwk || row.publicKeyJwk || null);
  if (!id || !userId || !publicKeyJwk) return null;
  return {
    id,
    userId,
    keyVersion: Number(row.key_version || row.keyVersion || 1) || 1,
    keyAlgorithm: String(row.key_algorithm || row.keyAlgorithm || KEY_ALGORITHM).trim() || KEY_ALGORITHM,
    publicKeyJwk,
    revokedAt: row.revoked_at || row.revokedAt || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

function normalizeBackupRow(row = null) {
  if (!row || typeof row !== "object") return null;
  const id = normalizeId(row.id || "");
  const userId = normalizeId(row.user_id || row.userId || "");
  const encryptedPrivateKey = String(row.encrypted_private_key || row.encryptedPrivateKey || "").trim();
  const kdfSalt = String(row.kdf_salt || row.kdfSalt || "").trim();
  const cipherIv = String(row.cipher_iv || row.cipherIv || "").trim();
  const publicKeyJwk = normalizePublicKeyJwk(row.public_key_jwk || row.publicKeyJwk || null);
  if (!id || !userId || !encryptedPrivateKey || !kdfSalt || !cipherIv || !publicKeyJwk) return null;
  return {
    id,
    userId,
    backupVersion: Number(row.backup_version || row.backupVersion || DM_E2EE_BACKUP_VERSION) || DM_E2EE_BACKUP_VERSION,
    keyVersion: Number(row.key_version || row.keyVersion || 1) || 1,
    keyAlgorithm: String(row.key_algorithm || row.keyAlgorithm || KEY_ALGORITHM).trim() || KEY_ALGORITHM,
    publicKeyJwk,
    encryptedPrivateKey,
    kdfAlgorithm: String(row.kdf_algorithm || row.kdfAlgorithm || BACKUP_KDF_ALGORITHM).trim() || BACKUP_KDF_ALGORITHM,
    kdfSalt,
    kdfParams: (row.kdf_params && typeof row.kdf_params === "object" && !Array.isArray(row.kdf_params))
      ? { ...row.kdf_params }
      : {},
    passwordSource: getDmE2eeBackupPasswordSource(row),
    cipherAlg: String(row.cipher_alg || row.cipherAlg || BACKUP_CIPHER_ALGORITHM).trim() || BACKUP_CIPHER_ALGORITHM,
    cipherIv,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

export function getDmE2eeBackupPasswordSource(row = null) {
  if (!row || typeof row !== "object") return "";
  return normalizeBackupPasswordSource(
    row.passwordSource
    || row.password_source
    || row.kdfParams?.password_source
    || row.kdf_params?.password_source
    || ""
  );
}

function normalizeIdentityRecord(record = null) {
  if (!record || typeof record !== "object") return null;
  const userId = normalizeId(record.userId || record.user_id || "");
  const keyId = normalizeId(record.keyId || record.key_id || "");
  const publicKeyJwk = normalizePublicKeyJwk(record.publicKeyJwk || record.public_key_jwk || null);
  const privateKey = record.privateKey || record.private_key || null;
  if (!userId || !publicKeyJwk || !(privateKey instanceof CryptoKey)) return null;
  return {
    status: "ready",
    userId,
    keyId,
    keyVersion: Number(record.keyVersion || record.key_version || 1) || 1,
    keyAlgorithm: String(record.keyAlgorithm || record.key_algorithm || KEY_ALGORITHM).trim() || KEY_ALGORITHM,
    publicKeyJwk,
    privateKey,
  };
}

function normalizeStoredIdentityEnvelope(record = null) {
  if (!record || typeof record !== "object") return null;
  const userId = normalizeId(record.userId || record.user_id || "");
  const keyId = normalizeId(record.keyId || record.key_id || "");
  const publicKeyJwk = normalizePublicKeyJwk(record.publicKeyJwk || record.public_key_jwk || null);
  if (!userId || !publicKeyJwk) return null;
  return {
    userId,
    keyId,
    keyVersion: Number(record.keyVersion || record.key_version || 1) || 1,
    keyAlgorithm: String(record.keyAlgorithm || record.key_algorithm || KEY_ALGORITHM).trim() || KEY_ALGORITHM,
    publicKeyJwk,
    privateKey: record.privateKey instanceof CryptoKey ? record.privateKey : null,
    privateKeyPkcs8: String(record.privateKeyPkcs8 || record.private_key_pkcs8 || "").trim(),
  };
}

function publicKeysMatch(a = null, b = null) {
  const left = normalizePublicKeyJwk(a);
  const right = normalizePublicKeyJwk(b);
  if (!left || !right) return false;
  return left.kty === right.kty
    && left.crv === right.crv
    && left.x === right.x
    && left.y === right.y;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function openIdentityDb() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable for DM E2EE"));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
  return idbPromise;
}

async function readIdentityRecord(userId) {
  const uid = normalizeId(userId);
  if (!uid) return null;
  const db = await openIdentityDb();
  const tx = db.transaction(IDENTITY_STORE, "readonly");
  const store = tx.objectStore(IDENTITY_STORE);
  const result = normalizeStoredIdentityEnvelope(await requestToPromise(store.get(uid)));
  if (!result) return null;

  let privateKey = result.privateKey;
  if (!(privateKey instanceof CryptoKey) && result.privateKeyPkcs8) {
    try {
      privateKey = await crypto.subtle.importKey(
        "pkcs8",
        base64UrlToBytes(result.privateKeyPkcs8),
        {
          name: "ECDH",
          namedCurve: "P-256",
        },
        true,
        ["deriveBits"]
      );
    } catch (error) {
      logDmE2ee("local_key_import_failed", {
        userId: uid,
        message: String(error?.message || error || "unknown"),
      });
      return null;
    }
  }

  return normalizeIdentityRecord({
    ...result,
    privateKey,
  });
}

async function writeIdentityRecord(record = {}) {
  const normalized = normalizeIdentityRecord(record);
  if (!normalized) throw new Error("Invalid DM E2EE identity record");
  let privateKeyPkcs8 = "";
  if (normalized.privateKey?.extractable) {
    privateKeyPkcs8 = bytesToBase64Url(
      new Uint8Array(await crypto.subtle.exportKey("pkcs8", normalized.privateKey))
    );
  }
  const db = await openIdentityDb();
  const tx = db.transaction(IDENTITY_STORE, "readwrite");
  const store = tx.objectStore(IDENTITY_STORE);
  await requestToPromise(store.put({
    userId: normalized.userId,
    keyId: normalized.keyId,
    keyVersion: normalized.keyVersion,
    keyAlgorithm: normalized.keyAlgorithm,
    publicKeyJwk: normalized.publicKeyJwk,
    ...(privateKeyPkcs8
      ? { privateKeyPkcs8 }
      : { privateKey: normalized.privateKey }),
  }));
  identityCache.set(normalized.userId, normalized);
  derivedKeyCache.clear();
  return normalized;
}

async function generateIdentityKeyPair() {
  // The private key must stay exportable locally so the client can create an encrypted backup.
  const pair = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveBits"]
  );
  const publicKeyJwk = normalizePublicKeyJwk(
    await crypto.subtle.exportKey("jwk", pair.publicKey)
  );
  if (!publicKeyJwk) throw new Error("Could not export DM public key");
  return {
    privateKey: pair.privateKey,
    publicKeyJwk,
  };
}

async function deriveBackupEncryptionKey(password, saltBytes, iterations = BACKUP_PBKDF2_ITERATIONS) {
  const normalizedIterations = Math.max(100000, Math.round(Number(iterations || BACKUP_PBKDF2_ITERATIONS) || BACKUP_PBKDF2_ITERATIONS));
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(password ?? "")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: BACKUP_KDF_HASH,
      salt: saltBytes instanceof Uint8Array ? saltBytes : new Uint8Array(saltBytes || []),
      iterations: normalizedIterations,
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function buildBackupAad(userId, keyVersion) {
  return encoder.encode(`ALTARA|DM|BACKUP|V1|${normalizeId(userId)}|${Number(keyVersion || 1) || 1}`);
}

function createBackupError(code, message) {
  const error = new Error(String(message || "DM key backup failed"));
  error.code = String(code || "dm_e2ee_backup_error");
  return error;
}

async function fetchActiveKeyRowForUser(userId, { force = false } = {}) {
  const uid = normalizeId(userId);
  if (!uid) return null;
  if (!force && publicKeyCacheByUserId.has(uid)) return publicKeyCacheByUserId.get(uid) || null;
  const { data, error } = await supabase
    .from("dm_e2ee_user_keys")
    .select("id, user_id, key_version, key_algorithm, public_key_jwk, revoked_at, created_at, updated_at")
    .eq("user_id", uid)
    .is("revoked_at", null)
    .order("key_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = normalizeKeyRow(data);
  publicKeyCacheByUserId.set(uid, row || null);
  if (row) publicKeyCacheById.set(row.id, row);
  return row;
}

async function fetchOwnBackupRow(userId, { force = false } = {}) {
  const uid = normalizeId(userId);
  if (!uid) return null;
  if (!force && keyBackupCacheByUserId.has(uid)) return keyBackupCacheByUserId.get(uid) || null;
  logDmE2ee("backup_fetch_attempted", {
    userId: uid,
    force: !!force,
    table: BACKUP_TABLE,
  });
  try {
    const { data, error } = await supabase
      .from(BACKUP_TABLE)
      .select("id, user_id, backup_version, key_version, key_algorithm, public_key_jwk, encrypted_private_key, kdf_algorithm, kdf_salt, kdf_params, cipher_alg, cipher_iv, created_at, updated_at")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) {
      logDmE2ee("backup_fetch_failed", {
        userId: uid,
        message: String(error?.message || error || "unknown"),
      });
      throw error;
    }
    const row = normalizeBackupRow(data);
    keyBackupCacheByUserId.set(uid, row || null);
    logDmE2ee(row ? "backup_found" : "backup_missing", {
      userId: uid,
      backupId: String(row?.id || ""),
      keyVersion: Number(row?.keyVersion || 0) || 0,
    });
    return row;
  } catch (error) {
    if (!String(error?.message || "").trim()) {
      logDmE2ee("backup_fetch_failed", {
        userId: uid,
        message: "unknown",
      });
    }
    throw error;
  }
}

async function fetchKeyRowsByIds(keyIds = []) {
  const wanted = Array.from(new Set((Array.isArray(keyIds) ? keyIds : []).map((value) => normalizeId(value)).filter(Boolean)));
  if (!wanted.length) return [];
  const missing = wanted.filter((id) => !publicKeyCacheById.has(id));
  if (missing.length) {
    const { data, error } = await supabase
      .from("dm_e2ee_user_keys")
      .select("id, user_id, key_version, key_algorithm, public_key_jwk, revoked_at, created_at, updated_at")
      .in("id", missing);
    if (error) throw error;
    (Array.isArray(data) ? data : []).forEach((row) => {
      const normalized = normalizeKeyRow(row);
      if (!normalized) return;
      publicKeyCacheById.set(normalized.id, normalized);
      if (!normalized.revokedAt) publicKeyCacheByUserId.set(normalized.userId, normalized);
    });
    missing.forEach((id) => {
      if (!publicKeyCacheById.has(id)) publicKeyCacheById.set(id, null);
    });
  }
  return wanted.map((id) => publicKeyCacheById.get(id)).filter(Boolean);
}

async function upsertMyKeyRow(publicKeyJwk) {
  const { data, error } = await supabase.rpc("upsert_my_dm_e2ee_key", {
    p_public_key_jwk: publicKeyJwk,
    p_key_algorithm: KEY_ALGORITHM,
  });
  if (error) throw error;
  const row = normalizeKeyRow(Array.isArray(data) ? data[0] : data);
  if (!row) throw new Error("Could not persist DM public key");
  publicKeyCacheByUserId.set(row.userId, row);
  publicKeyCacheById.set(row.id, row);
  return row;
}

function buildSharedSalt(conversationId, localUserId, remoteUserId) {
  const ids = [normalizeId(localUserId), normalizeId(remoteUserId)].filter(Boolean).sort();
  return encoder.encode(`ALTARA|DM|V1|${normalizeId(conversationId)}|${ids.join("|")}`);
}

function buildAad(conversationId, senderUserId) {
  return encoder.encode(`ALTARA|DM|AAD|V1|${normalizeId(conversationId)}|${normalizeId(senderUserId)}`);
}

function bytesToBase64Url(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = "";
  for (let i = 0; i < input.length; i += 1) binary += String.fromCharCode(input[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value = "") {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function importPeerPublicKey(publicKeyJwk) {
  const jwk = normalizePublicKeyJwk(publicKeyJwk);
  if (!jwk) throw new Error("Invalid DM public key");
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    []
  );
}

async function deriveConversationAesKey({
  localIdentity,
  remoteKeyRow,
  conversationId,
}) {
  const cacheKey = [
    normalizeId(localIdentity?.keyId || localIdentity?.userId || ""),
    normalizeId(remoteKeyRow?.id || ""),
    normalizeId(conversationId || ""),
  ].join("|");
  if (derivedKeyCache.has(cacheKey)) return derivedKeyCache.get(cacheKey);

  const remotePublicKey = await importPeerPublicKey(remoteKeyRow?.publicKeyJwk || null);
  const sharedBits = await crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: remotePublicKey,
    },
    localIdentity.privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: buildSharedSalt(conversationId, localIdentity.userId, remoteKeyRow?.userId || ""),
      info: encoder.encode("ALTARA|DM|AES-GCM-256|V1"),
    },
    hkdfKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
  derivedKeyCache.set(cacheKey, aesKey);
  return aesKey;
}

function buildUnavailableRow(row = {}, reason = "unavailable") {
  return {
    ...row,
    content: "[Encrypted DM unavailable on this device]",
    e2eeState: reason,
  };
}

export function isEncryptedDmMessageRow(row = {}) {
  return String(row?.message_mode || "").trim().toLowerCase() === DM_E2EE_MESSAGE_MODE;
}

export async function getDmE2eeIdentityState({ userId, force = false } = {}) {
  const uid = normalizeId(userId);
  if (!uid) {
    return {
      status: "error",
      userId: "",
      error: new Error("Missing userId for DM E2EE"),
    };
  }

  try {
    const localIdentity = await readIdentityRecord(uid);
    const remoteKeyRow = await fetchActiveKeyRowForUser(uid, { force });
    logDmE2ee("identity_state_checked", {
      userId: uid,
      localKeyPresent: !!localIdentity,
      remoteKeyPresent: !!remoteKeyRow,
      force: !!force,
    });
    if (localIdentity) {
      return {
        status: "ready",
        userId: uid,
        keyId: normalizeId(localIdentity.keyId || remoteKeyRow?.id || ""),
        keyVersion: Number(localIdentity.keyVersion || remoteKeyRow?.keyVersion || 1) || 1,
        keyAlgorithm: String(localIdentity.keyAlgorithm || remoteKeyRow?.keyAlgorithm || KEY_ALGORITHM).trim() || KEY_ALGORITHM,
        publicKeyJwk: localIdentity.publicKeyJwk,
        hasLocalPrivateKey: true,
        localPrivateKeyExportable: !!localIdentity.privateKey?.extractable,
        hasRemotePublicKey: !!remoteKeyRow,
      };
    }
    if (remoteKeyRow) {
      return {
        status: "missing_local_private",
        userId: uid,
        keyId: remoteKeyRow.id,
        keyVersion: remoteKeyRow.keyVersion,
        keyAlgorithm: remoteKeyRow.keyAlgorithm,
        publicKeyJwk: remoteKeyRow.publicKeyJwk,
        hasLocalPrivateKey: false,
        localPrivateKeyExportable: false,
        hasRemotePublicKey: true,
      };
    }
    return {
      status: "not_initialized",
      userId: uid,
      keyId: "",
      keyVersion: 0,
      keyAlgorithm: KEY_ALGORITHM,
      publicKeyJwk: null,
      hasLocalPrivateKey: false,
      localPrivateKeyExportable: false,
      hasRemotePublicKey: false,
    };
  } catch (error) {
    return {
      status: "error",
      userId: uid,
      error,
    };
  }
}

export async function ensureDmE2eeIdentity({ userId } = {}) {
  const uid = normalizeId(userId);
  if (!uid) return { status: "error", error: new Error("Missing userId for DM E2EE") };
  const cached = identityCache.get(uid);
  if (cached?.status === "ready" && cached.privateKey instanceof CryptoKey) return cached;

  let localIdentity = null;
  try {
    localIdentity = await readIdentityRecord(uid);
  } catch (error) {
    return { status: "error", error };
  }

  let remoteKeyRow = null;
  try {
    remoteKeyRow = await fetchActiveKeyRowForUser(uid, { force: false });
  } catch (error) {
    if (localIdentity) {
      const fallback = { ...localIdentity, status: "ready" };
      identityCache.set(uid, fallback);
      return fallback;
    }
    return { status: "error", error };
  }

  if (localIdentity) {
    if (!remoteKeyRow || !publicKeysMatch(remoteKeyRow.publicKeyJwk, localIdentity.publicKeyJwk)) {
      remoteKeyRow = await upsertMyKeyRow(localIdentity.publicKeyJwk);
    }
    const readyIdentity = {
      ...localIdentity,
      status: "ready",
      keyId: normalizeId(remoteKeyRow?.id || localIdentity.keyId || ""),
      keyVersion: Number(remoteKeyRow?.keyVersion || localIdentity.keyVersion || 1) || 1,
      keyAlgorithm: String(remoteKeyRow?.keyAlgorithm || localIdentity.keyAlgorithm || KEY_ALGORITHM),
    };
    await writeIdentityRecord(readyIdentity);
    return readyIdentity;
  }

  if (remoteKeyRow) {
    return {
      status: "missing_local_private",
      userId: uid,
      keyId: remoteKeyRow.id,
      keyVersion: remoteKeyRow.keyVersion,
      keyAlgorithm: remoteKeyRow.keyAlgorithm,
      publicKeyJwk: remoteKeyRow.publicKeyJwk,
    };
  }

  const generated = await generateIdentityKeyPair();
  const keyRow = await upsertMyKeyRow(generated.publicKeyJwk);
  const readyIdentity = {
    status: "ready",
    userId: uid,
    keyId: keyRow.id,
    keyVersion: keyRow.keyVersion,
    keyAlgorithm: keyRow.keyAlgorithm,
    publicKeyJwk: generated.publicKeyJwk,
    privateKey: generated.privateKey,
  };
  await writeIdentityRecord(readyIdentity);
  return readyIdentity;
}

export async function getActiveDmE2eePeerKey(userId) {
  return fetchActiveKeyRowForUser(userId, { force: false });
}

export async function getDmE2eeKeyBackupMetadata({ userId, force = false } = {}) {
  const row = await fetchOwnBackupRow(userId, { force });
  logDmE2ee("backup_metadata_checked", {
    userId: normalizeId(userId),
    found: !!row,
    force: !!force,
  });
  return row;
}

export async function createDmE2eeKeyBackup({
  userId,
  password,
  passwordSource = DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL,
} = {}) {
  const uid = normalizeId(userId);
  const rawPassword = String(password ?? "");
  const resolvedPasswordSource =
    normalizeBackupPasswordSource(passwordSource) || DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL;
  const minPasswordLength = resolveBackupPasswordMinLength(resolvedPasswordSource);
  if (!uid) throw createBackupError("dm_e2ee_backup_missing_user", "Missing userId for DM key backup.");
  if (rawPassword.length < minPasswordLength) {
    throw createBackupError(
      "dm_e2ee_backup_password_too_short",
      `Backup password must be at least ${minPasswordLength} characters long.`
    );
  }

  const identity = await ensureDmE2eeIdentity({ userId: uid });
  if (identity?.status !== "ready") {
    throw createBackupError(
      identity?.status === "missing_local_private"
        ? "dm_e2ee_backup_missing_local_private"
        : "dm_e2ee_backup_identity_unavailable",
      identity?.status === "missing_local_private"
        ? "This device is missing the local DM private key for this account."
        : "Could not initialize the DM encryption identity on this device."
    );
  }

  if (!identity.privateKey?.extractable) {
    throw createBackupError(
      "dm_e2ee_backup_private_key_not_exportable",
      "This DM key was created before encrypted backup support and cannot be exported from this device."
    );
  }

  const privateKeyBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", identity.privateKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveBackupEncryptionKey(rawPassword, salt, BACKUP_PBKDF2_ITERATIONS);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: buildBackupAad(uid, identity.keyVersion),
      tagLength: 128,
    },
    aesKey,
    privateKeyBytes
  );

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: uid,
    backup_version: DM_E2EE_BACKUP_VERSION,
    key_version: Number(identity.keyVersion || 1) || 1,
    key_algorithm: String(identity.keyAlgorithm || KEY_ALGORITHM).trim() || KEY_ALGORITHM,
    public_key_jwk: identity.publicKeyJwk,
    encrypted_private_key: bytesToBase64Url(new Uint8Array(ciphertextBuffer)),
    kdf_algorithm: BACKUP_KDF_ALGORITHM,
    kdf_salt: bytesToBase64Url(salt),
    kdf_params: {
      iterations: BACKUP_PBKDF2_ITERATIONS,
      hash: BACKUP_KDF_HASH,
      password_source: resolvedPasswordSource,
    },
    cipher_alg: BACKUP_CIPHER_ALGORITHM,
    cipher_iv: bytesToBase64Url(iv),
    updated_at: nowIso,
  };

  const { data, error } = await supabase
    .from(BACKUP_TABLE)
    .upsert(payload, { onConflict: "user_id" })
    .select("id, user_id, backup_version, key_version, key_algorithm, public_key_jwk, encrypted_private_key, kdf_algorithm, kdf_salt, kdf_params, cipher_alg, cipher_iv, created_at, updated_at")
    .single();
  if (error) throw error;

  const row = normalizeBackupRow(data);
  keyBackupCacheByUserId.set(uid, row || null);
  return row;
}

export async function syncDmE2eeBackupWithLoginPassword({
  userId,
  password,
} = {}) {
  const uid = normalizeId(userId);
  const rawPassword = String(password ?? "");
  if (!uid || !rawPassword) {
    return { action: "skipped_missing_inputs" };
  }

  logDmE2ee("login_sync_started", { userId: uid });

  const [identityState, backupMeta] = await Promise.all([
    getDmE2eeIdentityState({ userId: uid, force: true }),
    getDmE2eeKeyBackupMetadata({ userId: uid, force: true }),
  ]);
  const backupPasswordSource = getDmE2eeBackupPasswordSource(backupMeta);
  logDmE2ee(backupMeta ? "backup_found" : "backup_missing", {
    userId: uid,
    source: "login_sync",
    backupId: String(backupMeta?.id || ""),
    backupPasswordSource,
  });

  if (identityState?.status === "error") {
    throw identityState.error || createBackupError("dm_e2ee_backup_identity_unavailable", "Could not inspect the DM encryption identity state.");
  }

  const missingLocalPrivateKey =
    identityState?.status === "missing_local_private"
    || identityState?.status === "not_initialized";

  if (missingLocalPrivateKey && backupMeta) {
    try {
      logDmE2ee("restore_started", {
        userId: uid,
        backupFound: true,
        source: "login_sync",
        backupPasswordSource,
      });
      await restoreDmE2eeKeyBackup({
        userId: uid,
        password: rawPassword,
      });
      const restoredState = await getDmE2eeIdentityState({ userId: uid, force: true });
      if (restoredState?.status !== "ready") {
        throw createBackupError(
          "dm_e2ee_restore_not_ready_after_login",
          "DM key restore completed but the key is still not ready on this device."
        );
      }
      logDmE2ee("restore_succeeded", {
        userId: uid,
        source: "login_sync",
      });
      if (restoredState?.localPrivateKeyExportable) {
        try {
          await createDmE2eeKeyBackup({
            userId: uid,
            password: rawPassword,
            passwordSource: DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN,
          });
          logDmE2ee("login_backup_resynced_after_restore", {
            userId: uid,
            previousBackupPasswordSource: backupPasswordSource,
          });
        } catch (backupRefreshError) {
          logDmE2ee("login_backup_resync_after_restore_failed", {
            userId: uid,
            previousBackupPasswordSource: backupPasswordSource,
            message: String(backupRefreshError?.message || backupRefreshError || "unknown"),
          });
        }
      }
      return {
        action: "restored_backup",
        hadBackup: true,
        hadLocalKey: false,
        backupPasswordSource,
      };
    } catch (error) {
      logDmE2ee("restore_failed", {
        userId: uid,
        source: "login_sync",
        message: String(error?.message || error || "unknown"),
        backupPasswordSource,
      });
      return {
        action: "restore_failed",
        hadBackup: true,
        hadLocalKey: false,
        error,
        backupPasswordSource,
      };
    }
  }

  if (identityState?.status === "ready" && identityState.localPrivateKeyExportable) {
    try {
      await createDmE2eeKeyBackup({
        userId: uid,
        password: rawPassword,
        passwordSource: DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN,
      });
      logDmE2ee("login_backup_synced", {
        userId: uid,
        action: backupMeta ? "refreshed_backup" : "created_backup",
      });
      return {
        action: backupMeta ? "refreshed_backup" : "created_backup",
        hadBackup: !!backupMeta,
        hadLocalKey: true,
        backupPasswordSource: DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN,
      };
    } catch (error) {
      logDmE2ee("login_backup_sync_failed", {
        userId: uid,
        message: String(error?.message || error || "unknown"),
      });
      return {
        action: backupMeta ? "backup_refresh_failed" : "backup_create_failed",
        hadBackup: !!backupMeta,
        hadLocalKey: true,
        error,
        backupPasswordSource,
      };
    }
  }

  if (identityState?.status === "ready" && backupMeta) {
    return {
      action: "noop_existing_backup",
      hadBackup: true,
      hadLocalKey: true,
    };
  }

  if (identityState?.status === "ready" && !identityState.localPrivateKeyExportable) {
    return {
      action: "skipped_legacy_non_exportable",
      hadBackup: !!backupMeta,
      hadLocalKey: true,
    };
  }

  if (identityState?.status === "missing_local_private") {
    logDmE2ee("backup_missing", {
      userId: uid,
      source: "login_sync_missing_local_private",
    });
    return {
      action: "skipped_missing_local_without_backup",
      hadBackup: false,
      hadLocalKey: false,
    };
  }

  if (identityState?.status === "not_initialized") {
    try {
      const createdIdentity = await ensureDmE2eeIdentity({ userId: uid });
      if (createdIdentity?.status !== "ready") {
        throw createdIdentity?.error || createBackupError(
          "dm_e2ee_identity_not_ready_after_create",
          "Could not initialize the Private DM identity for this account."
        );
      }
      await createDmE2eeKeyBackup({
        userId: uid,
        password: rawPassword,
        passwordSource: DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN,
      });
      logDmE2ee("login_identity_created_and_backed_up", {
        userId: uid,
        source: "login_sync",
      });
      return {
        action: "created_identity_and_backup",
        hadBackup: false,
        hadLocalKey: false,
        backupPasswordSource: DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN,
      };
    } catch (error) {
      logDmE2ee("login_identity_create_or_backup_failed", {
        userId: uid,
        source: "login_sync",
        message: String(error?.message || error || "unknown"),
      });
      return {
        action: "backup_create_failed",
        hadBackup: !!backupMeta,
        hadLocalKey: false,
        error,
        backupPasswordSource,
      };
    }
  }

  return {
    action: "noop",
    hadBackup: !!backupMeta,
    hadLocalKey: !!identityState?.hasLocalPrivateKey,
  };
}

export async function restoreDmE2eeKeyBackup({
  userId,
  password,
} = {}) {
  const uid = normalizeId(userId);
  const rawPassword = String(password ?? "");
  if (!uid) throw createBackupError("dm_e2ee_backup_missing_user", "Missing userId for DM key restore.");
  if (!rawPassword) {
    throw createBackupError("dm_e2ee_backup_password_required", "Backup password is required.");
  }

  try {
    const backupRow = await fetchOwnBackupRow(uid, { force: true });
    if (!backupRow) {
      throw createBackupError("dm_e2ee_backup_missing", "No encrypted DM backup was found for this account.");
    }
    logDmE2ee("restore_started", {
      userId: uid,
      backupFound: true,
      keyVersion: backupRow.keyVersion,
    });

    const iterations = Math.max(
      100000,
      Math.round(Number(backupRow.kdfParams?.iterations || BACKUP_PBKDF2_ITERATIONS) || BACKUP_PBKDF2_ITERATIONS)
    );
    const aesKey = await deriveBackupEncryptionKey(rawPassword, base64UrlToBytes(backupRow.kdfSalt), iterations);

    let privateKeyBytes;
    try {
      const plaintextBuffer = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: base64UrlToBytes(backupRow.cipherIv),
          additionalData: buildBackupAad(uid, backupRow.keyVersion),
          tagLength: 128,
        },
        aesKey,
        base64UrlToBytes(backupRow.encryptedPrivateKey)
      );
      privateKeyBytes = new Uint8Array(plaintextBuffer);
    } catch (_) {
      throw createBackupError("dm_e2ee_backup_bad_password", "Could not decrypt the DM key backup with that password.");
    }

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      privateKeyBytes,
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveBits"]
    );

    const activeKeyRow = await fetchActiveKeyRowForUser(uid, { force: true });
    let resolvedKeyRow = activeKeyRow;
    if (resolvedKeyRow) {
      const versionMatches = Number(resolvedKeyRow.keyVersion || 0) === Number(backupRow.keyVersion || 0);
      const publicKeyMatches = publicKeysMatch(resolvedKeyRow.publicKeyJwk, backupRow.publicKeyJwk);
      if (!versionMatches || !publicKeyMatches) {
        throw createBackupError(
          "dm_e2ee_backup_stale",
          "This encrypted DM backup is for an older or different key identity. Update the backup from a current device first."
        );
      }
    } else {
      resolvedKeyRow = await upsertMyKeyRow(backupRow.publicKeyJwk);
    }

    const restoredIdentity = await writeIdentityRecord({
      userId: uid,
      keyId: normalizeId(resolvedKeyRow?.id || ""),
      keyVersion: Number(resolvedKeyRow?.keyVersion || backupRow.keyVersion || 1) || 1,
      keyAlgorithm: String(resolvedKeyRow?.keyAlgorithm || backupRow.keyAlgorithm || KEY_ALGORITHM).trim() || KEY_ALGORITHM,
      publicKeyJwk: resolvedKeyRow?.publicKeyJwk || backupRow.publicKeyJwk,
      privateKey,
    });
    logDmE2ee("local_key_persisted", {
      userId: uid,
      keyVersion: Number(restoredIdentity?.keyVersion || 0) || 0,
    });
    const persistedIdentity = await readIdentityRecord(uid);
    if (!persistedIdentity) {
      throw createBackupError(
        "dm_e2ee_backup_local_persist_failed",
        "The DM private key was restored but could not be persisted locally on this device."
      );
    }
    logDmE2ee("local_key_readable", {
      userId: uid,
      keyVersion: Number(persistedIdentity?.keyVersion || 0) || 0,
    });

    keyBackupCacheByUserId.set(uid, backupRow);
    logDmE2ee("restore_succeeded", {
      userId: uid,
      keyVersion: persistedIdentity.keyVersion,
    });
    return persistedIdentity || restoredIdentity;
  } catch (error) {
    logDmE2ee("restore_failed", {
      userId: uid,
      code: String(error?.code || ""),
      message: String(error?.message || error || "unknown"),
    });
    throw error;
  }
}

export async function buildEncryptedDmMessagePayload({
  conversationId,
  userId,
  otherUserId,
  content,
} = {}) {
  const convId = normalizeId(conversationId);
  const senderUserId = normalizeId(userId);
  const peerUserId = normalizeId(otherUserId);
  const plaintext = String(content || "");
  if (!convId || !senderUserId || !peerUserId) {
    throw new Error("Encrypted DM payload missing conversation or participant ids.");
  }

  const localIdentity = await ensureDmE2eeIdentity({ userId: senderUserId });
  if (localIdentity?.status !== "ready") {
    logDmE2ee("send_blocked_missing_local_key", {
      userId: senderUserId,
      conversationId: convId,
      identityStatus: String(localIdentity?.status || "unknown"),
    });
    throw new Error(localIdentity?.status === "missing_local_private"
      ? "This device is missing the DM private key for this account."
      : "Could not initialize DM encryption on this device.");
  }

  const peerKeyRow = await getActiveDmE2eePeerKey(peerUserId);
  if (!peerKeyRow) {
    throw new Error("The recipient has not finished setting up encrypted DMs yet.");
  }

  const aesKey = await deriveConversationAesKey({
    localIdentity,
    remoteKeyRow: peerKeyRow,
    conversationId: convId,
  });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: buildAad(convId, senderUserId),
      tagLength: 128,
    },
    aesKey,
    encoder.encode(plaintext)
  );

  return {
    message_mode: DM_E2EE_MESSAGE_MODE,
    content: DM_E2EE_CONTENT_PLACEHOLDER,
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertextBuffer)),
    cipher_iv: bytesToBase64Url(iv),
    cipher_alg: DM_E2EE_CIPHER_ALG,
    cipher_version: DM_E2EE_CIPHER_VERSION,
    sender_key_id: localIdentity.keyId,
    recipient_key_id: peerKeyRow.id,
  };
}

export async function decryptDmMessageRows({
  userId,
  conversationId,
  rows = [],
} = {}) {
  const myUserId = normalizeId(userId);
  const convId = normalizeId(conversationId);
  const inputRows = Array.isArray(rows) ? rows : [];
  if (!myUserId || !convId || !inputRows.length) return inputRows;

  const encryptedRows = inputRows.filter((row) => isEncryptedDmMessageRow(row));
  if (!encryptedRows.length) return inputRows;

  const localIdentity = await ensureDmE2eeIdentity({ userId: myUserId });
  if (localIdentity?.status !== "ready") {
    logDmE2ee("decrypt_blocked_missing_local_key", {
      userId: myUserId,
      conversationId: convId,
      identityStatus: String(localIdentity?.status || "unknown"),
      rows: encryptedRows.length,
    });
    return inputRows.map((row) => (
      isEncryptedDmMessageRow(row)
        ? buildUnavailableRow(row, String(localIdentity?.status || "missing_identity"))
        : row
    ));
  }

  const remoteKeyIds = Array.from(new Set(encryptedRows.map((row) => (
    normalizeId(
      normalizeId(row?.user_id || "") === myUserId
        ? row?.recipient_key_id
        : row?.sender_key_id
    )
  )).filter(Boolean)));
  const remoteKeyRows = await fetchKeyRowsByIds(remoteKeyIds);
  const remoteKeyMap = new Map(remoteKeyRows.map((row) => [row.id, row]));

  return Promise.all(inputRows.map(async (row) => {
    if (!isEncryptedDmMessageRow(row)) return row;

    const remoteKeyId = normalizeId(
      normalizeId(row?.user_id || "") === myUserId
        ? row?.recipient_key_id
        : row?.sender_key_id
    );
    const remoteKeyRow = remoteKeyMap.get(remoteKeyId) || null;
    if (!remoteKeyRow) return buildUnavailableRow(row, "missing_peer_key");

    try {
      const aesKey = await deriveConversationAesKey({
        localIdentity,
        remoteKeyRow,
        conversationId: convId,
      });
      const plaintextBuffer = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: base64UrlToBytes(row?.cipher_iv || ""),
          additionalData: buildAad(convId, normalizeId(row?.user_id || "")),
          tagLength: 128,
        },
        aesKey,
        base64UrlToBytes(row?.ciphertext || "")
      );
      return {
        ...row,
        content: new TextDecoder().decode(plaintextBuffer),
        e2eeState: "ready",
      };
    } catch (_) {
      return buildUnavailableRow(row, "decryption_failed");
    }
  }));
}
