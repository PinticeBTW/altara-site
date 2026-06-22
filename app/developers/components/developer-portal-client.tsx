"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getSupabaseBrowserClient } from "@/app/lib/supabase-browser";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

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

type SecretNotice = {
  kind: "bot-token";
  label: string;
  value: string;
};

type RouteState = {
  kind: "home" | "bots" | "docs" | "bot";
  appId: string;
  section: string;
};

type DynamicRpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

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
  { key: "bot:admin", label: "Administrator", supported: false, note: "Not recommended unless required." },
  { key: "bot:manage_server", label: "Manage Server", supported: false, note: "Coming Soon." },
  { key: "bot:manage_channels", label: "Manage Channels", supported: false, note: "Coming Soon." },
  { key: "bot:voice_connect", label: "Voice Permissions", supported: false, note: "Coming Soon." },
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

function optionCount(options: JsonValue | undefined): number {
  return Array.isArray(options) ? options.length : 0;
}

function fileExtension(file: File): string {
  const nameExt = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (nameExt && ["png", "jpg", "jpeg", "webp", "gif"].includes(nameExt)) return nameExt === "jpeg" ? "jpg" : nameExt;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
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
  const router = useRouter();
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
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_PERMISSIONS);
  const [busyAction, setBusyAction] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const selectedBot = useMemo(() => {
    if (route.appId) return bots.find((app) => app.app_id === route.appId) || null;
    return bots[0] || null;
  }, [bots, route.appId]);

  const installUrl = selectedBot?.app_id ? buildInstallUrl(selectedBot.app_id, permissions) : "";

  useEffect(() => {
    let disposed = false;
    supabase.auth.getSession().then(({ data }) => {
      if (disposed) return;
      const sessionUser = data.session?.user || null;
      setUser(sessionUser);
      setAuthLoading(false);
      if (!sessionUser) {
        const returnTo = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login.html?return_to=${encodeURIComponent(returnTo)}`);
      }
    }).catch(() => {
      if (!disposed) setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (disposed) return;
      setUser(session?.user || null);
    });
    return () => {
      disposed = true;
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
    const rpcCall = supabase.rpc.bind(supabase) as unknown as DynamicRpc;
    const { data, error } = await rpcCall(name, payload);
    if (error) throw error;
    return data as T;
  }

  async function loadBots() {
    setBotsLoading(true);
    try {
      const rows = await rpc<DeveloperApp[]>("bots_list_my_apps", {});
      setBots(Array.isArray(rows) ? rows : []);
      setBotsError("");
    } catch (error) {
      setBots([]);
      setBotsError(`Could not load bots: ${errorMessage(error)}`);
    } finally {
      setBotsLoading(false);
    }
  }

  async function loadSelectedBotDetails(app: DeveloperApp) {
    if (app.app_id) {
      try {
        const row = firstRow<DeveloperApp>(await rpc("bots_get_my_app_profile", { p_app_id: app.app_id }));
        if (row) setBots((current) => current.map((entry) => entry.app_id === app.app_id ? { ...entry, ...row } : entry));
      } catch {
        // Optional profile-media patch; core bot list still works without it.
      }
    }
    if (app.bot_id) {
      await Promise.all([loadCommands(app.bot_id), loadLogs(app.bot_id), loadEndpoint(app.app_id)]);
    } else {
      setCommands([]);
      setLogs([]);
      setEndpoint(null);
    }
  }

  async function loadCommands(botId: string) {
    try {
      const rows = await rpc<BotCommand[]>("bots_list_app_commands", { p_bot_id: botId });
      setCommands(Array.isArray(rows) ? rows : []);
    } catch {
      setCommands([]);
    }
  }

  async function loadLogs(botId: string) {
    try {
      const { data, error } = await supabase
        .from("bot_audit_logs")
        .select("id, action, metadata, created_at")
        .eq("bot_id", botId)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      setLogs(Array.isArray(data) ? data as AuditLog[] : []);
    } catch {
      setLogs([]);
    }
  }

  async function loadEndpoint(appId: string) {
    try {
      const row = firstRow<EndpointInfo>(await rpc("bots_get_interaction_endpoint", { p_app_id: appId }));
      setEndpoint(row);
    } catch {
      setEndpoint(null);
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
    setBusyAction(name);
    setNotice(null);
    try {
      return await action();
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
      return null;
    } finally {
      setBusyAction("");
    }
  }

  function validateImage(file: File) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Upload PNG, JPG/JPEG, WEBP, or GIF images only.");
    if (file.size > IMAGE_MAX_BYTES) throw new Error("Image is too large. Maximum size is 10MB.");
  }

  async function uploadImage(file: File, kind: "bot-avatar" | "bot-banner", appId: string) {
    if (!user) throw new Error("Sign in before uploading images.");
    validateImage(file);
    const ext = fileExtension(file);
    const path = `${user.id}/developer-bots/${appId}/${kind}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }

  async function handleCreateBot(formData: FormData) {
    await runAction("create-bot", async () => {
      const name = String(formData.get("bot_name") || formData.get("app_name") || "").trim();
      const description = String(formData.get("description") || "").trim();
      if (!name) throw new Error("Bot name is required.");
      const appRow = firstRow<{ app_id: string }>(await rpc("bots_create_developer_app", {
        p_name: name,
        p_description: description,
        p_icon_url: null,
      }));
      if (!appRow?.app_id) throw new Error("Bot was not created.");
      let avatarUrl = "";
      const avatar = formData.get("avatar_file");
      if (avatar instanceof File && avatar.size > 0) avatarUrl = await uploadImage(avatar, "bot-avatar", appRow.app_id);
      const botRow = firstRow<{ bot_id: string; bot_token?: string }>(await rpc("bots_create_bot", {
        p_app_id: appRow.app_id,
        p_name: name,
        p_description: description,
        p_avatar_url: avatarUrl || null,
      }));
      if (botRow?.bot_token) setSecretNotice({ kind: "bot-token", label: "Bot token shown once", value: botRow.bot_token });
      await loadBots();
      setCreateModalOpen(false);
      router.push(`${appBase(appRow.app_id)}/token`);
      setNotice({ tone: "success", message: "Bot created. Copy the token now; it will not be shown again." });
    });
  }

  async function handleSaveProfile(formData: FormData) {
    if (!selectedBot?.bot_id) return;
    await runAction("save-profile", async () => {
      let avatarUrl = String(formData.get("avatar_url") || selectedBot.bot_avatar_url || "").trim();
      let bannerUrl = String(formData.get("banner_url") || selectedBot.bot_banner_url || "").trim();
      const avatar = formData.get("avatar_file");
      const banner = formData.get("banner_file");
      if (avatar instanceof File && avatar.size > 0) avatarUrl = await uploadImage(avatar, "bot-avatar", selectedBot.app_id);
      if (banner instanceof File && banner.size > 0) bannerUrl = await uploadImage(banner, "bot-banner", selectedBot.app_id);
      await rpc("bots_update_bot_profile", {
        p_bot_id: selectedBot.bot_id,
        p_name: String(formData.get("name") || "").trim(),
        p_description: String(formData.get("description") || "").trim(),
        p_avatar_url: avatarUrl || null,
        p_banner_url: bannerUrl || null,
        p_is_public: selectedBot.bot_is_public === true,
      });
      await loadBots();
      setNotice({ tone: "success", message: "Bot profile saved." });
    });
  }

  async function handleSaveInstall(formData: FormData) {
    if (!selectedBot?.bot_id) return;
    await runAction("save-install", async () => {
      await rpc("bots_update_bot_profile", {
        p_bot_id: selectedBot.bot_id,
        p_name: botName(selectedBot),
        p_description: botDescription(selectedBot),
        p_avatar_url: botAvatar(selectedBot) || null,
        p_banner_url: selectedBot.bot_banner_url || null,
        p_is_public: formData.get("is_public") === "on",
      });
      await loadBots();
      setNotice({ tone: "success", message: "Install settings saved." });
    });
  }

  async function handleToken(action: "regenerate" | "revoke") {
    if (!selectedBot?.bot_id) return;
    await runAction(action, async () => {
      if (action === "revoke") {
        await rpc("bots_revoke_token", { p_bot_id: selectedBot.bot_id });
        setSecretNotice(null);
        setNotice({ tone: "success", message: "Token revoked. Regenerate it before running this bot again." });
      } else {
        const row = firstRow<{ bot_token?: string }>(await rpc("bots_regenerate_token", { p_bot_id: selectedBot.bot_id }));
        if (row?.bot_token) setSecretNotice({ kind: "bot-token", label: "Regenerated token shown once", value: row.bot_token });
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
      <StatusNotice notice={notice} secret={secretNotice} onCopySecret={() => secretNotice ? copyText(secretNotice.value, "Token copied.") : undefined} />
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

    if (["profile", "overview", "bot", "general"].includes(route.section)) return <BotProfilePage app={selectedBot} onSave={handleSaveProfile} busy={busyAction} />;
    if (route.section === "token") return <TokenPage app={selectedBot} onToken={handleToken} busy={busyAction} />;
    if (["install", "installation", "oauth2"].includes(route.section)) return <InstallPage app={selectedBot} installUrl={installUrl} onSave={handleSaveInstall} busy={busyAction} copyText={copyText} />;
    if (route.section === "permissions") return <PermissionsPage permissions={permissions} setPermissions={setPermissions} copyText={copyText} />;
    if (route.section === "intents") return <IntentsPage />;
    if (route.section === "commands") return <CommandsPage app={selectedBot} commands={commands} onManual={handleManualCommand} busy={busyAction} />;
    if (route.section === "code") return <CodePage />;
    if (route.section === "hosting") return <HostingPage />;
    if (["webhooks", "interactions"].includes(route.section)) return <WebhooksPage endpoint={endpoint} onSave={handleSaveEndpoint} onTest={handleTestEndpoint} busy={busyAction} />;
    if (route.section === "logs") return <LogsPage logs={logs} onRefresh={() => selectedBot.bot_id ? loadLogs(selectedBot.bot_id) : undefined} />;
    if (["advanced-ids", "ids"].includes(route.section)) return <AdvancedIdsPage app={selectedBot} copyText={copyText} />;
    return <BotProfilePage app={selectedBot} onSave={handleSaveProfile} busy={busyAction} />;
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
          <strong>ALTARA Developer Portal</strong>
        </Link>
        <nav className="developerTopNav" aria-label="Developer top navigation">
          <Link href="/developers/applications">My Bots</Link>
          <Link href="/developers/docs">Docs</Link>
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
        <aside className="developerSidebar">
          <Link className="developerBackLink" href="/developers/applications">{"<-"} My Bots</Link>
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
          <nav className="developerNav" aria-label="Bot sections">
            <Link className={route.kind === "bots" || route.kind === "home" ? "active" : ""} href="/developers/applications">My Bots</Link>
            {selectedId ? <span className="developerNavSection">Bot</span> : null}
            {nav.map(([label, href]) => <Link key={href} className={activePath(href) ? "active" : ""} href={href}>{label}</Link>)}
            <Link className={route.kind === "docs" ? "active" : ""} href="/developers/docs">Docs</Link>
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

function BotProfilePage({ app, onSave, busy }: { app: DeveloperApp; onSave: (formData: FormData) => Promise<void>; busy: string }) {
  return (
    <>
      <PageHeader title="Profile" eyebrow="Bot Profile" description="Set how your bot appears in ALTARA servers." />
      <section className="developerGrid two">
        <div className="developerPanel botProfilePreview">
          <BannerPreview url={app.bot_banner_url} />
          <AvatarPreview url={botAvatar(app)} label={botName(app)} className="large overlap" />
          <h2>{botName(app)} <span className="botBadgeInline">BOT</span></h2>
          <p>{botDescription(app) || "No description yet."}</p>
        </div>
        <form className="developerPanel developerForm" action={(formData) => { void onSave(formData); }}>
          <label className="uploadButton">Upload avatar<input name="avatar_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
          <label className="uploadButton">Upload banner<input name="banner_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
          <small>PNG, JPG/JPEG, WEBP, or GIF. Max 10MB. SVG and scripts are not accepted.</small>
          <label>Name<input name="name" defaultValue={botName(app)} maxLength={80} required /></label>
          <label>Description<textarea name="description" defaultValue={botDescription(app)} maxLength={400} rows={4} /></label>
          <details className="advancedDetails"><summary>Advanced: use image URL</summary><label>Avatar URL<input name="avatar_url" defaultValue={botAvatar(app)} placeholder="https://..." /></label><label>Banner URL<input name="banner_url" defaultValue={app.bot_banner_url || ""} placeholder="https://..." /></label></details>
          <button className="devButton primary" type="submit" disabled={busy === "save-profile"}>{busy === "save-profile" ? "Saving..." : "Save"}</button>
        </form>
      </section>
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
          <button className="devButton secondary" type="button" onClick={() => { void onToken("regenerate"); }} disabled={busy === "regenerate"}>Reset / Regenerate token</button>
          <button className="devButton danger" type="button" onClick={() => { void onToken("revoke"); }} disabled={busy === "revoke"}>Revoke token</button>
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

function PermissionsPage({ permissions, setPermissions, copyText }: { permissions: string[]; setPermissions: (value: string[]) => void; copyText: (text: string, label?: string) => Promise<void> }) {
  const output = permissions.join(",");
  return (
    <>
      <PageHeader title="Permissions" eyebrow="Simple permission set" description="Start with the few permissions your bot actually needs." />
      <section className="developerPanel">
        {PERMISSIONS.map((item) => (
          <label className={`toggleLine permissionLine ${item.supported ? "" : "disabled"}`} key={item.key}>
            <input
              type="checkbox"
              disabled={!item.supported}
              checked={permissions.includes(item.key)}
              onChange={(event) => {
                if (event.target.checked) setPermissions([...permissions, item.key]);
                else setPermissions(permissions.filter((key) => key !== item.key));
              }}
            />
            <span><b>{item.label}</b><small>{item.note}</small></span>
          </label>
        ))}
        <div className="permissionOutput">
          <span>ALTARA permission list</span>
          <code>{output || "No permissions selected"}</code>
          <button className="devButton secondary" type="button" onClick={() => { void copyText(output, "Permissions copied."); }}>Copy</button>
        </div>
      </section>
    </>
  );
}

function IntentsPage() {
  const intents = [
    ["Presence Intent", "Read presence status when your bot needs presence data."],
    ["Server Members Intent", "Read member data when your bot needs member lists."],
    ["Message Content Intent", "Slash commands usually do not need Message Content."],
  ];
  return (
    <>
      <PageHeader title="Intents" eyebrow="Privileged data" description="Only enable an intent if your bot needs this data." />
      <section className="developerPanel">
        {intents.map(([label, copy]) => <label className="toggleLine disabled permissionLine" key={label}><input type="checkbox" disabled /><span><b>{label}</b><small>{copy} Coming Soon.</small></span></label>)}
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

function CodePage() {
  const [language, setLanguage] = useState<"js" | "py">("js");
  const jsExample = 'const { AltaraClient } = require("./altara-client");\n\nconst bot = new AltaraClient({\n  token: process.env.ALTARA_BOT_TOKEN,\n});\n\nbot.command("ola-mundo", {\n  description: "Primeiro comando do bot",\n}, async (ctx) => {\n  await ctx.reply("Olá mundo!");\n});\n\nbot.login();';
  const pyExample = 'import os\nfrom altara import AltaraClient\n\nbot = AltaraClient(token=os.getenv("ALTARA_BOT_TOKEN"))\n\n@bot.command("ola-mundo", description="Primeiro comando do bot")\nasync def ola_mundo(ctx):\n    await ctx.reply("Olá mundo!")\n\nbot.run()';
  return (
    <>
      <PageHeader title="Code" eyebrow="Run externally" description="You do not paste code into ALTARA. You run it on your PC, VPS, or hosting provider." />
      <section className="developerPanel">
        <div className="segmented"><button className={language === "js" ? "active" : ""} type="button" onClick={() => setLanguage("js")}>JavaScript</button><button className={language === "py" ? "active" : ""} type="button" onClick={() => setLanguage("py")}>Python</button></div>
        <CodeBlock title=".env" code="ALTARA_BOT_TOKEN=altara_bot_..." />
        <CodeBlock title={language === "js" ? "Commands" : "Commands"} code={language === "js" ? "npm install\nnpm start" : "pip install -r requirements.txt\npython main.py"} />
        <CodeBlock title={language === "js" ? "index.js" : "main.py"} code={language === "js" ? jsExample : pyExample} />
      </section>
    </>
  );
}

function HostingPage() {
  return (
    <>
      <PageHeader title="Hosting" eyebrow="Keep the process running" description="Your bot is online only while your bot process is running." />
      <section className="developerPanel">
        <ul className="developerList">
          <li><b>Local PC:</b> testing only; the terminal must stay open.</li>
          <li><b>VPS:</b> simplest production option.</li>
          <li><b>Render/Railway/Fly.io:</b> app hosts that can keep a process online.</li>
          <li><b>PM2/Docker:</b> useful later for process management.</li>
          <li><b>No endpoint needed:</b> default Bot Token Connection mode needs no tunnel.</li>
          <li><b>Advanced Webhook Mode:</b> serverless/public HTTPS only.</li>
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
  return (
    <>
      <PageHeader title="Logs" eyebrow="Audit" description="Recent bot configuration and token events." />
      <section className="developerPanel">
        <button className="devButton secondary" type="button" onClick={() => { void onRefresh(); }}>Refresh</button>
        <div className="logList">
          {logs.length ? logs.map((log) => <div className="logRow" key={log.id}><b>{log.action}</b><span>{formatDate(log.created_at)}</span><code>{JSON.stringify(log.metadata || {})}</code></div>) : <EmptyState title="No logs" body="Bot audit logs will appear here." />}
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
