import { supabase } from "../supabaseClient.js";

export const DM_E2EE_MESSAGE_MODE = "dm_e2ee_v1";
export const DM_E2EE_CONTENT_PLACEHOLDER = "[ALTARA_DM_E2EE_V1]";
export const DM_E2EE_CIPHER_ALG = "AES-GCM-256";
export const DM_E2EE_CIPHER_VERSION = 1;
export const DM_E2EE_BACKUP_VERSION = 1;
export const DM_E2EE_BACKUP_PASSWORD_MIN_LENGTH = 6;
export const DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN = "account_login";
export const DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL = "manual";
export const DM_E2EE_BACKUP_METHOD_PASSWORD = "password";
export const DM_E2EE_BACKUP_METHOD_RECOVERY_KEY = "recovery_key";
const ACCOUNT_PASSWORD_MIN_LENGTH = 6;

const IDB_NAME = "altara-dm-e2ee-v1";
const IDB_VERSION = 2;
const LEGACY_IDENTITY_STORE = "identityKeys";
const IDENTITY_STORE = "identityKeysV2";
const IDENTITY_STORAGE_VERSION = 2;
const LOCAL_STORAGE_IDENTITY_PREFIX = "altara.dm_e2ee.identity.v1.";
const BACKUP_TABLE = "dm_e2ee_key_backups";
const BACKUP_SELECT_COLUMNS = "id, user_id, backup_version, key_algorithm, kdf, kdf_salt, kdf_iterations, encrypted_private_key, encryption_iv, encryption_alg, recovery_hint, created_at, updated_at";
const BACKUP_METHODS_TABLE = "dm_e2ee_key_backup_methods";
const BACKUP_METHOD_SELECT_COLUMNS = "id, user_id, backup_version, method, kdf, kdf_salt, kdf_iterations, encrypted_private_key, encryption_iv, encryption_alg, created_at, updated_at";
const KEY_ALGORITHM = "ECDH-P256";
// PBKDF2 is the practical browser-native KDF we can ship today in Electron/Web Crypto.
const BACKUP_KDF_ALGORITHM = "PBKDF2-SHA256";
const BACKUP_KDF_HASH = "SHA-256";
const BACKUP_PBKDF2_ITERATIONS = 600000;
const BACKUP_PBKDF2_MIN_ITERATIONS = 100000;
const BACKUP_PBKDF2_MAX_ITERATIONS = 2000000;
const MAX_ENCODED_PRIVATE_KEY_LENGTH = 16384;
const BACKUP_CIPHER_ALGORITHM = "AES-GCM-256";
const RECOVERY_KEY_PREFIX = "ALTARA";
const RECOVERY_KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECOVERY_KEY_GROUP_SIZE = 4;
const RECOVERY_KEY_GROUP_COUNT = 8;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const identityCache = new Map();
const publicKeyCacheByUserId = new Map();
const publicKeyCacheById = new Map();
const derivedKeyCache = new Map();
const keyBackupCacheByUserId = new Map();
const keyBackupMethodsCacheByUserId = new Map();
let idbPromise = null;
const DM_E2EE_DIAGNOSTICS_ENABLED = false;
const DM_E2EE_DIAGNOSTICS_STORAGE_KEY = "altara.debug.dm_e2ee";

function normalizeId(value = "") {
  return String(value || "").trim();
}

function isCryptoKey(value) {
  return typeof CryptoKey !== "undefined" && value instanceof CryptoKey;
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

function normalizeBackupMethod(value = "") {
  const method = String(value || "").trim().toLowerCase();
  if (method === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY) return DM_E2EE_BACKUP_METHOD_RECOVERY_KEY;
  return DM_E2EE_BACKUP_METHOD_PASSWORD;
}

function resolveBackupPasswordMinLength(passwordSource = DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL) {
  return normalizeBackupPasswordSource(passwordSource) === DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN
    ? ACCOUNT_PASSWORD_MIN_LENGTH
    : DM_E2EE_BACKUP_PASSWORD_MIN_LENGTH;
}

function logDmE2ee(event = "", details = null) {
  if (!isDmE2eeDiagnosticsEnabled()) return;
  const label = String(event || "").trim();
  if (!label) return;
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  if (details && typeof details === "object") {
    console.info("[ALTARA][dm-e2ee]", label, details);
    return;
  }
  console.info("[ALTARA][dm-e2ee]", label);
}

function createDmE2eeSetupError(reason, message, cause = null) {
  const error = new Error(String(message || reason || "DM E2EE setup failed"));
  error.code = String(reason || "unknown_error");
  error.reason = String(reason || "unknown_error");
  if (cause) {
    error.cause = cause;
    error.originalCode = String(cause?.code || cause?.error || "");
  }
  return error;
}

function classifyDmE2eeSetupError(error, fallback = "unknown_error") {
  const code = String(error?.reason || error?.code || error?.error || "").trim().toLowerCase();
  if (
    code === "crypto_unavailable"
    || code === "indexeddb_unavailable"
    || code === "local_private_key_store_failed"
    || code === "local_private_key_corrupt"
    || code === "dm_e2ee_recovery_required"
    || code === "public_key_upload_failed"
    || code === "rpc_error"
    || code === "auth_missing"
    || code === "invalid_public_key"
    || code === "unknown_error"
  ) {
    return code;
  }
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("indexeddb")) return "indexeddb_unavailable";
  if (message.includes("crypto") || message.includes("subtle")) return "crypto_unavailable";
  if (message.includes("public key") || message.includes("upsert_my_dm_e2ee_key")) return "public_key_upload_failed";
  if (message.includes("local") || message.includes("persist") || message.includes("store")) return "local_private_key_store_failed";
  return fallback;
}

function isDmE2eeDiagnosticsEnabled() {
  if (DM_E2EE_DIAGNOSTICS_ENABLED === true) return true;
  try {
    if (typeof window !== "undefined" && window.__ALTARA_DM_E2EE_DEBUG__ === true) return true;
  } catch (_) {}
  try {
    if (typeof localStorage === "undefined") return false;
    return String(localStorage.getItem(DM_E2EE_DIAGNOSTICS_STORAGE_KEY) || "").trim() === "1";
  } catch (_) {
    return false;
  }
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

function normalizePrivateKeyJwk(input = null) {
  if (!input || typeof input !== "object") return null;
  const jwk = { ...input };
  if (!jwk.kty || !jwk.crv || !jwk.x || !jwk.y || !jwk.d) return null;
  return {
    kty: String(jwk.kty),
    crv: String(jwk.crv),
    x: String(jwk.x),
    y: String(jwk.y),
    d: String(jwk.d),
    ext: true,
    key_ops: ["deriveBits"],
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
  const cipherIv = String(row.encryption_iv || row.encryptionIv || row.cipher_iv || row.cipherIv || "").trim();
  const publicKeyJwk = normalizePublicKeyJwk(row.public_key_jwk || row.publicKeyJwk || null);
  if (!id || !userId || !encryptedPrivateKey || !kdfSalt || !cipherIv) return null;
  const kdfParams = (row.kdf_params && typeof row.kdf_params === "object" && !Array.isArray(row.kdf_params))
    ? { ...row.kdf_params }
    : {};
  const kdfIterations = Math.round(Number(row.kdf_iterations ?? row.kdfIterations ?? kdfParams.iterations));
  return {
    id,
    userId,
    backupVersion: Number(row.backup_version ?? row.backupVersion),
    keyVersion: Number(row.key_version || row.keyVersion || kdfParams.key_version || 1) || 1,
    keyAlgorithm: String(row.key_algorithm || row.keyAlgorithm || KEY_ALGORITHM).trim() || KEY_ALGORITHM,
    publicKeyJwk,
    encryptedPrivateKey,
    kdfAlgorithm: String(row.kdf || row.kdf_algorithm || row.kdfAlgorithm || BACKUP_KDF_ALGORITHM).trim() || BACKUP_KDF_ALGORITHM,
    kdfSalt,
    kdfIterations: Number.isSafeInteger(kdfIterations) ? kdfIterations : 0,
    kdfParams: { ...kdfParams, iterations: kdfIterations },
    passwordSource: getDmE2eeBackupPasswordSource(row),
    cipherAlg: String(row.encryption_alg || row.encryptionAlg || row.cipher_alg || row.cipherAlg || BACKUP_CIPHER_ALGORITHM).trim() || BACKUP_CIPHER_ALGORITHM,
    cipherIv,
    recoveryHint: String(row.recovery_hint || row.recoveryHint || "").trim(),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

function normalizeBackupMethodRow(row = null) {
  if (!row || typeof row !== "object") return null;
  const normalized = normalizeBackupRow({
    ...row,
    key_algorithm: row.key_algorithm || row.keyAlgorithm || KEY_ALGORITHM,
    recovery_hint: row.recovery_hint || row.recoveryHint || "",
  });
  if (!normalized) return null;
  normalized.method = normalizeBackupMethod(row.method || normalized.method || "");
  normalized.passwordSource = DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL;
  normalized.hasRecoveryKeyMethod = normalized.method === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY;
  return normalized;
}

export function getDmE2eeBackupPasswordSource(row = null) {
  if (!row || typeof row !== "object") return "";
  return normalizeBackupPasswordSource(
    row.passwordSource
    || row.password_source
    || row.kdfParams?.password_source
    || row.kdf_params?.password_source
    || ""
  ) || DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL;
}

function normalizeIdentityRecord(record = null) {
  if (!record || typeof record !== "object") return null;
  const userId = normalizeId(record.userId || record.user_id || "");
  const keyId = normalizeId(record.keyId || record.key_id || "");
  const publicKeyJwk = normalizePublicKeyJwk(record.publicKeyJwk || record.public_key_jwk || null);
  const privateKey = record.privateKey || record.private_key || null;
  if (!userId || !publicKeyJwk || !isCryptoKey(privateKey)) return null;
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

function isEcdhPrivateKey(privateKey, { requireNonExtractable = false } = {}) {
  if (!isCryptoKey(privateKey) || privateKey.type !== "private") return false;
  if (String(privateKey.algorithm?.name || "").toUpperCase() !== "ECDH") return false;
  if (String(privateKey.algorithm?.namedCurve || "").toUpperCase() !== "P-256") return false;
  const usages = Array.from(privateKey.usages || []);
  if (usages.length !== 1 || usages[0] !== "deriveBits") return false;
  if (requireNonExtractable && privateKey.extractable !== false) return false;
  return true;
}

function normalizeStoredIdentityEnvelope(record = null) {
  if (!record || typeof record !== "object") return null;
  const userId = normalizeId(record.userId || record.user_id || "");
  const keyId = normalizeId(record.keyId || record.key_id || "");
  const publicKeyJwk = normalizePublicKeyJwk(record.publicKeyJwk || record.public_key_jwk || null);
  if (!userId || !publicKeyJwk) return null;
  return {
    storageVersion: Number(record.storageVersion || record.storage_version || 0) || 0,
    userId,
    keyId,
    keyVersion: Number(record.keyVersion || record.key_version || 1) || 1,
    keyAlgorithm: String(record.keyAlgorithm || record.key_algorithm || KEY_ALGORITHM).trim() || KEY_ALGORITHM,
    publicKeyJwk,
    privateKey: isCryptoKey(record.privateKey) ? record.privateKey : null,
    privateKeyPkcs8: String(record.privateKeyPkcs8 || record.private_key_pkcs8 || "").trim(),
  };
}

function validateHardenedStorageEnvelope(record = null) {
  if (!record || typeof record !== "object" || Number(record.storageVersion) !== IDENTITY_STORAGE_VERSION) {
    throw createDmE2eeSetupError("local_private_key_corrupt", "The hardened Vault identity record has an unsupported format.");
  }
  if (
    Object.prototype.hasOwnProperty.call(record, "privateKeyPkcs8")
    || Object.prototype.hasOwnProperty.call(record, "private_key_pkcs8")
    || Object.prototype.hasOwnProperty.call(record, "privateKeyJwk")
    || Object.prototype.hasOwnProperty.call(record, "private_key_jwk")
    || Object.prototype.hasOwnProperty.call(record, "d")
  ) {
    throw createDmE2eeSetupError("local_private_key_corrupt", "The hardened Vault identity record contains serialized private material.");
  }
  return record;
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

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
  });
}

function getLocalStorageIdentityKey(userId) {
  const uid = normalizeId(userId);
  if (!uid) return "";
  return LOCAL_STORAGE_IDENTITY_PREFIX + encodeURIComponent(uid);
}

function readLocalStorageIdentityEnvelope(userId) {
  const key = getLocalStorageIdentityKey(userId);
  if (!key || typeof localStorage === "undefined") return { found: false, key, record: null };
  let raw = "";
  try {
    raw = String(localStorage.getItem(key) || "").trim();
  } catch (error) {
    throw createDmE2eeSetupError(
      "local_private_key_store_failed",
      "Legacy local Vault storage could not be inspected safely.",
      error
    );
  }
  if (!raw) return { found: false, key, record: null };
  try {
    const parsed = JSON.parse(raw);
    return { found: true, key, record: parsed };
  } catch (error) {
    throw createDmE2eeSetupError(
      "local_private_key_corrupt",
      "Legacy local Vault identity data is corrupt. Restore the identity from Vault Recovery.",
      error
    );
  }
}

function decodeLegacyPrivateKey(value = "") {
  const encoded = String(value || "").trim();
  if (!encoded || encoded.length > MAX_ENCODED_PRIVATE_KEY_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw createDmE2eeSetupError(
      "local_private_key_corrupt",
      "Legacy local Vault identity data is invalid. Restore the identity from Vault Recovery."
    );
  }
  try {
    return base64UrlToBytes(encoded);
  } catch (error) {
    throw createDmE2eeSetupError(
      "local_private_key_corrupt",
      "Legacy local Vault identity data is invalid. Restore the identity from Vault Recovery.",
      error
    );
  }
}

async function verifyIdentityKeyPair(privateKey, publicKeyJwk, { requireNonExtractable = true } = {}) {
  if (!isEcdhPrivateKey(privateKey, { requireNonExtractable })) {
    throw createDmE2eeSetupError(
      "local_private_key_corrupt",
      "The local Vault private key has unsafe or unsupported properties."
    );
  }
  const publicKey = await importPeerPublicKey(publicKeyJwk);
  const probePair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );
  let left = null;
  let right = null;
  try {
    left = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "ECDH", public: probePair.publicKey },
      privateKey,
      256
    ));
    right = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "ECDH", public: publicKey },
      probePair.privateKey,
      256
    ));
    if (left.length !== right.length) throw new Error("identity_pair_mismatch");
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    if (difference !== 0) throw new Error("identity_pair_mismatch");
  } catch (error) {
    throw createDmE2eeSetupError(
      "local_private_key_corrupt",
      "The local Vault private key does not match its public identity.",
      error
    );
  } finally {
    left?.fill(0);
    right?.fill(0);
  }
  return true;
}

async function importStoredIdentityEnvelope(envelope = null, expectedUserId = "", { captureRecoveryMaterial = false } = {}) {
  const result = normalizeStoredIdentityEnvelope(envelope);
  const uid = normalizeId(expectedUserId);
  if (!result || (uid && result.userId !== uid)) {
    throw createDmE2eeSetupError(
      "local_private_key_corrupt",
      "The stored Vault identity is invalid or belongs to another account."
    );
  }

  let privateKey = result.privateKey;
  let migrated = false;
  let recoveryPrivateKeyJwk = null;
  if (isCryptoKey(privateKey)) {
    if (!isEcdhPrivateKey(privateKey)) {
      throw createDmE2eeSetupError("local_private_key_corrupt", "The stored Vault private key is invalid.");
    }
    if (privateKey.extractable !== false) {
      let legacyJwk = null;
      try {
        legacyJwk = normalizePrivateKeyJwk(await crypto.subtle.exportKey("jwk", privateKey));
        if (!legacyJwk) throw new Error("invalid_private_jwk");
        if (captureRecoveryMaterial) recoveryPrivateKeyJwk = { ...legacyJwk };
        privateKey = await crypto.subtle.importKey(
          "jwk",
          legacyJwk,
          { name: "ECDH", namedCurve: "P-256" },
          false,
          ["deriveBits"]
        );
        migrated = true;
      } catch (error) {
        throw createDmE2eeSetupError(
          "local_private_key_corrupt",
          "The legacy Vault private key could not be hardened safely.",
          error
        );
      } finally {
        legacyJwk = null;
      }
    }
  } else if (result.privateKeyPkcs8) {
    let privateKeyBytes = null;
    let extractableLegacyKey = null;
    try {
      privateKeyBytes = decodeLegacyPrivateKey(result.privateKeyPkcs8);
      extractableLegacyKey = await crypto.subtle.importKey(
        "pkcs8",
        privateKeyBytes,
        { name: "ECDH", namedCurve: "P-256" },
        captureRecoveryMaterial,
        ["deriveBits"]
      );
      if (captureRecoveryMaterial) {
        recoveryPrivateKeyJwk = normalizePrivateKeyJwk(
          await crypto.subtle.exportKey("jwk", extractableLegacyKey)
        );
        if (!recoveryPrivateKeyJwk) throw new Error("invalid_private_jwk");
        privateKey = await crypto.subtle.importKey(
          "jwk",
          recoveryPrivateKeyJwk,
          { name: "ECDH", namedCurve: "P-256" },
          false,
          ["deriveBits"]
        );
      } else {
        privateKey = extractableLegacyKey;
      }
      migrated = true;
    } catch (error) {
      throw createDmE2eeSetupError(
        "local_private_key_corrupt",
        "The legacy Vault private key could not be imported safely.",
        error
      );
    } finally {
      privateKeyBytes?.fill(0);
    }
  } else {
    throw createDmE2eeSetupError(
      "local_private_key_corrupt",
      "The stored Vault identity is missing its private key."
    );
  }

  const identity = normalizeIdentityRecord({
    ...result,
    privateKey,
  });
  if (!identity) {
    throw createDmE2eeSetupError("local_private_key_corrupt", "The stored Vault identity is invalid.");
  }
  await verifyIdentityKeyPair(identity.privateKey, identity.publicKeyJwk);
  return { identity, migrated, recoveryPrivateKeyJwk };
}

function openIdentityDb() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(createDmE2eeSetupError("indexeddb_unavailable", "IndexedDB is unavailable for DM E2EE."));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_IDENTITY_STORE)) {
        db.createObjectStore(LEGACY_IDENTITY_STORE, { keyPath: "userId" });
      }
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    const rejectOpen = () => {
      idbPromise = null;
      reject(createDmE2eeSetupError(
        "indexeddb_unavailable",
        "IndexedDB could not be opened for DM E2EE.",
        request.error || null
      ));
    };
    request.onerror = rejectOpen;
    request.onblocked = rejectOpen;
  });
  return idbPromise;
}

async function readIdentityEnvelopeFromStore(db, storeName, userId) {
  if (!db.objectStoreNames.contains(storeName)) return { found: false, record: null };
  const tx = db.transaction(storeName, "readonly");
  const result = await requestToPromise(tx.objectStore(storeName).get(userId));
  return { found: result !== undefined && result !== null, record: result || null };
}

async function persistHardenedIdentityRecord(record = {}) {
  const normalized = normalizeIdentityRecord(record);
  if (!normalized || !isEcdhPrivateKey(normalized.privateKey, { requireNonExtractable: true })) {
    throw createDmE2eeSetupError(
      "local_private_key_store_failed",
      "Only a non-extractable Vault private key can be persisted."
    );
  }
  await verifyIdentityKeyPair(normalized.privateKey, normalized.publicKeyJwk);
  const db = await openIdentityDb();
  const tx = db.transaction(IDENTITY_STORE, "readwrite");
  const committed = transactionToPromise(tx);
  await requestToPromise(tx.objectStore(IDENTITY_STORE).put({
    storageVersion: IDENTITY_STORAGE_VERSION,
    userId: normalized.userId,
    keyId: normalized.keyId,
    keyVersion: normalized.keyVersion,
    keyAlgorithm: normalized.keyAlgorithm,
    publicKeyJwk: normalized.publicKeyJwk,
    privateKey: normalized.privateKey,
  }));
  await committed;

  const readback = await readIdentityEnvelopeFromStore(db, IDENTITY_STORE, normalized.userId);
  if (!readback.found) {
    throw createDmE2eeSetupError(
      "local_private_key_store_failed",
      "The hardened Vault private key could not be read back from IndexedDB."
    );
  }
  validateHardenedStorageEnvelope(readback.record);
  const verified = await importStoredIdentityEnvelope(readback.record, normalized.userId);
  if (verified.migrated || !isEcdhPrivateKey(verified.identity.privateKey, { requireNonExtractable: true })) {
    throw createDmE2eeSetupError(
      "local_private_key_store_failed",
      "IndexedDB did not preserve the hardened Vault private key safely."
    );
  }
  return verified.identity;
}

async function removeLegacyIdentityRecords(userId) {
  const uid = normalizeId(userId);
  const db = await openIdentityDb();
  if (db.objectStoreNames.contains(LEGACY_IDENTITY_STORE)) {
    const tx = db.transaction(LEGACY_IDENTITY_STORE, "readwrite");
    const committed = transactionToPromise(tx);
    await requestToPromise(tx.objectStore(LEGACY_IDENTITY_STORE).delete(uid));
    await committed;
    const readback = await readIdentityEnvelopeFromStore(db, LEGACY_IDENTITY_STORE, uid);
    if (readback.found) {
      throw createDmE2eeSetupError(
        "local_private_key_store_failed",
        "The legacy IndexedDB Vault private-key record could not be removed."
      );
    }
  }

  const legacyLocal = readLocalStorageIdentityEnvelope(uid);
  if (legacyLocal.found) {
    try {
      localStorage.removeItem(legacyLocal.key);
      if (String(localStorage.getItem(legacyLocal.key) || "").trim()) {
        throw new Error("legacy_local_record_still_present");
      }
    } catch (error) {
      throw createDmE2eeSetupError(
        "local_private_key_store_failed",
        "The legacy localStorage Vault private-key record could not be removed.",
        error
      );
    }
  }
}

async function finalizeHardenedIdentity(record = {}) {
  const persisted = await persistHardenedIdentityRecord(record);
  await removeLegacyIdentityRecords(persisted.userId);
  identityCache.set(persisted.userId, persisted);
  derivedKeyCache.clear();
  return persisted;
}

async function legacyEnvelopeNeedsRecoveryBeforeMigration(record = null, expectedUserId = "") {
  const envelope = normalizeStoredIdentityEnvelope(record);
  const uid = normalizeId(expectedUserId);
  if (
    !envelope
    || (uid && envelope.userId !== uid)
    || envelope.keyAlgorithm !== KEY_ALGORITHM
  ) {
    throw createDmE2eeSetupError(
      "local_private_key_corrupt",
      "The stored Vault identity is invalid or belongs to another account."
    );
  }
  if (isCryptoKey(envelope.privateKey)) {
    if (!isEcdhPrivateKey(envelope.privateKey)) {
      throw createDmE2eeSetupError("local_private_key_corrupt", "The stored Vault private key is invalid.");
    }
    await verifyIdentityKeyPair(envelope.privateKey, envelope.publicKeyJwk, { requireNonExtractable: false });
    return envelope.privateKey.extractable !== false;
  }
  if (envelope.privateKeyPkcs8) {
    const encoded = envelope.privateKeyPkcs8;
    if (
      encoded.length > MAX_ENCODED_PRIVATE_KEY_LENGTH
      || encoded.length % 4 === 1
      || !/^[A-Za-z0-9_-]+$/.test(encoded)
    ) {
      throw createDmE2eeSetupError(
        "local_private_key_corrupt",
        "Legacy local Vault identity data is invalid. Restore the identity from Vault Recovery."
      );
    }
    return true;
  }
  throw createDmE2eeSetupError(
    "local_private_key_corrupt",
    "The stored Vault identity is missing its private key."
  );
}

async function requireRecoveryProvisioningForLegacyMigration(record = null, expectedUserId = "") {
  if (!(await legacyEnvelopeNeedsRecoveryBeforeMigration(record, expectedUserId))) return;
  throw createDmE2eeSetupError(
    "dm_e2ee_recovery_required",
    "Set up fresh encrypted Vault Recovery before hardening this legacy identity."
  );
}

async function readLegacyIdentityForRecoveryProvisioning(userId) {
  const uid = normalizeId(userId);
  const db = await openIdentityDb();
  const legacyIndexedDb = await readIdentityEnvelopeFromStore(db, LEGACY_IDENTITY_STORE, uid);
  if (legacyIndexedDb.found) {
    return importStoredIdentityEnvelope(legacyIndexedDb.record, uid, { captureRecoveryMaterial: true });
  }
  const legacyLocal = readLocalStorageIdentityEnvelope(uid);
  if (legacyLocal.found) {
    return importStoredIdentityEnvelope(legacyLocal.record, uid, { captureRecoveryMaterial: true });
  }
  return null;
}

async function readIdentityRecord(userId) {
  const uid = normalizeId(userId);
  if (!uid) return null;
  try {
    const db = await openIdentityDb();
    const hardened = await readIdentityEnvelopeFromStore(db, IDENTITY_STORE, uid);
    if (hardened.found) {
      validateHardenedStorageEnvelope(hardened.record);
      const imported = await importStoredIdentityEnvelope(hardened.record, uid);
      if (imported.migrated) {
        throw createDmE2eeSetupError("local_private_key_corrupt", "The hardened Vault identity unexpectedly contains an exportable key.");
      }
      const identity = imported.identity;
      await removeLegacyIdentityRecords(uid);
      identityCache.set(uid, identity);
      return identity;
    }

    const legacyIndexedDb = await readIdentityEnvelopeFromStore(db, LEGACY_IDENTITY_STORE, uid);
    if (legacyIndexedDb.found) {
      await requireRecoveryProvisioningForLegacyMigration(legacyIndexedDb.record, uid);
      const imported = await importStoredIdentityEnvelope(legacyIndexedDb.record, uid);
      return finalizeHardenedIdentity(imported.identity);
    }

    const legacyLocal = readLocalStorageIdentityEnvelope(uid);
    if (legacyLocal.found) {
      await requireRecoveryProvisioningForLegacyMigration(legacyLocal.record, uid);
      const imported = await importStoredIdentityEnvelope(legacyLocal.record, uid);
      return finalizeHardenedIdentity(imported.identity);
    }
    return null;
  } catch (error) {
    logDmE2ee("indexeddb_identity_read_failed", {
      userId: uid,
      reason: classifyDmE2eeSetupError(error, "local_private_key_store_failed"),
      message: String(error?.message || error || "unknown"),
    });
    throw error;
  }
}

async function writeIdentityRecord(record = {}) {
  try {
    return await finalizeHardenedIdentity(record);
  } catch (error) {
    logDmE2ee("indexeddb_identity_write_failed", {
      userId: normalizeId(record?.userId || record?.user_id || ""),
      reason: classifyDmE2eeSetupError(error, "local_private_key_store_failed"),
      message: String(error?.message || error || "unknown"),
    });
    throw createDmE2eeSetupError(
      classifyDmE2eeSetupError(error, "local_private_key_store_failed"),
      "Could not securely persist the local Vault private key in IndexedDB.",
      error
    );
  }
}

async function provisionNewIdentityWithRecovery({
  userId,
  password,
  passwordSource = DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL,
  includeRecoveryKey = true,
} = {}) {
  const uid = normalizeId(userId);
  let pair = null;
  let privateKeyJwk = null;
  try {
    pair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );
    const publicKeyJwk = normalizePublicKeyJwk(await crypto.subtle.exportKey("jwk", pair.publicKey));
    privateKeyJwk = normalizePrivateKeyJwk(await crypto.subtle.exportKey("jwk", pair.privateKey));
    if (!publicKeyJwk || !privateKeyJwk || !publicKeysMatch(publicKeyJwk, privateKeyJwk)) {
      throw createDmE2eeSetupError("invalid_public_key", "Could not generate a valid Vault identity.");
    }
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      privateKeyJwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"]
    );
    await verifyIdentityKeyPair(privateKey, publicKeyJwk);
    pair = null;

    const draftIdentity = {
      status: "ready",
      userId: uid,
      keyId: "",
      keyVersion: 1,
      keyAlgorithm: KEY_ALGORITHM,
      publicKeyJwk,
      privateKey,
    };
    const backup = await persistIdentityBackupFromPrivateJwk({
      identity: draftIdentity,
      privateKeyJwk,
      password,
      passwordSource,
      includeRecoveryKey,
    });
    privateKeyJwk = null;

    const persisted = await writeIdentityRecord(draftIdentity);
    const keyRow = await upsertMyKeyRow(publicKeyJwk);
    const readyIdentity = await writeIdentityRecord({
      ...persisted,
      status: "ready",
      keyId: keyRow.id,
      keyVersion: keyRow.keyVersion,
      keyAlgorithm: keyRow.keyAlgorithm,
      publicKeyJwk: keyRow.publicKeyJwk,
    });
    return {
      ...readyIdentity,
      recoveryKey: String(backup?.recoveryKey || ""),
      backupCreated: !!backup,
    };
  } finally {
    pair = null;
    privateKeyJwk = null;
  }
}

async function migrateLegacyIdentityWithRecovery({
  userId,
  password,
  passwordSource = DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL,
  includeRecoveryKey = true,
} = {}) {
  const uid = normalizeId(userId);
  let prepared = await readLegacyIdentityForRecoveryProvisioning(uid);
  if (!prepared?.identity || !prepared.recoveryPrivateKeyJwk) {
    throw createDmE2eeSetupError(
      "local_private_key_corrupt",
      "The legacy Vault identity could not be prepared for secure migration."
    );
  }
  try {
    const activeKeyRow = await fetchActiveKeyRowForUser(uid, { force: true });
    if (activeKeyRow && !publicKeysMatch(activeKeyRow.publicKeyJwk, prepared.identity.publicKeyJwk)) {
      throw createDmE2eeSetupError(
        "local_private_key_corrupt",
        "The legacy Vault identity does not match the active public identity."
      );
    }
    const backup = await persistIdentityBackupFromPrivateJwk({
      identity: prepared.identity,
      privateKeyJwk: prepared.recoveryPrivateKeyJwk,
      password,
      passwordSource,
      includeRecoveryKey,
    });
    prepared.recoveryPrivateKeyJwk = null;

    const persisted = await writeIdentityRecord(prepared.identity);
    const resolvedKeyRow = activeKeyRow || await upsertMyKeyRow(persisted.publicKeyJwk);
    const readyIdentity = await writeIdentityRecord({
      ...persisted,
      status: "ready",
      keyId: resolvedKeyRow.id,
      keyVersion: resolvedKeyRow.keyVersion,
      keyAlgorithm: resolvedKeyRow.keyAlgorithm,
      publicKeyJwk: resolvedKeyRow.publicKeyJwk,
    });
    return {
      ...readyIdentity,
      recoveryKey: String(backup?.recoveryKey || ""),
      backupCreated: !!backup,
      migrated: true,
    };
  } finally {
    if (prepared) prepared.recoveryPrivateKeyJwk = null;
    prepared = null;
  }
}

async function deriveBackupEncryptionKey(password, saltBytes, iterations = BACKUP_PBKDF2_ITERATIONS) {
  const normalizedIterations = Math.round(Number(iterations));
  if (
    !Number.isSafeInteger(normalizedIterations)
    || normalizedIterations < BACKUP_PBKDF2_MIN_ITERATIONS
    || normalizedIterations > BACKUP_PBKDF2_MAX_ITERATIONS
  ) {
    throw createBackupError("dm_e2ee_backup_invalid_kdf", "Vault Recovery KDF parameters are unsupported.");
  }
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

function decodeBackupField(value, { code, label, exactLength = 0, minLength = 0, maxLength = 0 } = {}) {
  const encoded = String(value || "").trim();
  if (!encoded || encoded.length > MAX_ENCODED_PRIVATE_KEY_LENGTH * 8 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw createBackupError(code || "dm_e2ee_backup_invalid_payload", `${label || "Vault Recovery data"} is invalid.`);
  }
  let bytes = null;
  try {
    bytes = base64UrlToBytes(encoded);
  } catch (_) {
    throw createBackupError(code || "dm_e2ee_backup_invalid_payload", `${label || "Vault Recovery data"} is invalid.`);
  }
  if (
    (exactLength && bytes.length !== exactLength)
    || (minLength && bytes.length < minLength)
    || (maxLength && bytes.length > maxLength)
  ) {
    bytes.fill(0);
    throw createBackupError(code || "dm_e2ee_backup_invalid_payload", `${label || "Vault Recovery data"} is invalid.`);
  }
  return bytes;
}

function validateBackupEnvelope(backupRow = null) {
  if (!backupRow || backupRow.backupVersion !== DM_E2EE_BACKUP_VERSION) {
    throw createBackupError("dm_e2ee_backup_unsupported_version", "This Vault Recovery backup version is unsupported.");
  }
  if (String(backupRow.keyAlgorithm || "") !== KEY_ALGORITHM) {
    throw createBackupError("dm_e2ee_backup_invalid_algorithm", "This Vault Recovery key algorithm is unsupported.");
  }
  if (String(backupRow.kdfAlgorithm || "") !== BACKUP_KDF_ALGORITHM) {
    throw createBackupError("dm_e2ee_backup_invalid_kdf", "This Vault Recovery KDF is unsupported.");
  }
  if (String(backupRow.cipherAlg || "") !== BACKUP_CIPHER_ALGORITHM) {
    throw createBackupError("dm_e2ee_backup_invalid_cipher", "This Vault Recovery cipher is unsupported.");
  }
  const iterations = Math.round(Number(backupRow.kdfIterations));
  if (
    !Number.isSafeInteger(iterations)
    || iterations < BACKUP_PBKDF2_MIN_ITERATIONS
    || iterations > BACKUP_PBKDF2_MAX_ITERATIONS
  ) {
    throw createBackupError("dm_e2ee_backup_invalid_kdf", "Vault Recovery KDF parameters are unsupported.");
  }
  const salt = decodeBackupField(backupRow.kdfSalt, {
    code: "dm_e2ee_backup_invalid_kdf",
    label: "Vault Recovery salt",
    exactLength: 16,
  });
  const iv = decodeBackupField(backupRow.cipherIv, {
    code: "dm_e2ee_backup_invalid_cipher",
    label: "Vault Recovery IV",
    exactLength: 12,
  });
  const ciphertext = decodeBackupField(backupRow.encryptedPrivateKey, {
    code: "dm_e2ee_backup_invalid_payload",
    label: "Vault Recovery ciphertext",
    minLength: 17,
    maxLength: 65536,
  });
  return { iterations, salt, iv, ciphertext };
}

async function encryptBackupPlaintextWithCredential({
  userId,
  credential,
  backupPlaintext,
  method = DM_E2EE_BACKUP_METHOD_PASSWORD,
} = {}) {
  const uid = normalizeId(userId);
  const rawCredential = String(credential ?? "");
  if (!uid || !rawCredential) {
    throw createBackupError("dm_e2ee_backup_credential_required", "A Vault Recovery credential is required.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveBackupEncryptionKey(rawCredential, salt, BACKUP_PBKDF2_ITERATIONS);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: buildBackupAad(uid, DM_E2EE_BACKUP_VERSION),
      tagLength: 128,
    },
    aesKey,
    backupPlaintext
  );
  return {
    method: normalizeBackupMethod(method),
    kdf: BACKUP_KDF_ALGORITHM,
    kdf_salt: bytesToBase64Url(salt),
    kdf_iterations: BACKUP_PBKDF2_ITERATIONS,
    encryption_alg: BACKUP_CIPHER_ALGORITHM,
    encryption_iv: bytesToBase64Url(iv),
    encrypted_private_key: bytesToBase64Url(new Uint8Array(ciphertextBuffer)),
  };
}

function buildIdentityBackupPlaintext(identity = {}, privateKeyJwk = null) {
  const normalizedPrivateKeyJwk = normalizePrivateKeyJwk(privateKeyJwk);
  const publicKeyJwk = normalizePublicKeyJwk(identity.publicKeyJwk || normalizedPrivateKeyJwk);
  if (!normalizedPrivateKeyJwk || !publicKeyJwk || !publicKeysMatch(normalizedPrivateKeyJwk, publicKeyJwk)) {
    throw createBackupError("dm_e2ee_backup_invalid_identity", "The Vault identity cannot be prepared for recovery.");
  }
  return encoder.encode(JSON.stringify({
    backupVersion: DM_E2EE_BACKUP_VERSION,
    privateKeyJwk: normalizedPrivateKeyJwk,
    publicKeyJwk,
    keyId: normalizeId(identity.keyId || ""),
    keyVersion: Number(identity.keyVersion || 1) || 1,
    keyAlgorithm: String(identity.keyAlgorithm || KEY_ALGORITHM).trim() || KEY_ALGORITHM,
    createdAt: new Date().toISOString(),
  }));
}

async function persistIdentityBackupFromPrivateJwk({
  identity,
  privateKeyJwk,
  password,
  passwordSource = DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL,
  includeRecoveryKey = null,
} = {}) {
  const uid = normalizeId(identity?.userId || "");
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

  let backupPlaintext = null;
  let passwordEncrypted = null;
  let recoveryKeyEncrypted = null;
  const shouldCreateRecoveryKey = includeRecoveryKey === null
    ? resolvedPasswordSource === DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL
    : includeRecoveryKey === true;
  const generatedRecoveryKey = shouldCreateRecoveryKey ? generateDmE2eeRecoveryKey() : "";
  try {
    backupPlaintext = buildIdentityBackupPlaintext(identity, privateKeyJwk);
    passwordEncrypted = await encryptBackupPlaintextWithCredential({
      userId: uid,
      credential: rawPassword,
      backupPlaintext,
      method: DM_E2EE_BACKUP_METHOD_PASSWORD,
    });
    recoveryKeyEncrypted = generatedRecoveryKey
      ? await encryptBackupPlaintextWithCredential({
        userId: uid,
        credential: generatedRecoveryKey,
        backupPlaintext,
        method: DM_E2EE_BACKUP_METHOD_RECOVERY_KEY,
      })
      : null;
  } finally {
    backupPlaintext?.fill(0);
    backupPlaintext = null;
  }

  const nowIso = new Date().toISOString();
  const methodPayloads = [
    {
      user_id: uid,
      backup_version: DM_E2EE_BACKUP_VERSION,
      ...passwordEncrypted,
      updated_at: nowIso,
    },
    ...(recoveryKeyEncrypted
      ? [{
        user_id: uid,
        backup_version: DM_E2EE_BACKUP_VERSION,
        ...recoveryKeyEncrypted,
        updated_at: nowIso,
      }]
      : []),
  ];

  const { data: methodData, error: methodError } = await supabase
    .from(BACKUP_METHODS_TABLE)
    .upsert(methodPayloads, { onConflict: "user_id,method,backup_version" })
    .select(BACKUP_METHOD_SELECT_COLUMNS);
  if (methodError) throw methodError;
  const methodRows = (Array.isArray(methodData) ? methodData : [])
    .map((row) => normalizeBackupMethodRow(row))
    .filter(Boolean);
  keyBackupMethodsCacheByUserId.set(uid, methodRows);

  const payload = {
    user_id: uid,
    backup_version: DM_E2EE_BACKUP_VERSION,
    key_algorithm: String(identity.keyAlgorithm || KEY_ALGORITHM).trim() || KEY_ALGORITHM,
    encrypted_private_key: passwordEncrypted.encrypted_private_key,
    kdf: passwordEncrypted.kdf,
    kdf_salt: passwordEncrypted.kdf_salt,
    kdf_iterations: passwordEncrypted.kdf_iterations,
    encryption_alg: passwordEncrypted.encryption_alg,
    encryption_iv: passwordEncrypted.encryption_iv,
    recovery_hint: resolvedPasswordSource === DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL ? "Manual sync password" : "Account password",
    updated_at: nowIso,
  };
  const { data, error } = await supabase
    .from(BACKUP_TABLE)
    .upsert(payload, { onConflict: "user_id,backup_version" })
    .select(BACKUP_SELECT_COLUMNS)
    .single();
  if (error) throw error;

  const row = normalizeBackupRow(data);
  if (row) {
    row.hasPasswordMethod = true;
    row.hasRecoveryKeyMethod = methodRows.some((methodRow) => methodRow.method === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY);
    row.methods = methodRows.map((methodRow) => methodRow.method);
    if (generatedRecoveryKey) row.recoveryKey = generatedRecoveryKey;
  }
  keyBackupCacheByUserId.set(uid, row || null);
  return row;
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
      .select(BACKUP_SELECT_COLUMNS)
      .eq("user_id", uid)
      .eq("backup_version", DM_E2EE_BACKUP_VERSION)
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

async function fetchOwnBackupMethodRows(userId, { force = false } = {}) {
  const uid = normalizeId(userId);
  if (!uid) return [];
  if (!force && keyBackupMethodsCacheByUserId.has(uid)) {
    return keyBackupMethodsCacheByUserId.get(uid) || [];
  }
  const { data, error } = await supabase
    .from(BACKUP_METHODS_TABLE)
    .select(BACKUP_METHOD_SELECT_COLUMNS)
    .eq("user_id", uid)
    .eq("backup_version", DM_E2EE_BACKUP_VERSION);
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : [])
    .map((row) => normalizeBackupMethodRow(row))
    .filter(Boolean);
  keyBackupMethodsCacheByUserId.set(uid, rows);
  return rows;
}

async function fetchOwnBackupMethodRow(userId, method = DM_E2EE_BACKUP_METHOD_PASSWORD, { force = false } = {}) {
  const wantedMethod = normalizeBackupMethod(method);
  const rows = await fetchOwnBackupMethodRows(userId, { force });
  return rows.find((row) => row.method === wantedMethod) || null;
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
  if (!normalizePublicKeyJwk(publicKeyJwk)) {
    throw createDmE2eeSetupError("invalid_public_key", "Invalid DM public key.");
  }
  const { data, error } = await supabase.rpc("upsert_my_dm_e2ee_key", {
    p_public_key_jwk: publicKeyJwk,
    p_key_algorithm: KEY_ALGORITHM,
  });
  if (error) throw createDmE2eeSetupError("public_key_upload_failed", "Could not upload the DM public key.", error);
  const row = normalizeKeyRow(Array.isArray(data) ? data[0] : data);
  if (!row) throw createDmE2eeSetupError("public_key_upload_failed", "Could not persist DM public key.");
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

export function generateDmE2eeRecoveryKey() {
  const totalChars = RECOVERY_KEY_GROUP_SIZE * RECOVERY_KEY_GROUP_COUNT;
  const randomBytes = crypto.getRandomValues(new Uint8Array(totalChars));
  let body = "";
  for (let i = 0; i < randomBytes.length; i += 1) {
    body += RECOVERY_KEY_ALPHABET[randomBytes[i] & 31];
  }
  const groups = [];
  for (let i = 0; i < body.length; i += RECOVERY_KEY_GROUP_SIZE) {
    groups.push(body.slice(i, i + RECOVERY_KEY_GROUP_SIZE));
  }
  return `${RECOVERY_KEY_PREFIX}-${groups.join("-")}`;
}

export function normalizeDmE2eeRecoveryKeyInput(value = "") {
  const compact = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const prefix = RECOVERY_KEY_PREFIX;
  const body = compact.startsWith(prefix) ? compact.slice(prefix.length) : compact;
  const expectedLength = RECOVERY_KEY_GROUP_SIZE * RECOVERY_KEY_GROUP_COUNT;
  if (body.length !== expectedLength) return "";
  for (let i = 0; i < body.length; i += 1) {
    if (!RECOVERY_KEY_ALPHABET.includes(body[i])) return "";
  }
  const groups = [];
  for (let i = 0; i < body.length; i += RECOVERY_KEY_GROUP_SIZE) {
    groups.push(body.slice(i, i + RECOVERY_KEY_GROUP_SIZE));
  }
  return `${prefix}-${groups.join("-")}`;
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
    content: "Vault message unavailable on this device.",
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
      if (remoteKeyRow && !publicKeysMatch(remoteKeyRow.publicKeyJwk, localIdentity.publicKeyJwk)) {
        throw createDmE2eeSetupError(
          "local_private_key_corrupt",
          "The local Vault identity does not match the active public identity."
        );
      }
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
    if (String(error?.code || error?.reason || "") === "dm_e2ee_recovery_required") {
      return {
        status: "migration_requires_recovery",
        userId: uid,
        hasLocalPrivateKey: false,
        localPrivateKeyExportable: false,
        hasRemotePublicKey: false,
        error,
      };
    }
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
  if (cached?.status === "ready" && isCryptoKey(cached.privateKey)) return cached;

  let localIdentity = null;
  try {
    localIdentity = await readIdentityRecord(uid);
  } catch (error) {
    if (String(error?.code || error?.reason || "") === "dm_e2ee_recovery_required") {
      return { status: "migration_requires_recovery", userId: uid, error };
    }
    return { status: "error", userId: uid, error };
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
    if (remoteKeyRow && !publicKeysMatch(remoteKeyRow.publicKeyJwk, localIdentity.publicKeyJwk)) {
      return {
        status: "error",
        userId: uid,
        error: createDmE2eeSetupError(
          "local_private_key_corrupt",
          "The local Vault identity does not match the active public identity."
        ),
      };
    }
    if (!remoteKeyRow) {
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

  return {
    status: "not_initialized",
    userId: uid,
    keyId: "",
    keyVersion: 0,
    keyAlgorithm: KEY_ALGORITHM,
    publicKeyJwk: null,
  };
}

export async function setupDmE2eeIdentityForCurrentDevice({
  userId,
  forceNew = false,
  backupPassword = "",
  passwordSource = DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL,
  includeRecoveryKey = true,
} = {}) {
  const uid = normalizeId(userId);
  if (!uid) return { status: "error", error: new Error("Missing userId for DM E2EE setup") };
  if (forceNew) {
    return {
      status: "error",
      error: createDmE2eeSetupError(
        "explicit_identity_reset_required",
        "Vault identity replacement requires the separate confirmed reset flow."
      ),
    };
  }

  let localIdentity = null;
  try {
    localIdentity = await readIdentityRecord(uid);
  } catch (error) {
    if (String(error?.code || error?.reason || "") === "dm_e2ee_recovery_required") {
      try {
        return await migrateLegacyIdentityWithRecovery({
          userId: uid,
          password: backupPassword,
          passwordSource,
          includeRecoveryKey,
        });
      } catch (migrationError) {
        return { status: "error", userId: uid, error: migrationError };
      }
    }
    return { status: "error", userId: uid, error };
  }

  const remoteKeyRow = await fetchActiveKeyRowForUser(uid, { force: true });
  if (localIdentity) {
    if (remoteKeyRow && !publicKeysMatch(remoteKeyRow.publicKeyJwk, localIdentity.publicKeyJwk)) {
      return {
        status: "error",
        userId: uid,
        error: createDmE2eeSetupError(
          "local_private_key_corrupt",
          "The local Vault identity does not match the active public identity."
        ),
      };
    }
    const keyRow = remoteKeyRow || await upsertMyKeyRow(localIdentity.publicKeyJwk);
    return writeIdentityRecord({
      ...localIdentity,
      status: "ready",
      keyId: keyRow.id,
      keyVersion: keyRow.keyVersion,
      keyAlgorithm: keyRow.keyAlgorithm,
      publicKeyJwk: keyRow.publicKeyJwk,
    });
  }

  const backupMeta = await getDmE2eeKeyBackupMetadata({ userId: uid, force: true });
  if (remoteKeyRow || backupMeta) {
    return {
      status: "missing_local_private",
      userId: uid,
      keyId: remoteKeyRow?.id || "",
      keyVersion: remoteKeyRow?.keyVersion || backupMeta?.keyVersion || 1,
      keyAlgorithm: remoteKeyRow?.keyAlgorithm || backupMeta?.keyAlgorithm || KEY_ALGORITHM,
      publicKeyJwk: remoteKeyRow?.publicKeyJwk || backupMeta?.publicKeyJwk || null,
    };
  }

  try {
    return await provisionNewIdentityWithRecovery({
      userId: uid,
      password: backupPassword,
      passwordSource,
      includeRecoveryKey,
    });
  } catch (error) {
    return { status: "error", userId: uid, error };
  }
}

export async function getActiveDmE2eePeerKey(userId, { force = false } = {}) {
  return fetchActiveKeyRowForUser(userId, { force });
}

export async function getDmE2eeKeyBackupMetadata({ userId, force = false } = {}) {
  const uid = normalizeId(userId);
  let methodRows = [];
  let methodsError = null;
  try {
    methodRows = await fetchOwnBackupMethodRows(uid, { force });
  } catch (error) {
    methodsError = error;
  }
  const passwordMethod = methodRows.find((row) => row.method === DM_E2EE_BACKUP_METHOD_PASSWORD) || null;
  const recoveryKeyMethod = methodRows.find((row) => row.method === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY) || null;
  const legacyRow = await fetchOwnBackupRow(uid, { force }).catch((error) => {
    if (!methodsError) throw error;
    return null;
  });
  if (methodsError && !legacyRow) throw methodsError;
  const row = passwordMethod || recoveryKeyMethod || legacyRow || null;
  if (row) {
    row.hasPasswordMethod = !!passwordMethod || !!legacyRow;
    row.hasRecoveryKeyMethod = !!recoveryKeyMethod;
    row.methodStorageError = methodsError || null;
    row.methods = methodRows.map((methodRow) => methodRow.method);
  }
  logDmE2ee("backup_metadata_checked", {
    userId: uid,
    found: !!row,
    hasRecoveryKeyMethod: !!recoveryKeyMethod,
    force: !!force,
  });
  return row;
}

export async function createDmE2eeKeyBackup({
  userId,
  password,
  passwordSource = DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL,
  includeRecoveryKey = null,
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

  let privateKeyJwk = normalizePrivateKeyJwk(await crypto.subtle.exportKey("jwk", identity.privateKey));
  if (!privateKeyJwk) {
    throw createBackupError(
      "dm_e2ee_backup_private_key_not_exportable",
      "Could not export the local Vault key for Vault Recovery."
    );
  }
  let row = null;
  try {
    row = await persistIdentityBackupFromPrivateJwk({
      identity,
      privateKeyJwk,
      password: rawPassword,
      passwordSource: resolvedPasswordSource,
      includeRecoveryKey,
    });
    const hardenedPrivateKey = await crypto.subtle.importKey(
      "jwk",
      privateKeyJwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"]
    );
    await writeIdentityRecord({ ...identity, privateKey: hardenedPrivateKey });
    return row;
  } finally {
    privateKeyJwk = null;
  }
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
    || identityState?.status === "not_initialized"
    || identityState?.status === "migration_requires_recovery";

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
      action: "noop_protected_identity",
      hadBackup: !!backupMeta,
      hadLocalKey: true,
    };
  }

  if (identityState?.status === "migration_requires_recovery") {
    try {
      const migratedIdentity = await setupDmE2eeIdentityForCurrentDevice({
        userId: uid,
        backupPassword: rawPassword,
        passwordSource: DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN,
        includeRecoveryKey: false,
      });
      if (migratedIdentity?.status !== "ready") {
        throw migratedIdentity?.error || createBackupError(
          "dm_e2ee_identity_not_ready_after_migration",
          "Could not securely migrate the Vault identity for this account."
        );
      }
      return {
        action: "migrated_identity_and_created_backup",
        hadBackup: false,
        hadLocalKey: true,
        backupPasswordSource: DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN,
      };
    } catch (error) {
      return {
        action: "migration_failed",
        hadBackup: false,
        hadLocalKey: true,
        error,
      };
    }
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
      const createdIdentity = await setupDmE2eeIdentityForCurrentDevice({
        userId: uid,
        backupPassword: rawPassword,
        passwordSource: DM_E2EE_BACKUP_PASSWORD_SOURCE_ACCOUNT_LOGIN,
        includeRecoveryKey: false,
      });
      if (createdIdentity?.status !== "ready") {
        throw createdIdentity?.error || createBackupError(
          "dm_e2ee_identity_not_ready_after_create",
          "Could not initialize the Vault identity for this account."
        );
      }
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

export async function rewrapDmE2eeKeyBackup({
  userId,
  currentPassword = "",
  currentRecoveryKey = "",
  currentMethod = "",
  newPassword,
  passwordSource = DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL,
  includeRecoveryKey = true,
} = {}) {
  const uid = normalizeId(userId);
  const resolvedCurrentMethod = normalizeBackupMethod(
    currentMethod
    || (String(currentRecoveryKey || "").trim() ? DM_E2EE_BACKUP_METHOD_RECOVERY_KEY : DM_E2EE_BACKUP_METHOD_PASSWORD)
  );
  const normalizedCurrentRecoveryKey = normalizeDmE2eeRecoveryKeyInput(currentRecoveryKey);
  const currentCredential = resolvedCurrentMethod === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY
    ? normalizedCurrentRecoveryKey
    : String(currentPassword ?? "");
  const nextPassword = String(newPassword ?? "");
  const resolvedPasswordSource = normalizeBackupPasswordSource(passwordSource)
    || DM_E2EE_BACKUP_PASSWORD_SOURCE_MANUAL;
  const minPasswordLength = resolveBackupPasswordMinLength(resolvedPasswordSource);
  if (!uid) throw createBackupError("dm_e2ee_backup_missing_user", "Missing userId for Vault Recovery update.");
  if (!currentCredential) {
    throw createBackupError(
      resolvedCurrentMethod === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY
        ? "dm_e2ee_backup_recovery_key_required"
        : "dm_e2ee_backup_password_required",
      "Your current Vault Recovery credential is required."
    );
  }
  if (nextPassword.length < minPasswordLength) {
    throw createBackupError(
      "dm_e2ee_backup_password_too_short",
      `Backup password must be at least ${minPasswordLength} characters long.`
    );
  }

  const identity = await ensureDmE2eeIdentity({ userId: uid });
  if (identity?.status !== "ready") {
    throw createBackupError("dm_e2ee_backup_identity_unavailable", "The local Vault identity is unavailable.");
  }

  let plaintextBytes = null;
  let backupPayload = null;
  let privateKeyJwk = null;
  let envelope = null;
  try {
    let backupRow = null;
    if (resolvedCurrentMethod === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY) {
      backupRow = await fetchOwnBackupMethodRow(uid, DM_E2EE_BACKUP_METHOD_RECOVERY_KEY, { force: true });
    } else {
      backupRow = await fetchOwnBackupMethodRow(uid, DM_E2EE_BACKUP_METHOD_PASSWORD, { force: true }).catch(() => null);
      if (!backupRow) backupRow = await fetchOwnBackupRow(uid, { force: true });
    }
    if (!backupRow) {
      throw createBackupError("dm_e2ee_backup_missing", "No Vault Recovery backup was found for this account.");
    }

    envelope = validateBackupEnvelope(backupRow);
    const aesKey = await deriveBackupEncryptionKey(currentCredential, envelope.salt, envelope.iterations);
    try {
      const plaintextBuffer = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: envelope.iv,
          additionalData: buildBackupAad(uid, backupRow.backupVersion),
          tagLength: 128,
        },
        aesKey,
        envelope.ciphertext
      );
      plaintextBytes = new Uint8Array(plaintextBuffer);
    } catch (_) {
      throw createBackupError("dm_e2ee_backup_bad_password", "Could not decrypt the Vault Recovery backup with that credential.");
    }

    try {
      backupPayload = JSON.parse(decoder.decode(plaintextBytes));
    } catch (_) {
      backupPayload = null;
    }
    if (
      backupPayload
      && backupPayload.backupVersion !== undefined
      && Number(backupPayload.backupVersion) !== DM_E2EE_BACKUP_VERSION
    ) {
      throw createBackupError("dm_e2ee_backup_unsupported_version", "This Vault Recovery payload version is unsupported.");
    }
    if (backupPayload?.keyAlgorithm && String(backupPayload.keyAlgorithm) !== KEY_ALGORITHM) {
      throw createBackupError("dm_e2ee_backup_invalid_algorithm", "This Vault Recovery key algorithm is unsupported.");
    }

    privateKeyJwk = normalizePrivateKeyJwk(backupPayload?.privateKeyJwk || backupPayload?.private_key_jwk || null);
    let publicKeyJwk = normalizePublicKeyJwk(
      backupPayload?.publicKeyJwk
      || backupPayload?.public_key_jwk
      || privateKeyJwk
      || backupRow.publicKeyJwk
      || null
    );
    let verificationPrivateKey = null;
    if (privateKeyJwk) {
      if (!publicKeyJwk || !publicKeysMatch(privateKeyJwk, publicKeyJwk)) {
        throw createBackupError("dm_e2ee_backup_identity_mismatch", "The Vault Recovery private key does not match its public identity.");
      }
      verificationPrivateKey = await crypto.subtle.importKey(
        "jwk",
        privateKeyJwk,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveBits"]
      );
    } else if (!backupPayload) {
      const transientPrivateKey = await crypto.subtle.importKey(
        "pkcs8",
        plaintextBytes,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"]
      );
      privateKeyJwk = normalizePrivateKeyJwk(await crypto.subtle.exportKey("jwk", transientPrivateKey));
      publicKeyJwk = normalizePublicKeyJwk(privateKeyJwk);
      if (!privateKeyJwk || !publicKeyJwk) {
        throw createBackupError("dm_e2ee_backup_invalid_payload", "The Vault Recovery backup is missing its public identity.");
      }
      verificationPrivateKey = await crypto.subtle.importKey(
        "jwk",
        privateKeyJwk,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveBits"]
      );
    } else {
      throw createBackupError("dm_e2ee_backup_invalid_payload", "The Vault Recovery backup is missing its private key.");
    }

    await verifyIdentityKeyPair(verificationPrivateKey, publicKeyJwk);
    if (!publicKeysMatch(identity.publicKeyJwk, publicKeyJwk)) {
      throw createBackupError("dm_e2ee_backup_identity_mismatch", "This Vault Recovery backup does not match the local protected identity.");
    }
    const activeKeyRow = await fetchActiveKeyRowForUser(uid, { force: true });
    if (activeKeyRow && !publicKeysMatch(activeKeyRow.publicKeyJwk, publicKeyJwk)) {
      throw createBackupError("dm_e2ee_backup_identity_mismatch", "This Vault Recovery backup does not match the active account identity.");
    }

    const row = await persistIdentityBackupFromPrivateJwk({
      identity,
      privateKeyJwk,
      password: nextPassword,
      passwordSource: resolvedPasswordSource,
      includeRecoveryKey,
    });
    logDmE2ee("backup_rewrapped", {
      userId: uid,
      method: resolvedCurrentMethod,
      keyVersion: Number(identity.keyVersion || 0) || 0,
    });
    return row;
  } finally {
    plaintextBytes?.fill(0);
    envelope?.salt?.fill(0);
    envelope?.iv?.fill(0);
    envelope?.ciphertext?.fill(0);
    backupPayload = null;
    privateKeyJwk = null;
  }
}

export async function restoreDmE2eeKeyBackup({
  userId,
  password,
  recoveryKey = "",
  method = "",
} = {}) {
  const uid = normalizeId(userId);
  const rawPassword = String(password ?? "");
  const restoreMethod = normalizeBackupMethod(method || (String(recoveryKey || "").trim() ? DM_E2EE_BACKUP_METHOD_RECOVERY_KEY : DM_E2EE_BACKUP_METHOD_PASSWORD));
  const rawRecoveryKey = normalizeDmE2eeRecoveryKeyInput(recoveryKey || (restoreMethod === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY ? rawPassword : ""));
  const restoreCredential = restoreMethod === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY ? rawRecoveryKey : rawPassword;
  if (!uid) throw createBackupError("dm_e2ee_backup_missing_user", "Missing userId for DM key restore.");
  if (!restoreCredential) {
    throw createBackupError(
      restoreMethod === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY ? "dm_e2ee_backup_recovery_key_required" : "dm_e2ee_backup_password_required",
      restoreMethod === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY ? "Recovery Key is required." : "Backup password is required."
    );
  }

  try {
    let backupRow = null;
    if (restoreMethod === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY) {
      backupRow = await fetchOwnBackupMethodRow(uid, DM_E2EE_BACKUP_METHOD_RECOVERY_KEY, { force: true });
    } else {
      backupRow = await fetchOwnBackupMethodRow(uid, DM_E2EE_BACKUP_METHOD_PASSWORD, { force: true })
        .catch(() => null);
      if (!backupRow) backupRow = await fetchOwnBackupRow(uid, { force: true });
    }
    if (!backupRow) {
      throw createBackupError(
        restoreMethod === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY ? "dm_e2ee_backup_recovery_key_missing" : "dm_e2ee_backup_missing",
        restoreMethod === DM_E2EE_BACKUP_METHOD_RECOVERY_KEY
          ? "No Recovery Key backup was found for this account."
          : "No Vault Recovery backup was found for this account."
      );
    }
    logDmE2ee("restore_started", {
      userId: uid,
      backupFound: true,
      method: restoreMethod,
      keyVersion: backupRow.keyVersion,
    });

    const envelope = validateBackupEnvelope(backupRow);
    let plaintextBytes = null;
    let backupPayload = null;
    let privateKeyJwk = null;
    try {
      const aesKey = await deriveBackupEncryptionKey(restoreCredential, envelope.salt, envelope.iterations);
      try {
        const plaintextBuffer = await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: envelope.iv,
            additionalData: buildBackupAad(uid, backupRow.backupVersion),
            tagLength: 128,
          },
          aesKey,
          envelope.ciphertext
        );
        plaintextBytes = new Uint8Array(plaintextBuffer);
      } catch (_) {
        throw createBackupError("dm_e2ee_backup_bad_password", "Could not decrypt the DM key backup with that credential.");
      }

      try {
        backupPayload = JSON.parse(decoder.decode(plaintextBytes));
      } catch (_) {
        backupPayload = null;
      }
      if (
        backupPayload
        && backupPayload.backupVersion !== undefined
        && Number(backupPayload.backupVersion) !== DM_E2EE_BACKUP_VERSION
      ) {
        throw createBackupError("dm_e2ee_backup_unsupported_version", "This Vault Recovery payload version is unsupported.");
      }
      if (
        backupPayload?.keyAlgorithm
        && String(backupPayload.keyAlgorithm) !== KEY_ALGORITHM
      ) {
        throw createBackupError("dm_e2ee_backup_invalid_algorithm", "This Vault Recovery key algorithm is unsupported.");
      }

      privateKeyJwk = normalizePrivateKeyJwk(backupPayload?.privateKeyJwk || backupPayload?.private_key_jwk || null);
      let publicKeyJwk = normalizePublicKeyJwk(
        backupPayload?.publicKeyJwk
        || backupPayload?.public_key_jwk
        || privateKeyJwk
        || backupRow.publicKeyJwk
        || null
      );
      let privateKey = null;
      if (privateKeyJwk) {
        if (!publicKeyJwk || !publicKeysMatch(privateKeyJwk, publicKeyJwk)) {
          throw createBackupError("dm_e2ee_backup_identity_mismatch", "The Vault Recovery private key does not match its public identity.");
        }
        privateKey = await crypto.subtle.importKey(
          "jwk",
          privateKeyJwk,
          { name: "ECDH", namedCurve: "P-256" },
          false,
          ["deriveBits"]
        );
      } else if (!backupPayload) {
        const transientPrivateKey = await crypto.subtle.importKey(
          "pkcs8",
          plaintextBytes,
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveBits"]
        );
        privateKeyJwk = normalizePrivateKeyJwk(await crypto.subtle.exportKey("jwk", transientPrivateKey));
        publicKeyJwk = normalizePublicKeyJwk(privateKeyJwk);
        if (!privateKeyJwk || !publicKeyJwk) {
          throw createBackupError("dm_e2ee_backup_invalid_payload", "The Vault Recovery backup is missing its public identity.");
        }
        privateKey = await crypto.subtle.importKey(
          "jwk",
          privateKeyJwk,
          { name: "ECDH", namedCurve: "P-256" },
          false,
          ["deriveBits"]
        );
      } else {
        throw createBackupError("dm_e2ee_backup_invalid_payload", "The Vault Recovery backup is missing its private key.");
      }
      await verifyIdentityKeyPair(privateKey, publicKeyJwk);

      const activeKeyRow = await fetchActiveKeyRowForUser(uid, { force: true });
      if (activeKeyRow && !publicKeysMatch(activeKeyRow.publicKeyJwk, publicKeyJwk)) {
        throw createBackupError(
          "dm_e2ee_backup_identity_mismatch",
          "This Vault Recovery backup does not match the active account identity."
        );
      }

      let persistedIdentity = await writeIdentityRecord({
        userId: uid,
        keyId: normalizeId(activeKeyRow?.id || ""),
        keyVersion: Number(activeKeyRow?.keyVersion || backupPayload?.keyVersion || backupPayload?.key_version || backupRow.keyVersion || 1) || 1,
        keyAlgorithm: KEY_ALGORITHM,
        publicKeyJwk,
        privateKey,
      });
      const resolvedKeyRow = activeKeyRow || await upsertMyKeyRow(publicKeyJwk);
      if (!activeKeyRow) {
        persistedIdentity = await writeIdentityRecord({
          ...persistedIdentity,
          keyId: resolvedKeyRow.id,
          keyVersion: resolvedKeyRow.keyVersion,
          keyAlgorithm: resolvedKeyRow.keyAlgorithm,
          publicKeyJwk: resolvedKeyRow.publicKeyJwk,
        });
      }
      logDmE2ee("local_key_persisted", {
        userId: uid,
        keyVersion: Number(persistedIdentity?.keyVersion || 0) || 0,
      });
      keyBackupCacheByUserId.set(uid, backupRow);
      logDmE2ee("restore_succeeded", {
        userId: uid,
        method: restoreMethod,
        keyVersion: persistedIdentity.keyVersion,
      });
      return persistedIdentity;
    } finally {
      plaintextBytes?.fill(0);
      envelope.salt.fill(0);
      envelope.iv.fill(0);
      envelope.ciphertext.fill(0);
      backupPayload = null;
      privateKeyJwk = null;
    }
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
    throw new Error("Vault payload missing conversation or participant ids.");
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
    throw new Error("The recipient has not finished setting up Vault yet.");
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
