# Bot files and images

Bots upload files through `altara-bot-attachments`, using their existing Bot authorization. The endpoint accepts one multipart `file`, `server_id`, `channel_id`, and an optional `file_name`. The bot must be installed and have effective View Channels, Send Messages and Attach Files access to that public text channel.

The response is `{ ok: true, attachment: { upload_id, uploadId, name, size, mime, type, url, expires_at } }`. `url` is an opaque `altara-private-upload:<uuid>` reference. It is not a public or signed URL. Send, reply or edit with `attachments: [{ upload_id }]`; the server reconstructs all trusted metadata. Caller-supplied remote URLs and metadata overrides are rejected.

Limits are 8 MiB per file, 10 files and 16 MiB per message, 20 admissions per minute, 200 admissions and 100 MiB per UTC day, and 512 MiB retained per bot. Quota reservations are serialized; deleting an admission cannot reset the daily quota.

The validator reuses ALTARA's existing upload authority: it checks binary signatures against MIME types and extensions and rejects executables, scripts, HTML and SVG. Supported content includes PNG, JPEG, GIF, WebP, PDF, ZIP/office containers, MP4, WebM, Ogg, MP3, WAV, and download-only TXT/CSV/JSON/log files. This validates the type; it does not claim antivirus scanning or inspect every entry of an archive.

Upload references must be bound within 10 minutes. A completed admission belongs to exactly one bot, server, channel and message. Edits can retain an admission in that same message. The SDK asks to preserve attachments when the caller omits them; an explicit empty list removes files. The upload endpoint opportunistically deletes expired, retired or removed-message objects on subsequent uploads. No extra scheduled service is installed.

Files remain in a private bucket with direct authenticated/anonymous Storage access denied. The existing human download broker authorizes the bound, undeleted message and the reader's current conversation/channel permissions before creating a 60-second delivery URL. Removal of a message, server access or channel permissions immediately prevents new download grants; an already issued grant retains its bounded lifetime.

The file migration and endpoints were activated with explicit operator approval on 2026-10-02. Hosted catalog/authentication/access checks confirmed the private bucket and guarded service access. The real `/foto` test first confirmed rejection without Attach Files. With explicit operator approval, LEYLEY's JA FOSTE installation then gained only Attach Files. The fixed PNG uploaded successfully, but the message initially failed because the older `altara_bot_attachment_cutoff_v1` trigger still rejected every attachment. After separately approved repair, the real chat displayed the 96 × 96 PNG and its image viewer; `/ficheiro` delivered a 121-byte UTF-8 file whose downloaded bytes matched the fixed sample. See the [activation record](ALTARA_BOTS_PLATFORM_V2.md#hosted-activation-2026-10-02) for the original package. New installation grants still require a server manager's approval.

The separate `20261002204133_bot_attachment_cutoff_admissions_v1.sql` repair was applied with explicit operator approval on 2026-10-02. It preserves the legacy remote-JSON cutoff and admits only private uploads revalidated against their current bot/server/channel authority, expiry and message binding. Real PostgreSQL regressions reproduce the published cutoff failure before the repair and verify send, reply, edit, preserved files, permission revocation, forged references and repeated application after it. Hosted inspection confirmed the exact function body, active binding/deletion guards, revoked direct execution and private storage authority. No direct bucket access is added.

The local web client also renews private file/audio open and download actions through the existing broker after a delivery URL expires. Modal actions do not retain a signed download link. Renewal verifies the current account, conversation, navigation and exact message attachment again after the asynchronous request; removed attachments and closed or superseded viewers discard late results. The focused action suite and related UI/upload/media regressions passed (59 tests). On 2026-10-02, the refreshed real Chrome chat opened the existing TXT attachment, then kept its modal open for 85 seconds before clicking its native Download button. Chrome saved a new 121-byte copy whose SHA-256 matched the fixed sample. The modal contained no signed download anchors. This verifies the document download renewal path; native downloads of inline image/audio/video media still have separate browser behavior.

## Photo and file test in the Node starter

The repository's `examples/altara-ping-bot-node` starter includes an optional,
fixed-content demonstration. Set `ALTARA_BOT_FILES_EXAMPLE=1` in its private
`.env`, then restart the process. `/foto` uploads a visible 96 × 96 test PNG;
`/ficheiro` uploads a small UTF-8 text file. Both reply in the invoking public
channel through the same public SDK upload/reply methods available to any bot.
They do not fetch external URLs or read caller-selected file paths.

Request Attach Files in the Developer Portal and have the server manager approve
the installation update. The managed role and channel/category overrides must
also allow Attach Files, in addition to View Channels and Send Messages.
Enabling the local demo never changes those permissions. Without them, the bot
refuses the upload and explains which permission is missing.

Verify that `/foto` displays its actual preview and opens the image viewer, and
that `/ficheiro` offers a download whose contents match the harmless sample.
Command registration or a text acknowledgment alone does not verify delivery.

## Private conversations and channel threads

The DM/thread backend is active as part of the same 2026-10-02 package. The initial real LEYLEY DM dialog showed consent unchecked and sending disabled; read-only SDK calls for DM history and thread listing returned HTTP 403 `bot_permission_required` before the new grants. With subsequent explicit operator approval, only Direct Messages, Create Threads and Mention Members were added to LEYLEY's JA FOSTE installation (17 to 20 permissions). The operator's own DM consent was saved through the real dialog. One human message and one bot reply were verified through the official SDK and displayed together in that dialog. One thread was created in general, received one bot message and was verified in both SDK history/listing and the real Threads dialog. These checks do not verify automatic event callbacks or microphone capture.

The ALTARA app lists bot conversations in **FRIENDS / MESSAGES** and opens them in the main chat. `lib/botDirectMessages.js` owns the authenticated inbox, consent, history, retries and account-specific read cursors; `lib/botDirectMessageView.js` uses the normal chat layout. Bot conversations remain separate from encrypted human DMs and their message actions. The server context is shown when the same bot has conversations from multiple installations.

`lib/botSurfacesUi.js` still provides the thread dialog through `openThreads({ serverId, channelId })`. Its legacy direct-message dialog remains available to other hosts, but the main app uses the normal inbox.

Private messages require an explicit **Permitir mensagens** action in the chat. Opening a conversation never grants consent. Once allowed, the permission prompt disappears; the normal header's **⋯** menu keeps **Retirar autorização de mensagens** available, including during an uncertain send or after the installation is disabled. The bot also needs the approved Direct Messages installation permission. Automatic DM event callbacks additionally require the developer's saved Direct Messages intent and the matching SDK intent; explicit history/send calls do not enable or verify those callbacks. Leaving the server, revoking the grant or disabling the bot/app invalidates previous consent; rejoining does not restore it.

The bot chat shows the latest 50 messages with the same header, date/time helpers and composer styling as other chats. History and live delivery update automatically through account-filtered Postgres Changes, reconnect/focus refresh and a **Tentar novamente** recovery action when needed; there is no permanent refresh button or continuous history polling. Migration `20261002220539_bot_dm_realtime_publication_v1.sql` was activated with explicit owner approval on 2026-10-02; both tables remain protected by their existing ownership RLS policies. Threads inherit the parent channel's current read/write permissions, support creation and archiving, and disable writing after archival. Human actions use `bots_dm_actor_v1` and `bots_thread_actor_v1`; the database derives the actor from `auth.uid()`, never from a supplied recipient ID.

Message/thread retries preserve the exact original payload and UUID until success, preventing duplicate writes after a lost response. Account changes clear the bot inbox, drafts and pending operations, abort supported reads and discard late results. Navigation away suppresses late chat updates. Text uses the existing safe message renderer; Enter sends and Shift+Enter inserts a newline. Thread dialogs retain their focus trap and Escape behavior. A missing backend RPC produces an explicit unavailable message rather than pretending activation succeeded.
