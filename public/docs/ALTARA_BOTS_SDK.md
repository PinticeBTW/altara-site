# ALTARA bot clients: altara.js and altara.py

ALTARA provides source clients in JavaScript and Python. They are small clients
for ALTARA's current bot API, not replacements for every discord.js or discord.py
feature. They are distributed with the starter downloads; no ALTARA npm or PyPI
package installation is advertised. Package publication/versioned releases are
separate future work.

## JavaScript

`examples/altara-ping-bot-node/altara-client.js` is the canonical implementation.
`altara.js` re-exports it, so both existing and new imports use the same class:

```js
const { AltaraClient } = require("./altara");
const bot = new AltaraClient({ token: process.env.ALTARA_BOT_TOKEN });
bot.command("hello", { description: "Says hello" }, async ctx => {
  await ctx.reply("Hello!");
});
bot.on("error", error => console.error(error.message));
bot.login();
```

Keep **both** `altara.js` and `altara-client.js` in your project. Existing
`require("./altara-client")` imports continue to work. The FAQ starter needs
Node.js 22.12+ and uses Node's built-in `.env` loading, without an npm dependency.
The older ping example uses its existing dotenv package.

## Python

`examples/altara-ping-bot-python/altara.py` is the canonical implementation.
The calculator download includes that exact file. Install its requirements in
a virtual environment and import it locally:

```python
import os
from altara import AltaraClient
bot = AltaraClient(token=os.environ["ALTARA_BOT_TOKEN"])

@bot.command("hello", description="Says hello")
async def hello(ctx):
    await ctx.reply("Hello!")

bot.run()
```

Load `.env` with python-dotenv before creating the client if using a file.
Do not run `pip install altara` or `npm install altara.js` based on these guides;
those are not verified official distributions for these clients.

## Supported methods

In Developer Portal -> **Permissions**, select the grants needed by the methods
below, then click **Save permissions**. The installation link uses these saved
defaults. Changing defaults does not change permissions in existing server
installations: a server manager must authorize that update. The portal protects
the four required command grants; optional grants should remain disabled unless
your code uses them. Reading history is not a subscription to new messages, and
Presence events remain unavailable. Message/member events use the explicit
subscriptions below; they do not provide the full Discord Gateway.

| Purpose | JavaScript context | Python context | Installation permission |
| --- | --- | --- | --- |
| Reply to a slash command | `ctx.reply(text)` | `await ctx.reply(text)` | `bot:send_messages` |
| Send a channel message | `ctx.sendMessage(text)` | `ctx.send_message(text)` | `bot:send_messages` |
| Read bounded public-channel history | `ctx.readMessageHistory()` | `ctx.read_message_history()` | `bot:read_message_history` |
| Add a reaction | `ctx.addReaction(id, emoji)` | `ctx.add_reaction(id, emoji)` | `bot:add_reactions` |
| Pin / unpin | `ctx.pinMessage(id)` / `unpinMessage` | `ctx.pin_message(id)` / `unpin_message` | `bot:pin_messages` |
| Edit / delete own bot messages | `ctx.editMessage(id, text)` / `deleteMessage` | `ctx.edit_message(id, text)` / `delete_message` | `bot:manage_messages` |
| Obtain a scoped voice connection | `ctx.joinVoice()` | `ctx.join_voice("")` | `bot:connect_voice` (+ `bot:speak_voice` to publish) |
| Leave / status / basic voice state | `ctx.leaveVoice()` / `setVoiceStatus(text)` / `getVoiceState()` | `ctx.leave_voice(channel_id)` / `set_voice_status(channel_id, text)` / `get_voice_state(channel_id)` | Relevant voice permissions |
| Keep / close an exact audio connection | `bot.heartbeatVoice({serverId,channelId,connectionId})` / `closeVoiceConnection(...)` | `client.heartbeat_voice(server_id,channel_id,connection_id)` / `close_voice_connection(...)` | Owned connection; heartbeat rechecks voice grants/channel access |

All methods are asynchronous; await them. JavaScript `ctx.option(name)` returns
a string (or empty string); Python `ctx.option(name, default)` preserves the
received value. Validate user input before using it in calculations, paths or
external requests. Never execute command option text as code.

The context exposes the original interaction ID, user, server and channel IDs.
Voice methods bind the original interaction event; omit the voice channel only
when asking the server to resolve the requesting user's current voice channel.
Do not reuse a text-channel ID as a voice channel.

## Transport and boundaries

- `login()` / `run()` sync the command registry, then poll for slash command
  events. Default interval is one second, with retry backoff and rate-limit hints.
- Removing a code command disables the old code-managed command during sync;
  an empty registry disables all previous code-managed commands. Existing
  webhook commands are preserved. Use a separate test bot for the examples.
- `stop()` stops polling. Rejected/revoked tokens stop startup. Restart after
  replacing the token. Never log the full token or include it in source code.
- Node's `on("error", ...)` reports local client failures. Opt-in `messageCreate`
  and `serverMemberAdd` handlers use the event transport below. Other Discord
  Gateway events and full guild/member caches are not provided.
- Replies accept text up to 2000 characters. The JavaScript/Python clients also
  accept structured `embeds` (see below).
  Link previews and cards use `bot:embed_links`. The client has an attachments argument, but
  public `bot:attach_files` installation is currently disabled/reserved. File
  upload support is not promised by these examples.
- Buttons, string selection menus and text-input modals are available in the
  Bot Token Connection clients; the hosted backend was activated on 2026-10-01.
  Read [interactive messages](ALTARA_BOTS_COMPONENTS.md) for APIs and limits.
  Arbitrary expression evaluation, general member moderation and a
  Discord-compatible Gateway are not provided.
- The Node music starter supplies an RTC audio player, local-file decoding and
  optional YouTube links/search plus Spotify track matching through yt-dlp;
  Python supplies the public connection lifecycle methods. Hosted activation
  and audible verification are tracked in ALTARA_BOTS_MUSIC.md.

For migration steps and an honest capability comparison, read
[Discord to ALTARA](ALTARA_BOTS_DISCORD_MIGRATION.md).

## Rich message cards

The hosted rich-message backend was activated on 2026-10-01, including
`altara-bot-message-send`, `altara-bot-respond` and
`altara-bot-interaction-dispatch` for Advanced Webhook Mode. Sending and editing
a persisted card, rejecting an invalid card, and sending ordinary text were
verified through the hosted API. JavaScript/Python clients and the local chat
renderer are included in this source release. Older published chat clients
need the updated assets to display cards; website/desktop release deployment
is separate. Older text calls retain their existing paths.

JavaScript command handlers can use an object or the existing text/options form:

```js
await ctx.reply({
  embeds: [{
    title: "Bem-vindo! 👋",
    description: "Começa no canal general e lê as regras.",
    color: 0xe9cfaa,
    fields: [{ name: "Ajuda", value: "Usa /ajuda", inline: true }],
    footer: { text: "ALTARA" }
  }]
});
// Also supported: ctx.reply("Texto", { embeds: [...] }).
// Member/message events: member.sendMessage({ embeds: [...] }, welcomeChannelId).
// Direct send: bot.sendMessage({ serverId, channelId, content: "", embeds: [...] }).
```

Python:

```python
await ctx.reply(embeds=[{
    "title": "Bem-vindo! 👋",
    "description": "Começa no canal general e lê as regras.",
    "color": 0xe9cfaa,
    "fields": [{"name": "Ajuda", "value": "Usa /ajuda", "inline": True}],
    "footer": {"text": "ALTARA"}
}])
# Events: await member.send_message(channel_id=welcome_channel_id, embeds=[...]).
```

The bot must have Send Messages and Link Previews (`bot:embed_links`) granted
by the server and permitted by the channel. Own-message editing additionally
requires `bot:manage_messages`. Omitted embeds keep the existing cards during an
edit; `embeds: []` removes them. An empty message without cards is rejected.
Webhook callbacks may return `{ content, embeds }` or a type-4 response with
`data: { content, embeds }`; they pass through the same validated reply RPC.

Supported card properties: title, description, color (24-bit integer), HTTPS
title link, fields (name/value/inline), author (name/url/icon_url), footer
(text/icon_url), image/thumbnail (url), and UTC timestamp. Limits follow the
[Discord embed reference](https://docs.discord.com/developers/resources/message#embed-limits):
10 cards, 25 fields per card, 6000 text characters in total; title/author/field
name 256, description 4096, field value 1024 and footer 2048. Unknown properties
are rejected. Card text is displayed as text, with line breaks; Markdown styling,
videos, provider data and arbitrary HTML are not yet supported.

Links require HTTPS public DNS hostnames (no credentials, IP literals, local
hostnames or custom ports). URLs are limited to 2048 characters. External images
load only when a reader activates the image button; failures offer a retry.
The backend never downloads them, and they do not acquire trusted attachment
status. This is separate from the future authenticated bot-upload API.

For the remaining platform work, see [Bot capabilities](ALTARA_BOTS_CAPABILITIES.md).

## New messages and member joins

This requires the `bot_domain_events_v1` backend migration and `altara-bot-events`
Edge Function. Until they are activated, the portal keeps these controls disabled.
Current downloads include client support; deploying backend changes is a separate
operator action, not a step bot developers must perform.

1. On **Intents**, enable **Messages** and/or **Server Members**, then **Save intents**.
2. On **Permissions**, request `bot:receive_message_events` and/or
   `bot:receive_member_events`, save, and ask the server manager to authorize them.
3. Specify matching `intents` in your client. Existing clients default to none,
   keep the command-only transport and make no additional event requests.
4. Message text additionally needs the **Message Content** intent and
   `bot:read_message_content` plus `bot:read_message_history`. Without those,
   `content` is `null` and `contentRedacted` / `content_redacted` is true.

```js
const bot = new AltaraClient({
  token: process.env.ALTARA_BOT_TOKEN,
  intents: ["messages", "members", "message_content"]
});
bot.on("messageCreate", async message => {
  if (message.content === "!ping") await message.reply("Pong!");
});
bot.on("serverMemberAdd", async member => {
  await member.sendMessage("Welcome!", process.env.ALTARA_WELCOME_CHANNEL_ID);
});
bot.on("error", error => console.error(error.message));
bot.on("eventOverflow", info => console.error("Dropped events:", info.droppedEvents));
```

```python
bot = AltaraClient(token=os.environ["ALTARA_BOT_TOKEN"],
                   intents=["messages", "members", "message_content"])

@bot.event("message_create")
async def message_created(message):
    if message.content == "!ping":
        await message.reply("Pong!")

@bot.event("server_member_add")
async def member_joined(member):
    await member.send_message("Welcome!", os.environ["ALTARA_WELCOME_CHANNEL_ID"])

@bot.event("event_overflow")
def overflow(info):
    print("Dropped events:", info["dropped_events"])
```

Start with `login()` / `run()` after registering all commands and handlers. Use
a dedicated test bot: startup still syncs your command registry, including an
empty registry. Automatic messages require Send Messages and channel permission.

Only new human messages in visible public text channels and new member joins are
captured. DMs, private channels, encrypted messages, trusted system events and bot
messages are excluded. No private profile fields, attachments, presence feed,
historical member list or message-update/delete events are delivered. Message
content is read at delivery time, so edits can change it and deletion suppresses
delivery. Owner intent changes and install updates invalidate pending deliveries.

Handlers are awaited. Success is acknowledged on the next event poll; failures
can be retried with the same `event.id` after a 45-second lease. Delivery is
bounded: ten-minute expiry, five attempts, at most 1000 queued events per bot.
Overflow drops new events and reports a cumulative counter; it never blocks
message creation merely to grow the queue. Expired reference rows are cleaned
during enqueue/poll; content is never copied into this queue. This is not a
guarantee of every event or exactly-once side effects. Use `event.id` / context
`id` for persistent idempotency in your own storage, finish handlers within the
lease and avoid long work in them. In-process successful-event deduplication
does not survive a process restart or coordinate multiple bot processes.

## Maintaining the downloads

From the application source root, run `python scripts/build-bot-starters.py` to
build archives into `bot-starters`, or pass `--output PATH` for the site's
`public/bot-starters` directory. The builder copies an explicit file allowlist
and only `.env.example`, never `.env`, credentials, dependencies or caches.
Rebuild downloads after changing either canonical client, an example or a guide.
Do not hand-edit generated client copies or archives.
