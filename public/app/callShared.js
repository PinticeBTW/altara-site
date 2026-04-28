// callShared.js
// Shared call system (overlay + callbar + WebRTC + Supabase signals)
// Works in app.html + profile.html (and any page that imports it)

import { supabase } from "./supabaseClient.js";
import {
  createCallChannel as createRealtimeCallChannel,
  joinCallChannel as joinRealtimeCallChannel,
  sendCallSignal as broadcastCallSignal,
  leaveCallChannel as leaveRealtimeCallChannel,
} from "./lib/callRealtime.js";

/* -------------------------
   Small helpers
------------------------- */
function $(id){ return document.getElementById(id); }

export function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* -------------------------
   STATE
------------------------- */
const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const SFX = {
  ring: new Audio("./sfx/ring.mp3"),
  incoming: new Audio("./sfx/incoming.mp3"),
  hangup: new Audio("./sfx/hangup.mp3"),
};
for (const a of Object.values(SFX)){
  a.preload = "auto";
  a.loop = false;
}

let audioUnlocked = false;
function unlockAudioOnce(){
  if (audioUnlocked) return;
  audioUnlocked = true;
  for (const a of Object.values(SFX)){
    try{
      a.volume = 0.0001;
      a.play().then(()=>{ a.pause(); a.currentTime = 0; a.volume = 1; }).catch(()=>{});
    }catch(_){}
  }
}
window.addEventListener("pointerdown", unlockAudioOnce, { once:true });

function playSfx(name){
  const a = SFX[name];
  if (!a) return;
  try{ a.currentTime = 0; a.play().catch(()=>{}); }catch(_){}
}
function stopSfx(name){
  const a = SFX[name];
  if (!a) return;
  try{ a.pause(); a.currentTime = 0; }catch(_){}
}

// WebRTC runtime
let callPc = null;
let callLocalStream = null;

let inCall = false;
let pendingOffer = null;

let ringTimeout = null;
let lonelyTimeout = null;

let meUser = null;

// Call identity
let callConversationId = null;
let callOtherUserId = null;
let callOtherLabel = null;

// Global realtime channel
let globalCallChannel = null;
const callRealtimeChannels = new Map();
let activeCallRealtimeChannel = null;

// Optional callbacks (set by pages)
let onCallUiUpdate = null; // (state)=>void
let onNavigateToDm = null; // (conversationId)=>Promise<void>  (app page only)

/* -------------------------
   DOM (optional per page)
------------------------- */
function els(){
  return {
    overlay: $("globalCallOverlay"),
    oTitle: $("globalCallTitle"),
    oSub: $("globalCallSub"),
    oHint: $("globalCallHint"),
    oAccept: $("globalCallAccept"),
    oDecline: $("globalCallDecline"),

    callBar: $("callBar"),
    callBarTitle: $("callBarTitle"),
    callBarStatus: $("callBarStatus"),
    callBarBack: $("callBarBack"),
    callBarHang: $("callBarHang"),

    remoteAudio: $("callRemoteAudio"),
  };
}

function showOverlay(show){
  const { overlay } = els();
  if (!overlay) return;
  overlay.classList.toggle("is-open", !!show);
  overlay.setAttribute("aria-hidden", show ? "false" : "true");
}

function showCallBar(show){
  const { callBar } = els();
  if (!callBar) return;
  callBar.classList.toggle("is-open", !!show);
}

function setCallBarInfo(){
  const { callBarTitle, callBarStatus } = els();
  if (!callBarTitle || !callBarStatus) return;

  callBarTitle.textContent = callOtherLabel ? `Em chamada com ${callOtherLabel}` : "Em chamada";
  callBarStatus.textContent = inCall ? "Ligado" : "A ligar…";
}

async function ensureRemoteAudio(){
  let a = els().remoteAudio;
  if (a) return a;

  // if page doesn't have it, create hidden audio
  a = document.createElement("audio");
  a.id = "callRemoteAudio";
  a.autoplay = true;
  a.playsInline = true;
  a.style.display = "none";
  document.body.appendChild(a);
  return a;
}

async function getLocalAudioStream(){
  if (callLocalStream) return callLocalStream;
  callLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return callLocalStream;
}

function clearTimers(){
  if (ringTimeout){ clearTimeout(ringTimeout); ringTimeout = null; }
  if (lonelyTimeout){ clearTimeout(lonelyTimeout); lonelyTimeout = null; }
}

function cleanupPeer(){
  clearTimers();

  try{
    if (callPc){
      callPc.onicecandidate = null;
      callPc.ontrack = null;
      callPc.onconnectionstatechange = null;
      callPc.close();
    }
  }catch(_){}
  callPc = null;

  try{
    if (callLocalStream){
      callLocalStream.getTracks().forEach(t => t.stop());
    }
  }catch(_){}
  callLocalStream = null;

  pendingOffer = null;
  inCall = false;
}

/* -------------------------
   Signals
------------------------- */
function mapLegacyKindToRealtimeType(kind){
  const normalized = String(kind || "").trim().toLowerCase();
  if (normalized === "offer") return "offer";
  if (normalized === "answer") return "answer";
  if (normalized === "hangup" || normalized === "cancel" || normalized === "missed") return "hangup";
  if (normalized === "mute") return "mute";
  if (normalized === "unmute") return "unmute";
  return "ice-candidate";
}

function toLegacySignal(signal){
  const data = signal?.data && typeof signal.data === "object" && !Array.isArray(signal.data)
    ? signal.data
    : {};
  const payload = { ...data };
  delete payload.signalKind;
  delete payload.targetUserId;
  return {
    conversation_id: String(signal?.conversationId || "").trim(),
    from_user_id: String(signal?.fromUserId || "").trim(),
    to_user_id: String(data?.targetUserId || "").trim() || null,
    kind: String(data?.signalKind || "").trim().toLowerCase() || (signal?.type === "ice-candidate" ? "ice" : String(signal?.type || "").trim().toLowerCase()),
    payload,
    created_at: String(signal?.createdAt || ""),
  };
}

async function ensureCallChannel(conversationId){
  const convId = String(conversationId || "").trim();
  if (!convId || !meUser?.id) return null;
  const existing = callRealtimeChannels.get(convId);
  if (existing && !existing.closed) return existing;
  const channel = await createRealtimeCallChannel({
    conversationId: convId,
    conversationType: "dm",
    currentUserId: meUser.id,
    onSignal: async (signal) => {
      await onCallSignal(toLegacySignal(signal));
    },
    onError: (error) => console.warn("callShared realtime error", error),
  });
  callRealtimeChannels.set(convId, channel);
  return channel;
}

async function syncGlobalCallChannels(){
  if (!meUser?.id) return;
  const { data, error } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", meUser.id);
  if (error) {
    console.error("callShared membership sync failed", error);
    return;
  }

  const desired = new Set((data || []).map((row) => String(row?.conversation_id || "").trim()).filter(Boolean));
  for (const [convId, channel] of Array.from(callRealtimeChannels.entries())) {
    if (desired.has(convId)) continue;
    try { await leaveRealtimeCallChannel(channel, { unsubscribe: true }); } catch (_) {}
    callRealtimeChannels.delete(convId);
  }
  await Promise.allSettled(Array.from(desired).map((convId) => ensureCallChannel(convId)));
}

async function activateCallChannel(conversationId, meta = {}){
  const channel = await ensureCallChannel(conversationId);
  if (!channel) return null;
  if (activeCallRealtimeChannel && activeCallRealtimeChannel !== channel) {
    const previousConvId = activeCallRealtimeChannel.conversationId;
    try { await leaveRealtimeCallChannel(activeCallRealtimeChannel, { unsubscribe: true }); } catch (_) {}
    if (previousConvId) callRealtimeChannels.delete(previousConvId);
    if (previousConvId) await ensureCallChannel(previousConvId);
  }
  await joinRealtimeCallChannel(channel, meta);
  activeCallRealtimeChannel = channel;
  return channel;
}

async function releaseActiveCallChannel(){
  if (!activeCallRealtimeChannel) return;
  const convId = activeCallRealtimeChannel.conversationId;
  try { await leaveRealtimeCallChannel(activeCallRealtimeChannel, { unsubscribe: true }); } catch (_) {}
  activeCallRealtimeChannel = null;
  if (convId) {
    callRealtimeChannels.delete(convId);
    await ensureCallChannel(convId);
  }
}

async function sendCallSignal(kind, payload={}, toUserId=null, conversationIdOverride=null){
  if (!meUser) return;

  const convId = conversationIdOverride || callConversationId || payload?.conversation_id || null;
  if (!convId) return;
  const channel = await ensureCallChannel(convId);
  if (!channel) return;
  const targetUserId = String(toUserId || callOtherUserId || "").trim() || null;
  const data = payload && typeof payload === "object" && !Array.isArray(payload)
    ? { ...payload, signalKind: String(kind || "").trim().toLowerCase(), targetUserId }
    : { value: payload ?? null, signalKind: String(kind || "").trim().toLowerCase(), targetUserId };
  await broadcastCallSignal(channel, {
    type: mapLegacyKindToRealtimeType(kind),
    conversationId: convId,
    fromUserId: meUser.id,
    data,
    createdAt: new Date().toISOString(),
  });
}

function createPeerConnection(){
  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.onicecandidate = (ev) => {
    if (ev.candidate){
      sendCallSignal("ice", { candidate: ev.candidate }, callOtherUserId, callConversationId);
    }
  };

  pc.ontrack = async (ev) => {
    const audioEl = await ensureRemoteAudio();
    audioEl.srcObject = ev.streams[0];
    try { await audioEl.play(); } catch(_) {}
  };

  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;

    if (st === "connected"){
      inCall = true;
      stopSfx("ring");
      stopSfx("incoming");
      showOverlay(false);

      // show global callbar everywhere
      setCallBarInfo();
      showCallBar(true);

      // page can update its own UI (app DM stage)
      onCallUiUpdate?.(getPublicState());

      clearTimers();
      lonelyTimeout = setTimeout(async ()=>{
        await sendCallSignal("hangup", { reason:"lonely_timeout" }, callOtherUserId, callConversationId);
        await endCall("⏱️ Chamada terminou (timeout).");
      }, 5 * 60 * 1000);
    }

    if (st === "failed" || st === "disconnected" || st === "closed"){
      if (inCall){
        endCall("⚠️ A chamada terminou.");
      }
    }
  };

  return pc;
}

/* -------------------------
   Public state
------------------------- */
function getPublicState(){
  return {
    inCall,
    pendingOffer: !!pendingOffer,
    callConversationId,
    callOtherUserId,
    callOtherLabel,
  };
}

/* -------------------------
   High-level actions
------------------------- */
export async function initCalls({ user, onUiUpdate, onOpenDm }){
  meUser = user;
  onCallUiUpdate = onUiUpdate || null;
  onNavigateToDm = onOpenDm || null;

  // wire callbar buttons if exist
  const { callBarBack, callBarHang } = els();

  if (callBarBack){
    callBarBack.onclick = async ()=>{
      // if app page provided callback -> go to that DM
      if (onNavigateToDm && callConversationId){
        await onNavigateToDm(callConversationId);
      } else {
        // fallback: just hide (doesn't end call)
        showCallBar(false);
      }
    };
  }

  if (callBarHang){
    callBarHang.onclick = async ()=>{
      await hangup("manual_callbar");
    };
  }

  startGlobalCallListener();

  // initial UI sync
  onCallUiUpdate?.(getPublicState());
}

function startGlobalCallListener(){
  if (!meUser) return;
  if (globalCallChannel){
    try { supabase.removeChannel(globalCallChannel); } catch(_){}
    globalCallChannel = null;
  }
  void syncGlobalCallChannels();
}

async function onCallSignal(sig){
  if (!sig || !meUser) return;

  if (sig.from_user_id === meUser.id) return;
  if (sig.to_user_id && sig.to_user_id !== meUser.id) return;

  const kind = sig.kind;
  const payload = sig.payload || {};
  const conversationId = sig.conversation_id;
  const fromLabel = payload.from_label || "Alguém";

  if (kind === "offer"){
    // store pending
    pendingOffer = payload.sdp;
    callConversationId = conversationId;
    callOtherUserId = sig.from_user_id;
    callOtherLabel = fromLabel;

    // overlay
    const { oTitle, oSub, oHint, oAccept, oDecline } = els();
    if (oTitle) oTitle.textContent = "📞 Chamada a entrar";
    if (oSub) oSub.textContent = `De: ${fromLabel}`;
    if (oHint) oHint.textContent = "Podes atender já (mesmo fora da DM).";

    showOverlay(true);
    playSfx("incoming");

    clearTimers();
    ringTimeout = setTimeout(async ()=>{
      pendingOffer = null;
      stopSfx("incoming");
      showOverlay(false);
      await sendCallSignal("missed", {}, sig.from_user_id, conversationId);
      onCallUiUpdate?.(getPublicState());
    }, 30 * 1000);

    if (oAccept){
      oAccept.onclick = async ()=>{
        stopSfx("incoming");
        clearTimers();
        showOverlay(false);

        // open DM if possible
        if (onNavigateToDm && callConversationId){
          await onNavigateToDm(callConversationId);
        }

        await answer();
      };
    }

    if (oDecline){
      oDecline.onclick = async ()=>{
        stopSfx("incoming");
        clearTimers();
        showOverlay(false);

        pendingOffer = null;
        await sendCallSignal("hangup", { reason:"declined" }, sig.from_user_id, conversationId);
        onCallUiUpdate?.(getPublicState());
      };
    }

    onCallUiUpdate?.(getPublicState());
    return;
  }

  if (kind === "answer"){
    if (!callPc) return;
    try{
      clearTimers();
      await callPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    }catch(e){
      console.error(e);
    }
    onCallUiUpdate?.(getPublicState());
    return;
  }

  if (kind === "ice"){
    if (!callPc) return;
    try{
      if (payload.candidate){
        await callPc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    }catch(e){
      console.warn("ICE add failed", e);
    }
    return;
  }

  if (kind === "hangup" || kind === "cancel" || kind === "missed"){
    showOverlay(false);
    pendingOffer = null;
    await endCall("📴 A chamada terminou.");
    onCallUiUpdate?.(getPublicState());
    return;
  }
}

export async function start(conversationId, otherUserId, otherLabel){
  if (!meUser) return;
  if (inCall || callPc) return;

  callConversationId = conversationId;
  callOtherUserId = otherUserId;
  callOtherLabel = otherLabel || "amigo";

  // show callbar during ring
  setCallBarInfo();
  showCallBar(true);

  try{
    await activateCallChannel(conversationId, { phase: "outgoing" });
    callPc = createPeerConnection();
    const stream = await getLocalAudioStream();
    stream.getTracks().forEach(track => callPc.addTrack(track, stream));

    playSfx("ring");

    clearTimers();
    ringTimeout = setTimeout(async ()=>{
      await sendCallSignal("cancel", {}, otherUserId, conversationId);
      await endCall("⏱️ Ninguém atendeu.");
      onCallUiUpdate?.(getPublicState());
    }, 30 * 1000);

    const offer = await callPc.createOffer();
    await callPc.setLocalDescription(offer);

    await sendCallSignal("offer", {
      sdp: offer,
      from_label: otherLabelFromMe(),
    }, otherUserId, conversationId);

    onCallUiUpdate?.(getPublicState());
  }catch(e){
    console.error(e);
    await endCall("❌ Falhou ao iniciar chamada.");
    onCallUiUpdate?.(getPublicState());
  }
}

function otherLabelFromMe(){
  // best effort from user metadata if exists
  return meUser?.user_metadata?.display_name
    || meUser?.user_metadata?.username
    || "Alguém";
}

export async function answer(){
  if (!pendingOffer || !meUser) return;

  // show callbar while connecting
  setCallBarInfo();
  showCallBar(true);

  try{
    await activateCallChannel(callConversationId, { phase: "answering" });
    callPc = createPeerConnection();

    const stream = await getLocalAudioStream();
    stream.getTracks().forEach(track => callPc.addTrack(track, stream));

    await callPc.setRemoteDescription(new RTCSessionDescription(pendingOffer));

    const answer = await callPc.createAnswer();
    await callPc.setLocalDescription(answer);

    await sendCallSignal("answer", { sdp: answer }, callOtherUserId, callConversationId);

    pendingOffer = null;
    stopSfx("incoming");
    clearTimers();

    onCallUiUpdate?.(getPublicState());
  }catch(e){
    console.error(e);
    await endCall("❌ Falhou ao atender.");
    onCallUiUpdate?.(getPublicState());
  }
}

export async function hangup(reason="manual"){
  if (!callConversationId) return;

  try{
    await sendCallSignal("hangup", { reason }, callOtherUserId, callConversationId);
  }catch(_){}
  await endCall("📴 Desligaste.");
  onCallUiUpdate?.(getPublicState());
}

export async function endCall(msg=null){
  stopSfx("ring");
  stopSfx("incoming");
  playSfx("hangup");
  await releaseActiveCallChannel();

  cleanupPeer();

  // reset identity (but keep for UI text if you want; we clear anyway)
  const lastConv = callConversationId;
  callConversationId = null;

  // hide overlay + update callbar
  showOverlay(false);
  showCallBar(false);

  // hard reset
  pendingOffer = null;

  if (msg) console.log(msg);

  // page ui update
  onCallUiUpdate?.(getPublicState());

  // optional: if app wants to react to end call
  return lastConv;
}

export function getCallState(){
  return getPublicState();
}
