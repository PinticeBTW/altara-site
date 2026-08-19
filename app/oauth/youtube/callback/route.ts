import {
  getPostMessageTargetOrigin,
  isValidOAuthState,
  normalizeReason,
  normalizeReturnTo,
  serializeForInlineScript,
  YOUTUBE_CALLBACK_MESSAGE_TYPE,
  type YouTubeCallbackReason,
} from "./security.ts";

const YOUTUBE_CALLBACK_TARGET =
  "https://tbbgwjmmaiclkhssimhf.functions.supabase.co/youtube-connect-callback";

const RESULT_QUERY_KEYS = new Set([
  "altara_youtube_callback_result",
  "connection",
  "oauth_state",
  "reason",
  "return_to",
  "status",
  "youtubeConnection",
]);

type CallbackResult = {
  status: "connected" | "error";
  reason: YouTubeCallbackReason;
  returnTo: string;
  state: string;
  targetOrigin: string;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const nonce = crypto.randomUUID();
  const url = new URL(request.url);

  if (url.searchParams.get("altara_youtube_callback_result") === "1") {
    const result = parseCallbackResult(url);

    if (!result) {
      return new Response(buildInvalidResultHtml(), {
        status: 400,
        headers: callbackHeaders(nonce),
      });
    }

    return new Response(buildCallbackResultHtml(result, nonce), {
      status: 200,
      headers: callbackHeaders(nonce),
    });
  }

  const rawSearch = getRawSearch(request.url);

  if (!rawSearch) {
    return new Response(buildMissingQueryHtml(), {
      status: 400,
      headers: callbackHeaders(nonce),
    });
  }

  return new Response("Redirecting to ALTARA YouTube callback.", {
    status: 302,
    headers: callbackHeaders(nonce, "text/plain; charset=utf-8", {
      Location: YOUTUBE_CALLBACK_TARGET + rawSearch,
    }),
  });
}

function parseCallbackResult(url: URL): CallbackResult | null {
  const keys = Array.from(url.searchParams.keys());
  if (keys.some((key) => !RESULT_QUERY_KEYS.has(key))) return null;
  if (!hasSingleValue(url, "altara_youtube_callback_result", "1")) return null;
  if (!hasSingleValue(url, "connection", "youtube")) return null;

  const status = getSingleValue(url, "status");
  if (status !== "connected" && status !== "error") return null;
  if (!hasSingleValue(url, "youtubeConnection", status)) return null;

  const state = getSingleValue(url, "oauth_state");
  if (!state || !isValidOAuthState(state)) return null;

  const rawReason = status === "error" ? getOptionalSingleValue(url, "reason") : "";
  if (rawReason === null) return null;
  if (status === "connected" && url.searchParams.has("reason")) return null;
  const reason = normalizeReason(rawReason || "");

  const rawReturnTo = getSingleValue(url, "return_to");
  if (!rawReturnTo) return null;
  const returnTo = normalizeReturnTo(rawReturnTo, {
    allowLocalhost: process.env.NODE_ENV !== "production",
    expectedState: state,
    expectedStatus: status,
  });
  if (!returnTo) return null;

  return {
    status,
    reason,
    returnTo,
    state,
    targetOrigin: getPostMessageTargetOrigin(returnTo),
  };
}

function buildCallbackResultHtml(result: CallbackResult, nonce: string) {
  const { status, reason, returnTo, state, targetOrigin } = result;
  const copy = getCallbackCopy(status, reason);
  const payload = {
    type: YOUTUBE_CALLBACK_MESSAGE_TYPE,
    provider: "youtube",
    state,
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(copy.title)}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: radial-gradient(circle at 50% 0%, rgba(255,255,255,.08), transparent 32%), #090a0d;
      color: #f4f4f4;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(440px, 100%);
      padding: 30px;
      border: 1px solid rgba(238, 211, 151, .22);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(28,30,36,.96), rgba(15,16,20,.96));
      box-shadow: 0 28px 90px rgba(0,0,0,.48);
      text-align: center;
    }
    .brand {
      margin-bottom: 18px;
      color: #dec78c;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: .32em;
      text-transform: uppercase;
    }
    .mark {
      width: 58px;
      height: 58px;
      display: inline-grid;
      place-items: center;
      border-radius: 999px;
      margin-bottom: 18px;
      background: ${status === "connected" ? "linear-gradient(145deg, #ff0033, #9f001f)" : "linear-gradient(145deg, #7f1d1d, #351010)"};
      color: #fff;
      font-weight: 950;
      box-shadow: 0 16px 42px rgba(0,0,0,.32);
    }
    h1 { margin: 0 0 8px; font-size: 24px; line-height: 1.18; letter-spacing: 0; }
    p { margin: 0; color: #c8c8c8; line-height: 1.5; }
    .note { margin-top: 10px; color: #8f96a3; font-size: 13px; }
    .actions { display: flex; justify-content: center; margin-top: 22px; }
    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 0 17px;
      border: 1px solid rgba(238,211,151,.32);
      border-radius: 999px;
      background: rgba(238,211,151,.11);
      color: #f8efd7;
      text-decoration: none;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <main>
    <div class="brand">ALTARA</div>
    <div class="mark">${status === "connected" ? "YT" : "!"}</div>
    <h1>${htmlEscape(copy.message)}</h1>
    <p>${htmlEscape(copy.subcopy)}</p>
    ${copy.note ? `<p class="note">${htmlEscape(copy.note)}</p>` : ""}
    <div class="actions"><a href="${htmlEscape(returnTo)}">${htmlEscape(copy.actionLabel)}</a></div>
  </main>
  <script nonce="${htmlEscape(nonce)}">
    (function () {
      var payload = ${serializeForInlineScript(payload)};
      var returnTo = ${serializeForInlineScript(returnTo)};
      var targetOrigin = ${serializeForInlineScript(targetOrigin)};
      try {
        if (targetOrigin && window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, targetOrigin);
          setTimeout(function () { try { window.close(); } catch (_) {} }, 900);
          return;
        }
      } catch (_) {}
      if (/^altara:\/\/connections(?:[/?#]|$)/i.test(returnTo)) {
        setTimeout(function () {
          try { window.location.href = returnTo; } catch (_) {}
        }, 700);
      }
    }());
  </script>
</body>
</html>`;
}

function getCallbackCopy(status: "connected" | "error", reason: YouTubeCallbackReason) {
  if (status === "connected") {
    return {
      title: "Checking YouTube connection",
      message: "Checking YouTube connection",
      subcopy: "ALTARA will confirm the connection from your account.",
      note: "This window can be closed after ALTARA finishes checking.",
      actionLabel: "Return to ALTARA",
    };
  }

  if (reason === "youtube_login_cancelled") {
    return {
      title: "YouTube connection cancelled",
      message: "Google login cancelled.",
      subcopy: "Return to ALTARA and click Connect YouTube when you are ready.",
      note: "",
      actionLabel: "Try again in ALTARA",
    };
  }

  if (reason === "youtube_session_mismatch") {
    return {
      title: "YouTube connection expired",
      message: "YouTube login session expired.",
      subcopy: "Return to ALTARA and start Connect YouTube again.",
      note: "",
      actionLabel: "Try again in ALTARA",
    };
  }

  if (reason === "youtube_channel_not_found") {
    return {
      title: "No YouTube channel found",
      message: "No YouTube channel was found for this Google account.",
      subcopy: "Choose a Google account with a YouTube channel and try again.",
      note: "",
      actionLabel: "Try again in ALTARA",
    };
  }

  return {
    title: "YouTube connection failed",
    message: "Could not connect YouTube.",
    subcopy: "Return to ALTARA and try connecting again.",
    note: "",
    actionLabel: "Try again in ALTARA",
  };
}

function callbackHeaders(nonce: string, contentType = "text/html; charset=utf-8", extra: HeadersInit = {}) {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", contentType);
  headers.set(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  );
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return headers;
}

function getSingleValue(url: URL, key: string): string | null {
  const values = url.searchParams.getAll(key);
  return values.length === 1 ? values[0] : null;
}

function getOptionalSingleValue(url: URL, key: string): string | null {
  const values = url.searchParams.getAll(key);
  return values.length <= 1 ? (values[0] || "") : null;
}

function hasSingleValue(url: URL, key: string, expected: string): boolean {
  return getSingleValue(url, key) === expected;
}

function getRawSearch(requestUrl: string) {
  const questionIndex = requestUrl.indexOf("?");

  if (questionIndex === -1 || questionIndex === requestUrl.length - 1) {
    return "";
  }

  const hashIndex = requestUrl.indexOf("#", questionIndex);

  return hashIndex === -1
    ? requestUrl.slice(questionIndex)
    : requestUrl.slice(questionIndex, hashIndex);
}

function htmlEscape(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildInvalidResultHtml() {
  return buildMessageHtml(
    "Invalid YouTube callback",
    "This YouTube callback could not be verified.",
  );
}

function buildMissingQueryHtml() {
  return buildMessageHtml(
    "ALTARA YouTube callback",
    "YouTube callback details are missing.",
  );
}

function buildMessageHtml(title: string, message: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(title)}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #090a0d; color: #f5f0e4; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(430px, 100%); padding: 28px; border: 1px solid rgba(238, 211, 151, .22); border-radius: 18px; background: linear-gradient(180deg, rgba(28,30,36,.96), rgba(15,16,20,.96)); box-shadow: 0 28px 90px rgba(0,0,0,.48); text-align: center; }
    .brand { margin-bottom: 16px; color: #dec78c; font-size: 13px; font-weight: 900; letter-spacing: .32em; text-transform: uppercase; }
    h1 { margin: 0 0 8px; font-size: 23px; line-height: 1.2; }
    p { margin: 0 0 20px; color: #c8c8c8; line-height: 1.5; }
    a { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 17px; border: 1px solid rgba(238,211,151,.32); border-radius: 999px; background: rgba(238,211,151,.11); color: #f8efd7; text-decoration: none; font-weight: 800; }
  </style>
</head>
<body>
  <main>
    <div class="brand">ALTARA</div>
    <h1>${htmlEscape(title)}</h1>
    <p>${htmlEscape(message)}</p>
    <a href="/try">Open ALTARA</a>
  </main>
</body>
</html>`;
}
