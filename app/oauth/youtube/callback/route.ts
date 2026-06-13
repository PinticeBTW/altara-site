const YOUTUBE_CALLBACK_TARGET =
  "https://tbbgwjmmaiclkhssimhf.functions.supabase.co/youtube-connect-callback";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
