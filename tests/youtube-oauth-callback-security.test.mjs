import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { GET } from "../app/oauth/youtube/callback/route.ts";
import {
  getPostMessageTargetOrigin,
  normalizeReason,
  normalizeReturnTo,
  serializeForInlineScript,
} from "../app/oauth/youtube/callback/security.ts";
import {
  consumeTrustedYouTubeCallbackMessage,
  consumeTrustedYouTubeReturnSignal,
  parseYouTubeDesktopCallbackStatus,
  readYouTubeOAuthStateFromAuthorizationUrl,
  YOUTUBE_OAUTH_CALLBACK_TYPE,
  YOUTUBE_OAUTH_FLOW_MAX_AGE_MS,
} from "../public/app/lib/youtubeOAuthSecurity.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const VALID_STATE = "A".repeat(43);

function returnTo(status = "connected", state = VALID_STATE, protocol = "web") {
  const url = new URL(
    protocol === "electron"
      ? "altara://connections?connection=youtube"
      : "https://altaraapp.com/app/",
  );
  url.searchParams.set("connection", "youtube");
  if (protocol === "electron") {
    url.searchParams.set("status", `youtube-${status}.${state}`);
  } else {
    url.searchParams.set("youtubeConnection", status);
    url.searchParams.set("status", status);
    url.searchParams.set("oauth_state", state);
  }
  if (status === "error") url.searchParams.set("reason", "youtube_callback_failed");
  return url.toString();
}

function callbackUrl({
  status = "connected",
  state = VALID_STATE,
  reason,
  protocol = "web",
  returnState = state,
} = {}) {
  const url = new URL("https://altaraapp.com/oauth/youtube/callback");
  url.searchParams.set("altara_youtube_callback_result", "1");
  url.searchParams.set("connection", "youtube");
  url.searchParams.set("youtubeConnection", status);
  url.searchParams.set("status", status);
  url.searchParams.set("oauth_state", state);
  if (reason !== undefined) url.searchParams.set("reason", reason);
  url.searchParams.set("return_to", returnTo(status, returnState, protocol));
  return url;
}

async function responseFor(options) {
  const response = await GET(new Request(callbackUrl(options)));
  return { response, html: await response.text() };
}

function scriptTagCounts(html) {
  return {
    opening: (html.match(/<script\b/gi) || []).length,
    closing: (html.match(/<\/script\s*>/gi) || []).length,
  };
}

test("inline serializer escapes every HTML script-context delimiter", () => {
  const serialized = serializeForInlineScript({ value: "</script><svg>&\u2028\u2029" });
  assert.match(serialized, /\\u003c\/script\\u003e/);
  assert.match(serialized, /\\u003csvg\\u003e\\u0026/);
  assert.match(serialized, /\\u2028/);
  assert.match(serialized, /\\u2029/);
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/u);
  assert.equal(serializeForInlineScript(undefined), "null");
});

test("reason normalization is a closed enum and unknown values fail generic", () => {
  assert.equal(normalizeReason("access_denied"), "youtube_login_cancelled");
  assert.equal(normalizeReason("state_expired"), "youtube_session_mismatch");
  assert.equal(normalizeReason("youtube_channel_not_found"), "youtube_channel_not_found");
  assert.equal(normalizeReason("quota 403"), "youtube_callback_failed");
  assert.equal(normalizeReason("cancel</script>"), "youtube_callback_failed");
});

test("script-closing reason cannot create a second script element", async () => {
  const marker = '</script><script>document.documentElement.dataset.altaraAudit="1"</script>';
  const { response, html } = await responseFor({ status: "error", reason: marker });
  assert.equal(response.status, 200);
  assert.deepEqual(scriptTagCounts(html), { opening: 1, closing: 1 });
  assert.doesNotMatch(html, /document\.documentElement\.dataset\.altaraAudit/i);
  assert.doesNotMatch(html, /<script>document\.documentElement/i);
  assert.match(html, /Could not connect YouTube/);
});

test("mixed-case script close plus SVG handler remains inert", async () => {
  const marker = '</ScRiPt><SvG onload=document.documentElement.dataset.altaraAudit="2">';
  const { response, html } = await responseFor({ status: "error", reason: marker });
  assert.equal(response.status, 200);
  assert.deepEqual(scriptTagCounts(html), { opening: 1, closing: 1 });
  assert.doesNotMatch(html, /<svg\s+onload=/i);
  assert.doesNotMatch(html, /altaraaudit/i);
});

test("callback uses one nonce-bound script and complete route security headers", async () => {
  const first = await responseFor();
  const second = await responseFor();
  const firstNonce = first.html.match(/<script nonce="([^"]+)">/)?.[1] || "";
  const secondNonce = second.html.match(/<script nonce="([^"]+)">/)?.[1] || "";
  assert.ok(firstNonce);
  assert.ok(secondNonce);
  assert.notEqual(firstNonce, secondNonce);
  assert.deepEqual(scriptTagCounts(first.html), { opening: 1, closing: 1 });
  assert.match(first.response.headers.get("content-security-policy") || "", new RegExp(`script-src 'nonce-${firstNonce}'`));
  assert.match(first.response.headers.get("content-security-policy") || "", /default-src 'none'/);
  assert.doesNotMatch(first.response.headers.get("content-security-policy") || "", /script-src[^;]*'unsafe-inline'/);
  assert.equal(first.response.headers.get("x-frame-options"), "DENY");
  assert.equal(first.response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(first.response.headers.get("referrer-policy"), "no-referrer");
});

test("success callback is a verification signal, not connected proof", async () => {
  const { response, html } = await responseFor();
  assert.equal(response.status, 200);
  assert.match(html, /Checking YouTube connection/);
  assert.match(html, new RegExp(YOUTUBE_OAUTH_CALLBACK_TYPE));
  assert.doesNotMatch(html, /type":"altara:youtube-connected/);
  assert.doesNotMatch(html, />YouTube connected</);
  assert.doesNotMatch(html, /postMessage\(payload,\s*"\*"\)/);
  assert.match(html, /postMessage\(payload, targetOrigin\)/);
  assert.equal(getPostMessageTargetOrigin(returnTo()), "https://altaraapp.com");
  assert.equal(getPostMessageTargetOrigin("https://www.altaraapp.com/app/"), "https://www.altaraapp.com");
});

test("missing, mismatched, ambiguous, and forged result state fail closed", async () => {
  const missing = callbackUrl();
  missing.searchParams.delete("oauth_state");
  const missingResponse = await GET(new Request(missing));
  assert.equal(missingResponse.status, 400);
  assert.equal(scriptTagCounts(await missingResponse.text()).opening, 0);

  const wrong = await responseFor({ returnState: "B".repeat(43) });
  assert.equal(wrong.response.status, 400);

  const ambiguous = callbackUrl();
  ambiguous.searchParams.append("oauth_state", VALID_STATE);
  assert.equal((await GET(new Request(ambiguous))).status, 400);

  const forged = new URL("https://altaraapp.com/oauth/youtube/callback?altara_youtube_callback_result=1&status=connected");
  const forgedResponse = await GET(new Request(forged));
  const forgedHtml = await forgedResponse.text();
  assert.equal(forgedResponse.status, 400);
  assert.doesNotMatch(forgedHtml, />YouTube connected</);
});

test("return_to accepts only approved ALTARA web and exact Electron destinations", () => {
  assert.equal(normalizeReturnTo("https://attacker.example/app/"), "");
  assert.equal(normalizeReturnTo("https://altaraapp.com.attacker.example/app/"), "");
  assert.equal(normalizeReturnTo("https://altaraapp.com@attacker.example/app/"), "");
  assert.equal(normalizeReturnTo("https://altaraapp.com/app/%2e%2e/"), "");
  assert.equal(normalizeReturnTo("not a URL"), "");
  assert.equal(normalizeReturnTo("altara://connections?connection=youtube&unexpected=1"), "");
  assert.equal(normalizeReturnTo("altara://connections/?connection=youtube"), "");
  assert.equal(normalizeReturnTo("altara://evil?connection=youtube"), "");
  assert.equal(normalizeReturnTo("https://altaraapp.com/app/"), "https://altaraapp.com/app/");
  assert.equal(normalizeReturnTo("https://www.altaraapp.com/app/"), "https://www.altaraapp.com/app/");
  assert.equal(normalizeReturnTo("altara://connections?connection=youtube"), "altara://connections?connection=youtube");
  assert.equal(
    normalizeReturnTo(returnTo(), { expectedState: VALID_STATE, expectedStatus: "connected" }),
    returnTo(),
  );
  assert.equal(
    normalizeReturnTo(returnTo("connected", VALID_STATE, "electron"), {
      expectedState: VALID_STATE,
      expectedStatus: "connected",
    }),
    returnTo("connected", VALID_STATE, "electron"),
  );
});

test("localhost return is development-only", () => {
  const local = "http://localhost:3000/app/";
  assert.equal(normalizeReturnTo(local, { allowLocalhost: false }), "");
  assert.equal(normalizeReturnTo(local, { allowLocalhost: true }), local);
});

test("Google authorization URL must carry a valid state on the exact endpoint", () => {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("state", VALID_STATE);
  assert.equal(readYouTubeOAuthStateFromAuthorizationUrl(url), VALID_STATE);
  url.hostname = "accounts.google.com.attacker.example";
  assert.equal(readYouTubeOAuthStateFromAuthorizationUrl(url), "");
});

test("receiver rejects foreign origin, wrong source, wrong type, wrong state, expiry, and reuse", () => {
  const popup = {};
  const pending = {
    callbackOrigin: "https://altaraapp.com",
    popup,
    startedAt: 1_000,
    state: VALID_STATE,
  };
  const event = {
    data: { type: YOUTUBE_OAUTH_CALLBACK_TYPE, provider: "youtube", state: VALID_STATE },
    origin: "https://altaraapp.com",
    source: popup,
  };
  const trusted = consumeTrustedYouTubeCallbackMessage(pending, event, { now: 2_000 });
  assert.equal(trusted.accepted, true);
  assert.equal(trusted.pending, null);
  assert.equal(consumeTrustedYouTubeCallbackMessage(trusted.pending, event, { now: 2_000 }).accepted, false);
  assert.equal(consumeTrustedYouTubeCallbackMessage(pending, { ...event, origin: "https://attacker.example" }, { now: 2_000 }).reason, "wrong_origin");
  assert.equal(consumeTrustedYouTubeCallbackMessage(pending, { ...event, source: {} }, { now: 2_000 }).reason, "wrong_source");
  assert.equal(consumeTrustedYouTubeCallbackMessage(pending, { ...event, data: { ...event.data, type: "altara:youtube-connected" } }, { now: 2_000 }).reason, "wrong_type");
  assert.equal(consumeTrustedYouTubeCallbackMessage(pending, { ...event, data: { ...event.data, state: "B".repeat(43) } }, { now: 2_000 }).reason, "wrong_state");
  assert.equal(
    consumeTrustedYouTubeCallbackMessage(pending, event, { now: 1_000 + YOUTUBE_OAUTH_FLOW_MAX_AGE_MS + 1 }).reason,
    "expired",
  );
});

test("Electron return consumes the same one-time in-memory state", () => {
  const pending = { startedAt: 5_000, state: VALID_STATE };
  const parsed = parseYouTubeDesktopCallbackStatus(`youtube-connected.${VALID_STATE}`);
  assert.deepEqual(parsed, { status: "connected", oauthState: VALID_STATE });
  assert.equal(parseYouTubeDesktopCallbackStatus(`connected.${VALID_STATE}`), null);
  assert.equal(parseYouTubeDesktopCallbackStatus("youtube-connected.invalid"), null);
  const signal = { provider: "youtube", oauthState: parsed.oauthState, state: parsed.status };
  const trusted = consumeTrustedYouTubeReturnSignal(pending, signal, { now: 6_000 });
  assert.equal(trusted.accepted, true);
  assert.equal(consumeTrustedYouTubeReturnSignal(trusted.pending, signal, { now: 6_000 }).accepted, false);
  assert.equal(
    consumeTrustedYouTubeReturnSignal(pending, { ...signal, oauthState: "B".repeat(43) }, { now: 6_000 }).reason,
    "wrong_state",
  );
});

test("renderer routes accepted callbacks only to authoritative backend refresh", async () => {
  const source = await readFile(path.join(repositoryRoot, "public/app/app.js"), "utf8");
  assert.match(source, /consumeTrustedYouTubeCallbackMessage\(pendingYouTubeConnect, event\)/);
  assert.match(source, /source: "trusted_youtube_callback"/);
  assert.match(source, /refreshConnectionAfterCallback\(\{[\s\S]*provider: YOUTUBE_PROVIDER/);
  assert.match(source, /ignored insecure legacy callback notification/);
  assert.match(source, /bridge\.onDeepLink\(/);
  assert.match(source, /"getPendingDeepLink"/);
  assert.match(source, /sessionStorage\.setItem\(YOUTUBE_OAUTH_PENDING_STORAGE_KEY/);
  assert.match(source, /restorePendingYouTubeConnect\(\)/);
  assert.match(source, /window\.open\(resolvedUrl, "_blank", "popup"\)/);
  assert.doesNotMatch(source, /type === "altara:youtube-connected" \? YOUTUBE_PROVIDER/);
});
