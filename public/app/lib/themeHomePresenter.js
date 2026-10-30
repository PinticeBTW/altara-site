const COPY = {
  en: {
    home: 'Home', chat: 'Chat', store: 'Store', morning: 'Good morning,', afternoon: 'Good afternoon,',
    evening: 'Good evening,', night: 'Good night,', welcome: 'Make yourself at home.',
    focus: 'Focus', dnd: 'Do Not Disturb', on: 'On', off: 'Off', servers: 'Your Servers',
    noServers: 'Your servers will appear here when you join one.', activity: 'Current activity',
    noActivity: 'No activity shared right now.', member: 'member', members: 'members', you: 'You',
  },
  pt: {
    home: 'Início', chat: 'Conversas', store: 'Loja', morning: 'Bom dia,', afternoon: 'Boa tarde,',
    evening: 'Boa noite,', night: 'Boa noite,', welcome: 'Sente-te em casa.',
    focus: 'Foco', dnd: 'Não incomodar', on: 'Ativo', off: 'Desligado', servers: 'Os teus servidores',
    noServers: 'Os teus servidores aparecem aqui quando entrares num.', activity: 'Atividade atual',
    noActivity: 'Sem atividade partilhada neste momento.', member: 'membro', members: 'membros', you: 'Tu',
  },
  'pt-BR': {
    home: 'Início', chat: 'Conversas', store: 'Loja', morning: 'Bom dia,', afternoon: 'Boa tarde,',
    evening: 'Boa noite,', night: 'Boa noite,', welcome: 'Sinta-se em casa.',
    focus: 'Foco', dnd: 'Não perturbar', on: 'Ativo', off: 'Desligado', servers: 'Seus servidores',
    noServers: 'Seus servidores aparecem aqui quando você entrar em um.', activity: 'Atividade atual',
    noActivity: 'Nenhuma atividade compartilhada agora.', member: 'membro', members: 'membros', you: 'Você',
  },
};

const text = (value, limit = 180) => String(value ?? '').trim().slice(0, limit);
const iconPaths = {
  focus: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'],
  dnd: ['M20.2 15.4A8.8 8.8 0 0 1 8.6 3.8 9 9 0 1 0 20.2 15.4Z'],
  arrow: ['M5 12h14', 'm13 6 6 6-6 6'],
  home: ['m3 11 9-8 9 8', 'M5 10v10h5v-6h4v6h5V10'],
  search: ['M10.7 3a7.7 7.7 0 1 0 0 15.4 7.7 7.7 0 0 0 0-15.4Z', 'm16.5 16.5 4.5 4.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  chevron: ['m7 10 5 5 5-5'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z', 'M10 21h4'],
  refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M5 8a8 8 0 0 1 13-3l2 2', 'M19 16a8 8 0 0 1-13 3l-2-2'],
  phone: ['M7 3H4a1 1 0 0 0-1 1c0 10 7 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2c-4-2-5-3-7-7l2-2-2-5Z'],
  video: ['M3 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3V6Z', 'm16 10 5-3v10l-5-3'],
  calendar: ['M4 5h16v15H4V5Z', 'M8 3v4m8-4v4M4 10h16'],
  check: ['m5 12 4 4L19 6'],
  play: ['m9 5 10 7-10 7V5Z'],
  pause: ['M9 5v14M15 5v14'],
  settings: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z'],
  external: ['M14 3h7v7', 'm21 3-11 11', 'M10 5H4v15h15v-6'],
  close: ['m6 6 12 12', 'm18 6-12 12'],
};

const GLASS_COPY = {
  en: { activityTab: 'Activity', recent: 'Recent Activity', today: 'Today', messages: 'Messages', directs: 'Direct Messages',
    activeNow: 'Active Now', notes: 'Quick Notes', seeAll: 'See all', noRecent: 'Your recent activity will appear here.',
    noToday: 'A little space for your day.', noMessages: 'Start a conversation. Your messages live here.', openConversation: 'Open conversation',
    noContacts: 'Your friends will appear here.', noActive: 'A quiet moment. Nobody is sharing activity.', noNotes: 'Clear mind, fresh page.',
    addTask: 'Add a note', join: 'Create Server', search: 'Search friends, servers…', searchEmpty: 'No matches in your friends or servers.',
    online: 'Online', offline: 'Offline', focus: 'Focus', focusReady: 'Ready when you are', remaining: 'left', edit: 'Edit',
    widgets: 'My widgets', themeOptions: 'Appearance', notifications: 'Notifications', settings: 'Settings',
    call: 'Voice call', video: 'Video call', newMessage: 'New message', resume: 'Start focus', pause: 'Pause focus', reset: 'Reset focus',
    footer: 'CONNECT. CREATE. FOCUS.', status: 'Your profile', account: 'Profile and settings', },
  pt: { activityTab: 'Atividade', recent: 'Atividade recente', today: 'Hoje', messages: 'Mensagens', directs: 'Mensagens diretas',
    activeNow: 'Ativos agora', notes: 'Notas rápidas', seeAll: 'Ver todas', noRecent: 'A tua atividade recente aparecerá aqui.',
    noToday: 'Um pouco de espaço para o teu dia.', noMessages: 'Começa uma conversa. As tuas mensagens ficam aqui.', openConversation: 'Abrir conversa',
    noContacts: 'Os teus amigos aparecerão aqui.', noActive: 'Um momento tranquilo. Ninguém está a partilhar atividade.', noNotes: 'Cabeça limpa, página nova.',
    addTask: 'Adicionar nota', join: 'Criar servidor', search: 'Pesquisar amigos, servidores…', searchEmpty: 'Sem resultados nos teus amigos ou servidores.',
    online: 'Online', offline: 'Offline', focus: 'Foco', focusReady: 'Quando quiseres', remaining: 'restantes', edit: 'Editar',
    widgets: 'Os meus widgets', themeOptions: 'Aparência', notifications: 'Notificações', settings: 'Definições',
    call: 'Chamada de voz', video: 'Videochamada', newMessage: 'Nova mensagem', resume: 'Iniciar foco', pause: 'Pausar foco', reset: 'Reiniciar foco',
    footer: 'LIGA-TE. CRIA. FOCA-TE.', status: 'O teu perfil', account: 'Perfil e definições', },
};

// This is native ALTARA presentation, not executable theme content. Packages
// request an allowlisted layout; account data and actions remain with the host.
export function createThemeHomePresenter(document, {
  getActor = () => '', getSnapshot = () => ({}), getLanguage = () => 'en',
  onNavigateServer, onStatus, onOpenMessages, onOpenStore, onOpenHome,
  onOpenConversation, onCallContact, onToggleQuickNote, onAddQuickNote, onFocusAction,
  onOpenActivity, onJoinServer, onOpenProfile, onSearch, onOpenNotifications, onOpenSettings,
  onOpenAppearance, onWidgetView, onOpenNotes, onFocusPreset, onSaveNotes,
  resolveImage = () => '', now = () => new Date(),
} = {}) {
  let root = null, owner = '', fingerprint = '', generation = 0;
  let toolbarOrigin = null, markedApp = null, railBrand = null;
  const sections = new Map();
  const actor = () => text(getActor(), 200);
  const el = (tag, className = '', content = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  };
  const slot = (node, name) => { node.dataset.themeSlot = name; return node; };
  function icon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6'); svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    for (const value of iconPaths[kind] || []) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', value); svg.append(path);
    }
    return svg;
  }

  function brandMark(className, themeSlot) {
    const mark = slot(document.createElementNS('http://www.w3.org/2000/svg', 'svg'), themeSlot);
    mark.setAttribute('class', className); mark.setAttribute('viewBox', '0 0 32 32'); mark.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor'); path.setAttribute('d', 'M16 2 31 29H20l-3-5h6L16 11 8 25h7l3 4H1L16 2Z'); mark.append(path);
    return mark;
  }

  function imageSource(source, kind, id = '') {
    if (!source) return '';
    // Only the native caller can approve a media source. Raw snapshot URLs
    // never become requests by default, including supposedly harmless HTTPS.
    let approved = '';
    try { approved = String(resolveImage(source, { kind, id }) ?? '').trim(); } catch { return ''; }
    if (!approved || /[\u0000-\u001f\u007f]/.test(approved)) return '';
    try {
      const url = new URL(approved, document.baseURI);
      if (url.username || url.password) return '';
      const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      const rasterData = url.protocol === 'data:' && /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(approved);
      // Resource bytes are never truncated: a partial PNG can decode into a
      // misleading half-avatar. Native approval remains necessary; oversize
      // sources use the honest initial fallback rather than a broken image.
      if (approved.length > (rasterData ? 700 * 1024 : 8192)) return '';
      if (url.protocol !== 'https:' && url.protocol !== 'blob:' && url.protocol !== 'file:' && !localHttp && !rasterData) return '';
      return approved;
    } catch { return ''; }
  }

  function image(source, className, fallback = '') {
    const holder = el('span', className);
    if (!source) { holder.textContent = fallback; holder.dataset.imageFallback = 'true'; return holder; }
    const img = el('img'); img.src = source; img.alt = ''; img.loading = 'lazy';
    img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      if (!img.isConnected) return;
      const presence = holder.querySelector('.glassHomePresenceDot');
      holder.replaceChildren(document.createTextNode(fallback)); if (presence) holder.append(presence); holder.dataset.imageFallback = 'true';
    }, { once: true });
    holder.append(img); return holder;
  }

  function readSnapshot() {
    const value = getSnapshot();
    return value && typeof value === 'object' ? value : {};
  }

  function owns(node, expectedOwner, ticket) {
    return expectedOwner && expectedOwner === owner && expectedOwner === actor()
      && ticket === generation && node.isConnected && root?.contains(node)
      && readSnapshot().themeLayout === root?.dataset.themeLayout && expectedOwner === actor();
  }

  function action(label, callback, className, ticket, expectedOwner) {
    const button = el('button', className, label); button.type = 'button';
    button.addEventListener('click', () => {
      if (typeof callback === 'function' && owns(button, expectedOwner, ticket)) {
        callback();
        const grid = document.getElementById('widgetsGrid');
        if (grid?.isConnected) syncHostLayout(grid);
      }
    });
    return button;
  }

  function normalize(snapshot, language) {
    const locale = language === 'pt-br' || language === 'pt_br' ? 'pt-BR' : /^pt(?:-|$)/.test(language) ? 'pt-PT' : 'en';
    const copy = locale === 'pt-BR' ? COPY['pt-BR'] : locale === 'pt-PT' ? COPY.pt : COPY.en;
    const current = now(); const date = current instanceof Date && Number.isFinite(current.getTime()) ? current : new Date();
    const hour = date.getHours();
    const period = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : hour >= 18 && hour < 22 ? 'evening' : 'night';
    const user = snapshot.user && typeof snapshot.user === 'object' ? snapshot.user : {};
    const serverRows = Array.isArray(snapshot.servers) ? snapshot.servers : [];
    const seen = new Set();
    const servers = [];
    for (const row of serverRows) {
      const id = text(row?.id, 200);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const count = row?.memberCount;
      servers.push({ id, name: text(row?.name) || 'ALTARA',
        icon: imageSource(row?.iconUrl, 'server-icon', id), banner: imageSource(row?.bannerUrl, 'server-banner', id),
        members: typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null });
      if (servers.length === (snapshot.themeLayout === 'glass-home' ? 200 : 6)) break;
    }
    const activity = snapshot.activity && typeof snapshot.activity === 'object' ? snapshot.activity : {};
    return {
      copy, locale, greeting: copy[period], date: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(date),
      user: { name: text(user.name) || copy.you, avatar: imageSource(user.avatarUrl, 'user-avatar'), statusLabel: text(user.statusLabel, 60), status: ['online', 'idle', 'focus', 'dnd', 'invisible', 'offline'].includes(user.status) ? user.status : 'offline' },
      servers, activity: { name: text(activity.name), details: text(activity.details, 320), image: imageSource(activity.artworkUrl, 'activity') },
    };
  }

  function normalizeGlass(snapshot, model) {
    const labels = model.locale.startsWith('pt') ? GLASS_COPY.pt : GLASS_COPY.en;
    const rows = (value, limit, transform) => {
      const output = [], ids = new Set();
      for (const row of Array.isArray(value) ? value : []) {
        if (!row || typeof row !== 'object') continue;
        const id = text(row.id, 200); if (!id || ids.has(id)) continue;
        ids.add(id); output.push(transform(row, id)); if (output.length >= limit) break;
      }
      return output;
    };
    const presence = value => ['online', 'idle', 'dnd', 'focus', 'offline'].includes(value) ? value : 'offline';
    const presenceLabel = row => text(row.statusLabel, 60) || ({ focus: model.copy.focus, dnd: model.copy.dnd, idle: model.locale.startsWith('pt') ? 'Ausente' : 'Away', online: labels.online }[presence(row.status)] || labels.offline);
    const when = value => {
      const input = text(value, 80); if (!input) return '';
      const parsed = typeof value === 'number' ? value : /^\d{4}-\d{2}-\d{2}T/.test(input) ? Date.parse(input) : NaN;
      if (!Number.isFinite(parsed)) return input.slice(0, 36);
      const elapsed = Math.max(0, Math.floor((now().getTime() - parsed) / 60000));
      if (elapsed < 1) return model.locale.startsWith('pt') ? 'agora' : 'now';
      if (elapsed < 60) return `${elapsed}m`;
      if (elapsed < 1440) return `${Math.floor(elapsed / 60)}h`;
      return `${Math.floor(elapsed / 1440)}d`;
    };
    const conversations = rows(snapshot.conversations, 5, (row, id) => ({
      id, name: text(row.name) || 'ALTARA', avatar: imageSource(row.avatarUrl, 'contact-avatar', id),
      preview: text(row.preview, 240), when: when(row.when), status: presence(row.status), statusLabel: presenceLabel(row),
      unread: Number.isSafeInteger(row.unread) && row.unread > 0 ? Math.min(row.unread, 999) : 0,
    }));
    const contacts = rows(snapshot.contacts, 12, (row, id) => ({
      id, name: text(row.name) || 'ALTARA', avatar: imageSource(row.avatarUrl, 'contact-avatar', id),
      status: presence(row.status), statusLabel: presenceLabel(row), activity: text(row.activity, 160), when: when(row.when),
      activityIcon: imageSource(row.activityIconUrl, 'activity-icon', id), canCall: row.canCall === true, canVideo: row.canVideo === true,
    }));
    const focus = snapshot.focus && typeof snapshot.focus === 'object' ? snapshot.focus : {};
    return { ...model, labels, contacts, conversations,
      quickNotes: rows(snapshot.quickNotes, 80, (row, id) => ({ id, text: text(row.text, 240), completed: row.completed === true })),
      recentActivity: rows(snapshot.recentActivity, 5, (row, id) => ({ id, name: text(row.name), details: text(row.details, 180), when: text(row.when, 36), icon: imageSource(row.iconUrl, 'activity-icon', id) })),
      today: rows(snapshot.today, 2, (row, id) => ({ id, title: text(row.title), details: text(row.details, 120), kind: text(row.kind, 32) })),
      focus: { label: text(focus.label) || labels.focusReady, remaining: text(focus.remaining, 80),
        progress: typeof focus.progress === 'number' && Number.isFinite(focus.progress) ? Math.max(0, Math.min(1, focus.progress)) : 0,
        running: focus.running === true, phase: text(focus.phase, 20), preset: text(focus.preset, 60),
        presets: rows(focus.presets, 3, (row, id) => ({ id, label: text(row.label, 40) })), },
      notesText: text(snapshot.notesText, 4000),
    };
  }

  function labelledIcon(label, kind, callback, className, ticket, expectedOwner) {
    if (typeof callback !== 'function') return null;
    const button = action('', callback, className, ticket, expectedOwner);
    button.setAttribute('aria-label', label); button.title = label; button.append(icon(kind)); return button;
  }

  function cardHeader(section, title, model, ticket, expectedOwner, callback, actionLabel = '') {
    const header = el('div', 'glassHomeCardHeader'); header.append(el('h2', '', title));
    if (typeof callback === 'function') {
      const control = action(actionLabel || model.labels.seeAll, callback, 'glassHomeQuietAction', ticket, expectedOwner);
      header.append(control);
    }
    section.append(header); return header;
  }

  function nativeEmpty(section, title, message, kind = 'focus') {
    const empty = el('div', 'glassHomeEmpty'); empty.append(icon(kind), el('p', '', message));
    section.dataset.state = 'empty'; section.append(empty); return section;
  }

  function avatar(row, className = '') {
    const holder = image(row.avatar, `glassHomeAvatar ${className}`, row.name.slice(0, 1));
    holder.dataset.presence = row.status;
    const dot = el('span', 'glassHomePresenceDot'); dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', row.statusLabel || row.status || 'offline'); dot.title = row.statusLabel || row.status || 'offline'; holder.append(dot); return holder;
  }

  function glassNavigation(model, ticket, expectedOwner) {
    const nav = slot(el('nav', 'glassHomeNavigation'), 'home-navigation'); nav.setAttribute('aria-label', 'ALTARA');
    const brand = el('div', 'glassHomeBrand');
    const mark = brandMark('glassHomeBrandMark', 'home-brand-mark');
    brand.append(mark, el('span', '', 'ALTARA')); nav.append(brand);
    const links = el('div', 'glassHomeNavigationLinks');
    const home = typeof onOpenHome === 'function'
      ? action(model.copy.home, onOpenHome, 'glassHomeNavButton is-current', ticket, expectedOwner)
      : el('span', 'glassHomeNavButton is-current', model.copy.home);
    home.setAttribute('aria-current', 'page'); links.append(home);
    for (const [label, callback] of [[model.copy.chat, onOpenMessages], [model.labels.activityTab, onOpenActivity], [model.copy.store, onOpenStore]]) {
      if (typeof callback === 'function') links.append(action(label, callback, 'glassHomeNavButton', ticket, expectedOwner));
    }
    nav.append(links);
    if (typeof onSearch === 'function') {
      const search = slot(el('div', 'glassHomeSearch'), 'home-search'); search.append(icon('search'));
      const input = el('input'); input.type = 'search'; input.placeholder = model.labels.search; input.setAttribute('aria-label', model.labels.search);
      const results = el('div', 'glassHomeSearchResults'); results.hidden = true;
      let searchTicket = 0;
      input.addEventListener('input', async () => {
        const query = text(input.value, 120), request = ++searchTicket; results.replaceChildren(); results.hidden = !query;
        if (!query || !owns(input, expectedOwner, ticket)) return;
        let found;
        try { found = await onSearch(query); } catch { found = {}; }
        if (request !== searchTicket || !owns(input, expectedOwner, ticket)) return;
        const values = [...(Array.isArray(found?.servers) ? found.servers : []).map(row => ({ ...row, kind: 'server' })),
          ...(Array.isArray(found?.contacts) ? found.contacts : []).map(row => ({ ...row, kind: 'contact' }))].slice(0, 8);
        for (const row of values) {
          const id = text(row?.id, 200); if (!id) continue;
          const callback = row.kind === 'server' ? onNavigateServer : onOpenConversation;
          if (typeof callback !== 'function') continue;
          const result = action(text(row.name) || 'ALTARA', () => { results.hidden = true; callback(id); }, 'glassHomeSearchResult', ticket, expectedOwner);
          results.append(result);
        }
        if (!results.childElementCount) results.append(el('p', '', model.labels.searchEmpty));
        results.hidden = false;
      });
      input.addEventListener('keydown', event => { if (event.key === 'Escape') { searchTicket++; results.hidden = true; input.blur(); } });
      search.append(input, results); nav.append(search);
    }
    const actions = el('div', 'glassHomeHeaderActions');
    for (const [label, kind, callback] of [[model.labels.themeOptions, 'sun', onOpenAppearance], [model.labels.notifications, 'bell', onOpenNotifications], [model.labels.widgets, 'settings', onWidgetView]]) {
      const button = labelledIcon(label, kind, callback, 'glassHomeIconButton', ticket, expectedOwner); if (button) actions.append(button);
    }
    if (typeof onOpenProfile === 'function') {
      const profile = action('', onOpenProfile, 'glassHomeProfileButton', ticket, expectedOwner);
      profile.setAttribute('aria-label', model.labels.account); profile.append(avatar({ name: model.user.name, avatar: model.user.avatar, status: model.user.status, statusLabel: model.user.statusLabel }));
      const statusLabel = model.user.statusLabel || ({ focus: model.copy.focus, dnd: model.copy.dnd, idle: model.locale.startsWith('pt') ? 'Ausente' : 'Away', offline: model.labels.offline, invisible: model.labels.offline }[model.user.status] || model.labels.online);
      const copy = el('span', 'glassHomeProfileCopy'); copy.append(el('strong', '', model.user.name), el('span', '', statusLabel));
      profile.append(copy, icon('chevron')); actions.append(profile);
    }
    nav.append(actions, slot(el('div', 'glassHomeNativeActions'), 'home-native-actions')); return nav;
  }

  function glassHero(model, ticket, expectedOwner) {
    const header = hero(model, ticket, expectedOwner); header.classList.add('glassHomeHero');
    const name = header.querySelector('.themeHomeName'); name.replaceChildren(el('span', 'glassHomeNameText', model.user.name), el('span', 'glassHomeSparkle', '✦'));
    return header;
  }

  function glassActivity(model, ticket, expectedOwner) {
    const section = slot(el('section', 'glassHomeActivity glassHomeCard'), 'home-activity');
    const cover = image(model.activity.image, 'glassHomeActivityArtwork', model.activity.name ? model.activity.name.slice(0, 1) : '♫');
    section.append(cover); const copy = el('div', 'glassHomeActivityCopy');
    copy.append(el('p', 'glassHomeOverline', model.copy.activity), el('h2', '', model.activity.name || model.copy.noActivity));
    if (model.activity.details) copy.append(el('p', '', model.activity.details)); section.append(copy);
    if (typeof onOpenActivity === 'function') {
      const detail = action(model.labels.activityTab, onOpenActivity, 'glassHomeActivityLink', ticket, expectedOwner); detail.append(icon('arrow')); section.append(detail);
    }
    if (!model.activity.name) section.dataset.state = 'empty'; return section;
  }

  function glassServers(model, ticket, expectedOwner) {
    const section = slot(el('section', 'glassHomeServers glassHomeCard'), 'home-servers');
    const header = cardHeader(section, model.copy.servers, model, ticket, expectedOwner);
    const directory = serverDirectory(model, ticket, expectedOwner);
    const directoryButton = action('', () => directory.open(directoryButton), 'glassHomeQuietIcon', ticket, expectedOwner);
    directoryButton.dataset.glassServerDirectoryOpen = 'true'; directoryButton.setAttribute('aria-label', `${model.labels.seeAll}: ${model.copy.servers}`);
    directoryButton.setAttribute('aria-haspopup', 'dialog'); directoryButton.setAttribute('aria-expanded', 'false'); directoryButton.setAttribute('aria-controls', directory.node.id);
    directoryButton.append(icon('arrow')); header.append(directoryButton); section.append(directory.node);
    const list = el('div', 'glassHomeServerList');
    for (const row of model.servers.slice(0, 3)) {
      const card = slot(el(typeof onNavigateServer === 'function' ? 'button' : 'article', 'glassHomeServerCard'), 'home-server-card');
      card.dataset.themeHomeServerId = row.id;
      if (typeof onNavigateServer === 'function') {
        card.type = 'button'; card.addEventListener('click', () => {
          if (!owns(card, expectedOwner, ticket)) return;
          const latest = readSnapshot(); const fresh = Array.isArray(latest.servers) ? latest.servers.find(value => text(value?.id, 200) === row.id) : null;
          if (fresh && expectedOwner === actor()) onNavigateServer(row.id, fresh);
        });
      }
      if (row.banner) { card.append(image(row.banner, 'glassHomeServerBanner')); card.dataset.hasBanner = 'true'; }
      card.append(image(row.icon, 'glassHomeServerIcon', row.name.slice(0, 1)));
      const copy = el('span', 'glassHomeServerCopy'); copy.append(el('strong', '', row.name));
      if (row.members !== null) copy.append(el('span', '', `${new Intl.NumberFormat(model.locale).format(row.members)} ${row.members === 1 ? model.copy.member : model.copy.members}`));
      card.append(copy); list.append(card);
    }
    if (typeof onJoinServer === 'function') {
      const join = action('', onJoinServer, 'glassHomeJoinCard', ticket, expectedOwner); join.append(icon('plus'), el('span', '', model.labels.join)); list.append(join);
    }
    if (!model.servers.length && !list.childElementCount) return nativeEmpty(section, '', model.copy.noServers, 'home');
    section.append(list); return section;
  }

  function serverDirectory(model, ticket, expectedOwner) {
    const menu = slot(el('div', 'glassHomeServerDirectory'), 'home-server-directory');
    menu.id = `themeHomeServerDirectory-${ticket}`; menu.hidden = true; menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', model.copy.servers); menu.setAttribute('popover', 'auto');
    const header = el('div', 'glassHomeDirectoryHeader'); header.append(el('h2', '', model.copy.servers), el('small', '', String(model.servers.length)));
    let opener = null;
    const close = () => {
      if (typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) menu.hidePopover();
      menu.hidden = true; opener?.setAttribute('aria-expanded', 'false');
      if (opener?.isConnected && owns(opener, expectedOwner, ticket)) opener.focus({ preventScroll: true });
    };
    const closeButton = labelledIcon(model.locale.startsWith('pt') ? 'Fechar' : 'Close', 'close', close, 'glassHomeQuietIcon', ticket, expectedOwner);
    closeButton.dataset.glassServerDirectoryClose = 'true'; header.append(closeButton); menu.append(header);
    const list = el('div', 'glassHomeDirectoryList');
    for (const row of model.servers) {
      const canOpen = typeof onNavigateServer === 'function';
      const item = el(canOpen ? 'button' : 'article', 'glassHomeDirectoryRow'); item.dataset.themeHomeServerId = row.id;
      if (canOpen) {
        item.type = 'button'; item.addEventListener('click', () => {
          if (!owns(item, expectedOwner, ticket)) return;
          const latest = readSnapshot(); const fresh = Array.isArray(latest.servers) ? latest.servers.find(value => text(value?.id, 200) === row.id) : null;
          if (!fresh || expectedOwner !== actor()) return;
          close(); if (owns(item, expectedOwner, ticket)) onNavigateServer(row.id, fresh);
        });
      }
      item.append(image(row.icon, 'glassHomeDirectoryIcon', row.name.slice(0, 1)));
      const copy = el('span', 'glassHomeDirectoryCopy'); copy.append(el('strong', '', row.name));
      if (row.members !== null) copy.append(el('small', '', `${new Intl.NumberFormat(model.locale).format(row.members)} ${row.members === 1 ? model.copy.member : model.copy.members}`));
      item.append(copy, icon('arrow')); list.append(item);
    }
    menu.append(list);
    if (!model.servers.length) nativeEmpty(menu, '', model.copy.noServers, 'home');
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
    menu.addEventListener('toggle', event => {
      if (event.newState === 'closed') { menu.hidden = true; opener?.setAttribute('aria-expanded', 'false'); }
    });
    return { node: menu, open(button) {
      if (!owns(button, expectedOwner, ticket)) return;
      opener = button; menu.hidden = false;
      const viewportWidth = document.defaultView?.innerWidth || 800, viewportHeight = document.defaultView?.innerHeight || 600;
      const rect = button.getBoundingClientRect(), width = Math.min(430, Math.max(240, viewportWidth - 32));
      menu.style.setProperty('width', `${width}px`, 'important');
      menu.style.setProperty('left', `${Math.max(16, Math.min(viewportWidth - width - 16, rect.right - width))}px`, 'important');
      menu.style.setProperty('top', `${Math.max(16, Math.min(viewportHeight - 180, rect.bottom + 12))}px`, 'important');
      menu.style.setProperty('max-height', `${Math.max(150, viewportHeight - Math.max(16, Math.min(viewportHeight - 180, rect.bottom + 12)) - 16)}px`, 'important');
      if (typeof menu.showPopover === 'function') menu.showPopover();
      button.setAttribute('aria-expanded', 'true'); closeButton.focus({ preventScroll: true });
    } };
  }

  function glassRecent(model, ticket, expectedOwner) {
    const section = slot(el('section', 'glassHomeRecent glassHomeCard'), 'home-recent-activity');
    cardHeader(section, model.labels.recent, model, ticket, expectedOwner, onOpenActivity);
    if (!model.recentActivity.length) return nativeEmpty(section, '', model.labels.noRecent, 'sun');
    const list = el('div', 'glassHomeRecentList');
    for (const row of model.recentActivity) {
      const item = el('div', 'glassHomeRecentRow'); item.append(image(row.icon, 'glassHomeApplicationIcon', row.name.slice(0, 1)), el('span', '', row.name), el('small', '', row.when || row.details)); list.append(item);
    }
    section.append(list); return section;
  }

  function glassToday(model, ticket, expectedOwner) {
    const section = slot(el('section', 'glassHomeToday glassHomeCard'), 'home-today'); cardHeader(section, model.labels.today, model, ticket, expectedOwner);
    if (!model.today.length) return nativeEmpty(section, '', model.labels.noToday, 'calendar');
    const list = el('div', 'glassHomeTodayList');
    for (const row of model.today) {
      const item = el('div', 'glassHomeTodayRow'); item.append(icon(row.kind === 'focus' ? 'focus' : 'calendar'));
      const copy = el('span'); copy.append(el('strong', '', row.title), el('small', '', row.details)); item.append(copy); list.append(item);
    }
    section.append(list); return section;
  }

  function glassMessages(model, ticket, expectedOwner) {
    const section = slot(el('section', 'glassHomeMessages glassHomeCard'), 'home-messages');
    const header = cardHeader(section, model.labels.messages, model, ticket, expectedOwner);
    const button = labelledIcon(model.labels.newMessage, 'plus', onOpenMessages, 'glassHomeQuietIcon', ticket, expectedOwner); if (button) header.append(button);
    const open = labelledIcon(model.labels.seeAll, 'external', onOpenMessages, 'glassHomeQuietIcon', ticket, expectedOwner); if (open) header.append(open);
    if (!model.conversations.length) return nativeEmpty(section, '', model.labels.noMessages, 'phone');
    const list = el('div', 'glassHomeMessagesList');
    for (const row of model.conversations) {
      const item = typeof onOpenConversation === 'function' ? action('', () => onOpenConversation(row.id), 'glassHomeMessageRow', ticket, expectedOwner) : el('div', 'glassHomeMessageRow');
      item.dataset.conversationId = row.id; item.append(avatar(row));
      const copy = el('span', 'glassHomeMessageCopy'); copy.append(el('strong', '', row.name), el('span', '', row.preview || model.labels.openConversation));
      const meta = el('span', 'glassHomeMessageMeta'); if (row.when) meta.append(el('small', '', row.when));
      if (row.unread) meta.append(el('span', 'glassHomeUnread', String(row.unread))); item.append(copy, meta); list.append(item);
    }
    section.append(list); return section;
  }

  function glassContacts(model, ticket, expectedOwner, activeOnly = false) {
    const section = slot(el('section', `glassHomeCard ${activeOnly ? 'glassHomeActive' : 'glassHomeDirects'}`), activeOnly ? 'home-active-now' : 'home-direct-messages');
    cardHeader(section, activeOnly ? model.labels.activeNow : model.labels.directs, model, ticket, expectedOwner, onOpenMessages);
    const rows = (activeOnly ? model.contacts.filter(row => row.activity) : model.contacts).slice(0, 4);
    if (!rows.length) return nativeEmpty(section, '', activeOnly ? model.labels.noActive : model.labels.noContacts, activeOnly ? 'sun' : 'phone');
    const list = el('div', 'glassHomeContactsList');
    for (const row of rows) {
      const item = el('div', 'glassHomeContactRow');
      const main = typeof onOpenConversation === 'function' ? action('', () => onOpenConversation(row.id), 'glassHomeContactMain', ticket, expectedOwner) : el('div', 'glassHomeContactMain');
      main.append(avatar(row)); const copy = el('span', 'glassHomeContactCopy'); copy.append(el('strong', '', row.name));
      if (activeOnly) copy.append(el('span', '', row.activity)); main.append(copy); item.append(main);
      if (activeOnly) {
        if (row.when) item.append(el('small', 'glassHomeContactWhen', row.when));
        if (row.activityIcon) item.append(image(row.activityIcon, 'glassHomeActivityIcon'));
      } else if (row.canCall && typeof onCallContact === 'function') {
        for (const [kind, label, video] of [['phone', model.labels.call, false], ...(row.canVideo ? [['video', model.labels.video, true]] : [])]) {
          const call = labelledIcon(`${label}: ${row.name}`, kind, () => onCallContact(row.id, video), 'glassHomeCallButton', ticket, expectedOwner); item.append(call);
        }
      }
      list.append(item);
    }
    section.append(list); return section;
  }

  function glassNotes(model, ticket, expectedOwner) {
    const section = slot(el('section', 'glassHomeNotes glassHomeCard'), 'home-quick-notes');
    const header = cardHeader(section, model.labels.notes, model, ticket, expectedOwner);
    const finished = model.quickNotes.filter(row => row.completed).length;
    if (model.quickNotes.length) header.append(el('small', 'glassHomeNotesCount', `${finished}/${model.quickNotes.length}`));
    const add = labelledIcon(model.labels.addTask, 'plus', onAddQuickNote, 'glassHomeQuietIcon', ticket, expectedOwner); if (add) header.append(add);
    if (!model.quickNotes.length) return nativeEmpty(section, '', model.labels.noNotes, 'check');
    const list = el('div', 'glassHomeNotesList');
    for (const row of model.quickNotes) {
      list.append(quickNoteRow(row, ticket, expectedOwner));
    }
    section.append(list); return section;
  }

  function quickNoteRow(row, ticket, expectedOwner) {
    const item = el('label', 'glassHomeNoteRow'); item.dataset.quickNoteId = row.id;
    const control = el('input'); control.type = 'checkbox'; control.checked = row.completed;
    control.disabled = typeof onToggleQuickNote !== 'function'; control.setAttribute('aria-label', row.text);
    control.addEventListener('change', () => {
      if (typeof onToggleQuickNote === 'function' && owns(control, expectedOwner, ticket)) onToggleQuickNote(row.id, control.checked);
      else control.checked = row.completed;
    });
    item.append(control, el('span', '', row.text)); return item;
  }

  function updateGlassNotes(section, model, ticket, expectedOwner) {
    let list = section.querySelector('.glassHomeNotesList');
    const empty = section.querySelector('.glassHomeEmpty');
    if (!model.quickNotes.length) {
      list?.remove(); section.querySelector('.glassHomeNotesCount')?.remove();
      if (!empty) nativeEmpty(section, '', model.labels.noNotes, 'check'); return;
    }
    empty?.remove(); delete section.dataset.state;
    if (!list) { list = el('div', 'glassHomeNotesList'); section.append(list); }
    const nodes = new Map([...list.children].map(node => [node.dataset.quickNoteId, node]));
    for (const [index, row] of model.quickNotes.entries()) {
      let item = nodes.get(row.id);
      if (!item) item = quickNoteRow(row, ticket, expectedOwner);
      nodes.delete(row.id);
      const input = item.querySelector('input'); input.checked = row.completed; input.setAttribute('aria-label', row.text);
      const label = item.querySelector('span'); if (label.textContent !== row.text) label.textContent = row.text;
      if (list.children[index] !== item) list.insertBefore(item, list.children[index] || null);
    }
    for (const item of nodes.values()) item.remove();
    const header = section.querySelector('.glassHomeCardHeader'); let count = header.querySelector('.glassHomeNotesCount');
    if (!count) { count = el('small', 'glassHomeNotesCount'); header.insertBefore(count, header.querySelector('.glassHomeQuietIcon')); }
    const value = `${model.quickNotes.filter(row => row.completed).length}/${model.quickNotes.length}`;
    if (count.textContent !== value) count.textContent = value;
  }

  function glassFocus(model, ticket, expectedOwner) {
    const section = slot(el('section', 'glassHomeFocus glassHomeCard'), 'home-focus');
    section.dataset.themeGlassFocus = 'true';
    const header = cardHeader(section, model.labels.focus, model, ticket, expectedOwner, typeof onFocusAction === 'function' ? () => onFocusAction('timer-open-settings') : undefined, model.labels.edit);
    const dial = typeof onFocusAction === 'function'
      ? action('', () => onFocusAction(readSnapshot().focus?.running ? 'timer-pause' : 'timer-start'), 'glassHomeFocusDial glassHomeFocusToggle', ticket, expectedOwner)
      : el('div', 'glassHomeFocusDial');
    if (typeof onFocusAction === 'function') {
      dial.dataset.glassFocusToggle = 'true'; dial.dataset.running = String(model.focus.running);
      dial.setAttribute('aria-label', model.focus.running ? model.labels.pause : model.labels.resume);
      dial.setAttribute('aria-pressed', String(model.focus.running));
      header.append(labelledIcon(model.labels.reset, 'refresh', () => onFocusAction('timer-reset'), 'glassHomeQuietIcon', ticket, expectedOwner));
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 200 200'); svg.setAttribute('aria-hidden', 'true');
    for (const className of ['glassHomeFocusTrack', 'glassHomeFocusProgress']) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); circle.setAttribute('cx', '100'); circle.setAttribute('cy', '100'); circle.setAttribute('r', '83'); circle.setAttribute('class', className);
      if (className === 'glassHomeFocusProgress') { circle.setAttribute('stroke-dasharray', `${Math.max(0, model.focus.progress) * 521.5} 521.5`); }
      svg.append(circle);
    }
    const copy = el('div', 'glassHomeFocusCopy'); copy.append(el('strong', '', model.focus.label));
    if (model.focus.remaining) copy.append(el('span', '', model.focus.remaining));
    dial.append(svg, copy); section.append(dial);
    if (typeof onFocusPreset === 'function' && model.focus.presets.length) {
      const presets = el('div', 'glassHomeFocusPresets');
      for (const preset of model.focus.presets) {
        const button = action(preset.label, () => onFocusPreset(preset.id), 'glassHomeFocusPreset', ticket, expectedOwner);
        button.dataset.focusPreset = preset.id; button.classList.toggle('is-current', model.focus.preset === preset.id);
        button.setAttribute('aria-pressed', String(model.focus.preset === preset.id)); presets.append(button);
      }
      section.append(presets);
    }
    return section;
  }

  function updateGlassFocus(section, model) {
    const circle = section.querySelector('.glassHomeFocusProgress');
    circle?.setAttribute('stroke-dasharray', `${model.focus.progress * 521.5} 521.5`);
    const copy = section.querySelector('.glassHomeFocusCopy');
    if (copy) {
      const strong = copy.querySelector('strong'); if (strong && strong.textContent !== model.focus.label) strong.textContent = model.focus.label;
      let remaining = copy.querySelector('span');
      if (model.focus.remaining && !remaining) { remaining = el('span'); copy.append(remaining); }
      if (remaining && remaining.textContent !== model.focus.remaining) remaining.textContent = model.focus.remaining;
    }
    const toggle = section.querySelector('[data-glass-focus-toggle]');
    if (toggle && toggle.dataset.running !== String(model.focus.running)) {
      toggle.dataset.running = String(model.focus.running);
      toggle.setAttribute('aria-label', model.focus.running ? model.labels.pause : model.labels.resume);
      toggle.setAttribute('aria-pressed', String(model.focus.running));
    }
    for (const preset of section.querySelectorAll('[data-focus-preset]')) {
      const active = preset.dataset.focusPreset === model.focus.preset;
      preset.classList.toggle('is-current', active); preset.setAttribute('aria-pressed', String(active));
    }
  }

  function updateGlassHero(section, model) {
    section.dataset.homeNameDensity = model.user.name.length > 36 ? 'long' : 'normal';
    for (const [selector, value] of [['.themeHomeDate', model.date], ['.themeHomeGreeting', model.greeting], ['.themeHomeWelcome', model.copy.welcome]]) {
      const node = section.querySelector(selector); if (node && node.textContent !== value) node.textContent = value;
    }
    const name = section.querySelector('.themeHomeName');
    if (name) name.title = model.user.name;
    if (name && name.dataset.name !== model.user.name) {
      name.dataset.name = model.user.name; name.replaceChildren(el('span', 'glassHomeNameText', model.user.name), el('span', 'glassHomeSparkle', '✦'));
    }
    for (const button of section.querySelectorAll('[data-theme-home-status]')) {
      const status = button.dataset.themeHomeStatus, active = model.user.status === status;
      button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
      const secondary = button.querySelector('.themeHomeStatusCopy span');
      if (secondary) secondary.textContent = active ? model.copy.on : model.copy.off;
    }
  }

  function syncGlassHome(grid, model, nextOwner) {
    if (root?.dataset.themeLayout !== 'glass-home') suspend();
    if (!root?.isConnected) {
      root = document.getElementById('themeHomePresentation') || el('div', 'themeHomePresentation');
      root.id = 'themeHomePresentation'; root.classList.add('themeHomePresentation');
      grid.before(root); root.replaceChildren(); sections.clear(); generation++;
    }
    owner = nextOwner; root.hidden = false; root.dataset.themeLayout = 'glass-home'; slot(root, 'home-presentation');
    const ticket = generation;
    let board = root.querySelector('.glassHomeBoard');
    if (!board) { board = slot(el('div', 'glassHomeBoard'), 'home-board'); root.append(board); }
    const update = (key, signature, parent, build) => {
      const previous = sections.get(key);
      if (previous?.signature === signature && previous.node.parentNode === parent) return previous.node;
      const node = build();
      if (previous?.node.parentNode === parent) previous.node.replaceWith(node);
      else if (key === 'glass-navigation') parent.insertBefore(node, board);
      else parent.append(node);
      sections.set(key, { signature, node }); return node;
    };
    update('glass-navigation', JSON.stringify([model.locale, model.user]), root, () => glassNavigation(model, ticket, nextOwner));
    const heroNode = update('glass-hero', model.locale, board, () => glassHero(model, ticket, nextOwner)); updateGlassHero(heroNode, model);
    update('glass-activity', JSON.stringify([model.locale, model.activity]), board, () => glassActivity(model, ticket, nextOwner));
    update('glass-recent', JSON.stringify([model.locale, model.recentActivity]), board, () => glassRecent(model, ticket, nextOwner));
    update('glass-today', JSON.stringify([model.locale, model.today]), board, () => glassToday(model, ticket, nextOwner));
    update('glass-servers', JSON.stringify([model.locale, model.servers]), board, () => glassServers(model, ticket, nextOwner));
    update('glass-messages', JSON.stringify([model.locale, model.conversations]), board, () => glassMessages(model, ticket, nextOwner));
    const focusNode = update('glass-focus', JSON.stringify([model.locale, model.focus.presets]), board, () => glassFocus(model, ticket, nextOwner)); updateGlassFocus(focusNode, model);
    update('glass-active', JSON.stringify([model.locale, model.contacts]), board, () => glassContacts(model, ticket, nextOwner, true));
    update('glass-directs', JSON.stringify([model.locale, model.contacts]), board, () => glassContacts(model, ticket, nextOwner));
    const notesNode = update('glass-notes', model.locale, board, () => glassNotes(model, ticket, nextOwner)); updateGlassNotes(notesNode, model, ticket, nextOwner);
    const footer = update('glass-footer', model.locale, root, () => slot(el('p', 'glassHomeFooter', model.labels.footer), 'home-footer'));
    if (footer !== root.lastElementChild) root.append(footer);
    syncHostLayout(grid); syncNativeActions(); return true;
  }

  function navigation(model, ticket, expectedOwner) {
    const nav = slot(el('nav', 'themeHomeNavigation'), 'home-navigation');
    nav.setAttribute('aria-label', 'ALTARA');
    nav.append(el('span', 'themeHomeBrand', 'ALTARA'));
    const links = el('div', 'themeHomeNavigationLinks');
    const home = typeof onOpenHome === 'function'
      ? action(model.copy.home, onOpenHome, 'themeHomeNavButton is-current', ticket, expectedOwner)
      : el('span', 'themeHomeNavButton is-current', model.copy.home);
    home.setAttribute('aria-current', 'page'); links.append(home);
    if (typeof onOpenMessages === 'function') links.append(action(model.copy.chat, onOpenMessages, 'themeHomeNavButton', ticket, expectedOwner));
    if (typeof onOpenStore === 'function') links.append(action(model.copy.store, onOpenStore, 'themeHomeNavButton', ticket, expectedOwner));
    nav.append(links, slot(el('div', 'themeHomeNativeActions'), 'home-native-actions')); return nav;
  }

  // Keep the actual Manage/Edit controls and their listeners. A theme changes
  // their presentation; it must not create substitutes or discard the host's
  // actions. Restore the original slot before retiring this native presenter.
  function syncNativeActions() {
    const target = root?.querySelector('[data-theme-slot="home-native-actions"]');
    if (!target) return;
    const toolbar = toolbarOrigin?.node
      ? toolbarOrigin.node : document.querySelector('.panel.mid .widgetsHeaderActions');
    if (!toolbar) return;
    if (!toolbarOrigin || toolbarOrigin.node !== toolbar) {
      toolbarOrigin = { node: toolbar, parent: toolbar.parentNode, next: toolbar.nextSibling };
    }
    if (toolbar.parentNode !== target) target.append(toolbar);
  }

  function syncHostLayout(grid) {
    const app = grid.closest('.app');
    const tab = grid.closest('#tabWidgets');
    const selected = app?.querySelector('[data-tab="widgets"]');
    // This is a host-owned presentation marker. Snapshot data alone cannot
    // select a layout in a DM, server scope or a hidden native tab.
    const visible = !tab || (!tab.hidden && tab.style.display !== 'none');
    const active = !selected || selected.classList.contains('active');
    const conversation = app?.querySelector('.panel.mid.is-dm-conversation-open,.panel.mid.is-bot-dm-conversation-open');
    if (markedApp && markedApp !== app) {
      delete markedApp.dataset.themeHomeLayout;
      delete markedApp.dataset.themeWindowFrame;
      delete markedApp.dataset.themeWidgetPreset;
    }
    markedApp = app;
    if (app) {
      if (document.body?.classList.contains('desktop-titlebar-overlay')) app.dataset.themeWindowFrame = 'caption-overlay';
      else delete app.dataset.themeWindowFrame;
      if (visible && active && !conversation) {
        app.dataset.themeHomeLayout = readSnapshot().themeLayout;
        if (readSnapshot().themeLayout === 'glass-home' && readSnapshot().nativeWidgetsView === true) app.dataset.themeNativeWidgets = 'true';
        else delete app.dataset.themeNativeWidgets;
        if (readSnapshot().widgetPreset === 'glass-dashboard') app.dataset.themeWidgetPreset = 'glass-dashboard';
        else delete app.dataset.themeWidgetPreset;
      } else {
        delete app.dataset.themeHomeLayout;
        delete app.dataset.themeWidgetPreset;
        delete app.dataset.themeNativeWidgets;
      }
    }
    // Keep the native Home button and listeners. Only the optional mark is
    // owned by this presenter; the original logo returns outside Glass Home.
    const homeButton = app?.dataset.themeHomeLayout === 'glass-home'
      ? app.querySelector('.groupOrb--app-home[data-open-rail-home]') : null;
    if (!homeButton || railBrand?.parentNode !== homeButton) {
      railBrand?.remove(); railBrand = null;
    }
    if (homeButton && !railBrand) {
      railBrand = brandMark('glassHomeRailBrand', 'rail-brand-mark'); homeButton.append(railBrand);
    }
  }

  function hero(model, ticket, expectedOwner) {
    const header = slot(el('header', 'themeHomeHero'), 'home-hero');
    header.append(slot(el('p', 'themeHomeDate', model.date), 'home-date'));
    const heading = el('h1', 'themeHomeHeading');
    heading.append(slot(el('span', 'themeHomeGreeting', model.greeting), 'home-greeting'),
      slot(el('strong', 'themeHomeName', model.user.name), 'home-name'));
    header.append(heading, el('p', 'themeHomeWelcome', model.copy.welcome));
    if (typeof onStatus === 'function') {
      const actions = slot(el('div', 'themeHomeStatusActions'), 'home-status-actions');
      for (const status of ['focus', 'dnd']) {
        const active = model.user.status === status;
        const button = action('', () => {
          const latest = readSnapshot();
          if (['dashboard', 'glass-home'].includes(latest.themeLayout) && expectedOwner === actor()) onStatus(latest.user?.status === status ? 'online' : status);
        }, `themeHomeStatusButton${active ? ' is-active' : ''}`, ticket, expectedOwner);
        button.dataset.themeHomeStatus = status; button.setAttribute('aria-pressed', String(active));
        button.append(icon(status));
        const label = el('span', 'themeHomeStatusCopy');
        label.append(el('strong', '', model.copy[status]), el('span', '', active ? model.copy.on : model.copy.off));
        button.append(label); actions.append(button);
      }
      header.append(actions);
    }
    return header;
  }

  function updateHero(header, model) {
    for (const [selector, value] of [
      ['.themeHomeDate', model.date], ['.themeHomeGreeting', model.greeting],
      ['.themeHomeName', model.user.name], ['.themeHomeWelcome', model.copy.welcome],
    ]) {
      const node = header.querySelector(selector);
      if (node && node.textContent !== value) node.textContent = value;
    }
    for (const button of header.querySelectorAll('[data-theme-home-status]')) {
      const status = button.dataset.themeHomeStatus; const active = status === model.user.status;
      button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
      button.querySelector('.themeHomeStatusCopy strong').textContent = model.copy[status];
      button.querySelector('.themeHomeStatusCopy span').textContent = active ? model.copy.on : model.copy.off;
    }
  }

  function activity(model) {
    const section = slot(el('section', 'themeHomeActivity'), 'home-activity');
    section.append(el('p', 'themeHomeCardEyebrow', model.copy.activity));
    if (!model.activity.name) {
      section.dataset.state = 'empty'; section.append(el('p', 'themeHomeEmpty', model.copy.noActivity)); return section;
    }
    section.append(image(model.activity.image, 'themeHomeActivityArtwork', model.activity.name.slice(0, 1)));
    const details = el('div', 'themeHomeActivityCopy');
    details.append(el('h2', '', model.activity.name));
    if (model.activity.details) details.append(el('p', '', model.activity.details));
    section.append(details); return section;
  }

  function servers(model, ticket, expectedOwner) {
    const section = slot(el('section', 'themeHomeServers'), 'home-servers');
    const heading = el('h2', 'themeHomeSectionTitle', model.copy.servers); section.append(heading);
    if (!model.servers.length) { section.append(el('p', 'themeHomeEmpty', model.copy.noServers)); return section; }
    const list = el('div', 'themeHomeServerList');
    for (const row of model.servers) {
      const canOpen = typeof onNavigateServer === 'function';
      const card = slot(el(canOpen ? 'button' : 'article', 'themeHomeServerCard'), 'home-server-card');
      card.dataset.themeHomeServerId = row.id;
      if (canOpen) {
        card.type = 'button';
        card.addEventListener('click', () => {
          if (!owns(card, expectedOwner, ticket)) return;
          const latest = readSnapshot();
          const fresh = Array.isArray(latest.servers) ? latest.servers.find(server => text(server?.id, 200) === row.id) : null;
          if (latest.themeLayout === 'dashboard' && fresh && expectedOwner === actor()) onNavigateServer(row.id, fresh);
        });
      }
      if (row.banner) card.append(image(row.banner, 'themeHomeServerBanner'));
      card.append(image(row.icon, 'themeHomeServerIcon', row.name.slice(0, 1)));
      const copy = el('span', 'themeHomeServerCopy'); copy.append(el('strong', '', row.name));
      if (row.members !== null) copy.append(el('span', 'themeHomeServerMeta', `${new Intl.NumberFormat(model.locale).format(row.members)} ${row.members === 1 ? model.copy.member : model.copy.members}`));
      card.append(copy);
      if (canOpen) card.append(icon('arrow'));
      list.append(card);
    }
    section.append(list); return section;
  }

  function suspend() {
    generation++; owner = ''; fingerprint = '';
    railBrand?.remove(); railBrand = null;
    if (toolbarOrigin?.node && toolbarOrigin.parent?.isConnected) {
      const next = toolbarOrigin.next?.parentNode === toolbarOrigin.parent ? toolbarOrigin.next : null;
      toolbarOrigin.parent.insertBefore(toolbarOrigin.node, next);
    }
    toolbarOrigin = null;
    if (markedApp) {
      delete markedApp.dataset.themeHomeLayout;
      delete markedApp.dataset.themeWindowFrame;
      delete markedApp.dataset.themeWidgetPreset;
      delete markedApp.dataset.themeNativeWidgets;
    }
    markedApp = null;
    sections.clear();
    if (root) { root.replaceChildren(); root.hidden = true; delete root.dataset.themeLayout; }
    root = null;
  }

  function sync() {
    const nextOwner = actor();
    if (!nextOwner) { suspend(); return false; }
    const snapshot = readSnapshot();
    if (!['dashboard', 'glass-home'].includes(snapshot.themeLayout) || nextOwner !== actor()) { suspend(); return false; }
    const grid = document.getElementById('widgetsGrid');
    if (!grid?.parentElement?.isConnected) { suspend(); return false; }
    if (owner !== nextOwner) suspend();
    const model = normalize(snapshot, text(getLanguage(), 40).toLowerCase());
    if (nextOwner !== actor()) { suspend(); return false; }
    if (snapshot.themeLayout === 'glass-home') {
      const glassModel = normalizeGlass(snapshot, model);
      if (nextOwner !== actor()) { suspend(); return false; }
      return syncGlassHome(grid, glassModel, nextOwner);
    }
    if (root?.dataset.themeLayout === 'glass-home') suspend();
    const nextFingerprint = JSON.stringify(model);
    if (root?.isConnected && root.childElementCount === 4 && owner === nextOwner && fingerprint === nextFingerprint) {
      syncHostLayout(grid); syncNativeActions(); return true;
    }
    if (!root?.isConnected) {
      root = document.getElementById('themeHomePresentation') || el('div', 'themeHomePresentation');
      root.id = 'themeHomePresentation'; root.classList.add('themeHomePresentation');
      if (root.parentElement !== grid.parentElement || root.nextElementSibling !== grid) grid.before(root);
      sections.clear(); root.replaceChildren(); generation++;
    }
    if (root.childElementCount !== sections.size) {
      sections.clear(); root.replaceChildren(); generation++;
    }
    owner = nextOwner; fingerprint = nextFingerprint; const ticket = generation;
    root.hidden = false; root.dataset.themeLayout = 'dashboard'; slot(root, 'home-presentation');
    const specs = [
      ['navigation', JSON.stringify([model.copy.home, model.copy.chat, model.copy.store]), () => navigation(model, ticket, nextOwner)],
      ['hero', 'hero', () => hero(model, ticket, nextOwner)],
      ['activity', JSON.stringify([model.copy.activity, model.copy.noActivity, model.activity]), () => activity(model)],
      ['servers', JSON.stringify([model.copy.servers, model.copy.noServers, model.copy.member, model.copy.members, model.locale, model.servers]), () => servers(model, ticket, nextOwner)],
    ];
    for (const [key, signature, build] of specs) {
      const previous = sections.get(key);
      if (previous?.signature === signature && previous.node.parentElement === root) continue;
      const node = build();
      if (previous?.node.parentElement === root) previous.node.replaceWith(node);
      else root.append(node);
      sections.set(key, { signature, node });
    }
    updateHero(sections.get('hero').node, model);
    syncHostLayout(grid); syncNativeActions();
    return true;
  }

  return { sync, suspend };
}
