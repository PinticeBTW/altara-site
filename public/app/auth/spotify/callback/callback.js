(() => {
  const params = new URLSearchParams(location.search);
  const connected = params.get("status") === "connected";
  const status = connected ? "connected" : "error";
  const reason = params.get("reason") === "spotify_denied" ? "spotify_denied" : "connection_failed";
  const returnUrl = new URL("/app.html", location.origin);
  let target = returnUrl;
  try {
    const candidate = new URL(params.get("return_to") || "", location.origin);
    // Never turn a callback query into an arbitrary external redirect.
    if (!candidate.username && !candidate.password && (
      (candidate.origin === location.origin && ["http:", "https:"].includes(candidate.protocol))
      || candidate.protocol === "altara:"
    )) target = candidate;
  } catch (_) {}
  target.search = "";
  target.hash = "";
  target.searchParams.set("connection", "spotify");
  target.searchParams.set("spotifyConnection", status);
  target.searchParams.set("status", status);
  if (!connected) target.searchParams.set("reason", reason);
  document.getElementById("return").href = target.href;
  if (connected) {
    document.getElementById("title").textContent = "Spotify connected.";
    document.getElementById("message").textContent = "Return to ALTARA; your connection will refresh automatically.";
  }
  // The app still verifies the account through its existing refresh/polling flow.
  const payload = { type: connected ? "altara:spotify-connected" : "altara:spotify-connect-error", provider: "spotify", status };
  if (!connected) payload.reason = reason;
  try {
    // Preserve the existing cross-origin dev/desktop popup notification. This
    // contains only a result hint; account state is fetched by ALTARA itself.
    if (window.opener && !window.opener.closed) window.opener.postMessage(payload, "*");
  } catch (_) {}
  history.replaceState(null, "", location.pathname);
})();
