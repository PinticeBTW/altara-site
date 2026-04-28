import { supabase } from "./supabaseClient.js";
import { $, esc, setDebug, requireAuth, getMyProfile, logout, LIMITS } from "./ui.js";
import {
  createCallChannel as createRealtimeCallChannel,
  joinCallChannel as joinRealtimeCallChannel,
  sendCallSignal as broadcastCallSignal,
  leaveCallChannel as leaveRealtimeCallChannel,
} from "./lib/callRealtime.js";

function validUsername(u){
  return /^[a-z0-9_.]{3,20}$/i.test(u);
}

function setAvatar(url){
  const el = $("avatarPreview");
  el.innerHTML = url ? `<img src="${esc(url)}" alt="avatar" />` : "";
}

/* =========================
   GLOBAL CALL (para perfil também)
========================= */
let globalCallChannel = null;
const callRealtimeChannels = new Map();
let activeCallRealtimeChannel = null;
let pendingOffer = null;
let callPc = null;
let callLocalStream = null;
let callOtherUserId = null;
let callOtherLabel = null;
let callConversationId = null;

let inCall = false;

const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

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

async function ensureCallChannel(userId, conversationId){
  const uid = String(userId || "").trim();
  const convId = String(conversationId || "").trim();
  if (!uid || !convId) return null;
  const existing = callRealtimeChannels.get(convId);
  if (existing && !existing.closed) return existing;
  const channel = await createRealtimeCallChannel({
    conversationId: convId,
    conversationType: "dm",
    currentUserId: uid,
    onSignal: async (signal) => {
      await onCallSignal(toLegacySignal(signal));
    },
    onError: (error) => console.warn("profile call realtime error", error),
  });
  callRealtimeChannels.set(convId, channel);
  return channel;
}

async function syncGlobalCallChannels(userId){
  const uid = String(userId || "").trim();
  if (!uid) return;
  const { data, error } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", uid);
  if (error) {
    console.error("profile membership sync failed", error);
    return;
  }

  const desired = new Set((data || []).map((row) => String(row?.conversation_id || "").trim()).filter(Boolean));
  for (const [convId, channel] of Array.from(callRealtimeChannels.entries())) {
    if (desired.has(convId)) continue;
    try { await leaveRealtimeCallChannel(channel, { unsubscribe: true }); } catch (_) {}
    callRealtimeChannels.delete(convId);
  }
  await Promise.allSettled(Array.from(desired).map((convId) => ensureCallChannel(uid, convId)));
}

async function activateCallChannel(userId, conversationId, meta = {}){
  const channel = await ensureCallChannel(userId, conversationId);
  if (!channel) return null;
  if (activeCallRealtimeChannel && activeCallRealtimeChannel !== channel) {
    const previousConvId = activeCallRealtimeChannel.conversationId;
    try { await leaveRealtimeCallChannel(activeCallRealtimeChannel, { unsubscribe: true }); } catch (_) {}
    if (previousConvId) callRealtimeChannels.delete(previousConvId);
    if (previousConvId) await ensureCallChannel(userId, previousConvId);
  }
  await joinRealtimeCallChannel(channel, meta);
  activeCallRealtimeChannel = channel;
  return channel;
}

async function releaseActiveCallChannel(userId){
  if (!activeCallRealtimeChannel) return;
  const convId = activeCallRealtimeChannel.conversationId;
  try { await leaveRealtimeCallChannel(activeCallRealtimeChannel, { unsubscribe: true }); } catch (_) {}
  activeCallRealtimeChannel = null;
  if (convId) {
    callRealtimeChannels.delete(convId);
    await ensureCallChannel(userId, convId);
  }
}

function showOverlay(show){
  const overlay = $("globalCallOverlay");
  if (!overlay) return;
  overlay.classList.toggle("is-open", !!show);
  overlay.setAttribute("aria-hidden", show ? "false" : "true");
}

function showInCallBar(show){
  const bar = $("inCallBar");
  if (!bar) return;
  bar.classList.toggle("is-open", !!show);
  bar.setAttribute("aria-hidden", show ? "false" : "true");
}

async function ensureRemoteAudio(){
  let a = $("callRemoteAudio");
  if (a) return a;
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
  callLocalStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
  return callLocalStream;
}

async function sendCallSignal(kind, payload={}, toUserId=null, conversationIdOverride=null){
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return;

  const convId = conversationIdOverride || callConversationId;
  if (!convId) return;

  const channel = await ensureCallChannel(user.id, convId);
  if (!channel) return;
  const targetUserId = String(toUserId || callOtherUserId || "").trim() || null;
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

function createPeerConnection(){
  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.onicecandidate = (ev)=>{
    if (ev.candidate){
      sendCallSignal("ice", { candidate: ev.candidate }, callOtherUserId, callConversationId);
    }
  };

  pc.ontrack = async (ev)=>{
    const audio = await ensureRemoteAudio();
    audio.srcObject = ev.streams[0];
    try{ await audio.play(); }catch(_){}
  };

  pc.onconnectionstatechange = ()=>{
    const st = pc.connectionState;
    if (st === "connected"){
      inCall = true;
      showOverlay(false);
      showInCallBar(true);
      $("inCallBarTitle").textContent = `Em chamada com ${callOtherLabel || "amigo"}`;
      $("inCallBarSub").textContent = "Ligado";
    }
    if (st === "failed" || st === "disconnected" || st === "closed"){
      if (inCall) endCallUI();
    }
  };

  return pc;
}

async function answerCall(){
  if (!pendingOffer) return;

  try{
    const { data } = await supabase.auth.getUser();
    await activateCallChannel(data?.user?.id, callConversationId, { phase: "answering" });
    callPc = createPeerConnection();
    const stream = await getLocalAudioStream();
    stream.getTracks().forEach(t => callPc.addTrack(t, stream));

    await callPc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
    const answer = await callPc.createAnswer();
    await callPc.setLocalDescription(answer);

    await sendCallSignal("answer", { sdp: answer }, callOtherUserId, callConversationId);

    pendingOffer = null;
    showOverlay(false);
    showInCallBar(true);
  }catch(e){
    console.error(e);
    alert("Falhou ao atender: " + (e?.message ?? e));
  }
}

async function endCallUI(){
  const { data } = await supabase.auth.getUser();
  await releaseActiveCallChannel(data?.user?.id);
  try{
    if (callPc) callPc.close();
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

  showOverlay(false);
  showInCallBar(false);
}

async function onCallSignal(sig){
  const { data } = await supabase.auth.getUser();
  const me = data?.user;
  if (!me) return;

  if (sig.from_user_id === me.id) return;
  if (sig.to_user_id && sig.to_user_id !== me.id) return;

  const kind = sig.kind;
  const payload = sig.payload || {};

  if (kind === "offer"){
    pendingOffer = payload.sdp;
    callConversationId = sig.conversation_id;
    callOtherUserId = sig.from_user_id;
    callOtherLabel = payload.from_label || "Alguém";

    $("globalCallTitle").textContent = "📞 Chamada a entrar";
    $("globalCallSub").textContent = `De: ${callOtherLabel}`;
    $("globalCallHint").textContent = "Podes atender aqui mesmo no Perfil.";

    showOverlay(true);

    $("globalCallAccept").onclick = async ()=>{
      await answerCall();
    };

    $("globalCallDecline").onclick = async ()=>{
      showOverlay(false);
      pendingOffer = null;
      await sendCallSignal("hangup", { reason:"declined" }, callOtherUserId, callConversationId);
    };
    return;
  }

  if (kind === "answer"){
    if (!callPc) return;
    try{
      await callPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    }catch(e){ console.error(e); }
    return;
  }

  if (kind === "ice"){
    if (!callPc) return;
    try{
      if (payload.candidate){
        await callPc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    }catch(e){ console.warn(e); }
    return;
  }

  if (kind === "hangup" || kind === "cancel" || kind === "missed"){
    await endCallUI();
    return;
  }
}

function startGlobalCallListener(userId){
  if (globalCallChannel){
    try { supabase.removeChannel(globalCallChannel); } catch(_){}
    globalCallChannel = null;
  }
  void syncGlobalCallChannels(userId);
}

/* =========================
   PERFIL + AVATAR EDITOR (teu código)
========================= */
async function load(){
  const user = await requireAuth("./login.html");
  if (!user) return;

  $("btnLogout").addEventListener("click", logout);

  // começa listener global aqui também
  startGlobalCallListener(user.id);

  // hangup bar
  $("inCallBarHang").addEventListener("click", async ()=>{
    if (!callConversationId || !callOtherUserId) return endCallUI();
    await sendCallSignal("hangup", { reason:"manual" }, callOtherUserId, callConversationId);
    await endCallUI();
  });

  const me = await getMyProfile(user.id);
  $("meLine").textContent = me.display_name || me.username;
  $("uidLine").textContent = "UID: " + user.id;

  $("username").value = me.username || "";
  $("displayName").value = me.display_name || "";
  $("bio").value = me.bio || "";
  setAvatar(me.avatar_url);

  $("btnSaveUsername").addEventListener("click", async ()=>{
    const u = $("username").value.trim();
    if (!validUsername(u)) return alert("Username inválido.");
    const { error } = await supabase.rpc("set_my_username", { p_username: u });
    setDebug({ set_my_username: { error } });
    if (error) return alert("Erro: " + error.message);
    alert("Username guardado.");
  });

  $("btnSaveProfile").addEventListener("click", async ()=>{
    const display_name = $("displayName").value.trim();
    const bio = $("bio").value.trim();

    if (display_name.length > LIMITS.displayNameMax) {
      setDebug({ update_profile: { error: `Display name demasiado grande (máx ${LIMITS.displayNameMax})` } });
      return alert(`Display name máximo: ${LIMITS.displayNameMax} caracteres`);
    }
    if (bio.length > LIMITS.bioMax) {
      setDebug({ update_profile: { error: `Bio demasiado grande (máx ${LIMITS.bioMax})` } });
      return alert(`Bio máxima: ${LIMITS.bioMax} caracteres`);
    }

    const payload = { display_name: display_name || null, bio: bio || null };

    const { error } = await supabase.from("profiles")
      .update(payload)
      .eq("id", user.id);

    setDebug({ update_profile: { error } });
    if (error) return alert("Erro: " + error.message);
    alert("Perfil guardado.");
  });

  $("btnEmail").addEventListener("click", async ()=>{
    const email = $("newEmail").value.trim();
    if (!email) return alert("Mete um email.");
    const { data, error } = await supabase.auth.updateUser({ email });
    setDebug({ update_email: { error, data } });
    if (error) return alert("Erro: " + error.message);
    alert("Pedido de troca de email feito (pode precisar de confirmação).");
  });

  $("btnPass").addEventListener("click", async ()=>{
    const password = $("newPass").value;
    if (!password) return alert("Mete uma password.");
    const { data, error } = await supabase.auth.updateUser({ password });
    setDebug({ update_pass: { error, data } });
    if (error) return alert("Erro: " + error.message);
    alert("Password atualizada.");
  });

  // Estilo Discord: clicar no avatar abre o picker.
  const avatarPick = $("avatarPreview");
  const avatarInput = $("avatarFile");

  const openPicker = ()=> avatarInput.click();
  avatarPick.addEventListener("click", openPicker);
  avatarPick.addEventListener("keydown", (e)=>{
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  });

  avatarInput.addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")){
      alert("Escolhe uma imagem (PNG/JPG/WEBP/GIF)");
      e.target.value = "";
      return;
    }
    const ext = (String(file.name || "").split(".").pop() || "").toLowerCase();
    const isGif = file.type === "image/gif" || ext === "gif";
    const maxBytes = isGif ? (10 * 1024 * 1024) : (2 * 1024 * 1024);
    if (file.size > maxBytes){
      alert(`Imagem muito grande (max ${isGif ? "10MB" : "2MB"})`);
      e.target.value = "";
      return;
    }

    try{
      if (isGif) {
        await uploadAvatarFileDirect(file, user);
        alert("Avatar GIF atualizado.");
      } else {
        await openAvatarEditor(file, user);
      }
    } finally {
      e.target.value = "";
    }
  });
}

/* ---------- Avatar editor (zoom + drag) — teu código intacto ---------- */
const AE = {
  open: false,
  img: null,
  scale: 1,
  minScale: 1,
  maxScale: 3,
  ox: 0,
  oy: 0,
  dragging: false,
  drag: { x:0, y:0, ox:0, oy:0 },
  user: null,
  ext: "png",
};

function syncCanvasSize(canvas){
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const targetW = Math.max(1, Math.round(rect.width  * dpr));
  const targetH = Math.max(1, Math.round(rect.height * dpr));
  if(canvas.width !== targetW || canvas.height !== targetH){
    canvas.width  = targetW;
    canvas.height = targetH;
  }
  return { cssW: rect.width, cssH: rect.height, dpr };
}

function showAvatarEditor(){
  const m = document.getElementById("avatarEditorModal");
  if (!m) return;
  m.classList.remove("hidden");
  m.setAttribute("aria-hidden", "false");
}

function hideAvatarEditor(){
  const m = document.getElementById("avatarEditorModal");
  if (!m) return;
  m.classList.add("hidden");
  m.setAttribute("aria-hidden", "true");
  AE.open = false;
  AE.img = null;
  AE.user = null;
}

function fitToCover(){
  const canvas = document.getElementById("avatarEditorCanvas");
  if (!canvas || !AE.img) return;
  const info = syncCanvasSize(canvas);
  const cw = info.cssW, ch = info.cssH;
  const iw = AE.img.naturalWidth || AE.img.width;
  const ih = AE.img.naturalHeight || AE.img.height;
  const cover = Math.max(cw / iw, ch / ih);
  const contain = Math.min(cw / iw, ch / ih);

  AE.scale = contain;
  AE.minScale = contain * 0.8;
  AE.maxScale = cover * 4;
  AE.ox = (cw - iw * AE.scale) / 2;
  AE.oy = (ch - ih * AE.scale) / 2;

  const zoom = document.getElementById("avatarEditorZoom");
  if (zoom){
    zoom.min = String(AE.minScale);
    zoom.max = String(AE.maxScale);
    zoom.step = "0.001";
    zoom.value = String(AE.scale);
  }
}

function drawAvatarEditor(){
  const canvas = document.getElementById("avatarEditorCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const info = syncCanvasSize(canvas);
  ctx.setTransform(info.dpr, 0, 0, info.dpr, 0, 0);
  ctx.clearRect(0, 0, info.cssW, info.cssH);
  if (!AE.img) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const iw = AE.img.naturalWidth || AE.img.width;
  const ih = AE.img.naturalHeight || AE.img.height;

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0,0,info.cssW, info.cssH);

  ctx.save();
  const r = Math.min(info.cssW, info.cssH) * 0.42;
  const cx = info.cssW/2;
  const cy = info.cssH/2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(AE.img, AE.ox, AE.oy, iw * AE.scale, ih * AE.scale);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(info.cssW/2, info.cssH/2, Math.min(info.cssW, info.cssH) * 0.42, 0, Math.PI*2);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 4;
  ctx.stroke();
}

function bindAvatarEditorEvents(){
  const canvas = document.getElementById("avatarEditorCanvas");
  const zoom = document.getElementById("avatarEditorZoom");
  const btnReset = document.getElementById("avatarEditorReset");
  const btnApply = document.getElementById("avatarEditorApply");
  const btnClose = document.getElementById("avatarEditorClose");
  const modal = document.getElementById("avatarEditorModal");

  if (AE._bound) return;
  AE._bound = true;

  btnClose?.addEventListener("click", hideAvatarEditor);
  modal?.addEventListener("click", (e)=>{
    const t = e.target;
    if (t?.dataset?.close) hideAvatarEditor();
  });
  document.addEventListener("keydown", (e)=>{
    if (e.key === "Escape" && !document.getElementById("avatarEditorModal")?.classList.contains("hidden")) hideAvatarEditor();
  });

  zoom?.addEventListener("input", ()=>{
    const newScale = parseFloat(zoom.value);
    const oldScale = AE.scale;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width/2;
    const cy = rect.height/2;
    AE.ox = cx - (cx - AE.ox) * (newScale/oldScale);
    AE.oy = cy - (cy - AE.oy) * (newScale/oldScale);
    AE.scale = newScale;
    drawAvatarEditor();
  });

  const onDown = (ev)=>{
    AE.dragging = true;
    const p = getPoint(ev);
    AE.drag.x = p.x; AE.drag.y = p.y; AE.drag.ox = AE.ox; AE.drag.oy = AE.oy;
  };
  const onMove = (ev)=>{
    if (!AE.dragging) return;
    const p = getPoint(ev);
    AE.ox = AE.drag.ox + (p.x - AE.drag.x);
    AE.oy = AE.drag.oy + (p.y - AE.drag.y);
    drawAvatarEditor();
  };
  const onUp = ()=>{ AE.dragging = false; };

  function getPoint(ev){
    const rect = canvas.getBoundingClientRect();
    const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  canvas?.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas?.addEventListener("touchstart", onDown, { passive:true });
  window.addEventListener("touchmove", onMove, { passive:true });
  window.addEventListener("touchend", onUp);

  btnReset?.addEventListener("click", ()=>{
    fitToCover();
    drawAvatarEditor();
  });

  btnApply?.addEventListener("click", async ()=>{
    if (!AE.img || !AE.user) return;
    btnApply.disabled = true;
    btnApply.textContent = "A guardar...";
    try{
      const blob = await exportAvatarBlob(256);
      const editedExt = blob?.type === "image/jpeg" ? "jpg" : "png";
      await uploadAvatarBlob(blob, AE.user, editedExt, blob?.type || "");
      hideAvatarEditor();
      alert("Avatar atualizado ✅");
    } catch (e){
      console.error(e);
      alert("Erro no avatar: " + (e?.message ?? e));
    } finally {
      btnApply.disabled = false;
      btnApply.textContent = "Apply";
    }
  });
}

async function openAvatarEditor(file, user){
  bindAvatarEditorEvents();

  AE.user = user;
  AE.ext = (file.name.split(".").pop() || "png").toLowerCase();
  if (!/(png|jpg|jpeg|webp)$/i.test(AE.ext)) AE.ext = "png";

  const dataUrl = await fileToDataURL(file);
  const img = new Image();
  img.src = dataUrl;
  await new Promise((res, rej)=>{
    img.onload = ()=>res();
    img.onerror = ()=>rej(new Error("Não consegui ler a imagem"));
  });

  AE.img = img;
  showAvatarEditor();
  requestAnimationFrame(()=>{
    fitToCover();
    drawAvatarEditor();
  });
}

function fileToDataURL(file){
  return new Promise((res, rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result);
    r.onerror = ()=>rej(new Error("FileReader falhou"));
    r.readAsDataURL(file);
  });
}

async function exportAvatarBlob(size=256){
  const src = document.getElementById("avatarEditorCanvas");
  if (!src || !AE.img) throw new Error("Editor não pronto");

  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d");

  ctx.clearRect(0,0,size,size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI*2);
  ctx.closePath();
  ctx.clip();

  const s = size / src.width;
  const iw = AE.img.naturalWidth || AE.img.width;
  const ih = AE.img.naturalHeight || AE.img.height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(AE.img, AE.ox*s, AE.oy*s, iw*AE.scale*s, ih*AE.scale*s);
  ctx.restore();

  const mime = (AE.ext === "jpg" || AE.ext === "jpeg") ? "image/jpeg" : "image/png";
  return new Promise((res)=> out.toBlob((b)=>res(b), mime, 0.92));
}

function resolveAvatarMimeAndExt(ext = "", contentTypeOverride = ""){
  const rawExt = String(ext || "").trim().toLowerCase();
  const rawType = String(contentTypeOverride || "").trim().toLowerCase();
  if (rawType === "image/gif" || rawExt === "gif") return { ext: "gif", mime: "image/gif" };
  if (rawType === "image/webp" || rawExt === "webp") return { ext: "webp", mime: "image/webp" };
  if (rawType === "image/jpeg" || rawExt === "jpg" || rawExt === "jpeg") return { ext: "jpg", mime: "image/jpeg" };
  return { ext: "png", mime: "image/png" };
}

async function uploadAvatarBlob(blob, user, ext, contentTypeOverride = ""){
  const { ext: safeExt, mime } = resolveAvatarMimeAndExt(ext, contentTypeOverride);
  const path = `${user.id}/avatar_${Date.now()}.${safeExt}`;

  const up = await supabase.storage.from("avatars").upload(path, blob, {
    upsert: true,
    contentType: mime,
  });
  setDebug({ upload: up });
  if (up.error) throw up.error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = data.publicUrl;

  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
  setDebug({ avatar_url_save: { error, url } });
  if (error) throw error;

  setAvatar(url);
}

async function uploadAvatarFileDirect(file, user){
  if (!file || !user?.id) throw new Error("Upload de avatar invalido.");
  const ext = (String(file.name || "").split(".").pop() || "gif").toLowerCase();
  await uploadAvatarBlob(file, user, ext, file.type || "");
}

load().catch(e=>{
  console.error(e);
  alert("Erro: " + (e?.message ?? e));
});


