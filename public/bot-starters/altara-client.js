const DEFAULT_FUNCTIONS_URL = "https://tbbgwjmmaiclkhssimhf.supabase.co/functions/v1";
const internalPollErrors = new WeakSet();
// Stage is preserved for a later release; no runtime setting enables it.
const STAGE_RELEASE_ENABLED = false;
const DIRECT_MESSAGE_HANDLERS = Object.freeze({__proto__:null,
  DIRECT_MESSAGE_CREATE:'directMessageCreate',DIRECT_MESSAGE_UPDATE:'directMessageUpdate',DIRECT_MESSAGE_DELETE:'directMessageDelete',
  DIRECT_MESSAGE_REACTION_ADD:'directMessageReactionAdd',DIRECT_MESSAGE_REACTION_REMOVE:'directMessageReactionRemove',DIRECT_MESSAGE_PIN_UPDATE:'directMessagePinUpdate',
});

function messageMentionOptions(options = {}) {
  if(options.allowed_mentions !== undefined && options.allowedMentions !== undefined) throw Error('invalid_allowed_mentions');
  const mentions=options.allowed_mentions !== undefined ? options.allowed_mentions : options.allowedMentions;
  return mentions === undefined ? {} : {allowed_mentions:mentions};
}

class AltaraClient {
  constructor(options = {}) {
    this.token = String(options.token || "").trim();
    this.functionsUrl = normalizeFunctionsUrl(options.functionsUrl || process.env.ALTARA_FUNCTIONS_URL || DEFAULT_FUNCTIONS_URL);
    this.tokenPrefix = getBotTokenPrefix(this.token);
    this.pollIntervalMs = finiteOption(options.pollIntervalMs ?? process.env.ALTARA_POLL_INTERVAL_MS, 1000, 1000, 300000);
    this.batchSize = Math.floor(finiteOption(options.batchSize, 5, 1, 10));
    this.requestTimeoutMs = finiteOption(options.requestTimeoutMs, 20000, 100, 300000);
    this.handlers = new Map();
    this.autocompleteHandlers = new Map();
    this.commandDefinitions = new Map();
    this.listeners = new Map();
    this.running = false;
    this.timer = null;
    this.inFlight = false;
    this.runId = 0;
    this.requests = new Set();
    this.wake = null;
    this.intents = normalizeEventIntents(options.intents ?? []);
    this.eventAcks = new Map();
    this.completedEvents = new Map();
    this.domainInFlight = false;
    this.droppedEvents = 0;
    this.dmAcks = new Map();
    this.dmInFlight = false;
    this.dmDroppedEvents = 0;
    this.serverSettingsFeatures = options.serverSettingsFeatures === undefined ? null : normalizeServerSettingsFeatures(options.serverSettingsFeatures);
    this.serverSettingsScope = null;
  }

  command(name, metadata, handler) {
    const commandHandler = typeof metadata === "function" ? metadata : handler;
    const commandMetadata = typeof metadata === "function" || metadata === undefined ? {} : metadata;
    if (typeof commandHandler !== "function") throw new Error("command_handler_required");
    const definition = normalizeCommandDefinition(name, commandMetadata);
    const key = commandKey(definition.name, definition.type);
    this.handlers.set(key, commandHandler);
    this.commandDefinitions.set(key, definition);
    return this;
  }

  autocomplete(name, handler) {
    const key = commandKey(name);
    if (typeof handler !== 'function') throw Error('autocomplete_handler_required');
    this.autocompleteHandlers.set(key, handler);
    return this;
  }

  on(event, handler) {
    const key = String(event || "").trim();
    if (!key || typeof handler !== "function") return this;
    const list = this.listeners.get(key) || [];
    list.push(handler);
    this.listeners.set(key, list);
    return this;
  }

  emit(event, payload) {
    const key = String(event || "").trim();
    const list = this.listeners.get(key) || [];
    const reportFailure = error => {
      if (key !== "error" && this.listeners.get("error")?.length) this.emit("error", error);
      else console.error(key === "error" ? "[altara] error_handler_failed" : "[altara] event_observer_failed");
    };
    for (const handler of list) {
      try {
        const result = handler(payload);
        // Observers must not block polling, but rejected promises still need handling.
        if (result && typeof result.then === "function") Promise.resolve(result).catch(reportFailure);
      } catch (error) { reportFailure(error); }
    }
  }

  login() {
    if (!this.token) throw new Error("ALTARA_BOT_TOKEN is required");
    if (this.running) return this;
    this.running = true;
    const runId = ++this.runId;
    void this.start(runId).catch((error) => {
      if (this.isCurrentRun(runId)) {
        this.emit("error", error);
        this.stop();
      }
    });
    return this;
  }

  stop() {
    this.running = false;
    this.runId += 1;
    for (const controller of this.requests) controller.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.wake?.();
    this.wake = null;
  }

  isCurrentRun(runId) {
    return this.running && this.runId === runId;
  }

  async waitForPoll(delay, runId) {
    if (!this.isCurrentRun(runId)) return;
    await new Promise((resolve) => {
      const wake = () => {
        if (this.wake === wake) {
          this.timer = null;
          this.wake = null;
        }
        resolve();
      };
      this.wake = wake;
      this.timer = setTimeout(wake, delay);
    });
  }

  async loop(runId = this.runId) {
    let failures = 0;
    while (this.isCurrentRun(runId)) {
      let delay = this.pollIntervalMs;
      try {
        await this.pollOnce(runId);
        failures = 0;
      } catch (error) {
        if (!this.isCurrentRun(runId)) return;
        this.emit("error", error);
        if (isTerminalConnectionError(error)) { this.stop(); return; }
        delay = retryDelay(error, ++failures, this.pollIntervalMs);
      }
      await this.waitForPoll(delay, runId);
    }
  }

  async start(runId = this.runId) {
    console.log(`[altara] functions endpoint: ${this.functionsUrl}`);
    console.log(`[altara] token prefix: ${this.tokenPrefix || "invalid_token_format"}`);
    let failures = 0;
    while (this.isCurrentRun(runId)) {
      try {
        if (this.serverSettingsFeatures !== null) await this.registerServerSettings(this.serverSettingsFeatures);
        await this.syncCommands();
        break;
      } catch (error) {
        if (!this.isCurrentRun(runId)) return;
        this.emit("error", error);
        if (isTerminalConnectionError(error)) { this.stop(); return; }
        // Retrying an upsert is safe; writes such as replies are never retried here.
        await this.waitForPoll(retryDelay(error, ++failures, this.pollIntervalMs), runId);
      }
    }
    if (!this.isCurrentRun(runId)) return;
    console.log("ALTARA bot connected in Bot Token Connection mode.");
    await this.loop(runId);
  }

  async syncCommands() {
    const commands = Array.from(this.commandDefinitions.values());
    const data = await this.callFunction("altara-bot-sync-commands", {
      commands,
      disable_missing: true,
    });
    console.log(`ALTARA synced ${Number(data.synced_count || commands.length)} command(s) from code.`);
    return data;
  }

  async registerServerSettings(features) {
    const requested = normalizeServerSettingsFeatures(features);
    const data = await this.callFunction('altara-bot-surfaces', {action:'settings_register',features:requested});
    if (data?.ok !== true || !isEventUuid(data.bot_id) || !Number.isSafeInteger(data.support_revision) || data.support_revision < 0 ||
        JSON.stringify(normalizeServerSettingsFeatures(data.features)) !== JSON.stringify(requested)) throw Error('invalid_server_settings_response');
    return JSON.parse(JSON.stringify(data));
  }

  beginServerSettingsScope() {
    if (this.serverSettingsScope) return null;
    const scope = {reads:new Map(),runId:this.runId};
    this.serverSettingsScope = scope;
    return scope;
  }

  endServerSettingsScope(scope) {
    if (scope && this.serverSettingsScope === scope) this.serverSettingsScope = null;
  }

  async getServerSettings(serverId) {
    const server = String(serverId || '').trim().toLowerCase();
    if (!isEventUuid(server)) throw Error('invalid_server_id');
    const scope = this.serverSettingsScope;
    const read = async () => validateServerSettings(await this.callFunction('altara-bot-surfaces',{action:'settings_get',server_id:server}),server);
    if (scope && !scope.reads.has(server)) scope.reads.set(server,read());
    const data = await (scope ? scope.reads.get(server) : read());
    // A late settings response must not let a stopped delivery act on its old event.
    if (scope && scope.runId !== this.runId) throw Error('server_settings_scope_expired');
    return JSON.parse(JSON.stringify(data));
  }

  async pollOnce(runId) {
    if (this.inFlight) return;
    this.inFlight = true;
    const settingsScope = this.beginServerSettingsScope();
    const generation = this.runId;
    const current = () => this.runId === generation && (runId === undefined || this.isCurrentRun(runId));
    try {
      if (!current()) return;
      const errors = [];
      const recordFailure = error => {
        errors.push(error);
        if (isTerminalConnectionError(error)) throw combinePollErrors(errors);
      };
      let data, commandFailed = false;
      // Capture endpoint failures separately from the existing command-handler errors.
      try { data = await this.callFunction("altara-bot-poll-events", { limit: this.batchSize }); }
      catch (error) { commandFailed = true; recordFailure(error); }
      if (!current()) {
        if (errors.length) throw combinePollErrors(errors);
        return;
      }
      if (!commandFailed) {
        const events = Array.isArray(data.events) ? data.events : [];
        for (const event of events) {
          if (!current()) break;
          try { await this.handleEvent(event); } catch (error) { this.emit("error", error); }
        }
      }
      // Independently leased feeds remain sequential and get one attempt per cycle.
      if (this.intents.length && current()) {
        try { await this.pollDomainEvents(runId); } catch (error) { recordFailure(error); }
      }
      if ((this.listeners.has("interactionCreate")) && current()) {
        try { await this.pollComponentEvents(runId); } catch (error) { recordFailure(error); }
        if (current()) {try { await this.pollNativeComponentEvents(runId); } catch (error) { recordFailure(error); }}
      }
      if (errors.length) throw combinePollErrors(errors);
    } finally {
      this.endServerSettingsScope(settingsScope);
      this.inFlight = false;
    }
  }

  async handleEvent(event) {
    if (event?.type === 'APPLICATION_COMMAND_AUTOCOMPLETE') {
      const ctx = new AltaraAutocompleteContext(this,event);
      const handler = this.autocompleteHandlers.get(ctx.commandName);
      try {
        if (handler) await handler(ctx);
        if (!ctx.replied && !ctx.responseAttempted) await ctx.respond([]);
      } catch (error) {
        this.emit('error',error);
        // An autocomplete failure must never turn into a public chat message.
        if (!ctx.replied && !ctx.responseAttempted) {
          try { await ctx.respond([]); } catch (replyError) { this.emit('error',replyError); }
        }
      }
      return;
    }
    if (event?.type && event.type !== "APPLICATION_COMMAND") return;
    const ctx = new AltaraCommandContext(this, event);
    const name = ctx.commandName;
    const handler = name ? this.handlers.get(commandKey(name,ctx.commandType)) : null;
    if (!handler) {
      await ctx.reply(`Unknown command: /${name || "unknown"}`);
      return;
    }
    try {
      await handler(ctx);
    } catch (error) {
      this.emit("error", error);
      try {
        if (!ctx.replied && !ctx.privateResponseAttempted) await ctx.reply("Command failed.");
      } catch (replyError) {
        this.emit("error", replyError);
      }
    }
  }

  async pollDomainEvents(runId) {
    if (this.domainInFlight || !this.intents.length) return;
    this.domainInFlight = true;
    const settingsScope = this.beginServerSettingsScope();
    const generation = this.runId;
    const current = () => this.runId === generation && (runId === undefined || this.isCurrentRun(runId));
    try {
      if (!current()) return;
      const intents = this.intents.filter(intent => intent !== "direct_messages");
      let domainError;
      if (intents.length) {
        try {
          const acknowledgements = Array.from(this.eventAcks.values()).slice(0, 100);
          const data = await this.callFunction("altara-bot-events", { intents, limit: this.batchSize, acknowledgements });
          if (!current()) return;
          if (data.ok !== true || !Array.isArray(data.events)) throw new Error("invalid_domain_event_response");
          for (const ack of acknowledgements) if (this.eventAcks.get(ack.id)?.lease_id === ack.lease_id) this.eventAcks.delete(ack.id);
          const dropped = Number(data.dropped_events || 0);
          if (dropped > this.droppedEvents) this.emit("eventOverflow", { droppedEvents: dropped, source: "domain" });
          this.droppedEvents = dropped;
          for (const event of data.events) {
            if (!current()) break;
            const name = ({__proto__:null,MESSAGE_CREATE:'messageCreate',MESSAGE_UPDATE:'messageUpdate',MESSAGE_DELETE:'messageDelete',SERVER_MEMBER_ADD:'serverMemberAdd',SERVER_MEMBER_REMOVE:'serverMemberRemove',SERVER_MEMBER_UPDATE:'serverMemberUpdate',MESSAGE_REACTION_ADD:'reactionAdd',MESSAGE_REACTION_REMOVE:'reactionRemove',VOICE_STATE_UPDATE:'voiceStateUpdate',PRESENCE_UPDATE:'presenceUpdate',THREAD_CREATE:'threadCreate',THREAD_UPDATE:'threadUpdate',THREAD_MESSAGE_CREATE:'threadMessageCreate'})[event?.type] || '';
            if (!name || !isEventUuid(event.id) || !isEventUuid(event.lease_id)) throw new Error("invalid_domain_event");
            const now = Date.now();
            for (const [id, at] of this.completedEvents) if (now - at > 600000) this.completedEvents.delete(id);
            try {
              if (!this.completedEvents.has(event.id)) {
                const context = new AltaraEventContext(this, event);
                for (const handler of this.listeners.get(name) || []) {
                  if (!current()) return;
                  await handler(context);
                }
                if (!current()) return;
                this.completedEvents.set(event.id, now);
                while (this.completedEvents.size > 1000) this.completedEvents.delete(this.completedEvents.keys().next().value);
              }
              this.eventAcks.set(event.id, { id: event.id, lease_id: event.lease_id });
            } catch (error) { this.emit("error", error); }
          }
        } catch (error) {
          if (isTerminalConnectionError(error)) throw error;
          domainError = error;
        }
      }
      // The private feed is independently leased; a temporary public failure must not starve it.
      if (this.intents.includes("direct_messages") && current()) {
        try { await this.pollDirectMessages(runId); }
        catch (error) {
          if (!domainError) throw error;
          throw combinePollErrors([domainError, error]);
        }
      }
      if (domainError) throw domainError;
    } finally { this.endServerSettingsScope(settingsScope); this.domainInFlight = false; }
  }

  async pollDirectMessages(runId) {
    if (this.dmInFlight || !this.intents.includes('direct_messages')) return;
    this.dmInFlight = true;
    const settingsScope = this.beginServerSettingsScope();
    const generation = this.runId;
    const current = () => this.runId === generation && (runId === undefined || this.isCurrentRun(runId));
    try {
      const acknowledgements = [...this.dmAcks.values()].slice(0,100);
      const data = await this.callFunction('altara-bot-surfaces',{action:'dm_poll',event_types:Object.keys(DIRECT_MESSAGE_HANDLERS),limit:this.batchSize,acknowledgements});
      if (!current()) return;
      if (data.ok !== true || !Array.isArray(data.events)) throw Error('invalid_dm_event_response');
      for (const event of data.events) validateDirectMessageEvent(event);
      for (const ack of acknowledgements) if(this.dmAcks.get(ack.id)?.lease_id===ack.lease_id)this.dmAcks.delete(ack.id);
      const dropped = Number(data.dropped_events || 0);
      if (dropped > this.dmDroppedEvents) this.emit("eventOverflow", { droppedEvents: dropped, source: "direct_messages" });
      this.dmDroppedEvents = dropped;
      for (const event of data.events) {
        if (!current()) break;
        const now = Date.now();
        for (const [id, at] of this.completedEvents) if (now - at > 600000) this.completedEvents.delete(id);
        try {
          if(!this.completedEvents.has(event.id)) {
            const context = new AltaraEventContext(this,event);
            for(const handler of this.listeners.get(DIRECT_MESSAGE_HANDLERS[event.type])||[]) {
              if (!current()) return;
              await handler(context);
            }
            if (!current()) return;
            this.completedEvents.set(event.id,now);
            while(this.completedEvents.size>1000)this.completedEvents.delete(this.completedEvents.keys().next().value);
          }
          this.dmAcks.set(event.id,{id:event.id,lease_id:event.lease_id});
        } catch(error) {this.emit('error',error);}
      }
    } finally {this.endServerSettingsScope(settingsScope);this.dmInFlight=false;}
  }

  async reply(eventId, content, options = {}) {
    const message = content && typeof content === "object" ? { ...options, ...content } : { ...options, content };
    validatePrivateReply(message);
    return await this.callFunction("altara-bot-respond", {
      event_id: eventId,
      type: "CHANNEL_MESSAGE_WITH_SOURCE",
      data: {
        content: String(message.content || "").slice(0, 2000),
        ...(message.ephemeral === true ? { ephemeral: true } : { attachments: Array.isArray(message.attachments) ? message.attachments : [] }),
        ...(message.embeds !== undefined ? { embeds: message.embeds } : {}),
        ...(message.components !== undefined ? { components: message.components } : {}),
        ...messageMentionOptions(message),
      },
    });
  }

  async showModal(eventId, modal) {
    if (!modal || typeof modal !== "object" || Array.isArray(modal)) throw Error("invalid_modal");
    const { custom_id, title, components } = modal;
    return await this.callFunction("altara-bot-respond", { event_id: eventId, type: 9, data: { custom_id, title, components } });
  }

  async sendMessage(options = {}) {
    return await this.messageAction("send_message", options);
  }

  pollNativeComponentEvents(runId) { return this.pollComponentEvents(runId, 'dm'); }

  async pollComponentEvents(runId, source = null) {
    const generation = this.runId;
    const current = () => this.runId === generation && (runId === undefined || this.isCurrentRun(runId));
    if (!current()) return;
    if (!current()) return;
    const data = await this.callFunction("altara-bot-components", { action: "poll", limit: Math.min(this.batchSize,5), ...(source ? {source_kind:source} : {}) });
    if (!current()) return;
    if (data.ok !== true || !Array.isArray(data.events)) throw new Error("invalid_component_event_response");
    for (const event of data.events) {
      if (!current()) break;
      if (!isEventUuid(event.id) || !isEventUuid(event.lease_id) || !["MESSAGE_COMPONENT", "MODAL_SUBMIT"].includes(event.type)) throw new Error("invalid_component_event");
      if (source ? !['dm','thread'].includes(event.source_kind) : event.source_kind !== undefined && event.source_kind !== null) throw new Error("invalid_component_event_source");
      const ctx = new AltaraComponentContext(this, event);
      try {
        for (const handler of this.listeners.get("interactionCreate") || []) {
          if (!current()) return;
          await handler(ctx);
        }
        if (!current()) return;
        if (!ctx.replied && !ctx.privateResponseAttempted) await ctx.acknowledge();
      } catch (error) { this.emit("error", error); }
    }
  }

  async readMessageHistory(options = {}) {
    const data = await this.messageAction("history", options);
    return Array.isArray(data.messages) ? data.messages : [];
  }

  async addReaction(options = {}) {
    return await this.messageAction("add_reaction", options);
  }
  async removeReaction(options = {}) {
    return await this.messageAction("remove_reaction", options);
  }
  async setReaction(options = {}) {
    if(typeof options.enabled!=="boolean")throw Error("invalid_reaction_enabled");
    return await this.messageAction("set_reaction", options);
  }

  async pinMessage(options = {}) {
    return await this.messageAction("pin_message", options);
  }

  async unpinMessage(options = {}) {
    return await this.messageAction("unpin_message", options);
  }

  async deleteMessage(options = {}) {
    return await this.messageAction("delete_message", options);
  }

  async editMessage(options = {}) {
    return await this.messageAction("edit_message", options);
  }

  async joinVoice(options = {}) {
    return await this.voiceAction("join", options);
  }

  async leaveVoice(options = {}) {
    return await this.voiceAction("leave", options);
  }

  async setVoiceStatus(options = {}) {
    return await this.voiceAction("status", options);
  }

  async getVoiceState(options = {}) {
    return await this.voiceAction("state", options);
  }

  async heartbeatVoice(options = {}) {
    return await this.voiceAction("heartbeat", options);
  }

  async closeVoiceConnection(options = {}) {
    return await this.voiceAction("close_connection", options);
  }

  recoverVoice(options = {}) { return this.voiceAction('recover',options); }
  captureVoice(options = {}) {
    return this.callFunction('altara-bot-audio-capture',{action:'begin',server_id:options.serverId||options.server_id,channel_id:options.channelId||options.channel_id||'',event_id:options.eventId||options.event_id,recording:options.recording===true});
  }
  heartbeatCapture(options = {}) {return this.callFunction('altara-bot-audio-capture',{action:'heartbeat',server_id:options.serverId||options.server_id,channel_id:options.channelId||options.channel_id,capture_id:options.captureId||options.capture_id});}
  closeCapture(options = {}) {return this.callFunction('altara-bot-audio-capture',{action:'close',server_id:options.serverId||options.server_id,channel_id:options.channelId||options.channel_id,capture_id:options.captureId||options.capture_id});}
  heartbeatAudioCapture(options={}) {return this.heartbeatCapture(options);}
  closeAudioCapture(options={}) {return this.closeCapture(options);}

  async uploadAttachment(options = {}) {
    let file=options.file;
    const name=String(options.fileName||options.file_name||file?.name||options.filePath||'attachment').split(/[\\/]/).pop();
    if(options.filePath) {
      const fs=require('node:fs/promises');
      try {const stat=await fs.stat(options.filePath);if(!stat.isFile()||stat.size>8*1024*1024)throw Error();file=await fs.readFile(options.filePath);}catch{throw Error('attachment_read_failed');}
    }
    const mime=options.mime||({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',txt:'text/plain',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',zip:'application/zip'})[name.split('.').pop().toLowerCase()]||file?.type||'application/octet-stream';
    if(!(file instanceof Blob)) {
      if(!(file instanceof Uint8Array)||file.byteLength>8*1024*1024)throw Error('invalid_attachment');
      file=new Blob([file],{type:mime});
    }
    if(!file.size||file.size>8*1024*1024)throw Error('invalid_attachment');
    const body=new FormData();body.set('server_id',options.serverId||options.server_id||'');body.set('channel_id',options.channelId||options.channel_id||'');body.set('file',file,name);
    const result=await this.callFunction('altara-bot-attachments',body,{multipart:true});return result.attachment;
  }

  async uploadDirectMessageAttachment(options = {}) {
    let file=options.file;
    const name=String(options.fileName||options.file_name||file?.name||options.filePath||'attachment').split(/[\\/]/).pop();
    if(options.filePath){const fs=require('node:fs/promises');try{const stat=await fs.stat(options.filePath);if(!stat.isFile()||stat.size>8*1024*1024)throw Error();file=await fs.readFile(options.filePath);}catch{throw Error('attachment_read_failed');}}
    const mime=options.mime||({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',txt:'text/plain',csv:'text/csv',json:'application/json',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',zip:'application/zip'})[name.split('.').pop().toLowerCase()]||file?.type||'application/octet-stream';
    if(!(file instanceof Blob)){if(!(file instanceof Uint8Array)||file.byteLength>8*1024*1024)throw Error('invalid_attachment');file=new Blob([file],{type:mime});}
    if(!file.size||file.size>8*1024*1024)throw Error('invalid_attachment');
    const body=new FormData();body.set('server_id',options.serverId||options.server_id||'');body.set('user_id',options.userId||options.user_id||'');body.set('file',file,name);
    const result=await this.callFunction('altara-bot-dm-attachments',body,{multipart:true});return result.attachment;
  }

  getDirectMessageAttachment(options = {}) {
    return this.callFunction('altara-bot-dm-attachments',{action:'read',message_id:options.messageId||options.message_id,upload_id:options.uploadId||options.upload_id,download:options.download===true});
  }

  adminAction(action,options = {}) {
    const {serverId,server_id,requestId,request_id,...payload}=options;
    return this.callFunction('altara-bot-admin',{action,server_id:serverId||server_id,request_id:requestId||request_id||require('node:crypto').randomUUID(),payload:normalizePlatformOptions(payload)});
  }
  createRole(o){return this.adminAction('role_create',o);} updateRole(o){return this.adminAction('role_update',o);} deleteRole(o){return this.adminAction('role_delete',o);}
  addMemberRole(o){return this.adminAction('member_role_add',o);} removeMemberRole(o){return this.adminAction('member_role_remove',o);}
  kickMember(o){return this.adminAction('member_kick',o);} banMember(o){return this.adminAction('member_ban',o);} unbanMember(o){return this.adminAction('member_unban',o);}
  timeoutMember(o){return this.adminAction('member_timeout',o);} clearMemberTimeout(o){return this.adminAction('member_timeout_clear',o);}
  createChannel(o){return this.adminAction('channel_create',o);} updateChannel(o){return this.adminAction('channel_update',o);} deleteChannel(o){return this.adminAction('channel_delete',o);}
  updateServer(o){return this.adminAction('server_update',o);} deleteMemberMessage(o){return this.adminAction('message_delete',o);}
  createServerEvent(o){return this.adminAction('event_create',o);} updateServerEvent(o){return this.adminAction('event_update',o);} deleteServerEvent(o){return this.adminAction('event_delete',o);}

  listChannelPermissions(o){return this.adminAction('channel_permissions_list',o);}
  setChannelPermissions(o){return this.adminAction('channel_permissions_set',o);}
  deleteChannelPermissions(o){return this.adminAction('channel_permissions_delete',o);}
  updateServerProfile(o){return this.adminAction('server_profile_update',o);}
  readAuditLog(o){return this.adminAction('audit_log_list',o);}
  listServerEventAttendees(o){return this.adminAction('event_attendees_list',o);}
  createPoll(o){return this.surfaceAction('poll_create',o);} readPoll(o){return this.surfaceAction('poll_read',o);} closePoll(o){return this.surfaceAction('poll_close',o);}
  listAutoModRules(o){return this.surfaceAction('automod_list',o);} createAutoModRule(o){return this.surfaceAction('automod_create',o);}
  updateAutoModRule(o){return this.surfaceAction('automod_update',o);} deleteAutoModRule(o){return this.surfaceAction('automod_delete',o);}
  listExpressions(o){return this.surfaceAction('expression_list',o);} createExpression(o){return this.surfaceAction('expression_create',o);}
  updateExpression(o){return this.surfaceAction('expression_update',o);} deleteExpression(o){return this.surfaceAction('expression_delete',o);}
  getChannelMode(o){return this.surfaceAction('channel_mode_get',o);} setChannelMode(o){return this.surfaceAction('channel_mode_set',o);}
  createForumPost(o){return this.surfaceAction('forum_post_create',o);} listForumPosts(o){return this.surfaceAction('forum_post_list',o);}
  getStageState(o){return this.surfaceAction('stage_state',o);} setStageParticipant(o){return this.surfaceAction('stage_participant_set',o);}
  requestStageSpeak(o){return this.surfaceAction('stage_request',o);}
  getServerEventStatus(o){return this.surfaceAction('event_status_get',o);} updateServerEventStatus(o){return this.surfaceAction('event_status_update',o);}
  setServerEventResponse(o){return this.surfaceAction('event_rsvp',o);} listServerEventBots(o){return this.surfaceAction('event_bot_attendees',o);}
  async uploadExpression(options={}) {
    let file=options.file;
    if(options.filePath!==undefined){if(file!==undefined)throw Error('invalid_expression_image');const fs=require('node:fs/promises'),stat=await fs.stat(options.filePath);if(!stat.isFile()||!stat.size||stat.size>512*1024)throw Error('invalid_expression_image');file=await fs.readFile(options.filePath);}
    if(file instanceof Blob)file=new Uint8Array(await file.arrayBuffer());
    if(!(file instanceof Uint8Array)||file.byteLength<1||file.byteLength>512*1024)throw Error('invalid_expression_image');
    const mime=options.mime||'image/png',server=options.serverId||options.server_id,request=options.requestId||options.request_id||require('node:crypto').randomUUID(),kind=options.kind;
    if(!isEventUuid(server)||!isEventUuid(request)||!['emoji','sticker'].includes(kind)||!['image/png','image/jpeg','image/gif','image/webp'].includes(mime))throw Error('invalid_expression_image');
    return this.callFunction('altara-server-expression-media',file,{raw:true,contentType:mime,expression:{server,request,kind}});
  }

  surfaceAction(action,options={}) {
    const {serverId,server_id,requestId,request_id,...payload}=options;
    if (typeof action !== "string") throw Error("invalid_surface_action");
    if (typeof payload.toJSON === "function") throw Error("invalid_action_payload");
    const releaseAction=action.trim().toLowerCase();
    if (releaseAction === "channel_mode_set" && typeof payload.mode !== "string") throw Error("invalid_channel_mode");
    if (!STAGE_RELEASE_ENABLED && (releaseAction.startsWith("stage_") ||
        (releaseAction === "channel_mode_set" && payload.mode.trim().toLowerCase() === "stage"))) throw Error("stage_feature_disabled");
    const mentions=messageMentionOptions(payload);
    if(mentions.allowed_mentions !== undefined && (!mentions.allowed_mentions || Object.keys(mentions.allowed_mentions).length !== 1 || !Array.isArray(mentions.allowed_mentions.users) || mentions.allowed_mentions.users.length)) throw Error('mentions_not_supported_on_surface');
    delete payload.allowed_mentions;delete payload.allowedMentions;
    const normalized=normalizePlatformOptions(payload);
    const poll=['poll_create','poll_read','poll_close'].includes(releaseAction);
    const channel=poll?normalized.channel_id:undefined;
    if(poll)delete normalized.channel_id;
    return this.callFunction('altara-bot-surfaces',{action,server_id:serverId||server_id,request_id:requestId||request_id||require('node:crypto').randomUUID(),...(poll?{channel_id:channel}:{}),payload:normalized});
  }
  sendDirectMessage(o={}){
    const rich=o.attachments!==undefined||o.replyToId!==undefined||o.reply_to_id!==undefined;
    return this.surfaceAction(rich?'dm_message_send':'dm_send',rich?{content:'',...o}:o);
  }
  readDirectMessages(o){return this.surfaceAction('dm_history',o);}
  readDirectMessageHistory(o){return this.surfaceAction('dm_message_history',o);}
  editDirectMessage(o={}){return this.surfaceAction('dm_edit',o);}
  deleteDirectMessage(o){return this.surfaceAction('dm_delete',o);}
  setDirectMessageReaction(o){return this.surfaceAction('dm_reaction',o);}
  setDirectMessagePinned(o){return this.surfaceAction('dm_pin',o);}
  readDirectMessagePins(o){return this.surfaceAction('dm_message_pins',o);}
  createThread(o){return this.surfaceAction('thread_create',o);} listThreads(o){return this.surfaceAction('thread_list',o);}
  readThread(o){return this.surfaceAction('thread_history',o);} sendThreadMessage(o){return this.surfaceAction('thread_send',o);} archiveThread(o){return this.surfaceAction('thread_archive',o);}
  listWebhooks(o){return this.surfaceAction('webhook_list',o);} revokeWebhook(o){return this.surfaceAction('webhook_revoke',o);}
  async createWebhook(options={}) {
    const crypto=require('node:crypto'),secret=crypto.randomBytes(32).toString('hex');
    const result=await this.surfaceAction('webhook_create',{...options,token_hash:crypto.createHash('sha256').update(secret).digest('hex')});
    return {...result,token:`${result.webhook.id}:${secret}`,url:`${this.functionsUrl}/altara-bot-webhook`};
  }
  executeWebhook({token,content='',embeds=[],components=[]}) {
    if(!/^[0-9a-f-]{36}:[a-f0-9]{64}$/i.test(token||''))throw Error('invalid_webhook');
    return this.callFunction('altara-bot-webhook',{content,embeds,components},{authorization:`AltaraWebhook ${token}`});
  }

  async messageAction(action, options = {}) {
    return await this.callFunction("altara-bot-message-send", {
      action,
      interaction_event_id: String(options.eventId || options.event_id || options.interaction_event_id || ""),
      server_id: String(options.serverId || options.server_id || ""),
      channel_id: String(options.channelId || options.channel_id || ""),
      message_id: String(options.messageId || options.message_id || ""),
      content: String(options.content || "").slice(0, 2000),
      attachments: Array.isArray(options.attachments) ? options.attachments : [],
      ...(action === 'edit_message' && options.attachments === undefined ? {preserve_attachments:true} : {}),
      ...(options.embeds !== undefined ? { embeds: options.embeds } : {}),
      ...(options.components !== undefined ? { components: options.components } : {}),
      ...messageMentionOptions(options),
      emoji: String(options.emoji || ""),
      ...(action === 'set_reaction' ? {enabled:options.enabled} : {}),
      limit: Number(options.limit || 25),
    });
  }

  async voiceAction(action, options = {}) {
    return await this.callFunction("altara-bot-voice-token", {
      action,
      event_id: String(options.eventId || options.event_id || ""),
      ...(options.connectionId || options.connection_id ? {connection_id:String(options.connectionId || options.connection_id)} : {}),
      server_id: String(options.serverId || options.server_id || ""),
      channel_id: String(options.channelId || options.channel_id || options.voiceChannelId || options.voice_channel_id || ""),
      publish_audio: options.publishAudio !== false && options.publish_audio !== false,
      ...(action === "heartbeat" && options.status === undefined ? {} : {status: String(options.status || options.voiceStatus || options.voice_status || "").slice(0, 80)}),
    });
  }

  async callFunction(name, body, transport = {}) {
    const endpoint = `${this.functionsUrl}/${name}`;
    console.log(`[altara] POST ${endpoint}`);
    const controller = new AbortController();
    this.requests.add(controller);
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": transport.authorization || `Bot ${this.token}`,
          ...(transport.multipart ? {} : {"Content-Type": transport.raw ? transport.contentType : "application/json"}),
          ...(transport.expression ? {"x-altara-server-id":transport.expression.server,"x-altara-request-id":transport.expression.request,"x-altara-expression-kind":transport.expression.kind} : {}),
          "User-Agent": "ALTARA-Node-Bot-Example/0.1",
        },
        body: transport.multipart || transport.raw ? body : JSON.stringify(body || {}),
        signal: controller.signal,
        redirect: "error",
      });

      const text = await response.text();
      let data = {};
      if (text.trim()) {
        try {
          data = JSON.parse(text);
        } catch (_) {
          data = { error: "invalid_json_response", details: text.slice(0, 500) };
        }
      }

      if (!response.ok || data?.ok === false) {
        const error = new Error(String(data?.error || `HTTP ${response.status}`));
        error.status = response.status;
        error.details = data;
        error.retryAfterSeconds = Number(data?.retry_after_seconds || response.headers.get("retry-after") || 0);
        throw error;
      }
      if (!data || typeof data !== "object" || Array.isArray(data) || data.error === "invalid_json_response") {
        throw new Error("invalid_json_response");
      }
      return data;
    } finally {
      clearTimeout(timer);
      this.requests.delete(controller);
    }
  }
}

class AltaraEventContext {
  constructor(client, event) {
    this.client = client;
    this._eventGeneration = client.runId;
    this.event = event;
    this.id = event.id;
    this.leaseId = String(event.lease_id || '');
    this.type = event.type;
    this.serverId = String(event.server_id || "");
    this.channelId = String(event.channel_id || "");
    this.author = event.user || {};
    this.user = this.author;
    this.messageId = String(event.data?.message_id || "");
    this.content = typeof event.data?.content === "string" ? event.data.content : null;
    this.contentRedacted = event.data?.content_redacted !== false;
    this.joinedAt = event.data?.joined_at || null;
    this.threadId = String(event.data?.thread_id||'');
    this.data = event.data||{};
    if (typeof this.type === 'string' && DIRECT_MESSAGE_HANDLERS[this.type]) {
      this.actor = directMessageActor(event);
      this._directMessageScope = Object.freeze({serverId:this.serverId,userId:this.user.id,eventId:this.id,generation:client.runId});
    }
  }
  getServerSettings() { return this.client.getServerSettings(this._directMessageScope?.serverId || this.serverId); }
  async sendWelcome(content,channelId) {
    if (this._eventGeneration !== this.client.runId) throw Error('event_expired');
    if (this.type !== 'SERVER_MEMBER_ADD' || !isEventUuid(this.id) || !isEventUuid(this.leaseId) || !isEventUuid(this.serverId)) throw Error('invalid_welcome_event');
    if (!isEventUuid(channelId)) throw Error('invalid_welcome_channel');
    if (typeof content !== 'string' || !content.trim() || content.length > 2000) throw Error('invalid_welcome_content');
    const data = await this.client.callFunction('altara-bot-surfaces',{action:'settings_welcome',server_id:this.serverId,event_id:this.id,lease_id:this.leaseId,channel_id:channelId,content});
    if (data?.ok !== true || typeof data.sent !== 'boolean' || (data.message_id !== undefined && data.message_id !== null && !isEventUuid(data.message_id))) throw Error('invalid_welcome_response');
    return data;
  }
  async sendMessage(content, channelId = this.channelId, options = {}) {
    if(this._directMessageScope) {
      if(channelId)throw Error('private_event_channel_override');
      return this._sendDirectMessage(content,options);
    }
    if (this._eventGeneration !== this.client.runId) throw Error('event_expired');
    if(this.threadId && this.type.startsWith('THREAD_')) {
      if(channelId!==this.channelId)throw Error('thread_event_channel_override');
      const message=content && typeof content==='object'?content:{content};
      return this.client.sendThreadMessage({...options,...message,serverId:this.serverId,channelId:this.channelId,threadId:this.threadId,requestId:options.requestId||this.id});
    }
    if (!channelId) throw new Error("event_channel_required");
    const message = content && typeof content === "object" ? content : { content };
    return this.client.sendMessage({ ...options, ...message, serverId: this.serverId, channelId });
  }
  async reply(content, options = {}) {
    if (this._directMessageScope) return this._sendDirectMessage(content,options);
    if (this._eventGeneration !== this.client.runId) throw Error('event_expired');
    if(this.threadId && this.type.startsWith('THREAD_')) {
      const message=content && typeof content==='object'?content:{content};
      return this.client.sendThreadMessage({...options,...message,serverId:this.serverId,channelId:this.channelId,threadId:this.threadId,requestId:options.requestId||this.id});
    }
    return this.sendMessage(content, this.channelId, options);
  }
  _sendDirectMessage(content,options) {
    const scope = this._directMessageScope;
    if (scope.generation !== this.client.runId) throw Error('private_event_expired');
    if ([scope.serverId,scope.userId,scope.eventId].some(value => typeof value !== 'string' || !isEventUuid(value))) throw Error('invalid_dm_event');
    const message = {...options,...(content && typeof content === 'object'?content:{content})};
    if (message.channelId || message.channel_id) throw Error('private_event_channel_override');
    // Remove both alias spellings before adding authority. Object key order
    // must never let a later user_id alias replace the event's recipient.
    for (const key of ['serverId','server_id','userId','user_id','channelId','channel_id','requestId','request_id']) delete message[key];
    return this.client.sendDirectMessage({...message,serverId:scope.serverId,userId:scope.userId,requestId:options.requestId||scope.eventId});
  }
}

function normalizePlatformOptions(options) {
  const aliases={userId:'user_id',roleId:'role_id',channelId:'channel_id',eventId:'event_id',messageId:'message_id',replyToId:'reply_to_id',threadId:'thread_id',webhookId:'webhook_id',categoryId:'category_id',channelType:'channel_type',durationSeconds:'duration_seconds',startsAt:'starts_at',endsAt:'ends_at',targetType:'target_type',targetId:'target_id',iconUrl:'icon_url',bannerUrl:'banner_url',welcomeChannelId:'welcome_channel_id',durationHours:'duration_hours',multiSelect:'multi_select',maxChoices:'max_choices',ruleId:'rule_id',exemptChannelIds:'exempt_channel_ids',exemptRoleIds:'exempt_role_ids',assetId:'asset_id',expressionId:'expression_id',subjectKind:'subject_kind',subjectId:'subject_id'};
  return Object.fromEntries(Object.entries(options).map(([key,value])=>[aliases[key]||key,value]));
}
function isEventUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }
function directMessageActor(event) {
  const actor = event.data?.actor;
  if (actor === undefined || actor === null) return null;
  if (!actor || typeof actor !== 'object' || Array.isArray(actor) || !['user','bot'].includes(actor.type) || typeof actor.id !== 'string' || !isEventUuid(actor.id)) throw Error('invalid_dm_event');
  const expected = actor.type === 'user' ? event.user?.id : event.bot_id;
  if (typeof expected !== 'string' || !isEventUuid(expected) || actor.id.toLowerCase() !== expected.toLowerCase()) throw Error('invalid_dm_event');
  return Object.freeze({type:actor.type,id:actor.id});
}
function validateDirectMessageEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string' || !DIRECT_MESSAGE_HANDLERS[event.type]
    || !event.user || typeof event.user !== 'object' || Array.isArray(event.user)
    || (event.data !== undefined && event.data !== null && (typeof event.data !== 'object' || Array.isArray(event.data)))
    || [event.id,event.lease_id,event.server_id,event.user.id].some(value => typeof value !== 'string' || !isEventUuid(value))
    || (event.channel_id !== undefined && event.channel_id !== null && event.channel_id !== '')) throw Error('invalid_dm_event');
  if (event.type !== 'DIRECT_MESSAGE_CREATE' && (typeof event.data?.message_id !== 'string' || !isEventUuid(event.data.message_id) || event.id.toLowerCase() === event.data.message_id.toLowerCase())) throw Error('invalid_dm_event');
  directMessageActor(event);
}
function normalizeServerSettingsFeatures(features) {
  if (!Array.isArray(features) || features.some(feature => !['welcome_messages','dm_commands'].includes(feature))) throw Error('invalid_server_settings_features');
  return [...new Set(features)].sort();
}
function validateServerSettings(data,server) {
  const settings = data?.settings;
  let features;
  try { features = normalizeServerSettingsFeatures(data?.features); } catch { throw Error('invalid_server_settings_response'); }
  if (data?.ok !== true || data.server_id !== server || !isEventUuid(data.bot_id) || !isEventUuid(data.install_id) ||
      typeof data.configured !== 'boolean' || !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !Number.isSafeInteger(data.support_revision) || data.support_revision < 0 || !settings ||
      typeof settings.welcome_enabled !== 'boolean' || typeof settings.dm_commands_enabled !== 'boolean' ||
      !(settings.welcome_channel_id === null || isEventUuid(settings.welcome_channel_id)) ||
      (settings.welcome_enabled && (!settings.welcome_channel_id || !features.includes('welcome_messages'))) ||
      (settings.dm_commands_enabled && !features.includes('dm_commands'))) throw Error('invalid_server_settings_response');
  return data;
}
function normalizeEventIntents(values) {
  if (!Array.isArray(values) || values.some(value => !["messages", "members", "message_content", "reactions", "voice_states", "direct_messages", "presence"].includes(value))) throw new Error("invalid_event_intents");
  const intents = [...new Set(values)];
  if (intents.includes("message_content") && !intents.includes("messages")) throw new Error("message_content_requires_messages");
  return Object.freeze(intents);
}

class AltaraCommandContext {
  constructor(client, event) {
    this.client = client;
    this.event = event;
    this.id = String(event?.id || "");
    this.commandType = normalizeCommandType(event?.data?.type === undefined ? 'CHAT_INPUT' : event.data.type);
    this.commandName = normalizeCommandName(event?.data?.name,this.commandType);
    this.options = Array.isArray(event?.data?.options) ? event.data.options : [];
    const selected = resolveSelectedCommandPath(this.options);
    this.subcommandGroup = selected.subcommandGroup;
    this.subcommand = selected.subcommand;
    this._selectedOptions = selected.options;
    this.resolved = event?.data?.resolved && typeof event.data.resolved === 'object' && !Array.isArray(event.data.resolved) ? event.data.resolved : {};
    this.targetId = String(event?.data?.target_id || '');
    this.targetUser = this.commandType === 'USER' && Object.hasOwn(this.resolved.users || {},this.targetId) ? this.resolved.users[this.targetId] : null;
    this.targetMessage = this.commandType === 'MESSAGE' && Object.hasOwn(this.resolved.messages || {},this.targetId) ? this.resolved.messages[this.targetId] : null;
    this.user = event?.user || {};
    this.serverId = String(event?.server_id || "");
    this.channelId = String(event?.channel_id || "");
    this.replied = false;
    this.privateResponseAttempted = false;
  }

  getServerSettings() { return this.client.getServerSettings(this.serverId); }

  option(name) {
    const key = normalizeCommandName(name);
    const found = this._selectedOptions.find((option) => normalizeCommandName(option?.name) === key);
    if (!found) return "";
    return String(found.value ?? "").trim();
  }

  async reply(content, options = {}) {
    const message = content && typeof content === "object" ? { ...options, ...content } : { ...options, content };
    // Privacy intent survives validation/transport failure without claiming acceptance.
    if (message.ephemeral !== undefined && message.ephemeral !== false) this.privateResponseAttempted = true;
    const result = await this.client.reply(this.id, content, options);
    this.replied = true;
    return result;
  }

  async showModal(modal) {
    this.privateResponseAttempted = true;
    const result = await this.client.showModal(this.id, modal);
    this.replied = true;
    return result;
  }

  async sendMessage(content, options = {}) {
    const message = content && typeof content === "object" ? content : { content };
    return await this.client.sendMessage({
      ...options,
      ...message,
      serverId: this.serverId,
      channelId: this.channelId,
    });
  }

  async readMessageHistory(options = {}) {
    return await this.client.readMessageHistory({
      ...options,
      serverId: this.serverId,
      channelId: this.channelId,
    });
  }

  async addReaction(messageId, emoji) {
    return await this.client.addReaction({
      serverId: this.serverId,
      channelId: this.channelId,
      messageId,
      emoji,
    });
  }
  async removeReaction(messageId, emoji) {
    return await this.client.removeReaction({serverId:this.serverId,channelId:this.channelId,messageId,emoji});
  }
  async setReaction(messageId, emoji, enabled) {
    return await this.client.setReaction({serverId:this.serverId,channelId:this.channelId,messageId,emoji,enabled});
  }

  async pinMessage(messageId) {
    return await this.client.pinMessage({ serverId: this.serverId, channelId: this.channelId, messageId });
  }

  async unpinMessage(messageId) {
    return await this.client.unpinMessage({ serverId: this.serverId, channelId: this.channelId, messageId });
  }

  async deleteMessage(messageId) {
    return await this.client.deleteMessage({ serverId: this.serverId, channelId: this.channelId, messageId });
  }

  async editMessage(messageId, content, options = {}) {
    const message = content && typeof content === "object" ? content : { content };
    return await this.client.editMessage({
      ...options,
      ...message,
      serverId: this.serverId,
      channelId: this.channelId,
      messageId,
    });
  }

  uploadAttachment(options = {}) {return this.client.uploadAttachment({...options,serverId:this.serverId,channelId:options.channelId||this.channelId});}
  captureVoice(options = {}) {return this.client.captureVoice({...options,eventId:this.id,serverId:this.serverId,channelId:options.channelId||options.channel_id||options.voiceChannelId||options.voice_channel_id||''});}
  adminAction(action, options = {}) {return this.client.adminAction(action,{...options,serverId:this.serverId});}
  surfaceAction(action, options = {}) {return this.client.surfaceAction(action,{...options,serverId:this.serverId,channelId:options.channelId||this.channelId});}

  async joinVoice(options = {}) {
    return await this.client.joinVoice({
      ...options,
      eventId: this.id,
      serverId: this.serverId,
      channelId: options.channelId || options.channel_id || options.voiceChannelId || options.voice_channel_id || "",
    });
  }

  async leaveVoice(options = {}) {
    return await this.client.leaveVoice({
      ...options,
      eventId: this.id,
      serverId: this.serverId,
      channelId: options.channelId || options.channel_id || options.voiceChannelId || options.voice_channel_id || "",
    });
  }

  async setVoiceStatus(status, options = {}) {
    return await this.client.setVoiceStatus({
      ...options,
      eventId: this.id,
      serverId: this.serverId,
      channelId: options.channelId || options.channel_id || options.voiceChannelId || options.voice_channel_id || "",
      status,
    });
  }

  async getVoiceState(options = {}) {
    return await this.client.getVoiceState({
      ...options,
      eventId: this.id,
      serverId: this.serverId,
      channelId: options.channelId || options.channel_id || options.voiceChannelId || options.voice_channel_id || "",
    });
  }
}

class AltaraAutocompleteContext extends AltaraCommandContext {
  constructor(client,event) {
    super(client,event);
    this.focused = resolveSelectedCommandPath(this.options).focused;
    if (this.commandType !== 'CHAT_INPUT' || !this.focused || !CHOICE_TYPES.has(this.focused.type)) throw Error('invalid_autocomplete_event');
    this.responseAttempted = false;
    this._eventGeneration = client.runId;
  }
  async respond(choices) {
    if (this._eventGeneration !== this.client.runId) throw Error('event_expired');
    if (this.replied || this.responseAttempted) throw Error('autocomplete_already_responded');
    const normalized = normalizeCommandChoices(choices,this.focused.type);
    this.responseAttempted = true;
    const result = await this.client.callFunction('altara-bot-respond',{event_id:this.id,type:'APPLICATION_COMMAND_AUTOCOMPLETE_RESULT',data:{choices:normalized}});
    this.replied = true;
    return result;
  }
  async reply() { throw Error('autocomplete_requires_choices'); }
  async showModal() { throw Error('autocomplete_requires_choices'); }
}

// BEGIN portable command schema (fixture-checked against backend).
// Portable registration schema shared by the backend and command UI. SDK copies
// are checked against the same fixtures so downloaded clients stay standalone.
const COMMAND_TYPES = Object.freeze({1:'CHAT_INPUT',2:'USER',3:'MESSAGE'});
const OPTION_TYPES = Object.freeze({1:'SUB_COMMAND',2:'SUB_COMMAND_GROUP',3:'STRING',4:'INTEGER',5:'BOOLEAN',6:'USER',7:'CHANNEL',8:'ROLE',9:'MENTIONABLE',10:'NUMBER',11:'ATTACHMENT'});
const CHOICE_TYPES = new Set(['STRING','INTEGER','NUMBER']);
const BRANCH_TYPES = new Set(['SUB_COMMAND','SUB_COMMAND_GROUP']);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit) => String(value ?? '').replace(/\s+/g,' ').trim().slice(0,limit);
function allowedKeys(value, keys, error) { if (Object.keys(value).some(key => !keys.includes(key))) throw Error(error); }

function normalizeCommandType(value = 'CHAT_INPUT') {
  const type = typeof value === 'number' ? COMMAND_TYPES[value] : String(value).trim().toUpperCase();
  if (!['CHAT_INPUT','USER','MESSAGE'].includes(type)) throw Error('invalid_command_type');
  return type;
}
function normalizeCommandName(value, type = 'CHAT_INPUT') {
  type = normalizeCommandType(type);
  const raw = String(value ?? '').trim();
  if (type !== 'CHAT_INPUT') return raw && [...raw].length <= 32 && !/[\u0000-\u001f\u007f]/u.test(raw) ? raw : '';
  const slash = raw.toLowerCase().replace(/^\//,'');
  return /^[a-z0-9_-]{1,32}$/.test(slash) ? slash : '';
}
function commandKey(name, type = 'CHAT_INPUT') {
  type = normalizeCommandType(type);
  const normalized = normalizeCommandName(name,type);
  if (!normalized) throw Error('invalid_command_name');
  return type === 'CHAT_INPUT' ? normalized : `${type}:${normalized.toLowerCase()}`;
}
function normalizeCommandOptionType(value = 'STRING') {
  const type = typeof value === 'number' ? OPTION_TYPES[value] : String(value).trim().toUpperCase();
  if (!Object.values(OPTION_TYPES).includes(type)) throw Error('invalid_command_option_type');
  return type;
}
function normalizeCommandChoices(value, optionType = 'STRING') {
  const type = normalizeCommandOptionType(optionType);
  if (!CHOICE_TYPES.has(type) || !Array.isArray(value) || value.length > 25) throw Error('invalid_command_choices');
  return value.map(choice => {
    if (!record(choice)) throw Error('invalid_command_choice');
    allowedKeys(choice,['name','label','value'],'unsupported_command_choice_field');
    const name = text(choice.name ?? choice.label ?? choice.value,80);
    const selected = choice.value ?? choice.name;
    if (!name) throw Error('invalid_command_choice_name');
    if (type === 'STRING') {
      if (typeof selected !== 'string' || !selected.length || [...selected].length > 100) throw Error('invalid_command_choice_value');
    } else if (typeof selected !== 'number' || !Number.isFinite(selected) || Math.abs(selected) > Number.MAX_SAFE_INTEGER || (type === 'INTEGER' && !Number.isSafeInteger(selected))) throw Error('invalid_command_choice_value');
    return {name,value:selected};
  });
}
function normalizeCommandOptions(value = [], parentType = '', depth = 0) {
  if (value == null) value = [];
  if (!Array.isArray(value) || value.length > 25 || depth > 2) throw Error('invalid_command_options');
  const seen = new Set(); let mode = '', optionalSeen = false;
  return value.map((item,index) => {
    if (!record(item)) throw Error(`invalid_command_option_${index+1}`);
    allowedKeys(item,['name','description','type','option_type','required','choices','options','autocomplete','min_value','max_value','min_length','max_length','channel_types'],'unsupported_command_option_field');
    const name = normalizeCommandName(item.name);
    if (!name || seen.has(name)) throw Error('invalid_or_duplicate_command_option_name');
    seen.add(name);
    if (item.type !== undefined && item.option_type !== undefined && normalizeCommandOptionType(item.type) !== normalizeCommandOptionType(item.option_type)) throw Error('conflicting_command_option_type');
    const type = normalizeCommandOptionType(item.type !== undefined ? item.type : item.option_type !== undefined ? item.option_type : 'STRING');
    const branch = BRANCH_TYPES.has(type), nextMode = branch ? 'branch' : 'leaf';
    if (mode && mode !== nextMode) throw Error('mixed_command_option_types');
    mode = nextMode;
    if ((parentType === 'SUB_COMMAND_GROUP' && type !== 'SUB_COMMAND') || (parentType === 'SUB_COMMAND' && branch) || (type === 'SUB_COMMAND_GROUP' && depth !== 0)) throw Error('invalid_subcommand_nesting');
    const option = {name,description:text(item.description || `${name} option`,120),type};
    if (branch) {
      if (Object.keys(item).some(key => !['name','description','type','option_type','options'].includes(key))) throw Error('invalid_subcommand_field');
      option.options = normalizeCommandOptions(item.options,type,depth+1);
      if (type === 'SUB_COMMAND_GROUP' && !option.options.length) throw Error('empty_subcommand_group');
      return option;
    }
    if (item.options !== undefined) throw Error('invalid_leaf_options');
    if (item.required !== undefined && typeof item.required !== 'boolean') throw Error('invalid_command_option_required');
    option.required = item.required === true;
    if (option.required && optionalSeen) throw Error('required_options_must_come_first');
    optionalSeen ||= !option.required;
    if (item.autocomplete !== undefined) {
      if (typeof item.autocomplete !== 'boolean' || !CHOICE_TYPES.has(type)) throw Error('invalid_command_autocomplete');
      option.autocomplete = item.autocomplete;
    }
    if (item.choices !== undefined) {
      const choices = normalizeCommandChoices(item.choices,type);
      if (item.autocomplete === true && choices.length) throw Error('choices_and_autocomplete_conflict');
      if (choices.length) option.choices = choices;
    }
    for (const key of ['min_value','max_value']) if (item[key] !== undefined) {
      const bound = item[key];
      if (!['INTEGER','NUMBER'].includes(type) || typeof bound !== 'number' || !Number.isFinite(bound) || Math.abs(bound) > Number.MAX_SAFE_INTEGER || (type === 'INTEGER' && !Number.isSafeInteger(bound))) throw Error('invalid_command_value_bound');
      option[key] = bound;
    }
    if (option.min_value !== undefined && option.max_value !== undefined && option.min_value > option.max_value) throw Error('invalid_command_value_bounds');
    for (const key of ['min_length','max_length']) if (item[key] !== undefined) {
      if (type !== 'STRING' || !Number.isInteger(item[key]) || item[key] < 0 || item[key] > 6000) throw Error('invalid_command_length_bound');
      option[key] = item[key];
    }
    if (option.min_length !== undefined && option.max_length !== undefined && option.min_length > option.max_length) throw Error('invalid_command_length_bounds');
    if (item.channel_types !== undefined) {
      if (type !== 'CHANNEL' || !Array.isArray(item.channel_types) || !item.channel_types.length || item.channel_types.some(kind => ![0,2].includes(kind)) || new Set(item.channel_types).size !== item.channel_types.length) throw Error('invalid_command_channel_types');
      option.channel_types = [...item.channel_types];
    }
    return option;
  });
}
function normalizeCommandDefinition(name, metadata = {}) {
  if (!record(metadata)) throw Error('invalid_command_metadata');
  allowedKeys(metadata,['name','type','description','options'],'unsupported_command_field');
  const type = normalizeCommandType(metadata.type === undefined ? 'CHAT_INPUT' : metadata.type);
  name = normalizeCommandName(name,type);
  if (!name) throw Error('invalid_command_name');
  if (type !== 'CHAT_INPUT') {
    if ((metadata.description !== undefined && metadata.description !== '') || (metadata.options !== undefined && (!Array.isArray(metadata.options) || metadata.options.length))) throw Error('invalid_context_command_fields');
    return {type,name,description:'',options:[]};
  }
  return {type,name,description:text(metadata.description || `Runs /${name}`,120),options:normalizeCommandOptions(metadata.options)};
}
function normalizeCommands(value) {
  if (!Array.isArray(value) || value.length > 100) throw Error('commands_array_required');
  const seen = new Set();
  return value.map(item => {
    if (!record(item)) throw Error('invalid_command');
    const command = normalizeCommandDefinition(item.name,item), key = commandKey(command.name,command.type);
    if (seen.has(key)) throw Error('duplicate_command');
    seen.add(key); return command;
  });
}
function resolveSelectedCommandPath(value = []) {
  if (!Array.isArray(value) || value.length > 25) throw Error('invalid_command_invocation_options');
  let options = value, subcommandGroup = '', subcommand = '';
  for (let depth=0; depth<3; depth++) {
    if (!Array.isArray(options) || options.length > 25) throw Error('invalid_command_invocation_options');
    const branches = options.filter(item => record(item) && BRANCH_TYPES.has(normalizeCommandOptionType(item.type === undefined ? 'STRING' : item.type)));
    if (!branches.length) break;
    if (options.length !== 1 || !record(branches[0]) || !normalizeCommandName(branches[0].name)) throw Error('invalid_command_invocation_path');
    const branch = branches[0], type = normalizeCommandOptionType(branch.type);
    if (type === 'SUB_COMMAND_GROUP') {
      if (depth !== 0) throw Error('invalid_command_invocation_path');
      subcommandGroup = normalizeCommandName(branch.name);
    } else {
      if (subcommand || (depth && !subcommandGroup)) throw Error('invalid_command_invocation_path');
      subcommand = normalizeCommandName(branch.name);
    }
    options = branch.options ?? [];
  }
  if (subcommandGroup && !subcommand) throw Error('invalid_command_invocation_path');
  const seen = new Set(); let focused = null;
  for (const item of options) {
    if (!record(item) || !normalizeCommandName(item.name) || item.options !== undefined || BRANCH_TYPES.has(normalizeCommandOptionType(item.type === undefined ? 'STRING' : item.type)) || seen.has(normalizeCommandName(item.name))) throw Error('invalid_command_invocation_options');
    seen.add(normalizeCommandName(item.name));
    if (item.focused !== undefined && typeof item.focused !== 'boolean') throw Error('invalid_autocomplete_focus');
    if (item.focused === true) {
      if (focused) throw Error('invalid_autocomplete_focus');
      focused = {name:normalizeCommandName(item.name),type:normalizeCommandOptionType(item.type === undefined ? 'STRING' : item.type),value:item.value ?? ''};
    }
  }
  return {subcommandGroup,subcommand,options,focused};
}
// END portable command schema

function normalizeFunctionsUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  return raw || DEFAULT_FUNCTIONS_URL;
}

function getBotTokenPrefix(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^altara_bot_([a-f0-9]{32})_/);
  return match ? `altara_bot_${match[1]}` : "";
}

function finiteOption(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.max(number, min), max) : fallback;
}

function isTerminalConnectionError(error) {
  return error?.status === 401 || ["bot_not_active", "bot_token_revoked", "no_matching_bot_token"].includes(error?.details?.error);
}

function combinePollErrors(errors) {
  if (errors.length === 1) return errors[0];
  const originals = errors.flatMap(error => internalPollErrors.has(error) && Array.isArray(error.errors) ? error.errors : [error]);
  const combined = new AggregateError(originals, "bot_event_feeds_failed");
  // Preserve foreign transport aggregates; only unfold aggregates produced here.
  internalPollErrors.add(combined);
  const sources = [...errors, ...originals];
  if (sources.some(isTerminalConnectionError)) combined.status = 401;
  const hints = sources.map(error => Number(error?.retryAfterSeconds)).filter(hint => Number.isFinite(hint) && hint > 0);
  if (hints.length) combined.retryAfterSeconds = Math.max(...hints);
  return combined;
}

function retryDelay(error, failures, interval) {
  const retryAfter = Number(error?.retryAfterSeconds);
  const backoff = Math.min(interval * (2 ** Math.min(failures, 5)), 30000);
  return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.max(backoff, Math.min(retryAfter * 1000, 300000)) : backoff;
}

function validatePrivateReply(message) {
  if (message.ephemeral !== undefined && typeof message.ephemeral !== "boolean") throw Error("invalid_ephemeral");
  if (message.ephemeral === true && ((message.attachments !== undefined && (!Array.isArray(message.attachments) || message.attachments.length))
    || message.components !== undefined || message.allowed_mentions !== undefined || message.allowedMentions !== undefined)) throw Error("private_response_unsupported");
}

class AltaraComponentContext extends AltaraCommandContext {
  constructor(client, event) {
    super(client, event);
    this._eventGeneration = client.runId;
    this.customId = String(event?.data?.custom_id || "");
    this.values = Array.isArray(event?.data?.values) ? event.data.values : [];
    this.fields = event?.data?.fields || {};
    this.messageId = String(event?.message_id || "");
    this.slashEventId = String(event?.slash_event_id || "");
    this.type = event.type;
    this.leaseId = event.lease_id;
    this.sourceKind = event.source_kind || '';
    if (this.sourceKind && !['dm','thread'].includes(this.sourceKind)) throw Error('invalid_component_source');
    this.sourceMessageId = String(event.source_message_id || '');
    this.originServerId = String(event.origin_server_id || '');
    this.directMessageId = String(event.direct_message_id || '');
    this.recipientUserId = String(event.user_id || '');
    this.threadId = String(event.thread_id || '');
    this.parentChannelId = String(event.parent_channel_id || '');
    if (this.sourceKind === 'dm' && (this.serverId || this.channelId || ![this.sourceMessageId,this.originServerId,this.recipientUserId,this.directMessageId].every(isEventUuid))) throw Error('invalid_component_source');
    if (this.sourceKind === 'thread' && (this.channelId || ![this.sourceMessageId,this.serverId,this.threadId,this.parentChannelId].every(isEventUuid))) throw Error('invalid_component_source');
  }
  isButton() { return this.type === "MESSAGE_COMPONENT" && this.event.data?.component_type === 2; }
  isStringSelectMenu() { return this.type === "MESSAGE_COMPONENT" && this.event.data?.component_type === 3; }
  isUserSelectMenu() { return this.type === 'MESSAGE_COMPONENT' && this.event.data?.component_type === 5; }
  isRoleSelectMenu() { return this.type === 'MESSAGE_COMPONENT' && this.event.data?.component_type === 6; }
  isMentionableSelectMenu() { return this.type === 'MESSAGE_COMPONENT' && this.event.data?.component_type === 7; }
  isChannelSelectMenu() { return this.type === 'MESSAGE_COMPONENT' && this.event.data?.component_type === 8; }
  isModalSubmit() { return this.type === "MODAL_SUBMIT"; }
  async respond(response) {
    if (this._eventGeneration !== this.client.runId) throw Error('event_expired');
    const result = await this.client.callFunction("altara-bot-components", { action: "respond", event_id: this.id, lease_id: this.leaseId, response, ...(this.sourceKind ? {source_kind:this.sourceKind} : {}) });
    this.replied = true;
    return result;
  }
  reply(content, options = {}) {
    const message = { ...options, ...(content && typeof content === "object" ? content : { content: String(content || "") }) };
    if (message.ephemeral !== undefined && message.ephemeral !== false) this.privateResponseAttempted = true;
    validatePrivateReply(message);
    if (message.ephemeral === true) {
      // Public guild clicks and their form submissions have their own leased
      // event. Never borrow the original slash actor or route to a public send.
      const ownGuildEvent = !this.sourceKind && ["MESSAGE_COMPONENT", "MODAL_SUBMIT"].includes(this.type)
        && [this.id, this.leaseId, this.messageId, this.serverId, this.channelId].every(isEventUuid);
      if (!this.slashEventId && !ownGuildEvent) throw Error("private_response_unsupported");
      if (Object.keys(message).some(key => !["content", "embeds", "ephemeral", "attachments"].includes(key))) throw Error("invalid_private_response");
      return this.respond({ action: "reply", content: String(message.content || ""),
        ...(message.embeds !== undefined ? { embeds: message.embeds } : {}), ephemeral: true });
    }
    // The legacy public responder accepts no privacy key, even explicit false.
    const { ephemeral, ...publicMessage } = message;
    return this.respond({ ...publicMessage, action: "reply" });
  }
  update(content, options = {}) { return this.respond({ ...options, ...(content && typeof content === "object" ? content : { content: String(content || "") }), action: "update" }); }
  showModal(modal) { return this.respond({action:"modal",modal}); }
  acknowledge() { return this.respond({action:"ack"}); }
  sendMessage(content, options = {}) {
    const payload = content && typeof content === 'object' ? {...options,...content} : {...options,content};
    if (this.sourceKind === 'dm') return this.client.sendDirectMessage({...payload,serverId:this.originServerId,userId:this.recipientUserId});
    if (this.sourceKind === 'thread') return this.client.sendThreadMessage({...payload,serverId:this.serverId,threadId:this.threadId});
    return super.sendMessage(content,options);
  }
  readMessageHistory(options = {}) {
    if (this.sourceKind === 'dm') return this.client.readDirectMessageHistory({...options,serverId:this.originServerId,userId:this.recipientUserId});
    if (this.sourceKind === 'thread') return this.client.readThread({...options,serverId:this.serverId,threadId:this.threadId});
    return super.readMessageHistory(options);
  }
  uploadAttachment(options = {}) {
    if (this.sourceKind === 'dm') return this.client.uploadDirectMessageAttachment({...options,serverId:this.originServerId,userId:this.recipientUserId});
    if (this.sourceKind === 'thread') return this.client.uploadAttachment({...options,serverId:this.serverId,channelId:this.parentChannelId});
    return super.uploadAttachment(options);
  }
}

module.exports = {
  AltaraClient,
};
