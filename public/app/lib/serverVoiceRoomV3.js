export const SERVER_VOICE_V3_MODE = "server_channel_room_v3";
export const SERVER_VOICE_V3_ROOM_PREFIX = "server-voice-v3:";

function normalizeId(value) {
  return String(value || "").trim();
}

export function buildServerVoiceV3RoomName(serverId = "", channelId = "") {
  const sid = normalizeId(serverId);
  const cid = normalizeId(channelId);
  return sid && cid ? `${SERVER_VOICE_V3_ROOM_PREFIX}${sid}:voice:${cid}` : "";
}

export function parseServerVoiceV3RoomName(roomName = "") {
  const raw = String(roomName || "").trim();
  if (!raw.startsWith(SERVER_VOICE_V3_ROOM_PREFIX)) return null;
  const remainder = raw.slice(SERVER_VOICE_V3_ROOM_PREFIX.length);
  const separator = remainder.indexOf(":voice:");
  if (separator <= 0) return null;
  const serverId = normalizeId(remainder.slice(0, separator));
  const channelId = normalizeId(remainder.slice(separator + ":voice:".length));
  return serverId && channelId ? { serverId, channelId } : null;
}

export function isServerVoiceV3RoomForChannel(roomName = "", serverId = "", channelId = "") {
  const parsed = parseServerVoiceV3RoomName(roomName);
  return !!(
    parsed
    && parsed.serverId === normalizeId(serverId)
    && parsed.channelId === normalizeId(channelId)
  );
}
