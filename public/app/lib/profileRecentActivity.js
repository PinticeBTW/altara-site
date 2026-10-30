import { buildCompactActivityArtworkHtml } from './activityArtwork.js';

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const GAME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.5 7h9a4 4 0 0 1 3.9 3.1l1.1 5a2.7 2.7 0 0 1-4.5 2.5L14.5 15h-5L7 17.6a2.7 2.7 0 0 1-4.5-2.5l1.1-5A4 4 0 0 1 7.5 7Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 10v4m-2-2h4m7-1h.01M18 13h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function gameId(value) {
  if (typeof value !== 'string') return '';
  const id = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(id) ? id : '';
}

function timestamp(value) {
  // Require the timezone supplied by the API; local-time parsing changes across devices.
  if (typeof value !== 'string') return NaN;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!parts) return NaN;
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (!daysInMonth || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return NaN;
  return Date.parse(value);
}

function formatters(locale) {
  const language = typeof locale === 'string' && locale.trim() ? locale : 'en';
  try {
    return {
      relative: new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' }),
      absolute: new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }),
    };
  } catch {
    return formatters('en');
  }
}

function relativeTime(playedAt, now, formatter) {
  const seconds = Math.floor((now - playedAt) / 1000);
  if (seconds < 60) return formatter.format(0, 'second');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return formatter.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatter.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 7) return formatter.format(-days, 'day');
  return formatter.format(-Math.floor(days / 7), 'week');
}

export function buildRecentGameActivityHtml(rows, {
  now = Date.now(), locale = 'en', translate = (_key, fallback) => fallback,
  currentActivities = [], loading = false, error = false,
} = {}) {
  const currentTime = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
  const label = (key, fallback) => {
    try {
      const translated = typeof translate === 'function' ? translate(`userCard.recentActivity.${key}`, fallback) : fallback;
      return escapeHtml(typeof translated === 'string' && translated.trim() ? translated : fallback);
    } catch {
      return escapeHtml(fallback);
    }
  };
  const header = '<header class="profileRecentActivity__header"><h3 class="profileRecentActivity__title">'
    + label('title', 'Recent activity') + '</h3><p class="profileRecentActivity__subtitle">'
    + label('subtitle', 'Games shared in the last 30 days.') + '</p></header>';
  const state = (kind, text) => '<p class="profileRecentActivity__state" data-recent-activity-state="' + kind + '" role="status">' + text + '</p>';
  let body;
  if (loading) body = state('loading', label('loading', 'Loading recent activity…'));
  else if (error) body = state('error', label('error', 'Recent activity could not be loaded.'));
  else {
    const currentIds = new Set((Array.isArray(currentActivities) ? currentActivities : [])
      .filter(activity => activity && activity.type === 'playing' && activity.kind !== 'app')
      .map(activity => gameId(activity.gameId || activity.game_id)).filter(Boolean));
    const latest = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row !== 'object') continue;
      const id = gameId(row.game_id);
      const name = typeof row.name === 'string' ? row.name.trim().slice(0, 96) : '';
      const playedAt = timestamp(row.last_played_at);
      if (!id || !name || !Number.isFinite(playedAt) || playedAt > currentTime || playedAt < currentTime - RECENT_WINDOW_MS || currentIds.has(id)) continue;
      if (!latest.has(id) || latest.get(id).playedAt < playedAt) latest.set(id, { id, name, playedAt, icon: typeof row.icon_url === 'string' ? row.icon_url : '' });
    }
    const games = [...latest.values()].sort((a, b) => b.playedAt - a.playedAt || a.id.localeCompare(b.id)).slice(0, 20);
    if (!games.length) body = state('empty', label('empty', 'No recent games shared.'));
    else {
      const { relative, absolute } = formatters(locale);
      body = '<ul class="profileRecentActivity__list">' + games.map(game => {
        const artwork = buildCompactActivityArtworkHtml({ gameId: game.id, name: game.name, icon: game.icon, kind: 'game', type: 'playing' }, 'profileRecentActivity__image');
        return '<li class="profileRecentActivity__card" data-recent-game-id="' + escapeHtml(game.id) + '">'
          + '<div class="profileRecentActivity__artwork"><span class="profileRecentActivity__fallback" aria-hidden="true">' + GAME_ICON + '</span>' + artwork + '</div>'
          + '<div class="profileRecentActivity__body"><div class="profileRecentActivity__name">' + escapeHtml(game.name) + '</div>'
          + '<time class="profileRecentActivity__time" datetime="' + new Date(game.playedAt).toISOString() + '" title="' + escapeHtml(absolute.format(game.playedAt)) + '">'
          + escapeHtml(relativeTime(game.playedAt, currentTime, relative)) + '</time></div></li>';
      }).join('') + '</ul>';
    }
  }
  return '<section class="profileRecentActivity" data-profile-recent-activity' + (loading ? ' aria-busy="true"' : '') + '>' + header + body + '</section>';
}
