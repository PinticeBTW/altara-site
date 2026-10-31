# ALTARA bot platform: capabilities and delivery plan

The product target is that developers can build the same categories of bot they
build on Discord: communities, welcomes, games, support, moderation, automation
and voice. This is platform support for every bot, rather than a special LEYLEY
feature. Full compatibility is not implemented yet. Existing Discord libraries,
tokens, IDs and third-party hosted services need explicit ALTARA adapters.

## Current verified foundation

Application/bot profiles, token connections, installation review, per-server
grants, managed roles, name colours and channel permission checks are present.
Slash commands and options, text replies, public-channel history, reactions,
pins and own-message editing/deletion have SDK methods. General message-create
and member-join events use opt-in owner/client intents and server grants.
DM/private/encrypted/system/bot messages are excluded from that event feed.

LEYLEY's slash ping, message ping and member welcome were observed working in
JA FOSTE. This verifies those paths, not every platform capability. The user
deferred the manual disconnect/reconnect test; keep it deferred.

## Work in order

| Stage | Capability | State / completion criteria |
| --- | --- | --- |
| 1 | Rich messages | Hosted backend active: SDK send/reply/edit, structured cards, persistence, limits and grant/channel checks. Hosted send/edit/text and invalid-card rejection verified; user visually confirmed a card in the real chat. Local rendering and opt-in images tested. Published chat release still required |
| 2 | Interactive messages | Hosted backend active: buttons, string selection menus and text-input modals for Bot Token Connection SDKs; actor/channel checks, ownership, expiry, leases and duplicate-action protection. Database, SDK and isolated browser tests passed. Hosted panel storage, invalid-control/auth rejection and authenticated live greeting/menu/form responses verified after the actor-access correction. See ALTARA_BOTS_COMPONENTS.md |
| 3 | Files and richer formatting | Hosted backend active on 2026-10-02: scoped private uploads, quotas, validated types, download access, safe Markdown, private delivery/cache provenance and explicit member mentions. Local behavior tests and hosted catalog/authentication/access checks passed; new authenticated real-chat flows were not tested today |
| 4 | Roles and moderation API | Hosted backend active on 2026-10-02: role CRUD/assignment/removal, member/message moderation and server/channel/event operations with hierarchy, grants, idempotency and audit. Local authority tests and hosted catalog/authentication/access checks passed; authenticated real-chat actions were not tested today |
| 5 | More events and reliability | Hosted backend active on 2026-10-02: member leave/update, message edits/deletes, reactions, protected basic presence, voice/thread events, leases and backpressure; polling stays compatible. Local delivery tests passed; new authenticated live delivery paths were not exercised today |
| 6 | Voice and music | Real Node RTC publisher, local files, YouTube links/search and Spotify track matching, slash controls and fenced connection lifecycle implemented. Backend activated with approval on 2026-10-01; operator confirmed audible test melody and YouTube link playback in MUSICA. Search and Spotify source resolution verified; their listener checks and full control listening checks remain pending. Exact connection cleanup verified. See ALTARA_BOTS_MUSIC.md |
| 7 | Additional platform surfaces | Hosted backend active on 2026-10-02: dedicated consenting bot DMs, threads, scheduled server events, scoped webhooks and individually consenting microphone reception/recording. Local behavior tests and hosted catalog/authentication/access checks passed; new authenticated chat/capture flows were not tested today. See ALTARA_BOTS_PLATFORM_V2.md |

These are delivery stages, not a claim of exhaustive Discord parity. Keep a
method/event inventory as each surface lands. External-service integrations,
databases and game/business logic can already run in the developer's own process.

## Rich-message activation package

1. Apply `supabase/migrations/20261001130745_bot_rich_embeds_v1.sql` after reviewing it.
2. Deploy updated `altara-bot-message-send`, `altara-bot-respond` and
   `altara-bot-interaction-dispatch` functions.
3. Serve the updated chat including `lib/botEmbeds.js` and card styles; distribute
   the updated source clients/starters.
4. In a dedicated test bot, send a card through a slash reply and a message/member
   event; edit it, reload history, and check that permissions denied on another
   channel prevent the card. Do not overwrite an existing command registry.

The migration creates distinct rich RPCs while leaving the text RPC definitions
and signatures unchanged. It clones the current authoritative access, rate and
interaction gates using guarded anchors, and fails transactionally if the
expected baseline structure has changed. New endpoints are service-only.
Embeds are stored in message metadata, so existing history and realtime paths
can transport them. A storage trigger also prevents older RPCs from bypassing
embed validation/permissions through arbitrary metadata. No existing data is
deleted or rewritten. This original package did not enable bot uploads; the
separate private-upload API was activated in the 2026-10-02 expansion below.

The user explicitly authorized backend activation on 2026-10-01. The migration
was applied successfully and that activation used:
`altara-bot-message-send` v27, `altara-bot-respond` v29 and
`altara-bot-interaction-dispatch` v33. Sources matched the reviewed local
files; authentication settings and original text RPC definitions are unchanged.
The local chat assets are updated. Published website/desktop chat releases
were not deployed as part of this backend authorization.

Hosted verification used the existing LEYLEY installation in JA FOSTE/general:
an embed-only card was sent, edited and read back from storage; an invalid link
returned HTTP 400; an ordinary text message succeeded. Slash/webhook rich replies
and denied channel permissions have focused local tests, but have not yet been
exercised in an authenticated live chat. The browser extension denied access,
and the user subsequently confirmed the real-chat card visually.

## Interactive-message activation

The user explicitly authorized activation on 2026-10-01. Migration
`20261001140325_bot_message_components_v1.sql` was applied successfully;
`altara-bot-message-send` v28, `altara-bot-respond` v30 and
`altara-bot-components` v1 were active at that activation and matched the reviewed sources.
Existing rich RPC definitions and authentication settings were preserved.
The component event table has RLS enabled, no client table grants and no client
schema access; its no-policy advisory is intentional because guarded RPCs are
the only access path. The local chat assets and downloads are updated.
LEYLEY's optional `/painel` demonstration adds a slash command alongside its
three existing commands. Text prefixes are no longer used by the starter.
The composer refreshes a missing slash command once on submission so a bot's
newly synced registry does not require a manual page reload. Generic SDK message
events remain available for developers' own message handlers.
Authenticated live greeting, game selection and form submission were verified
after applying `20261001145752_bot_component_actor_access_fix.sql`. The original
service-only bot API was preserved; actor RPCs reuse private channel authority
and the installation ceiling. Tests now model distinct actor/service JWT roles.
Advanced Webhook interactive delivery and the other limits in the components
guide remain future work. No public website/desktop release was deployed.

## Platform v2 activation: 2026-10-02

The approved expansion applied eight migrations and published nine ACTIVE
functions. Hosted verification checked the permission catalog, required RPCs/DM
table, private upload bucket, service-only database access and anonymous HTTP
rejection. No existing installation acquired the new sensitive grants. The
[activation record](ALTARA_BOTS_PLATFORM_V2.md#hosted-activation-2026-10-02)
lists the exact package and inspected boundaries.

Music recovery and consenting microphone capture are included in this backend
activation. The user's earlier audible melody/YouTube confirmation remains
limited to those existing playback paths. The new authenticated chat flows,
recovery and real microphone reception/recording were not exercised today.
This is broad ALTARA support, not complete Discord API or bot-library parity.

References: [Discord messages](https://docs.discord.com/developers/resources/message),
[Discord interactions](https://docs.discord.com/developers/interactions/overview),
[Discord Gateway](https://docs.discord.com/developers/events/gateway/overview).
