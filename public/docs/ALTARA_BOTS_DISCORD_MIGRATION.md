# Move a Discord bot to ALTARA

You can adapt a bot you own or have permission to modify. ALTARA uses its own
tokens, IDs, clients and permissions. Changing a Discord token to an ALTARA token
does not make discord.js or discord.py communicate with ALTARA. A third-party
hosted bot needs a version supplied by its maintainer.

## What can be reused?

Reuse platform-independent code: FAQ answers, arithmetic, business rules, storage
you control and external service integrations. Adapt registration, events,
option parsing, replies and every platform API call. Discord server, channel,
user and role IDs are not ALTARA IDs. Rebuild those mappings explicitly; do not
copy authorization decisions or role grants blindly between platforms.

## Capability comparison

| Feature | Current ALTARA support |
| --- | --- |
| Bot profile, installation, slash commands and options | Supported |
| Server roles, name colours, protected managed role, channel permissions | Supported; ALTARA permission rules apply |
| Replies and own-message actions | Text replies, reactions, pins, own-message editing/deletion with the relevant grants |
| New messages/member joins | Opt-in polling handlers after event backend activation, owner Intents and server authorization; metadata is redacted by default. No full Discord Gateway or presence feed |
| Structured rich message cards | Hosted backend active; SDK send/reply/edit and updated local chat rendering. Older chat releases need updated assets. See the SDK guide |
| Buttons, interaction menus, modals | Pending platform/API support |
| Link previews | Supported with `bot:embed_links`; structured cards share this permission |
| File uploads | Public attachment permission remains reserved/disabled; do not treat the client argument as an available upload API |
| Voice | Scoped connection/state and exact-connection lifecycle methods; Node music starter publishes local files and optional YouTube links/search or Spotify track matches. Activation and audible live verification tracked in ALTARA_BOTS_MUSIC.md |
| General moderation / server and channel management | No equivalent complete API in these source clients |
| Direct drop-in discord.js / discord.py compatibility | Not available |

The target is a broad ALTARA bot platform, including the categories covered by
Discord bots. The table reports what is actually available now; it is not a
restriction to ping/welcome bots. Track the remaining work in
[Bot capabilities](ALTARA_BOTS_CAPABILITIES.md).

### 1. Inventory your bot

For event handlers, map Discord `messageCreate` to ALTARA `messageCreate` and
`guildMemberAdd` to `serverMemberAdd` in JavaScript. Python uses
`@bot.event("message_create")` and `@bot.event("server_member_add")`. Follow the
three authorization steps in [Event setup](ALTARA_BOTS_SDK.md#new-messages-and-member-joins).
Handlers can be retried; persist idempotency by event ID for side effects.

List every command, incoming event, platform API call, interactive component,
background task and permission. Map each to the table above. Unsupported
features need a redesign or must wait for a supported API; mark them clearly
instead of silently dropping them.

### 2. Create a dedicated ALTARA test bot

Create an application and bot, copy the token once and keep it in a private `.env`.
Install it in a test server with the four default grants: send messages, use
slash commands, read channel names and manage its own commands. Request optional
grants only for methods you use. A process and an ALTARA token are required even
if the same business logic already runs on Discord.

### 3. Download the matching starter

In Developer Portal -> Code or Docs, download **FAQ bot (JavaScript)** or
**Calculator bot (Python)**. Extract the whole archive. The clients, application
code, `.env.example`, README and these guides are included. Do not paste the
token into copied source code or use an unverified npm/PyPI package name.

### 4. Adapt registration, options and replies

| Discord concept | ALTARA equivalent |
| --- | --- |
| discord.js SlashCommandBuilder / interactionCreate | `bot.command(name, metadata, handler)` |
| discord.py app_commands command decorator | `@bot.command(name, description=..., options=[...])` |
| JS interaction.options.getString(...) | `ctx.option(name)`; validate/convert numeric values |
| Python typed command argument | `ctx.option(name)`; validate the received value |
| interaction.reply / response.send_message | `await ctx.reply(text)` |
| Discord login / Gateway | ALTARA login/run -> code sync -> polling -> handlers |

Our new reference examples demonstrate the boundary:

- **FAQ JavaScript:** `discord-before.js` and `index.js` both use `faq.js`.
  Only the adapter differs. Customize its answers for your server.
- **Calculator Python:** `discord_before.py` and `main.py` both use
  `calculator.py`. Decimal arithmetic is bounded and never evaluates user code.

These are newly written migration examples, not a claim that somebody else's
production bot was imported. Their ALTARA adapters have local integration tests;
the Discord references have not been authenticated in a live Discord session.

### 5. Check permissions and failures

Run a known command and an invalid-input case. Deny View Channel for the bot and
confirm it cannot read, respond or appear in that channel. Deny Send Messages
and confirm replies are rejected. Assign/unassign a custom role and confirm
permissions and enabled role name colour update. Restart the process and verify
commands still work without duplicate replies.

In a dedicated hosted test bot, also regenerate its token, confirm the old token
fails, restart with the new token, remove/reinstall and check old custom grants
do not return. Those live lifecycle checks need to be performed on the specific
hosted environment; local simulated tests do not certify them.

### 6. Run on your own host

Keep the process running on your PC during development or your existing app
host/VPS for sustained operation. ALTARA does not host arbitrary bot code. No
public inbound endpoint is needed for the default polling mode. Advanced webhook
mode is a separate optional operator-enabled path.

## References

- [ALTARA source clients](ALTARA_BOTS_SDK.md)
- [ALTARA quickstart](ALTARA_BOTS_QUICKSTART.md)
- [ALTARA hosting](ALTARA_BOTS_HOSTING.md)
- [Discord bots and interactions](https://github.com/discord/discord-api-docs/blob/main/developers/bots/overview.mdx)
- [discord.js documentation](https://discord.js.org/docs)
- [discord.py application commands](https://discordpy.readthedocs.io/en/stable/interactions/api.html)
