import { BR_REFERRAL_CLIENT_ENABLED } from "./referralConfig.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FAILURE = new Set(["self_referral", "outside_window", "inviter_unavailable", "account_unavailable"]);

// Only backend campaign outcomes enter the existing optional telemetry journey.
// This adapter is observational; the client cannot award attribution or supply an inviter.
export function referralTelemetryOutcome(value) {
  if (!value || value.source !== "server_invite" || value.campaign !== "br-launch" || value.campaign_version !== "1") return null;
  if (value.status === "attributed" && value.outcome === "attributed") return {
    name: "referral_attributed", properties: { source: "server_invite", campaign: "br-launch", campaign_version: "1", outcome: "attributed" },
  };
  if (value.status === "rejected" && FAILURE.has(value.outcome)) return {
    name: "referral_failed", properties: { source: "server_invite", campaign: "br-launch", campaign_version: "1", outcome: value.outcome },
  };
  return null;
}

export function createReferralClient({ supabase, analytics, getUserId = () => "", enabled = BR_REFERRAL_CLIENT_ENABLED, timeoutMs = 8000 } = {}) {
  let recordedOwner = "", pendingOwner = "";
  function observeJoin(result) {
    if (!enabled || result?.error) return false;
    const row = Array.isArray(result?.data) ? result.data[0] : result?.data;
    if (!row?.ok || row.user_id !== getUserId()) return false;
    const event = referralTelemetryOutcome(row.referral);
    if (!event) return false;
    try { return analytics?.trackFunnel?.(event.name, event.properties) || false; } catch (_) { return false; }
  }
  async function observeFirstAction(messageId) {
    const actor = getUserId();
    if (!enabled || !UUID.test(actor) || !UUID.test(String(messageId || "")) || recordedOwner === actor || pendingOwner === actor) return false;
    pendingOwner = actor; let timer;
    try {
      const result = await Promise.race([
        supabase.rpc("referral_record_first_action_v1", { p_message_id: messageId }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); }),
      ]);
      if (getUserId() !== actor || result?.error || result?.data?.status !== "recorded") return false;
      recordedOwner = actor; return true;
    } catch (_) { return false; }
    finally { clearTimeout(timer); if (pendingOwner === actor) pendingOwner = ""; }
  }
  return Object.freeze({ observeJoin, observeFirstAction });
}
