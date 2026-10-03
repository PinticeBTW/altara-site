"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getSupabaseBrowserClient } from "@/app/lib/supabase-browser";
import { uploadViaTrustedAuthority } from "@/public/app/lib/trustedUploadClient.js";
import { BotImageEditor, type BotImageKind } from "./bot-image-editor";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function notifyBotMetadataChanged(userId: string, appId: string, botId: string) {
  if (!userId || !appId || !botId || typeof BroadcastChannel !== "function") return;
  try {
    const channel = new BroadcastChannel("altara:multi-session:v1");
    // Only invalidate caches. Each receiving tab reads authoritative, authorized data.
    channel.postMessage({ type: "altara_bot_metadata_changed", userId, appId, botId });
    channel.close();
  } catch { /* Opening Apps also refreshes when cross-tab messaging is unavailable. */ }
}

type DeveloperApp = {
  app_id: string;
  app_name: string;
  app_description?: string | null;
  app_icon_url?: string | null;
  app_banner_url?: string | null;
  app_status?: string | null;
  app_created_at?: string | null;
  app_updated_at?: string | null;
  bot_id?: string | null;
  bot_public_id?: string | null;
  bot_name?: string | null;
  bot_avatar_url?: string | null;
  bot_banner_url?: string | null;
  bot_description?: string | null;
  bot_status?: string | null;
  bot_token_prefix?: string | null;
  bot_last_used_at?: string | null;
  bot_revoked_at?: string | null;
  bot_is_public?: boolean | null;
  install_count?: number | null;
  command_count?: number | null;
  default_install_permissions?: string[] | null;
};

type BotCommand = {
  command_id: string;
  name: string;
  description?: string | null;
  options?: JsonValue;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AuditLog = {
  id: string;
  action: string;
  metadata?: JsonValue;
  created_at?: string | null;
};

type EndpointInfo = {
  endpoint_url?: string | null;
  last_status?: string | null;
  last_error?: string | null;
};

type DeveloperUserProfile = {
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

type DeveloperUserIdentity = {
  displayName: string;
  handle: string;
  avatarUrl: string;
  initial: string;
};

type Notice = {
  tone: "info" | "success" | "error";
  message: string;
};

type EventIntentState = { scope: string; available: boolean; intents: string[]; error?: string };
const EVENT_INTENTS = ["messages", "members", "message_content", "reactions", "voice_states", "direct_messages", "presence"];
function parseEventIntentState(value: unknown, scope: string): EventIntentState {
  const row = asRecord(value);
  if (row.available !== true || !Array.isArray(row.intents) || row.intents.some((i) => typeof i !== "string" || !EVENT_INTENTS.includes(i))) {
    throw new Error("Could not confirm event intent settings.");
  }
  return { scope, available: true, intents: [...new Set(row.intents as string[])] };
}

type SecretNotice = {
  kind: "bot-token";
  label: string;
  value: string;
  userId: string;
  appId: string;
};

type RouteState = {
  kind: "home" | "bots" | "docs" | "bot";
  appId: string;
  section: string;
};

type DynamicRpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
type TrustedImageUpload = (options: {
  supabase: ReturnType<typeof getSupabaseBrowserClient>;
  file: File;
  uploadContext: "bot_avatar" | "bot_banner";
  appId: string;
  targetId: string;
  cacheControl: string;
}) => Promise<{ publicUrl: string; visibility: string }>;

const ALTARA_PUBLIC_ORIGIN = "https://altaraapp.com";
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const DEFAULT_PERMISSIONS = [
  "bot:send_messages",
  "bot:use_slash_commands",
  "bot:read_basic_channel_metadata",
  "bot:manage_own_commands",
];

const PERMISSIONS = [
  { key: "bot:send_messages", label: "Send Messages", supported: true, note: "Allow your bot to reply in text channels." },
  { key: "bot:use_slash_commands", label: "Use Slash Commands", supported: true, note: "Allow users to run synced slash commands." },
  { key: "bot:read_basic_channel_metadata", label: "Read Channel Names", supported: true, note: "Let your bot see basic channel names." },
  { key: "bot:manage_own_commands", label: "Manage Own Commands", supported: true, note: "Let your bot sync its own command registry." },
  { key: "bot:embed_links", label: "Link Previews & Cards", supported: true, note: "Show ALTARA link previews and structured bot message cards." },
  { key: "bot:add_reactions", label: "Add Reactions", supported: true, note: "Add reactions to permitted bot-channel messages." },
  { key: "bot:read_message_history", label: "Read Message History", supported: true, note: "Read bounded, sanitized history from public server text channels." },
  { key: "bot:receive_message_events", label: "Receive Message Events", supported: true, requiresEvents: true, note: "Receive new human-message metadata from permitted public server text channels. The Messages intent must also be enabled." },
  { key: "bot:receive_member_events", label: "Receive Member Events", supported: true, requiresEvents: true, note: "Receive member joins in this server. The Server Members intent must also be enabled." },
  { key: "bot:read_message_content", label: "Read Message Content", supported: true, requiresEvents: true, note: "Read message text in events. Requires Messages and Message Content intents, Read Message History, and channel access." },
  { key: "bot:manage_messages", label: "Manage Own Bot Messages", supported: true, note: "Edit or delete the bot's own messages; this is not general member moderation." },
  { key: "bot:pin_messages", label: "Pin Messages", supported: true, note: "Pin and unpin permitted bot-channel messages." },
  { key: "bot:connect_voice", label: "Connect to Voice", supported: true, note: "Request a scoped voice connection. Audio publishing needs a separate RTC implementation." },
  { key: "bot:speak_voice", label: "Publish Voice Audio", supported: true, note: "Publish audio through the official RTC implementation. The music starter supports playback, queues and recovery." },
  { key: "bot:read_voice_state", label: "Read Voice State", supported: true, note: "Read basic voice session state." },
  { key: "bot:set_voice_status", label: "Set Voice Status", supported: true, note: "Show a short status for the bot's voice session." },
  { key: "bot:attach_files", label: "Attach Files", supported: true, note: "Private uploads up to 8 MiB per file; channel permissions protect downloads." },
  { key: "bot:send_direct_messages", label: "Consenting Direct Messages", supported: true, note: "Requires each member's explicit, revocable consent." },
  { key: "bot:create_threads", label: "Create and Reply in Threads", supported: true, note: "Threads inherit their parent channel's access." },
  { key: "bot:manage_threads", label: "Manage Threads", supported: true, note: "Archive permitted threads." },
  { key: "bot:manage_roles", label: "Manage Roles", supported: true, note: "Protects higher roles, administrators and the approved permission ceiling." },
  { key: "bot:kick_members", label: "Kick Members", supported: true, note: "Audited removal below the bot's rank." },
  { key: "bot:ban_members", label: "Ban Members", supported: true, note: "Audited ban and unban below the bot's rank." },
  { key: "bot:timeout_members", label: "Timeout Members", supported: true, note: "Bounded timeouts below the bot's rank." },
  { key: "bot:moderate_messages", label: "Moderate Member Messages", supported: true, note: "Requires channel moderation authority; preserves retained history." },
  { key: "bot:manage_events", label: "Manage Server Events", supported: true, note: "Create, edit and delete scheduled server events." },
  { key: "bot:receive_reaction_events", label: "Receive Reaction Events", supported: true, requiresEvents: true, note: "Requires the Reactions intent and parent channel access." },
  { key: "bot:receive_voice_events", label: "Receive Voice Events", supported: true, requiresEvents: true, note: "Basic voice changes without room credentials." },
  { key: "bot:receive_presence_events", label: "Receive Presence Events", supported: true, requiresEvents: true, note: "Basic visible status; respects blocks and privacy." },
  { key: "bot:manage_webhooks", label: "Manage Webhooks", supported: true, note: "Scoped, revocable webhooks; secrets travel only in Authorization headers." },
  { key: "bot:mention_members", label: "Mention Members", supported: true, note: "Notify explicitly selected members with channel access; no mass mentions." },
  { key: "bot:listen_voice", label: "Receive Consenting Microphones", supported: true, note: "Requires explicit contributor consent, with visible stop controls." },
  { key: "bot:record_voice", label: "Record Consenting Microphones", supported: true, note: "Requires each contributor's additional recording consent." },
  { key: "bot:admin", label: "Administrator", supported: false, note: "Not recommended unless required." },
  { key: "bot:manage_server", label: "Manage Server", supported: true, note: "Update the server name with an explicit installation grant." },
  { key: "bot:manage_channels", label: "Manage Channels", supported: true, note: "Create, rename and archive channels; preserve message history." },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function errorMessage(error: unknown): string {
  const record = asRecord(error);
  return String(record.message || record.details || record.hint || error || "Unexpected error.");
}

function firstRow<T>(data: unknown): T | null {
  return Array.isArray(data) ? (data[0] as T | undefined) || null : (data as T | null);
}

function normalizeId(value: unknown): string {
  const text = String(value || "").trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(text) ? text : "";
}

function formatDate(value?: string | null): string {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return "Never";
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function parseRoute(pathname: string, fallbackSlug: string[]): RouteState {
  const parts = pathname.split("/").filter(Boolean);
  const slug = parts[0] === "developers" ? parts.slice(1) : fallbackSlug;
  if (!slug.length) return { kind: "home", appId: "", section: "bots" };
  if (slug[0] === "docs") return { kind: "docs", appId: "", section: "docs" };
  if (slug[0] !== "applications") return { kind: "home", appId: "", section: "bots" };
  if (!slug[1]) return { kind: "bots", appId: "", section: "bots" };
  return { kind: "bot", appId: normalizeId(slug[1]), section: slug[2] || "profile" };
}

function appBase(appId: string): string {
  return `/developers/applications/${appId}`;
}

function buildInstallUrl(appId: string, permissions: string[]): string {
  const params = new URLSearchParams();
  params.set("client_id", appId);
  params.set("scope", "bot applications.commands");
  params.set("permissions", permissions.join(","));
  return `${ALTARA_PUBLIC_ORIGIN}/oauth2/authorize?${params.toString()}`;
}

function getSavedBotPermissions(app: DeveloperApp | null): string[] {
  const values = app?.default_install_permissions;
  return Array.isArray(values)
    ? [...new Set(values.filter((value) => typeof value === "string" && value.startsWith("bot:")))]
    : [...DEFAULT_PERMISSIONS];
}

function samePermissionSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function optionCount(options: JsonValue | undefined): number {
  return Array.isArray(options) ? options.length : 0;
}

function botName(app: DeveloperApp | null | undefined): string {
  return String(app?.bot_name || app?.app_name || "ALTARA Bot").trim();
}

function botAvatar(app: DeveloperApp | null | undefined): string {
  return String(app?.bot_avatar_url || app?.app_icon_url || "").trim();
}

function botDescription(app: DeveloperApp | null | undefined): string {
  return String(app?.bot_description || app?.app_description || "").trim();
}

function cleanIdentityText(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeProfileUsername(value: unknown): string {
  return cleanIdentityText(value).replace(/^@+/, "").slice(0, 32);
}

function getUserMetadata(user: User | null | undefined): Record<string, unknown> {
  return asRecord(user?.user_metadata);
}

function getDeveloperUserIdentity(user: User | null | undefined, profile: DeveloperUserProfile | null | undefined): DeveloperUserIdentity {
  const metadata = getUserMetadata(user);
  const username = normalizeProfileUsername(profile?.username || metadata.username || metadata.user_name || metadata.preferred_username);
  const displayName = cleanIdentityText(profile?.display_name || metadata.display_name || metadata.full_name || metadata.name || username) || "ALTARA User";
  const avatarUrl = cleanIdentityText(profile?.avatar_url || metadata.avatar_url || metadata.picture);
  const handle = username ? `@${username}` : "";
  const initial = (displayName || username || "A").trim().charAt(0).toUpperCase() || "A";
  return { displayName, handle, avatarUrl, initial };
}

function AvatarPreview({ url, label, className = "" }: { url?: string | null; label: string; className?: string }) {
  const initial = String(label || "A").trim().charAt(0).toUpperCase() || "A";
  return (
    <div className={`devAvatar ${className}`} style={url ? { backgroundImage: `url("${url}")` } : undefined} aria-label={label}>
      {!url ? <span>{initial}</span> : null}
    </div>
  );
}

function BannerPreview({ url }: { url?: string | null }) {
  return (
    <div className="devBannerPreview" style={url ? { backgroundImage: `url("${url}")` } : undefined}>
      {!url ? <span>Banner</span> : null}
    </div>
  );
}

export function DeveloperPortalClient({ initialSlug }: { initialSlug: string[] }) {
  const pathname = usePathname();
  const route = useMemo(() => parseRoute(pathname || "/developers", initialSlug), [pathname, initialSlug]);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bots, setBots] = useState<DeveloperApp[]>([]);
  const [botsLoading, setBotsLoading] = useState(false);
  const [botsError, setBotsError] = useState("");
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [endpoint, setEndpoint] = useState<EndpointInfo | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [secretNotice, setSecretNotice] = useState<SecretNotice | null>(null);
  const [userProfile, setUserProfile] = useState<DeveloperUserProfile | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<{ scope: string; values: string[] } | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const identityRef = useRef("");
  const selectionRef = useRef({ appId: "", botId: "" });
  const detailsRequestRef = useRef(0);
  const botsRequestRef = useRef(0);
  const actionLockRef = useRef(false);
  const permissionWriteVersionRef = useRef(0);
  const [eventIntentState, setEventIntentState] = useState<EventIntentState | null>(null);
  const [eventIntentDraft, setEventIntentDraft] = useState<{ scope: string; values: string[] } | null>(null);
  const intentWriteVersionRef = useRef(0);
  const [detailsScope, setDetailsScope] = useState("");
  const [detailsError, setDetailsError] = useState("");

  const selectedBot = useMemo(() => {
    if (route.appId) return bots.find((app) => app.app_id === route.appId) || null;
    return bots[0] || null;
  }, [bots, route.appId]);

  const scopeKey = `${user?.id || ""}:${selectedBot?.app_id || ""}:${selectedBot?.bot_id || ""}`;
  const savedPermissions = getSavedBotPermissions(selectedBot);
  const permissions = permissionDraft?.scope === scopeKey ? permissionDraft.values : savedPermissions;
  const permissionsDirty = !samePermissionSet(permissions, savedPermissions);
  const currentEventSettings = eventIntentState?.scope === scopeKey ? eventIntentState : null;
  const eventIntents = eventIntentDraft?.scope === scopeKey ? eventIntentDraft.values : currentEventSettings?.intents || [];
  const eventIntentsDirty = !samePermissionSet(eventIntents, currentEventSettings?.intents || []);
  const installUrl = selectedBot?.app_id ? buildInstallUrl(selectedBot.app_id, savedPermissions) : "";
  const visibleSecret = secretNotice?.userId === user?.id && secretNotice?.appId === selectedBot?.app_id ? secretNotice : null;

  useEffect(() => {
    detailsRequestRef.current += 1;
    selectionRef.current = { appId: selectedBot?.app_id || "", botId: selectedBot?.bot_id || "" };
    return () => { detailsRequestRef.current += 1; selectionRef.current = { appId: "", botId: "" }; };
  }, [user?.id, selectedBot?.app_id, selectedBot?.bot_id]);

  useEffect(() => {
    let disposed = false;
    let authEventReceived = false;
    function applyUser(nextUser: User | null) {
      const nextId = nextUser?.id || "";
      if (identityRef.current !== nextId) {
        botsRequestRef.current += 1;
        selectionRef.current = { appId: "", botId: "" };
        setBots([]);
        setCommands([]);
        setLogs([]);
        setEndpoint(null);
        setNotice(null);
        setSecretNotice(null);
        setUserProfile(null);
        setPermissionDraft(null);
        setEventIntentState(null);
        setEventIntentDraft(null);
      }
      identityRef.current = nextId;
      setUser(nextUser);
      setAuthLoading(false);
    }
    supabase.auth.getSession().then(({ data }) => {
      if (disposed || authEventReceived) return;
      const sessionUser = data.session?.user || null;
      applyUser(sessionUser);
      if (!sessionUser) {
        const returnTo = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login.html?return_to=${encodeURIComponent(returnTo)}`);
      }
    }).catch(() => {
      if (!disposed) setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (disposed) return;
      authEventReceived = true;
      applyUser(session?.user || null);
    });
    return () => {
      disposed = true;
      identityRef.current = "";
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let disposed = false;
    if (!user?.id) {
      window.setTimeout(() => {
        if (!disposed) setUserProfile(null);
      }, 0);
      return () => {
        disposed = true;
      };
    }

    async function loadUserProfile() {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", user?.id || "")
          .maybeSingle();
        if (disposed) return;
        if (error || !data) {
          setUserProfile(null);
          return;
        }
        const row = asRecord(data);
        setUserProfile({
          display_name: cleanIdentityText(row.display_name),
          username: normalizeProfileUsername(row.username),
          avatar_url: cleanIdentityText(row.avatar_url),
        });
      } catch {
        if (!disposed) setUserProfile(null);
      }
    }

    void loadUserProfile();
    return () => {
      disposed = true;
    };
  }, [supabase, user?.id]);

  async function rpc<T>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
    if (!user?.id || identityRef.current !== user.id) throw new Error("Session changed. Please try again.");
    const rpcCall = supabase.rpc.bind(supabase) as unknown as DynamicRpc;
    const { data, error } = await rpcCall(name, payload);
    if (error) throw error;
    return data as T;
  }

  async function loadBots() {
    const ownerId = user?.id || "";
    const requestId = ++botsRequestRef.current;
    const permissionVersion = permissionWriteVersionRef.current;
    const isCurrent = () => identityRef.current === ownerId && botsRequestRef.current === requestId;
    setBotsLoading(true);
    try {
      const rows = await rpc<DeveloperApp[]>("bots_list_my_apps", {});
      if (!isCurrent()) return;
      setBots((current) => (Array.isArray(rows) ? rows : []).map((row) => {
        const previous = current.find((entry) => entry.app_id === row.app_id);
        // An older metadata read must not roll back an acknowledged permission save.
        return permissionVersion !== permissionWriteVersionRef.current && previous?.default_install_permissions
          ? { ...row, default_install_permissions: previous.default_install_permissions } : row;
      }));
      setBotsError("");
    } catch (error) {
      if (!isCurrent()) return;
      setBots([]);
      setBotsError(`Could not load bots: ${errorMessage(error)}`);
    } finally {
      if (isCurrent()) setBotsLoading(false);
    }
  }

  async function loadSelectedBotDetails(app: DeveloperApp) {
    const ownerId = user?.id || "";
    const generation = detailsRequestRef.current;
    const permissionVersion = permissionWriteVersionRef.current;
    const isCurrent = () => generation === detailsRequestRef.current && identityRef.current === ownerId && selectionRef.current.appId === app.app_id;
    if (!isCurrent()) return;
    setDetailsScope(`${ownerId}:${app.app_id}:${app.bot_id || ""}`);
    setDetailsError("");
    setCommands([]);
    setLogs([]);
    setEndpoint(null);
    if (app.app_id) {
      try {
        const row = firstRow<DeveloperApp>(await rpc("bots_get_my_app_profile", { p_app_id: app.app_id }));
        if (row && isCurrent()) setBots((current) => current.map((entry) => entry.app_id === app.app_id
          ? { ...entry, ...row, ...(permissionVersion !== permissionWriteVersionRef.current && entry.default_install_permissions
            ? { default_install_permissions: entry.default_install_permissions } : {}) } : entry));
      } catch {
        // Optional profile-media patch; core bot list still works without it.
      }
    }
    if (!isCurrent()) return;
    if (app.bot_id) {
      await Promise.all([loadCommands(app.bot_id), loadLogs(app.bot_id), loadEndpoint(app.app_id), loadEventIntents(app)]);
    } else {
      setCommands([]);
      setLogs([]);
      setEndpoint(null);
    }
  }

  async function loadEventIntents(app: DeveloperApp) {
    const ownerId = user?.id || "", scope = `${ownerId}:${app.app_id}:${app.bot_id || ""}`;
    const generation = detailsRequestRef.current, version = intentWriteVersionRef.current;
    const isCurrent = () => identityRef.current === ownerId && generation === detailsRequestRef.current
      && selectionRef.current.appId === app.app_id && selectionRef.current.botId === app.bot_id && version === intentWriteVersionRef.current;
    try {
      const result = await rpc("bots_get_event_intents_v1", { p_bot_id: app.bot_id });
      if (isCurrent()) setEventIntentState(parseEventIntentState(result, scope));
    } catch (error) {
      if (!isCurrent()) return;
      const missing = asRecord(error).code === "PGRST202" || /could not find.*function|function.*does not exist/i.test(errorMessage(error));
      setEventIntentState({ scope, available: false, intents: [], error: missing
        ? "Event delivery is prepared but has not been activated on the server yet."
        : `Could not load event intents: ${errorMessage(error)}` });
    }
  }

  async function loadCommands(botId: string) {
    const ownerId = user?.id || "";
    const generation = detailsRequestRef.current;
    const isCurrent = () => generation === detailsRequestRef.current && identityRef.current === ownerId && selectionRef.current.botId === botId;
    try {
      const rows = await rpc<BotCommand[]>("bots_list_app_commands", { p_bot_id: botId });
      if (isCurrent()) setCommands(Array.isArray(rows) ? rows : []);
    } catch (error) {
      if (isCurrent()) setDetailsError(`Could not load commands: ${errorMessage(error)}`);
    }
  }

  async function loadLogs(botId: string) {
    const ownerId = user?.id || "";
    const generation = detailsRequestRef.current;
    const isCurrent = () => generation === detailsRequestRef.current && identityRef.current === ownerId && selectionRef.current.botId === botId;
    try {
      const { data, error } = await supabase
        .from("bot_audit_logs")
        .select("id, action, metadata, created_at")
        .eq("bot_id", botId)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      if (isCurrent()) setLogs(Array.isArray(data) ? data as AuditLog[] : []);
    } catch (error) {
      if (isCurrent()) setDetailsError(`Could not load logs: ${errorMessage(error)}`);
    }
  }

  async function loadEndpoint(appId: string) {
    const ownerId = user?.id || "";
    const generation = detailsRequestRef.current;
    const isCurrent = () => generation === detailsRequestRef.current && identityRef.current === ownerId && selectionRef.current.appId === appId;
    try {
      const row = firstRow<EndpointInfo>(await rpc("bots_get_interaction_endpoint", { p_app_id: appId }));
      if (isCurrent()) setEndpoint(row);
    } catch (error) {
      if (isCurrent()) setDetailsError(`Could not load webhook settings: ${errorMessage(error)}`);
    }
  }

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => { void loadBots(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user || !selectedBot) return;
    const timer = window.setTimeout(() => { void loadSelectedBotDetails(selectedBot); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedBot?.app_id, selectedBot?.bot_id]);

  async function copyText(text: string, label = "Copied.") {
    await navigator.clipboard.writeText(text);
    setNotice({ tone: "success", message: label });
  }

  async function runAction<T>(name: string, action: () => Promise<T>): Promise<T | null> {
    if (actionLockRef.current) return null;
    actionLockRef.current = true;
    const ownerId = user?.id || "";
    setBusyAction(name);
    setNotice(null);
    try {
      return await action();
    } catch (error) {
      if (identityRef.current === ownerId) setNotice({ tone: "error", message: errorMessage(error) });
      return null;
    } finally {
      actionLockRef.current = false;
      setBusyAction("");
    }
  }

  function validateImage(file: File) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Upload PNG, JPG/JPEG, WEBP, or GIF images only.");
    if (file.size > IMAGE_MAX_BYTES) throw new Error("Image is too large. Maximum size is 10MB.");
  }

  async function uploadImage(file: File, kind: "bot_avatar" | "bot_banner", appId: string, botId: string) {
    const actorId = user?.id || "";
    if (!actorId || identityRef.current !== actorId) throw new Error("Sign in before uploading images.");
    validateImage(file);
    const result = await (uploadViaTrustedAuthority as TrustedImageUpload)({
      supabase,
      file,
      uploadContext: kind,
      appId,
      targetId: botId,
      cacheControl: "31536000",
    });
    if (identityRef.current !== actorId) throw new Error("The signed-in account changed. Please try again.");
    if (!result.publicUrl || result.visibility !== "public") throw new Error("The uploaded image could not be verified for the bot profile.");
    return result.publicUrl;
  }

  async function handleCreateBot(formData: FormData) {
    await runAction("create-bot", async () => {
      const name = String(formData.get("bot_name") || formData.get("app_name") || "").trim();
      const description = String(formData.get("description") || "").trim();
      if (!name) throw new Error("Bot name is required.");
      const avatar = formData.get("avatar_file");
      if (avatar instanceof File && avatar.size > 0) validateImage(avatar);
      const appRow = firstRow<{ app_id: string }>(await rpc("bots_create_developer_app", {
        p_name: name,
        p_description: description,
        p_icon_url: null,
      }));
      if (!appRow?.app_id) throw new Error("Bot was not created.");
      if (identityRef.current !== user?.id) return;
      const botRow = firstRow<{ bot_id: string; bot_token?: string }>(await rpc("bots_create_bot", {
        p_app_id: appRow.app_id,
        p_name: name,
        p_description: description,
        p_avatar_url: null,
      }));
      if (identityRef.current !== user?.id) return;
      if (!botRow?.bot_id) throw new Error("Bot was not created.");
      if (botRow?.bot_token) setSecretNotice({ kind: "bot-token", label: "Bot token shown once", value: botRow.bot_token, userId: user.id, appId: appRow.app_id });
      // Upload authority needs an existing bot. Keep its once-only token even if the optional image fails.
      let avatarError = "";
      if (avatar instanceof File && avatar.size > 0) {
        try {
          const avatarUrl = await uploadImage(avatar, "bot_avatar", appRow.app_id, botRow.bot_id);
          await rpc("bots_update_bot_profile", { p_bot_id: botRow.bot_id, p_name: name, p_description: description, p_avatar_url: avatarUrl });
        } catch (error) { avatarError = errorMessage(error); }
      }
      if (identityRef.current !== user.id) return;
      await loadBots();
      if (identityRef.current !== user.id) return;
      setCreateModalOpen(false);
      // Keep the once-only token in this component's memory during creation navigation.
      window.history.pushState(null, "", `${appBase(appRow.app_id)}/token`);
      setNotice(avatarError
        ? { tone: "error", message: `Bot created, but its avatar could not be saved: ${avatarError} Copy the token now, then retry the image in Profile.` }
        : { tone: "success", message: "Bot created. Copy the token now; it will not be shown again." });
    });
  }

  async function handleSaveProfile(formData: FormData) {
    if (!selectedBot?.bot_id) return false;
    const actorId = user?.id || "", appId = selectedBot.app_id, botId = selectedBot.bot_id;
    const isCurrent = () => identityRef.current === actorId
      && selectionRef.current.appId === appId && selectionRef.current.botId === botId;
    const saved = await runAction("save-profile", async () => {
      if (!isCurrent()) return;
      let avatarUrl = String(formData.get("avatar_url") || selectedBot.bot_avatar_url || "").trim();
      let bannerUrl = String(formData.get("banner_url") || selectedBot.bot_banner_url || "").trim();
      const avatar = formData.get("avatar_file");
      const banner = formData.get("banner_file");
      // Validate both files before starting either upload.
      if (avatar instanceof File && avatar.size > 0) validateImage(avatar);
      if (banner instanceof File && banner.size > 0) validateImage(banner);
      if (avatar instanceof File && avatar.size > 0) avatarUrl = await uploadImage(avatar, "bot_avatar", appId, botId);
      if (!isCurrent()) return;
      if (banner instanceof File && banner.size > 0) bannerUrl = await uploadImage(banner, "bot_banner", appId, botId);
      if (!isCurrent()) return;
      await rpc("bots_update_bot_profile", {
        p_bot_id: selectedBot.bot_id,
        p_name: String(formData.get("name") || "").trim(),
        p_description: String(formData.get("description") || "").trim(),
        p_avatar_url: avatarUrl || null,
        p_banner_url: bannerUrl || null,
        p_is_public: selectedBot.bot_is_public === true,
      });
      if (!isCurrent()) return;
      notifyBotMetadataChanged(actorId, appId, botId);
      await loadBots();
      if (!isCurrent()) return;
      setNotice({ tone: "success", message: "Bot profile saved." });
      return true;
    });
    return saved === true;
  }

  async function handleSaveInstall(formData: FormData) {
    if (!selectedBot?.bot_id) return;
    const actorId = user?.id || "", appId = selectedBot.app_id, botId = selectedBot.bot_id;
    await runAction("save-install", async () => {
      await rpc("bots_update_bot_profile", {
        p_bot_id: selectedBot.bot_id,
        p_name: botName(selectedBot),
        p_description: botDescription(selectedBot),
        p_avatar_url: botAvatar(selectedBot) || null,
        p_banner_url: selectedBot.bot_banner_url || null,
        p_is_public: formData.get("is_public") === "on",
      });
      if (identityRef.current !== actorId) return;
      notifyBotMetadataChanged(actorId, appId, botId);
      await loadBots();
      if (identityRef.current !== actorId || selectionRef.current.appId !== appId) return;
      setNotice({ tone: "success", message: "Install settings saved." });
    });
  }

  async function handleSavePermissions() {
    if (!selectedBot?.bot_id || !user || !permissionsDirty) return;
    const ownerId = user.id, appId = selectedBot.app_id, botId = selectedBot.bot_id;
    const submitted = [...permissions], submittedScope = scopeKey;
    const isCurrent = () => identityRef.current === ownerId && selectionRef.current.appId === appId && selectionRef.current.botId === botId;
    await runAction("save-permissions", async () => {
      let row: { bot_id: string; default_install_permissions: string[] } | null;
      try {
        row = firstRow(await rpc("bots_update_bot_default_permissions", { p_bot_id: botId, p_permissions: submitted }));
      } catch (error) {
        if (isCurrent()) throw error;
        return;
      }
      if (identityRef.current !== ownerId) return;
      if (row?.bot_id !== botId || !Array.isArray(row.default_install_permissions)
        || !row.default_install_permissions.every((value) => typeof value === "string")) {
        if (isCurrent()) throw new Error("Could not confirm saved permissions. Reload and try again.");
        return;
      }
      permissionWriteVersionRef.current += 1;
      notifyBotMetadataChanged(ownerId, appId, botId);
      const acknowledged = row.default_install_permissions;
      setBots((current) => current.map((entry) => entry.bot_id === botId ? { ...entry, default_install_permissions: acknowledged } : entry));
      setPermissionDraft((current) => current?.scope === submittedScope && samePermissionSet(current.values, submitted) ? null : current);
      if (isCurrent()) setNotice({ tone: "success", message: "Default permissions saved. Existing servers must authorize permission changes." });
    });
  }

  async function handleSaveEventIntents() {
    if (!selectedBot?.bot_id || !user || !currentEventSettings?.available || !eventIntentsDirty) return;
    const ownerId = user.id, appId = selectedBot.app_id, botId = selectedBot.bot_id, submittedScope = scopeKey;
    const values = [...eventIntents];
    const isCurrent = () => identityRef.current === ownerId && selectionRef.current.appId === appId && selectionRef.current.botId === botId;
    await runAction("save-event-intents", async () => {
      let result;
      try { result = await rpc("bots_set_event_intents_v1", { p_bot_id: botId, p_intents: values }); }
      catch (error) { if (isCurrent()) throw error; return; }
      if (!isCurrent()) return;
      const acknowledged = parseEventIntentState(result, submittedScope);
      notifyBotMetadataChanged(ownerId, appId, botId);
      intentWriteVersionRef.current += 1;
      setEventIntentState(acknowledged);
      setEventIntentDraft((current) => current?.scope === submittedScope && samePermissionSet(current.values, values) ? null : current);
      setNotice({ tone: "success", message: "Event intents saved. Server installation grants and client intents are also required." });
    });
  }

  async function handleToken(action: "regenerate" | "revoke") {
    if (!selectedBot?.bot_id) return;
    await runAction(action, async () => {
      if (action === "revoke") {
        await rpc("bots_revoke_token", { p_bot_id: selectedBot.bot_id });
        if (identityRef.current !== user?.id || selectionRef.current.appId !== selectedBot.app_id) return;
        setSecretNotice(null);
        setNotice({ tone: "success", message: "Token revoked. Regenerate it before running this bot again." });
      } else {
        const row = firstRow<{ bot_token?: string }>(await rpc("bots_regenerate_token", { p_bot_id: selectedBot.bot_id }));
        if (identityRef.current !== user?.id) return;
        if (row?.bot_token) setSecretNotice({ kind: "bot-token", label: "Regenerated token shown once", value: row.bot_token, userId: user.id, appId: selectedBot.app_id });
        if (selectionRef.current.appId !== selectedBot.app_id) return;
        setNotice({ tone: "success", message: "Token regenerated. Copy it now." });
      }
      await loadBots();
    });
  }

  async function handleSaveEndpoint(formData: FormData) {
    if (!selectedBot) return;
    await runAction("save-endpoint", async () => {
      const row = firstRow<EndpointInfo>(await rpc("bots_save_interaction_endpoint", {
        p_app_id: selectedBot.app_id,
        p_endpoint_url: String(formData.get("endpoint_url") || "").trim(),
      }));
      if (identityRef.current !== user?.id || selectionRef.current.appId !== selectedBot.app_id) return;
      setEndpoint(row);
      setNotice({ tone: "success", message: "Webhook endpoint saved. Use this only for Advanced Webhook Mode." });
    });
  }

  async function handleTestEndpoint() {
    if (!selectedBot) return;
    await runAction("test-endpoint", async () => {
      const { data, error } = await supabase.functions.invoke("altara-bot-interaction-dispatch", {
        body: { action: "verify_endpoint", app_id: selectedBot.app_id },
      });
      if (error) throw error;
      const result = asRecord(data);
      if (result.ok !== true) throw new Error(String(result.error || "verification_failed"));
      await loadEndpoint(selectedBot.app_id);
      setNotice({ tone: "success", message: "Endpoint verified." });
    });
  }

  async function handleManualCommand(formData: FormData) {
    if (!selectedBot?.bot_id) return;
    await runAction("manual-command", async () => {
      await rpc("bots_upsert_slash_command", {
        p_bot_id: selectedBot.bot_id,
        p_name: String(formData.get("name") || "").trim().replace(/^\//, "").toLowerCase(),
        p_description: String(formData.get("description") || "").trim(),
        p_options: [],
        p_callback_url: null,
        p_server_id: null,
      });
      await loadCommands(selectedBot.bot_id || "");
      setNotice({ tone: "success", message: "Manual command saved. Code sync remains the normal flow." });
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.assign("/login.html?return_to=%2Fdevelopers");
  }

  if (authLoading) {
    return <DeveloperPortalFrame route={route}><PageLoading label="Checking session..." /></DeveloperPortalFrame>;
  }

  if (!user) {
    return <DeveloperPortalFrame route={route}><PageLoading label="Redirecting to login..." /></DeveloperPortalFrame>;
  }

  return (
    <DeveloperPortalFrame route={route} bots={bots} selectedBot={selectedBot} user={user} userProfile={userProfile} onOpenCreate={() => setCreateModalOpen(true)} onSignOut={handleSignOut}>
      <StatusNotice notice={notice} secret={visibleSecret} onCopySecret={() => visibleSecret ? copyText(visibleSecret.value, "Token copied.") : undefined} />
      {detailsScope === scopeKey && detailsError ? <StatusNotice notice={{ tone: "error", message: detailsError }} secret={null} onCopySecret={() => undefined} /> : null}
      {renderContent()}
      {createModalOpen ? <CreateBotModal onClose={() => setCreateModalOpen(false)} onCreate={handleCreateBot} busy={busyAction} /> : null}
    </DeveloperPortalFrame>
  );

  function renderContent() {
    if (route.kind === "home" || route.kind === "bots") return <BotList bots={bots} loading={botsLoading} error={botsError} onOpenCreate={() => setCreateModalOpen(true)} />;
    if (route.kind === "docs") return <Docs />;
    if (botsLoading) return <PageLoading label="Loading bot..." />;
    if (botsError) return <ScopedError title="Could not load bots" body={botsError} />;
    if (!bots.length) return <BotList bots={bots} loading={botsLoading} error={botsError} onOpenCreate={() => setCreateModalOpen(true)} />;
    if (!selectedBot) return <EmptyState title="Bot not found" body="Choose a bot from the sidebar or create a new one." actionLabel="Back to My Bots" actionHref="/developers/applications" />;

    if (["profile", "overview", "bot", "general"].includes(route.section)) return <BotProfilePage key={selectedBot.app_id} app={selectedBot} onSave={handleSaveProfile} busy={busyAction} />;
    if (route.section === "token") return <TokenPage app={selectedBot} onToken={handleToken} busy={busyAction} />;
    if (["install", "installation", "oauth2"].includes(route.section)) return <InstallPage app={selectedBot} installUrl={installUrl} onSave={handleSaveInstall} busy={busyAction} copyText={copyText} />;
    if (route.section === "permissions") return <PermissionsPage permissions={permissions} setPermissions={(values) => setPermissionDraft({ scope: scopeKey, values })} copyText={copyText} dirty={permissionsDirty} busy={Boolean(busyAction)} onSave={handleSavePermissions} installHref={`${appBase(selectedBot.app_id)}/install`} eventsAvailable={currentEventSettings?.available === true} />;
    if (route.section === "intents") return <IntentsPage settings={currentEventSettings} intents={eventIntents} setIntents={(values) => setEventIntentDraft({ scope: scopeKey, values })} dirty={eventIntentsDirty} busy={Boolean(busyAction)} onSave={handleSaveEventIntents} permissionsHref={`${appBase(selectedBot.app_id)}/permissions`} />;
    if (route.section === "commands") return <CommandsPage key={selectedBot.app_id} app={selectedBot} commands={detailsScope === scopeKey ? commands : []} onManual={handleManualCommand} busy={busyAction} />;
    if (route.section === "code") return <CodePage appId={selectedBot.app_id} />;
    if (route.section === "hosting") return <HostingPage appId={selectedBot.app_id} />;
    if (["webhooks", "interactions"].includes(route.section)) return <WebhooksPage key={selectedBot.app_id} endpoint={detailsScope === scopeKey ? endpoint : null} onSave={handleSaveEndpoint} onTest={handleTestEndpoint} busy={busyAction} />;
    if (route.section === "logs") return <LogsPage logs={detailsScope === scopeKey ? logs : []} onRefresh={() => selectedBot.bot_id ? loadLogs(selectedBot.bot_id) : undefined} />;
    if (["advanced-ids", "ids"].includes(route.section)) return <AdvancedIdsPage app={selectedBot} copyText={copyText} />;
    return <BotProfilePage key={selectedBot.app_id} app={selectedBot} onSave={handleSaveProfile} busy={busyAction} />;
  }
}

function DeveloperPortalFrame({
  route,
  bots = [],
  selectedBot = null,
  user = null,
  userProfile = null,
  onOpenCreate,
  onSignOut,
  children,
}: {
  route: RouteState;
  bots?: DeveloperApp[];
  selectedBot?: DeveloperApp | null;
  user?: User | null;
  userProfile?: DeveloperUserProfile | null;
  onOpenCreate?: () => void;
  onSignOut?: () => void | Promise<void>;
  children: ReactNode;
}) {
  const router = useRouter();
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<"dark" | "midnight">("dark");
  const selectedId = selectedBot?.app_id || "";
  const base = selectedId ? appBase(selectedId) : "/developers/applications";
  const nav = selectedId ? [
    ["Profile", `${base}/profile`],
    ["Token", `${base}/token`],
    ["Install", `${base}/install`],
    ["Permissions", `${base}/permissions`],
    ["Intents", `${base}/intents`],
    ["Commands", `${base}/commands`],
    ["Code", `${base}/code`],
    ["Hosting", `${base}/hosting`],
    ["Advanced Webhook Mode", `${base}/webhooks`],
    ["Logs", `${base}/logs`],
    ["Advanced IDs", `${base}/advanced-ids`],
  ] : [];
  const identity = getDeveloperUserIdentity(user, userProfile);
  const activePath = (href: string) => route.kind === "bot" && (href.endsWith(route.section) || (route.section === "overview" && href.endsWith("/profile")));

  useEffect(() => {
    if (!userMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && userMenuRef.current?.contains(target)) return;
      setUserMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen]);

  return (
    <main className={`developerPortal developerPortal--${themeMode}`}>
      <header className="developerTopBar">
        <Link className="developerTopBrand" href="/developers">
          <span>ALT</span>
          <strong>ALTARA <small>Developer Portal</small></strong>
        </Link>
        <nav className="developerTopNav" aria-label="Developer top navigation">
          <Link href="/developers/applications">My Bots</Link>
          <Link href="/developers/docs">Docs</Link>
          <Link href="/developers/widgets">Widgets</Link>
          <Link href="/developers/themes">Themes</Link>
          <Link href="/marketplace">Marketplace</Link>
          <a href="/app">Open ALTARA</a>
        </nav>
        <button className="devButton primary developerCreateTop" type="button" onClick={onOpenCreate} disabled={!onOpenCreate}>New Bot</button>
        <div className={`developerUserMenu${userMenuOpen ? " is-open" : ""}`} aria-label="Current user" ref={userMenuRef}>
          <button className="developerUserButton" type="button" aria-haspopup="menu" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)}>
            <DeveloperUserAvatar identity={identity} />
            <span className="developerUserButtonName">{identity.displayName}</span>
          </button>
          {userMenuOpen ? (
            <div className="developerUserDropdown" role="menu" aria-label="Account menu">
              <div className="developerUserHeader">
                <DeveloperUserAvatar identity={identity} large />
                <div>
                  <strong>{identity.displayName}</strong>
                  <span>{identity.handle || "ALTARA account"}</span>
                </div>
              </div>
              <button className="developerUserMenuItem" type="button" role="menuitem" onClick={() => setThemeMode((mode) => mode === "dark" ? "midnight" : "dark")}>
                Theme toggle <span>{themeMode === "dark" ? "Dark" : "Midnight"}</span>
              </button>
              <a className="developerUserMenuItem" role="menuitem" href="/app">
                Manage account <span>Open ALTARA</span>
              </a>
              <button className="developerUserMenuItem" type="button" role="menuitem" disabled>
                Language <span>English</span>
              </button>
              <button className="developerUserMenuItem danger" type="button" role="menuitem" onClick={() => { setUserMenuOpen(false); void onSignOut?.(); }}>
                Log Out
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <div className="developerShell">
        <aside className={`developerSidebar${navigationOpen ? " is-expanded" : ""}`}>
          <Link className="developerBackLink" href="/developers/applications"><span aria-hidden="true">←</span> My Bots</Link>
          <div className="developerAppCardMini">
            <AvatarPreview url={botAvatar(selectedBot)} label={botName(selectedBot)} />
            <div>
              <b>{selectedBot ? botName(selectedBot) : "No bot selected"}</b>
              <small>{selectedBot ? <><span className="botBadgeInline">BOT</span> {selectedBot.bot_is_public ? "Public" : "Private"}</> : "Create or choose a bot"}</small>
            </div>
          </div>
          <label className="developerAppSelect">
            <span>Switch bot</span>
            <select value={selectedId} onChange={(event) => event.target.value ? router.push(appBase(event.target.value)) : router.push("/developers/applications")}>
              <option value="">My Bots</option>
              {bots.map((app) => <option key={app.app_id} value={app.app_id}>{botName(app)}</option>)}
            </select>
          </label>
          <button className="developerMobileNavButton" type="button" aria-expanded={navigationOpen} aria-controls="developerSections" onClick={() => setNavigationOpen((open) => !open)}>
            <span>Sections <b>{nav.find(([, href]) => activePath(href))?.[0] || (route.kind === "docs" ? "Docs" : "My Bots")}</b></span><span aria-hidden="true">{navigationOpen ? "−" : "+"}</span>
          </button>
          <nav id="developerSections" className="developerNav" aria-label="Bot sections">
            <Link className={route.kind === "bots" || route.kind === "home" ? "active" : ""} aria-current={route.kind === "bots" || route.kind === "home" ? "page" : undefined} href="/developers/applications" onClick={() => setNavigationOpen(false)}>My Bots</Link>
            {nav.map(([label, href], index) => <Fragment key={href}>
              {[0, 6, 8].includes(index) ? <span className="developerNavSection">{index === 0 ? "Configure" : index === 6 ? "Build & run" : "Advanced"}</span> : null}
              <Link className={activePath(href) ? "active" : ""} aria-current={activePath(href) ? "page" : undefined} href={href} onClick={() => setNavigationOpen(false)}>{label === "Advanced Webhook Mode" ? "Webhooks" : label === "Advanced IDs" ? "App IDs" : label}</Link>
            </Fragment>)}
            <Link className={route.kind === "docs" ? "active" : ""} aria-current={route.kind === "docs" ? "page" : undefined} href="/developers/docs" onClick={() => setNavigationOpen(false)}>Docs</Link>
            {selectedId ? (
              <details className="futureDetails">
                <summary>Advanced / Future</summary>
                {["Mod / Plugin", "Rich Presence", "App Testers", "Verification", "Games", "Activities", "Premium Apps"].map((label) => (
                  <button className="developerNavDisabled" type="button" disabled key={label}>{label} <small>Soon</small></button>
                ))}
              </details>
            ) : null}
          </nav>
        </aside>
        <section className="developerMain">{children}</section>
      </div>
    </main>
  );
}

function DeveloperUserAvatar({ identity, large = false }: { identity: DeveloperUserIdentity; large?: boolean }) {
  return (
    <span
      className={`developerUserAvatar${large ? " large" : ""}`}
      style={identity.avatarUrl ? { backgroundImage: `url("${identity.avatarUrl}")` } : undefined}
      aria-hidden="true"
    >
      {!identity.avatarUrl ? identity.initial : null}
    </span>
  );
}

function StatusNotice({ notice, secret, onCopySecret }: { notice: Notice | null; secret: SecretNotice | null; onCopySecret: () => void | Promise<void> | undefined }) {
  return (
    <>
      {notice ? <div className={`developerNotice ${notice.tone}`}>{notice.message}</div> : null}
      {secret ? (
        <div className="developerSecret">
          <div><b>{secret.label}</b><small>Copy now. ALTARA will not show this value again.</small></div>
          <code>{secret.value}</code>
          <button className="devButton secondary" type="button" onClick={() => { void onCopySecret(); }}>Copy</button>
        </div>
      ) : null}
    </>
  );
}

function BotList({ bots, loading, error, onOpenCreate }: { bots: DeveloperApp[]; loading: boolean; error: string; onOpenCreate: () => void }) {
  return (
    <>
      <header className="applicationsHeader">
        <div>
          <h1>My Bots</h1>
          <p>Create bots that connect to ALTARA with a token and sync commands from code.</p>
        </div>
        <button className="devButton primary" type="button" onClick={onOpenCreate}>New Bot</button>
      </header>
      <section className="developerPanel applicationsPanel">
        {error ? <ScopedError title="Could not load bots" body={error} /> : null}
        {loading ? <PageLoading label="Loading bots..." /> : <BotCards bots={bots} onOpenCreate={onOpenCreate} />}
      </section>
    </>
  );
}

function BotCards({ bots, onOpenCreate }: { bots: DeveloperApp[]; onOpenCreate: () => void }) {
  if (!bots.length) return <EmptyState title="Create your first ALTARA bot." body="Bots are configured here and run from your PC, VPS, or hosting provider." actionLabel="New Bot" onAction={onOpenCreate} />;
  return (
    <div className="developerCards">
      {bots.map((app) => (
        <Link className="developerAppCard botCard" href={`${appBase(app.app_id)}/profile`} key={app.app_id}>
          <AvatarPreview url={botAvatar(app)} label={botName(app)} />
          <div>
            <b>{botName(app)} <span className="botBadgeInline">BOT</span></b>
            <small>{botDescription(app) || "ALTARA bot"}</small>
          </div>
          <div className="botCardMeta">
            <BotStatusBadge lastConnected={app.bot_last_used_at} />
            <span>{app.bot_is_public ? "Public" : "Private"}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function BotStatusBadge({ lastConnected }: { lastConnected?: string | null }) {
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    const refresh = () => setNowMs(Date.now());
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  const online = lastConnected && nowMs > 0 ? nowMs - Date.parse(lastConnected) < 120000 : false;
  return <span className={`connectionBadge ${online ? "online" : ""}`}>{online ? "Online" : "Offline"}</span>;
}

function CreateBotModal({ onClose, onCreate, busy }: { onClose: () => void; onCreate: (formData: FormData) => Promise<void>; busy: string }) {
  return (
    <div className="developerModalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="developerModal" role="dialog" aria-modal="true" aria-labelledby="createBotTitle">
        <button className="developerModalClose" type="button" onClick={onClose} aria-label="Close">x</button>
        <div id="createBotTitle"><PageHeader title="New Bot" eyebrow="Create Bot" description="Give your bot a name. ALTARA handles the internal IDs for you." nested /></div>
        <form className="developerForm" action={(formData) => { void onCreate(formData); }}>
          <label>Bot name<input name="bot_name" required maxLength={80} placeholder="Bonita Bot" /></label>
          <label>Description<textarea name="description" maxLength={400} rows={3} placeholder="What this bot does" /></label>
          <label className="uploadButton">Avatar upload optional<input name="avatar_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
          <p className="developerMuted">Mods and plugins are planned later. Bots are available now.</p>
          <div className="developerActions">
            <button className="devButton secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="devButton primary" type="submit" disabled={busy === "create-bot"}>{busy === "create-bot" ? "Creating..." : "Create Bot"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function BotProfilePage({ app, onSave, busy }: { app: DeveloperApp; onSave: (formData: FormData) => Promise<boolean>; busy: string }) {
  type ImageDraft = { file: File; url: string };
  const [avatar, setAvatar] = useState<ImageDraft | null>(null);
  const [banner, setBanner] = useState<ImageDraft | null>(null);
  const [editing, setEditing] = useState<ImageDraft & { kind: BotImageKind } | null>(null);
  const [imageError, setImageError] = useState("");
  const previewUrls = useRef(new Set<string>());
  const alive = useRef(true);
  const submitting = useRef(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    alive.current = true;
    const urls = previewUrls.current;
    return () => {
      alive.current = false;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function preview(file: File): ImageDraft {
    const url = URL.createObjectURL(file);
    previewUrls.current.add(url);
    return { file, url };
  }

  function release(image: ImageDraft | null) {
    if (image && previewUrls.current.delete(image.url)) URL.revokeObjectURL(image.url);
  }

  function chooseImage(file: File | undefined, kind: BotImageKind) {
    if (!file || busy || submitting.current) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) { setImageError("Upload PNG, JPG/JPEG, WEBP, or GIF images only."); return; }
    if (!file.size || file.size > IMAGE_MAX_BYTES) { setImageError("Choose an image up to 10MB."); return; }
    setImageError("");
    setEditing({ ...preview(file), kind });
  }

  return (
    <>
      <PageHeader title="Profile" eyebrow="Bot Profile" description="Set how your bot appears in ALTARA servers." />
      <section className="developerGrid two developerProfileGrid">
        <div className="developerPanel botProfilePreview">
          <BannerPreview url={banner?.url || app.bot_banner_url} />
          <AvatarPreview url={avatar?.url || botAvatar(app)} label={botName(app)} className="large overlap" />
          <h2>{botName(app)} <span className="botBadgeInline">BOT</span></h2>
          <p>{botDescription(app) || "No description yet."}</p>
        </div>
        <form className="developerPanel developerForm" onSubmit={async event => {
          event.preventDefault();
          if (busy || submitting.current || imageError || editing) return;
          const form = event.currentTarget;
          const formData = new FormData(form);
          // Only applied edits are submitted; cancelling the editor preserves the previous draft.
          formData.delete("avatar_file");
          formData.delete("banner_file");
          if (avatar) formData.set("avatar_file", avatar.file);
          if (banner) formData.set("banner_file", banner.file);
          submitting.current = true;
          try {
            const saved = await onSave(formData);
            if (saved && alive.current) {
              release(avatar);
              release(banner);
              setAvatar(null);
              setBanner(null);
              const avatarUrl = form.elements.namedItem("avatar_url");
              const bannerUrl = form.elements.namedItem("banner_url");
              // Let saved URLs come from the refreshed authoritative profile on the next submit.
              if (avatar && avatarUrl instanceof HTMLInputElement) avatarUrl.value = "";
              if (banner && bannerUrl instanceof HTMLInputElement) bannerUrl.value = "";
            }
          } finally { submitting.current = false; }
        }}>
          <h2>Bot identity</h2>
          <div className="developerUploadActions"><button type="button" className="uploadButton" disabled={Boolean(busy)} onClick={() => avatarInput.current?.click()}>Upload avatar</button>
          <input ref={avatarInput} name="avatar_file" className="botImageFileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; chooseImage(file, "avatar"); }} />
          <button type="button" className="uploadButton" disabled={Boolean(busy)} onClick={() => bannerInput.current?.click()}>Upload banner</button>
          <input ref={bannerInput} name="banner_file" className="botImageFileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; chooseImage(file, "banner"); }} /></div>
          {imageError ? <p role="alert">{imageError}</p> : null}
          <small>PNG, JPG/JPEG, WEBP, or GIF. Max 10MB. SVG and scripts are not accepted.</small>
          <label>Name<input name="name" defaultValue={botName(app)} maxLength={80} required /></label>
          <label>Description<textarea name="description" defaultValue={botDescription(app)} maxLength={400} rows={4} /></label>
          <details className="advancedDetails"><summary>Advanced: use image URL</summary><label>Avatar URL<input name="avatar_url" defaultValue={botAvatar(app)} placeholder="https://..." /></label><label>Banner URL<input name="banner_url" defaultValue={app.bot_banner_url || ""} placeholder="https://..." /></label></details>
          <button className="devButton primary" type="submit" disabled={Boolean(busy) || Boolean(imageError) || Boolean(editing)}>{busy === "save-profile" ? "Saving..." : "Save"}</button>
        </form>
      </section>
      {editing ? <BotImageEditor key={editing.url} file={editing.file} url={editing.url} kind={editing.kind}
        onCancel={() => { release(editing); setEditing(null); }} onApply={file => {
          const applied = file === editing.file ? editing : preview(file);
          if (file !== editing.file) release(editing);
          if (editing.kind === "avatar") { release(avatar); setAvatar(applied); }
          else { release(banner); setBanner(applied); }
          setEditing(null);
        }} /> : null}
    </>
  );
}

function TokenPage({ app, onToken, busy }: { app: DeveloperApp; onToken: (action: "regenerate" | "revoke") => Promise<void>; busy: string }) {
  return (
    <>
      <PageHeader title="Token" eyebrow="Bot Token" description="Use this token only in your external bot project." />
      <section className="developerPanel">
        <p className="developerWarning"><b>Your bot token is a password.</b> Put it only in your bot project <code>.env</code> file.</p>
        <div className="developerMeta"><span>Token prefix</span><code>{app.bot_token_prefix || "Not generated"}</code></div>
        <CodeBlock title=".env" code="ALTARA_BOT_TOKEN=altara_bot_..." />
        <div className="developerActions">
          <button className="devButton secondary" type="button" onClick={() => { void onToken("regenerate"); }} disabled={Boolean(busy)}>Reset / Regenerate token</button>
          <button className="devButton danger" type="button" onClick={() => { void onToken("revoke"); }} disabled={Boolean(busy)}>Revoke token</button>
        </div>
      </section>
    </>
  );
}

function InstallPage({ app, installUrl, onSave, busy, copyText }: { app: DeveloperApp; installUrl: string; onSave: (formData: FormData) => Promise<void>; busy: string; copyText: (text: string, label?: string) => Promise<void> }) {
  return (
    <>
      <PageHeader title="Install" eyebrow="Add to Server" description="Installing adds your bot to a server. It does not host or run your code." />
      <form className="developerPanel developerForm" action={(formData) => { void onSave(formData); }}>
        <label className="toggleLine"><input name="is_public" type="checkbox" defaultChecked={app.bot_is_public === true} /> Public Bot</label>
        <div className="scopeList"><span>Scopes</span><code>bot</code><code>applications.commands</code></div>
        <button className="devButton primary" type="submit" disabled={busy === "save-install"}>{busy === "save-install" ? "Saving..." : "Save install settings"}</button>
      </form>
      <section className="developerPanel">
        <h2>Install URL</h2>
        <div className="copyRow"><code>{installUrl}</code><button className="devButton secondary" type="button" onClick={() => { void copyText(installUrl, "Install URL copied."); }}>Copy</button><a className="devButton primary" href={installUrl} target="_blank" rel="noopener noreferrer">Open</a></div>
        {!app.bot_is_public ? <p className="developerWarning">This bot is private, so install actions should only be exposed to you.</p> : null}
      </section>
    </>
  );
}

function PermissionsPage({ permissions, setPermissions, copyText, dirty, busy, onSave, installHref, eventsAvailable }: { permissions: string[]; setPermissions: (value: string[]) => void; copyText: (text: string, label?: string) => Promise<void>; dirty: boolean; busy: boolean; onSave: () => Promise<void>; installHref: string; eventsAvailable: boolean }) {
  const output = permissions.join(",");
  return (
    <>
      <PageHeader title="Permissions" eyebrow="Default install permissions" description="Choose the permissions requested by new installs, then save your changes." />
      <section className="developerPanel">
        <h2>Choose what your bot can do</h2>
        <p className="developerSectionDescription">The four core permissions are required for command sync and replies. Choose optional permissions to match your bot. Existing servers keep their approved access until a server manager reviews the update.</p>
        {!eventsAvailable ? <p className="developerWarning">Event permissions stay disabled until event delivery is activated and its settings can be loaded. Check the Intents page for details.</p> : null}
        <div className="developerPermissionChoices">{PERMISSIONS.map((item) => (
          <label className={`toggleLine permissionLine ${item.supported ? "" : "disabled"}`} key={item.key}>
            <input
              type="checkbox"
              disabled={!item.supported || ("requiresEvents" in item && item.requiresEvents && !eventsAvailable) || DEFAULT_PERMISSIONS.includes(item.key) || busy}
              checked={permissions.includes(item.key)}
              onChange={(event) => {
                if (event.target.checked) setPermissions([...permissions, item.key]);
                else setPermissions(permissions.filter((key) => key !== item.key));
              }}
            />
            <span><b>{item.label}{DEFAULT_PERMISSIONS.includes(item.key) ? " · Required" : ""}</b><small>{item.note}</small></span>
          </label>
        ))}</div>
        <div className="permissionOutput">
          <span>ALTARA permission list</span>
          <code>{output || "No permissions selected"}</code>
          <button className="devButton secondary" type="button" onClick={() => { void copyText(output, "Permissions copied."); }}>Copy</button>
        </div>
        <div className="developerActions">
          <button className="devButton primary" type="button" disabled={!dirty || busy} onClick={() => { void onSave(); }}>{busy ? "Saving..." : "Save permissions"}</button>
          <span role="status">{dirty ? "Unsaved changes" : "Using saved defaults"}</span>
          <Link className="devButton secondary" href={installHref}>Installation</Link>
        </div>
        <p className="developerFootnote">The install link uses your saved defaults. Save first to include your new selection.</p>
      </section>
    </>
  );
}

function IntentsPage({ settings, intents, setIntents, dirty, busy, onSave, permissionsHref }: { settings: EventIntentState | null; intents: string[]; setIntents: (values: string[]) => void; dirty: boolean; busy: boolean; onSave: () => Promise<void>; permissionsHref: string }) {
  const choices = [
    ["messages", "Messages Intent", "Receive permitted public message and thread changes. Text is redacted unless Message Content is authorized."],
    ["members", "Server Members Intent", "Receive member joins, departures and updates with basic public identity. No private profile data or full member lists."],
    ["message_content", "Message Content Intent", "Include permitted message text. Also requires Messages, Read Message Content, Read Message History and channel access."],
    ["reactions", "Reactions Intent", "Receive approved reaction additions and removals in permitted public channels."],
    ["voice_states", "Voice States Intent", "Receive basic voice joins, leaves and audio state without connection credentials."],
    ["direct_messages", "Direct Messages Intent", "Receive only messages deliberately sent to this bot by consenting members."],
    ["presence", "Presence Intent", "Receive basic visible status, respecting member privacy and blocks."],
  ];
  return (
    <>
      <PageHeader title="Intents" eyebrow="Event subscriptions" description="Choose the events your bot needs. The server manager must also grant access during installation." />
      <section className="developerPanel">
        <h2>Choose the events you receive</h2>
        <p className="developerSectionDescription">Slash commands work without these intents. Event delivery needs three matching choices: saved intents here, approved server installation permissions, and intents in your bot code. Reading history alone does not subscribe to messages.</p>
        {!settings ? <p role="status">Loading event settings...</p> : settings.error ? <p role="status" className="developerWarning">{settings.error}</p> : null}
        <div className="developerIntentChoices">{choices.map(([key, label, copy]) => <label className="toggleLine permissionLine" key={key}>
          <input type="checkbox" checked={intents.includes(key)} disabled={!settings?.available || busy || (key === "message_content" && !intents.includes("messages"))} onChange={(event) => {
            if (event.target.checked) setIntents([...intents, key]);
            else setIntents(intents.filter((value) => value !== key && (key !== "messages" || value !== "message_content")));
          }} /><span><b>{label}</b><small>{copy}</small></span>
        </label>)}</div>
        <div className="developerActions"><button className="devButton primary" type="button" disabled={!settings?.available || !dirty || busy} onClick={() => { void onSave(); }}>{busy ? "Saving..." : "Save intents"}</button><Link className="devButton secondary" href={permissionsHref}>Installation permissions</Link></div>
        <p className="developerFootnote">Only new authorized events are captured. Private human conversations, encrypted messages and bot messages are excluded. Bot DMs use a separate feed with each member&apos;s explicit consent.</p>
      </section>
    </>
  );
}

function CommandsPage({ app, commands, onManual, busy }: { app: DeveloperApp; commands: BotCommand[]; onManual: (formData: FormData) => Promise<void>; busy: string }) {
  return (
    <>
      <PageHeader title="Commands" eyebrow="Code-first registry" description="Commands are defined in your bot code with bot.command(). When your bot starts, ALTARA syncs them automatically." />
      <section className="developerPanel">
        <CodeBlock title="Example" code={'bot.command("hello", {\n  description: "Says hello",\n}, async (ctx) => {\n  await ctx.reply("Hello!");\n});'} />
      </section>
      <section className="developerPanel">
        <h2>Synced commands</h2>
        <div className="commandTable">
          {commands.length ? commands.map((cmd) => (
            <div className="commandRow" key={cmd.command_id}>
              <b>/{cmd.name}</b><span>{cmd.description || "No description"}</span><span>{optionCount(cmd.options)} options</span><span>{cmd.status || "active"}</span>
            </div>
          )) : <EmptyState title="No synced commands" body="Run your bot process with bot.run() or bot.login() to publish commands from code." />}
        </div>
      </section>
      <details className="developerPanel">
        <summary>Advanced manual registration</summary>
        <p className="developerWarning">Most bots should not use this. Sync commands from code instead.</p>
        <form className="developerForm" action={(formData) => { void onManual(formData); }}>
          <label>Command name<input name="name" defaultValue="hello" maxLength={32} /></label>
          <label>Description<input name="description" defaultValue="Says hello" maxLength={120} /></label>
          <button className="devButton secondary" disabled={busy === "manual-command"} type="submit">Save manual command</button>
        </form>
      </details>
      {!app.bot_id ? <p className="developerWarning">Create a bot before syncing commands.</p> : null}
    </>
  );
}

function CodePage({ appId }: { appId: string }) {
  const [language, setLanguage] = useState<"js" | "py">("js");
  const [system, setSystem] = useState<"windows" | "unix">("windows");
  const windows = system === "windows";
  const copyEnv = windows ? "if (!(Test-Path .env)) { Copy-Item .env.example .env }" : "[ -f .env ] || cp .env.example .env";
  const python = windows ? ".\\.venv\\Scripts\\python.exe" : ".venv/bin/python";
  const prepare = language === "js" ? copyEnv : `${windows ? "python" : "python3"} -m venv .venv\n${copyEnv}\n${python} -m pip install -r requirements.txt`;
  const jsExample = 'const { AltaraClient } = require("./altara");\n\nconst bot = new AltaraClient({\n  token: process.env.ALTARA_BOT_TOKEN,\n});\n\nbot.command("ola-mundo", {\n  description: "Primeiro comando do bot",\n}, async (ctx) => {\n  await ctx.reply("Olá mundo!");\n});\n\nbot.on("error", error => console.error(error.message));\nbot.login();';
  const pyExample = 'import os\nfrom dotenv import load_dotenv\nfrom altara import AltaraClient\n\nload_dotenv()\nbot = AltaraClient(token=os.getenv("ALTARA_BOT_TOKEN"))\n\n@bot.command("ola-mundo", description="Primeiro comando do bot")\nasync def ola_mundo(ctx):\n    await ctx.reply("Olá mundo!")\n\nbot.run()';
  return (
    <>
      <PageHeader title="Code" eyebrow="Run externally" description="You do not paste code into ALTARA. You run it on your PC, VPS, or hosting provider." />
      <BotStarterDownloads />
      <section className="developerPanel">
        <h2>Start your bot</h2>
        <div className="developerSetupOptions">
          <div><span>Language</span><div className="segmented" role="group" aria-label="Bot language"><button aria-pressed={language === "js"} className={language === "js" ? "active" : ""} type="button" onClick={() => setLanguage("js")}>JavaScript</button><button aria-pressed={language === "py"} className={language === "py" ? "active" : ""} type="button" onClick={() => setLanguage("py")}>Python</button></div></div>
          <div><span>Your computer</span><div className="segmented" role="group" aria-label="Your computer"><button aria-pressed={windows} className={windows ? "active" : ""} type="button" onClick={() => setSystem("windows")}>Windows (PowerShell)</button><button aria-pressed={!windows} className={!windows ? "active" : ""} type="button" onClick={() => setSystem("unix")}>macOS / Linux</button></div></div>
        </div>
        <ol className="developerSteps developerSetupSteps" role="list">
          <li><h3>Download and extract</h3><p>Use the {language === "js" ? "FAQ bot (JavaScript)" : "Calculator bot (Python)"} download above. Open {windows ? "PowerShell" : "a terminal"} inside the extracted folder, where {language === "js" ? "package.json and index.js" : "requirements.txt and main.py"} are located. Install {language === "js" ? "Node.js 22.12+" : "Python 3.10+"} first.</p><p>Keep {language === "js" ? "altara.js and altara-client.js" : "altara.py"} beside your code. Use a dedicated test bot: startup sync disables missing code-managed commands.</p></li>
          <li><h3>Prepare the folder</h3><CodeBlock title="Check your runtime" code={language === "js" ? "node --version" : `${windows ? "python" : "python3"} --version`} /><CodeBlock title="Prepare the downloaded starter" code={prepare} /><p>This creates .env only if it does not already exist, preserving a token you have already configured.</p></li>
          <li><h3>Add your bot token</h3><p>Open .env in a text editor and replace the empty ALTARA_BOT_TOKEN value with your token from <Link href={`${appBase(appId)}/token`}>Token</Link>. Keep this file private.</p><CodeBlock title=".env" code="ALTARA_BOT_TOKEN=altara_bot_..." /></li>
          <li><h3>Install in a test server</h3><p>Open <Link href={`${appBase(appId)}/install`}>Installation</Link> and authorize the bot. Keep the four required command permissions. Existing installations need a server manager to review any changed permissions in Server Settings → Apps.</p></li>
          <li><h3>Run and try a command</h3><CodeBlock title="Run the downloaded starter" code={language === "js" ? "npm start" : `${python} main.py`} /><p>Keep the terminal open. The bot is online while its program is running and connected to ALTARA; sleep, shutdown or stopping the program takes it offline.</p><p>{language === "js" ? "In the test server, run /faq and choose a topic. The bot should reply with an answer." : "In the test server, run /calcular and choose somar with a=1.2 and b=2.3. The expected reply is Resultado: 3.5."}</p></li>
        </ol>
        <details className="advancedDetails developerSetupHelp"><summary>Bot still offline or not replying?</summary><ul className="developerList"><li>If the token is rejected, check the value in .env and restart after correcting it. Do not share the token or a screenshot of this file.</li><li>If no commands appear, check the startup message for successful command sync and confirm you installed the same bot.</li><li>If a command appears but cannot reply, check that the program is running and the bot can view the channel and send messages.</li><li>These downloads use slash commands. Replies to ordinary messages need handlers in your code, saved Intents and approved server permissions.</li></ul></details>
      </section>
      <section className="developerPanel">
        <h2>Adapt the code</h2>
        <CodeBlock title={language === "js" ? "Minimal command (index.js)" : "Minimal command (main.py)"} code={language === "js" ? jsExample : pyExample} />
        <p>The downloads contain /faq and /calcular. The minimal example above defines /ola-mundo instead; code sync disables missing code-managed commands. Use a dedicated test bot.</p>
      </section>
    </>
  );
}

function HostingPage({ appId }: { appId: string }) {
  return (
    <>
      <PageHeader title="Hosting" eyebrow="Keep the process running" description="Your bot is online only while your bot process is running." />
      <section className="developerPanel">
        <h2>Get the local example working first</h2>
        <p>Follow <Link href={`${appBase(appId)}/code`}>Start your bot</Link> for Windows or macOS/Linux. Once the bot replies, move the same code to a host that can keep its process running. Put ALTARA_BOT_TOKEN in the host&apos;s private environment settings.</p>
        <ul className="developerList">
          <li><b>Local PC:</b> testing only; the terminal must stay open.</li>
          <li><b>VPS:</b> simplest production option.</li>
          <li><b>Render/Railway/Fly.io:</b> app hosts that can keep a process online.</li>
          <li><b>PM2/Docker:</b> useful later for process management.</li>
          <li><b>No endpoint needed:</b> default Bot Token Connection mode needs no tunnel.</li>
          <li><b>Advanced Webhook Mode:</b> serverless/public HTTPS only.</li>
          <li><b>Voice:</b> connection and status helpers are available; the music example still needs an audio publisher.</li>
        </ul>
      </section>
    </>
  );
}

function WebhooksPage({ endpoint, onSave, onTest, busy }: { endpoint: EndpointInfo | null; onSave: (formData: FormData) => Promise<void>; onTest: () => Promise<void>; busy: string }) {
  return (
    <>
      <PageHeader title="Advanced Webhook Mode" eyebrow="Optional" description="Most bots do not need this. Use Bot Token Connection mode unless building a serverless webhook bot." />
      <section className="developerPanel">
        <p className="developerWarning">Webhook mode requires a public HTTPS endpoint and signed request verification. It is not the normal bot flow.</p>
        <form className="developerForm" action={(formData) => { void onSave(formData); }}>
          <label>Endpoint URL<input name="endpoint_url" defaultValue={endpoint?.endpoint_url || ""} placeholder="https://example.com/altara/interactions" /></label>
          <button className="devButton primary" type="submit" disabled={busy === "save-endpoint"}>Save endpoint</button>
          <button className="devButton secondary" type="button" onClick={() => { void onTest(); }} disabled={busy === "test-endpoint"}>Test endpoint</button>
        </form>
        <div className="developerMeta"><span>Status</span><code>{endpoint?.last_status || "not_configured"}</code></div>
      </section>
    </>
  );
}

function LogsPage({ logs, onRefresh }: { logs: AuditLog[]; onRefresh: () => void | Promise<void> | undefined }) {
  const actionLabels: Record<string, string> = {
    "bot.managed_role_synced": "Bot role synchronized",
    "bot.permissions_updated": "Server permissions updated",
    "bot.roles_updated": "Bot roles updated",
  };
  return (
    <>
      <PageHeader title="Logs" eyebrow="Audit" description="Recent bot configuration and token events." />
      <section className="developerPanel">
        <div className="developerLogToolbar"><h2>Recent activity</h2><button className="devButton secondary" type="button" onClick={() => { void onRefresh(); }}>Refresh</button></div>
        <div className="logList">
          {logs.length ? logs.map((log) => {
            const words = log.action.replace(/^bot\./, "").replace(/[._]/g, " ");
            const label = actionLabels[log.action] || words.charAt(0).toUpperCase() + words.slice(1);
            return <article className="logRow" key={log.id}>
              <div className="developerLogHeading"><b>{label}</b><time dateTime={log.created_at || undefined}>{formatDate(log.created_at)}</time></div>
              <details className="developerLogDetails"><summary>Technical details</summary>
                <div className="developerLogEvent"><span>Event</span><code>{log.action}</code></div>
                <pre><code>{JSON.stringify(log.metadata || {}, null, 2)}</code></pre>
              </details>
            </article>;
          }) : <EmptyState title="No logs" body="Bot audit logs will appear here." />}
        </div>
      </section>
    </>
  );
}

function AdvancedIdsPage({ app, copyText }: { app: DeveloperApp; copyText: (text: string, label?: string) => Promise<void> }) {
  return (
    <>
      <PageHeader title="Advanced IDs" eyebrow="Developer IDs" description="Most bot developers do not need these IDs during normal setup." />
      <section className="developerPanel">
        <div className="developerMeta"><span>Application ID / Client ID</span><code>{app.app_id}</code><button className="devButton secondary" type="button" onClick={() => { void copyText(app.app_id, "Application ID copied."); }}>Copy</button></div>
        <div className="developerMeta"><span>Public Bot ID</span><code>{app.bot_public_id || "Not available"}</code><button className="devButton secondary" type="button" disabled={!app.bot_public_id} onClick={() => { void copyText(String(app.bot_public_id || ""), "Bot ID copied."); }}>Copy</button></div>
      </section>
    </>
  );
}

function Docs() {
  const docs = [
    ["Quickstart", "Create a bot, copy the token once, define commands in code, and run the process."],
    ["Hosting", "Run locally for testing, then move to a VPS or app host for production."],
    ["Security", "Keep tokens out of URLs, frontend code, screenshots, and public logs."],
    ["Token safety", "Rotate tokens immediately if they leak."],
    ["Bot lifecycle", "A bot is online while its external process is running and connected to ALTARA."],
    ["Advanced Webhook Mode", "Use only for serverless HTTPS interaction delivery."],
  ];
  return (
    <>
      <PageHeader title="Docs" eyebrow="ALTARA bots" description="Build bots for ALTARA with token connection mode, synced commands, and external hosting." />
      <BotStarterDownloads />
      <section className="developerPanel">
        <h2>Moving a Discord bot</h2>
        <p>You need access to the bot&apos;s code and permission to modify it. Reuse its business logic, then adapt command registration, options and replies. Discord tokens and IDs do not work in ALTARA; third-party bots need an ALTARA version from their maintainer.</p>
        <ol className="developerList">
          <li>Create a dedicated test bot, copy its token once and install it with the four default permissions.</li>
          <li>Extract a starter, copy .env.example to .env, set ALTARA_BOT_TOKEN and follow its README.</li>
          <li>Run /faq in JavaScript or /calcular in Python. Try valid inputs, errors and channel permission denials.</li>
          <li>Compare the included Discord reference with the ALTARA adapter; both call the same separate business logic.</li>
        </ol>
        <p>altara.js and altara.py are source clients included in the downloads. There is no advertised official npm/PyPI package or drop-in discord.js/discord.py compatibility.</p>
        <h3>Current support</h3>
        <ul className="developerList">
          <li>Slash commands, options, text replies, roles, colours and channel permission checks.</li>
          <li>Optional grants: link previews, bounded public history, reactions, pins and editing/deleting the bot&apos;s own messages.</li>
          <li>Voice playback with pause, queue and volume controls, public playlist lookup and scoped connection recovery.</li>
          <li>Polling events include messages, members, reactions, visible basic presence, voice changes and threads. Saved Intents, approved server grants and client intents must agree.</li>
          <li>Buttons, selection menus and text forms are available for Bot Token Connection clients. Read the interactive messages guide for setup and limits.</li>
          <li>Structured message cards are available through the JavaScript and Python clients. Use an updated ALTARA chat client to display them. Read the Client API guide for limits and examples.</li>
          <li>Private file uploads, explicit member mentions, role and member moderation, server/channel/event management, threads and scoped webhooks.</li>
          <li>Dedicated bot DMs and microphone sharing require each member&apos;s explicit consent; microphone sharing includes visible stop controls.</li>
        </ul>
        <p>The platform backend was activated on 2 October 2026. Bot owners must request the required grants and server administrators must approve them. Existing installations retain their previous grants.</p>
        <p><a href="/bot-starters/ALTARA_BOTS_CAPABILITIES.md" target="_blank" rel="noreferrer">Bot platform capabilities and next steps</a></p>
        <p><a href="/bot-starters/ALTARA_BOTS_COMPONENTS.md" target="_blank" rel="noreferrer">Interactive messages: buttons, menus and forms</a></p>
        <p><a href="/bot-starters/ALTARA_BOTS_PLATFORM_V2.md" target="_blank" rel="noreferrer">Files, moderation, events, threads and consenting conversations</a></p>
        <p><a href="/bot-starters/ALTARA_BOTS_AUDIO_CAPTURE.md" target="_blank" rel="noreferrer">Microphone sharing and recording consent</a></p>
        <p>The two migration examples were tested locally with fake API credentials. Their Discord references have not been authenticated in a live Discord session. Hosted token rotation and lifecycle checks require a dedicated test bot.</p>
      </section>
      <section className="developerDocsGrid">
        {docs.map(([title, body]) => <article className="developerPanel docCard" key={title}><h2>{title}</h2><p>{body}</p></article>)}
      </section>
      <section className="developerPanel">
        <h2>Core flow</h2>
        <ol className="developerSteps">
          <li>Create a bot.</li>
          <li>Copy the one-time bot token into <code>ALTARA_BOT_TOKEN</code>.</li>
          <li>Write commands with <code>bot.command()</code>.</li>
          <li>Run the process locally, on a VPS, or on an app host.</li>
          <li>Install the bot into a server using the install URL.</li>
        </ol>
      </section>
    </>
  );
}

function BotStarterDownloads() {
  return <section className="developerPanel developerStarterDownloads">
    <h2>Source clients and complete starters</h2>
    <p>Download the client together with a runnable example, private token template, setup instructions and Discord migration reference. Customize the FAQ answers or calculator logic for your bot.</p>
    <div className="copyRow">
      <a className="devButton primary" href="/bot-starters/altara-faq-node.zip" download>FAQ bot (JavaScript)</a>
      <a className="devButton primary" href="/bot-starters/altara-calculator-python.zip" download>Calculator bot (Python)</a>
      <a className="devButton primary" href="/bot-starters/altara-music-node.zip" download>Music bot (JavaScript)</a>
      <a className="devButton" href="/bot-starters/ALTARA_BOTS_MUSIC.md" target="_blank" rel="noreferrer">Music setup guide</a>
    </div>
    <div className="copyRow">
      <a className="devButton secondary" href="/bot-starters/ALTARA_BOTS_DISCORD_MIGRATION.md" download>Discord migration guide</a>
      <a className="devButton secondary" href="/bot-starters/ALTARA_BOTS_SDK.md" download>Client API guide</a>
    </div>
    <p className="developerFootnote">Keep .env private. ALTARA syncs the code registry at startup, so run these starters on a separate test bot.</p>
  </section>;
}

function PageHeader({ title, eyebrow, description, nested = false }: { title: string; eyebrow: string; description: string; nested?: boolean }) {
  const Tag = nested ? "div" : "header";
  return <Tag className="developerHeader"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></Tag>;
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div className="codeBlock">
      <div><span>{title}</span><button className="devButton secondary compactButton" type="button" onClick={() => { void copyCode(); }}>{copied ? "Copied" : "Copy"}</button></div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function EmptyState({ title, body, actionLabel, actionHref, onAction }: { title: string; body: string; actionLabel?: string; actionHref?: string; onAction?: () => void }) {
  return (
    <div className="emptyState">
      <b>{title}</b>
      <p>{body}</p>
      {actionLabel && actionHref ? <Link className="devButton primary" href={actionHref}>{actionLabel}</Link> : null}
      {actionLabel && onAction ? <button className="devButton primary" type="button" onClick={onAction}>{actionLabel}</button> : null}
    </div>
  );
}

function PageLoading({ label }: { label: string }) {
  return <div className="devLoading"><span className="developerSpinner" aria-hidden="true" />{label}</div>;
}

function ScopedError({ title, body }: { title: string; body: string }) {
  return <div className="developerScopedError"><b>{title}</b><p>{body}</p></div>;
}
