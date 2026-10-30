# Bot DM message actions

The migration `20261002234100_bot_dm_message_actions_v1.sql` was activated on
2026-10-03 after explicit operator approval, together with
`20261002234312_bot_dm_private_attachments_v1.sql`. Hosted migration versions are
`20261003002459` and `20261003002508`. The deployed `altara-bot-surfaces` endpoint
is version 3 after the approved 2026-10-04 pagination update;
`altara-bot-dm-attachments` is version 1. Existing DM APIs remain compatible.
Catalog, source-parity and unauthenticated denial checks passed.
Authenticated chat checks passed for sending, own-message editing, replies,
reactions, pins and a private image preview. Deletion is covered by local
database/runtime tests; no live message was deleted during verification.

Bot accounts remain distinct from human authenticated accounts. Message actions
use the existing `bot_direct_messages_v1` thread identified by bot, installation
and recipient. They never invent a human conversation ID or reuse a human E2EE
key, upload admission or message grant.

## Actor API

`bots_dm_message_actor_v1(p_action, p_bot_id, p_server_id, p_message_id,
p_payload, p_request_id)` derives the recipient from `auth.uid()`. Only the
authenticated role can execute it. It supports these actions:

| Action | Payload | Result |
| --- | --- | --- |
| `capabilities` | `{}` | Current consent and available feature flags |
| `history` | `{before?: {created_at, id}}` | At most 50 recipient messages in chronological order, with `has_more` and `next_cursor` |
| `pins` | `{}` | Last 50 current pinned messages in this thread |
| `send` | `{content, reply_to_id?, attachments?}` | The persisted user message |
| `edit` | `{content?, attachments?}` | The recipient's own edited message |
| `delete` | `{}` | The recipient's own content-free tombstone |
| `reaction` | `{emoji, enabled}` | The resulting message and reactions |
| `pin` | `{enabled}` | The resulting message and pin state |

Every mutation requires a UUID `p_request_id`, a current installation and
current recipient consent. A retry must carry the exact original request UUID,
action, message ID and payload. Retries acknowledge the recorded operation and
return the current message, so a delayed retry cannot restore an older edit,
reaction or pin state. New operations require new request UUIDs.

## History pagination: active (2026-10-04)

`20261004211958_bot_dm_history_pagination_v1.sql` activated keyset pagination in
the existing enhanced message-action helper. The public actor/bot signatures,
message projection, consent rules, grants and storage broker remain unchanged.
The operator explicitly authorized the hosted migration and publication of the
existing `altara-bot-surfaces` function. Version 3 is ACTIVE, matches the reviewed
source and retains its custom authentication, with the safe
`invalid_history_cursor` error mapping (HTTP 400). No new endpoint or permission
was added.

The new capability is `history_pagination: true`. The first history request uses
`p_payload: {}`; subsequent requests use
`p_payload: {before: {created_at, id}}` with the exact server-returned cursor.
Responses have at most 50 chronological messages, `has_more` and `next_cursor`.
The next cursor is either the oldest returned message's exact timestamp and ID
or null when the history is exhausted. Cursor identity stays within the current
bot, server and recipient. Timestamp microseconds must not be truncated by a
JavaScript Date conversion.

The local chat loads older pages at the top of its normal DM timeline, with
an accessible load/retry control, duplicate-request protection and scroll-anchor
preservation. Historical rows do not generate new-message notifications. Loading
older history does not block composing and cannot apply into another account or
conversation. Compatible clients hide the paging control when the server does
not advertise the capability or no older page is available.

Read-only hosted actor checks on the operator's own account returned
`history_pagination: true`, seven current messages and six earlier messages using
`before`. The real DM has fewer than 50 messages, so the UI correctly shows no
older-history control. After reload, the real chat retained one LEYLEY conversation
region and an enabled composer. Multi-page timelines, retry behavior, scroll anchoring and
account/conversation fences were verified with local database and browser tests;
a real conversation exceeding 50 messages was not used in hosted verification.

Post-activation checks preserved the helper's owner, ACL, `search_path` and message
projection checksum. The existing Edge endpoint still rejects requests without
credentials with HTTP 401.

Withdrawing consent continues to permit the human recipient's own saved history;
it does not permit new sends or attachment grants. Bot reads still require consent.

Edit and delete check the original sender. A human actor cannot edit or delete
the bot's message; a bot cannot edit or delete the human's message. Replies
reference only undeleted messages in this exact recipient, bot and installation.
Existing replies retain a deleted original's identity with an empty preview.

The actor can retain access to their own saved history after consent withdrawal,
as in the original DM API. Withdrawal blocks mutations and every bot history
read. Reactivating an installation never revives old consent.

## State and delivery

Messages gain `reply_to_id`, `reply_preview`, `edited_at`, `deleted_at`,
`is_pinned`, `pinned_at`, `reactions` and `revision`. Existing rows begin at
revision 1. A guarded database trigger increases the revision for visible
message changes, including attachments, and ignores delivery lease changes.
Clients must compare revisions before merging history, RPC and Realtime rows.

Canonical reactions are `[{emoji, count, user, bot}]`; `user` means the private
thread's recipient has reacted and `bot` means its bot has reacted. RPC results
also include `mine`, computed for their authenticated actor. Reactions use an
explicit desired state, so duplicate requests never toggle twice.

Soft deletion clears displayed content, embeds, reactions and pin state. The
separate attachment guard retires attachments. Pending deleted messages are
excluded from the existing `DIRECT_MESSAGE_CREATE` feed. This migration does
not itself add bot event types for edits, deletes, reactions or pins. The current
state remains available in history and in the user's existing private Realtime
feed. The separate lifecycle package below extends runtime delivery.

### Private lifecycle feed (hosted active, 2026-10-05)

Activated with explicit operator approval as hosted migration
`20261005171342_bot_dm_lifecycle_events_v1` and surfaces version 6. The approved
package passed 131 local tests; hosted schema, permissions, source parity and
authentication denial were verified. A live LEYLEY DM test subsequently
confirmed the five new mutation types, human/bot actors, acknowledgements,
redacted deletion and an idempotent private callback reply. It altered/deleted
only a newly created bot test message, used only the mutation feed and left
normal CREATE polling and ping replies in the existing process.

The new service-only `bots_dm_events_poll_v1` is negotiated by updated source
clients through `dm_poll.event_types`. It preserves CREATE identities and leases
from `bots_dm_poll_v1`; old clients continue to receive only CREATE. The five
mutation types are UPDATE, DELETE, REACTION_ADD, REACTION_REMOVE and PIN_UPDATE,
all prefixed `DIRECT_MESSAGE_`. Activation requires operator approval.

Explicit successful message actions enqueue mutation metadata with the actual
user/bot actor and a stable event ID. Operation retries and no-op reactions/pins
do not generate extra events. The existing automatic 30-day retention cleanup
does not generate these events. Queued events keep no private text or attachment
snapshots, and current access and source state are checked again at delivery.
DELETE carries only identifiers and mutation metadata. An UPDATE cannot restore
content from a deleted or expired message.

The conversation recipient remains `event.user.id`; `data.actor` identifies the
mutation author. They are distinct for a bot reacting to a human's message or a
human pinning a bot's message. Context replies stay private and bound to the
original recipient and installation. See the [SDK guide](ALTARA_BOTS_SDK.md#private-dm-lifecycle-events-hosted-active-2026-10-05)
for callback names and retry behavior.

Limits preserve 30 human sends or 60 bot sends per minute and additionally bound
message actions to 120 per actor per minute, 50 pins and 20 distinct reactions
per message. The operation ledger stores a SHA-256 fingerprint instead of an
extra copy of private message content. Private operation and reaction tables
have RLS enabled and grant
no direct reads or writes to anonymous, authenticated or service clients.

## Bot API and SDKs

The service-only `bots_dm_message_bot_v1` provides the same actions scoped to
the bot derived from its validated token and to a consented recipient. Bot
embeds reuse the existing validator and approved Embed Links installation
permission. Human payloads cannot add arbitrary bot embed objects.

The `altara-bot-surfaces` handler adds `dm_message_send`, `dm_message_history`,
`dm_message_pins`, `dm_message_capabilities`, `dm_edit`, `dm_delete`,
`dm_reaction` and `dm_pin`. Older `dm_send`, `dm_history`, thread and webhook
contracts stay unchanged.

Node methods are `editDirectMessage`, `deleteDirectMessage`,
`setDirectMessageReaction`, `setDirectMessagePinned`,
`readDirectMessageHistory` and `readDirectMessagePins`. Python exposes the
equivalent snake_case methods. `sendDirectMessage` / `send_direct_message`
select the richer send action when files or a reply target are supplied;
ordinary sends preserve the original API. A developer still needs to provide
their bot's DM handler for automatic replies.

Attachments use the separately prepared private admission migration
`20261002234312_bot_dm_private_attachments_v1.sql`. Inputs carry only
`[{upload_id}]`; the database reconstructs their metadata and binds each file
to the exact message. Omitting attachments during edit preserves them; an
explicit empty list removes them. Omitting content during a media edit preserves
the caption. Before that migration is present, attachment
capability is false and attachment fields fail closed.

Focused verification uses real isolated PostgreSQL in
`tests/bot-dm-message-actions-db.test.mjs`, plus Node and Python runtime tests.
It covers permissions, recipient isolation, legacy compatibility, replies,
ownership, revisions, replay ordering, persistent reactions/pins, tombstones,
consent races and private attachment integration. It does not establish hosted
activation or a physical browser/sound result.

## Native DM presentation

Bot and human messages use the same `renderDirectMessageFrame` helper and the
same native DM stylesheet. The bot adapter fills the native header, composer,
quick reactions and right-side profile panel; it does not clone human identities
or enter the human E2EE pipeline. Consent management stays in the conversation's
context menu. Private calls and group calls are not advertised because the bot
DM backend does not support them.

Bot headers omit the human Vault/security-status icons. Human privacy controls
are unchanged. Deleted bot messages remain as revisioned tombstones in the
controller, preventing stale history from restoring them, but are omitted from
the visible timeline and pins. Live replies can still show an unavailable
original; deleted replies do not leave their own quote or placeholder row.

Private images display inline and open in the existing media lightbox. File
cards, audio/video controls, attachment menus and permitted attachment deletion
use native presentation. Private media claims still go through the bot DM broker.
Late claims are discarded after navigation, consent withdrawal, deletion or
attachment membership changes; reaction/pin-only revisions preserve the media
node. Removing the final attachment from an otherwise empty own message uses
the existing deletion tombstone instead of an invalid empty edit.

## Automatic 30-day retention (2026-10-04)

The owner corrected the initial optional design: 30 days is a fixed product rule
for all bot-to-human DMs, covering both senders and existing history. There is no
personal on/off setting or retention control in the conversation menu. Pinned
messages remain; human-to-human DMs are unaffected.

The original two retention migrations, cleanup Edge function and daily scheduler
were activated with explicit operator approval. The corrective mandatory-policy
migration was activated after the owner's explicit correction. None of these installation
migrations invokes cleanup or rewrites existing message payloads.

Messages older than 30 days and their private attachments expire automatically.
Expired content and files cannot be recovered. Age is measured from the original
message's `created_at`, so editing or
replying does not extend its lifetime. Cleanup runs daily in bounded batches.
Large backlogs can take further runs to drain.
The separate daily job is scheduled for 04:30 UTC. Each execution processes at
most 1000 messages and 1000 private files, with four concurrent file operations
and a shared 60-second network deadline. Deferred files keep their retry marker.

`bots_dm_retention_actor_v1(p_action, p_days, p_expected_revision, p_request_id)`
derives its human account from `auth.uid()`. Its compatibility `get` reports
`days:30`, `mandatory:true`, a stable policy timestamp and a revision that
supersedes any cached legacy preference. Every `set`, including exact retries
and attempts to set 30 days, fails with `retention_policy_fixed`.
Legacy preference and operation rows remain intact but do not control expiry.
The action helper advertises `retention_settings:false`, `retention_days:30` and
`retention_mandatory:true`, hiding the previous option in compatible older clients.

The service-only worker selects old bot DM content across all accounts without
joining preferences. It rechecks age and pin state after acquiring the existing
thread lock, before locking message rows. Busy contexts are skipped with a bound
of 32 attempts per SQL call. It removes message payloads,
embeds, private reactions and attachments, and invalidates delivery leases.
Minimal message IDs/timestamps, reply references and mutation fingerprints remain
to keep pagination, unavailable reply previews and idempotent retries correct.
This is content removal, not a promise to erase every metadata row or immediately
shrink PostgreSQL's physical files. Expired messages are hidden in the normal
timeline and cannot create new unread counts or notification sounds.

Private files are first retired in the same database transaction, then removed
through the Storage API. Only a successful Storage removal permits removal of
their upload metadata. A retirement marker and bounded lease allow failed file
cleanup to retry safely; those files were
already detached by an authorized expiration and cannot be reattached.

The approved activation covered the core migration,
`altara-bot-dm-retention-cleanup` and its daily scheduler. The separate worker
uses the caller's actual Authorization for service-only database RPCs before
using elevated Storage access. Existing public avatar cleanup is unchanged.

Hosted verification of the original installation confirmed own-account RLS and
read-only legacy table grants, service-only cleanup RPCs and the active 04:30 UTC
job. The existing DM projection is unchanged. Both deployed function files match
the reviewed sources, JWT verification is enabled and unauthenticated HTTP is
rejected with 401. The mandatory correction was then verified: the compatibility
getter reports the fixed policy, setters are blocked, cleanup does not consult
personal preferences, and the history projection and daily schedule remain
unchanged. The corrected chat has no retention option. No real-content cleanup
was manually invoked.

The new private request ledger's no-policy advisory is intentional: all client
and service table grants are revoked, and guarded RPCs are its only access path.
The authenticated SECURITY DEFINER advisory for the preference RPC is also
intentional: it derives the owner from `auth.uid()`, checks the actor role and
keeps direct writes revoked. Newly added cleanup indexes were reported
unused before any cleanup. No real-content expiration or scheduled
Storage deletion was invoked during verification; those flows passed the
isolated PostgreSQL and worker tests.
