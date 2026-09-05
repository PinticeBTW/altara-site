const SAFE_TEMP_ID_RE = /[^a-z0-9_-]+/gi;

function normalizeId(value = "") {
  return String(value || "").trim();
}

function readNow(now) {
  const value = Number(typeof now === "function" ? now() : Date.now());
  return Number.isFinite(value) ? value : Date.now();
}

export function createMessageConversationGeneration({ now = () => Date.now() } = {}) {
  let generation = 0;
  let activeConversationId = "";
  let startedAt = 0;

  return Object.freeze({
    begin(conversationId = "") {
      activeConversationId = normalizeId(conversationId);
      generation += 1;
      startedAt = readNow(now);
      return Object.freeze({
        conversationId: activeConversationId,
        generation,
        startedAt,
      });
    },
    isCurrent(token = null) {
      return !!token
        && Number(token.generation || 0) === generation
        && normalizeId(token.conversationId) === activeConversationId;
    },
    snapshot() {
      return {
        activeConversationId,
        generation,
        startedAt,
      };
    },
  });
}

function randomClientIdentity(cryptoImpl = globalThis.crypto) {
  try {
    if (typeof cryptoImpl?.randomUUID === "function") {
      return String(cryptoImpl.randomUUID()).toLowerCase();
    }
  } catch (_) {}
  try {
    if (typeof cryptoImpl?.getRandomValues === "function") {
      const bytes = new Uint32Array(4);
      cryptoImpl.getRandomValues(bytes);
      return Array.from(bytes, (value) => value.toString(36)).join("-");
    }
  } catch (_) {}
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export function createOptimisticMessageIdentity({
  conversationId = "",
  sequence = 0,
  now = () => Date.now(),
  cryptoImpl = globalThis.crypto,
} = {}) {
  const scope = normalizeId(conversationId)
    .toLowerCase()
    .replace(SAFE_TEMP_ID_RE, "")
    .slice(0, 12) || "conversation";
  const random = randomClientIdentity(cryptoImpl)
    .replace(SAFE_TEMP_ID_RE, "")
    .slice(0, 64) || "local";
  const seq = Math.max(0, Number(sequence || 0) || 0).toString(36);
  const time = Math.max(0, readNow(now)).toString(36);
  return `tmp_msg_${scope}_${random}_${seq}_${time}`;
}

function errorText(error = null) {
  return [error?.code, error?.status, error?.message, error?.details, error?.hint, error]
    .map((value) => String(value || ""))
    .join(" ")
    .trim()
    .toLowerCase();
}

export function classifyOptimisticMessageFailure(error = null, { online = true } = {}) {
  const text = errorText(error);
  const denied = /(?:^|\W)(?:401|403|42501)(?:\W|$)|permission denied|row-level security|rls policy|not authenticated|invalid jwt|missing_send_messages|server_member_timed_out/.test(text);
  const revoked = /not_conversation_member|conversation_not_found|conversation deleted|conversation revoked|channel_access_denied|not_server_member|no longer have access/.test(text);
  const rateLimited = /(?:^|\W)429(?:\W|$)|rate[_ -]?limit|too many requests/.test(text);
  const transient = online === false
    || /network|failed to fetch|timeout|timed out|temporarily unavailable|connection (?:closed|lost|reset)|econnreset|econnrefused|etimedout/.test(text);

  if (revoked) {
    return { category: "access_revoked", retryable: false, userMessage: "You no longer have access to this conversation." };
  }
  if (denied) {
    return { category: "permission_denied", retryable: false, userMessage: "Message not sent. You do not have permission to send here." };
  }
  if (rateLimited) {
    return { category: "rate_limited", retryable: true, userMessage: "Message not sent. Wait a moment, then retry." };
  }
  if (transient) {
    return { category: "transient", retryable: true, userMessage: "Message not sent. Check your connection and retry." };
  }
  return { category: "unknown", retryable: true, userMessage: "Message not sent. Retry." };
}

export function messagesShareOptimisticIdentity(optimistic = null, authoritative = null) {
  if (!optimistic || !authoritative) return false;
  if (normalizeId(optimistic.conversation_id) !== normalizeId(authoritative.conversation_id)) return false;
  if (normalizeId(optimistic.user_id) !== normalizeId(authoritative.user_id)) return false;
  if (normalizeId(optimistic.reply_to_id) !== normalizeId(authoritative.reply_to_id)) return false;
  if (String(optimistic.content ?? "") !== String(authoritative.content ?? "")) return false;
  const optimisticAt = Date.parse(String(optimistic.created_at || ""));
  const authoritativeAt = Date.parse(String(authoritative.created_at || ""));
  if (Number.isFinite(optimisticAt) && Number.isFinite(authoritativeAt)) {
    if (Math.abs(authoritativeAt - optimisticAt) > 10 * 60 * 1000) return false;
  }
  return optimistic._optimistic === true;
}
