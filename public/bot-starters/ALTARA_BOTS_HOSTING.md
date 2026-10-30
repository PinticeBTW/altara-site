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
7. ALTARA validates and stores the bot response with its permitted text, cards,
   files and controls.

Reply text is limited to 2000 characters. `bot:embed_links` enables ALTARA link
previews and validated structured cards. `bot:attach_files` enables the separate
scoped private-upload API with approved channel access; arbitrary remote file
descriptors are not trusted uploads. The 2026-10-02 backend expansion is active
after explicit approval and catalog/authentication/access checks. Its new
authenticated real-chat flows and microphone capture were not tested today;
read the [activation record](ALTARA_BOTS_PLATFORM_V2.md#hosted-activation-2026-10-02)
and [private-file guide](ALTARA_BOTS_FILES.md) for the limits.

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

The hosted backend now supports explicit owner-selected HTTPS delivery, with
Bot Token Connection retained as the default. The chat and Developer Portal
sources are synchronized to the local site; production website deployment is
a separate action.
Saving/testing an endpoint never changes the selected command delivery mode.

### Explicit command routing: hosted active, 2026-10-05

`supabase/migrations/20261005111356_bot_command_delivery_route_v1.sql`, the chat
router and the Developer Portal add one explicit owner choice: **Bot Token
Connection** (the existing default) or **HTTPS webhook**. Existing apps remain
on Bot Token Connection. In Advanced Webhook Mode, generate a signing secret
using the separate owner-confirmed action and copy it into the endpoint's
`ALTARA_SIGNING_SECRET` environment variable. It is shown once in the owner's
current portal session. Replacing it requires updating the endpoint's secret.
Then save and verify the endpoint and separately select and save HTTPS delivery.
The endpoint must match the
complete saved and verified application URL; a legacy per-command callback URL
does not change the destination or select the mode.

The chat checks current account, command and channel authority before choosing
a transport. An HTTPS invocation uses a stable request UUID and an atomic
service-only reservation. An identical or concurrent request observes the same
event and never sends another callback; changing its arguments is rejected.
Deleting an event leaves a minimal request/hash tombstone that prevents that
request UUID from being sent again. No separate tombstone cleanup is installed.
Timeouts and uncertain HTTP responses never fall back to the SDK queue.

With explicit approval, the migration was published as `20261005115207` and
the dispatcher was updated. After operator-gate activation, v37 is ACTIVE with
JWT verification retained and five reviewed bundle files verified. The operator
gate is enabled; an unauthenticated caller and a public anon identity are still
rejected. All four existing apps retained `bot_token`. No real signing key or
app mode was changed during publication.

The 90 local tests exercise actual chat/portal functions, dispatcher fixtures
and isolated PostgreSQL guards. A separate temporary public TLS test passed
12/12 cases using the unchanged production transport, actual Node handler,
fictional payloads and an in-memory test key. It covered signatures, redirects,
response limits, timeouts and origin pinning; the receiver and tunnel are closed.
The final round used a fixture-only DNS Resolver with `1.1.1.1` after local
DNS failures, without changing global DNS. These results do not prove the hosted
function's DNS or an authenticated hosted chat-to-endpoint/browser round trip.
The private response case used only a synthetic serializer fixture.

After the CHECK/expiry correction was published as hosted migration
`20261005131559`, independent hosted verification passed 10/10 checks. One
public `/ping` from the separate **ALTARA HTTPS TEST** bot passed through the
real authenticated portal/chat: one signed challenge, one signed command,
zero duplicate deliveries or signature rejections, and one responded event,
one reservation and one linked chat reply. HTTPS private replies were not
part of that earlier public `/ping` proof.

<a id="callback-reply-preparation-2026-10-05"></a>

### Callback reply authority: hosted active, 2026-10-05

With explicit user approval, `bot_callback_response_authority_v1` was applied
as hosted version `20261005104633` (local source `20261005102800`), and
`altara-bot-interaction-dispatch` v35 is ACTIVE with JWT verification retained.
Initial public or author-only text/card callback replies use one guarded,
transactional, service-only response RPC. This activates response authority,
not an external delivery route. The Node inbound example exports
`createWebhookApp` and `reply`; importing it does not
start a listener or load `.env`. The dedicated
[HTTPS starter](ALTARA_BOTS_HTTPS_QUICKSTART.md) includes this official helper,
a runnable example and its locked dependencies; the other three downloads
keep Bot Token Connection. Other
signature-validating handlers can use the native JSON/API contract directly.
`reply({ content, embeds, ephemeral: true })`
preserves explicit Boolean privacy. Omitted privacy remains public and its
existing `hello`, `ping` and `roll` handlers are unchanged. Invalid privacy or
unsupported response fields fail without reflecting their content in errors.
The existing raw-body HMAC check uses constant-time comparison and a five-minute
timestamp window. The 43-test local matrix covered HTTP, transport limits,
captured Express handlers and isolated PostgreSQL authority/concurrency cases.
Hosted read-only checks verified the approved body/ACL, preserved responders
and HTTP authentication rejection. That earlier reply-authority activation did
not exercise a positive external callback round trip; the later authenticated
public `/ping` proof is recorded above. The hosted value of
`ALTARA_ENABLE_EXTERNAL_BOT_COMMAND_DISPATCH` was not read or changed during
that earlier reply-authority activation. The later routing
activation above enables it while preserving its default-off source code.

Signed button/menu/form delivery, webhook-opened modals and deferred initial
completion were still pending at that earlier reply-authority stage; the
published follow-up is recorded below. Private callback attachments, mentions and controls are
unsupported. Existing Bot Token Connection private replies/forms are already
active. See [the SDK callback contract](ALTARA_BOTS_SDK.md#advanced-webhook-replies-authority-hosted-active-2026-10-05).

<a id="https-controls-and-deferred-completion-prepared-locally-2026-10-05"></a>

### HTTPS controls and deferred completion: hosted active, 2026-10-05

With explicit approval, the two migrations are published as hosted versions
`20261005144103` and `20261005144111`; dispatcher v38 and responder v34 are
active. Public controls, initial private replies and command/control-opened forms
use the existing HTTPS endpoint and chat UI. SDK remains the default. A real
authenticated run confirmed private button/form content, five commands and both
single deferred completions. The private-menu result was also visible after
browser control recovered. A fresh form submission then showed the corrected
source bot name/avatar and private confirmation; the narrow identity fix passed
16 focused local tests.
The callback keeps the exact queued event and signs `id`/`event_id` in its body;
component/form submissions do not expose answers or credentials in diagnostics.

A command can defer one initial reply. Keep its verified event and scoped token
securely in your existing worker, then use `completeDeferredReply` with the
project's HTTPS `/functions/v1` API base. The helper sends `complete_interaction`
to `/altara-bot-respond` with `Authorization: Interaction <event.token>`.
The completion credential authorizes that event only and expires at the original
five-minute deadline; it is not the bot token or endpoint signing secret. Never
log it. The public/private choice is fixed, and an exact replay cannot create a
second reply. The host must keep the deferred work running; this package does
not provision a worker or scheduling service.

Private replies use the existing author-only UI for at most 15 minutes; forms
expire after their original 10-minute submission window. Multiple follow-up
messages, another deferred completion, private controls/uploads/mentions and
form chaining are unsupported. Public message updates also require the existing
`bot:manage_messages` grant; the fixture without it was refused without a public
edit, so no positive HTTPS update is claimed. See [the published API](ALTARA_BOTS_SDK.md#https-controls-and-single-deferred-completion-prepared-locally-2026-10-05).

### Endpoint and delivery limits

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

<a id="rich-https-delivery-prepared-locally-2026-10-05"></a>

## Rich HTTPS delivery: backend active (2026-10-05)

The package supports up to ten fixed-visibility follow-ups per signed event,
private controls, validated uploads and explicit member mentions. Its
operator-approved hosted activation applied three migrations and activated
three Edge functions on 2026-10-05. The matching site frontend and starters have
only been updated and served locally; no public frontend release is claimed.
Authentication denials were checked. Later scoped authenticated runs verified
signed private controls, a form and eight private deliveries without public
message writes. A separate approved run verified public/private fictional TXT
and PNG uploads, own-account mentions, public captions and byte-exact downloads,
including private downloads after 79 and 118 seconds. The signing key was entered
by the operator through a hidden local prompt; no agent key read or persistence
is claimed. Temporary grants, endpoint settings and receivers were restored or
closed after the checks.

This is recorded test-bot evidence, not an indefinite availability or full-project
release guarantee. Existing SDK mode, endpoint verification, signature/redirect
limits and worker ownership remain unchanged. The capability guide records the
separate real role/microphone follow-ups and the operator-reported leave/rejoin;
the latter was not continuously observed without F5. See
[the rich HTTPS contract](ALTARA_BOTS_SDK.md#rich-https-results-prepared-locally-2026-10-05)
and [the scoped real follow-up](ALTARA_BOTS_CAPABILITIES.md#scoped-real-follow-up-verified-2026-10-06).
