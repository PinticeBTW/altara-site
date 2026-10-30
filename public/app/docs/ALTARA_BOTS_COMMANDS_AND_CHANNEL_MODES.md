# Advanced commands and channel modes

These interfaces are included in the bot expansion package published to the
ALTARA hosted backend on 2026-10-07: eight migrations and sixteen Edge functions.
Hosted catalog and access checks passed; the deployed function sources match the
reviewed package. Stage was deferred on 2026-10-07 at the user's request. Its
implementation and historical test evidence are preserved for later work, but
Stage is unavailable in the current SDK release. Every `stage_*` surface action
and `channel_mode_set` with `mode: "stage"` fails locally with
`stage_feature_disabled` before any request. No environment variable or client
option enables it. Normal voice, forum modes and the other bot APIs retain their
existing behavior. Physical Stage activation and audience/speaker audio remain
unverified; the previous pending test is not an active feature.

## Command definitions

Node `bot.command(name, handler, definition)` and Python
`@bot.command(name, **definition)` accept `CHAT_INPUT`, `USER` and `MESSAGE`.
Existing flat slash commands keep their names and string option values. A typed
command has a separate registry key, so `USER:Inspect` does not replace the
slash command named `inspect`. Context command labels allow spaces and Unicode.

Slash options accept `SUB_COMMAND` and `SUB_COMMAND_GROUP`; groups contain
subcommands, and subcommands contain ordinary options. Mixed root leaf/subcommand
definitions, duplicate names, excessive nesting, unknown fields and unsupported
types are rejected. A level contains at most 25 options. Entity values are UUIDs
resolved by current server/channel authority, not objects supplied by the client.
Message targets require current message history access and exclude deleted or
encrypted message content. Context fields include `subcommandGroup`, `subcommand`,
`targetId`, `targetUser`, `targetMessage`, and selected leaf options; Python uses
the equivalent snake_case fields.

Node `bot.autocomplete(name, handler)` and Python `@bot.autocomplete(name)` receive
a focused option context. Return choices through `await ctx.respond(choices)`.
String/integer/number choices are checked against the focused type and are
limited to 25. Autocomplete expires after ten seconds, stays private to the
actor, and cannot create public messages or open forms. Empty choices are valid.

Command attachment schema type recognition is separate from an authorized human
upload broker; registration alone must not be treated as upload permission.
User-installation contexts also require a separate authorization flow.

## Native message controls

Entity selects expose `isUserSelectMenu`, `isRoleSelectMenu`,
`isMentionableSelectMenu`, `isChannelSelectMenu` and authoritative `resolved`
entities. Python uses snake_case methods. Native DM/thread contexts contain
their real `source_kind` and source message ID. A DM has no public channel ID;
a thread carries its own thread ID and parent channel. Replies, uploads and
history bind that scope. The full polling cycle reads the legacy component
queue and the native queue separately and acknowledges each native lease
through its own response route. Individual legacy poll methods retain their
previous meaning.

## Forum modes and deferred Stage implementation

| Node method | Python method | Action |
| --- | --- | --- |
| getChannelMode / setChannelMode | get_channel_mode / set_channel_mode | Read/change metadata mode (normal/forum; Stage unavailable) |
| createForumPost / listForumPosts | create_forum_post / list_forum_posts | Existing native thread plus first message |
| getStageState | get_stage_state | Unavailable; preserved for a later release |
| setStageParticipant | set_stage_participant | Unavailable; preserved for a later release |
| requestStageSpeak | request_stage_speak | Unavailable; preserved for a later release |
| getServerEventStatus / updateServerEventStatus | get_server_event_status / update_server_event_status | Finite event lifecycle |
| setServerEventResponse / listServerEventBots | set_server_event_response / list_server_event_bots | Bot RSVP using a real bot identity |

Each mutation supplies a UUID `requestId` (`request_id` in Python). Reusing it
with different data fails. Forum mode keeps the existing text channel and native
thread engine; top-level posts are refused while the mode is active. The Stage
helpers remain in source for compatibility, but now reject instead of sending
read, participation or activation requests.

Human channel controls use the backend's self-bound channel permission snapshot.
After creation, the local frontend refreshes that snapshot before publishing the
channel UI. Opening mode controls also hydrates a missing channel, waits out an
older in-flight snapshot, and ignores replies after an account, modal or server
change. Local regression tests cover these paths; no owner shortcut is added.

### Preserved Stage design (inactive)

The following describes the saved implementation, not an available API.
Reactivation requires a separately reviewed release and renewed verification.

A Stage transition returning `pending` is not active. Legacy human voice JWTs
could last six hours, including tokens that never connected; activation waits
six hours and ten minutes. Demotion has the same conservative token barrier.
Listing or removing connected participants cannot establish that unused tokens
were revoked. Speaker approval also binds the current connection, existing role
permissions, moderation state, and bot voice capabilities.

Provider enforcement requires both the durable SQL media gate in `enabled` and
the explicitly verified Edge flags `SERVER_VOICE_MEDIA_AUTHORITY_ENABLED=true`
and `ALTARA_STAGE_ISOLATED_ISSUERS_VERIFIED=true`. The second flag is false by
default and may only be enabled after verifying the deployed `livekit-token`
legacy server cutoff, `server-voice-media-v2` isolated issuer, and
`bot-voice-token` policy gate. Shared server rooms remain pending. No silent
room migration is performed. The human `altara-channel-modes` gateway action
`channel_mode_get` retries trusted enforcement and then reads current state.

Enforcement changes only publishing. It preserves the current subscription,
data and metadata permission bits. A late grant, lost provider response or
authority change triggers an awaited publication denial; a failed compensation
returns an error, never successful activation. Physical/cloud Stage behavior
remains unverified; local SQL and provider transport fixtures are not physical
or cloud verification.

## Event lifecycle and additional SDK aliases

Allowed status transitions are `scheduled → active → completed` and
`scheduled → canceled`. Completed/canceled events cannot reopen. Human RSVP
insert/update is refused once status stops being scheduled; existing deletion
can still clear a human response. Bot attendees use bot IDs, never fake human
profiles. Human status controls retain the existing event management authority.

The SDK aliases also cover channel permission overwrites, server profile fields,
audit reads, polls, finite keyword AutoMod rules, and emoji/sticker assets through
their existing scoped endpoints. Expression uploads send a bounded raw image
(PNG/JPEG/GIF/WebP, at most 512 KiB) to `altara-server-expression-media` and then
bind the resulting asset ID through the expression action. These finite APIs do
not imply support for every Discord endpoint or every AutoMod rule type.
