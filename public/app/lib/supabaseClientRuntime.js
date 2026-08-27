const APPLICATION_CLIENT_REGISTRY = Symbol.for("altara.supabase.application-client-registry.v1");

function resolveRegistry(scope = globalThis) {
  const root = scope && (typeof scope === "object" || typeof scope === "function")
    ? scope
    : globalThis;
  if (!root[APPLICATION_CLIENT_REGISTRY]) {
    Object.defineProperty(root, APPLICATION_CLIENT_REGISTRY, {
      configurable: false,
      enumerable: false,
      value: {
        nextId: 0,
        clients: [],
      },
      writable: false,
    });
  }
  return root[APPLICATION_CLIENT_REGISTRY];
}

export function registerApplicationSupabaseClient(client, {
  scope = globalThis,
  now = () => Date.now(),
} = {}) {
  if (!client || typeof client.channel !== "function") {
    throw new TypeError("application Supabase client registration requires a client");
  }
  const registry = resolveRegistry(scope);
  const existing = registry.clients.find((entry) => entry.client === client);
  if (existing) return { ...existing, client: undefined };
  if (registry.clients.length > 0) {
    throw new Error("ALTARA renderer attempted to create more than one application Supabase client");
  }
  const createdAt = Number(now()) || Date.now();
  const entry = {
    client,
    clientId: `altara-supabase-client-${++registry.nextId}`,
    createdAt,
  };
  registry.clients.push(entry);
  return {
    clientId: entry.clientId,
    createdAt: entry.createdAt,
  };
}

export function getApplicationSupabaseClientRegistrySnapshot({ scope = globalThis } = {}) {
  const registry = resolveRegistry(scope);
  return {
    applicationClientCount: registry.clients.length,
    clientIds: registry.clients.map((entry) => entry.clientId),
    createdAt: registry.clients.map((entry) => entry.createdAt),
  };
}
