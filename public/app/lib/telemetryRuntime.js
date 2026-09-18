import { readAltaraLocalePreference } from "./locale.js";
import {
  BR_TELEMETRY_DEFAULT_MODE,
  BR_TELEMETRY_INGEST_FUNCTION,
  BR_TELEMETRY_ROLLOUT_ENABLED,
} from "./telemetryConfig.js";
import { createTelemetryClient, mapTelemetryFailureReason, TELEMETRY_MODES } from "./telemetry.js";

function browserOsFamily(navigatorImpl = globalThis.navigator) {
  const platform = String(navigatorImpl?.userAgentData?.platform || navigatorImpl?.platform || "").toLowerCase();
  if (/win/.test(platform)) return "windows";
  if (/mac/.test(platform)) return "macos";
  if (/linux/.test(platform)) return "linux";
  return "web";
}

function isLocalInspectorEnabled() {
  try {
    const host = String(globalThis.location?.hostname || "").toLowerCase();
    return (host === "localhost" || host === "127.0.0.1" || globalThis.location?.protocol === "file:")
      && globalThis.__ALTARA_TELEMETRY_DEV_INSPECTOR__ === true;
  } catch (_) { return false; }
}

async function resolveBrowserRelease(fetchImpl = globalThis.fetch, bridge = globalThis.altaraDesktop) {
  if (bridge?.getMeta) {
    try {
      const meta = await bridge.getMeta();
      const release = String(meta?.version || meta?.appVersion || "").trim();
      if (release) return { release, platform: "electron_renderer", osFamily: browserOsFamily() };
    } catch (_) {}
  }
  try {
    const response = await fetchImpl?.("./release.json", { cache: "no-store", credentials: "same-origin" });
    const payload = response?.ok ? await response.json() : null;
    const release = String(payload?.version || "").trim();
    if (release) return { release, platform: "web", osFamily: browserOsFamily() };
  } catch (_) {}
  return { release: "local-development", platform: bridge ? "electron_renderer" : "web", osFamily: browserOsFamily() };
}

export function createSupabaseTelemetryTransport(supabase, functionName = BR_TELEMETRY_INGEST_FUNCTION, fetchImpl = globalThis.fetch) {
  return async (events, { keepalive = false } = {}) => {
    if (keepalive) {
      const origin = String(supabase?.supabaseUrl || "").replace(/\/$/, "");
      const publicKey = String(supabase?.supabaseKey || "").trim();
      if (origin.startsWith("https://") && publicKey && typeof fetchImpl === "function") {
        const response = await fetchImpl(`${origin}/functions/v1/${encodeURIComponent(functionName)}`, {
          method: "POST",
          headers: { "content-type": "application/json", apikey: publicKey, authorization: `Bearer ${publicKey}` },
          body: JSON.stringify({ schema_version: 1, events }),
          keepalive: true,
        });
        if (!response?.ok) throw new Error("telemetry_delivery_failed");
        const body = await response.json().catch(() => null);
        if (body?.ok !== true) throw new Error("telemetry_delivery_failed");
        return body;
      }
    }
    const response = await supabase.functions.invoke(functionName, {
      body: { schema_version: 1, events },
    });
    if (response?.error || response?.data?.ok !== true) throw new Error("telemetry_delivery_failed");
    return response.data;
  };
}

export function createAltaraBrowserTelemetry({
  supabase,
  entrypoint = "unknown",
  enabled = BR_TELEMETRY_ROLLOUT_ENABLED,
  mode = BR_TELEMETRY_DEFAULT_MODE,
  fetchImpl = globalThis.fetch,
  bridge = globalThis.altaraDesktop,
  inspector = isLocalInspectorEnabled() ? (entry) => console.info("[telemetry:local]", entry) : null,
  ...clientOptions
} = {}) {
  const client = createTelemetryClient({
    enabled,
    mode,
    context: {
      release: "",
      platform: bridge ? "electron_renderer" : "web",
      osFamily: bridge ? browserOsFamily() : "web",
      locale: readAltaraLocalePreference(),
      policyRegion: "unknown",
    },
    transport: supabase ? createSupabaseTelemetryTransport(supabase, BR_TELEMETRY_INGEST_FUNCTION, fetchImpl) : null,
    inspector,
    ...clientOptions,
  });
  const ready = resolveBrowserRelease(fetchImpl, bridge).then((release) => {
    client.setContext({ ...release, locale: readAltaraLocalePreference() });
    client.startSession(["app", "login", "register", "invite"].includes(entrypoint) ? entrypoint : "unknown");
    return release;
  }).catch(() => null);
  const onPageHide = () => { void client.flush({ keepalive: true }); };
  globalThis.addEventListener?.("pagehide", onPageHide);
  return Object.freeze({ ...client, ready });
}

export function installBrowserCrashTelemetry(analytics, {
  windowImpl = globalThis.window,
  component = "renderer",
  processType = globalThis.altaraDesktop ? "renderer" : "web",
} = {}) {
  if (!windowImpl?.addEventListener || !analytics?.error) return () => {};
  const onError = (event) => analytics.error(event, { component, operation: "uncaught_error", processType });
  const onRejection = (event) => analytics.error(event, { component, operation: "unhandled_rejection", processType, errorCode: "unhandled_rejection" });
  windowImpl.addEventListener("error", onError);
  windowImpl.addEventListener("unhandledrejection", onRejection);
  return () => {
    windowImpl.removeEventListener("error", onError);
    windowImpl.removeEventListener("unhandledrejection", onRejection);
  };
}

export function applyTelemetryAccountPolicy(analytics, snapshot = null) {
  const region = String(snapshot?.effective_policy_region || snapshot?.policy_region || "").toUpperCase();
  const policyRegion = region === "BR" ? "br" : (region ? "non_br" : "unknown");
  const isProtectedMinor = snapshot?.minor_activity_protected === true;
  const status = String(snapshot?.status || "").toLowerCase();
  const isAuthoritativelyAdultOrNonBr = !isProtectedMinor && (status === "eligible" || status === "not_applicable");
  return analytics.identifyMinimal({
    accountClass: isProtectedMinor ? "br_minor" : (isAuthoritativelyAdultOrNonBr ? "adult_or_non_br" : "unknown"),
    policyRegion,
  });
}

export function accountPolicyTelemetryReason(status = "") {
  const value = String(status || "").toLowerCase();
  if (value === "missing_region" || value === "missing_dob") return value;
  if (value === "missing_terms_acceptance") return "missing_terms";
  if (value === "missing_privacy_acknowledgement") return "missing_privacy";
  if (value === "outdated_policy_acceptance") return "outdated_policy";
  if (value === "underage") return "underage";
  if (value === "policy_unavailable") return "policy_unavailable";
  return "unknown";
}

export function telemetryFailure(name, value, stage = "unknown") {
  return name?.trackFunnel?.("funnel_error", {
    stage: String(stage || "unknown").toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 48) || "unknown",
    reason_code: mapTelemetryFailureReason(value),
  }) || false;
}

export { TELEMETRY_MODES };
