export type VoiceParticipant = {
  identity: string;
  userId: string | null;
  kind: "user" | "bot" | "companion" | "unknown";
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  state: string;
  joinedAt: string | null;
  leftAt: string | null;
  connectedSeconds: number | null;
  connectionCount: number;
};

export type VoiceSession = {
  id: string;
  roomName: string;
  scope: "server" | "private" | "group" | "unknown";
  serverId: string | null;
  channelId: string | null;
  conversationId: string | null;
  serverName: string | null;
  channelName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  status: "active" | "ended" | "unknown";
  participantCount: number;
  uniqueUsers: number | null;
  /** Sum of human connection time, merging overlapping connections per account. */
  connectedSeconds: number | null;
  /** Provider billing measure; it can include technical participants. */
  billableMinutes: number | null;
  participants: VoiceParticipant[];
};

type RecordValue = Record<string, unknown>;
type Interval = [number, number];
type ParticipantData = { participant: VoiceParticipant; intervals: Interval[]; connectionKeys: Set<string>; incomplete: boolean };
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const uuidPattern = new RegExp(`^${UUID}$`, "i");
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value)
  ? value as RecordValue : {};
const text = (value: unknown): string => typeof value === "string" ? value.slice(0, 512).trim() : "";
const first = (source: RecordValue, ...keys: string[]): unknown => {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
  return undefined;
};
const numeric = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "bigint"
    && !(typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
};

/** Accept the JSON Analytics timestamps and the SDK's bigint epoch seconds. */
function timestamp(value: unknown, milliseconds = false): number | null {
  let result: number | null = null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    result = Date.parse(value);
  } else if (value && typeof value === "object") {
    const source = object(value), seconds = numeric(source.seconds), nanos = numeric(source.nanos ?? 0);
    if (seconds !== null && nanos !== null && nanos < 1e9) result = seconds * 1000 + nanos / 1e6;
  } else {
    const amount = numeric(value);
    if (amount !== null) result = milliseconds || amount >= 1e11 ? amount : amount * 1000;
  }
  // A zero protobuf timestamp means the field was absent, not a call in 1970.
  return result !== null && Number.isFinite(result) && result > 0 && result <= 8640000000000000 ? result : null;
}

function timeField(source: RecordValue, keys: string[], millisecondKeys: string[] = []): number | null {
  for (const key of millisecondKeys) {
    const result = timestamp(source[key], true);
    if (result !== null) return result;
  }
  for (const key of keys) {
    const result = timestamp(source[key]);
    if (result !== null) return result;
  }
  return null;
}

const iso = (value: number | null): string | null => value === null ? null : new Date(value).toISOString();

export function parseIdentity(value: unknown): Pick<VoiceParticipant, "kind" | "userId"> {
  const identity = text(value).toLowerCase();
  if (uuidPattern.test(identity)) return { kind: "user", userId: identity };
  let match = identity.match(new RegExp(`^sv2:(${UUID}):${UUID}$`, "i"));
  if (match) return { kind: "user", userId: match[1] };
  match = identity.match(new RegExp(`^(${UUID}):native-screen:[0-9a-f]{24}$`, "i"));
  if (match) return { kind: "companion", userId: match[1] };
  match = identity.match(new RegExp(`^capture-user:(${UUID}):${UUID}$`, "i"));
  if (match) return { kind: "companion", userId: match[1] };
  if (new RegExp(`^(?:altara_bot:${UUID}(?::voice:${UUID})?|capture-bot:${UUID}:${UUID})$`, "i").test(identity)) {
    return { kind: "bot", userId: null };
  }
  return { kind: "unknown", userId: null };
}

export function parseRoomName(value: unknown): Pick<VoiceSession, "scope" | "serverId" | "channelId" | "conversationId"> {
  const name = text(value).toLowerCase();
  const result: ReturnType<typeof parseRoomName> = { scope: "unknown", serverId: null, channelId: null, conversationId: null };
  const media = name.match(new RegExp(`^server-voice-v2:(${UUID})(?::(${UUID}))?$`, "i"));
  const channel = name.match(new RegExp(`^server-voice-v3:(${UUID}):voice:(${UUID})$`, "i"));
  if (media || channel) return { ...result, scope: "server", serverId: (media || channel)![1], channelId: (media || channel)![2] || null };
  const conversation = name.match(new RegExp(`^(server-voice:|private_|groupdm_)(${UUID})$`, "i"));
  if (conversation) return { ...result, scope: conversation[1] === "private_" ? "private" : conversation[1] === "groupdm_" ? "group" : "server", conversationId: conversation[2] };
  return result;
}

function state(value: unknown): string {
  if (typeof value === "number") return ["joining", "joined", "active", "disconnected"][value] || "unknown";
  const name = text(value).toLowerCase().replace(/^participant_state_/, "");
  return ["joining", "joined", "active", "disconnected"].includes(name) ? name : "unknown";
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const interval of intervals.slice().sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([interval[0], interval[1]]);
  }
  return merged;
}
const seconds = (intervals: Interval[]): number => mergeIntervals(intervals).reduce((total, [start, end]) => total + (end - start) / 1000, 0);

function normalizeParticipant(raw: unknown, start: number | null, end: number | null, live: boolean): ParticipantData {
  const source = object(raw), identity = text(first(source, "identity", "participantIdentity", "participant_identity"));
  const parsed = parseIdentity(identity);
  const outerJoined = timeField(source, ["joinedAt", "joined_at"], ["joinedAtMs"]);
  const outerLeft = timeField(source, ["leftAt", "left_at"]);
  const participantState = state(source.state);
  const connections = Array.isArray(source.sessions) && source.sessions.length ? source.sessions : [source];
  const intervals: Interval[] = [], seen = new Set<string>();
  let incomplete = false, earliest: number | null = null, latest: number | null = null;
  for (const connection of connections) {
    const item = object(connection);
    const joined = timeField(item, ["joinedAt", "joined_at"], ["joinedAtMs"]);
    const left = timeField(item, ["leftAt", "left_at"]);
    const connectionKey = text(first(item, "participantId", "participant_id", "sid")) || `${joined}:${left}`;
    if (seen.has(connectionKey)) continue;
    seen.add(connectionKey);
    if (joined !== null) earliest = earliest === null ? joined : Math.min(earliest, joined);
    if (left !== null) latest = latest === null ? left : Math.max(latest, left);
    // Only a current provider observation may extend an open connection to now.
    const observedEnd = left ?? (live && participantState === "active" ? end : null);
    if (joined === null || observedEnd === null || observedEnd < joined) { incomplete = true; continue; }
    const boundedStart = Math.max(joined, start ?? joined), boundedEnd = Math.min(observedEnd, end ?? observedEnd);
    if (boundedEnd < boundedStart) { incomplete = true; continue; }
    intervals.push([boundedStart, boundedEnd]);
  }
  const joined = earliest ?? outerJoined, left = latest ?? outerLeft;
  return {
    participant: {
      identity, ...parsed, username: null, displayName: null, avatarUrl: null,
      state: live ? participantState : !incomplete && left !== null ? "disconnected" : "unknown",
      joinedAt: iso(joined), leftAt: iso(left),
      connectedSeconds: incomplete ? null : seconds(intervals), connectionCount: seen.size,
    },
    intervals, connectionKeys: seen, incomplete,
  };
}

function participants(raw: unknown, start: number | null, end: number | null, live: boolean): {
  participants: VoiceParticipant[]; uniqueUsers: number; connectedSeconds: number | null;
} {
  const entries = (Array.isArray(raw) ? raw : []).map(item => normalizeParticipant(item, start, end, live));
  const identities = new Map<string, ParticipantData>();
  for (const entry of entries) {
    const identity = entry.participant.identity;
    // No usable identity means no authoritative user mapping; preserve the row.
    const key = identity || `unknown:${identities.size}`;
    const previous = identities.get(key);
    if (!previous) { identities.set(key, entry); continue; }
    previous.intervals.push(...entry.intervals);
    previous.incomplete ||= entry.incomplete;
    previous.participant.connectedSeconds = previous.incomplete ? null : seconds(previous.intervals);
    for (const connectionKey of entry.connectionKeys) previous.connectionKeys.add(connectionKey);
    previous.participant.connectionCount = previous.connectionKeys.size;
    if (live && entry.participant.state === "active") previous.participant.state = "active";
    if (!live && previous.incomplete) previous.participant.state = "unknown";
    const dates = [previous.participant.joinedAt, entry.participant.joinedAt].filter((value): value is string => value !== null).sort();
    previous.participant.joinedAt = dates[0] ?? null;
    const ends = [previous.participant.leftAt, entry.participant.leftAt].filter((value): value is string => value !== null).sort();
    previous.participant.leftAt = ends[ends.length - 1] ?? null;
  }
  const humans = new Map<string, Interval[]>();
  let incomplete = false;
  for (const entry of identities.values()) {
    const person = entry.participant;
    if (person.kind !== "user" || !person.userId) continue;
    // JOINED is the signaling stage; ACTIVE confirms the media connection.
    if (live && person.state !== "active") continue;
    humans.set(person.userId, [...(humans.get(person.userId) ?? []), ...entry.intervals]);
    incomplete ||= entry.incomplete;
  }
  return {
    participants: [...identities.values()].map(entry => entry.participant), uniqueUsers: humans.size,
    connectedSeconds: incomplete ? null : [...humans.values()].reduce((total, intervals) => total + seconds(intervals), 0),
  };
}

function sessionBase(raw: unknown, id = ""): VoiceSession {
  const source = object(raw), roomName = text(first(source, "roomName", "name", "room_name"));
  return {
    id: id || text(first(source, "sessionId", "roomId", "sid", "id")), roomName, ...parseRoomName(roomName),
    serverName: null, channelName: null, startedAt: null, endedAt: null, status: "unknown",
    participantCount: Math.floor(numeric(first(source, "numParticipants", "num_participants")) ?? 0),
    uniqueUsers: null, connectedSeconds: null, billableMinutes: numeric(first(source, "connectionMinutes", "connection_minutes")), participants: [],
  };
}

export function normalizeLiveSession(room: unknown, rawParticipants: unknown, nowMs: number): VoiceSession {
  const source = object(room), start = timeField(source, ["creationTime", "createdAt", "startedAt"], ["creationTimeMs"]);
  const now = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : null;
  const normalized = participants(rawParticipants, start, now, true);
  return {
    ...sessionBase(room), ...normalized, startedAt: iso(start), status: "active", billableMinutes: null,
    participantCount: Array.isArray(rawParticipants) ? rawParticipants.length : sessionBase(room).participantCount,
    uniqueUsers: Array.isArray(rawParticipants) ? normalized.uniqueUsers : null,
    connectedSeconds: !Array.isArray(rawParticipants) || now === null || (start !== null && start > now) ? null : normalized.connectedSeconds,
  };
}

export function normalizeHistorySession(raw: unknown, nowMs: number): VoiceSession {
  const source = object(raw), start = timeField(source, ["createdAt", "startTime", "startedAt", "created_at"]);
  const end = timeField(source, ["endedAt", "endTime", "ended_at"]);
  const ended = end !== null && end <= nowMs && (start === null || end >= start);
  // Analytics can lag behind current rooms. Missing end data never proves live activity.
  return { ...sessionBase(raw), startedAt: iso(start), endedAt: ended ? iso(end) : null, status: ended ? "ended" : "unknown" };
}

export function normalizeSessionDetail(raw: unknown, id: string, nowMs: number): VoiceSession {
  const source = object(raw), base = normalizeHistorySession(raw, nowMs);
  const start = base.startedAt ? Date.parse(base.startedAt) : null, end = base.endedAt ? Date.parse(base.endedAt) : null;
  const normalized = participants(source.participants, start, end, false);
  return {
    ...base, ...normalized, id: id || base.id,
    participantCount: numeric(first(source, "numParticipants", "num_participants")) === null ? normalized.participants.length : base.participantCount,
    connectedSeconds: base.status === "ended" && Array.isArray(source.participants) ? normalized.connectedSeconds : null,
    uniqueUsers: Array.isArray(source.participants) ? normalized.uniqueUsers : null,
  };
}
