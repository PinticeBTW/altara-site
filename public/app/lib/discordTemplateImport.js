const errorCopy = {
  invalid_request: ['Usa um nome entre 2 e 60 caracteres, sem caracteres invisíveis.', 'Use a name between 2 and 60 characters, without invisible characters.'],
  invalid_template_link: ['Cola um link de template discord.new ou discord.com/template.', 'Paste a discord.new or discord.com/template link.'],
  template_not_found: ['Este template foi apagado ou não existe.', 'This template was deleted or does not exist.'],
  discord_rate_limited: ['O Discord está a limitar pedidos. Aguarda um pouco e tenta novamente.', 'Discord is limiting requests. Wait a moment and retry.'],
  template_changed: ['O template mudou. Volta a carregar a pré-visualização.', 'The template changed. Load a new preview.'],
  not_authenticated: ['A tua sessão mudou. Volta a iniciar sessão.', 'Your session changed. Sign in again.'],
  import_unavailable: ['A importação ainda não está disponível. Tenta mais tarde.', 'Import is not available yet. Try again later.'],
  import_forbidden: ['Esta conta não pode criar servidores neste momento.', 'This account cannot create servers right now.'],
  server_limit: ['Atingiste o limite de servidores da tua conta.', 'You have reached your account’s server limit.'],
  invalid_template_structure: ['A estrutura deste template não pode ser importada com segurança.', 'This template’s structure cannot be imported safely.'],
  invalid_template_permissions: ['Não foi possível ler as permissões deste template.', 'This template’s permissions could not be read.'],
};

export function createDiscordImportController({ client, getUserId, storage }) {
  const actor = getUserId();
  const key = `altara.discord-import.pending.v1.${actor}`;
  let generation = 0, preview = null, submission = null, pending = null;
  try { storage ??= globalThis.sessionStorage; } catch {}
  try { pending = JSON.parse(storage?.getItem(key) || 'null'); } catch {}
  if (pending && (pending.action !== 'create' || typeof pending.name !== 'string'
      || !/^[A-Za-z0-9_-]{2,100}$/.test(pending.template || '') || !/^[0-9a-f]{64}$/.test(pending.revision || '')
      || !/^[0-9a-f-]{36}$/i.test(pending.request_id || ''))) {
    pending = null;
    try { storage?.removeItem(key); } catch {}
  }
  const current = () => !!actor && getUserId() === actor;
  const save = () => { try { pending ? storage?.setItem(key, JSON.stringify(pending)) : storage?.removeItem(key); } catch {} };
  const invoke = async body => {
    if (!current()) throw new Error('not_authenticated');
    const { data, error } = await client.functions.invoke('discord-template', { body, signal: AbortSignal.timeout(30000) });
    if (!current()) throw new Error('not_authenticated');
    if (error) {
      let details;
      try { details = await error.context?.json(); } catch {}
      throw new Error(details?.error || (error.context?.status === 404 ? 'import_unavailable' : 'request_failed'));
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };
  return {
    get pending() { return pending; },
    get preview() { return preview; },
    get busy() { return !!submission; },
    invalidate() { if (!submission && !pending) { generation++; preview = null; } },
    dispose() { generation++; preview = null; },
    async load(template) {
      if (pending || submission) throw new Error('pending_import');
      const epoch = ++generation;
      preview = null;
      const result = await invoke({ action: 'preview', template });
      if (epoch !== generation || !current()) return null;
      if (!result?.plan?.code || !/^[0-9a-f]{64}$/.test(result.revision || '')) throw new Error('invalid_template_structure');
      preview = result;
      return result;
    },
    create(name) {
      if (submission) return submission;
      if (!current()) return Promise.reject(new Error('not_authenticated'));
      if (!pending) {
        if (!preview) return Promise.reject(new Error('preview_required'));
        const label = String(name || '').normalize('NFC').trim();
        if ([...label].length < 2 || [...label].length > 60) return Promise.reject(new Error('invalid_request'));
        pending = { action: 'create', template: preview.plan.code, revision: preview.revision,
          name: label, request_id: crypto.randomUUID() };
        save();
      }
      const task = invoke(pending).then(result => {
        if (!result?.server_id) throw new Error('request_failed');
        pending = null; save();
        return result;
      }).catch(error => {
        // Only these responses prove creation did not run. Network/5xx failures
        // retain the exact request, so Retry cannot create a second server.
        if (['template_changed', 'template_not_found', 'invalid_request', 'import_forbidden', 'server_limit', 'import_unavailable'].includes(error.message)) {
          pending = null; save();
          if (error.message === 'template_changed') preview = null;
        }
        throw error;
      }).finally(() => { submission = null; });
      submission = task;
      return task;
    },
  };
}

let activeDialog = null;
export function openDiscordTemplateImport({ client, getUserId, isPortuguese = () => false, onCreated, onClose }) {
  if (activeDialog?.isConnected) { activeDialog.focus(); return; }
  const pt = isPortuguese();
  const copy = (portuguese, english) => pt ? portuguese : english;
  const controller = createDiscordImportController({ client, getUserId });
  const dialog = document.createElement('dialog');
  activeDialog = dialog;
  dialog.className = 'discordImportDialog';
  dialog.setAttribute('aria-labelledby', 'discordImportTitle');
  dialog.innerHTML = `
    <div class="modalTop"><div><div id="discordImportTitle" class="modalTitle">${copy('Importar do Discord', 'Import from Discord')}</div>
    <p class="hint">${copy('Cria um servidor novo no ALTARA a partir de um template.', 'Create a new ALTARA server from a template.')}</p></div>
    <button type="button" class="btn ghost" data-import-close aria-label="${copy('Fechar', 'Close')}">&times;</button></div>
    <div class="discordImportBody">
      <label for="discordImportLink">${copy('Link do template', 'Template link')}</label>
      <div class="discordImportLinkRow"><input id="discordImportLink" class="input" maxlength="250" placeholder="https://discord.new/…" autocomplete="off" spellcheck="false" />
      <button class="btn ghost" type="button" data-import-preview>${copy('Pré-visualizar', 'Preview')}</button></div>
      <details class="hint"><summary>${copy('Como obter o template?', 'How do I get a template?')}</summary>
      <p>${copy('No Discord: Definições do servidor → Modelo do servidor → Gerar modelo → Copiar. Se já tens um modelo, sincroniza-o primeiro.', 'In Discord: Server Settings → Server Template → Generate Template → Copy. Sync an existing template first.')}</p></details>
      <div data-import-result hidden></div>
      <div class="field" data-import-name-field hidden><label for="discordImportName">${copy('Nome no ALTARA', 'Name on ALTARA')}</label>
      <input id="discordImportName" class="input" minlength="2" maxlength="60" autocomplete="off" /></div>
      <p class="hint" data-import-status role="status" aria-live="polite"></p>
    </div>
    <div class="serverCreateFooter"><button class="btn ghost" type="button" data-import-back>${copy('Voltar', 'Back')}</button>
    <button class="btn primary" type="button" data-import-create disabled>${copy('Importar servidor', 'Import server')}</button></div>`;
  document.body.appendChild(dialog);
  const find = selector => dialog.querySelector(selector);
  const link = find('#discordImportLink'), name = find('#discordImportName');
  const previewButton = find('[data-import-preview]'), createButton = find('[data-import-create]');
  const status = find('[data-import-status]'), result = find('[data-import-result]');
  let loading = false, creating = false, closed = false, previewEpoch = 0;
  const update = () => {
    const pending = !!controller.pending;
    link.disabled = creating || pending;
    name.disabled = creating || pending;
    previewButton.disabled = loading || creating || pending || !link.value.trim();
    createButton.disabled = creating || loading || (!pending && (!controller.preview || [...name.value.trim()].length < 2));
    createButton.textContent = creating ? copy('A importar…', 'Importing…') : pending ? copy('Tentar novamente', 'Retry') : copy('Importar servidor', 'Import server');
    dialog.setAttribute('aria-busy', creating || loading ? 'true' : 'false');
    find('[data-import-close]').disabled = creating;
    find('[data-import-back]').disabled = creating;
  };
  const feedback = (message, error = false) => { status.textContent = message; status.classList.toggle('discordImportError', error); };
  const errorMessage = error => {
    const entry = errorCopy[error?.message];
    return entry ? entry[pt ? 0 : 1] : copy('Não foi possível concluir. Tenta novamente; a mesma tentativa não cria um servidor duplicado.', 'Could not finish. Retry; the same attempt will not create a duplicate server.');
  };
  const close = (completed = false) => {
    if (creating || closed) return;
    closed = true; previewEpoch++; controller.dispose();
    dialog.close(); dialog.remove(); activeDialog = null;
    if (!completed) onClose?.();
  };
  find('[data-import-close]').onclick = () => close();
  find('[data-import-back]').onclick = () => close();
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    // Keep the existing app-wide Escape handler from also closing its parent.
    if (event.key === 'Escape') event.stopPropagation();
  });
  link.oninput = () => {
    previewEpoch++; loading = false; controller.invalidate(); result.hidden = true; result.replaceChildren();
    find('[data-import-name-field]').hidden = true;
    feedback(''); update();
  };
  name.oninput = update;
  const paragraph = (text, parent = result) => { const node = document.createElement('p'); node.textContent = text; parent.appendChild(node); return node; };
  previewButton.onclick = async () => {
    const epoch = ++previewEpoch; loading = true;
    result.hidden = true;
    feedback(copy('A ler o template…', 'Reading template…')); update();
    try {
      const data = await controller.load(link.value);
      if (!data || closed || epoch !== previewEpoch) return;
      const plan = data.plan;
      name.value = plan.name; result.replaceChildren(); result.hidden = false;
      paragraph(plan.name).className = 'discordImportServerName';
      paragraph(copy(`${plan.categories.length} categorias · ${plan.channels.filter(c => c.type === 'text').length} canais de texto · ${plan.channels.filter(c => c.type === 'voice').length} canais de voz · ${plan.roles.length} cargos (inclui @everyone)`,
        `${plan.categories.length} categories · ${plan.channels.filter(c => c.type === 'text').length} text channels · ${plan.channels.filter(c => c.type === 'voice').length} voice channels · ${plan.roles.length} roles (includes @everyone)`));
      const details = document.createElement('details'); const summary = document.createElement('summary');
      summary.textContent = copy('Ver canais e cargos', 'View channels and roles'); details.appendChild(summary);
      const tree = document.createElement('ul'); details.appendChild(tree);
      const item = (text, parent = tree) => { const li = document.createElement('li'); li.textContent = text; parent.appendChild(li); return li; };
      const addChannel = (channel, parent) => item(`${channel.type === 'voice' ? '◖' : '#'} ${channel.name}`, parent);
      for (const c of plan.channels.filter(c => c.parent_id === null)) addChannel(c, tree);
      for (const category of plan.categories) {
        const li = item(category.name), children = document.createElement('ul'); li.appendChild(children);
        for (const c of plan.channels.filter(c => c.parent_id === category.source_id)) addChannel(c, children);
      }
      paragraph(`${copy('Cargos', 'Roles')}: ${plan.roles.map(r => r.name).join(', ')}`, details);
      result.appendChild(details);
      paragraph(copy('Inclui nomes, ordem, cores dos cargos e permissões compatíveis. Não inclui mensagens, membros, bots, ícone, boosts ou outros conteúdos.', 'Includes names, order, role colors and compatible permissions. Messages, members, bots, icon, boosts and other content are not included.'));
      const differences = document.createElement('details'), differencesTitle = document.createElement('summary');
      differencesTitle.textContent = copy('Diferenças de permissões e definições', 'Permission and setting differences');
      differences.appendChild(differencesTitle); result.appendChild(differences);
      paragraph(copy('Inclui regras por canal e por categoria para as permiss�es compat�veis. Os canais com regras iguais �s da categoria ficam sincronizados; os restantes mant�m regras pr�prias. As exce��es por membro t�m prioridade sobre os cargos.', 'Includes channel and category rules for compatible permissions. Channels matching their category remain synchronized; other channels keep their own rules. Member exceptions take precedence over roles.'), differences);
      paragraph(copy('Permissões sem equivalente, tópicos, slowmode, definições do servidor e apresentação dos cargos não são importados. As permissões de moderação/administração compatíveis são mantidas.', 'Permissions without an equivalent, topics, slowmode, server settings and role display settings are not imported. Compatible moderation/administrator permissions are preserved.'), differences);
      if (plan.warnings.includes('member_overwrites_skipped')) paragraph(copy('As exceções para membros individuais não são importadas.', 'Individual member exceptions are not imported.'));
      if (plan.warnings.includes('voice_limit_permission_review')) paragraph(copy('O template tem regras por canal para mover membros. A entrada em chamadas cheias não foi ativada automaticamente; revê essa permissão nos cargos.', 'This template has channel-specific rules for moving members. Bypassing full voice channels was not enabled automatically; review that role permission.'), differences);
      if (plan.warnings.includes('names_shortened')) paragraph(copy('Alguns nomes foram encurtados para respeitar os limites do ALTARA.', 'Some names were shortened to fit ALTARA’s limits.'));
      if (plan.warnings.includes('announcements_as_text')) paragraph(copy('Canais de anúncios serão canais de texto normais.', 'Announcement channels become regular text channels.'));
      if (plan.warnings.includes('general_added')) paragraph(copy('Será acrescentado um canal de texto general.', 'A general text channel will be added.'));
      if (plan.skipped.length) paragraph(copy('Não serão importados (tipo não suportado ou restrição de idade): ', 'Not imported (unsupported type or age restriction): ') + plan.skipped.map(c => c.name).join(', '));
      find('[data-import-name-field]').hidden = false;
      feedback(copy('Revê a estrutura e escolhe o nome do novo servidor.', 'Review the structure and choose the new server’s name.'));
    } catch (error) { if (!closed && epoch === previewEpoch) feedback(errorMessage(error), true); }
    finally { if (!closed && epoch === previewEpoch) { loading = false; update(); } }
  };
  link.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); if (!previewButton.disabled) previewButton.click(); } });
  createButton.onclick = async () => {
    if (createButton.disabled || creating) return;
    creating = true; feedback(copy('A criar o servidor e a aplicar as permissões…', 'Creating the server and applying permissions…')); update();
    try {
      const row = await controller.create(name.value);
      creating = false; close(true);
      await onCreated?.({ serverId: row.server_id, fallbackConversationId: row.default_conversation_id, serverName: name.value });
    } catch (error) {
      if (!closed) { creating = false; feedback(errorMessage(error), true); update(); }
    }
  };
  if (controller.pending) {
    link.value = `https://discord.new/${controller.pending.template}`; name.value = controller.pending.name;
    find('[data-import-name-field]').hidden = false;
    feedback(copy('A tentativa anterior ainda não foi confirmada. Tenta novamente para verificar o resultado sem duplicar o servidor.', 'The previous attempt is unconfirmed. Retry to resolve the result without duplicating the server.'));
  }
  update(); dialog.showModal(); link.focus();
}
