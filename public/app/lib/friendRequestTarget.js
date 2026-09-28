// Preview and send share an account-scoped resolution. Keep the canonical spelling:
// the deployed send_friend_request(text) RPC still compares usernames exactly.
export function normalizeFriendUsername(value) {
  return typeof value === "string" ? value.trim().replace(/^@/, "").trim().toLowerCase() : "";
}

export function createFriendRequestTargetResolver({ getOwnerId, lookup }) {
  let owner = "";
  const cached = new Map();
  const pending = new Map();
  return async function resolve(value, { force = false } = {}) {
    const query = normalizeFriendUsername(value);
    const currentOwner = String(getOwnerId() || "");
    if (owner !== currentOwner) {
      owner = currentOwner;
      cached.clear();
      pending.clear();
    }
    if (!query || !currentOwner) return null;
    if (pending.has(query)) return pending.get(query);
    if (!force && cached.has(query)) return cached.get(query);
    const operation = Promise.resolve().then(() => lookup(query, { force })).then(profile => {
      if (String(getOwnerId() || "") !== currentOwner) throw Object.assign(new Error("Account changed"), { code: "friend_target_stale" });
      if (!profile?.id) return null;
      const username = String(profile.username || "").trim();
      if (normalizeFriendUsername(username) !== query) throw Object.assign(new Error("Profile changed"), { code: "friend_target_stale" });
      const target = Object.freeze({ ...profile, id: String(profile.id).trim(), username });
      if (cached.size >= 30) cached.delete(cached.keys().next().value);
      cached.set(query, target);
      return target;
    }).finally(() => { if (pending.get(query) === operation) pending.delete(query); });
    pending.set(query, operation);
    return operation;
  };
}

export function friendRequestErrorKey(error) {
  const code = String(error?.code || "").toLowerCase();
  const text = String(error?.message || error || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (code === "friend_target_stale") return "social.request.changed";
  if (/username.*(nao existe|not found)|user.*not found|profile_username_invalid/.test(text)) return "social.request.not_found";
  if (/para ti|ti proprio|yourself|self_request/.test(text)) return "social.request.self";
  if (/ja e amigo|already.friend/.test(text)) return "social.request.friend";
  if (code === "23505" || /ja existe pedido|already.pending/.test(text)) return "social.request.pending";
  if (/nao autenticado|not.authenticated|jwt|session/.test(text)) return "social.request.session";
  if (/bloquead|blocked|privacy|not.allowed|account_banned/.test(text) || code === "42501") return "social.request.restricted";
  if (/rate.limit|too.many/.test(text)) return "social.request.rate_limited";
  return "social.request.failed";
}
