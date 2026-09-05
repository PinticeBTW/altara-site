import { sanitizeCallVisibleName } from "./callVisibleIdentity.js";

export const SHARED_CALL_MINI_INSTANCE_KEY = "shared-call-bar";

export function deriveSharedCallMiniPresentation({
  session = null,
  callActive = false,
  callKind = "private",
  conversationId = "",
  peerLabel = "",
  contextLabel = "",
} = {}) {
  const sessionActive = session?.active === true
    && ["connected", "reconnecting", "joining"].includes(String(session?.connectionState || "").trim())
    && !!String(session?.id || "").trim();
  const effectiveConversationId = String(session?.id || conversationId || "").trim();
  const effectiveCallKind = String(session?.scope || callKind || "private").trim();
  const active = (sessionActive || callActive === true) && !!effectiveConversationId;
  if (!active) {
    return {
      visible: false,
      dockInSidebar: false,
      title: "",
      subtitle: "",
      instanceKey: SHARED_CALL_MINI_INSTANCE_KEY,
      ownsMediaConnection: false,
      controlStateSource: "active-call-runtime",
    };
  }

  const normalizedKind = ["server", "group", "private"].includes(effectiveCallKind)
    ? effectiveCallKind
    : "private";
  const peer = sanitizeCallVisibleName(peerLabel, "User");
  const context = sanitizeCallVisibleName(contextLabel, "");
  const subtitle = normalizedKind === "private"
    ? `${peer || "User"} · Mensagem direta`
    : (context || (normalizedKind === "group" ? "Chamada de grupo" : "Canal de voz"));

  return {
    visible: true,
    dockInSidebar: true,
    title: "Em chamada",
    subtitle,
    callKind: normalizedKind,
    conversationId: effectiveConversationId,
    instanceKey: SHARED_CALL_MINI_INSTANCE_KEY,
    ownsMediaConnection: false,
    controlStateSource: "active-call-runtime",
  };
}
