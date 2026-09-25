import { RoomEvent } from "../node_modules/livekit-client/dist/livekit-client.esm.mjs";

// LiveKit retains attributes for late joiners. Use the controller's serialized
// metadata/attributes writer so camera settings cannot overwrite voice state.
// https://docs.livekit.io/transport/data/state/participant-attributes/
export const CAMERA_MIRROR_ATTRIBUTE = "altara.cameraMirror";

export function createCameraMirrorState({
  getLocalMirror = () => true,
  resolveParticipantId = (participant) => String(participant?.identity || ""),
  onChanged = () => {},
  onError = () => {},
} = {}) {
  let room = null;
  let writeAttributes = null;
  let generation = 0;
  const bindings = [];

  function getParticipantMirror(userId) {
    const id = String(userId || "");
    if (!id || !room) return false;
    if (resolveParticipantId(room.localParticipant) === id) return getLocalMirror() === true;
    const participant = [...(room.remoteParticipants?.values?.() || [])]
      .find((candidate) => resolveParticipantId(candidate) === id);
    // Clients without this attribute keep their original, unmirrored image.
    return participant?.attributes?.[CAMERA_MIRROR_ATTRIBUTE] === "1";
  }

  async function syncLocalPreference() {
    onChanged();
    if (room?.state !== "connected" || typeof writeAttributes !== "function") return false;
    const owner = room;
    const revision = ++generation;
    const isCurrent = () => room === owner && generation === revision && room?.state === "connected";
    try {
      return await writeAttributes({ [CAMERA_MIRROR_ATTRIBUTE]: getLocalMirror() === true ? "1" : "0" }, { isCurrent });
    } catch (error) {
      if (isCurrent()) onError(error);
      return false;
    }
  }

  function detach() {
    generation += 1;
    for (const [event, handler] of bindings.splice(0)) room?.off(event, handler);
    room = null;
    writeAttributes = null;
  }

  function bindRoom(nextRoom, updateLocalParticipantAttributes) {
    detach();
    room = nextRoom;
    writeAttributes = updateLocalParticipantAttributes;
    if (!room) return;
    const bind = (event, handler) => {
      if (!event) return;
      room.on(event, handler);
      bindings.push([event, handler]);
    };
    const sync = () => { void syncLocalPreference(); };
    bind(RoomEvent.Connected, sync);
    bind(RoomEvent.Reconnected, sync);
    bind(RoomEvent.Reconnecting, () => { generation += 1; });
    bind(RoomEvent.Disconnected, () => { generation += 1; });
    bind(RoomEvent.ParticipantPermissionsChanged, (_previous, participant) => {
      if (participant === room?.localParticipant) sync();
    });
    bind(RoomEvent.LocalTrackPublished, sync);
    bind(RoomEvent.ParticipantConnected, () => onChanged());
    bind(RoomEvent.ParticipantAttributesChanged, (changed) => {
      if (Object.hasOwn(changed || {}, CAMERA_MIRROR_ATTRIBUTE)) onChanged();
    });
    sync();
  }

  return { bindRoom, detach, getParticipantMirror, syncLocalPreference };
}
