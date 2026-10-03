# ALTARA Bots Quickstart

This is the default ALTARA bot flow. The concepts are familiar to Discord bot
developers, but ALTARA has its own API and does not run Discord bots unchanged.

1. Create an application.
2. Choose **Create Bot**. **Create Mod / Plugin** is coming later.
3. Create a bot.
4. Copy the bot token once.
5. Write slash commands in code.
6. In **Permissions**, select the optional grants your code needs and click
   **Save permissions**, then install the bot into a server.
7. Open the Code / Quickstart page for the app.
8. Run the bot locally or on a VPS with `ALTARA_BOT_TOKEN`.
9. ALTARA syncs commands from code, then the bot receives slash commands and replies.

No public HTTP endpoint is required.

The install link requests the saved permission defaults. Changing a checkbox
alone does not save it. Existing server installations keep their current grants;
a server manager must authorize any permission update separately. The four core
command permissions are required. Enable optional permissions only for methods
your bot actually calls. New message/member events are opt-in and require backend
activation, saved Intents, server grants and matching client intents; see
[the event setup](ALTARA_BOTS_SDK.md#new-messages-and-member-joins). Presence events
are not available.

## Download a complete starter

Developer Portal -> **Code** or **Docs** offers a **FAQ bot (JavaScript)** and
a **Calculator bot (Python)**. Each archive contains its source client, runnable
example, `.env.example`, README and migration guide. JavaScript includes
`altara.js` plus `altara-client.js`; Python includes `altara.py`. These are source
clients, not advertised npm/PyPI packages. Use a dedicated test bot because code
sync disables missing code-managed commands.

Read [Source clients](ALTARA_BOTS_SDK.md) for the supported methods and
[Discord migration](ALTARA_BOTS_DISCORD_MIGRATION.md) before adapting an existing
bot. The FAQ starter needs Node.js 22.12+; the calculator needs Python 3.10+.

### Start the downloaded examples

Open a terminal in the extracted folder (where `package.json`/`index.js` or
`requirements.txt`/`main.py` are located). Use a dedicated test bot, add its
token to `.env`, and install that bot in a test server. The commands below
preserve an existing `.env`; do not replace a token already configured there.

**JavaScript, Windows PowerShell:**

```powershell
node --version
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `.env`, set `ALTARA_BOT_TOKEN`, then run `npm start`. Try `/faq` and choose
a topic. This starter has no package dependencies to install.

**JavaScript, macOS/Linux:** use `node --version` and
`[ -f .env ] || cp .env.example .env`, edit `.env`, then run `npm start`.

**Python, Windows PowerShell:**

```powershell
python --version
python -m venv .venv
if (!(Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Edit `.env`, set `ALTARA_BOT_TOKEN`, then run
`.\.venv\Scripts\python.exe main.py`. No activation script or execution-policy
change is needed. Try `/calcular`, choose `somar`, `a=1.2`, `b=2.3`, and expect
`Resultado: 3.5`.

**Python, macOS/Linux:**

```sh
python3 --version
python3 -m venv .venv
[ -f .env ] || cp .env.example .env
.venv/bin/python -m pip install -r requirements.txt
```

Edit `.env`, set `ALTARA_BOT_TOKEN`, then run `.venv/bin/python main.py`.

Keep the process running and connected. Closing it, sleeping or shutting down
the PC takes the bot offline after its activity signal expires. Restart after
changing code or `.env`. For always-on operation, use a host that can keep the
same process running and store the token in its private environment settings.

If commands appear but cannot reply, check the running process, approved
installation permissions, and the bot's View Channel/Send Messages access.
These two downloads handle slash commands; ordinary-message replies need
handlers plus matching saved Intents, server grants and client intents.

The Node and Python example clients poll once per second by default, wait after
each request, and respect server retry hints. Restart a running bot after updating
its client to pick up the new interval. Node's `ALTARA_POLL_INTERVAL_MS` override
remains supported, with a minimum of 1000 ms.

Channel permissions also apply to the installed bot's managed role: denying
**View Channel** blocks commands, replies and channel reads for that bot and
removes it from that channel's member list. The bot remains installed in the
server. Denying **Send Messages** blocks replies while preserving visibility.

You do not paste code into ALTARA. You run the bot process on your PC, VPS, or hosting provider.

## Run The Example Bot

```bash
cd examples/altara-ping-bot-node
npm install
cp .env.example .env
npm start
```

Put the token from the Developer Portal in `.env`:

```text
ALTARA_BOT_TOKEN=<copy your bot token here>
```

## Define Commands In Code

The bot code is the source of truth for normal commands. Define command metadata and behavior together:

```js
const { AltaraClient } = require("./altara-client");

const bot = new AltaraClient({
  token: process.env.ALTARA_BOT_TOKEN,
});

bot.command("ola-mundo", {
  description: "Primeiro comando do bot",
}, async (ctx) => {
  await ctx.reply("Olá mundo!");
});

bot.command("ping", {
  description: "Teste de ligação",
}, async (ctx) => {
  await ctx.reply("Pong!");
});

bot.login();
```

When `bot.login()` runs, the client syncs command names, descriptions, and options to ALTARA. The Developer Portal displays synced commands, but it is not the primary command builder for normal bots.

For `roll`, define an optional string option named `dice` in code if you want `/roll 2d6` to arrive as `ctx.option("dice")`.

## Install The Bot

Install the bot into a server with:

```text
bot:use_slash_commands
bot:send_messages
bot:read_basic_channel_metadata
bot:manage_own_commands
```

## Use It

In a server text channel, run:

```text
/ola-mundo
/ping
/roll d20
```

ALTARA delivers an interaction event to the running bot process. `ctx.reply()`
supports text of up to 2000 characters and structured cards. Optional grants
enable link previews, reactions, pins, bounded history and own-message actions.
The SDK also supports buttons, string menus, text-input modals and scoped
message/member-join events; see the SDK and components guides. Public attachment
permission remains reserved/disabled. This is not a full Discord Gateway adapter.

The example clients retry temporary connection and command-sync failures with backoff, respect polling rate-limit hints, and stop when the token is rejected or revoked. Node requests have a 20-second timeout by default, including the response body; `bot.stop()` cancels pending requests. Python requests use a 20-second HTTP timeout and `bot.stop()` wakes the polling delay.

Command sync treats your code registry as authoritative, including an empty registry: removing all code-defined commands disables the previous code-managed commands. Webhook-backed commands are preserved by the server's existing sync contract.

Voice join/state/control actions carry the original interaction event ID. Pass
a voice channel explicitly, or leave it empty to resolve the invoker's current
voice channel. A text-channel ID is not a voice target. Direct calls for those
actions must supply `eventId` (Node) or `event_id` (Python); the server validates
the claimed event and current permissions. The music player uses an exact
`connection_id` for subsequent heartbeats and cleanup, without reusing expired
human interactions. See ALTARA_BOTS_MUSIC.md for the real Node audio starter.

`/ping` is only a connection test. Real bots should add commands that match the product they are building.

## Advanced Webhook Mode

The Interaction Endpoint / Webhook flow is optional Advanced mode. Use it only when you want an inbound public HTTPS endpoint or a serverless-style deployment.
