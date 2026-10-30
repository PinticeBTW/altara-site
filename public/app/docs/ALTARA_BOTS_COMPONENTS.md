# Interactive bot messages

Buttons, string selection menus and text-input modals are available for
JavaScript/Python Bot Token Connection clients. The hosted backend was activated
on 2026-10-01 with `20261001140325_bot_message_components_v1.sql` and the
`20261001145752_bot_component_actor_access_fix.sql` correction, message-send
v28, respond v30 and the new `altara-bot-components` v1. Local chat assets and
starter downloads include support. Published website/desktop chat releases
still need the updated assets; downloading the SDK alone does not update a chat.

## Send controls

Use up to five action rows. Each row contains up to five buttons or one menu.
Button styles: 1 primary, 2 secondary, 3 success, 4 danger, 5 public HTTPS link.
Action buttons need a unique `custom_id`, up to 100 characters; link buttons use
`url` and never invoke the bot. Labels contain plain text, not executable HTML.
Menus support up to 25 unique options and `min_values`/`max_values` for multiple
selections. Controls expire after 24 hours; changing controls creates a new
revision and rejects clicks on the old one. `components: []` removes controls;
omitting components during editing preserves them and their expiry.

### Button and menu recovery

The updated local chat client keeps the request ID and exact message revision,
control ID and ordered selection while an action is unconfirmed. A retry after a
lost invoke response reuses that snapshot; once the queued event ID is known,
retry reads its result instead of invoking the action again. A changed selection
is refused until the original attempt finishes: restore the original selection
to retry. Success, a returned failed/expired event, or a definitive rejection of
the first write finish that attempt. A denied read/replay after acceptance or an
uncertain write keeps its event ID/request ID for safe recovery;
revision, account or navigation changes separate the local intent.

Unconfirmed writes can only be retried within five minutes, before the backend's
finite recovery ledger can be removed; expiry never silently issues a new request
ID. The current view retains at most 128 unfinished attempts and refuses overflow
rather than evicting an uncertain write. Account/navigation reset clears local
attempts and fences old feedback; it cannot cancel an action already accepted by
the backend. Recovered forms retain their backend expiration; an already expired
form is not reopened. Existing public replies, forms and keyboard controls are preserved.

```js
await ctx.reply({
  content: "Choose your next game",
  components: [
    { type: 1, components: [
      { type: 2, style: 1, label: "Hello", custom_id: "hello" },
      { type: 2, style: 2, label: "Open form", custom_id: "profile" }
    ] },
    { type: 1, components: [
      { type: 3, custom_id: "game", placeholder: "Choose a game", options: [
        { label: "Chess", value: "chess" }, { label: "RPG", value: "rpg" }
      ] }
    ] }
  ]
});

bot.on("interactionCreate", async interaction => {
  if (interaction.customId === "hello") await interaction.reply("Hello!");
  else if (interaction.customId === "game") {
    await interaction.reply(`Selected: ${interaction.values.join(", ")}`);
  } else if (interaction.customId === "profile" && interaction.isButton()) {
    await interaction.showModal({
      title: "Your profile", custom_id: "profile-submit",
      components: [{ type: 1, components: [{
        type: 4, style: 1, custom_id: "name", label: "Name",
        min_length: 1, max_length: 40
      }] }]
    });
  } else if (interaction.customId === "profile-submit" && interaction.isModalSubmit()) {
    // Answers are available in interaction.fields.name. Avoid publishing them.
    await interaction.reply("Form received.");
  }
});
```

`reply` sends a channel message, `update` edits the source bot message,
`showModal` opens an actor-scoped form, and `acknowledge` completes an action
without posting a message. The SDK awaits async handlers and acknowledges an
unanswered action after all handlers finish. Only registered interaction
handlers enable component polling; existing slash/message/member paths remain
compatible. Register handlers before starting the client.

Forms currently open from a message button/menu interaction, contain one to
five text inputs, and allow one submission by the initiating user within ten
minutes. Type 4/style 1 is single-line, style 2 multiline. Each field supports
`label`, `custom_id`, `required`, `placeholder`, `value`, `min_length` and
`max_length` (at most 2000 characters).

## Python

Send the same component dictionaries with
`await ctx.reply("Choose", components=rows)`. Register async handlers:

```python
@bot.event("interaction_create")
async def interaction(ctx):
    if ctx.custom_id == "hello":
        await ctx.reply("Hello!")
    elif ctx.is_string_select_menu():
        await ctx.reply("Selection received.")  # ctx.values
    elif ctx.is_modal_submit():
        await ctx.reply("Form received.")  # ctx.fields
```

Python also provides `ctx.update(...)`, `ctx.show_modal(modal)` and
`ctx.acknowledge()`. Use `components=[]` to remove controls from an update.

## Access and delivery

Sending controls requires the bot's approved `bot:send_messages` grant and
current bot channel access. Cards additionally require `bot:embed_links`;
updating a message requires `bot:manage_messages`. Users need current channel
view and use-application-commands permissions. Private channels are excluded
by the existing bot channel policy. Every click, delivery, form submission and
response rechecks access, bot ownership and the current message revision.

Action requests use actor-scoped request IDs; repeated identical requests
return the original event. Bot responses use a 30-second lease and are
transactionally idempotent. A reply/update and event completion happen together;
repeating the same response cannot duplicate a message. Deliveries can be
retried after failure, so external business side effects must also use the
event ID for idempotency. Do not assume exactly-once delivery.

Pending actions expire after five minutes, with up to five delivery attempts.
Per-user submission limits and a bounded bot queue prevent unbounded backlogs.
Form answers live in a private table; other members cannot read them through
the API. This does not make bot-generated replies private: a bot can choose to
publish submitted content, so handle answers intentionally. Queue cleanup runs
on component polls after expiry plus fifteen minutes; retained data can remain
until the bot polls again. No background retention schedule is enabled.

This version targets Bot Token Connection handlers. Advanced Webhook Mode
interactive delivery, entity-select menus and other Discord component types
remain future work. Rich cards and existing public text webhook callbacks retain
their working behavior. Private slash responses and slash-initiated forms are
active in the hosted backend from 2026-10-05, as described below.

## Private slash replies and forms: hosted active, 2026-10-05

The Node/Python clients can request an author-only slash reply or open a form
directly from a slash handler. With explicit user approval, the hosted project
applied `bot_private_slash_interactions_v1` (version `20261005014035`) and activated
`altara-bot-respond` v32, `altara-bot-components` v2 and
`altara-bot-interaction-dispatch` v34 on 2026-10-05. Use the updated SDK and chat
assets. Unsupported private requests fail rather than publishing their content
as an ordinary channel reply.

Local automated checks and the browser fixture passed. The final authenticated
real-chat check used the local web assets `private-interactions-ui-v5`: the first
`/painel` showed LEYLEY's name/avatar and its private reply with no Thinking
indicator before any further interaction, still clear after at least 20 seconds.
A second invocation opened the slash form; one submission returned a private
confirmation, closed the form and restored composer focus, with no Thinking
indicator. Neither private text appeared in the public timeline. Hosted metadata
also confirmed no linked public messages. No hosted frontend deployment is claimed.

```js
bot.command("segredo", { description: "Uma resposta só para ti" }, async ctx => {
  await ctx.reply({ content: "Só tu podes ver esta resposta.", ephemeral: true });
});

bot.command("pedido", { description: "Abrir um formulário" }, async ctx => {
  await ctx.showModal({
    custom_id: "pedido:novo",
    title: "Novo pedido",
    components: [{ type: 1, components: [{
      type: 4, style: 2, custom_id: "texto", label: "O teu pedido",
      min_length: 1, max_length: 500,
    }] }],
  });
});

bot.on("interactionCreate", async ctx => {
  if (ctx.isModalSubmit() && ctx.customId === "pedido:novo") {
    await ctx.reply("Pedido recebido.", { ephemeral: true });
  }
});
```

Python exposes `await ctx.reply("…", ephemeral=True)` and
`await ctx.show_modal(modal)` on slash contexts. Submitted forms use the existing
`interactionCreate` / `interaction_create` event and modal-submit helpers.

Private replies accept text and validated cards. Private attachments, mentions
and message controls are not supported in this first follow-up. Form replies
stay private; changing a public message or opening another form from that submit
is rejected. The existing public message-component forms keep their established
behavior.

The server binds the result to the original invoking account, bot, command,
server and channel. Reads, submissions and retries recheck current account and
installation/channel access. Private content is stored separately from public
messages and does not enter public history, Realtime or notification feeds.
Replies expire within 15 minutes; an open form can be submitted for 10 minutes.
Expired payload cleanup is bounded and eventual, driven by existing calls/polls;
this package does not add a background schedule. Authors can dismiss the local
reply, and navigation/account changes clear the local private view.

The advanced webhook response authority is active after explicit approval of
`bot_callback_response_authority_v1` (hosted version `20261005104633`, local
source `20261005102800`) and `altara-bot-interaction-dispatch` v35. It supports
**initial private text/cards and guarded public replies**, using the existing
author-only result store and a transactional, service-only callback-response
RPC. Malformed private intent and form responses are rejected instead of
silently becoming public. The 43-test local matrix passed; hosted read-only
checks verified body/ACL, preserved responders and JWT rejection. That initial
authority stage did not exercise a positive external callback round trip.
The inbound Node example preserves explicit Boolean `ephemeral` intent; its
existing `hello`, `ping` and `roll` replies remain public. Invalid privacy and
unsupported fields fail without echoing message content in errors.

That initial reply-authority package did not add signed delivery of button/menu
actions or form submissions, webhook-opened modals or deferred initial completion.
Private controls/files/mentions remain unsupported. `ALTARA_ENABLE_EXTERNAL_BOT_COMMAND_DISPATCH` retains its
default-off code; it is now enabled in the hosted configuration. A separate
chat route and explicit owner choice are active on the hosted backend, with idempotent
delivery reservation and current account/channel authority. That package is
published as migration `20261005115207` with operator-gate activation and
dispatcher v37 ACTIVE/JWT verified. The local chat/portal sources are synchronized.
A temporary fictional-data public TLS test passed 12/12 transport/handler cases
and closed its receiver/tunnel, with a fixture-only DNS Resolver.
After the CHECK/expiry correction was published as hosted migration
`20261005131559`, independent hosted verification passed 10/10 checks. One
public `/ping` from the separate **ALTARA HTTPS TEST** bot passed through the
real authenticated portal/chat: one signed challenge, one signed command,
zero duplicate deliveries or signature rejections, and one responded event,
one reservation and one linked chat reply. HTTPS private replies were not
part of that earlier public `/ping` proof.
SDK remains the default for existing
apps; endpoint verification alone does not select HTTPS delivery. See
[the SDK callback boundary](ALTARA_BOTS_SDK.md#advanced-webhook-replies-authority-hosted-active-2026-10-05).
This is ALTARA's explicit API, not Discord wire/API parity.

<a id="https-controls-and-forms-prepared-locally-2026-10-05"></a>

## HTTPS controls and forms: hosted active, 2026-10-05

The published follow-up reuses these buttons, string selects, dialog and private
reply card for HTTPS delivery. Its two migrations are hosted versions
`20261005144103` and `20261005144111`, with dispatcher v38 and responder v34
active. Public command replies may include controls, and a command or control
can open a form.
Button/menu actions and form answers stay in the existing private event queue
and signed callback, with one outbound reservation for each event. An uncertain
reply keeps that same event ID; a known result is reread without another action.

Transport is captured by the backend before the event can be claimed. Form
children inherit the parent, rather than moving to a different SDK/HTTPS path
when the owner changes mode. Current actor/channel access, source revision,
endpoint and expiry still apply. Private results reuse the author-only renderer
and never enter public history, unread counts or notification feeds. Forms
retain the original 10-minute deadline, single-submit lock and focus behavior;
private replies remain visible for at most 15 minutes.
Public `update` responses reuse the existing message-edit authority and require
`bot:manage_messages` (Manage Messages). The live fixture without this grant
was refused without a public-message change; positive HTTPS updates remain
unverified here.

A slash command may defer one initial reply for its original five-minute window.
Completion uses the signed body's event ID and `Interaction` credential, with
fixed public/private visibility and exact-response replay. Multiple follow-ups,
private controls/uploads/mentions and forms opened from a form submission are
unsupported. SDK defaults and existing handlers remain unchanged. The real run
confirmed private button/form content and both deferred initial completions.
The private-menu result was also visible after browser control recovered.
A fresh form submission then showed the corrected source bot name/avatar and
private confirmation; the identity regression passed 16 focused local tests. See
[the published contract](ALTARA_BOTS_SDK.md#https-controls-and-single-deferred-completion-prepared-locally-2026-10-05).

## Local example

The ping starter optionally enables `/painel` with
`ALTARA_BOT_COMPONENTS_EXAMPLE=1`. Its demo lets users
click a greeting, select a game and submit a form. It acknowledges forms without
publishing their answers and preserves the existing slash command registry.

Slash commands do not require a text prefix or message-content subscriptions.
When a submitted command is missing from the composer's cached registry, the
chat refreshes that server's list once before treating the input as ordinary
text. It rechecks the account, channel and command permission after the refresh.
Commands already in the cache keep their existing path without an extra request.

Verification includes real local database access/revocation, leases, retries,
modal submission and idempotency tests, JavaScript/Python SDK tests, and isolated
browser interaction tests. Hosted panel storage, invalid-control rejection and
unauthenticated access rejection were verified. Authenticated live greeting,
menu selection and modal submission were verified in JA FOSTE/general after
correcting the actor access path. The original service-only bot API and its
grants remain unchanged. The regression fixture now distinguishes authenticated
JWT claims from service claims instead of treating both as service-role calls.
Composer regressions cover newly synced commands, unknown slash text and account,
channel or permission changes while the registry refresh is pending.
The user also confirmed that `/painel` creates the interactive card in the live
chat after the updated local assets were loaded.

References: [Discord message components](https://docs.discord.com/developers/components/using-message-components),
[interaction data](https://docs.discord.com/developers/interactions/receiving-and-responding).

<a id="private-https-controls-prepared-locally-2026-10-05"></a>

## Private HTTPS controls: backend active (2026-10-05)

The package uses the same buttons, string selects and forms in an
author-only result. Every action rechecks the invoking user, current channel
access, revision and source expiry; it cannot be rebound to a public message.
Results refresh on the actor's private metadata notification, reconnect and
foreground return, without a permanent poller. No private body or signed file
URL is broadcast. Its operator-approved hosted activation applied three
migrations and activated three Edge functions on 2026-10-05. The matching site
frontend and starters have only been updated and served locally; no public
frontend release is claimed. Authentication denials were checked, but positive
authenticated HTTPS, Storage and browser checks of this rich package remain
pending. The earlier hosted limitations above remain its historical verification. See
[the rich HTTPS contract](ALTARA_BOTS_SDK.md#rich-https-results-prepared-locally-2026-10-05).

## Native DM/thread controls and modern layouts (hosted backend active, 2026-10-07)

This package accepts entity selects (USER/ROLE/MENTIONABLE/CHANNEL) and bounded
section, text, thumbnail, gallery, file, separator and container layouts. Media
references contain an admitted `upload_id` from the same message or result;
remote media URLs never become attachment authority. USER choices are people,
and current channel choices are TEXT/VOICE. Native DMs do not invent a server
role or channel namespace.

`source_kind: 'dm' | 'thread'` preserves the real native message ID, origin and
recipient or thread/parent. Native callbacks use their own lease and result
authority. Buttons, selectors and forms reuse the existing renderer; private
results and their files recheck account, source, consent, revision and expiry.
Native follow-ups refresh only registered events for a finite capability window,
deduplicate response sequences and stop after expiry or navigation.

The SDK's full event cycle polls native components separately from the legacy
guild queue. HTTPS `complete_interaction` and `followup_interaction` pass the
native source hint while the service derives its actual authority. The example
helper selects `altara-bot-surface-attachments` for native uploads, retaining the
existing guild broker otherwise. Private upload references cannot be published
in another conversation or public reply.

The reviewed migrations and Edge functions were activated with operator approval
on 2026-10-07. Local behavior tests and hosted catalog, ACL/RLS, constraint and
fourteen distinct negative RPC cases passed. All sixteen packet endpoints
rejected unauthenticated requests, and deployed source files matched the packet.
Positive SQL checks also verified modern controls in a native forum thread,
including rich cards, idempotent forum creation and AutoMod composition. These
synthetic checks were rolled back; they do not prove authenticated Edge delivery.
The existing daily cleanup also clears expired private interaction/form values
in bounded batches while preserving receipts and hashes. DM retention remains
thirty days with pinned messages retained; activation does not grant bot access.

New Storage object delivery and authenticated browser flows were not verified
in this session: the browser policy refused control of the operator's tab.
The matching client and examples are updated locally, without a public frontend
release claim. Stage activation remains excluded.

## SDK private replies to public guild controls: hosted active, 2026-10-07

With operator approval, hosted migration `20261007190457` activated this SDK
private text/card route on 2026-10-07, without requiring an original
`slash_event_id`. A live JavaScript canary used LEYLEY's existing `/painel` and
one public V2 button in `JA FOSTE` / `general`, with the pintice account. The
fixed private confirmation and `Only you can see` indicator appeared in the UI;
the response was accepted once, matched the clicking actor and created no
public row containing the private body. Python, menus, modal submissions and
different-account hosted cases were not exercised in this canary; their SDK/API
and PostgreSQL matrix tests remain separate evidence. No full Discord parity,
physical Stage or public frontend release is claimed.

```js
bot.on("interactionCreate", async ctx => {
  if (ctx.isButton() && ctx.customId === "example:private") {
    await ctx.reply({ content: "Só tu podes ver esta resposta.", ephemeral: true });
  }
});
```

Python uses `await ctx.reply("Só tu podes ver esta resposta.", ephemeral=True)`.
Both clients send the clicked component's own event ID and lease through the
existing `altara-bot-components` responder. They do not borrow a slash event or
send an actor/recipient override. The backend binds the private result to the
account that clicked; a different account creating the original card does not
become its recipient.

Only text and validated cards are supported for these SDK private replies.
Private files, controls and mentions are rejected; explicit privacy must be a
Boolean. Unsupported payloads and backend errors remain explicit and do not
publish the content or a public error reply. A response is marked accepted only
after transport success. An older backend may reject the new request with
`invalid_component_response` or `components_not_available`; no public fallback
is attempted. Existing public reply/update/ack/modal, private slash/form and
native DM/thread routes retain their separate contracts. This addition does
not establish HTTPS, native-surface or hosted private-delivery verification
beyond the single-button canary above.

If a handler catches a failed private reply and returns normally, the SDK does
not automatically acknowledge that event. Its private attempt remains separate
from successful acceptance, so redelivery can retry the same private response
after rejection or uncertain acceptance. Ordinary events without a private
attempt keep their existing automatic acknowledgement.
