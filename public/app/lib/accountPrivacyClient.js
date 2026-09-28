import { BR_ACCOUNT_PRIVACY_CLIENT_ENABLED, BR_CANARY_CLIENT_DISCOVERY_ENABLED } from "./accountPrivacyConfig.js";
import { createAccountPrivacyClientIdentity } from "./accountPrivacyClientIdentity.js";

const STATUSES = new Set(["rollout_off","available","eligible","not_applicable","missing_region","invalid_region","region_conflict",
 "missing_dob","malformed_dob","future_dob","underage","missing_terms_acceptance","missing_privacy_acknowledgement",
 "outdated_policy_acceptance","age_assurance_insufficient","policy_unavailable","prepared","invalid_declaration","invalid_command",
 "invalid_email","invalid_locale","rate_limited","region_change_requires_support","dob_change_requires_support",
 "activity_opt_in_unavailable","request_recorded","request_cancelled","request_not_found","request_not_cancellable",
 "invalid_request_kind","invalid_request_key","idempotency_conflict","invalid_action","invalid_client",
 "client_compatible","client_update_required","presence_available","presence_recorded","presence_cleared","invalid_presence",
 "canary_enrolled","canary_paused","canary_removed","canary_voice_pending","client_registered",
 "policy_required","policy_complete","campaign_paused","no_longer_authorized"]);
const unavailable = () => ({ status: "policy_unavailable", requires_completion: true });
const canaryStopped = (s) => ["canary_paused","canary_removed","campaign_paused","no_longer_authorized"].includes(s?.status);
// Discovery describes the client journey; it never grants product authorization.
export function canaryClientState(scope) {
 if (!scope || scope.status === "policy_unavailable") return "backend_unavailable";
 if (canaryStopped(scope)) return "campaign_paused";
 if (scope.status === "canary_voice_pending") return "canary_voice_pending";
 if (!scope.scoped || !scope.active) return "off";
 if (scope.policy_status === "client_update_required" || scope.status === "client_update_required") return "client_update_required";
 if (scope.allowed === true || scope.signal === "canary_policy_completed" || scope.status === "policy_complete") return "policy_complete";
 return "policy_required";
}
export const policyAllowsProduct = (s) => !!s && (
 s.status === "rollout_off" || s.status === "eligible" || s.status === "not_applicable" ||
 (s.status === "missing_region" && s.requires_completion === false)
);
export function applyActivityPrivacy(settings, snapshot, enabled = true) {
 if (!enabled) return settings;
 // No account snapshot yet: do not publish activity during account-policy resolution.
 if (!snapshot || !policyAllowsProduct(snapshot) || (snapshot.minor_activity_protected && snapshot.activity_enabled !== true)) {
  return { ...settings, displayGameActivity: false, detectGamesAutomatically: false };
 }
 return settings;
}
export function signupPolicyMetadata(prepared) {
 if (prepared?.status === "rollout_off") return {};
 if (prepared?.status !== "prepared" || !/^[0-9a-f-]{72}$/i.test(prepared.ticket || "")) throw new Error("policy_unavailable");
 // Never spread declaration/DOB/assurance/acceptances into Auth metadata.
 return { br_signup_ticket: prepared.ticket };
}
export function policyMessage(status, translate = null) {
 status=({campaign_paused:"canary_paused",no_longer_authorized:"canary_removed",backend_unavailable:"policy_unavailable"})[status] || status;
 const messages = ({
  missing_region: "Choose your country of residence.",
  region_conflict: "Your country information needs review. Contact support to correct it.",
  invalid_region: "Choose a country from the list.",
  missing_dob: "Enter your date of birth.",
  malformed_dob: "Enter a valid date of birth.",
  future_dob: "Your date of birth cannot be in the future.",
  underage: "ALTARA is currently available in Brazil for people aged 17 or older.",
  missing_terms_acceptance: "Please read and accept the Terms of Service.",
  missing_privacy_acknowledgement: "Please read and acknowledge the Privacy Policy.",
  outdated_policy_acceptance: "The documents have changed. Please review the current versions.",
  age_assurance_insufficient: "An additional age check is required before continuing. A date-of-birth declaration alone is not enough. Contact support for help.",
  region_change_requires_support: "Contact support to correct your country of residence.",
  dob_change_requires_support: "Contact support to correct your date of birth.",
  activity_opt_in_unavailable: "Activity sharing is currently off for this account.",
  client_update_required: "Update ALTARA to continue. Privacy, support, export, deletion and logout remain available.",
  canary_paused: "Test access is paused. Your account and privacy requests remain available. Contact support for help.",
  canary_removed: "Test access has ended. Your account and privacy requests remain available. Contact support for help.",
  canary_voice_pending: "Your beta access is being set up. Please wait and try again. Your account and privacy requests remain available.",
  policy_required: "Please complete your account information to continue.",
  rate_limited: "Please wait before trying again.",
  request_recorded: "Your request has been recorded. It still needs to be processed.",
  request_cancelled: "Your request has been cancelled.",
  request_not_cancellable: "This request is already being processed. Contact support for help.",
  request_not_found: "This request is not available.",
 });
 const fallback = messages[status] || "Account privacy information is temporarily unavailable. Please retry or contact support.";
 if(typeof translate !== "function") return fallback;
 const key = messages[status] ? `privacy.status.${status}` : "privacy.status.unavailable";
 return translate(key, fallback);
}
export function createAccountPrivacyClient(supabase, {
 enabled = BR_ACCOUNT_PRIVACY_CLIENT_ENABLED, getUserId = () => "", getClientInfo = () => null,
 timeoutMs = 10000, clientRenewMs = 5 * 60 * 1000,
 canaryDiscoveryEnabled = BR_CANARY_CLIENT_DISCOVERY_ENABLED, canaryPollMs = 15000, onCanaryChange = null,
 instanceStorage = undefined,
 passiveRegistrationEnabled = false,
} = {}) {
 let snapshot = null, snapshotOwner = "", sequence = 0;
 let clientRenewTimer = null;
 let canary = null, canaryOwner = "", canarySequence = 0, canaryTimer = null, disposed = false;
 const clientIdentity=createAccountPrivacyClientIdentity(getUserId,{persist:canaryDiscoveryEnabled || passiveRegistrationEnabled,storage:instanceStorage});
 let passiveStarted=false, passiveTimer=null, passiveEpoch=0, passiveFlight=null, passiveLast=null;
 let passiveState={status:"not_started"};
 let canaryRevisionFloor = {}, activationFence = null, authorityEpoch = 0, discoveryStarted = false, canaryGateArmed = false;
 const canaryRevisionKeys=["campaign_revision","member_revision","policy_revision","region_revision"];
 function observeCanaryRevisions(value) {
  if(canaryRevisionKeys.some(k=>Number.isFinite(canaryRevisionFloor[k]) &&
    (!Number.isSafeInteger(value[k]) || value[k]<canaryRevisionFloor[k]))) return false;
  for(const key of canaryRevisionKeys)if(Number.isSafeInteger(value[key]))canaryRevisionFloor[key]=value[key];
  return true;
 }
 const policyEnabled = () => enabled || (canaryDiscoveryEnabled && canaryOwner === owner() && canary?.scoped === true);
 const gateRequired = () => policyEnabled() && (enabled || canaryGateArmed);
 const owner = () => String(getUserId() || "");
 const invalidationListeners = new Set();
 const clear = ({preserveIdentity=false}={}) => {
  passiveEpoch++;passiveFlight=null;passiveLast=null;passiveState={status:"not_started"};
  clearTimeout(passiveTimer);passiveTimer=null;
  snapshot = null; snapshotOwner = ""; sequence++;
  authorityEpoch++;
  canary = null; canaryOwner = ""; canarySequence++;
  canaryRevisionFloor={};
  activationFence=null;
  canaryGateArmed=false;
  clearTimeout(canaryTimer); canaryTimer = null;
  if(!preserveIdentity)clientIdentity.clear(authSubject || owner());
  clearTimeout(clientRenewTimer); clientRenewTimer = null;
  for(const listener of invalidationListeners) { try { listener({reason:"identity"}); } catch (_) {} }
 };
 // Supabase can switch subject in another tab while the app still holds its old state.user.
 // Bind this private surface to BOTH identities and invalidate pending work synchronously.
 const hasAuthLifecycle = typeof supabase.auth?.onAuthStateChange === "function";
 let authSubject = "", authResolved = !hasAuthLifecycle, authEpoch = 0;
 const authMatchesOwner = () => !hasAuthLifecycle || (authResolved && !!authSubject && authSubject === owner());
 const authSubscription = (enabled || canaryDiscoveryEnabled || passiveRegistrationEnabled) && hasAuthLifecycle ? supabase.auth.onAuthStateChange((event, session) => {
  const next = String(session?.user?.id || "");
  if (next !== authSubject || event === "SIGNED_OUT") {
   clear({preserveIdentity:!authResolved && !authSubject && event!=="SIGNED_OUT"});authEpoch++;
  }
  authSubject = next; authResolved = true;
  // Leave Supabase's synchronous Auth callback before making an RPC.
  if(passiveStarted && next && ["INITIAL_SESSION","SIGNED_IN","TOKEN_REFRESHED"].includes(event)) {
   clearTimeout(passiveTimer);
   passiveTimer=setTimeout(()=>{passiveTimer=null;void registerPassiveClient();},0);
   passiveTimer?.unref?.();
  }
  if(discoveryStarted && next && ["INITIAL_SESSION","SIGNED_IN","TOKEN_REFRESHED"].includes(event)) {
   scheduleCanary(0);
  }
 })?.data?.subscription : null;
 async function confirmAuthSubject() {
  if (!hasAuthLifecycle) return true; // Minimal contract fixtures have no Auth transport.
  if (!authResolved) {
   const epoch = authEpoch; let timer;
   try {
    const result = await Promise.race([supabase.auth.getSession(),new Promise((_,reject)=>{
     timer=setTimeout(()=>reject(new Error("timeout")),timeoutMs);
    })]);
    if (epoch !== authEpoch) return authSubject === owner() && !!authSubject;
    if (result?.error) return false;
    authSubject=String(result?.data?.session?.user?.id || "");authResolved=true;
   } catch (_) { return false; } finally { clearTimeout(timer); }
  }
  return !!authSubject && authSubject === owner();
 }
 async function rpc(name, args) {
  let timer;
  try {
   const response = await Promise.race([
    supabase.rpc(name, args),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); }),
   ]);
   if (response?.error || !response?.data || !STATUSES.has(response.data.status)) return unavailable();
   return response.data;
  } catch (_) { return unavailable(); }
  finally { clearTimeout(timer); }
 }
 async function self(command) {
  if(disposed) return unavailable();
  if (!policyEnabled()) return { status: "rollout_off", requires_completion: false };
  if (hasAuthLifecycle && !await confirmAuthSubject()) { clear(); return unavailable(); }
  const actor = owner(), epoch = ++sequence;
  if (!actor || !authMatchesOwner()) { clear(); return unavailable(); }
  const result = await rpc("account_privacy_command_v1", { p_command: command });
  if (actor !== owner() || epoch !== sequence || !authMatchesOwner()) return unavailable();
  if(canaryDiscoveryEnabled && canary?.scoped && typeof result.requires_completion==="boolean") {
   const revisions={...result.canary,policy_revision:result.policy_revision};
   if(canaryRevisionKeys.some(k=>!Number.isSafeInteger(revisions[k]) || revisions[k]<0) || !observeCanaryRevisions(revisions)) return unavailable();
  }
  if (typeof result.requires_completion === "boolean") { snapshot = result; snapshotOwner = actor; }
  return result;
 }
 function scheduleCanary(delay = Math.max(1000,Math.min(15000,Number(canaryPollMs)||15000))) {
  clearTimeout(canaryTimer);
  if(disposed) return;
  canaryTimer=setTimeout(()=>{canaryTimer=null;void refreshCanary();},delay);
  canaryTimer?.unref?.();
 }
 async function refreshCanary() {
  if (!canaryDiscoveryEnabled || disposed) return null;
  discoveryStarted=true;
  if (!await confirmAuthSubject()) { clear(); return unavailable(); }
  const actor=owner(), epoch=++canarySequence;
  if(!actor || !authMatchesOwner()) {clear();return unavailable();}
  const previous=canaryOwner===actor?canary:null;
  const result=await rpc("br_canary_status_v1",{});
  if(disposed || epoch!==canarySequence || actor!==owner() || !authMatchesOwner()) return unavailable();
  // A late response cannot roll back an already observed server revision.
  const revisionKeys=canaryRevisionKeys;
  const valid=result.status!=="policy_unavailable" && typeof result.scoped==="boolean" && typeof result.active==="boolean" && (!result.active || result.scoped) &&
    (!result.scoped || revisionKeys.every(k=>Number.isSafeInteger(result[k]) && result[k]>=0));
  // NOT_ENROLLED legitimately omits member/campaign revisions. Keep the floor
  // from the old membership, so an old active reply still cannot resurrect it.
  const unscoped=valid && !result.scoped && !result.active;
  const resurrects=activationFence && (result.active || result.status==="canary_voice_pending") &&
   !["campaign_revision","member_revision"].some(k=>Number.isSafeInteger(result[k]) && result[k]>activationFence[k]);
  const stale=valid && (resurrects || !observeCanaryRevisions(unscoped?{...canaryRevisionFloor,...result}:result));
  if(stale) {
   scheduleCanary();
   return unavailable();
  }
  canary=valid?result:{...previous,...unavailable(),scoped:previous?.scoped===true,active:false};canaryOwner=actor;
  // An outage cannot turn an observed pause/removal back into a completion gate.
  if(valid) canaryGateArmed=result.scoped && !canaryStopped(result);
  if(valid && (canaryStopped(result) || (unscoped && previous?.scoped))) activationFence={...canaryRevisionFloor};
  const authorityKeys=["status","scoped","active",...revisionKeys];
  const changed=previous && (authorityKeys.some(k=>previous[k]!==canary[k]) || canaryClientState(previous)!==canaryClientState(canary) || (previous.allowed===true && canary.allowed!==true));
  if(changed) {
   snapshot=null;snapshotOwner="";sequence++;authorityEpoch++;
   clearTimeout(clientRenewTimer);clientRenewTimer=null;
   for(const listener of invalidationListeners){try{listener({reason:"canary",canary});}catch(_){}}
   // Update the existing gate in place. REST/Edge still recheck server authority.
   if(previous.scoped || canary.scoped) {try{onCanaryChange?.(canary);}catch(_){}}
  }
  scheduleCanary();
  return canary;
 }
 function clientInstanceId() {
  return clientIdentity.get();
 }
 function registerPassiveClient() {
  if(!passiveRegistrationEnabled || disposed) return Promise.resolve({status:"not_started"});
  if(passiveFlight) return passiveFlight;
  const epoch=passiveEpoch;
  const work=(async()=>{
   if(!await confirmAuthSubject() || disposed || epoch!==passiveEpoch) return {status:"registration_unavailable"};
   const actor=owner(), info=getClientInfo?.(), instance=clientInstanceId();
   if(!actor || !authMatchesOwner() || !info || !instance) return {status:"registration_unavailable"};
   const payload={registration_mode:"passive",client_instance_id:instance,platform:info.platform,
    os:info.os || "unknown",release:info.release,capabilities:Array.isArray(info.capabilities)?info.capabilities:[]};
   const key=JSON.stringify([actor,payload]);
   const interval=Math.max(1000,Number(clientRenewMs)||5*60*1000);
   let result;
   if(passiveLast?.key===key && Date.now()-passiveLast.at<interval) result=passiveState;
   else {
    const response=await rpc("account_privacy_register_client_v1",{p_client:payload});
    result={status:response.status==="client_registered"?"client_registered":"registration_unavailable"};
   }
   if(disposed || epoch!==passiveEpoch || actor!==owner() || !authMatchesOwner()) return {status:"registration_unavailable"};
   if(result.status==="client_registered" && passiveLast?.key!==key) passiveLast={key,at:Date.now()};
   else if(result.status==="client_registered" && Date.now()-passiveLast.at>=interval) passiveLast.at=Date.now();
   passiveState=result;
   clearTimeout(passiveTimer);
   passiveTimer=setTimeout(()=>{passiveTimer=null;void registerPassiveClient();},interval);
   passiveTimer?.unref?.();
   return result;
  })().catch(()=>({status:"registration_unavailable"}));
  passiveFlight=work;
  void work.finally(()=>{if(passiveFlight===work)passiveFlight=null;});
  return work;
 }
 async function registerClient(info = getClientInfo?.()) {
  if (!policyEnabled()) return { status: "rollout_off" };
  // Minimal/offline clients created without delivery metadata retain the v1
  // library contract. The real app always supplies the main-process/web build.
  if (!info) return { status: canaryDiscoveryEnabled ? "client_update_required" : "client_compatible" };
  if(!await confirmAuthSubject()) return unavailable();
  const actor = owner(), epoch=authorityEpoch;
  if(!actor || !authMatchesOwner() || disposed) return unavailable();
  const instance = clientInstanceId();
  if (!instance) return unavailable();
  const result = await rpc("account_privacy_register_client_v1", { p_client: {
   client_instance_id: instance,
   platform: info.platform,
   release: info.release,
   capabilities: Array.isArray(info.capabilities) ? info.capabilities : [],
  } });
  if(disposed || epoch!==authorityEpoch || actor!==owner() || !authMatchesOwner()) return unavailable();
  if (result.status === "client_compatible") {
   clearTimeout(clientRenewTimer);
   clientRenewTimer = setTimeout(() => {
    clientRenewTimer = null;
    if (actor === owner() && epoch===authorityEpoch) void refresh();
   }, Math.max(1000, Number(clientRenewMs) || 5 * 60 * 1000));
   clientRenewTimer?.unref?.();
  }
  return result;
 }
 async function refresh({discover=true}={}) {
  if(canaryDiscoveryEnabled && discover) {
   const scope=await refreshCanary();
   if(scope?.status==="policy_unavailable") return unavailable();
  }
  if(canaryDiscoveryEnabled && canaryOwner===owner()) {
   if(canary?.status==="policy_unavailable") return unavailable();
   if(canaryStopped(canary)) return self({action:"status"});
   if(canary?.status==="canary_voice_pending") {
    snapshot={...canary,requires_completion:true};snapshotOwner=owner();return snapshot;
   }
  }
  const epoch=authorityEpoch, actor=owner();
  const info = getClientInfo?.();
  if (!info) return self({ action: "status" });
  return registerClient(info).then((compatibility) => {
   if(disposed || epoch!==authorityEpoch || actor!==owner() || !authMatchesOwner()) return unavailable();
   if(canaryDiscoveryEnabled && policyEnabled() && compatibility.status!=="client_compatible") {
    snapshot={status:compatibility.status==="client_update_required"?"client_update_required":"policy_unavailable",requires_completion:true};
    snapshotOwner=actor;return snapshot;
   }
   if (compatibility.status === "client_update_required" || compatibility.status === "policy_unavailable") {
    return { ...compatibility, requires_completion: true };
   }
   return self({ action: "status" });
  });
 }
 return {
  get enabled(){return policyEnabled();}, clear, dispose: () => { disposed=true;clear(); authSubscription?.unsubscribe(); },
  get gateRequired(){return gateRequired();},
  getCanaryState: () => canaryClientState(canaryOwner===owner() && authMatchesOwner()?canary:null),
  onInvalidate: (listener) => { invalidationListeners.add(listener);return ()=>invalidationListeners.delete(listener); },
  getSnapshot: () => snapshotOwner === owner() && authMatchesOwner() ? snapshot : null,
  isCurrent: (result) => result === snapshot && snapshotOwner === owner() && authMatchesOwner(),
  constrainActivity: (settings) => applyActivityPrivacy(settings, snapshotOwner === owner() && authMatchesOwner() ? snapshot : null, policyEnabled()),
  allowsActivity: () => applyActivityPrivacy({ displayGameActivity: true }, snapshotOwner === owner() && authMatchesOwner() ? snapshot : null, policyEnabled()).displayGameActivity === true,
  requirements: () => policyEnabled() ? rpc("account_privacy_requirements_v1", {}) : Promise.resolve({ status: "rollout_off", enabled: false }),
  prepareSignup: (declaration) => enabled ? rpc("account_privacy_prepare_signup_v1", { p_declaration: declaration }) : Promise.resolve({ status: "rollout_off" }),
  registerClient,
  startPassiveRegistration: () => {passiveStarted=true;return registerPassiveClient();},
  getPassiveRegistration: () => ({...passiveState}),
  refreshCanary,
  refresh,
  usesRelationshipPresence: () => policyEnabled(),
  complete: (declaration) => self({ ...declaration, action: "complete" }),
  setActivity: (value) => self({ action: "activity", enabled: value === true }),
  request: (kind, idempotencyKey) => self({ action: "request", kind, idempotency_key: idempotencyKey }),
  cancel: (requestId) => self({ action: "cancel_request", request_id: requestId }),
 };
}
