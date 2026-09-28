// Delivery gate only. The private database rollout and Auth boundary remain authoritative.
// Enable only in an explicitly approved staged release after the runbook gates pass.
export const BR_ACCOUNT_PRIVACY_CLIENT_ENABLED = false;
// Anonymous/signup surfaces keep discovery off. The authenticated app explicitly
// discovers its own canary state independently of the global UI delivery flag.
// Backend membership/session checks remain authoritative; no local enrollment.
export const BR_CANARY_CLIENT_DISCOVERY_ENABLED = false;
export const BR_ACCOUNT_PRIVACY_CLIENT_CAPABILITIES = Object.freeze(["br-age-privacy-v1"]);
export const BR_ACCOUNT_PRIVACY_WEB_RELEASE = "br-age-privacy-v1-2026-09-15";
