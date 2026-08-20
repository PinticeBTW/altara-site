const state = {
  keysByUser: new Map(),
  keysById: new Map(),
  backupsByUser: new Map(),
  methodsByUserAndMethod: new Map(),
  calls: [],
  sequence: 1,
};

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function id(prefix) {
  const value = `${prefix}-${state.sequence}`;
  state.sequence += 1;
  return value;
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

class Query {
  constructor(table) {
    this.table = table;
    this.filters = new Map();
    this.inFilters = new Map();
    this.operation = "select";
    this.payload = null;
  }

  select() { return this; }
  eq(key, value) { this.filters.set(key, value); return this; }
  is(key, value) { this.filters.set(key, value); return this; }
  in(key, values) { this.inFilters.set(key, Array.from(values || [])); return this; }
  order() { return this; }
  limit() { return this; }
  upsert(payload) { this.operation = "upsert"; this.payload = clone(payload); return this; }
  delete() { this.operation = "delete"; return this; }
  single() { return this.execute(true); }
  maybeSingle() { return this.execute(true); }
  then(resolve, reject) { return this.execute(false).then(resolve, reject); }

  async execute(single) {
    state.calls.push({ table: this.table, operation: this.operation });
    if (this.operation === "upsert") return this.executeUpsert(single);
    if (this.operation === "delete") return { data: null, error: null };
    let rows = [];
    if (this.table === "dm_e2ee_user_keys") {
      const userId = this.filters.get("user_id");
      if (userId) {
        const row = state.keysByUser.get(String(userId));
        if (row) rows.push(row);
      } else if (this.inFilters.has("id")) {
        for (const keyId of this.inFilters.get("id")) {
          const row = state.keysById.get(String(keyId));
          if (row) rows.push(row);
        }
      }
    } else if (this.table === "dm_e2ee_key_backups") {
      const row = state.backupsByUser.get(String(this.filters.get("user_id") || ""));
      if (row) rows.push(row);
    } else if (this.table === "dm_e2ee_key_backup_methods") {
      const userId = String(this.filters.get("user_id") || "");
      for (const row of state.methodsByUserAndMethod.values()) {
        if (row.user_id === userId) rows.push(row);
      }
    }
    const data = single ? (clone(rows[0]) || null) : clone(rows);
    return { data, error: null };
  }

  async executeUpsert(single) {
    const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
    const rows = [];
    for (const payload of payloads) {
      if (this.table === "dm_e2ee_key_backups") {
        const previous = state.backupsByUser.get(payload.user_id) || {};
        const row = {
          id: previous.id || id("backup"),
          created_at: previous.created_at || new Date().toISOString(),
          ...previous,
          ...clone(payload),
        };
        state.backupsByUser.set(row.user_id, row);
        rows.push(row);
      } else if (this.table === "dm_e2ee_key_backup_methods") {
        const key = `${payload.user_id}:${payload.method}`;
        const previous = state.methodsByUserAndMethod.get(key) || {};
        const row = {
          id: previous.id || id("method"),
          created_at: previous.created_at || new Date().toISOString(),
          ...previous,
          ...clone(payload),
        };
        state.methodsByUserAndMethod.set(key, row);
        rows.push(row);
      }
    }
    return { data: single ? (clone(rows[0]) || null) : clone(rows), error: null };
  }
}

export const supabase = {
  from(table) {
    return new Query(String(table));
  },
  async rpc(name, args = {}) {
    state.calls.push({ rpc: String(name) });
    if (name !== "upsert_my_dm_e2ee_key") {
      return { data: null, error: new Error(`Unexpected RPC: ${name}`) };
    }
    const userId = String(globalThis.__vaultCurrentUserId || "");
    if (!userId) return { data: null, error: new Error("Missing synthetic user context") };
    const previous = state.keysByUser.get(userId) || null;
    const row = {
      id: previous?.id || id("key"),
      user_id: userId,
      key_version: previous?.key_version || 1,
      key_algorithm: String(args.p_key_algorithm || "ECDH-P256"),
      public_key_jwk: clone(args.p_public_key_jwk),
      revoked_at: null,
      created_at: previous?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    state.keysByUser.set(userId, row);
    state.keysById.set(row.id, row);
    return { data: clone(row), error: null };
  },
};

export function getVaultTestServer() {
  return {
    reset() {
      state.keysByUser.clear();
      state.keysById.clear();
      state.backupsByUser.clear();
      state.methodsByUserAndMethod.clear();
      state.calls.length = 0;
      state.sequence = 1;
    },
    setCurrentUser(userId) {
      globalThis.__vaultCurrentUserId = String(userId || "");
    },
    getKey(userId) { return clone(state.keysByUser.get(String(userId)) || null); },
    setKey(userId, row) {
      const normalized = { ...clone(row), user_id: String(userId) };
      state.keysByUser.set(String(userId), normalized);
      if (normalized.id) state.keysById.set(normalized.id, normalized);
    },
    getBackup(userId) { return clone(state.backupsByUser.get(String(userId)) || null); },
    setBackup(userId, row) { state.backupsByUser.set(String(userId), { ...clone(row), user_id: String(userId) }); },
    getMethod(userId, method) { return clone(state.methodsByUserAndMethod.get(`${userId}:${method}`) || null); },
    setMethod(userId, method, row) {
      state.methodsByUserAndMethod.set(`${userId}:${method}`, {
        ...clone(row),
        user_id: String(userId),
        method: String(method),
      });
    },
    seedBackupMetadata(userId) {
      const row = {
        id: id("seed-backup"),
        user_id: String(userId),
        backup_version: 1,
        key_algorithm: "ECDH-P256",
        kdf: "PBKDF2-SHA256",
        kdf_salt: base64Url(new Uint8Array(16)),
        kdf_iterations: 600000,
        encrypted_private_key: base64Url(new Uint8Array(32)),
        encryption_iv: base64Url(new Uint8Array(12)),
        encryption_alg: "AES-GCM-256",
        recovery_hint: "Synthetic encrypted backup",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.backupsByUser.set(String(userId), row);
      return clone(row);
    },
    calls() { return clone(state.calls); },
  };
}
