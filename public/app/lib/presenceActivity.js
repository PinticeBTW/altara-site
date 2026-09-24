// Resolve only already-published activity; never enrich it with private local data.
export function activityPriority(activity) {
  if (!activity) return 0;
  if (activity.type === "listening" && activity.provider === "spotify") return 3;
  return activity.kind === "app" ? 1 : 2;
}

export function activityStartedAt(activity) {
  const value = Number(activity?.activityStartedAt || activity?.startedAt || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function selectPublishedActivities(payload, normalize) {
  if (!payload || payload.activity === null) return [];
  // An explicit list (including an empty one) supersedes legacy cached aliases.
  const candidates = Array.isArray(payload.activities) ? payload.activities.slice(0, 16) : [
    payload.activity,
    payload.spotify_activity !== undefined ? payload.spotify_activity : payload.spotifyActivity,
  ];
  const sorted = candidates.map(value => normalize(value)).filter(Boolean)
    .sort((a, b) => activityStartedAt(b) - activityStartedAt(a) || activityPriority(b) - activityPriority(a));
  const seen = new Set();
  return sorted.filter(activity => {
    const key = activity.type === "listening" && activity.provider === "spotify" ? "spotify" : "desktop";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 2);
}

export function selectPublishedActivity(payload, normalize) {
  return selectPublishedActivities(payload, normalize)[0] || null;
}

// Playback progress/seek updates must not reorder the same track and game.
export function withStableActivityStart(next, previous) {
  if (!next) return null;
  const identity = activity => activity?.trackId || [activity?.name, activity?.artist, activity?.album].join("|");
  const sameTrack = previous && identity(previous) === identity(next);
  return { ...next, activityStartedAt: activityStartedAt(sameTrack ? previous : next) };
}

export const spotifyActivityIcon = '<svg class="activityServiceIcon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><g fill="none" stroke="var(--altara-surface, #181818)" stroke-width="1.7" stroke-linecap="round"><path d="M6 9c4-1.4 8-1 12 1"/><path d="M7 12.5c3-1 6.5-.6 10 1"/><path d="M8 16c2.5-.7 5-.4 8 .8"/></g></svg>';
