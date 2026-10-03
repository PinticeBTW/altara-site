# Bot voice audio and music

## Delivery status

The source includes a real LiveKit RTC publisher, a local-file player and optional
yt-dlp integration for YouTube links/searches and Spotify track matching. Local
MP3 decoding, native PCM frames, playback controls, database authorization and
connection fencing are tested. The hosted audio migration and voice endpoint
were activated on 2026-10-01 with the operator's approval, and LEYLEY's music
commands are enabled. The operator confirmed that LEYLEY joins MUSICA and its
test melody is audible. Slash control responses have also been observed in the
live chat; pause/resume audio, queue transitions and volume still need a full
listener check. Playback status now updates on each track, pause, resume and
idle transition, and channel Room joins/leaves drive the bot notification cue.
YouTube link audio has been fetched and decoded into native-sized PCM frames;
name search and a public Spotify track matched to a YouTube source have been
verified on 2026-10-01. The operator also confirmed audible YouTube link playback
in the actual MUSICA call on 2026-10-01. Song-name and Spotify matching have been
verified during source resolution; their full listener/control checks remain pending.

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
| `/pause` / `/resume` | Pause or resume playback |
| `/skip` | Skip the current track |
| `/queue` | Show current and queued tracks |
| `/volume nivel:0..100` | Set playback volume (default 35%) |
| `/stop` | Clear the queue, stop audio and leave voice |

Paste the link directly after `/play`; typing `faixa:` is optional. The named
option form remains compatible. Each developer chooses their own bot commands;
these names and options are part of the downloadable music example.

The invoker must be connected to the bot's voice channel to change playback or
read its queue. An idle bot leaves after 60 seconds. Playback keeps running on
the bot owner's machine; ALTARA does not execute uploaded bot code.

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

Album/playlist expansion, Spotify short share links, live streams and arbitrary
web/audio URLs are not implemented. Each track is limited to 30 minutes and
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

## Operator activation and verification

Review migration `20261001154136_bot_voice_audio_connections_v1.sql` and deploy
the updated `altara-bot-voice-token` function with its shared audio helper. The
migration adds nullable columns and a service-only RPC while preserving existing
session rows and voice RPC definitions. Serve the updated chat identity parser.
Production activation requires the operator's explicit authorization.

Verify actual listener audio, pause/resume, queue/skip, volume and stop. Check
that stop removes the provider participant and ends the exact database lease;
a connected voice badge alone is insufficient. Recheck another-channel denial
and the existing bot commands. For external sources, check a YouTube link, a
song-name search and a Spotify track link, then pause/resume, queue/skip and stop.
Recording, private voice channels and automatic reconnect recovery are not
included here.

Reference: [LiveKit Node RTC SDK](https://github.com/livekit/node-sdks/tree/main/packages/livekit-rtc),
[participant removal and token revocation](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/).
Source references: [yt-dlp](https://github.com/yt-dlp/yt-dlp),
[track mirroring in LavaSrc](https://github.com/topi314/LavaSrc#what-is-mirroring).
