export function deriveServerVoiceMediaControlPresentation({
  isServerVoiceCallUi = false,
  localCallConnected = false,
  localControllerReady = false,
  permissionsResolved = false,
  videoAllowed = false,
  streamAllowed = false,
  cameraTransportAvailable = false,
  screenShareTransportAvailable = false,
} = {}) {
  const sessionDisabledReason = !isServerVoiceCallUi
    ? "not_server_voice"
    : !localCallConnected
      ? "server_call_not_connected"
      : !localControllerReady
        ? "server_controller_not_ready"
        : "";
  const sessionInteractive = sessionDisabledReason === "";

  const capabilityDisabledReason = ({
    transportAvailable,
    permissionAllowed,
    permissionName,
    transportName,
  }) => {
    if (sessionDisabledReason) return sessionDisabledReason;
    if (!transportAvailable) return `${transportName}_transport_unavailable`;
    if (!permissionsResolved) return "server_voice_permissions_unresolved";
    if (!permissionAllowed) return `${permissionName}_permission_denied`;
    return "";
  };

  const cameraDisabledReason = capabilityDisabledReason({
    transportAvailable: cameraTransportAvailable,
    permissionAllowed: videoAllowed,
    permissionName: "video",
    transportName: "camera",
  });
  const screenShareDisabledReason = capabilityDisabledReason({
    transportAvailable: screenShareTransportAvailable,
    permissionAllowed: streamAllowed,
    permissionName: "stream",
    transportName: "screen_share",
  });

  return Object.freeze({
    sessionInteractive,
    cameraDisabled: cameraDisabledReason !== "",
    cameraDisabledReason,
    screenShareDisabled: screenShareDisabledReason !== "",
    screenShareDisabledReason,
  });
}
