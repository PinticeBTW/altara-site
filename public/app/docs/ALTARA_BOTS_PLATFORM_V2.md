# ALTARA bots: files, moderation, events and conversations

This expansion was activated in the hosted backend with explicit operator
approval on 2026-10-02. Eight migrations were applied and all nine functions below
are ACTIVE. Catalog, authentication and access checks passed; authenticated
real-chat follow-ups for files, DMs, threads and mentions are recorded below.
Microphone capture remains unverified.
Existing installations keep their previous grants; request new grants explicitly
and have a server manager approve them. No Administrator shortcut is provided.

## Native bot DMs: hosted activation, 2026-10-03

Bot DMs now reuse the existing DM shell, composer artwork, emoji/GIF selectors,
formatting, message menus, grouping and media styles. Text remains on the existing
private bot API; no human conversation ID or human encryption key is fabricated.
Replies, own-message editing/deletion, reactions, pins and private attachments
are active behind server capability flags following explicit operator approval.
The `20261002234100_bot_dm_message_actions_v1.sql` and
`20261002234312_bot_dm_private_attachments_v1.sql` migrations were applied, and
`altara-bot-surfaces` and `altara-bot-dm-attachments` were published to the hosted
project. Hosted migration versions are `20261003002459` and `20261003002508`;
the endpoint versions are 2 and 1 respectively.

Catalog checks confirmed owner-only reads, no direct authenticated mutations,
private helpers without public execution grants, the private 8 MiB bucket and
the existing private Realtime publication. Both published endpoints rejected
missing credentials, invalid JWTs and invalid bot tokens with HTTP 401.
Published source matches the tested local source. After the user refreshed the
browser, real-chat checks passed for sending, formatting/own-message editing,
replies, pinning, adding a reaction and a manually uploaded private image preview.
The state persisted after refresh and navigation to a human DM and back.
Deletion remains verified by local database/runtime tests; no live message was
deleted. The final reply-preview and attachment-card styling uses the native
components and passed the focused browser/DM regression checks.

Unchanged message/media nodes survive pending operations and unrelated Realtime
updates. Account changes clear drafts and stale operations; consent withdrawal
blocks sends and new file grants. Download URLs are not stored as attachments.
Existing URLs expire within 60 seconds, as with other signed Storage grants.

The chat currently loads the latest 50 messages; pinned older messages can be
viewed in the pins panel. Bot runtimes must implement their private-message
handler to reply. Private bot calls, group calls and new bot event feeds for
editing, deletion, reactions or pins are not provided by this change.

## Hosted activation: 2026-10-02

Applied migrations:

- `20261002164153_bot_admin_domain_events_v2.sql`
- `20261002164229_bot_attachments_v1.sql`
- `20261002164758_bot_platform_permissions_v2.sql`
- `20261002164759_bot_surfaces_v1.sql`
- `20261002164801_bot_audio_consent_recovery_v1.sql`
- `20261002164844_bot_domain_events_lifecycle_v2.sql`
- `20261002172810_bot_thread_domain_events_v1.sql`
- `20261002175129_bot_mentions_v1.sql`

Active functions: `altara-bot-attachments`, `altara-bot-admin`,
`altara-bot-surfaces`, `altara-bot-webhook`, `altara-bot-audio-capture`,
`altara-bot-message-send`, `altara-bot-respond`, `altara-bot-events` and
`altara-bot-voice-token`.

Hosted checks confirmed 39 allowed permission names, the surfaces/capture/mentions
RPCs, the dedicated bot-DM table and the private upload bucket. Anonymous and
authenticated database clients cannot execute the checked service-only bot RPCs;
`service_role` can. All nine HTTP endpoints rejected anonymous requests with 4xx;
the capture endpoint returned `401 authentication_required` for a request with
valid IDs and no authentication. `verify_jwt=false` on these handlers does not
remove their own token/JWT/secret authentication. Existing installations received
no new sensitive grants automatically; the post-activation check found zero
installations with those new grants.

These checks confirm backend deployment and the inspected authority boundaries.
They do not replace authenticated end-to-end tests of uploads/downloads, mentions,
moderation, event delivery, DMs, threads, webhooks, recovery or consenting microphone
reception/recording. None of those new real-chat/capture flows was tested during
the initial package activation; subsequent file verification is recorded below.
Local PostgreSQL, SDK and isolated-browser verification is described below.
Website/desktop release distribution remains separate from backend activation.

### File delivery follow-up: 2026-10-02

With separate explicit operator approval, LEYLEY's JA FOSTE installation gained
only Attach Files. The original legacy cutoff still blocked valid private uploads,
so `20261002204133_bot_attachment_cutoff_admissions_v1.sql` was separately reviewed,
tested in real PostgreSQL and approved before hosted application. It replaces only
the cutoff function; the existing private admission/binding guards remain active,
remote attachment payloads remain rejected and no direct storage grant is added.

The real chat then displayed `/foto`'s 96 × 96 PNG and opened its image viewer.
`/ficheiro` delivered its 121-byte UTF-8 sample, and its downloaded contents matched
the fixed source. Catalog inspection confirmed the exact repair and retained
private bucket/schema/table authority. This does not verify the other new platform
flows listed above.

The refreshed real Chrome chat subsequently verified the TXT modal's native
Download action after 85 seconds: a new 121-byte copy was saved and its SHA-256
matched the fixed sample. The real bot-DM dialog also opened with consent unchecked
and its message field/Send button disabled; consent was not changed and no DM was
sent. This verifies the initial consent boundary, not an authorized DM exchange.
Three scoped, read-only calls through the official SDK (`readDirectMessages`,
`listThreads`, `listWebhooks`) each returned HTTP 403 `bot_permission_required`
for LEYLEY's current installation. No login/command registration, consent changes
or new grants were performed by these initial checks.

### Authorized DM, thread and mention follow-up: 2026-10-02

With separate explicit operator approval, the existing JA FOSTE installation was
updated through the normal authorization UI from 17 to 20 permissions, adding
only `bot:send_direct_messages`, `bot:create_threads` and `bot:mention_members`.
Its managed role and active status were retained; application permission defaults
were not changed. The operator's own DM consent was saved through the real dialog.

The official SDK verified one fixed human DM and one fixed bot reply; both were
visible together in the real DM dialog. One thread in general was created with a
persisted request UUID, received one fixed bot message, and passed list/history
checks. The same title and message appeared in the real Threads dialog. The thread
was left available; no archive/delete action was tested.

One public message explicitly mentioned only the operator's account. The send
response, an independent read of that exact stored bot message, and the real chat
confirmed its content and server-built `notification_mentions.users` target.
No notification sound or background delivery was physically verified. The normal
channel history RPC returns human messages, so it cannot independently confirm a
bot message; the test runner's initial history assumption was corrected without
repeating the send. No new event intents or automatic DM/thread callbacks were
enabled or verified by these explicit SDK calls.

### Native inbox and mention client follow-up (2026-10-02)

Bot DMs now have a main chat view and appear in FRIENDS / MESSAGES. They retain
explicit consent and a separate actor API; they do not use human DM IDs or their
encryption path. With explicit owner approval, migration
`20261002220539_bot_dm_realtime_publication_v1.sql` added the two existing private
DM tables to the realtime publication. Hosted checks confirmed both ownership
RLS policies remain enabled. Local PostgreSQL tests cover isolation, idempotence
and unsafe-policy rollback.

The mention client now renders safe profile tokens and highlights the approved
recipient's row. The global INSERT listener handles active-channel direct
mentions, background unread counts, replay deduplication and current permission
checks before audio. It preserves mute, DND, Focus and notification preferences.
Focused tests exercise these paths. One fresh owner-only DM and one explicit
own-account mention were sent through the SDK and checked in storage. The
browser extension blocked live UI inspection after refresh; current visual
delivery and physical sound still require confirmation.

## Inventory

| Surface | JavaScript methods | Permissions and limits |
| --- | --- | --- |
| Private file uploads | `uploadAttachment`, then `reply`, `sendMessage` or `editMessage` | `bot:attach_files`, channel Send Messages; 8 MiB/file, 10 files and 16 MiB/message; current channel access required to issue a 60-second download grant |
| Explicit member mentions | `sendMessage` / `reply` with `allowed_mentions` | `bot:mention_members`; up to 10 selected members with channel access; no everyone, role or automatic pings; edits never ping |
| Roles | `createRole`, `updateRole`, `deleteRole`, `addMemberRole`, `removeMemberRole` | `bot:manage_roles`; lower roles only, protected managed roles and approved permission ceiling |
| Member moderation | `kickMember`, `banMember`, `unbanMember`, `timeoutMember`, `clearMemberTimeout` | Individual kick/ban/timeout grants; protects owner, administrators, bots and higher roles |
| Message moderation | `deleteMemberMessage` | `bot:moderate_messages` and effective channel Manage Messages; retained history is preserved |
| Server/channels/events | `updateServer`, channel CRUD, server-event CRUD | Individual manage grants; server name, channel name/type/category and scheduled events; channel deletion archives existing history |
| Dedicated bot DMs | `sendDirectMessage`, `readDirectMessages` | `bot:send_direct_messages` and explicit member consent in the bot menu; no ordinary human DM access |
| Threads | `createThread`, `listThreads`, `readThread`, `sendThreadMessage`, `archiveThread` | Create/Manage Threads plus current parent-channel access; 50 history rows, bounded rates |
| Scoped webhooks | `createWebhook`, `listWebhooks`, `executeWebhook`, `revokeWebhook` | `bot:manage_webhooks` and channel Send Messages; up to 20 active per bot; token travels in Authorization only |
| Voice reception/recording | `captureVoice`, `heartbeatAudioCapture`, `closeAudioCapture` | Listen Voice, plus Record Voice in recording mode; individual visible consent, isolated room, maximum 8 contributors |

Administrative mutations accept `requestId`; reuse the same UUID and exact
payload when retrying an uncertain result. Different payloads under the same
request are rejected. Actions are audited and authority is rechecked server-side.
Never put tokens in source, message content, browser-visible URLs or logs.

```js
const file = await bot.uploadAttachment({serverId, channelId,
  filePath: './welcome.png'});
await bot.sendMessage({serverId, channelId,
  content: 'Bem-vindo!', attachments: [file]});

await bot.addMemberRole({serverId, userId, roleId, requestId});
await bot.sendMessage({serverId, channelId,
  content: `Olá <@${userId}>!`, allowed_mentions: {users: [userId]}});
const result = await bot.createThread({serverId, channelId,
  title: 'Ajuda', requestId});
await bot.sendThreadMessage({serverId, channelId,
  threadId: result.thread.id, content: 'Como posso ajudar?'});
```

Python exposes equivalent snake_case methods, with IDs as positional arguments:

```python
file = await bot.upload_attachment(server_id, channel_id,
    file_path="welcome.png")
await bot.send_message(server_id, channel_id, "Bem-vindo!", attachments=[file])
await bot.add_member_role(server_id, user_id=user_id, role_id=role_id,
    request_id=request_id)
await bot.send_message(server_id, channel_id, f"Olá <@{user_id}>!",
    allowed_mentions={"users": [user_id]})
```

Mention targets must also appear as `<@UUID>` or `<@!UUID>` tokens in message
text or card text. Code, URLs and escaped tokens do not ping. Omitted or empty
targets are silent, including webhooks, DM/thread replies and ordinary bot
messages. The server builds the notification targets during insertion; a bot
cannot supply its own notification metadata. JavaScript also accepts the
`allowedMentions` alias. This option applies only to public send/reply/edit APIs;
DM/thread helpers do not offer mention notifications.

## Event delivery

Saved owner intents, SDK intents and installation grants must agree. Supported
intents: `messages`, `members`, `message_content`, `reactions`, `voice_states`,
`presence`, `direct_messages`. No events read encrypted, private human DM or
system messages. Presence uses the protected visibility projection and blocks;
only online/idle/dnd/offline status is delivered, without activity or room secrets.

| Events | Node callback | Python callback |
| --- | --- | --- |
| MESSAGE_CREATE / UPDATE / DELETE | messageCreate / messageUpdate / messageDelete | message_create / message_update / message_delete |
| SERVER_MEMBER_ADD / REMOVE / UPDATE | serverMemberAdd / serverMemberRemove / serverMemberUpdate | server_member_add / server_member_remove / server_member_update |
| MESSAGE_REACTION_ADD / REMOVE | reactionAdd / reactionRemove | reaction_add / reaction_remove |
| VOICE_STATE_UPDATE | voiceStateUpdate | voice_state_update |
| PRESENCE_UPDATE | presenceUpdate | presence_update |
| THREAD_CREATE / UPDATE / MESSAGE_CREATE | threadCreate / threadUpdate / threadMessageCreate | thread_create / thread_update / thread_message_create |
| DIRECT_MESSAGE_CREATE | directMessageCreate | direct_message_create |

Callbacks are awaited. Only successes are acknowledged, with a separate private
DM lease queue. Redelivery reuses the event ID; keep durable idempotency for
external side effects. Generic events expire after 24 hours with at most 10
delivery attempts, bounded queue size and reported overflow. Permission, consent,
parent-channel and presence changes are checked again at delivery. A context
reply stays in its DM/thread; explicit channel overrides there are rejected.

```js
bot.on('directMessageCreate', event => event.reply('Olá!'));
bot.on('threadMessageCreate', event => event.reply('Vou ajudar nesta thread.'));
```

## Music and audio

The music starter responds with loading progress before resolving a track, allows
controls during lookup, expands public YouTube playlists/Spotify albums/playlists
up to 20 items and resolves later tracks lazily. Spotify is metadata matching,
not a Spotify audio stream. Native RTC reconnects and recent scoped connection
recovery preserve playback where possible; expired/revoked connections fail closed.

Read [music](ALTARA_BOTS_MUSIC.md), [files](ALTARA_BOTS_FILES.md) and
[audio consent](ALTARA_BOTS_AUDIO_CAPTURE.md) for exact setup and limits.
Audio reception uses LiveKit Cloud revocation. The browser sends only an explicitly
consenting microphone; newcomers never automatically contribute. Audio received
by a bot operator can be retained outside the official example, so the UI discloses
this before sharing. It cannot promise technical prevention of all recording.

## Verification and boundaries

Isolated PostgreSQL tests exercise permissions, hierarchy, RLS, concurrent quota
and idempotency races, consent revocation, stale leases and webhook retirement.
Node/Python tests cover transports and event routing. Isolated Chrome tests cover
safe file rendering, DM/thread dialogs, keyboard use, mobile layout and audio consent.
Hosted catalog/authentication/access verification is recorded above. Authenticated
real-chat checks now cover file delivery/expired-link renewal, a consented DM
exchange, thread creation/message/listing and an explicit own-account mention.
Positive role/moderation/webhook flows, automatic event delivery, reconnect
recovery and a consenting live microphone check remain pending. No real microphone
capture or recording was performed today.

This is an ALTARA API, not a complete Discord API emulation. Full guild caches,
Gateway streaming, arbitrary HTML, role/channel permission-overwrite CRUD, and
voice priority mixing are not provided. DMs accept text, cards, replies and
admitted private files, with edits, deletion, reactions and pins. The user-facing
DM presentation shares the ordinary chat frame, stylesheet, profile panel,
composer and media controls; file authority and consent stay in the private bot
API. Private bot calls/group calls are not implemented. Threads accept text and
cards; public file/control messages use the channel APIs. Applications can
build support systems, games, automation and external integrations on these APIs.
