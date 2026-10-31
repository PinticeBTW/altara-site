# ALTARA Bots: Discord-Like Adaptation Guide

ALTARA bots are designed to feel familiar to Discord bot developers, but ALTARA is Discord-like. API-level compatibility is not guaranteed yet.

ALTARA does not run third-party bot code. Your bot is an external process that connects to ALTARA with a bot token, receives slash command events, and sends replies.

## Concept Mapping

| Discord concept | ALTARA concept | Notes |
| --- | --- | --- |
| Discord Application | ALTARA Application | Top-level app identity in the Developer Portal. |
| Discord Client ID | ALTARA App ID / Client ID | Used in invite URLs and app configuration. |
| Discord Bot Token | ALTARA Bot Token | Server-side secret for Bot Token Connection mode. |
| Discord Gateway | ALTARA Bot Token Connection mode | The bot process connects outward and receives queued slash command events. |
| Discord Interaction Endpoint | ALTARA Advanced Webhook Mode | Optional public HTTPS endpoint flow. |
| Discord OAuth2 invite URL | ALTARA `/oauth2/authorize` | Browser-first server authorization flow. |
| Discord Application Commands | ALTARA Slash Commands | Discord-like schema; API compatibility is not guaranteed. |
| Discord Guild | ALTARA Server | Community/workspace where a bot is installed. |
| Discord Channel | ALTARA Channel | Text channels are supported for this phase. |

## Developer Flow

1. Open `/developers`.
2. Create an application.
3. Choose **Create Bot**. **Create Mod / Plugin** is coming later.
4. Create a bot and copy the bot token once.
5. Define slash commands in code.
6. Install the bot into a server.
7. Run the bot process locally or on a VPS with `ALTARA_BOT_TOKEN`.
8. ALTARA syncs commands from code, then the bot receives events and replies.

No public HTTP endpoint is required for this default flow.

Bot tokens and signing secrets are server-side secrets. Do not put them in frontend code, invite URLs, browser storage, logs, or screenshots.

## Invite URLs

ALTARA uses a browser-first authorize flow:

```text
https://altaraapp.com/oauth2/authorize?client_id=<app_id>
```

With explicit scopes and permissions:

```text
https://altaraapp.com/oauth2/authorize?client_id=<app_id>&scope=bot%20applications.commands&permissions=bot:send_messages,bot:use_slash_commands,bot:read_basic_channel_metadata,bot:manage_own_commands
```

Supported scopes:

```text
bot
applications.commands
```

Supported permissions for this phase:

```text
bot:send_messages
bot:use_slash_commands
bot:read_basic_channel_metadata
bot:manage_own_commands
```

ALTARA also accepts Discord-style numeric permission bitfields for the supported safe subset:

| Discord bit | Meaning | ALTARA permission |
| --- | --- | --- |
| `1024` | View Channel | `bot:read_basic_channel_metadata` |
| `2048` | Send Messages | `bot:send_messages` |
| `2147483648` | Use Application Commands | `bot:use_slash_commands` |

Unsupported bits are rejected with a visible warning. ALTARA does not silently grant broad permissions.

## Slash Command Schema

ALTARA slash commands use a Discord-like shape, but normal bot projects define this in code and let the client sync it to ALTARA:

```js
bot.command("ola-mundo", {
  description: "Primeiro comando do bot",
}, async (ctx) => {
  await ctx.reply("Olá mundo!");
});

bot.command("roll", {
  description: "Roll dice",
  options: [
    {
      name: "dice",
      description: "Dice expression, like 2d6",
      type: "STRING",
      required: false,
    },
  ],
}, async (ctx) => {
  await ctx.reply(`Rolling ${ctx.option("dice") || "1d20"}`);
});
```

The Developer Portal displays synced commands. It is not the primary command builder for normal Bot Token Connection projects.

Server-installed commands are available now. Global command propagation is planned later.

Leave callback URLs empty for Bot Token Connection mode. Command callback URLs and app interaction endpoints are Advanced Webhook Mode.

## Bot Token Connection Mode Event

The bot process receives Discord-like interaction payloads:

```json
{
  "id": "<event_id>",
  "type": "APPLICATION_COMMAND",
  "application_id": "<app_id>",
  "bot_id": "<bot_id>",
  "server_id": "<server_id>",
  "channel_id": "<channel_id>",
  "user": {
    "id": "<user_id>",
    "username": "<username>"
  },
  "data": {
    "name": "hello",
    "options": []
  },
  "created_at": "<iso_timestamp>"
}
```

## Response Payload

This phase supports text responses only. Content is rendered as plain text and limited to 2000 characters.

```json
{
  "event_id": "<event_id>",
  "type": "CHANNEL_MESSAGE_WITH_SOURCE",
  "data": {
    "content": "Hello from ALTARA!"
  }
}
```

## Advanced Webhook Mode

Advanced Webhook Mode is the ALTARA equivalent of Discord Interaction Endpoint. It requires a public HTTPS endpoint and signing-secret verification. Use it for serverless/public HTTP deployments, not for the default local/VPS bot flow.

## Example Node Bot

See `examples/altara-ping-bot-node/` for a complete connection-mode example.

Minimal shape:

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

bot.login();
```

## Phase 3 Gateway

Future Gateway work can replace the internal transport with a true WebSocket Gateway while keeping the same developer-facing API.
