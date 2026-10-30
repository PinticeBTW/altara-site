import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import {
  normalizeHistorySession, normalizeLiveSession, normalizeSessionDetail,
  type VoiceSession,
} from "../voice-analytics-model";

const PROJECT_URL = "https://tbbgwjmmaiclkhssimhf.supabase.co";
const PAGE_SIZE = 25;
const MAX_ROOMS = 100;
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Authorization",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

class AnalyticsError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new AnalyticsError(503, "configuration_missing", "A consulta de voz ainda não está configurada no servidor.");
  return value;
}

function backendUrl(): string {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || PROJECT_URL).trim();
  // This panel belongs to ALTARA. Never accept a backend supplied by a request.
  if (url.replace(/\/$/, "") !== PROJECT_URL) {
    throw new AnalyticsError(503, "configuration_invalid", "A configuração do projeto ALTARA precisa de revisão.");
  }
  return PROJECT_URL;
}

async function authorize(request: Request): Promise<string> {
  const match = /^Bearer ([A-Za-z0-9_.-]{20,8192})$/.exec(request.headers.get("authorization") || "");
  if (!match) throw new AnalyticsError(401, "authentication_required", "Entra com a tua conta ALTARA para consultar esta área.");
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!anonKey) required("SUPABASE_ANON_KEY");
  const token = match[1];
  const client = createClient(backendUrl(), anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: timedFetch },
  });
  // getUser contacts Auth; cached browser metadata and user_metadata are never authority.
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    if (error && (!error.status || error.status >= 500)) {
      throw new AnalyticsError(503, "authorization_unavailable", "Não foi possível validar o acesso. Tenta novamente.");
    }
    throw new AnalyticsError(401, "authentication_required", "A sessão terminou. Volta a entrar na ALTARA.");
  }
  if (!data.user.email_confirmed_at || data.user.is_anonymous) {
    throw new AnalyticsError(403, "administrator_required", "Esta área está reservada à administração da ALTARA.");
  }
  // Platform-wide analytics uses the global reports owner, not a server role or creator allowlist.
  const access = await client.rpc("is_reports_owner");
  if (access.error) throw new AnalyticsError(503, "authorization_unavailable", "Não foi possível validar o acesso de administrador.");
  if (access.data !== true) throw new AnalyticsError(403, "administrator_required", "Esta área está reservada à administração da ALTARA.");
  return data.user.id;
}

async function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const attempts = method === "GET" || method === "HEAD" ? 2 : 1;
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(10_000);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      return await fetch(input, { ...init, signal, cache: "no-store", redirect: "error" });
    } catch (error) {
      // A transient connection failure may be retried once for safe reads. Never
      // replay RPC POSTs, caller cancellation, or HTTP authorization failures.
      if (attempt + 1 >= attempts || init?.signal?.aborted) throw error;
    }
  }
}

function serviceClient() {
  return createClient(backendUrl(), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timedFetch },
  });
}

function requirePrivateConfiguration(history: boolean) {
  const missing: string[] = [];
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("Supabase");
  const livekitNames = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", ...(history ? ["LIVEKIT_PROJECT_ID"] : [])];
  if (livekitNames.some(name => !process.env[name]?.trim())) missing.push("LiveKit");
  if (missing.length) {
    // Only called after the real administrator check. Report setup state, never values.
    throw new AnalyticsError(503, "configuration_missing", `O acesso de administrador está confirmado. A configuração privada de ${missing.join(" e ")} ainda está incompleta no servidor. Conclui a configuração para carregar dados reais.`);
  }
}

function livekitConfig() {
  let url: URL;
  try { url = new URL(required("LIVEKIT_URL")); }
  catch (error) {
    if (error instanceof AnalyticsError) throw error;
    throw new AnalyticsError(503, "configuration_invalid", "O serviço de voz precisa de configuração no servidor.");
  }
  if (!["wss:", "https:"].includes(url.protocol) || !url.hostname.endsWith(".livekit.cloud")
      || url.username || url.password || url.port || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new AnalyticsError(503, "configuration_invalid", "O serviço de voz precisa de configuração no servidor.");
  }
  url.protocol = "https:";
  return { url: url.origin, key: required("LIVEKIT_API_KEY"), secret: required("LIVEKIT_API_SECRET") };
}

export function safeAvatar(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u0020\\]/.test(value)) return null;
  const builtIn = value.match(/^(?:\.\/|\/)?assets\/default-avatars\/([a-z0-9_-]+\.(?:png|webp|jpe?g|gif))$/i);
  if (builtIn) return `/app/assets/default-avatars/${builtIn[1]}`;
  try {
    const url = new URL(value);
    // No third-party tracking images, signed/private URLs, or arbitrary browser requests.
    if (url.origin !== PROJECT_URL || !url.pathname.startsWith("/storage/v1/object/public/")
        || url.username || url.password || url.hash || [...url.searchParams.keys()].some(k => k !== "v")) return null;
    return url.href;
  } catch { return null; }
}

async function checkedRows(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Record<string, unknown>[]> {
  const result = await query;
  if (result.error || !Array.isArray(result.data)) {
    throw new AnalyticsError(502, "profile_lookup_unavailable", "Não foi possível associar os perfis e canais. Tenta atualizar.");
  }
  return result.data as Record<string, unknown>[];
}

const stringOrNull = (value: unknown) => typeof value === "string" ? value.slice(0, 512) : null;

async function enrich(sessions: VoiceSession[], admin: SupabaseClient): Promise<VoiceSession[]> {
  const ids = [...new Set(sessions.flatMap(s => s.participants.flatMap(p => p.userId ? [p.userId] : [])))];
  const servers = [...new Set(sessions.flatMap(s => s.serverId ? [s.serverId] : []))];
  const channels = [...new Set(sessions.flatMap(s => s.channelId ? [s.channelId] : []))];
  const conversations = [...new Set(sessions.flatMap(s => s.scope === "server" && s.conversationId ? [s.conversationId] : []))];
  const [profiles, serverRows, channelRows, conversationRows] = await Promise.all([
    ids.length ? checkedRows(admin.from("profiles").select("id,username,display_name,avatar_url").in("id", ids)) : [],
    servers.length ? checkedRows(admin.from("servers").select("id,name").in("id", servers)) : [],
    channels.length ? checkedRows(admin.from("server_channels").select("id,server_id,conversation_id,name").in("id", channels)) : [],
    conversations.length ? checkedRows(admin.from("server_channels").select("id,server_id,conversation_id,name").in("conversation_id", conversations)) : [],
  ]);
  const profileMap = new Map(profiles.map(p => [p.id, p]));
  const channelMap = new Map(channelRows.map(c => [c.id, c]));
  const conversationMap = new Map(conversationRows.map(c => [c.conversation_id, c]));
  const missingServers = [...new Set(conversationRows.flatMap(c => typeof c.server_id === "string" && !servers.includes(c.server_id) ? [c.server_id] : []))];
  const allServerRows = missingServers.length
    ? [...serverRows, ...await checkedRows(admin.from("servers").select("id,name").in("id", missingServers))]
    : serverRows;
  const serverMap = new Map(allServerRows.map(s => [s.id, s]));
  return sessions.map(session => {
    const channel = channelMap.get(session.channelId) || conversationMap.get(session.conversationId);
    // A mismatched relation must not attach an unrelated channel name.
    const validChannel = channel && (!session.serverId || channel.server_id === session.serverId) ? channel : undefined;
    const serverId = session.serverId || stringOrNull(validChannel?.server_id);
    return {
      ...session, serverId, channelId: session.channelId || stringOrNull(validChannel?.id),
      serverName: stringOrNull(serverMap.get(serverId)?.name), channelName: stringOrNull(validChannel?.name),
      participants: session.participants.map(p => {
        const profile = p.userId ? profileMap.get(p.userId) : undefined;
        return { ...p, username: stringOrNull(profile?.username), displayName: stringOrNull(profile?.display_name), avatarUrl: safeAvatar(profile?.avatar_url) };
      }),
    };
  });
}

type Payload = Record<string, unknown>;
const cache = new Map<string, { expires: number; data: Payload }>();
const inFlight = new Map<string, Promise<Payload>>();

async function cached(key: string, ttl: number, load: () => Promise<Payload>): Promise<Payload> {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data;
  const pending = inFlight.get(key);
  if (pending) return pending;
  if (inFlight.size >= 16) throw new AnalyticsError(429, "too_many_requests", "Há várias consultas em curso. Aguarda alguns segundos.");
  const promise = load().then(data => {
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + ttl, data });
    return data;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function currentSessions(admin: SupabaseClient): Promise<Payload> {
  const deadline = Date.now() + 12_000;
  const config = livekitConfig();
  const roomService = new RoomServiceClient(config.url, config.key, config.secret, { requestTimeout: 8, failover: true });
  const allRooms = await roomService.listRooms();
  if (!Array.isArray(allRooms)) throw new Error("invalid_rooms_response");
  const rooms = allRooms.slice(0, MAX_ROOMS);
  const sessions: VoiceSession[] = [];
  let partial = allRooms.length > MAX_ROOMS;
  // Bound provider concurrency; a room can disappear between the two RoomService calls.
  for (let offset = 0; offset < rooms.length; offset += 5) {
    if (Date.now() >= deadline) {
      partial = true;
      sessions.push(...rooms.slice(offset).map(room => ({
        ...normalizeLiveSession(room, undefined, Date.now()), status: "unknown" as const,
      })));
      break;
    }
    const results = await Promise.allSettled(rooms.slice(offset, offset + 5).map(async room => {
      const participants = await roomService.listParticipants(room.name);
      if (!Array.isArray(participants)) throw new Error("invalid_participants_response");
      return normalizeLiveSession(room, participants, Date.now());
    }));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") sessions.push(result.value);
      else {
        partial = true;
        const session = normalizeLiveSession(rooms[offset + index], undefined, Date.now());
        sessions.push({ ...session, status: "unknown" });
      }
    });
  }
  return {
    sessions: await enrich(sessions, admin), updatedAt: new Date().toISOString(), partial,
    ...(partial ? { warning: "Consulta parcial: algumas salas mudaram durante a atualização ou foi atingido o limite de tempo ou de 100 salas." } : {}),
  };
}

async function cloudAnalytics(path: string): Promise<Record<string, unknown>> {
  const { key, secret } = livekitConfig();
  const projectId = required("LIVEKIT_PROJECT_ID");
  if (!/^p_[a-zA-Z0-9]{5,80}$/.test(projectId)) throw new AnalyticsError(503, "configuration_invalid", "O projeto de analytics de voz precisa de configuração.");
  const token = new AccessToken(key, secret, { ttl: 60 });
  token.addGrant({ roomList: true });
  const response = await timedFetch(`https://cloud-api.livekit.io/api/project/${projectId}/sessions${path}`, {
    headers: { Authorization: `Bearer ${await token.toJwt()}`, Accept: "application/json" },
  });
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new AnalyticsError(503, "history_unavailable", "O histórico exige acesso à Analytics API da LiveKit Cloud e plano Scale ou superior. Confirma a configuração e o plano.");
    if (response.status === 404) throw new AnalyticsError(404, "session_unavailable", "Esta sessão já não está disponível no histórico da LiveKit.");
    if (response.status === 429) throw new AnalyticsError(429, "provider_rate_limit", "A LiveKit limitou temporariamente as consultas. Tenta novamente dentro de alguns segundos.");
    throw new AnalyticsError(502, "history_unavailable", "Não foi possível consultar o histórico da LiveKit. Tenta novamente.");
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_analytics_response");
  return data as Record<string, unknown>;
}

function historyQuery(url: URL): { start: string; end: string; page: number } {
  const today = new Date().toISOString().slice(0, 10);
  const earliest = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  const start = url.searchParams.get("start") || earliest;
  const end = url.searchParams.get("end") || today;
  const pageValue = url.searchParams.get("page") || "0";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)
      || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))
      || new Date(start).toISOString().slice(0, 10) !== start || new Date(end).toISOString().slice(0, 10) !== end
      || start < earliest || end > today || start > end || !/^(0|[1-9]\d{0,2})$/.test(pageValue)) {
    throw new AnalyticsError(400, "invalid_history_range", "Escolhe datas UTC válidas nos últimos sete dias e uma página entre 0 e 999.");
  }
  return { start, end, page: Number(pageValue) };
}

async function normalizedDetail(actor: string, id: string): Promise<VoiceSession> {
  // Cache the small operational DTO, never the provider's location/device payload.
  const value = await cached(`${actor}:normalized-session:${id}`, 60_000, async () => {
    const raw = await cloudAnalytics(`/${encodeURIComponent(id)}`);
    return { session: normalizeSessionDetail(raw, id, Date.now()) };
  });
  return value.session as VoiceSession;
}

async function historySessions(actor: string, query: { start: string; end: string; page: number }, admin: SupabaseClient, usage: boolean): Promise<Payload> {
  const params = new URLSearchParams({ ...query, page: String(query.page), limit: String(PAGE_SIZE) });
  const raw = await cloudAnalytics(`?${params}`);
  if (!Array.isArray(raw.sessions)) throw new Error("invalid_history_response");
  const sessions = raw.sessions.slice(0, PAGE_SIZE).map(row => normalizeHistorySession(row, Date.now()));
  let partial = false;
  if (usage) {
    const deadline = Date.now() + 35_000;
    // An explicit operator action computes this page, rather than N detail calls on every refresh.
    for (let offset = 0; offset < sessions.length; offset += 5) {
      if (Date.now() >= deadline) { partial = true; break; }
      const results = await Promise.allSettled(sessions.slice(offset, offset + 5).map(async session => {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(session.id)) throw new Error("invalid_provider_session");
        return normalizedDetail(actor, session.id);
      }));
      results.forEach((result, index) => {
        if (result.status === "fulfilled") sessions[offset + index] = result.value;
        else partial = true;
      });
    }
  }
  return {
    sessions: await enrich(sessions, admin), hasMore: raw.sessions.length >= PAGE_SIZE, page: query.page,
    updatedAt: new Date().toISOString(), partial,
    ...(partial ? { warning: "Não foi possível calcular todas as sessões desta página. Os totais incompletos ficam indisponíveis." } : {}),
  };
}

export async function handleVoiceAnalytics(request: Request): Promise<Response> {
  try {
    // Check every request, including hits in the server's short-lived private cache.
    const actor = await authorize(request);
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "live";
    if (!["live", "history", "usage", "session"].includes(view)) throw new AnalyticsError(400, "invalid_view", "Escolhe uma consulta de voz válida.");
    const query = view === "history" || view === "usage" ? historyQuery(url) : null;
    const id = view === "session" ? url.searchParams.get("id") || "" : "";
    if (view === "session" && !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new AnalyticsError(400, "invalid_session", "Identificador de sessão inválido.");
    requirePrivateConfiguration(view !== "live");
    const key = `${actor}:${view}:${query ? JSON.stringify(query) : id}`;
    const result = await cached(key, view === "live" ? 10_000 : 60_000, async () => {
      const admin = serviceClient();
      if (view === "live") return currentSessions(admin);
      if (query) return historySessions(actor, query, admin, view === "usage");
      // Raw provider responses include location/device fields. Only the normalized DTO crosses this boundary.
      const [session] = await enrich([await normalizedDetail(actor, id)], admin);
      return { session, updatedAt: new Date().toISOString() };
    });
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof AnalyticsError) return Response.json({ error: error.code, message: error.message }, { status: error.status, headers });
    // Never relay SDK/HTTP errors: they may contain credentials, private endpoints or provider payloads.
    return Response.json({ error: "voice_unavailable", message: "Não foi possível consultar a atividade de voz. Tenta novamente." }, { status: 502, headers });
  }
}
