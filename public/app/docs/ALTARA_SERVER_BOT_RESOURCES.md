# Server resources for bots and people

The approved migrations and handlers were published on 7 October 2026. Hosted catalog checks confirmed the scoped RPCs, execution grants and private table protections. Adding a permission to the catalog does not grant it to existing bots. Positive hosted SQL runtime verification passed ten assertion groups in a synthetic server, followed by thirteen zero rollback counts. It is recorded separately in `output/bot-hosted-verification-20261007`; SQL asset-reference checks do not establish physical media upload or authenticated HTTP delivery.

## AutoMod

`bots_automod_action_v1(bot_id,server_id,action,payload,request_id)` is service-only. The authenticated human equivalent is `altara_server_automod_action_v1(server_id,action,payload,request_id)`; it derives the actor from `auth.uid()`.

| Action | Payload | Result |
| --- | --- | --- |
| `automod_list` | `{}` | `{ok:true,rules:[...]}` |
| `automod_create` | `name,keywords,enabled?,exempt_channel_ids?,exempt_role_ids?` | `{ok:true,rule_id}` |
| `automod_update` | `rule_id` and changed fields above | `{ok:true,rule_id}` |
| `automod_delete` | `rule_id` | `{ok:true,rule_id}` |

Mutations require a fresh UUID request ID, and retrying the same payload is idempotent. Configuration requires the approved `bot:manage_automod` grant or the existing human server manager authority. Ordinary members cannot inspect or change rules.

The hosted version supports literal keyword blocking, with five rules per server and 1–20 keywords per rule. Names have 1–100 characters; keywords have 2–80. NFKC, case and known zero-width formatting are normalized. Arbitrary user regex is not supported. Exemption lists have at most twenty existing same-server roles/channels; human owners and administrators retain the existing exemption.

The blocker covers human server messages, bot messages, webhook messages, threads, polls and subsequent text/rich-card edits. The database rejects a matching new write with `automod_message_blocked`; it does not delete old messages. Opaque attachment URLs are not treated as user prose. Encoded `{type:'text',text:...}` and native poll questions are treated as prose. Unrelated pin updates and deleting an old message remain possible.

### Bounded spam and automatic timeout: backend active (2026-10-08)

The following extension is active on the hosted backend, with the matching interface and downloads served locally. Hosted source and catalog checks passed; authenticated hosted behavior has not been exercised in this activation. It keeps the existing four actions/RPC signatures and the five-rule quota. Existing rows default to keyword blocking; no installed bot receives another permission.

| Create/update field | Values and defaults |
| --- | --- |
| `trigger_type` | `keywords` (legacy default) or `message_spam` |
| `spam` | For spam: integer `window_seconds` 5–60 (default 10), `max_messages` 3–20 (default 5), `max_duplicates` 2–10 (default 3). For keywords: omitted or `{}`. Unknown keys fail. |
| `keywords` | Existing 1–20 literal strings for keyword rules; empty/omitted for spam rules. |
| `enforcement_action` | `block` (default) or `timeout` |
| `timeout_seconds` | 60, 300, 600 or 3600 for timeout, default 300. Omit for block; its list snapshot returns `null`. |

`automod_list` still returns `{ok:true,rules:[...]}`; each rule includes these fields. Older snapshots mean `keywords`, `block`, `{}`, and a null duration. Names, channel/role exemptions and current-actor checks retain their existing limits.

Spam measures new accepted messages per sender and server, across channels and threads. It permits up to each configured limit and matches the next write. Repetition fingerprints additionally collapse whitespace after existing Unicode/case normalization. Attachments consume a rate slot without comparing opaque URLs as repeated prose. A bounded private record stores at most 21 timestamp/fingerprint pairs per rule and actor, never raw message text or one row per message. Expired state is pruned in batches of at most 256 during writes/configuration; inactive servers do not require a timer. Poll metadata does not consume a second slot. Edits, pins and deletions do not increment the rate count; deletion cannot erase accepted messages from the current window.

The actions are distinct. **Block rejects the attempted write. Timeout accepts a new normal message and commits the sender's timeout with it, limiting subsequent sends.** It does not silently promise blocking and timeout together. Polls and encoded attachment/GIF/event writes use block fallback, because their later transaction steps may recheck send authority. Keyword-matching edits, bots/webhooks, missing current moderation authority, and protected/higher-role targets also use block fallback instead of applying an unauthorized timeout. Owner/administrator and configured exemptions remain exempt. An already-active manual or automatic timeout is never shortened or extended.

Configuring timeout requires current server-manager **and** timeout authority, or an installed bot's approved `bot:manage_automod` **and** `bot:timeout_members` grants. Execution rechecks the saved configuring identity, active membership/install, bans and role hierarchy without changing the message writer's identity. Revoking that authority causes block fallback. If several authorized timeout rules match, the longest duration is applied once; a matching block rule still rejects the whole write. A normal message replay/`ON CONFLICT DO NOTHING` never increments state or applies a second timeout, including after a concurrent original commit. Actual `ON CONFLICT DO UPDATE` still checks changed content. Rolled-back writes retain neither state nor timeout. Spam/timeout clocks are captured after waiting for the server, sender and relevant membership locks.

There is no arbitrary regex, machine-learning spam classifier or retroactive message deletion. This package supplies finite rate/repetition detection, not every Discord AutoMod capability. The migration refuses unknown existing action/trigger bodies or ACLs before schema changes; its exact reviewed reapplication is supported.

## Custom emoji/sticker interface deferred (2026-10-08)

Following the user's latest request, `SERVER_EXPRESSIONS_UI_ENABLED=false` removes the manager entry and custom server sections from composer/reaction pickers. The existing resource controller receives `expressionsEnabled:false` and refuses expression opening, mutation and replay while AutoMod remains available. This is presentation availability, not a replacement for server authorization. Existing data and message rendering remain intact. The UI repairs below are kept for a future explicitly requested activation. No backend, grant, SDK or data change was made for this deferral.

## Saved settings interface repairs (2026-10-08)

The emoji/sticker manager opens from a sidebar action directly after Server Profile, rather than a full-width button inside the profile grid. It remains the existing scoped native dialog and RPC controller. The dialog uses the opaque card surface, not the translucent row token. Its native Escape and Tab handling stops propagation to parent shortcuts; Escape closes only the resource dialog and restores focus to the sidebar action, preserving the parent settings and draft. AutoMod retains its existing entry and controller. These are local UI changes; backend and grants are unchanged.

## Custom emoji and stickers

`bots_expression_action_v1(bot_id,server_id,action,payload,request_id)` is service-only. The human equivalent is `altara_server_expression_action_v1(server_id,action,payload,request_id)`.

| Action | Payload | Result |
| --- | --- | --- |
| `expression_list` | `kind?` (`emoji` or `sticker`) | `{ok:true,expressions:[...]}` |
| `expression_create` | `kind,name,asset_id` | `{ok:true,expression_id}` |
| `expression_update` | `expression_id,name` | `{ok:true,expression_id}` |
| `expression_delete` | `expression_id` | `{ok:true,expression_id}` |

Members may list their current server's resources. Managing them requires the approved `bot:manage_expressions` grant or the existing human server manager authority. Names use 2–32 ASCII letters, digits or underscores. Lists expose resource IDs, MIME, bytes, dimensions, creator IDs and timestamps; private paths, hashes and signed URLs are excluded. Creation only accepts a ready upload owned by that actor in that server and of that resource kind. A bot never borrows its owner's human identity.

Canonical text tokens are `<:name:expressionUUID>` for emoji and `<sticker:expressionUUID>` for stickers. SQL checks the current server and resource kind in human, bot, webhook and thread writes and edits. Cross-server resources and custom reactions are not enabled by this version. Attachment URLs and arbitrary metadata are not reparsed as expression tokens.

## Media endpoint

The new `altara-server-expression-media` handler verifies either a user JWT using `getUser` or a revocable bot token using the existing token-hash authority. Its Edge gateway configuration must use `verify_jwt=false` because the handler verifies both credential kinds itself.

Upload raw raster bytes with `POST`, `Content-Type` and headers `x-altara-server-id`, `x-altara-request-id`, `x-altara-expression-kind`. The response contains only:

```json
{"ok":true,"asset":{"asset_id":"UUID","mime":"image/png","byte_size":100,"width":1,"height":1}}
```

Fetch `GET ?asset_id=UUID` with the current Authorization header. This relay checks membership/grants each time, validates stored content integrity and returns raster bytes with `private, no-store` and `nosniff`. Clients should use scoped fetch/blob URLs and revoke them on account/server changes. Caller-provided paths or remote media URLs are not accepted.

Limits: PNG/JPEG/GIF/WebP, 512 KiB per object, width/height up to 2048 and at most one million canvas pixels. Animation headers/structures are capped at 120 frames and sixteen million aggregate canvas pixels. These are bounded format/header checks, not a complete image decoder. The server has a 64 MiB asset quota and 100 resources of each kind; the actor has twenty upload reservations per hour, including reservations whose objects were subsequently removed.

The independent `altara-server-expressions-v1` bucket is private. A restrictive policy protects it from older broad authenticated policies. Upload paths are generated by SQL; upload replacement is disabled. Once bound to a resource, an asset has no upload expiry and is excluded from cleanup. Unbound reservations expire after 24 hours. Resource deletion retires only its unbound asset.

`cleanupServerExpressionMedia(db,actorContext?)` claims at most five assets, verifies the whole batch of server-generated paths and acknowledges deletion with each lease token. Uploads invoke scoped cleanup. The published daily retention worker calls the helper without a human actor, after its original service-only caller authorization succeeds and within the same network deadline. Default worker callers retain the original response; the integrated entry adds only verified `expressions_cleanup` counts. Publication does not itself prove that a scheduled run processed an expired hosted object. These assets do not use bot DM attachment expiry.

Format references: [W3C PNG](https://www.w3.org/TR/png-3/), [WebP container](https://developers.google.com/speed/webp/docs/riff_container), [ITU JPEG specification](https://www.w3.org/Graphics/JPEG/itu-t81.pdf).

## Local verification

Focused tests use an isolated PostgreSQL cluster on localhost and injected HTTP/storage clients. They cover installed-grant ceilings, current actor authority, private storage policies, request conflicts, foreign assets, token namespace/type, content edits, cleanup leases/permanent references, quotas and hostile image/body headers. They do not establish hosted deployment or visual parity on their own.

## Multiple poll choices and emoji reactions: backend active (2026-10-08)

These extensions are active on the hosted backend and served local interface after explicit operator approval. The existing single-choice defaults, Unicode reactions and installed bot permissions are preserved. No public frontend release or authenticated hosted emoji/poll roundtrip is claimed by this entry.

Poll creation accepts `multi_select: true` and `max_choices` from 2 to the number of options (at most 10). The default is single choice with `max_choices: 1`. People use the new scoped voting RPC to replace their complete selection atomically; an empty selection removes their votes. Results expose the caller's `own_options` and a distinct `voter_count`, without disclosing other voter identities. Multiple-choice percentages use people as the denominator and may add up to more than 100%. Existing single-choice RPCs keep their behavior; legacy voting on a multiple-choice poll fails explicitly rather than clearing a selection silently.

Custom server reactions use the canonical key `<:emoji:expressionUUID>`, independent of an expression's mutable display name. The shared picker lists only current-server emojis, excluding stickers. Human reactions retain the existing server-message authority; bot `add_reaction`, `set_reaction` and `remove_reaction` require current installation, channel and add-reactions authority. Bot targets remain the existing bot channel message table. The new service-only RPC is `bots_set_server_message_reaction_v1(bot_id,server_id,channel_id,message_id,emoji,enabled)`.

Each add rechecks the same-server ready emoji resource. Foreign, malformed, wrong-kind and private-DM custom resources are rejected. Unicode reactions retain their existing paths. Images use the existing authenticated expression broker, without exposing storage URLs. An existing reaction to a deleted resource shows a readable fallback and remains removable by its authorized owner. This package does not add stickers as reactions, cross-server resources, private-DM custom reactions or a new human reaction path to bot-only message tables.

The three feature migrations preserve existing rows, current ACL/RLS and installed grants. Before replacing existing function bodies or constraints they check reviewed fingerprints, and refuse unexpected drift. A scoped follow-up migration removed the hosted default `service_role` execution grant from only the two new human poll RPCs; authenticated execution and the separate service-only bot RPC are retained. The pre-existing AutoMod wrapper's grants remain unchanged. Real isolated PostgreSQL tests reproduced the default privilege behavior and verified the correction, authenticated ballots, reapplication and drift refusal.

Hosted readback confirmed all 25 reviewed function bodies/ACLs, six table/RLS boundaries, eight columns, six constraints and six triggers. Both updated Edge functions matched their reviewed source and rejected unauthenticated requests. The sole new advisor INFO concerns the intentionally private, RLS-protected spam-history table with no client policies or direct grants. No policy was added. Browser/SDK tests use fictional data and injected network clients; they do not establish an authenticated hosted roundtrip. Evidence and exact activation history are in `output/bot-item3-20261008-v1/root/ACTIVATION.md`.
