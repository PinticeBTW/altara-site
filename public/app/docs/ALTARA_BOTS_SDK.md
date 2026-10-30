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
Protected basic presence and the other platform events use opt-in owner/client
intents and installation grants. Message/member events use the explicit
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

## Advanced command definitions (local implementation)

The source clients now support subcommands, one level of subcommand groups,
dynamic autocomplete, and user/message context commands. These require the
matching advanced-command backend migration and chat assets. Local SDK tests
do not confirm activation on the hosted service or a published starter update.
Existing flat slash definitions remain supported.

```js
bot.command('find', { options: [
  { name: 'people', type: 'SUB_COMMAND', options: [
    { name: 'name', type: 'STRING', autocomplete: true }
  ] }
] }, async ctx => {
  await ctx.reply(`Selected: ${ctx.option('name')}`);
});
bot.autocomplete('find', async ctx => {
  // ctx.focused: { name, type, value }; use ctx.subcommand/subcommandGroup.
  await ctx.respond([{ name: 'Example', value: 'example' }]);
});
bot.command('View profile', { type: 'USER' }, async ctx => {
  // The server resolves the selected target; never trust caller-supplied data.
  await ctx.reply({ content: ctx.targetUser?.name || 'Selected member', ephemeral: true });
});
bot.command('Inspect message', { type: 'MESSAGE' }, async ctx => {
  await ctx.reply({ content: ctx.targetMessage?.content || 'Selected message', ephemeral: true });
});
```

Python uses `@bot.command('View profile', type='USER')` and
`@bot.autocomplete('find')`. Its context names are `command_type`,
`subcommand_group`, `subcommand`, `target_id`, `target_user`, and
`target_message`; autocomplete uses `ctx.focused` and `await ctx.respond(choices)`.
`ctx.option(...)` reads the selected leaf options and preserves its existing
JavaScript string/Python native-value behavior.

Command types are `CHAT_INPUT` (default), `USER`, and `MESSAGE`; numeric aliases
1/2/3 are accepted. Context command names may contain spaces and Unicode and
have at most 32 characters. Context commands have no description or options.
Options support `SUB_COMMAND`, `SUB_COMMAND_GROUP`, `STRING`, `INTEGER`,
`BOOLEAN`, `USER`, `CHANNEL`, `ROLE`, `MENTIONABLE`, `NUMBER`, and `ATTACHMENT`
(numeric aliases 1–11). Groups contain subcommands; subcommands contain ordinary
options. A list cannot mix branches and ordinary options. There are at most 25
options at each level, and required ordinary options precede optional ones.
`ATTACHMENT` definitions are recognized, but invoking an attachment option
remains rejected until the scoped human upload broker is integrated.

Autocomplete and static choices are available only for string, integer, and
number options. They cannot be combined on the same option. Choices have at
most 25 entries, and numeric choices remain numbers. A handler responds once
with `ctx.respond(...)`; an error produces no public chat reply. String length
and numeric bounds are validated. Channel filters currently accept text (0)
and voice (2). Unsupported types or registration fields are rejected rather
than silently converted. Installation contexts and user-installed applications
are outside this command block. The schema follows the
[official application-command reference](https://docs.discord.com/developers/interactions/application-commands)
within these explicit ALTARA limits.

Typed component callbacks additionally expose `resolved` and the predicates
`isUserSelectMenu()`, `isRoleSelectMenu()`, `isMentionableSelectMenu()`, and
`isChannelSelectMenu()` (Python: snake_case). Resolved entities come from the
authorized backend callback; the client does not resolve IDs itself.

## Transport and boundaries

- `login()` / `run()` sync the command registry, then poll for slash command
  events. Default interval is one second, with retry backoff and rate-limit hints.
- Removing a code command disables the old code-managed command during sync;
  an empty registry disables all previous code-managed commands. Existing
  webhook commands are preserved. Use a separate test bot for the examples.
- `stop()` stops polling. Rejected/revoked tokens stop startup. Restart after
  replacing the token. Never log the full token or include it in source code.
- Node's `on("error", ...)` reports local client failures. Opt-in `messageCreate`
  and `serverMemberAdd` handlers use the event transport below. Additional
  supported events are listed in the platform guide; a Discord Gateway and full
  guild/member caches are not provided.
- Replies accept text up to 2000 characters. The JavaScript/Python clients also
  accept structured `embeds` (see below).
  Link previews and cards use `bot:embed_links`. The client has an attachments argument, but
  scoped `bot:attach_files` uploads are active in the hosted backend from
  2026-10-02. Read [private bot files](ALTARA_BOTS_FILES.md); new authenticated
  real-chat upload/download flows were not exercised today.
- Buttons, string selection menus and text-input modals are available in the
  Bot Token Connection clients; the hosted backend was activated on 2026-10-01.
  Read [interactive messages](ALTARA_BOTS_COMPONENTS.md) for APIs and limits.
  General member moderation, consenting DMs, threads, webhooks and more events
  are active in the hosted backend from 2026-10-02; read
  [platform APIs](ALTARA_BOTS_PLATFORM_V2.md) for catalog/authentication/access
  verification and new authenticated real-chat checks still to perform.
  Arbitrary expression evaluation and a Discord-compatible Gateway are not provided.
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
Public webhook callbacks may return `{ content, embeds }` or a type-4 response
with `data: { content, embeds }`. The hosted guarded callback authority and its
private-reply boundary and the verified HTTPS delivery are described below.

Supported card properties: title, description, color (24-bit integer), HTTPS
title link, fields (name/value/inline), author (name/url/icon_url), footer
(text/icon_url), image/thumbnail (url), and UTC timestamp. Limits follow the
[Discord embed reference](https://docs.discord.com/developers/resources/message#embed-limits):
10 cards, 25 fields per card, 6000 text characters in total; title/author/field
name 256, description 4096, field value 1024 and footer 2048. Unknown properties
are rejected. Descriptions and field values support line breaks, `**bold**`,
`*italics*` / `_italics_`, `~~strikethrough~~`, inline code, fenced code blocks,
flat `-` / `+` / `*` bullet lists, `>` blockquotes, and
`[label](https://example.com)` links. Code blocks remain escaped text without
execution or syntax highlighting. Titles and other card labels remain plain
text. This is a bounded Markdown subset; nested block structures, arbitrary
HTML, automatic external image loading, videos and provider data are not
supported. Bot-supplied text is escaped before rendering.

Links require HTTPS public DNS hostnames (no credentials, IP literals, local
hostnames or custom ports). URLs are limited to 2048 characters. External images
load only when a reader activates the image button; failures offer a retry.
The backend never downloads them, and they do not acquire trusted attachment
status. This is separate from the active [private bot-upload API](ALTARA_BOTS_FILES.md).

For the remaining platform work, see [Bot capabilities](ALTARA_BOTS_CAPABILITIES.md).

## New messages and member joins

The original `bot_domain_events_v1` feed and the 2026-10-02 event expansion are
active, with the updated `altara-bot-events` Edge Function. Bot developers still
need the saved owner/client intents and reviewed installation grants below.
Backend deployment is an operator action, not a step each developer must perform.
The [activation record](ALTARA_BOTS_PLATFORM_V2.md#hosted-activation-2026-10-02)
separates hosted catalog/authentication/access checks from the new authenticated
real-chat delivery paths, which were not exercised today.

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

The original hosted feed covers new human messages in visible public text
channels and member joins. The active 2026-10-02 platform expansion adds member
leave/update, message edits/deletes, reactions, protected basic presence, voice,
threads and separately consenting bot DMs. Encrypted/private human messages,
trusted system events and private profile fields remain excluded. Authority is
rechecked at delivery; owner intent changes and install updates invalidate
pending deliveries. See ALTARA_BOTS_PLATFORM_V2.md for grants and the full inventory.

Handlers are awaited. Success is acknowledged on the next event poll; failures
can be retried with the same `event.id` after a 45-second lease. Delivery is
bounded: the active platform v2 uses 24-hour expiry, ten attempts and at most
1000 queued events per bot.
Overflow drops new events and reports a cumulative counter; it never blocks
message creation merely to grow the queue. Expired reference rows are cleaned
during enqueue/poll; content is never copied into this queue. This is not a
guarantee of every event or exactly-once side effects. Use `event.id` / context
`id` for persistent idempotency in your own storage, finish handlers within the
lease and avoid long work in them. Private DM delivery has a separate lease queue.
In-process successful-event deduplication
does not survive a process restart or coordinate multiple bot processes.

### Node event-feed recovery (2026-10-04)

The Node client skips the public event feed when `direct_messages` is its only
event intent. With mixed intents, a temporary public-feed failure still permits
the independently leased private feed to deliver DMs before the public error is
reported. If both feeds fail, an `AggregateError` retains both failures and the
largest retry hint. Revoked authentication still stops the client; stopped or
replaced runs cannot process late responses. At this stage, slash-command polling
still preceded the feeds without failure isolation; the 2026-10-05 follow-up below
closes that remaining gap.

Node's `eventOverflow` preserves `droppedEvents` and adds `source`, either
`"domain"` or `"direct_messages"`; each feed has its own cumulative counter.
Command/domain/DM delivery handlers remain awaited. Non-blocking observers
emitted by the client, such as `error` and `eventOverflow`, now have rejected
promises handled as well as synchronous exceptions. An error observer cannot
recursively emit another error; its fallback diagnostic is fixed text without
the private event payload.

These paths passed isolated regression tests and are included in the regenerated
source downloads. This does not reload an already-running bot process or verify
a live disconnect/reconnect cycle.

### Python event-feed recovery (2026-10-04)

Python now also consults the private feed after a temporary public-feed failure
in mixed-intent mode. `AltaraEventFeedError.errors` retains both original failures
when both feeds fail, and retry hints and terminal authentication remain intact.
Diagnostic observer exceptions no longer prevent DM delivery or leave an overflow
counter stuck. Diagnostic callbacks remain awaited, as in the existing Python
client; delivery callbacks still have to succeed before their events are acknowledged.
The focused Python runtime suite passed 45 tests without using a live bot or backend.

### Full polling-cycle recovery (2026-10-05)

Node and Python now continue through enabled public/private event feeds and
interactive components when the slash-command polling endpoint fails temporarily.
A temporary event-feed failure also permits the component feed to run. Requests
remain sequential, in the existing order, and each enabled endpoint is consulted
once per cycle. Disabled feeds are not enabled by this change.

Failures are reported after the remaining eligible feeds have run. A single
failure preserves its original error; multiple failures retain their originals
and the largest server retry hint. Token revocation and rejected authentication
remain terminal and prevent later requests. Stop/replacement fences discard late
responses, and successful-handler acknowledgements keep their existing behavior.

The polling loop still applies its existing retry delay after a failed cycle;
this is recovery isolation, not a guarantee of uninterrupted or exactly-once
delivery. Initial command registration is unchanged. Updating source downloads
does not reload a running bot or prove a real disconnect/reconnect cycle.

### Event handler stop boundaries (2026-10-05)

The source Node/Python clients capture a generation for public events and
interactive components, including standalone polling. Stopping or replacing
that generation prevents later handlers and later feeds from starting. A
partially executed event is not marked complete or acknowledged; stale polling
responses are discarded without clearing the pending acknowledgement buffer.

Public/thread/member event contexts also reject new `sendMessage` /
`send_message`, replies and `sendWelcome` / `send_welcome` calls after their
generation expires. Component contexts reject new `respond` calls and the
reply/update/modal/acknowledgement helpers which use them. Direct methods on
the client and slash-command contexts retain their existing behavior; a fresh
standalone poll remains supported.

This does not cancel arbitrary code already executing inside a callback or
undo requests already sent or accepted by the backend. A response started
before stop keeps its accepted state, but later callbacks and delivery ACKs
remain fenced. Partially delivered events may be retried; use your own durable
idempotency for external side effects. Focused red/green tests passed in both
languages. This is a local SDK correction, requiring no new backend changes;
updating source downloads does not reload an existing bot process.

### Private DM lifecycle events (hosted active, 2026-10-05)

The private runtime feed was activated with explicit operator approval on
2026-10-05: hosted migration `20261005171342_bot_dm_lifecycle_events_v1` and
version 6 of the existing `altara-bot-surfaces` function. The local SDK, SQL,
HTTP transport and packaging suites passed 131 tests. Hosted catalog, source
parity and unauthenticated/invalid-token denial checks passed. A live test in the existing consented LEYLEY DM confirmed all five new private
mutation types, six deliveries with acknowledgements, distinct human/bot actors,
redacted deletion and a recipient-bound callback reply. Repeating the edit and
the reply produced no duplicate mutation/reply. Only a newly created test bot
message was edited, pinned and deleted. The observer requested mutation types
only; the existing CREATE poll and normal DM ping continued in the original
process. No intents, grants, consent or credentials were changed. Updating these
downloads does not reload a running process; developers must update their
client and restart their own bot to use the new callback handlers.
Updated source clients negotiate six event types through `dm_poll.event_types`;
older clients keep their CREATE-only RPC and original message/lease identity.
The existing owner/client `direct_messages` intent, installation grant and current
recipient consent remain required. No new permission is granted automatically.

| Private event | JavaScript callback | Python callback |
| --- | --- | --- |
| `DIRECT_MESSAGE_CREATE` | `directMessageCreate` | `direct_message_create` |
| `DIRECT_MESSAGE_UPDATE` | `directMessageUpdate` | `direct_message_update` |
| `DIRECT_MESSAGE_DELETE` | `directMessageDelete` | `direct_message_delete` |
| `DIRECT_MESSAGE_REACTION_ADD` | `directMessageReactionAdd` | `direct_message_reaction_add` |
| `DIRECT_MESSAGE_REACTION_REMOVE` | `directMessageReactionRemove` | `direct_message_reaction_remove` |
| `DIRECT_MESSAGE_PIN_UPDATE` | `directMessagePinUpdate` | `direct_message_pin_update` |

Register only handlers relevant to your bot's workflow; the SDK does not invent
automatic replies to edits, reactions or pins. For example, a developer can
acknowledge a human reaction privately:

```js
bot.on('directMessageReactionAdd', async ctx => {
  if (ctx.actor?.type !== 'user') return;
  await ctx.reply('Recebi a tua reação.');
});
```

`ctx.user` remains the person in this private conversation. `ctx.actor` identifies
the user or bot responsible for a mutation, independently of who originally
sent the message. Legacy CREATE events have no actor object. Replies and sends
stay bound to the original private recipient and installation; recipient and
installation aliases cannot retarget them, and channel overrides are rejected.
The original event identity is used as the
default reply request ID for retry safety.

`ctx.messageId` identifies the affected message; a mutation's `ctx.id` identifies
its event, not the message. UPDATE presents the current authorized content and
attachments. `data.revision` records the mutation's occurrence;
`data.current_revision` identifies the current source message revision.
The legacy CREATE payload keeps its existing current `data.revision` field.
DELETE has no content or attachment payload. Reactions expose `data.emoji`;
pin events expose captured `data.is_pinned` and current `data.current_is_pinned`.
Automatic retention cleanup
does not manufacture human or bot mutation events.

The private queue stores bounded event metadata, not snapshots of private text.
Current access is checked again before claims and acknowledgements. Consent
withdrawal and subscription removal cancel queued delivery; re-enabling access
does not revive those cancelled events. Handlers are awaited and only successful
callbacks are acknowledged. Redelivery keeps the same event ID with a new lease;
keep durable idempotency for your own external side effects.

The mutation queue is limited to 1,000 entries per bot, with a 24-hour expiry
and at most 10 delivery attempts. Capacity saturation increments a private cumulative
`dropped_events` counter. The existing `eventOverflow` (JavaScript) or
`event_overflow` (Python) diagnostic identifies `source: "direct_messages"`;
it does not expose private message content or recipient identities. Normal expiry
and exhausted retries are separate from capacity overflow.

### Private history pagination (hosted active, 2026-10-04)

The enhanced history method accepts an authoritative `before` cursor. The server
pagination migration was activated with explicit operator approval on 2026-10-04,
alongside version 3 of the existing `altara-bot-surfaces` function. Its custom
authentication and existing permissions remain unchanged. Clients should only
request another page when the result has `has_more: true` and a `next_cursor`.
Pass that cursor unchanged, preserving timestamp microseconds and the message ID.

Read-only hosted checks using the operator's own account confirmed the capability
and a cursor-based history response. Loading larger histories and preserving the
scroll anchor were verified locally; the real DM has fewer than 50 messages, so
its older-history button is correctly absent.

```js
const page = await bot.readDirectMessageHistory({ serverId, userId });
if (page.has_more && page.next_cursor) {
  const older = await bot.readDirectMessageHistory({ serverId, userId, before: page.next_cursor });
}
```

```python
page = await bot.read_direct_message_history(server_id, user_id)
if page.get("has_more") and page.get("next_cursor"):
    older = await bot.read_direct_message_history(server_id, user_id, before=page["next_cursor"])
```

This keeps the legacy `readDirectMessages` / `read_direct_messages` contract.
The bot still needs current installation permission and recipient consent;
pagination does not grant access to a different recipient or conversation.

### Per-server settings (2026-10-05)

These methods require the settings migration and updated `altara-bot-surfaces`
function to be published by the operator. Leave
`ALTARA_BOT_SERVER_SETTINGS_EXAMPLE` unset until that backend
package is available; setting it to `1` opts the bundled starter into registration
and the actual settings consumers.

| Purpose | JavaScript | Python |
| --- | --- | --- |
| Declare implemented features | `await bot.registerServerSettings(features)` | `await bot.register_server_settings(features)` |
| Read one installation's settings | `await bot.getServerSettings(serverId)` or `await ctx.getServerSettings()` | `await bot.get_server_settings(server_id)` or `await ctx.get_server_settings()` |
| Send one leased member welcome | `await member.sendWelcome(text, channelId)` | `await member.send_welcome(text, channel_id)` |

Registration declares the bot's complete supported feature list, currently
`welcome_messages` and `dm_commands`; declare only features your runtime consumes.
The Node starter advertises `welcome_messages` with its existing `members` intent
and `dm_commands` with `direct_messages`; either works independently, and the
settings flag requires at least one. It does not add portal intents or grants.
The Python starter implements only `dm_commands` and requires
`direct_messages`. Their opt-in constructors register the corresponding list on
startup. A custom Python runtime can use `send_welcome` in a member-join handler,
but the bundled Python starter does not advertise welcome support.

Settings are saved separately for each installation in Server Settings ->
Apps -> Configure, by a member with **Manage Apps**. Welcome sends
the existing template to the selected eligible text channel. DM commands enable
`ajuda`/`help`, `ping` and bounded `roll` in the existing consenting bot/person
conversation. This is not an ephemeral channel reply. Existing installation and
channel grants, portal intents and recipient consent are still required; these
options do not grant permissions or establish consent.

The read response contains `configured`, `revision`, `support_revision`,
`features` and `settings` (`welcome_enabled`, `welcome_channel_id`,
`dm_commands_enabled`). A withdrawn feature is inactive without discarding its
stored preset. The Node starter uses its legacy welcome ENV destination only
after a valid `configured: false` response; explicit off and read/authentication
errors never fall back. Reads share one snapshot per server within a polling
cycle, rather than retaining settings across cycles.

`sendWelcome` / `send_welcome` is valid only on `SERVER_MEMBER_ADD`. The context
forwards the original event ID and current lease ID automatically. The backend
rechecks the exact installation, current membership, lease, grants and configured
destination, then commits the message and its event ledger together. A valid
retry, including a newly issued lease for the same event, returns the existing
`message_id`; it does not publish another welcome. The result is
`{ok: true, sent: true, message_id}` or `{ok: true, sent: false}` when the current
setting/support suppresses sending. This protection applies to this welcome
method, not to arbitrary `sendMessage` side effects. Local isolated tests cover
lost responses and concurrent attempts; no live welcome delivery is claimed here.

<a id="advanced-webhook-replies-prepared-locally-2026-10-05"></a>

## Advanced webhook replies: authority hosted active, 2026-10-05

With explicit user approval, `bot_callback_response_authority_v1` was applied
as hosted version `20261005104633` (local source `20261005102800`) and
`altara-bot-interaction-dispatch` v35 is ACTIVE with JWT verification retained.
This activates the authority for initial public or author-only text/card
callback responses; it does not establish external command delivery. The
service-only `bots_respond_callback_interaction_v1` RPC commits the response and
event completion together, rechecking current author, bot, command,
installation and channel authority. A private response uses the existing
separate author-only result store rather than a public message. Failed private
intent must never fall back to public text. Existing hosted Bot Token Connection
private replies/forms remain active and keep their established APIs.

`examples/altara-ping-bot-node/index.webhook.js` exports `createWebhookApp(...)`
and `reply(text | { content, embeds, ephemeral })` without starting a server or
loading `.env` on import. Its `hello`, `ping` and `roll` handlers remain public.
The dedicated [HTTPS starter](ALTARA_BOTS_HTTPS_QUICKSTART.md) includes this
official helper, a runnable interactive example and explicit command registration.
The FAQ, calculator and music ZIPs keep their Bot Token Connection flow. Its helpers are
optional: another signature-validating HTTPS handler can implement the native
JSON/API contract below. An existing signed handler can deliberately serialize
a private reply:

```js
const { reply } = require("./index.webhook.js");
res.json(reply({ content: "Só tu podes ver esta resposta.", ephemeral: true }));
```

The helper emits `CHANNEL_MESSAGE_WITH_SOURCE` with `data.ephemeral` only when
explicitly supplied as a Boolean. Omitted privacy remains public; invalid
privacy values, wire flags/types and unsupported fields are rejected rather
than silently removed. Cards still require backend validation and grants. The
handler verifies the HMAC over the exact raw body, uses constant-time signature
comparison and rejects timestamps more than five minutes from the current time.
The local matrix passed 43 tests across the actual handler/serializer, HTTP,
transport limits and isolated PostgreSQL authority/concurrency cases. Hosted
read-only checks verified the approved RPC body/ACL, preserved responder hashes
and JWT rejection (401 for anonymous or invalid-JWT HTTP requests). That earlier
reply-authority stage did not exercise a positive external callback round trip
or hosted callback delivery.

`ALTARA_ENABLE_EXTERNAL_BOT_COMMAND_DISPATCH` remains disabled by default in
code. It was not changed by that earlier reply-authority activation, which
did not add a chat delivery route. A separate explicit owner-selected route is
now active on the hosted backend, with stable request IDs, current authority
checks and no SDK fallback after an uncertain callback. With explicit approval,
the route migration was published as `20261005115207`; the operator gate is
enabled and dispatcher v37 is ACTIVE with JWT verification retained. Existing
apps remain in SDK mode. Chat/portal sources are synchronized locally. A separate
fictional-data public TLS test passed 12/12 transport/handler cases and closed
its receiver/tunnel; its final DNS Resolver was confined to the fixture.
After the CHECK/expiry correction was published as hosted migration
`20261005131559`, independent hosted verification passed 10/10 checks. One
public `/ping` from the separate **ALTARA HTTPS TEST** bot passed through the
real authenticated portal/chat: one signed challenge, one signed command,
zero duplicate deliveries or signature rejections, and one responded event,
one reservation and one linked chat reply. HTTPS private replies were not
part of that earlier public `/ping` proof.
Endpoint verification is a
separate check and does not select the mode. Signed component/form delivery,
webhook-opened modals and deferred initial completion were still pending at
that earlier stage; the published follow-up is recorded below. Private
attachments, mentions and message controls are not supported by this package.
See [webhook hosting](ALTARA_BOTS_HOSTING.md#advanced-webhook-mode).

## Maintaining the downloads

<a id="https-controls-and-single-deferred-completion-prepared-locally-2026-10-05"></a>

### HTTPS controls and single deferred completion: hosted active, 2026-10-05

With explicit approval, `bot_callback_components_v1` and
`bot_callback_completion_v1` were published as hosted versions `20261005144103`
and `20261005144111` (local sources `20261005134246` and `20261005134516`).
Dispatcher v38 is ACTIVE with JWT verification; responder v34 is ACTIVE with
its existing Bot Token/Interaction authentication retained. This enables initial
private text/cards, public replies with buttons/string selects, forms opened
from a command or control, and signed `MESSAGE_COMPONENT`/`MODAL_SUBMIT` delivery
through the existing chat controls. Bot Token Connection remains the default
and keeps its existing APIs.

The inbound Node example now exports `reply`, `update`, `showModal`,
`acknowledge`, `defer` and `completeDeferredReply` for a supplied
`createWebhookApp({ onInteraction })` handler. Its default public
`hello`/`ping`/`roll` behavior is unchanged. Component requests keep the same
queued event ID, revision and values during recovery; form submissions retain
the original fields and UUID. Children inherit their parent's delivery mode,
with current access/endpoint checks before delivery and no SDK fallback.
A public `update` also requires the existing `bot:manage_messages` (Manage
Messages) grant. The live fixture without that grant was correctly refused
and made no public-message edit; a positive HTTPS update is not claimed here.

Only an `APPLICATION_COMMAND` can defer its initial reply. Return
`defer({ ephemeral: true })` for a private result, or `defer()` for a public one.
The signed callback body binds `id`/`event_id` and the scoped `event.token`.
Retain that verified event securely for the existing worker, then call:

```js
await completeDeferredReply(event,
  { content: "Concluído.", ephemeral: true },
  { apiBase: process.env.ALTARA_FUNCTIONS_URL });
```

The helper POSTs to `/altara-bot-respond` with `Authorization: Interaction
<event.token>` and `{ action: "complete_interaction", event_id, response }`.
This completion uses the scoped credential, not a second HMAC signature or a
Bot Token. Without the helper, return this initial native JSON response:

```json
{ "type": "DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE", "data": { "ephemeral": true } }
```

Then POST the same `complete_interaction` envelope using the header above and
`response: { "type": "CHANNEL_MESSAGE_WITH_SOURCE", "data": { "content": "Concluído.", "ephemeral": true } }`.
These are ALTARA response types; the completion still requires the verified
event ID/token and the original visibility. The original five-minute event deadline is fixed; visibility cannot
change, and an exact retry returns the same completion without another message.
Only one initial reply can complete: repeated follow-up messages, another defer,
and modal/update/ack completion are unsupported. Private results use the existing
author-only UI for at most 15 minutes; a form retains its original 10-minute
submission deadline. Private controls, uploads and explicit mentions remain
unsupported for HTTPS.

Verification is scoped: the earlier combined local matrix passed 152 tests with
two existing browser gates omitted. After the narrow form-author fix, 16 focused
component tests passed and the local serving copies matched source. Hosted
catalog checks confirmed the approved sources, ACLs and SDK transport isolation.
The authenticated real run exercised five commands, private button/form results
and both single deferred completions (public and private). Private button and
form content were visible in the author-only UI. The final private string-select result was visible in the author-only UI after
browser control recovered. A fresh button-opened form submission then showed
the source bot's name/avatar and the private confirmation, completing that
visual retake. These results cover the exercised fixture flows; they do not
claim a positive public-update test or unsupported follow-up behavior.

### Private slash replies and direct forms (hosted active, 2026-10-05)

Node slash contexts expose `ctx.reply({content, ephemeral: true})` and
`ctx.showModal({custom_id, title, components})`. Python uses
`ctx.reply(content, ephemeral=True)` and `ctx.show_modal(modal)`. Both methods mark
the context as replied only after the backend accepts the response. The usual
public slash reply remains the default.

The local source clients also preserve private intent when validation or delivery
fails. An attempted private reply or slash form suppresses the automatic public
`Command failed.` fallback; it does not mark the reply successful or acknowledge
an unsuccessful form submission. Redelivery can therefore retry the original
handler. Explicit public replies retain their usual error fallback. Use the
documented `ephemeral` Boolean; invalid explicit flags fail conservatively.
These failure paths passed focused Node/Python tests using the actual clients
and simulated transport, including uncertain acceptance and successful redelivery.
Reload a running bot after updating its source client to load this correction.

With explicit user approval, `bot_private_slash_interactions_v1` was applied to
the hosted project as version `20261005014035` on 2026-10-05. The active functions
are `altara-bot-respond` v32, `altara-bot-components` v2 and
`altara-bot-interaction-dispatch` v34. The package preserves the existing Bot Token
Connection flow and current installation/channel permissions. Author-only
text/cards and slash forms use separate private results; attachments, mentions
and controls are rejected in these private replies. Local automated checks and
the browser fixture passed. The final authenticated real-chat check used local
web assets `private-interactions-ui-v5`: LEYLEY's name/avatar and its private reply
appeared without a Thinking indicator before any further interaction, remaining
clear after at least 20 seconds. A second invocation opened the slash form; one
submission returned a private confirmation, closed the form and restored composer
focus, also without a Thinking indicator. Neither private text appeared in the
public timeline; hosted metadata confirmed no linked public messages. No hosted
frontend deployment is claimed. See [private replies and forms](ALTARA_BOTS_COMPONENTS.md#private-slash-replies-and-forms-hosted-active-2026-10-05)
for examples, expiry, access checks and the advanced webhook boundary.

### Building current starter downloads

From the application source root, run `python scripts/build-bot-starters.py` to
build archives into `bot-starters`, or pass `--output PATH` for the site's
`public/bot-starters` directory. The builder copies an explicit file allowlist
and only `.env.example`, never `.env`, credentials, dependencies or caches.
Rebuild downloads after changing either canonical client, an example or a guide.
Do not hand-edit generated client copies or archives.

<a id="rich-https-results-prepared-locally-2026-10-05"></a>

## Rich HTTPS results: backend active, 2026-10-05

This section describes the operator-approved hosted backend package activated
on 2026-10-05: three migrations are applied, and `altara-bot-respond` v35,
`altara-bot-interaction-dispatch` v39 and `altara-bot-interaction-attachments` v1
are active. The matching site frontend and starters have only been updated and
served locally; no public frontend release is claimed. Authentication denials
were checked, but positive authenticated HTTPS, Storage and browser checks of
this rich package remain pending. The earlier hosted verification above still
describes its original version.

Verified callbacks may return explicit private buttons/string selects, uploaded
files and member mentions through the canonical `reply` helper:

```js
const attachment = await helpers.uploadInteractionAttachment(event, {
  apiBase: process.env.ALTARA_FUNCTIONS_URL,
  requestId: savedUploadRequestId, // persist one UUID per logical upload
  ephemeral: true,
  filePath: './report.txt',
  fileName: 'report.txt',
  mime: 'text/plain',
});
return helpers.reply({
  content: 'Your report is ready.',
  ephemeral: true,
  attachments: [attachment],
  components: myValidatedControls,
});
```

Uploading must finish before the original five-minute capability deadline and
the callback must still answer within three seconds. Prepare file bytes before
the command, or defer the initial response and upload in the existing worker.
No hosting or background worker is created by these helpers.

After an accepted initial reply or completed defer, the worker may use
`followUpReply(event, response, {apiBase, requestId})`. Keep the verified event
and its token only in the trusted worker. Use an explicit stable UUID and the
identical payload when checking uncertain acceptance; the helper never retries
a network failure automatically. Initial completion remains singular. At most
ten follow-ups are accepted per event, each with the initial visibility.

The signed Interaction credential expires at the original five-minute deadline;
it cannot become a Bot credential or authorize a different target. Child
callbacks have their own credential. Private results last at most 15 minutes;
controls cannot outlive their source and forms keep their original deadline.
Private messages/files stay in the invoking actor's channel view, outside public
message/DM rows, caches and unread state. Downloads recheck current authority
and use a signed URL valid for at most 60 seconds and no later than the result.

Attachments accept only `{upload_id: UUID}`, never URLs or storage paths.
Files require the existing attach-files/channel grants and validated bytes:
8 MiB per file, ten files and 16 MiB per result. Upload requests have their own
stable UUID and byte digest. An upload cannot move between public/private
visibility, events or recipients. The configured Functions base must be HTTPS.

Explicit mentions accept only `allowed_mentions: {users: [memberId]}`. Public
mentions reuse the current permission/notification path. Private mentions are
validated labels only: they never notify a third party. Broad mentions and roles
are rejected. No grants, delivery mode or consent are enabled automatically.

### Guild component private replies in Node/Python (hosted active, 2026-10-07)

The local clients accept `ctx.reply({content, embeds, ephemeral:true})` in Node
and `await ctx.reply(content, embeds=cards, ephemeral=True)` in Python on public
guild buttons, string/entity selectors and their form submissions. An original
slash parent is not needed: the request uses the component's own event ID and
lease on `altara-bot-components`, with `response.action="reply"` and
`response.ephemeral=true`. Actor and source authority remain server-owned.

With operator approval, hosted migration `20261007190457` activated the route
on 2026-10-07. A live JavaScript canary used one button on LEYLEY's existing
`/painel` in `JA FOSTE` / `general`, with the pintice account: the UI displayed
the fixed private confirmation and `Only you can see`; metadata confirmed one
accepted response bound to the clicking actor, no slash parent and no public
row containing the private body. Python, menus, modal submissions and
different-account cases were not tested against the hosted service in this
canary; SDK/API and PostgreSQL matrix tests are separate. This is not a claim
of full Discord parity or physical Stage verification. Missing or older
backends still return explicit safe errors, never a public downgrade.

This SDK path supports only text/cards, with strict Boolean privacy and no
private attachments, controls or mentions. Public replies omit the privacy
flag even if `false` was supplied explicitly, retaining the legacy wire.
The context marks `replied` only after acceptance. Native DM/thread, HTTPS,
public update/ack/modal and existing private slash/form paths remain unchanged.

A caught private-response failure does not consume the event through automatic
ACK. The SDK preserves the private attempt even when the handler returns, while
ordinary events with no private attempt retain their normal automatic ACK.

## Advanced server resources — backend active, 8 October 2026

The approved package adds bounded multi-choice polls, server custom emoji reactions,
and AutoMod message/repetition limits with explicit block or temporary timeout actions.
It is **active in the hosted backend, with the interface and downloads served locally**.
Source/catalog readback and anonymous rejection passed; authenticated hosted feature
roundtrips and a public frontend release are not claimed by this activation.
Existing single-choice polls, Unicode reactions and keyword blocking remain defaults.
Stage remains deliberately unavailable. User-installed apps and command attachment
arguments are outside this package.

Poll creation uses the existing helpers with `multi_select: true` and
`max_choices: 2` (up to the number of options, at most ten):

```js
await bot.createPoll({serverId, channelId,
  question: 'Que jogos vamos jogar?', options: ['Xadrez', 'Cartas', 'Damas'],
  duration_hours: 24, multi_select: true, max_choices: 2,
});
```

Python uses `create_poll(server_id, channel_id=channel_id, payload={...})` with the
same payload keys. Human ballots replace the complete option set atomically;
percentages count distinct voters and can sum to more than 100%.

The server's current emoji resource UUID identifies a custom reaction. A display
name can change without creating a second reaction. Both SDKs send the full
`<:name:expressionUUID>` token; only the backend authorizes the current resource:

```js
await bot.addReaction({serverId, channelId, messageId, emoji});
await bot.removeReaction({serverId, channelId, messageId, emoji});
await bot.setReaction({serverId, channelId, messageId, emoji, enabled: true});
```

Python equivalents are `add_reaction`, `remove_reaction` and `set_reaction` with
positional server, channel, message and emoji arguments; `set_reaction` also
requires a Boolean `enabled`. Command contexts expose the same helpers using
their own server/channel. Current installations still need Add Reactions.
This preserves the existing server-message scopes; it does not enable sharing
server emoji into private human or bot DMs. Only the authenticated media broker
may display the image. Missing new backend support produces an explicit error,
without truncating the token or silently retrying the old mutation.

AutoMod keeps the existing rule helpers. New rule fields are documented in
`ALTARA_SERVER_BOT_RESOURCES.md`. Automatic timeout additionally requires current
timeout authority and role hierarchy; publication does not grant it to any bot.
Arbitrary user regex and machine-learned spam classification are not included.
