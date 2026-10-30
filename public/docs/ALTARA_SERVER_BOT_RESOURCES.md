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

This version supports literal keyword blocking, with five rules per server and 1–20 keywords per rule. Names have 1–100 characters; keywords have 2–80. NFKC, case and known zero-width formatting are normalized. User regex, automatic timeouts and spam classifiers are not implemented. Exemption lists have at most twenty existing same-server roles/channels; human owners and administrators retain the existing exemption.

The blocker covers human server messages, bot messages, webhook messages, threads, polls and subsequent text/rich-card edits. The database rejects a matching new write with `automod_message_blocked`; it does not delete old messages. Opaque attachment URLs are not treated as user prose. Encoded `{type:'text',text:...}` and native poll questions are treated as prose. Unrelated pin updates and deleting an old message remain possible.

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
