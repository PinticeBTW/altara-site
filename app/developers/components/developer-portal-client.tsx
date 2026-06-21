"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
  signing_secret_prefix?: string | null;
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
  interaction_endpoint_url?: string | null;
  interaction_endpoint_verified_at?: string | null;
  interaction_endpoint_verification_status?: string | null;
  last_interaction_error?: string | null;
};

type BotCommand = {
  command_id: string;
  server_id?: string | null;
  name: string;
  description?: string | null;
  options?: JsonValue;
  callback_url?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AuditLog = {
  id: string;
  action: string;
  server_id?: string | null;
  channel_id?: string | null;
  actor_user_id?: string | null;
  metadata?: JsonValue;
  created_at?: string | null;
};

type EndpointInfo = {
  endpoint_url?: string | null;
  endpoint_host?: string | null;
  verified?: boolean | null;
  verified_at?: string | null;
  last_tested_at?: string | null;
  last_status?: string | null;
  last_error?: string | null;
};

type Notice = {
  tone: "info" | "success" | "error";
  message: string;
};

type SecretNotice = {
  kind: "bot-token" | "signing-secret";
  label: string;
  value: string;
};

type DynamicRpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

type RouteState = {
  kind: "home" | "applications" | "docs" | "app";
  appId: string;
  section: string;
};

const ALTARA_PUBLIC_ORIGIN = "https://altaraapp.com";
const SUPPORTED_PERMISSIONS = [
  { key: "bot:send_messages", label: "Send messages", group: "Text permissions", enabled: true },
  { key: "bot:use_slash_commands", label: "Use slash commands", group: "Text permissions", enabled: true },
  { key: "bot:read_basic_channel_metadata", label: "Read channel names", group: "General permissions", enabled: true },
  { key: "bot:manage_own_commands", label: "Manage own commands", group: "General permissions", enabled: true },
  { key: "bot:admin", label: "Admin", group: "General permissions", enabled: false },
  { key: "bot:manage_server", label: "Manage server", group: "General permissions", enabled: false },
  { key: "bot:manage_channels", label: "Manage channels", group: "General permissions", enabled: false },
  { key: "bot:read_message_history", label: "Read message history", group: "Text permissions", enabled: false },
  { key: "bot:voice_connect", label: "Connect", group: "Voice permissions", enabled: false },
  { key: "bot:voice_speak", label: "Speak", group: "Voice permissions", enabled: false },
] as const;

const DEFAULT_PERMISSIONS = [
  "bot:send_messages",
  "bot:use_slash_commands",
  "bot:read_basic_channel_metadata",
  "bot:manage_own_commands",
];

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

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
  if (!slug.length) return { kind: "home", appId: "", section: "overview" };
  if (slug[0] === "docs") return { kind: "docs", appId: "", section: "docs" };
  if (slug[0] !== "applications") return { kind: "home", appId: "", section: "overview" };
  if (!slug[1]) return { kind: "applications", appId: "", section: "applications" };
  return {
    kind: "app",
    appId: normalizeId(slug[1]),
    section: slug[2] || "overview",
  };
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

function AvatarPreview({ url, label, className = "" }: { url?: string | null; label: string; className?: string }) {
  const initial = String(label || "A").trim().charAt(0).toUpperCase() || "A";
  return (
    <div
      className={`devAvatar ${className}`}
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
      aria-label={label}
    >
      {!url ? <span>{initial}</span> : null}
    </div>
  );
}

function BannerPreview({ url }: { url?: string | null }) {
  return (
    <div className="devBannerPreview" style={url ? { backgroundImage: `url("${url}")` } : undefined}>
      {!url ? <span>Banner placeholder</span> : null}
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
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [endpoint, setEndpoint] = useState<EndpointInfo | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [secretNotice, setSecretNotice] = useState<SecretNotice | null>(null);
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_PERMISSIONS);
  const [busyAction, setBusyAction] = useState("");

  const selectedApp = useMemo(() => {
    if (route.appId) return apps.find((app) => app.app_id === route.appId) || null;
    return apps[0] || null;
  }, [apps, route.appId]);

  const installUrl = selectedApp?.app_id ? buildInstallUrl(selectedApp.app_id, permissions) : "";

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

  async function rpc<T>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
    const rpcCall = supabase.rpc as unknown as DynamicRpc;
    const { data, error } = await rpcCall(name, payload);
    if (error) throw error;
    return data as T;
  }

  async function loadApps() {
    setAppsLoading(true);
    try {
      const rows = await rpc<DeveloperApp[]>("bots_list_my_apps", {});
      setApps(Array.isArray(rows) ? rows : []);
      setNotice(null);
    } catch (error) {
      setNotice({ tone: "error", message: `Could not load Developer Portal: ${errorMessage(error)}` });
      setApps([]);
    } finally {
      setAppsLoading(false);
    }
  }

  async function loadSelectedAppDetails(app: DeveloperApp) {
    if (app.app_id) {
      try {
        const row = firstRow<DeveloperApp>(await rpc("bots_get_my_app_profile", { p_app_id: app.app_id }));
        if (row) {
          setApps((current) => current.map((entry) => entry.app_id === app.app_id ? { ...entry, ...row } : entry));
        }
      } catch {
        // Optional manual patch; base portal still works without it.
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
        .select("id, action, server_id, channel_id, actor_user_id, metadata, created_at")
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
    const timer = window.setTimeout(() => { void loadApps(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user || !selectedApp) return;
    const timer = window.setTimeout(() => { void loadSelectedAppDetails(selectedApp); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedApp?.app_id, selectedApp?.bot_id]);

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

  async function uploadImage(file: File, kind: "app-icon" | "bot-avatar" | "bot-banner", appId: string) {
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
      const appName = String(formData.get("app_name") || "").trim();
      const botName = String(formData.get("bot_name") || "").trim() || `${appName} Bot`;
      const description = String(formData.get("description") || "").trim();
      if (!appName) throw new Error("Application name is required.");
      const appRow = firstRow<{ app_id: string; signing_secret?: string }>(await rpc("bots_create_developer_app", {
        p_name: appName,
        p_description: description,
        p_icon_url: null,
      }));
      if (!appRow?.app_id) throw new Error("Application was not created.");
      let avatarUrl = "";
      const avatar = formData.get("avatar_file");
      if (avatar instanceof File && avatar.size > 0) avatarUrl = await uploadImage(avatar, "bot-avatar", appRow.app_id);
      const botRow = firstRow<{ bot_id: string; bot_token?: string }>(await rpc("bots_create_bot", {
        p_app_id: appRow.app_id,
        p_name: botName,
        p_description: description,
        p_avatar_url: avatarUrl || null,
      }));
      if (appRow.signing_secret) {
        setSecretNotice({ kind: "signing-secret", label: "Signing secret shown once", value: appRow.signing_secret });
      }
      if (botRow?.bot_token) {
        setSecretNotice({ kind: "bot-token", label: "Bot token shown once", value: botRow.bot_token });
      }
      await loadApps();
      router.push(`${appBase(appRow.app_id)}/bot`);
      setNotice({ tone: "success", message: "Bot created. Copy the token now; it will not be shown again." });
    });
  }

  async function handleSaveGeneral(formData: FormData) {
    if (!selectedApp) return;
    await runAction("save-general", async () => {
      let iconUrl = String(formData.get("icon_url") || selectedApp.app_icon_url || "").trim();
      const iconFile = formData.get("icon_file");
      if (iconFile instanceof File && iconFile.size > 0) iconUrl = await uploadImage(iconFile, "app-icon", selectedApp.app_id);
      await rpc("bots_update_app_profile", {
        p_app_id: selectedApp.app_id,
        p_name: String(formData.get("name") || "").trim(),
        p_description: String(formData.get("description") || "").trim(),
        p_icon_url: iconUrl || null,
        p_banner_url: selectedApp.app_banner_url || null,
      });
      await loadApps();
      setNotice({ tone: "success", message: "Application saved." });
    });
  }

  async function handleCreateBotForApp(formData: FormData) {
    if (!selectedApp) return;
    await runAction("create-bot-for-app", async () => {
      let avatarUrl = String(formData.get("avatar_url") || "").trim();
      const avatar = formData.get("avatar_file");
      if (avatar instanceof File && avatar.size > 0) avatarUrl = await uploadImage(avatar, "bot-avatar", selectedApp.app_id);
      const row = firstRow<{ bot_id: string; bot_token?: string }>(await rpc("bots_create_bot", {
        p_app_id: selectedApp.app_id,
        p_name: String(formData.get("name") || "").trim(),
        p_description: String(formData.get("description") || "").trim(),
        p_avatar_url: avatarUrl || null,
      }));
      if (row?.bot_token) setSecretNotice({ kind: "bot-token", label: "Bot token shown once", value: row.bot_token });
      await loadApps();
      setNotice({ tone: "success", message: "Bot created. Copy the token now." });
    });
  }

  async function handleSaveBot(formData: FormData) {
    if (!selectedApp?.bot_id) return;
    await runAction("save-bot", async () => {
      let avatarUrl = String(formData.get("avatar_url") || selectedApp.bot_avatar_url || "").trim();
      let bannerUrl = String(formData.get("banner_url") || selectedApp.bot_banner_url || "").trim();
      const avatar = formData.get("avatar_file");
      const banner = formData.get("banner_file");
      if (avatar instanceof File && avatar.size > 0) avatarUrl = await uploadImage(avatar, "bot-avatar", selectedApp.app_id);
      if (banner instanceof File && banner.size > 0) bannerUrl = await uploadImage(banner, "bot-banner", selectedApp.app_id);
      await rpc("bots_update_bot_profile", {
        p_bot_id: selectedApp.bot_id,
        p_name: String(formData.get("name") || "").trim(),
        p_description: String(formData.get("description") || "").trim(),
        p_avatar_url: avatarUrl || null,
        p_banner_url: bannerUrl || null,
        p_is_public: formData.get("is_public") === "on",
      });
      await loadApps();
      setNotice({ tone: "success", message: "Bot profile saved." });
    });
  }

  async function handleToken(action: "regenerate" | "revoke") {
    if (!selectedApp?.bot_id) return;
    await runAction(action, async () => {
      if (action === "revoke") {
        await rpc("bots_revoke_token", { p_bot_id: selectedApp.bot_id });
        setSecretNotice(null);
        setNotice({ tone: "success", message: "Token revoked. Regenerate it before running this bot again." });
      } else {
        const row = firstRow<{ bot_token?: string }>(await rpc("bots_regenerate_token", { p_bot_id: selectedApp.bot_id }));
        if (row?.bot_token) setSecretNotice({ kind: "bot-token", label: "Regenerated token shown once", value: row.bot_token });
        setNotice({ tone: "success", message: "Token regenerated. Copy it now." });
      }
      await loadApps();
    });
  }

  async function handleSaveEndpoint(formData: FormData) {
    if (!selectedApp) return;
    await runAction("save-endpoint", async () => {
      const row = firstRow<EndpointInfo>(await rpc("bots_save_interaction_endpoint", {
        p_app_id: selectedApp.app_id,
        p_endpoint_url: String(formData.get("endpoint_url") || "").trim(),
      }));
      setEndpoint(row);
      setNotice({ tone: "success", message: "Webhook endpoint saved. Use this only for Advanced Webhook Mode." });
    });
  }

  async function handleTestEndpoint() {
    if (!selectedApp) return;
    await runAction("test-endpoint", async () => {
      const { data, error } = await supabase.functions.invoke("altara-bot-interaction-dispatch", {
        body: { action: "verify_endpoint", app_id: selectedApp.app_id },
      });
      if (error) throw error;
      const result = asRecord(data);
      if (result.ok !== true) throw new Error(String(result.error || "verification_failed"));
      await loadEndpoint(selectedApp.app_id);
      setNotice({ tone: "success", message: "Endpoint verified." });
    });
  }

  async function handleManualCommand(formData: FormData) {
    if (!selectedApp?.bot_id) return;
    await runAction("manual-command", async () => {
      await rpc("bots_upsert_slash_command", {
        p_bot_id: selectedApp.bot_id,
        p_name: String(formData.get("name") || "").trim().replace(/^\//, "").toLowerCase(),
        p_description: String(formData.get("description") || "").trim(),
        p_options: [],
        p_callback_url: null,
        p_server_id: null,
      });
      await loadCommands(selectedApp.bot_id || "");
      setNotice({ tone: "success", message: "Manual command saved. Code sync remains the normal flow." });
    });
  }

  if (authLoading) {
    return <DeveloperPortalFrame route={route}><div className="devLoading">Checking session...</div></DeveloperPortalFrame>;
  }

  if (!user) {
    return <DeveloperPortalFrame route={route}><div className="devLoading">Redirecting to login...</div></DeveloperPortalFrame>;
  }

  return (
    <DeveloperPortalFrame route={route} apps={apps} selectedApp={selectedApp} userEmail={user.email || ""}>
      <StatusNotice notice={notice} secret={secretNotice} onCopySecret={() => secretNotice ? copyText(secretNotice.value, "Secret copied.") : undefined} />
      {renderContent()}
    </DeveloperPortalFrame>
  );

  function renderContent() {
    if (route.kind === "home") return <Overview apps={apps} appsLoading={appsLoading} onCreate={handleCreateBot} busy={busyAction} />;
    if (route.kind === "applications") return <Applications apps={apps} loading={appsLoading} onCreate={handleCreateBot} busy={busyAction} />;
    if (route.kind === "docs") return <Docs />;
    if (!selectedApp) return <EmptyState title="Application not found" body="Create an application or choose one from the app menu." />;
    if (route.section === "general") return <General app={selectedApp} onSave={handleSaveGeneral} busy={busyAction} copyText={copyText} />;
    if (route.section === "bot") return <BotPage app={selectedApp} onCreate={handleCreateBotForApp} onSave={handleSaveBot} onToken={handleToken} busy={busyAction} />;
    if (route.section === "installation" || route.section === "oauth2") return <Installation app={selectedApp} permissions={permissions} setPermissions={setPermissions} installUrl={installUrl} copyText={copyText} />;
    if (route.section === "permissions") return <Permissions permissions={permissions} setPermissions={setPermissions} copyText={copyText} />;
    if (route.section === "commands") return <Commands app={selectedApp} commands={commands} onManual={handleManualCommand} busy={busyAction} />;
    if (route.section === "code") return <CodeQuickstart app={selectedApp} />;
    if (route.section === "hosting") return <Hosting />;
    if (route.section === "webhooks") return <Webhooks endpoint={endpoint} onSave={handleSaveEndpoint} onTest={handleTestEndpoint} busy={busyAction} />;
    if (route.section === "logs") return <Logs logs={logs} onRefresh={() => selectedApp.bot_id ? loadLogs(selectedApp.bot_id) : undefined} />;
    return <AppOverview app={selectedApp} commands={commands} />;
  }
}

function DeveloperPortalFrame({
  route,
  apps = [],
  selectedApp = null,
  userEmail = "",
  children,
}: {
  route: RouteState;
  apps?: DeveloperApp[];
  selectedApp?: DeveloperApp | null;
  userEmail?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const selectedId = selectedApp?.app_id || "";
  const base = selectedId ? appBase(selectedId) : "/developers/applications";
  const nav = [
    ["Overview", base],
    ["General Information", `${base}/general`],
    ["Installation / OAuth2", `${base}/installation`],
    ["Bot", `${base}/bot`],
    ["Bot Permissions", `${base}/permissions`],
    ["Commands", `${base}/commands`],
    ["Code / Quickstart", `${base}/code`],
    ["Hosting", `${base}/hosting`],
    ["Advanced Webhook Mode", `${base}/webhooks`],
    ["Logs", `${base}/logs`],
  ];
  return (
    <main className="developerPortal">
      <aside className="developerSidebar">
        <Link className="developerBrand" href="/developers">
          <span>ALT</span>
          <div><b>ALTARA</b><small>Developer Portal</small></div>
        </Link>
        <label className="developerAppSelect">
          <span>Application</span>
          <select
            value={selectedId}
            onChange={(event) => event.target.value ? router.push(appBase(event.target.value)) : router.push("/developers/applications")}
          >
            <option value="">Applications</option>
            {apps.map((app) => <option key={app.app_id} value={app.app_id}>{app.app_name || "Application"}</option>)}
          </select>
        </label>
        <nav className="developerNav" aria-label="Developer sections">
          <Link className={route.kind === "applications" ? "active" : ""} href="/developers/applications">Applications</Link>
          {selectedId ? nav.map(([label, href]) => (
            <Link key={href} className={(route.kind === "app" && href.endsWith(route.section)) || (route.section === "overview" && href === base) ? "active" : ""} href={href}>{label}</Link>
          )) : null}
          <Link className={route.kind === "docs" ? "active" : ""} href="/developers/docs">Docs</Link>
        </nav>
        <div className="developerSidebarFoot">
          <span>{userEmail || "Signed in"}</span>
          <a href="/app">Open ALTARA</a>
        </div>
      </aside>
      <section className="developerMain">{children}</section>
    </main>
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

function Overview({ apps, appsLoading, onCreate, busy }: { apps: DeveloperApp[]; appsLoading: boolean; onCreate: (formData: FormData) => Promise<void>; busy: string }) {
  return (
    <>
      <PageHeader title="Developer Portal" eyebrow="ALTARA Developers" description="Create applications, configure bots, sync commands from code, and generate install links." />
      <div className="developerGrid two">
        <section className="developerPanel">
          <h2>Create</h2>
          <div className="createChoices">
            <button className="createChoice active" type="button"><b>Create Bot</b><span>Active now</span></button>
            <button className="createChoice" type="button" disabled><b>Create Mod / Plugin</b><span>Coming Soon</span></button>
          </div>
          <CreateBotForm onCreate={onCreate} busy={busy} />
        </section>
        <section className="developerPanel">
          <h2>Your applications</h2>
          {appsLoading ? <p className="developerMuted">Loading applications...</p> : <AppCards apps={apps} />}
        </section>
      </div>
    </>
  );
}

function Applications(props: { apps: DeveloperApp[]; loading: boolean; onCreate: (formData: FormData) => Promise<void>; busy: string }) {
  return (
    <>
      <PageHeader title="Applications" eyebrow="Create Application" description="Start with an application, then choose Bot. Mods and plugins come later." />
      <div className="developerGrid two">
        <section className="developerPanel">
          <h2>Create chooser</h2>
          <div className="createChoices">
            <button className="createChoice active" type="button"><b>Create Bot</b><span>Bot Token Connection</span></button>
            <button className="createChoice" type="button" disabled><b>Create Mod / Plugin</b><span>Coming Soon</span></button>
          </div>
          <CreateBotForm onCreate={props.onCreate} busy={props.busy} />
        </section>
        <section className="developerPanel">
          <h2>Applications</h2>
          {props.loading ? <p className="developerMuted">Loading applications...</p> : <AppCards apps={props.apps} />}
        </section>
      </div>
    </>
  );
}

function CreateBotForm({ onCreate, busy }: { onCreate: (formData: FormData) => Promise<void>; busy: string }) {
  return (
    <form className="developerForm" action={(formData) => { void onCreate(formData); }}>
      <label>Application name<input name="app_name" required maxLength={80} placeholder="My ALTARA Bot" /></label>
      <label>Bot display name<input name="bot_name" maxLength={80} placeholder="My Bot" /></label>
      <label>Description<textarea name="description" maxLength={400} rows={3} placeholder="What this bot does" /></label>
      <label>Bot avatar upload<input name="avatar_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
      <button className="devButton primary" type="submit" disabled={busy === "create-bot"}>{busy === "create-bot" ? "Creating..." : "Create Bot"}</button>
    </form>
  );
}

function AppCards({ apps }: { apps: DeveloperApp[] }) {
  if (!apps.length) return <EmptyState title="No applications yet" body="Create a bot to make your first developer application." />;
  return (
    <div className="developerCards">
      {apps.map((app) => (
        <a className="developerAppCard" href={appBase(app.app_id)} key={app.app_id}>
          <AvatarPreview url={app.app_icon_url} label={app.app_name || "App"} />
          <div><b>{app.app_name || "Application"}</b><small>{app.bot_name ? `Bot: ${app.bot_name}` : "No bot yet"}</small></div>
          <span>{app.app_status || "active"}</span>
        </a>
      ))}
    </div>
  );
}

function AppOverview({ app, commands }: { app: DeveloperApp; commands: BotCommand[] }) {
  return (
    <>
      <PageHeader title={app.app_name || "Application"} eyebrow="Overview" description="A Discord-like application shell for bot identity, install settings, and synced command definitions." />
      <div className="developerGrid three">
        <Metric label="Application ID" value={app.app_id} />
        <Metric label="Installs" value={String(app.install_count || 0)} />
        <Metric label="Synced commands" value={String(commands.length || app.command_count || 0)} />
      </div>
      <section className="developerPanel">
        <h2>Default bot flow</h2>
        <ol className="developerSteps">
          <li>Create bot identity and copy the token once.</li>
          <li>Define commands in code with <code>bot.command()</code>.</li>
          <li>Run the bot process locally or on a host.</li>
          <li>ALTARA queues command events and your process replies through Bot Token Connection.</li>
        </ol>
      </section>
    </>
  );
}

function General({ app, onSave, busy, copyText }: { app: DeveloperApp; onSave: (formData: FormData) => Promise<void>; busy: string; copyText: (text: string, label?: string) => Promise<void> }) {
  return (
    <>
      <PageHeader title="General Information" eyebrow="Application" description="Manage the app profile and copy the Application ID / Client ID." />
      <section className="developerPanel">
        <form className="developerSplitForm" action={(formData) => { void onSave(formData); }}>
          <div className="developerMediaColumn">
            <AvatarPreview url={app.app_icon_url} label={app.app_name || "App"} className="large" />
            <label className="uploadButton">Upload app icon<input name="icon_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
            <small>PNG, JPG, WEBP, or GIF. Square image recommended.</small>
          </div>
          <div className="developerForm">
            <label>Name<input name="name" defaultValue={app.app_name || ""} maxLength={80} required /></label>
            <label>Description<textarea name="description" defaultValue={app.app_description || ""} maxLength={400} rows={4} /></label>
            <label>Tags optional<input name="tags" placeholder="Coming later" disabled /></label>
            <label>Use image URL <input name="icon_url" defaultValue={app.app_icon_url || ""} placeholder="Advanced fallback URL" /></label>
            <div className="copyRow"><code>{app.app_id}</code><button className="devButton secondary" type="button" onClick={() => { void copyText(app.app_id, "Application ID copied."); }}>Copy ID</button></div>
            <button className="devButton primary" type="submit" disabled={busy === "save-general"}>{busy === "save-general" ? "Saving..." : "Save changes"}</button>
          </div>
        </form>
      </section>
    </>
  );
}

function BotPage({ app, onCreate, onSave, onToken, busy }: {
  app: DeveloperApp;
  onCreate: (formData: FormData) => Promise<void>;
  onSave: (formData: FormData) => Promise<void>;
  onToken: (action: "regenerate" | "revoke") => Promise<void>;
  busy: string;
}) {
  const [nowMs, setNowMs] = useState(0);
  const hasBot = !!app.bot_id;
  const online = app.bot_last_used_at && nowMs > 0 ? nowMs - Date.parse(app.bot_last_used_at) < 120000 : false;
  useEffect(() => {
    const refresh = () => setNowMs(Date.now());
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  if (!hasBot) {
    return (
      <>
        <PageHeader title="Bot" eyebrow="Create Bot" description="Create the bot identity users will see in ALTARA." />
        <section className="developerPanel">
          <form className="developerForm" action={(formData) => { void onCreate(formData); }}>
            <label>Username / Bot display name<input name="name" required maxLength={80} defaultValue={`${app.app_name || "ALTARA"} Bot`} /></label>
            <label>Description<textarea name="description" maxLength={400} rows={3} /></label>
            <label>Avatar upload<input name="avatar_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
            <label>Use image URL<input name="avatar_url" placeholder="Advanced fallback URL" /></label>
            <button className="devButton primary" type="submit" disabled={busy === "create-bot-for-app"}>Create bot and token</button>
          </form>
        </section>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Bot" eyebrow="Bot Token Connection" description="Manage identity, token, public install status, intents, and connection status." />
      <section className="developerPanel">
        <form className="developerSplitForm" action={(formData) => { void onSave(formData); }}>
          <div className="developerMediaColumn wide">
            <BannerPreview url={app.bot_banner_url} />
            <AvatarPreview url={app.bot_avatar_url} label={app.bot_name || "Bot"} className="large overlap" />
            <label className="uploadButton">Upload avatar<input name="avatar_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
            <label className="uploadButton">Upload banner<input name="banner_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
            <small>Avatar: square. Banner: wide 16:9 recommended. Max 10MB.</small>
          </div>
          <div className="developerForm">
            <div className="botPreviewName"><b>{app.bot_name || "Bot"}</b><span>BOT</span></div>
            <label>Username / Bot display name<input name="name" defaultValue={app.bot_name || ""} maxLength={80} required /></label>
            <label>Description<textarea name="description" defaultValue={app.bot_description || ""} maxLength={400} rows={3} /></label>
            <label>Use avatar URL<input name="avatar_url" defaultValue={app.bot_avatar_url || ""} placeholder="Advanced fallback URL" /></label>
            <label>Use banner URL<input name="banner_url" defaultValue={app.bot_banner_url || ""} placeholder="Advanced fallback URL" /></label>
            <label className="toggleLine"><input name="is_public" type="checkbox" defaultChecked={app.bot_is_public === true} /> Public Bot</label>
            <button className="devButton primary" type="submit" disabled={busy === "save-bot"}>{busy === "save-bot" ? "Saving..." : "Save changes"}</button>
          </div>
        </form>
      </section>
      <section className="developerPanel">
        <h2>Token</h2>
        <p className="developerWarning">Your bot token is a password. Store it in <code>ALTARA_BOT_TOKEN</code>. Never put it in URLs, frontend code, screenshots, or public logs.</p>
        <div className="developerMeta"><span>Token prefix</span><code>{app.bot_token_prefix || "Not generated"}</code></div>
        <div className="developerActions">
          <button className="devButton secondary" type="button" onClick={() => { void onToken("regenerate"); }}>Reset / Regenerate token</button>
          <button className="devButton danger" type="button" onClick={() => { void onToken("revoke"); }}>Revoke token</button>
        </div>
      </section>
      <section className="developerGrid two">
        <div className="developerPanel"><h2>Authorization Flow</h2><label className="toggleLine"><input type="checkbox" checked={app.bot_is_public === true} readOnly /> Public Bot</label><label className="toggleLine disabled"><input type="checkbox" disabled /> Requires OAuth2 Code Grant</label></div>
        <div className="developerPanel"><h2>Connection Status</h2><div className={`connectionBadge ${online ? "online" : ""}`}>{online ? "Online" : "Offline"}</div><p>Last connected: {formatDate(app.bot_last_used_at)}</p><p>Mode: Bot Token Connection</p><p className="developerMuted">Run your bot process locally or on a host. No public endpoint required.</p></div>
      </section>
      <section className="developerPanel">
        <h2>Privileged Gateway Intents</h2>
        {["Presence Intent", "Server Members Intent", "Message Content Intent"].map((item) => <label className="toggleLine disabled" key={item}><input type="checkbox" disabled /> {item}<small>Only enable if your bot needs this data.</small></label>)}
      </section>
    </>
  );
}

function Installation({ app, permissions, setPermissions, installUrl, copyText }: {
  app: DeveloperApp;
  permissions: string[];
  setPermissions: (value: string[]) => void;
  installUrl: string;
  copyText: (text: string, label?: string) => Promise<void>;
}) {
  return (
    <>
      <PageHeader title="Installation / OAuth2" eyebrow="Install Link" description="Installing adds the bot to a server. It does not host or run your bot code." />
      <section className="developerPanel">
        <h2>Install Link mode</h2>
        <div className="segmented"><button className="active" type="button">ALTARA Provided Link</button><button type="button" disabled>Custom Link Coming Soon</button></div>
        <p className="developerMuted">Scopes: <code>bot</code> <code>applications.commands</code></p>
      </section>
      <Permissions permissions={permissions} setPermissions={setPermissions} copyText={copyText} compact />
      <section className="developerPanel">
        <h2>Generated URL</h2>
        <div className="copyRow"><code>{installUrl}</code><button className="devButton secondary" type="button" onClick={() => { void copyText(installUrl, "Install URL copied."); }}>Copy</button><a className="devButton primary" href={installUrl} target="_blank" rel="noopener noreferrer">Open</a></div>
        {!app.bot_is_public ? <p className="developerWarning">This bot is private until Public Bot is enabled on the Bot page.</p> : null}
      </section>
    </>
  );
}

function Permissions({ permissions, setPermissions, copyText, compact = false }: {
  permissions: string[];
  setPermissions: (value: string[]) => void;
  copyText: (text: string, label?: string) => Promise<void>;
  compact?: boolean;
}) {
  const groups = [...new Set(SUPPORTED_PERMISSIONS.map((item) => item.group))];
  const output = permissions.join(",");
  return (
    <section className="developerPanel">
      {!compact ? <PageHeader title="Bot Permissions" eyebrow="Permission calculator" description="Map only currently supported permissions to real install permissions." nested /> : <h2>Default Install Settings</h2>}
      {groups.map((group) => (
        <div className="permissionGroup" key={group}>
          <h3>{group}</h3>
          {SUPPORTED_PERMISSIONS.filter((item) => item.group === group).map((item) => (
            <label className={`toggleLine ${item.enabled ? "" : "disabled"}`} key={item.key}>
              <input
                type="checkbox"
                disabled={!item.enabled}
                checked={permissions.includes(item.key)}
                onChange={(event) => {
                  if (event.target.checked) setPermissions([...permissions, item.key]);
                  else setPermissions(permissions.filter((key) => key !== item.key));
                }}
              />
              {item.label}{!item.enabled ? <small>Coming Soon</small> : null}
            </label>
          ))}
        </div>
      ))}
      <div className="copyRow"><code>{output}</code><button className="devButton secondary" type="button" onClick={() => { void copyText(output, "Permissions copied."); }}>Copy</button></div>
      <p className="developerMuted">Message content is controlled by a privileged intent, not a normal permission.</p>
    </section>
  );
}

function Commands({ app, commands, onManual, busy }: { app: DeveloperApp; commands: BotCommand[]; onManual: (formData: FormData) => Promise<void>; busy: string }) {
  return (
    <>
      <PageHeader title="Synced Commands" eyebrow="Code first" description="Commands are defined in code using bot.command(). The portal displays what your running bot syncs." />
      <section className="developerPanel">
        <CodeBlock title="Example" code={'bot.command("hello", { description: "Says hello" }, async (ctx) => {\n  await ctx.reply("Hello!");\n});'} />
      </section>
      <section className="developerPanel">
        <h2>Commands</h2>
        <div className="commandTable">
          {commands.length ? commands.map((cmd) => (
            <div className="commandRow" key={cmd.command_id}>
              <b>/{cmd.name}</b><span>{cmd.description || "No description"}</span><span>{optionCount(cmd.options)} options</span><span>{cmd.status || "active"}</span><span>{formatDate(cmd.updated_at || cmd.created_at)}</span>
            </div>
          )) : <EmptyState title="No synced commands" body="Run your bot process with bot.login() to publish commands from code." />}
        </div>
      </section>
      <details className="developerPanel">
        <summary>Advanced manual registration</summary>
        <p className="developerWarning">Normal bots should sync commands from code. Use this only for testing or fallback registration.</p>
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

function CodeQuickstart({ app }: { app: DeveloperApp }) {
  return (
    <>
      <PageHeader title="Code / Quickstart" eyebrow="Bot Token Connection" description="You do not paste code into ALTARA. You run this code on your PC, VPS, or hosting provider." />
      <section className="developerPanel">
        <div className="segmented"><button className="active" type="button">JavaScript</button><button type="button" disabled>Python Coming Soon</button></div>
        <CodeBlock title="index.js" code={'const { AltaraClient } = require("./altara-client");\n\nconst bot = new AltaraClient({ token: process.env.ALTARA_BOT_TOKEN });\n\nbot.command("hello", { description: "Says hello" }, async (ctx) => {\n  await ctx.reply("Hello from ALTARA!");\n});\n\nbot.login();'} />
        <CodeBlock title=".env" code="ALTARA_BOT_TOKEN=altara_bot_..." />
        <CodeBlock title="Commands" code="npm install\nnpm start" />
        <p className="developerMuted">Application ID: <code>{app.app_id}</code></p>
      </section>
    </>
  );
}

function Hosting() {
  return (
    <>
      <PageHeader title="Hosting" eyebrow="Keep the process running" description="A bot is online only while your bot process is running." />
      <section className="developerPanel">
        <ul className="developerList">
          <li><b>Local PC:</b> good for testing; the terminal must stay open.</li>
          <li><b>VPS:</b> simplest production option.</li>
          <li><b>Render/Railway/Fly.io:</b> app hosts that can keep a Node process online.</li>
          <li><b>PM2/Docker:</b> useful later for production process management.</li>
          <li><b>No endpoint needed:</b> default Bot Token Connection mode polls ALTARA from your process.</li>
          <li><b>Rotate token if leaked:</b> never expose it in URLs, frontend code, or public logs.</li>
        </ul>
      </section>
    </>
  );
}

function Webhooks({ endpoint, onSave, onTest, busy }: { endpoint: EndpointInfo | null; onSave: (formData: FormData) => Promise<void>; onTest: () => Promise<void>; busy: string }) {
  return (
    <>
      <PageHeader title="Advanced Webhook Mode" eyebrow="Optional" description="Most bots do not need this. Use Bot Token Connection mode unless building a serverless webhook bot." />
      <section className="developerPanel">
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

function Logs({ logs, onRefresh }: { logs: AuditLog[]; onRefresh: () => void | Promise<void> | undefined }) {
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

function Docs() {
  return (
    <>
      <PageHeader title="Docs" eyebrow="Discord-like model" description="ALTARA bots use application identity, Bot Token Connection runtime, synced slash commands, and external hosting." />
      <section className="developerPanel">
        <ol className="developerSteps">
          <li>Create an application and bot.</li>
          <li>Copy the one-time bot token into <code>ALTARA_BOT_TOKEN</code>.</li>
          <li>Write commands with <code>bot.command()</code>.</li>
          <li>Run the process locally, on a VPS, or on an app host.</li>
          <li>Install the bot into a server using the generated URL.</li>
        </ol>
      </section>
    </>
  );
}

function PageHeader({ title, eyebrow, description, nested = false }: { title: string; eyebrow: string; description: string; nested?: boolean }) {
  const Tag = nested ? "div" : "header";
  return <Tag className="developerHeader"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></Tag>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <section className="developerPanel metric"><span>{label}</span><b>{value}</b></section>;
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return <div className="codeBlock"><div>{title}</div><pre><code>{code}</code></pre></div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="emptyState"><b>{title}</b><p>{body}</p></div>;
}
