const DEFAULT_FUNCTIONS_URL = "https://tbbgwjmmaiclkhssimhf.supabase.co/functions/v1";

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
  }

  command(name, metadata, handler) {
    const key = normalizeCommandName(name);
    if (!key) throw new Error("invalid_command_name");
    const commandHandler = typeof metadata === "function" ? metadata : handler;
    const commandMetadata = typeof metadata === "function" ? {} : (metadata || {});
    if (typeof commandHandler !== "function") throw new Error("command_handler_required");
    const definition = normalizeCommandDefinition(key, commandMetadata);
    this.handlers.set(key, commandHandler);
    this.commandDefinitions.set(key, definition);
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
    const list = this.listeners.get(String(event || "").trim()) || [];
    for (const handler of list) {
      try {
        handler(payload);
      } catch (_) {}
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

  async pollOnce(runId) {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const data = await this.callFunction("altara-bot-poll-events", { limit: this.batchSize });
      if (runId !== undefined && !this.isCurrentRun(runId)) return;
      const events = Array.isArray(data.events) ? data.events : [];
      for (const event of events) {
        if (runId !== undefined && !this.isCurrentRun(runId)) break;
        try { await this.handleEvent(event); } catch (error) { this.emit("error", error); }
      }
      if (this.intents.length && (runId === undefined || this.isCurrentRun(runId))) await this.pollDomainEvents(runId);
      if ((this.listeners.has("interactionCreate")) && (runId === undefined || this.isCurrentRun(runId))) await this.pollComponentEvents(runId);
    } finally {
      this.inFlight = false;
    }
  }

  async handleEvent(event) {
    if (event?.type && event.type !== "APPLICATION_COMMAND") return;
    const name = normalizeCommandName(event?.data?.name);
    const handler = this.handlers.get(name);
    const ctx = new AltaraCommandContext(this, event);
    if (!handler) {
      await ctx.reply(`Unknown command: /${name || "unknown"}`);
      return;
    }
    try {
      await handler(ctx);
    } catch (error) {
      this.emit("error", error);
      try {
        if (!ctx.replied) await ctx.reply("Command failed.");
      } catch (replyError) {
        this.emit("error", replyError);
      }
    }
  }

  async pollDomainEvents(runId) {
    if (this.domainInFlight || !this.intents.length) return;
    this.domainInFlight = true;
    try {
      const acknowledgements = Array.from(this.eventAcks.values()).slice(0, 100);
      const data = await this.callFunction("altara-bot-events", { intents: [...this.intents], limit: this.batchSize, acknowledgements });
      if (runId !== undefined && !this.isCurrentRun(runId)) return;
      if (data.ok !== true || !Array.isArray(data.events)) throw new Error("invalid_domain_event_response");
      for (const ack of acknowledgements) if (this.eventAcks.get(ack.id)?.lease_id === ack.lease_id) this.eventAcks.delete(ack.id);
      const dropped = Number(data.dropped_events || 0);
      if (dropped > this.droppedEvents) this.emit("eventOverflow", { droppedEvents: dropped });
      this.droppedEvents = dropped;
      for (const event of data.events) {
        if (runId !== undefined && !this.isCurrentRun(runId)) break;
        const name = ({__proto__:null,MESSAGE_CREATE:'messageCreate',MESSAGE_UPDATE:'messageUpdate',MESSAGE_DELETE:'messageDelete',SERVER_MEMBER_ADD:'serverMemberAdd',SERVER_MEMBER_REMOVE:'serverMemberRemove',SERVER_MEMBER_UPDATE:'serverMemberUpdate',MESSAGE_REACTION_ADD:'reactionAdd',MESSAGE_REACTION_REMOVE:'reactionRemove',VOICE_STATE_UPDATE:'voiceStateUpdate',PRESENCE_UPDATE:'presenceUpdate',THREAD_CREATE:'threadCreate',THREAD_UPDATE:'threadUpdate',THREAD_MESSAGE_CREATE:'threadMessageCreate'})[event?.type] || '';
        if (!name || !isEventUuid(event.id) || !isEventUuid(event.lease_id)) throw new Error("invalid_domain_event");
        const now = Date.now();
        for (const [id, at] of this.completedEvents) if (now - at > 600000) this.completedEvents.delete(id);
        try {
          if (!this.completedEvents.has(event.id)) {
            const context = new AltaraEventContext(this, event);
            for (const handler of this.listeners.get(name) || []) await handler(context);
            this.completedEvents.set(event.id, now);
            while (this.completedEvents.size > 1000) this.completedEvents.delete(this.completedEvents.keys().next().value);
          }
          this.eventAcks.set(event.id, { id: event.id, lease_id: event.lease_id });
        } catch (error) { this.emit("error", error); }
      }
      if (this.intents.includes('direct_messages')) await this.pollDirectMessages(runId);
    } finally { this.domainInFlight = false; }
  }

  async pollDirectMessages(runId) {
    if (this.dmInFlight || !this.intents.includes('direct_messages')) return;
    this.dmInFlight = true;
    try {
      const acknowledgements = [...this.dmAcks.values()].slice(0,100);
      const data = await this.callFunction('altara-bot-surfaces',{action:'dm_poll',limit:this.batchSize,acknowledgements});
      if (runId !== undefined && !this.isCurrentRun(runId)) return;
      if (data.ok !== true || !Array.isArray(data.events)) throw Error('invalid_dm_event_response');
      for (const ack of acknowledgements) if(this.dmAcks.get(ack.id)?.lease_id===ack.lease_id)this.dmAcks.delete(ack.id);
      for (const event of data.events) {
        if (runId !== undefined && !this.isCurrentRun(runId)) break;
        if(event.type!=='DIRECT_MESSAGE_CREATE'||!isEventUuid(event.id)||!isEventUuid(event.lease_id))throw Error('invalid_dm_event');
        try {
          if(!this.completedEvents.has(event.id)) {
            for(const handler of this.listeners.get('directMessageCreate')||[])await handler(new AltaraEventContext(this,event));
            this.completedEvents.set(event.id,Date.now());
            while(this.completedEvents.size>1000)this.completedEvents.delete(this.completedEvents.keys().next().value);
          }
          this.dmAcks.set(event.id,{id:event.id,lease_id:event.lease_id});
        } catch(error) {this.emit('error',error);}
      }
    } finally {this.dmInFlight=false;}
  }

  async reply(eventId, content, options = {}) {
    const message = content && typeof content === "object" ? { ...options, ...content } : { ...options, content };
    return await this.callFunction("altara-bot-respond", {
      event_id: eventId,
      type: "CHANNEL_MESSAGE_WITH_SOURCE",
      data: {
        content: String(message.content || "").slice(0, 2000),
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        ...(message.embeds !== undefined ? { embeds: message.embeds } : {}),
        ...(message.components !== undefined ? { components: message.components } : {}),
        ...messageMentionOptions(message),
      },
    });
  }

  async sendMessage(options = {}) {
    return await this.messageAction("send_message", options);
  }

  async pollComponentEvents(runId) {
    const data = await this.callFunction("altara-bot-components", { action: "poll", limit: this.batchSize });
    if (runId !== undefined && !this.isCurrentRun(runId)) return;
    if (data.ok !== true || !Array.isArray(data.events)) throw new Error("invalid_component_event_response");
    for (const event of data.events) {
      if (runId !== undefined && !this.isCurrentRun(runId)) break;
      if (!isEventUuid(event.id) || !isEventUuid(event.lease_id) || !["MESSAGE_COMPONENT", "MODAL_SUBMIT"].includes(event.type)) throw new Error("invalid_component_event");
      const ctx = new AltaraComponentContext(this, event);
      try {
        for (const handler of this.listeners.get("interactionCreate") || []) await handler(ctx);
        if (!ctx.replied) await ctx.acknowledge();
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

  surfaceAction(action,options={}) {
    const {serverId,server_id,requestId,request_id,...payload}=options;
    const mentions=messageMentionOptions(payload);
    if(mentions.allowed_mentions !== undefined && (!mentions.allowed_mentions || Object.keys(mentions.allowed_mentions).length !== 1 || !Array.isArray(mentions.allowed_mentions.users) || mentions.allowed_mentions.users.length)) throw Error('mentions_not_supported_on_surface');
    delete payload.allowed_mentions;delete payload.allowedMentions;
    return this.callFunction('altara-bot-surfaces',{action,server_id:serverId||server_id,request_id:requestId||request_id||require('node:crypto').randomUUID(),payload:normalizePlatformOptions(payload)});
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
          ...(transport.multipart ? {} : {"Content-Type": "application/json"}),
          "User-Agent": "ALTARA-Node-Bot-Example/0.1",
        },
        body: transport.multipart ? body : JSON.stringify(body || {}),
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
    this.event = event;
    this.id = event.id;
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
  }
  async sendMessage(content, channelId = this.channelId, options = {}) {
    if(this.type==='DIRECT_MESSAGE_CREATE') {
      if(channelId)throw Error('private_event_channel_override');
      const message=content && typeof content==='object'?content:{content};
      return this.client.sendDirectMessage({...options,...message,serverId:this.serverId,userId:this.user.id,requestId:options.requestId||this.id});
    }
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
    if(this.threadId && this.type.startsWith('THREAD_')) {
      const message=content && typeof content==='object'?content:{content};
      return this.client.sendThreadMessage({...options,...message,serverId:this.serverId,channelId:this.channelId,threadId:this.threadId,requestId:options.requestId||this.id});
    }
    if (this.type === 'DIRECT_MESSAGE_CREATE') {
      const message = content && typeof content === 'object' ? content : {content};
      return this.client.sendDirectMessage({...options,...message,serverId:this.serverId,userId:this.user.id,requestId:options.requestId||this.id});
    }
    return this.sendMessage(content, this.channelId, options);
  }
}

function normalizePlatformOptions(options) {
  const aliases={userId:'user_id',roleId:'role_id',channelId:'channel_id',eventId:'event_id',messageId:'message_id',replyToId:'reply_to_id',threadId:'thread_id',webhookId:'webhook_id',categoryId:'category_id',channelType:'channel_type',durationSeconds:'duration_seconds',startsAt:'starts_at',endsAt:'ends_at'};
  return Object.fromEntries(Object.entries(options).map(([key,value])=>[aliases[key]||key,value]));
}
function isEventUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }
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
    this.commandName = normalizeCommandName(event?.data?.name);
    this.options = Array.isArray(event?.data?.options) ? event.data.options : [];
    this.user = event?.user || {};
    this.serverId = String(event?.server_id || "");
    this.channelId = String(event?.channel_id || "");
    this.replied = false;
  }

  option(name) {
    const key = normalizeCommandName(name);
    const found = this.options.find((option) => normalizeCommandName(option?.name) === key);
    if (!found) return "";
    return String(found.value ?? "").trim();
  }

  async reply(content, options = {}) {
    const result = await this.client.reply(this.id, content, options);
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

function normalizeCommandName(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/^\//, "");
  return /^[a-z0-9_-]{1,32}$/.test(raw) ? raw : "";
}

function normalizeCommandDefinition(name, metadata = {}) {
  const description = normalizeDescription(metadata.description || `Runs /${name}`);
  return {
    name,
    description,
    options: normalizeCommandOptions(metadata.options),
  };
}

function normalizeDescription(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120) || "Bot command";
}

function normalizeCommandOptions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 25).map((option, index) => {
    const name = normalizeCommandName(option?.name);
    if (!name) throw new Error(`invalid_command_option_name_${index + 1}`);
    return {
      name,
      description: normalizeDescription(option?.description || `${name} option`),
      type: normalizeCommandOptionType(option?.type || option?.option_type),
      required: option?.required === true,
      ...(Array.isArray(option?.choices) && option.choices.length ? { choices: normalizeCommandChoices(option.choices) } : {}),
    };
  });
}

function normalizeCommandOptionType(value) {
  const raw = String(value || "STRING").trim().toUpperCase();
  return new Set(["STRING", "INTEGER", "BOOLEAN", "NUMBER", "USER", "CHANNEL", "ROLE"]).has(raw) ? raw : "STRING";
}

function normalizeCommandChoices(value) {
  return value.slice(0, 25).map((choice) => {
    const name = String(choice?.name || choice?.label || choice?.value || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const rawValue = String(choice?.value ?? choice?.name ?? "").slice(0, 100);
    return name && rawValue ? { name, value: rawValue } : null;
  }).filter(Boolean);
}

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

function retryDelay(error, failures, interval) {
  const retryAfter = Number(error?.retryAfterSeconds);
  const backoff = Math.min(interval * (2 ** Math.min(failures, 5)), 30000);
  return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.max(backoff, Math.min(retryAfter * 1000, 300000)) : backoff;
}

class AltaraComponentContext extends AltaraCommandContext {
  constructor(client, event) {
    super(client, event);
    this.customId = String(event?.data?.custom_id || "");
    this.values = Array.isArray(event?.data?.values) ? event.data.values : [];
    this.fields = event?.data?.fields || {};
    this.messageId = String(event?.message_id || "");
    this.type = event.type;
    this.leaseId = event.lease_id;
  }
  isButton() { return this.type === "MESSAGE_COMPONENT" && this.event.data?.component_type === 2; }
  isStringSelectMenu() { return this.type === "MESSAGE_COMPONENT" && this.event.data?.component_type === 3; }
  isModalSubmit() { return this.type === "MODAL_SUBMIT"; }
  async respond(response) {
    const result = await this.client.callFunction("altara-bot-components", { action: "respond", event_id: this.id, lease_id: this.leaseId, response });
    this.replied = true;
    return result;
  }
  reply(content, options = {}) { return this.respond({ ...options, ...(content && typeof content === "object" ? content : { content: String(content || "") }), action: "reply" }); }
  update(content, options = {}) { return this.respond({ ...options, ...(content && typeof content === "object" ? content : { content: String(content || "") }), action: "update" }); }
  showModal(modal) { return this.respond({action:"modal",modal}); }
  acknowledge() { return this.respond({action:"ack"}); }
}

module.exports = {
  AltaraClient,
};
