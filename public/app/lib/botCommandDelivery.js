const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const scope = context => context ? [context.serverId, context.channelId, context.conversationId, context.navigation ?? ""].join(":") : "";
const routeRpc = "bots_get_command_delivery_route_v1";
const missingRoute = error => ["PGRST202", "42883"].includes(error?.code)
  && String(error?.message || "").includes(routeRpc);

// Choose once using current server authority. A failed or uncertain HTTPS
// request must never become a second execution through the SDK queue.
export function createBotCommandDelivery({ rpc, invoke, queueSdk, getActor, getContext, createRequestId = () => crypto.randomUUID() }) {
  return async function deliver(input) {
    // The route lookup can yield while the composer changes. Send the snapshot
    // that was submitted, not mutable editor state from after that lookup.
    const { parsed, registered, context, commandMessageId = "", structured = null, sdkOptions = {} } = structuredClone(input);
    const actor = String(getActor() || ""), key = scope(getContext());
    const current = () => actor && actor === String(getActor() || "") && key === scope(getContext()) && key === scope(context);
    if (!current()) return { cancelled: true };
    let route;
    try {
      route = await rpc(routeRpc, { p_server_id: context.serverId, p_channel_id: context.channelId, p_command_id: registered.commandId });
    } catch (error) {
      if (!current()) return { cancelled: true };
      // Older installations only support the established SDK transport. This
      // compatibility case is distinct from a network or permission failure.
      if (!missingRoute(error)) throw error;
      route = { mode: "bot_token" };
    }
    if (!current()) return { cancelled: true };
    if (route?.mode === "bot_token") {
      try {
        const handled = await queueSdk(parsed, registered, context, sdkOptions);
        return current() ? { mode: "bot_token", handled } : { cancelled: true };
      } catch (error) { if (!current()) return { cancelled: true }; throw error; }
    }
    if (route?.mode !== "https") throw Error("invalid_command_delivery_route");
    const requestId = uuid(commandMessageId) ? commandMessageId : createRequestId();
    if (!uuid(requestId)) throw Error("invalid_command_request_id");
    let result;
    try { result = await invoke("altara-bot-interaction-dispatch", {
      action: "dispatch_command", request_id: requestId,
      server_id: context.serverId, channel_id: context.channelId, command_id: registered.commandId,
      command_name: parsed.name, args: String(parsed.args || ""),
      raw_text: String(structured?.cleanRawText || parsed.rawText || ""),
      options: Array.isArray(structured?.options) ? structured.options : [],
      ...(registered.commandType && registered.commandType !== "CHAT_INPUT" ? { command_type: registered.commandType, target_id: registered.targetId } : {}),
    }); } catch (error) { if (!current()) return { cancelled: true }; throw error; }
    if (!current()) return { cancelled: true };
    if (result?.ok !== true || !uuid(result.event_id)
      || (result.private_response !== undefined && typeof result.private_response !== "boolean")) throw Error("invalid_command_delivery_response");
    // Keep only the delivery envelope. Private content is retrieved through the
    // existing author-only result RPC, never from this public response path.
    return { mode: "https", handled: true, eventId: result.event_id, privateResponse: result.private_response === true,
      replayed: result.replayed === true, deferred: result.deferred === true,
      status: typeof result.status === "string" ? result.status : "", message: result.private_response === true ? null : result.message };
  };
}
