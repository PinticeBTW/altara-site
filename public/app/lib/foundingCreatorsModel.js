const LIVE = new Set(['online', 'idle', 'focus', 'dnd']);
export function userLiveState(userId, presence = [], { ready = false, voice = [], now = Date.now() } = {}) {
  if (!ready) return { status: 'unknown', activity: '', call: null };
  const row = presence instanceof Map ? presence.get(userId) : presence.find(p => (p.id || p.user_id) === userId);
  if (!row || row.manual_status === 'invisible' || !LIVE.has(row.status) || row.has_live_session === false) {
    return { status: 'offline', activity: '', call: null };
  }
  const a = row.activity;
  let activity = '';
  if (a?.showOnProfile !== false && a?.show_on_profile !== false) {
    if (a?.type === 'playing') activity = `${a.activityVerb === 'using' ? 'Usando' : 'Jogando'} ${String(a.name || '').slice(0, 160)}`;
    if (a?.type === 'listening' && a.isPlaying !== false && now - Number(a.fetchedAt || a.updatedAt) < 120000) {
      activity = `Ouvindo ${String(a.title || a.name || '').slice(0, 160)}${a.artist ? ` · ${String(a.artist).slice(0, 120)}` : ''}`;
    }
  }
  const calls = voice instanceof Map ? (voice.get(userId) || []) : voice;
  const call = calls.filter(v => v.user_id === userId && now - Date.parse(v.heartbeat_at) < 45000 && Date.parse(v.heartbeat_at) <= now + 5000)
    .sort((a, b) => Date.parse(b.heartbeat_at) - Date.parse(a.heartbeat_at))[0] || null;
  return { status: row.status, activity, call };
}
export function retention(users, day) {
  const eligible = users.filter(u => u[`d${day}_eligible`]);
  const returned = eligible.filter(u => u[`d${day}_returned`]).length;
  return { eligible: eligible.length, returned, percent: eligible.length ? Math.round(returned / eligible.length * 100) : null };
}
export function summarizeCreators(snapshot, presence = [], ready = false, now = Date.now()) {
  const presenceById = new Map(presence.map(p => [p.id || p.user_id, p]));
  const voiceById = new Map();
  for (const row of snapshot.voice || []) voiceById.set(row.user_id, [...(voiceById.get(row.user_id) || []), row]);
  const users = (snapshot.users || []).map(u => ({ ...u, live: userLiveState(u.user_id, presenceById, { ready, voice: voiceById, now }) }));
  const usersByCreator = new Map();
  for (const user of users) {
    if (!usersByCreator.has(user.creator_id)) usersByCreator.set(user.creator_id, []);
    usersByCreator.get(user.creator_id).push(user);
  }
  const summarize = rows => ({ signups: rows.length, activated: rows.filter(u => u.activated_at).length,
    br: rows.filter(u => u.region === 'BR').length, unknownRegion: rows.filter(u => !u.region).length,
    online: ready ? rows.filter(u => LIVE.has(u.live.status)).length : null,
    active24h: rows.filter(u => u.active_24h).length, active7d: rows.filter(u => u.active_7d).length,
    d1: retention(rows, 1), d7: retention(rows, 7) });
  const creators = (snapshot.creators || []).map(c => {
    const attributed = usersByCreator.get(c.id) || [];
    const metrics = summarize(attributed);
    // Recommendations only. No Nova entitlement or reward is issued here.
    const milestone = metrics.signups >= 30 && metrics.active7d >= 12 ? 'Breakout · revisar'
      : metrics.signups >= 10 && metrics.active7d >= 5 ? 'Community Activated · revisar +3m' : 'Em ativação';
    return { ...c, users: attributed, metrics, milestone };
  });
  return { creators, users, total: { ...summarize(users), creators: creators.filter(c => c.funnel === 'active').length } };
}
