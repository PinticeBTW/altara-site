# Bot voice audio and music

## Delivery status

The source includes a real LiveKit RTC publisher, a local-file player and optional
yt-dlp integration for YouTube links/searches and Spotify track matching. Local
MP3 decoding, native PCM frames, playback controls, database authorization and
connection fencing are tested. The hosted audio migration and voice endpoint
were activated on 2026-10-01 with the operator's approval, and LEYLEY's music
commands are enabled. The operator confirmed that LEYLEY joins MUSICA and its
test melody is audible. Slash control responses have also been observed in the
live chat; pause/resume audio and volume still need a full listener check.
On 2026-10-02 the operator confirmed an audible skip between queued tracks and
provided screenshots of `/queue` with a second track waiting. Public playlist
expansion and recovery still require their separate listener checks.
Playback status now updates on each track, pause, resume and
idle transition, and channel Room joins/leaves drive the bot notification cue.
YouTube link audio has been fetched and decoded into native-sized PCM frames;
name search and a public Spotify track matched to a YouTube source have been
verified on 2026-10-01. The operator also confirmed audible YouTube link playback
in the actual MUSICA call on 2026-10-01. Song-name and Spotify matching have been
verified during source resolution; their full listener/control checks remain pending.
The operator reconfirmed audible YouTube playback on 2026-10-02 after the browser
audio correction. The additional loading, collection and recovery work below is
implemented and tested locally; the recovery backend was activated with explicit
approval on 2026-10-02. Hosted catalog/authentication/access checks passed, but
the new authenticated recovery/capture paths and listener/reconnection behavior
were not exercised today. See the
[activation record](ALTARA_BOTS_PLATFORM_V2.md#hosted-activation-2026-10-02).

The loading notice originally finalized the slash interaction before its later
voice-admission check. This was corrected in the Node example on 2026-10-02:
progress uses a temporary ordinary message, and the final interaction reply comes
after voice admission. Play, pause, resume, stop and play-after-stop were verified
in the real JA FOSTE/MUSICA chat, and the operator confirmed audible YouTube
playback after the correction. The six lifecycle regression tests use the real
SDK and interaction-authority helper; five reproduce the failure with the prior
command implementation. New recovery and microphone-capture checks above remain
pending.

## Run the JavaScript starter

Download **Music bot (JavaScript)** from the developer portal. Use Node.js 22.12+
on a supported Windows, macOS or Linux machine. Extract the archive, run
`npm ci`, copy `.env.example` to `.env`, fill in your private bot token and the
Functions URL supplied by ALTARA, then run `npm start`.

Use a dedicated bot when trying a starter: startup synchronizes its command
registry and disables missing code-managed commands. The optional integration
in the repository's ping starter registers music alongside its existing
commands when `ALTARA_BOT_MUSIC_EXAMPLE=1`; install the music starter's
dependencies first. Do not run two processes with the same bot token.

Approve these server grants: Use Slash Commands, Manage Own Commands, Read
Channel Names, Send Messages, Embed Links, Connect to Voice, Publish Voice
Audio, Read Voice State and Set Voice Status. Server/channel access is still
checked by ALTARA. The current publisher uses public voice channels on servers
with the channel media protocol enabled.

Enter a voice channel, then use the commands in an accessible text channel:

| Command | Action |
| --- | --- |
| `/play` | Play the quiet, original 30-second test melody |
| `/play <id or filename>` | Add a file from the bot owner's music library |
| `/play <YouTube link>` | Play a single YouTube video with optional source tools |
| `/play <artist and song>` | Search YouTube and play the first result |
| `/play <Spotify track link>` | Identify the track and find corresponding YouTube audio |
| `/play <YouTube playlist link>` | Add up to 20 playlist entries, resolving later entries when played |
| `/play <Spotify album or playlist link>` | Identify up to 20 public tracks and match them on YouTube |
| `/pause` / `/resume` | Pause or resume playback |
| `/skip` | Skip the current track |
| `/queue` | Show current and queued tracks |
| `/volume nivel:0..100` | Set playback volume (default 35%) |
| `/stop` | Clear the queue, stop audio and leave voice |

Paste the link directly after `/play`; typing `faixa:` is optional. The named
option form remains compatible. Each developer chooses their own bot commands;
these names and options are part of the downloadable music example.

The voice participant menu's **User volume** is a separate, private listening
level (0–200%). It applies only to the listener and is saved in their account,
with a device cache for offline changes. Rejoining or reconnecting the same bot
keeps that level. `/volume` changes the bot's source volume for every listener.

The invoker must be connected to the bot's voice channel to change playback or
read its queue. An idle bot leaves after 60 seconds. Playback keeps running on
the bot owner's machine; ALTARA does not execute uploaded bot code.

External requests show a temporary **Preparing music** channel message without
finalizing the slash interaction. The final reply follows source lookup and the
current voice-admission checks; only then is the temporary message removed. If
own-message deletion is unavailable, the bot tries to mark it as processed;
optional cleanup failure does not stop playback. Source lookup runs outside
the short playback mutation lock, so pause/stop are not held behind a slow
YouTube request. Requests preserve their arrival order; at most five unresolved
requests per server and 20 queued tracks are allowed. `/stop` also cancels pending
requests, and late results cannot rejoin or enqueue after cancellation. Voice
admission is checked before lookup and again before joining/queueing.

The first request may still need source extraction, RTC connection and decoder
startup. The example emits `musicTiming` observations with numeric lookup,
connection/queue and first-captured-PCM durations only. No user identifiers,
tokens, track queries or signed media URLs are included. These measurements
describe publisher work, not the time audio reaches physical headphones.
Repeated canonical video links reuse a bounded in-memory 60-second metadata
cache; expired or queued stream URLs are freshly validated and resolved.

## Music library

Put WAV, MP3, OGG, FLAC or M4A files inside the starter's `music` folder, or set
`ALTARA_MUSIC_DIRECTORY` to an operator-owned directory. Restart the bot to
refresh the list. The example exposes at most 24 files plus the test melody,
limits its waiting queue to 20 entries and each decoded file to 30 minutes.
Only catalogue IDs and exact filenames select local files. File paths supplied
in a chat command never reach FFmpeg. Use audio you are allowed to play.

`@livekit/rtc-node` is the official Node RTC SDK (Apache-2.0). `ffmpeg-static`
installs FFmpeg for the current platform; that dependency is GPL-3.0-or-later.
Keep the relevant notices and meet its license when redistributing binaries.
The starter archive contains source and package manifests, not FFmpeg binaries.
You can set `ALTARA_FFMPEG_PATH` to your own compatible FFmpeg executable.

## YouTube and Spotify links

The starter's README includes Windows and macOS/Linux setup commands. Install
Python 3.10+, create an isolated `.tools` virtual environment and install
`requirements-sources.txt`. The bot automatically finds that environment's
yt-dlp executable; `ALTARA_YTDLP_PATH` can select another operator-owned executable.
The tested source version is `yt-dlp[default]==2026.8.19`. It includes the
JavaScript challenge support and uses the bot's Node.js 22.12+ runtime.

YouTube watch/share/shorts links are reduced to a canonical single-video ID.
Song names search YouTube and use the first result, which is shown in the reply.
Spotify full track links and `spotify:track:<id>` read the public embed's track
metadata and search its artist/title on YouTube. Matching also checks duration;
the reply links to both the requested Spotify track and the actual YouTube
video. A match may use a different edition or recording; select an exact YouTube
link if that matters. This does not stream Spotify audio. Spotify embed markup
is an external dependency and can change; a missing/changed metadata block
fails explicitly instead of guessing a song.

Explicit YouTube `/playlist?list=...` links use yt-dlp's bounded flat playlist
extraction. A watch/share URL that also contains a `list` parameter continues
to select only its video; use the explicit playlist URL to request a collection.
Spotify album/playlist links and corresponding `spotify:album:`/`spotify:playlist:`
URIs read validated public embed metadata. The requested entity and every track
ID/title/artist/duration are checked; preview URLs from the embed are never played.
Only the first 20 public entries are added, with a visible truncation notice.
Private/unavailable collections and changed embed schemas fail explicitly.
The first track is resolved before queueing; later tracks resolve in turn and
still pass the full duration, protocol, host and audio-codec checks. Individual
later-track failures produce a chat notice and advance to the following track.
The example rejects an entire request if it would exceed the waiting queue.

Spotify short share links, live streams and arbitrary web/audio URLs are not
implemented. Each track is limited to 30 minutes and
128 MiB of remote audio; the queue remains limited to 20 waiting tracks. Media
requests have a 35-minute wall-clock limit including pauses. Missing yt-dlp,
source blocks and unavailable audio produce readable chat errors. No browser
cookies, account credentials, proxies or automatic source updates are used.

The resolver disables yt-dlp configuration and plugins, restricts its extractors
to YouTube, bounds process time/output and excludes bot credentials from the
child environment. The audio reader permits only HTTPS YouTube media hosts,
validates and pins public IPv4 DNS answers, and rechecks every redirect. Signed
media URLs stay in memory and are refreshed for queued tracks. FFmpeg receives
remote bytes through a pipe with network/file protocols disabled for that input.
The invoker's voice access is checked before source lookup and again before
queueing/joining. Stop/skip close the media reader and decoder.

yt-dlp's Python distribution is Unlicense; its optional dependencies include
other licenses. The public archive contains only source and installation
requirements, not the tool environment or audio. Follow relevant licenses and
source-service requirements when distributing or operating your own bot.

## Public SDK connection lifecycle

The JavaScript player is an example implementation. Other bot runtimes can use
the same endpoint and publish PCM through a compatible RTC SDK:

1. Handle a real claimed slash interaction and call `ctx.joinVoice()` (Node)
   or `ctx.join_voice("")` (Python), requesting audio publication.
2. Connect to the returned room using its short-lived token, publish an audio
   track with the microphone source, and disable subscriptions. Keep credentials
   private. The grant permits audio publication, not listening or recording.
3. Keep the returned `connection_id`. Every 20 seconds call
   `bot.heartbeatVoice({serverId,channelId,connectionId})` or
   `client.heartbeat_voice(server_id,channel_id,connection_id)`.
4. On lost access or heartbeat failure, stop publishing and close the RTC
   connection. Call `closeVoiceConnection(...)` or `close_voice_connection(...)`
   with those same IDs. Cleanup targets that exact connection.

The Node publisher also handles the official RTC SDK's `Reconnecting` and
`Reconnected` events. It holds PCM publication while disconnected and requires
a successful exact-lease heartbeat before resuming. A user's pause is preserved.
After terminal transport loss, the example calls
`bot.recoverVoice({serverId,channelId,connectionId,status})` once. This requires
the new backend recovery action: it rechecks current grants/channel admission,
rotates the old exact lease, retires its provider identity and returns a fresh
short-lived token. The old token is never reused. Current track position (based
on captured 20 ms PCM frames), queue, source volume and pause state are restored.
The decoder seeks to that position; a small audio discontinuity is possible.
Denied/failed recovery closes the lease and asks for a fresh `/play` request,
rather than retrying indefinitely or bypassing actor/permission checks.

Python includes the lifecycle methods; a Python RTC music player is not included
in this starter. The Node player supplies the decoder, queue and playback loop.

The server resolves the invoker's authoritative voice assignment and exact
provider participant identity. Client-supplied channel hints cannot move the
bot into another room. A fresh connection and identity fence each join; delayed
heartbeats and cleanup cannot affect a later join. The provider revokes retired
identities before a new token is returned, and the lease is checked after token
signing. Heartbeats recheck grants and channel permission; failures require the
publisher to close. This is not a claim of instant provider disconnection for
every possible out-of-band permission change.

## Optional voice reception and recording

Voice reception is a separate opt-in example. Ordinary music publication keeps
`canSubscribe:false` and does not receive human microphones. The new capture
endpoint and private consent/recovery migration were activated with explicit
approval on 2026-10-02. The browser consent bridge and receiver have local tests;
hosted checks verified catalog/authentication/access. A consenting real participant
check remains pending: the new authenticated real-chat/capture paths were not
exercised today, and no real microphone was captured or recorded.

With the updated chat UI and the required approved grants, a bot owner can enable
`ALTARA_BOT_AUDIO_CAPTURE_EXAMPLE=1` in their private environment and restart
the starter. Approve Connect to Voice and Listen to Voice; Record Voice is also
required for recording. To enable `/record`, set `ALTARA_RECORDING_DIRECTORY`
to an operator-selected local directory. An empty directory setting disables
the recording command; `/listen` never writes files in this example.

| Command | Action |
| --- | --- |
| `/listen` | Open a request to receive explicitly consenting microphones |
| `/record` | Open a request to receive and save explicitly consenting microphones |
| `/capture-stop` | Close the exact capture, subscriber and mirrored microphones |

The invoker must be in the authoritative public voice channel. Each participant
must accept the listening/recording request in the call menu before their own
microphone is mirrored. Newcomers do not inherit anyone else's consent. Consent
is not persisted across leaving, changing account/channel/media generation,
changing microphone or reloading the page. Mute and deafen stop the cloned
microphone from sending; the original call microphone is never stopped by the
bridge. Revocation stops the clone immediately and removes its exact provider
identity. Starting another consent retires the old identity before returning
the replacement token. An old tab cannot revoke a newer consent.

The bot subscribes only to an isolated
`bot-audio:<bot>:<server>:<channel>:<capture>` room. Human mirror tokens can publish
only microphone audio there and cannot subscribe. No bot receives subscriber
permission in the ordinary call room. Human authorizations expire after 20
seconds and the bridge renews every eight seconds. Token expiry alone does not
disconnect an existing participant: the bot's ten-second capture heartbeat
also checks current media membership/generation and retires revoked, moved or
expired mirrors at the provider. A provider retirement failure closes the
isolated capture instead of allowing stale audio. Backend authorization also
rechecks current bot installation, channel permissions and the media gate.

Receiving requires LiveKit Cloud, whose token revocation also invalidates
automatically refreshed credentials. Closing a capture revokes the subscriber
and every persisted microphone identity, including people already disconnected,
before deleting its isolated room. Self-hosted LiveKit does not provide this
revocation boundary, so the capture endpoint is unavailable there. Ordinary
music publishing is unaffected. See the official
[token lifecycle reference](https://docs.livekit.io/frontends/reference/tokens-grants/)
and [participant removal reference](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/).

At most eight microphones are received per capture and a capture lasts at most
30 minutes. Listening delivers mono 48 kHz PCM through the official RTC
`AudioStream` to the example's `onFrame` callback. Recording saves separate
16-bit mono WAV files, up to about 173 MB per participant for 30 minutes, with
exclusive random filenames and permissions restricted where supported by the
operating system. Chat text, usernames and links cannot choose file paths.
Stopping finalizes WAV headers and closes readers, RTC and the exact capture.
The owner is responsible for storage, retention and deletion of their files.

The listening and recording modes distinguish the official example's behavior
and the permission requested from people. A developer who receives raw audio
can process or retain it in their own code; ALTARA cannot make received audio
technically impossible to copy. The consent UI must explain that the bot owner
receives the microphone audio and may process/store it. Only consent to people
and bots you trust.

The Node SDK exposes `ctx.captureVoice({recording:false|true})`,
`bot.heartbeatAudioCapture({serverId,channelId,captureId})` and
`bot.closeAudioCapture(...)`. `capture-commands.js` supplies an optional receiver;
`audio-receiver.js` supplies the bounded PCM/recording loop. Other runtimes can
use the same isolated token contract with their official RTC SDK.

Browser integration uses `createBotAudioConsentBridge` in `lib/botAudioConsent.js`,
with hooks for authenticated Supabase, loading LiveKit, the current voice
context and original `MediaStreamTrack`. Call `sync()` immediately on mute,
deafen, leaving, account/media-generation or microphone changes; its periodic
check is an additional fence. `consent()`, `revoke()`, `list()`, `snapshot()` and
`stop()` expose explicit request controls. Reconnection holds the clone disabled
until a fresh exact consent check succeeds.

## Operator activation and verification

The original publishing backend was activated on 2026-10-01. The recovery/capture
extension and updated voice endpoint are ACTIVE after the approved 2026-10-02
package. See the [activation record](ALTARA_BOTS_PLATFORM_V2.md#hosted-activation-2026-10-02)
for catalog/authentication/access checks. New authenticated chat/capture flows and
live recovery were not tested today; the listener checks below remain necessary.

For a separate environment, review migration
`20261001154136_bot_voice_audio_connections_v1.sql` and the updated
`altara-bot-voice-token` function with its shared audio helper. The
migration adds nullable columns and a service-only RPC while preserving existing
session rows and voice RPC definitions. Serve the updated chat identity parser.
Production activation requires the operator's explicit authorization.

Verify actual listener audio, pause/resume, queue/skip, volume and stop. Check
that stop removes the provider participant and ends the exact database lease;
a connected voice badge alone is insufficient. Recheck another-channel denial
and the existing bot commands. For external sources, check a YouTube link, a
song-name search and a Spotify track link, then pause/resume, queue/skip and stop.
Recording is available only through the separate consent capture example;
private voice channels are not included in this publisher or capture example.
Collection resolution, network recovery and the listener controls above still
need an actual listener check; runtime doubles and local/native decoding do not
prove source availability or audio continuity in a live call.

The approved recovery/capture activation applied migration
`20261002164801_bot_audio_consent_recovery_v1.sql` and published the updated voice
function and new `altara-bot-audio-capture` function with its shared helpers. The endpoint
uses `verify_jwt=false` because it authenticates both hashed bot tokens and
human JWTs itself; this is not an unauthenticated endpoint. Tables and RPCs are
private to the service role. Use the updated consent UI/bridge.
Further production changes require explicit operator authorization. Verify opt-in,
recording acknowledgement, another-channel denial, newcomer isolation,
mute/deafen, leave/account/device changes, exact revocation and a failed renewal
using a consenting test participant. Do not automatically record real calls.

Reference: [LiveKit Node RTC SDK](https://github.com/livekit/node-sdks/tree/main/packages/livekit-rtc),
[participant removal and token revocation](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/).
Source references: [yt-dlp](https://github.com/yt-dlp/yt-dlp),
[track mirroring in LavaSrc](https://github.com/topi314/LavaSrc#what-is-mirroring).
