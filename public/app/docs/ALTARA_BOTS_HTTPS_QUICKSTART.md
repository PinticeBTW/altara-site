# Run an ALTARA HTTPS bot

Use this example when your bot receives signed requests at your own public HTTPS
endpoint. The ordinary FAQ, calculator and music downloads use Bot Token
Connection and remain the simpler choice for a bot running on a PC or server.

Download [HTTPS bot (JavaScript)](/bot-starters/altara-webhook-node.zip) from the
Developer Portal. It includes the official signature-verification helper, an
interactive example, command registration, a dependency lockfile and empty
configuration. There is no hosted service included in the download.

## 1. Prepare a separate test bot

Create a bot in the Developer Portal and install it in your test server. Use its
existing Send Messages, Use Slash Commands, Read Basic Channel Metadata and
Manage Own Commands permissions. The examples do not need message-content,
member, microphone or moderation access.

Install Node.js 22.12 or newer. Extract the ZIP and open a terminal in the folder
containing `package.json` and `index.js`.

Windows PowerShell:

```powershell
node --version
npm ci
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
```

macOS or Linux:

```sh
node --version
npm ci
[ -f .env ] || cp .env.example .env
```

These commands preserve an existing `.env`. The starter uses Node's built-in
environment-file support and installs its locked dependencies.

## 2. Configure the private environment

Open `.env` in a local editor. Set:

| Variable | Purpose |
| --- | --- |
| `ALTARA_SIGNING_SECRET` | The signing secret for this same bot, obtained from its Webhooks section. The receiver uses it to authenticate ALTARA requests. |
| `ALTARA_FUNCTIONS_URL` | Required HTTPS Functions endpoint for your ALTARA environment. For hosted ALTARA, copy the public `DEFAULT_FUNCTIONS_URL` at the top of the included `altara-client.js`. For another deployment, use its Functions URL. |
| `ALTARA_BOT_TOKEN` | Needed only if you choose the registration command below. Use this bot's token, not its signing secret. |
| `PORT` | Optional local port; the default is 3001. |

Do not put these credentials in the endpoint URL, messages, screenshots or
source files. `.env` is ignored by Git and excluded from the download. Signing
secrets are shown only once; replacing one in the Portal requires updating the
receiver and verifying its endpoint again. Never reuse another bot's credentials.

## 3. Register the example commands

To add the example's commands using your bot token:

```sh
npm run register
```

Registration is a separate, explicit operation. It adds or updates these five
command names and leaves other command names enabled. It does not start a
polling connection, choose HTTPS delivery, install a bot or change permissions.

| Command | Expected response |
| --- | --- |
| `/ping` | Public connection check. |
| `/painel` | A public message with buttons and a selection menu. Their example replies are private. |
| `/privado` | A reply visible only to the person who used the command. |
| `/formulario` | A text-input form; submission returns a private confirmation. |
| `/adiado` | A private initial response completed after the example's short delay. |

If you manage command definitions another way, use those same names in the
Portal's Commands section instead. Keep your real bot's existing registry in
mind when adding example commands.

## 4. Start and verify the receiver

```sh
npm start
```

The default local endpoint is `http://localhost:3001/altara/interactions`.
Keep the process running. Importing the example does not start it automatically.
Use your own HTTPS host or development tunnel to reach this endpoint publicly;
the Portal requires a public HTTPS URL on port 443.

In this bot's **Webhooks** section:

1. Enter the public URL ending in `/altara/interactions` and choose **Save endpoint**.
2. Choose **Test endpoint** and wait for **verified**.
3. Select **HTTPS webhook** under Delivery mode and choose **Save delivery mode**.

Saving or verifying an endpoint does not itself switch command delivery.
The bot should have one selected delivery mode; this starter does not run the
Bot Token Connection poller alongside the HTTPS receiver.

## 5. Try the example

Use the commands in your test server. Choose a menu option and open the form
from a button as well as `/formulario`. Private replies have the ordinary bot
identity and an indicator that only you can see the message.

The form deliberately confirms receipt without repeating the submitted text.
Signed requests are validated over their original body bytes. Invalid signatures,
expired timestamps and unsupported interactions receive safe errors; credentials,
capabilities and submitted fields are not printed in errors or logs.

`/adiado` completes one initial response using the event's limited Interaction
credential. Visibility is fixed when it defers. The platform deadline remains
five minutes and private presentation lasts at most 15 minutes. The example
bounds outstanding jobs and cancels its own work on shutdown. It does not
promise durable execution across a process restart; production bots should
persist their own work without exposing these credentials.

## Change the behavior

- `commands.js`: command definitions and the command, button, selection and form handlers.
- `index.js`: signed receiver, deferred completion and process lifecycle.
- `register.js`: explicit command registration.
- `index.webhook.js`: the copied official HTTPS helper. Its source of truth is
  `examples/altara-ping-bot-node/index.webhook.js` in the full ALTARA checkout.
- `altara-client.js`: the official source client used by registration.

Change your handlers, then register again only when command definitions change.
This example replies to selections; it does not edit the public message. Public
message updates require the existing Manage Messages permission. Private
controls, uploads, mentions and multiple deferred follow-ups are outside this
HTTPS contract.

See [the Client API guide](ALTARA_BOTS_SDK.md),
[interactive messages](ALTARA_BOTS_COMPONENTS.md) and
[hosting](ALTARA_BOTS_HOSTING.md) for the full supported contract.

## Rich results package prepared locally (2026-10-05)

The new canonical helper also exposes `uploadInteractionAttachment` and
`followUpReply`; `reply` can carry private controls, upload IDs and explicit
member mentions. These additions need the matching backend/frontend package
before use on hosted ALTARA. The current limits and hosted results above record
the earlier version. See [the rich HTTPS contract](ALTARA_BOTS_SDK.md#rich-https-results-prepared-locally-2026-10-05)
for fixed privacy, stable request IDs, deadlines and file limits. Existing five
starter commands keep their behavior; downloading does not change permissions
or switch a bot to HTTPS.
