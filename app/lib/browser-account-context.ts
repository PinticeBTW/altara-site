const REGISTRY_KEY = '__altara_accounts_v1';
const ACTIVE_KEY = '__altara_account_active_v1';
const ACCOUNT_PREFIX = '__altara_account_data:';
const validAccountId = (id: unknown): id is string => typeof id === 'string'
  && (id === 'default' || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id));

type ReadStorage = Pick<Storage, 'getItem'>;
type TabStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Match the app's per-tab account namespace, never its cached profile identity. */
export function resolveBrowserAccountContext(
  supabaseUrl: string,
  localStorage: ReadStorage,
  sessionStorage: TabStorage,
): { accountId: string; storageKey: string } | null {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const tabId = sessionStorage.getItem(ACTIVE_KEY);
    let accountId: string;
    if (raw === null) {
      // Preserve existing single-account sessions. A missing registry must not
      // redirect a previously selected additional account into the default one.
      if (tabId !== null && tabId !== 'default') return null;
      accountId = 'default';
    } else {
      if (raw.length > 65536) return null;
      const registry: unknown = JSON.parse(raw);
      if (!registry || typeof registry !== 'object') return null;
      const { version, activeId, accounts } = registry as Record<string, unknown>;
      if (version !== 1 || !Array.isArray(accounts) || accounts.length < 1 || accounts.length > 5
        || !validAccountId(activeId)) return null;
      const ids = new Set<string>();
      for (const account of accounts) {
        if (!account || typeof account !== 'object' || !validAccountId(account.id) || ids.has(account.id)) return null;
        ids.add(account.id);
      }
      if (!ids.has(activeId)) return null;
      // Like the app, an existing tab stays attached to its selected account.
      // A stale/corrupt selection signs this portal out instead of using someone else.
      if (tabId !== null && (!validAccountId(tabId) || !ids.has(tabId))) return null;
      accountId = tabId ?? activeId;
    }
    const legacyKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
    if (tabId === null) sessionStorage.setItem(ACTIVE_KEY, accountId);
    // Supabase derives its BroadcastChannel and PKCE keys from storageKey too.
    // Using the physical app key preserves those boundaries without copying tokens.
    return { accountId, storageKey: accountId === 'default' ? legacyKey : `${ACCOUNT_PREFIX}${accountId}:${legacyKey}` };
  } catch {
    // Unknown account/storage state must never fall back to a different session.
    return null;
  }
}
