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
interactive delivery, slash-initiated modals, ephemeral replies, entity-select
menus and other Discord component types remain future work. Rich cards and
existing text webhook callbacks retain their working behavior.

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
