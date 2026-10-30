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

LEYLEY's slash ping, message ping and welcome-message content were observed in
JA FOSTE. On 2026-10-05, one real join by a controlled secondary account produced
one automatic welcome in the normal bot process. Hosted metadata confirmed one
message; it was visible after the chat reloaded. The user deferred the manual
disconnect/reconnect test; keep it deferred.

### Local follow-up and hosted history activation: 2026-10-04

Human mention selection and bot mention sound were verified in the real chat.
Thread draft isolation and Node/Python event-feed recovery have focused runtime
regression coverage. Private DM history pagination is active in the hosted backend
after explicit operator approval: migration `20261004211958` and version 3 of
`altara-bot-surfaces`, preserving custom authentication and current grants.
Read-only own-account history checks passed. The real DM has fewer than 50 messages;
larger history loading and scroll anchoring were verified locally. Compatible
clients retain their latest-page behavior on older servers.
See [the platform follow-up](ALTARA_BOTS_PLATFORM_V2.md) and
[SDK recovery](ALTARA_BOTS_SDK.md). These checks do not verify a live reconnect or
the remaining microphone/Advanced Webhook flows.

Bot-to-human DMs have a fixed 30-day retention rule, covering both senders and
private attachments, with pinned messages preserved. The owner corrected the
initial optional design on 2026-10-04; the mandatory-policy migration and daily
cleanup worker are active. There is no individual on/off setting. See
[the bot DM guide](ALTARA_BOT_DM_MESSAGE_ACTIONS.md). This does not expire human DMs.

### SDK polling follow-up: 2026-10-05

Node/Python polling no longer skips all other enabled feeds when the command
endpoint fails temporarily. Components also remain eligible after a temporary
public/private feed failure. Requests stay sequential; authentication rejection,
stop/replacement fences, acknowledgements and retry limits retain their existing
boundaries. Source downloads include this correction. Full-cycle recovery has
focused local regression coverage. A guarded real LEYLEY test on 2026-10-05
also passed: a 12-second command-endpoint HTTP 503 did not stop DM replies;
a separate 12-second failure across bot endpoints kept a DM pending and delivered
one reply after recovery. The normal local process was restored. This verifies
temporary API failures, not every network or process-crash scenario.
See [SDK recovery](ALTARA_BOTS_SDK.md#full-polling-cycle-recovery-2026-10-05).

### SDK stop boundaries: local source update, 2026-10-05

The Node/Python source clients now check the captured generation between public
event/component callbacks and before completing or acknowledging delivery. Old
event contexts refuse new replies, sends, welcomes and component responses.
Standalone polls remain available, and manual client methods and slash contexts
keep their existing behavior. Focused tests reproduced the failure before the
change and passed afterwards. Already executing custom code and requests
already sent/accepted can still complete; this is not transaction cancellation.
No backend change or restart of the existing LEYLEY process was required.
See [the SDK boundaries](ALTARA_BOTS_SDK.md#event-handler-stop-boundaries-2026-10-05).

### Private slash interactions: hosted active, 2026-10-05

Author-only slash replies and forms opened directly by a slash command are
active in the hosted backend. Node and Python reuse the existing reply/modal APIs; forms
return a private response to the invoking account. Payloads never enter public
message history. Existing public component replies remain supported. Advanced
Webhook callback authority now supports initial private text/cards and guarded
public replies, as described below. Malformed private intent and form responses
are rejected rather than silently becoming public. External delivery is not
verified and is separate from the active Bot Token Connection paths.

The local browser proof covers rendering, dismissal, keyboard focus, one form
submission and stale-response rejection across account/channel changes.
With explicit user approval, `bot_private_slash_interactions_v1` was applied as
hosted version `20261005014035`; `altara-bot-respond` v32,
`altara-bot-components` v2 and `altara-bot-interaction-dispatch` v34 are ACTIVE.
The final authenticated real-chat check used local web assets
`private-interactions-ui-v5`: `/painel` showed LEYLEY's name/avatar and its private
reply with no Thinking indicator before any further interaction, still clear
after at least 20 seconds. A second invocation opened the slash form; one submit
returned a private confirmation, closed the form and restored composer focus,
also without a Thinking indicator. Neither private text appeared in the public
timeline; hosted metadata showed no linked public messages. This verifies the
local web client against the active backend, without a hosted frontend deployment.
See [the interaction guide](ALTARA_BOTS_COMPONENTS.md#private-slash-replies-and-forms-hosted-active-2026-10-05).

<a id="advanced-webhook-reply-authority-prepared-locally-2026-10-05"></a>

### Advanced webhook reply authority: hosted active, 2026-10-05

With explicit user approval, `bot_callback_response_authority_v1` was applied
as hosted version `20261005104633` (local source `20261005102800`), and
`altara-bot-interaction-dispatch` v35 is ACTIVE with JWT verification retained.
The backend authority supports initial author-only text/card callback replies
and transactionally guarded public replies. The Node inbound example exposes a
strict Boolean privacy serializer while preserving public `hello`/`ping`/`roll`
handlers and raw-body HMAC verification. The 43-test local matrix passed.
Hosted read-only checks verified the approved body/service-only ACL, preserved
responder hashes and rejection of unauthenticated/invalid-JWT requests. These
checks do not prove a positive external callback round trip.

The operator gate `ALTARA_ENABLE_EXTERNAL_BOT_COMMAND_DISPATCH` remains
default-off in code and is enabled in the hosted configuration. The
existing apps remain on Bot Token Connection polling. A separate
owner-selected HTTPS route is active on the hosted backend, including exact verified
destination checks and one outbound delivery per stable request identity.
With explicit approval, the route migration was published as `20261005115207`,
the gate enabled and dispatcher v37 verified ACTIVE with JWT validation. Local
chat/portal sources are synchronized. A temporary fictional-data public TLS
test passed 12/12 transport/handler cases and closed its receiver/tunnel, using
a fixture-only DNS Resolver.
After the CHECK/expiry correction was published as hosted migration
`20261005131559`, independent hosted verification passed 10/10 checks. One
public `/ping` from the separate **ALTARA HTTPS TEST** bot passed through the
real authenticated portal/chat: one signed challenge, one signed command,
zero duplicate deliveries or signature rejections, and one responded event,
one reservation and one linked chat reply. HTTPS private replies were not
part of that earlier public `/ping` proof.
Endpoint verification is separate
from selecting delivery. Signed component/form delivery, webhook-opened modals
and deferred initial completion were still pending at that earlier stage; the
published follow-up is recorded below. The package does not support private callback
files, mentions or controls. Existing hosted SDK private replies/forms remain
active. See [the callback contract](ALTARA_BOTS_SDK.md#advanced-webhook-replies-authority-hosted-active-2026-10-05).

<a id="https-interactive-follow-up-prepared-locally-2026-10-05"></a>

### HTTPS interactive follow-up: hosted active, 2026-10-05

The approved follow-up is published as hosted migrations `20261005144103` and
`20261005144111`, with dispatcher v38 and responder v34 active. It enables
initial private text/cards, public buttons/string selects, command/control-opened
forms, signed component/form delivery and one deferred initial slash reply. It reuses the normal chat controls and author-only
results, with stable event IDs and inherited form transport. Deferred completion
uses the signed event identity and an `Interaction` credential within the fixed
five-minute event deadline; private presentation lasts at most 15 minutes.
At that earlier version, multiple follow-ups, private controls, uploads and
explicit mentions were unsupported. Bot Token Connection stays the default. A real authenticated run
confirmed private button/form content, five commands and public/private deferred
initial completion. The private-menu result was also visible after browser control recovered.
A fresh form submission also showed the corrected source bot name/avatar and
private confirmation.
The identity fix passed 16 focused local tests. Public update needs the existing
`bot:manage_messages` grant; the fixture without it was refused without a public
edit, so no positive live update is claimed. See [the contract](ALTARA_BOTS_SDK.md#https-controls-and-single-deferred-completion-prepared-locally-2026-10-05).

### Private DM lifecycle follow-up: hosted active, 2026-10-05

Updated JavaScript/Python source clients and a negotiated private runtime feed
add callbacks for DM edits, deletion, reaction addition/removal and pin state.
CREATE retains its old identity and shared delivery lease; older clients remain
CREATE-only. The package captures explicit message actions and current authority,
keeps only bounded event metadata and does not change installation grants,
recipient consent, human DM rendering or the mandatory 30-day retention rule.
Hosted activation was approved and verified on 2026-10-05 (migration
`20261005171342_bot_dm_lifecycle_events_v1`, surfaces version 6). The local
package passed 131 tests. Hosted checks confirmed schema/ACLs, byte-identical
function sources and authentication denial. A live LEYLEY test then verified
the five new mutation types, six acknowledged deliveries, actor separation,
redacted deletion and a private callback reply. Replay did not duplicate the
edit or reply. Only a newly created bot test message was altered/deleted;
normal DM ping kept working in the original process. The observer requested
mutation types only, without changing access or registrations. Existing bot processes are not automatically reloaded.

See [private lifecycle details](ALTARA_BOT_DM_MESSAGE_ACTIONS.md#private-lifecycle-feed-hosted-active-2026-10-05)
and the [SDK callback contract](ALTARA_BOTS_SDK.md#private-dm-lifecycle-events-hosted-active-2026-10-05).

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
Advanced Webhook interactive delivery was still future work at that activation;
the active HTTPS follow-up and its real checks are recorded above. The remaining
limits are listed in the components guide. No public website/desktop release
was deployed.

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

<a id="final-https-package-prepared-locally-2026-10-05"></a>

## Final HTTPS package: backend active (2026-10-05)

The package adds fixed-visibility follow-ups, private controls, explicit member
mentions and event-scoped public/private uploads. The operator-approved hosted
activation applied three migrations and activated three Edge functions on
2026-10-05. The matching site frontend and starters have only been updated and
served locally; no public frontend release is claimed. Authentication denials
were checked. Later scoped authenticated runs verified eight private deliveries
from a signed HTTPS command, private controls and a form, without public message
writes. A separate approved run verified public/private fictional TXT and PNG
uploads, own-account mentions, visible public captions and byte-exact downloads,
including private downloads after 79 and 118 seconds. Temporary grants, endpoint
settings and test receivers were restored or closed. These checks cover the
recorded test bot and actors, not indefinite availability or exhaustive API
parity. Earlier activation entries describe their verified version. See
[the rich HTTPS contract](ALTARA_BOTS_SDK.md#rich-https-results-prepared-locally-2026-10-05).

### Scoped real follow-up: verified 2026-10-06

LEYLEY was restarted with the current Node SDK and its existing 13 commands, and
answered a real DM ping. The initial role attempt exposed an invalid requirement
for a reserved nullable human actor. After that correction, a hosted SDK run
created a permissions-empty temporary role, assigned it to an approved ordinary
secondary member, replayed the assignment without duplication, removed it and
deleted the role. Original grants, role permissions and relative order were
preserved; normal API insertion/deletion changed numeric role positions, so
exact numeric position restoration is not claimed.

The initial browser voice attempt failed before opt-in. A later physical test
with explicit human consent received only the approved account's microphone:
232 numeric signal windows showed speech, mute/unmute and deafen behavior.
Recording was disabled and no audio recording was retained. Consent revocation
produced no new windows during the recorded 26-second observation; consent,
capture and temporary grants were then closed or restored. Listening remains
off by default. These checks do not establish recording or music queue continuity
across a restart.

The operator later reported the secondary account's leave/rejoin and supplied
screenshots; the chat then showed one welcome message and an enabled composer.
The reviewer did not continuously observe that account transition without F5,
so the reported replay is distinct from an independently observed no-reload
test. Full-project release validation remains separate from these scoped proofs.

### Bot package: hosted backend active, 2026-10-07

The local source and site now include nested slash commands, dynamic autocomplete,
user/message context commands, entity selectors and modern message layouts.
Native bot DMs and threads reuse the existing chat and interaction components;
private results and files remain bound to the invoking account and real source.
Incoming webhooks can stage files using their own revocable token.

The package also adds channel overwrites, audit reads, event attendees and server
profiles; native single-choice polls; server emojis/stickers; literal keyword
AutoMod; forum posts using native threads; and a finite event lifecycle with bot
RSVP. Permissions are checked by the server and are not granted automatically.

With explicit operator approval, all eight migrations were applied together to
the hosted project and the twelve existing plus four new Edge functions were
published. Their source files matched the reviewed packet, JWT settings were
preserved, and unauthenticated requests were rejected by all sixteen endpoints.
Hosted catalog, ACL/RLS, constraint and negative RPC checks passed. A positive
synthetic transaction verified command registration, admin authority, polls,
expressions, AutoMod and forum/rich-thread composition together; rollback left
no synthetic accounts or resources. This exercised SQL authority, not an
authenticated Edge caller. New Storage
delivery and authenticated browser flows have not been verified in this session;
the browser security policy refused control of the operator's tab.

Stage remains excluded from activation until current role/connection authority,
isolated media issuers, provider enforcement and the conservative legacy-token
barrier are verified. No infrastructure flags or bot grants were changed. The
matching frontend and downloads are served locally; no public frontend release
or physical Stage audio verification is claimed by this entry.

This is a defined feature set, not exhaustive Discord API parity. Polls are
single-choice with at most ten options and the documented finite durations;
AutoMod blocks literal keywords rather than implementing the full Discord rule
engine. User-installed applications and command attachment invocation require
separate authorization/upload flows. See [commands and channel modes](ALTARA_BOTS_COMMANDS_AND_CHANNEL_MODES.md),
[server resources](ALTARA_SERVER_BOT_RESOURCES.md) and
[channel controls](ALTARA_CHANNEL_MODES_UI.md).

### Item 3 expansion: hosted backend active, 2026-10-08

The approved package extends the published baseline with bounded message-rate and repetition AutoMod, authorized automatic timeouts, polls with multiple choices, and custom server emoji reactions. It preserves installed grants and the existing single-choice and Unicode paths. Stage remains deferred. User-installed applications and slash-command attachment arguments remain separate work.

Operator-approved activation applied the three feature migrations and updated the two existing handlers `altara-bot-surfaces` (version 15) and `altara-bot-message-send` (version 38). A minimal follow-up migration revoked the inherited service execution grant from the two new human poll RPCs, preserving authenticated ballots and the separate bot RPC. Their source, function/table ACLs, RLS, constraints and anonymous HTTP rejection were verified. The matching app, Node/Python clients and starter downloads are served locally; no public frontend release is claimed. Authenticated hosted feature roundtrips and real member timeouts were not exercised in this activation. Detailed limits, timeout/block behavior and proof boundaries are in [server resources](ALTARA_SERVER_BOT_RESOURCES.md). This finite package does not establish full Discord bot API parity.
