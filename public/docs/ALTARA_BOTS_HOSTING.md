# ALTARA Bots Hosting Guide

ALTARA bots run outside ALTARA. ALTARA does not execute third-party bot code in the app, browser, database, or user devices.

## Default: Bot Token Connection Mode

Normal bots do not need a public endpoint.

Run the bot process on your PC for testing or on a VPS/app host for production. The bot authenticates with `ALTARA_BOT_TOKEN`, syncs command definitions from code, connects outward to ALTARA, receives slash command events, and replies through ALTARA.

No ngrok, localtunnel, Cloudflare Tunnel, or public HTTPS route is required for the default flow.

## Hosting Options

- Local PC: good for development and testing. The bot is online only while the terminal stays open.
- VPS: the simplest production option. Run the bot as a long-running Node.js process.
- Render, Railway, Fly.io, or similar app hosts: good when you want managed deploys and environment-variable storage.
- Docker or PM2: useful later for process supervision, restarts, and repeatable deploys.
- Advanced Webhook Mode: serverless/webhook-only deployments. Requires a public HTTPS endpoint.

## Required Secret

Use `.env` locally or your host's secret manager in production:

```text
ALTARA_BOT_TOKEN=<copy your bot token here>
```

`ALTARA_FUNCTIONS_URL` is optional for the hosted ALTARA project, but it can be set when testing against a different environment.

Never put bot tokens, signing secrets, service role keys, Vault keys, E2EE keys, or user auth tokens in frontend code, invite URLs, browser storage, public logs, screenshots, or repository commits.

## Bot Token Connection Mode Flow

1. ALTARA users run an installed slash command.
2. Your bot process syncs command names, descriptions, and options from code.
3. ALTARA creates an interaction event for the installed bot.
4. Your bot connection authenticates with `Authorization: Bot <token>`.
5. ALTARA delivers only events for that bot.
6. Your bot responds through ALTARA.
7. ALTARA stores the plain-text bot response in bot response storage.

Reply text is limited to 2000 characters. `bot:embed_links` enables ALTARA link
previews; it does not provide rich Discord embeds. Client attachment arguments
exist for safe descriptors, but public `bot:attach_files` installation remains
reserved/disabled. The starter downloads do not promise file uploads.

## Client downloads and migration

Developer Portal -> Code or Docs provides complete FAQ (JavaScript) and
calculator (Python) starter downloads with `altara.js`/`altara-client.js` and
`altara.py`. These are source clients for ALTARA's API. Read
[Source clients](ALTARA_BOTS_SDK.md) and
[Discord migration](ALTARA_BOTS_DISCORD_MIGRATION.md) for supported methods and
the changes needed to adapt your own bot. No drop-in Discord compatibility or
official npm/PyPI publication is claimed.

Voice connection, status and state helpers are available with optional voice
grants. The Node music starter now includes a real RTC audio publisher, local
file decoder, queue and slash controls. See ALTARA_BOTS_MUSIC.md for activation
status, supported files, dependencies and required audible verification.

## Advanced Webhook Mode

Advanced Webhook Mode is an optional serverless/public HTTPS path. Command delivery requires the operator to enable `ALTARA_ENABLE_EXTERNAL_BOT_COMMAND_DISPATCH`; it is disabled by default. Endpoint verification is available separately.

Callback URLs require HTTPS on port 443. ALTARA rejects redirects, local/private literal addresses, and DNS A answers that include a non-public address. Each callback connects to a validated A address while preserving the hostname for TLS and HTTP; IPv6-only endpoint domains are not supported in this mode.

Responses must finish within 3 seconds including headers and body, and remain within 64KB of streamed/decompressed data. Verification errors distinguish a timeout from an oversized response. These limits apply to verification and command delivery.

Webhook mode requires:

```text
ALTARA_SIGNING_SECRET=<copy your signing secret here>
PORT=3000
```

It also requires a public HTTPS route such as:

```text
POST https://your-domain.example/altara/interactions
```

Use Advanced Webhook Mode only when you explicitly want an inbound HTTPS endpoint.

## Additional server roles for bots

The bot context menu supports a **Roles** submenu for an active installation,
with the same color dots and checkmarks as human members. Clicking an ordinary
role saves the toggle immediately; the managed bot role stays checked and locked.
This needs
`20260930223646_bot_custom_roles_v1.sql`, after the existing
`2026-09-30_bot_channel_permissions_v1.sql` patch. Apply the migration only with
authorization to change the hosted database; the frontend has no direct-table fallback.

Assignments use a private table keyed by server, bot and role, independently of
human membership. The installation's managed role is always protected. The read
and write RPCs bind the actor to `auth.uid()`, require Manage Roles, enforce role
hierarchy, restrict Administrator assignment to the server owner, and prevent
permission escalation. Saving requires the previously read role IDs and rejects
stale updates instead of overwriting another manager's changes.

Custom roles participate in channel/category permissions. Role denies win over
role allows; the explicit bot member overwrite is applied last. Neither custom
roles nor Administrator bypass installation grants or private-channel restrictions.
Changes invalidate the private bot roster and command capabilities, and notify
existing voice policy authority. Disabling an installation retains its assignments
without allowing access. Removing it clears assignments, so reinstalling never
restores old grants.

Focused verification: `tests/bot-custom-roles-db.test.mjs` uses isolated PostgreSQL,
and `tests/bot-custom-roles-browser.test.mjs` uses isolated Chrome with backend
responses simulated. These tests do not exercise a real signed-in hosted session.
