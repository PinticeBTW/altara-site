const YOUTUBE_CALLBACK_TARGET =
  "https://tbbgwjmmaiclkhssimhf.functions.supabase.co/youtube-connect-callback";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("altara_youtube_callback_result") === "1") {
    return new Response(buildCallbackResultHtml(url), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const rawSearch = getRawSearch(request.url);

  if (!rawSearch) {
    return new Response(buildMissingQueryHtml(), {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new Response("Redirecting to ALTARA YouTube callback.", {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      Location: YOUTUBE_CALLBACK_TARGET + rawSearch,
    },
  });
}

function buildCallbackResultHtml(url: URL) {
  const status = url.searchParams.get("status") === "connected" ? "connected" : "error";
  const reason = normalizeReason(url.searchParams.get("reason") || "");
  const returnTo = normalizeReturnTo(url.searchParams.get("return_to") || "");
  const copy = getCallbackCopy(status, reason);
  const payload = status === "connected"
    ? { type: "altara:youtube-connected", provider: "youtube", status: "connected" }
    : { type: "altara:youtube-connect-error", provider: "youtube", status: "error", reason };
  const actionHref = returnTo || "/try";

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
    <div class="actions"><a href="${htmlEscape(actionHref)}">${htmlEscape(copy.actionLabel)}</a></div>
  </main>
  <script>
    (function () {
      var payload = ${JSON.stringify(payload)};
      var returnTo = ${JSON.stringify(returnTo)};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, "*");
          setTimeout(function () { try { window.close(); } catch (_) {} }, 900);
          return;
        }
      } catch (_) {}
      if (/^altara:\\/\\//i.test(returnTo)) {
        setTimeout(function () {
          try { window.location.href = returnTo; } catch (_) {}
        }, 700);
      }
    }());
  </script>
</body>
</html>`;
}

function getCallbackCopy(status: "connected" | "error", reason: string) {
  if (status === "connected") {
    return {
      title: "YouTube connected",
      message: "YouTube connected",
      subcopy: "You can return to ALTARA.",
      note: "This window can be closed.",
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

function normalizeReason(reason: string) {
  const raw = String(reason || "").trim().toLowerCase();
  if (!raw) return "youtube_callback_failed";
  if (raw === "access_denied" || raw.includes("denied") || raw.includes("cancel")) return "youtube_login_cancelled";
  if (raw.includes("state") || raw.includes("session")) return "youtube_session_mismatch";
  if (raw.includes("channel_not_found")) return "youtube_channel_not_found";
  if (raw.includes("quota") || raw.includes("403")) return "youtube_api_unavailable";
  return raw.slice(0, 80);
}

function normalizeReturnTo(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const protocol = url.protocol.toLowerCase();

    if (protocol === "altara:" || protocol === "https:" || protocol === "http:") {
      return url.toString();
    }
  } catch {
    return "";
  }

  return "";
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
    .replace(/"/g, "&quot;");
}

function buildMissingQueryHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ALTARA YouTube callback</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #090a0d;
      color: #f5f0e4;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(430px, 100%);
      padding: 28px;
      border: 1px solid rgba(238, 211, 151, .22);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(28,30,36,.96), rgba(15,16,20,.96));
      box-shadow: 0 28px 90px rgba(0,0,0,.48);
      text-align: center;
    }
    .brand {
      margin-bottom: 16px;
      color: #dec78c;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: .32em;
      text-transform: uppercase;
    }
    h1 { margin: 0 0 8px; font-size: 23px; line-height: 1.2; }
    p { margin: 0 0 20px; color: #c8c8c8; line-height: 1.5; }
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
    <h1>YouTube callback is missing details</h1>
    <p>Return to ALTARA and start Connect YouTube again.</p>
    <a href="/try">Open ALTARA</a>
  </main>
</body>
</html>`;
}
