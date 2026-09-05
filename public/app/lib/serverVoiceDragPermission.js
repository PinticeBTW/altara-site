export function resolveServerVoiceDragPermission({
  actorUserId = "",
  targetUserId = "",
  actorIsOwner = false,
  permissionResolved = false,
  hasMoveMembersPermission = false,
  targetEligible = false,
  targetIsActiveBot = false,
  targetHasVoiceMembership = false,
} = {}) {
  const actorId = String(actorUserId || "").trim();
  const targetId = String(targetUserId || "").trim();
  const isSelf = !!actorId && actorId === targetId;
  const moveAuthority = actorIsOwner === true || (
    permissionResolved === true && hasMoveMembersPermission === true
  );
  const eligible = !!(
    actorId
    && targetId
    && !targetIsActiveBot
    && targetHasVoiceMembership === true
    && (isSelf || targetEligible === true)
  );
  return Object.freeze({
    isSelf,
    moveAuthority,
    canDragVoiceMember: moveAuthority && eligible,
    canMoveSelf: moveAuthority && eligible && isSelf,
    canMoveMembers: moveAuthority && eligible && !isSelf,
  });
}
