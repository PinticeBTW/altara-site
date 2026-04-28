// callManager.js
import { supabase } from "./supabaseClient.js";
import { requireAuth } from "./ui.js";
import {
  createCallChannel as createRealtimeCallChannel,
  sendCallSignal as broadcastCallSignal,
  leaveCallChannel as leaveRealtimeCallChannel,
} from "./lib/callRealtime.js";

/* =========
  STORAGE
========= */
const LS_KEY = "altara_call_state_v1";
function getState(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function setState(patch){
  const cur = getState();
  const next = { ...cur, ...patch };
  localStorage.setItem(LS_KEY, JSON.stringify(next));
  return next;
}
function clearState(){
  localStorage.removeItem(LS_KEY);
}

/* =========
  SFX
========= */
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
  const a = SFX[name]; if (!a) return;
  try{ a.currentTime = 0; a.play().catch(()=>{}); }catch(_){}
}
function stopSfx(name){
  const a = SFX[name]; if (!a) return;
  try{ a.pause(); a.currentTime = 0; }catch(_){}
}

/* =========
  GLOBAL UI (overlay + mini bar)
========= */
function ensureGlobalCallUi(){
  if (document.getElementById("globalCallOverlay")) return;

  const overlay = document.createElement("div");
  overlay.className = "callOverlay";
  overlay.id = "globalCallOverlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="callModal">
      <div class="callModal__top">
        <div class="callModal__title" id="globalCallTitle">Chamada</div>
        <div class="callModal__sub" id="globalCallSub">…</div>
      </div>
      <div class="callModal__actions">
        <button class="btn btn--accent" id="globalCallAccept" type="button">Atender</button>
        <button class="btn btn--danger" id="globalCallDecline" type="button">Desligar</button>
      </div>
      <div class="callModal__hint" id="globalCallHint"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const mini = document.createElement("div");
  mini.className = "callMini";
  mini.id = "callMini";
  mini.style.display = "none";
  mini.innerHTML = `
    <div class="callMini__left">
      <div class="callMini__dot"></div>
      <div class="callMini__text">
        <div class="callMini__title" id="callMiniTitle">Em chamada</div>
        <div class="callMini__sub" id="callMiniSub">…</div>
      </div>
    </div>
    <div class="callMini__actions">
      <button class="btn btn--accent btn-mini" id="callMiniOpen" type="button">Abrir</button>
      <button class="btn btn--danger btn-mini" id="callMiniHangup" type="button">Desligar</button>
    </div>
  `;
  document.body.appendChild(mini);
}

function showOverlay(show){
  const el = document.getElementById("globalCallOverlay");
  if (!el) return;
  el.style.display = show ? "flex" : "none";
  el.setAttribute("aria-hidden", show ? "false" : "true");
}

function showMini(show, title, sub){
  const mini = document.getElementById("callMini");
  if (!mini) return;
  mini.style.display = show ? "flex" : "none";
  const t = document.getElementById("callMiniTitle");
  const s = document.getElementById("callMiniSub");
  if (t && title) t.textContent = title;
  if (s && sub) s.textContent = sub;
}

/* =========
  WEBRTC (opcional aqui: o teu app.js já tem)
  Aqui vamos só gerir NOTIFS + estado + botões globais.
========= */
let user = null;
let globalChannel = null;
const callRealtimeChannels = new Map();

let pendingOffer = null;          // sdp
let pendingInfo = null;           // {conversationId, fromUserId, fromLabel}

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
  if (!user?.id || !convId) return null;
  const existing = callRealtimeChannels.get(convId);
  if (existing && !existing.closed) return existing;
  const channel = await createRealtimeCallChannel({
    conversationId: convId,
    conversationType: "dm",
    currentUserId: user.id,
    onSignal: async (signal) => {
      await handleSignal(toLegacySignal(signal));
    },
    onError: (error) => console.warn("callManager realtime error", error),
  });
  callRealtimeChannels.set(convId, channel);
  return channel;
}

async function syncGlobalCallChannels(){
  if (!user?.id) return;
  const { data, error } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", user.id);
  if (error) {
    console.error("callManager membership sync failed", error);
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

async function sendSignal(kind, payload={}, toUserId=null, conversationId=null){
  if (!user) return;
  const convId = conversationId || payload?.conversation_id;
  if (!convId) return;
  const channel = await ensureCallChannel(convId);
  if (!channel) return;
  const targetUserId = String(toUserId || "").trim() || null;
  const nextData = payload && typeof payload === "object" && !Array.isArray(payload)
    ? { ...payload, signalKind: String(kind || "").trim().toLowerCase(), targetUserId }
    : { value: payload ?? null, signalKind: String(kind || "").trim().toLowerCase(), targetUserId };
  await broadcastCallSignal(channel, {
    type: mapLegacyKindToRealtimeType(kind),
    conversationId: convId,
    fromUserId: user.id,
    data: nextData,
    createdAt: new Date().toISOString(),
  });
}

async function handleSignal(sig){
  if (!sig || !user) return;
  if (sig.from_user_id === user.id) return;
  if (sig.to_user_id && sig.to_user_id !== user.id) return;

  const kind = sig.kind;
  const payload = sig.payload || {};
  const conversationId = sig.conversation_id;
  const fromLabel = payload.from_label || "Alguém";

  // Se entra chamada:
  if (kind === "offer"){
    pendingOffer = payload.sdp;
    pendingInfo = { conversationId, fromUserId: sig.from_user_id, fromLabel };

    setState({
      pending: true,
      pendingConversationId: conversationId,
      pendingFromUserId: sig.from_user_id,
      pendingFromLabel: fromLabel,
    });

    ensureGlobalCallUi();
    document.getElementById("globalCallTitle").textContent = "📞 Chamada a entrar";
    document.getElementById("globalCallSub").textContent = `De: ${fromLabel}`;
    document.getElementById("globalCallHint").textContent = "Podes atender aqui em qualquer página.";

    showOverlay(true);
    playSfx("incoming");

    // auto-expira em 30s
    setTimeout(async ()=>{
      const st = getState();
      if (!st.pending) return; // já atendeste/declinaste
      pendingOffer = null;
      pendingInfo = null;
      setState({ pending:false });
      stopSfx("incoming");
      showOverlay(false);
      await sendSignal("missed", {}, sig.from_user_id, conversationId);
    }, 30_000);

    // botões
    document.getElementById("globalCallAccept").onclick = async ()=>{
      stopSfx("incoming");
      showOverlay(false);

      // guarda estado para o app.js saber “há offer pendente”
      setState({
        pending:true,
        pendingConversationId: conversationId,
        pendingFromUserId: sig.from_user_id,
        pendingFromLabel: fromLabel,
        // e sugere abrir a DM
        openConversationId: conversationId
      });

      // manda para o call screen (ou para app.html e lá atende)
      window.location.href = "./call.html";
    };

    document.getElementById("globalCallDecline").onclick = async ()=>{
      stopSfx("incoming");
      showOverlay(false);
      pendingOffer = null;
      pendingInfo = null;
      setState({ pending:false });
      await sendSignal("hangup", { reason:"declined" }, sig.from_user_id, conversationId);
    };

    return;
  }

  // terminou/cancelou:
  if (kind === "hangup" || kind === "cancel" || kind === "missed"){
    stopSfx("incoming");
    stopSfx("ring");
    playSfx("hangup");
    pendingOffer = null;
    pendingInfo = null;
    showOverlay(false);
    showMini(false);

    // limpa estado global
    setState({
      pending:false,
      inCall:false,
      conversationId:null,
      otherUserId:null,
      otherLabel:null,
      openConversationId:null,
    });
    return;
  }
}

/* =========
  PUBLIC API
========= */

// chama isto em TODAS as páginas (app + profile + call screen)
export async function initCalls(){
  ensureGlobalCallUi();
  user = await requireAuth("./login.html");
  if (!user) return null;

  if (globalChannel){
    try { supabase.removeChannel(globalChannel); } catch(_){}
    globalChannel = null;
  }
  void syncGlobalCallChannels();

  // mini-bar handlers
  document.getElementById("callMiniOpen").onclick = ()=> window.location.href = "./call.html";
  document.getElementById("callMiniHangup").onclick = async ()=>{
    const st = getState();
    if (!st.conversationId || !st.otherUserId) {
      // se não sabe, só limpa
      clearState();
      showMini(false);
      return;
    }
    await sendSignal("hangup", { reason:"manual" }, st.otherUserId, st.conversationId);
    clearState();
    showMini(false);
    playSfx("hangup");
  };

  // se já estás em chamada (persistida), mostra mini bar
  const st = getState();
  if (st.inCall){
    showMini(true, "Em chamada", st.otherLabel || "…");
  }

  return user;
}

// chamar isto sempre que mudares o estado (ex: quando conectas, quando desligas)
export function setCallUiState({ inCall, conversationId, otherUserId, otherLabel }){
  setState({ inCall, conversationId, otherUserId, otherLabel, pending:false });
  showMini(!!inCall, "Em chamada", otherLabel || "…");
}

// para o app.js recuperar se há offer pendente ao abrir DM/call screen
export function getCallState(){
  return getState();
}
export function clearCallState(){
  clearState();
  showMini(false);
  showOverlay(false);
}



