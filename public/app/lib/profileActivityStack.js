const expandedStacks = new Set();
const boundRoots = new WeakSet();
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function bindProfileActivityStacks(root) {
  if (!root?.addEventListener || boundRoots.has(root)) return;
  boundRoots.add(root);
  root.addEventListener('toggle', event => {
    const stack = event.target;
    if (!stack?.matches?.('details[data-profile-activity-stack]') || !stack.isConnected) return;
    const key = stack.getAttribute('data-profile-activity-stack');
    if (stack.open) {
      expandedStacks.add(key);
      if (expandedStacks.size > 100) expandedStacks.delete(expandedStacks.values().next().value);
    } else expandedStacks.delete(key);
  }, true);
}

export function buildProfileActivityStackHtml(activities, { key, renderCard, translate = (_key, fallback) => fallback } = {}) {
  const cards = (activities || []).map(renderCard).filter(Boolean);
  if (!cards.length) return '';
  const attribute = `data-profile-activity-stack="${escape(key)}"`;
  if (cards.length === 1) return `<div class="profileActivityStack profileActivityStack--single" ${attribute}>${cards[0]}</div>`;
  const more = translate('profile.widgets.show_more', 'Show more');
  const less = translate('profile.widgets.show_less', 'Show less');
  const label = translate('usercard.tab.activity', 'Activity');
  return `<details class="profileActivityStack" ${attribute}${expandedStacks.has(key) ? ' open' : ''}>
    <summary class="profileActivityStack__summary">
      <div class="profileActivityStack__front">${cards[0]}</div>
      <span class="profileActivityStack__hint"><span>${escape(label)} <span class="profileActivityStack__count">${cards.length}</span></span><span class="profileActivityStack__more">${escape(more)} <span aria-hidden="true">⌄</span></span><span class="profileActivityStack__less">${escape(less)} <span aria-hidden="true">⌃</span></span></span>
    </summary>
    <div class="profileActivityStack__rest">${cards.slice(1).join('')}</div>
  </details>`;
}
