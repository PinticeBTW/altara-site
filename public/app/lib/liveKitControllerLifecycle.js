function normalizeId(value) {
  return String(value || "").trim();
}

export function classifyLiveKitControllerCleanup({
  requestedController = null,
  currentController = null,
  requestedConversationId = "",
  currentConversationId = "",
} = {}) {
  const requestedConversation = normalizeId(requestedConversationId || requestedController?.conversationId || "");
  const currentConversation = normalizeId(currentConversationId || currentController?.conversationId || "");
  const explicitRequest = !!requestedController;
  const sameController = !!requestedController && requestedController === currentController;
  const staleExplicitController = !!(
    explicitRequest
    && currentController
    && requestedController !== currentController
  );
  return Object.freeze({
    requestedConversationId: requestedConversation,
    currentConversationId: currentConversation,
    explicitRequest,
    sameController,
    staleExplicitController,
    ownsCurrentSession: !staleExplicitController && !!(
      sameController
      || (!explicitRequest && currentController)
      || (!currentController && requestedController)
    ),
  });
}
