# White MD WhatsApp Bot

A portable Node.js starter using Baileys. It can run on Pterodactyl, Render, Heroku, Docker, or a VPS.

## Requirements

- Node.js 20 or newer
- A WhatsApp account used as the linked bot account
- Persistent storage for `AUTH_DIR` in production

## Local setup

```bash
cp .env.example .env
npm install
npm start
```

Set `PAIRING_NUMBER` in `.env` to receive a pairing code in the terminal. Use international digits only, without `+`, spaces, or dashes. After linking, the credentials are saved in `AUTH_DIR`.

To have the linked White MD account automatically follow a WhatsApp Channel after connecting, set `AUTO_FOLLOW_CHANNEL_JID` to the channel JID. For example: `AUTO_FOLLOW_CHANNEL_JID=120363401194818136@newsletter`. This follows the channel from the bot account; WhatsApp does not provide a supported way for the bot to force other users' accounts to follow it.

The `.ownerchannel` command sends the public White MD Channel share link. Configure `AUTO_FOLLOW_CHANNEL_URL` with the channel's public Share link, not its internal `@newsletter` JID. The link is no longer displayed automatically below `.menu`.

White MD can also send a notice and attempt to add a person to a configured group on their first private message. Set `AUTO_ENROLL_GROUP_JID` to the group JID and customize `AUTO_ENROLL_NOTICE` if needed. The bot must be a group administrator, and WhatsApp may reject additions because of the person's group privacy settings. Each contact is processed once and recorded in `bot_settings.json`.

QR-code login is currently disabled. Use `PAIRING_NUMBER` or enter the phone number directly in the hosting panel console.

For pairing-code login, set for example:

```env
PAIRING_NUMBER=254700000000
```

Start the bot and copy the code printed in the console. On the phone, open WhatsApp > Settings > Linked devices > Link a device > Link with phone number instead, then enter the code. Pairing codes are requested automatically a few seconds after startup and do not require a QR event.

If WhatsApp returns `401 conflict/device_removed`, White MD now clears only the revoked `AUTH_DIR` session and restarts the normal pairing flow automatically. Keep `PAIRING_NUMBER` configured, wait for the fresh code, and link it from WhatsApp > Settings > Linked devices. Do not run two White MD instances with the same account at the same time.

White MD accepts a pairing number directly in the Pterodactyl/VPS panel console. Start the bot, wait for the `Panel pairing is ready` log, then enter an international number such as `254700000000` and press Enter. The generated code is printed in the same panel. This works even when `PAIRING_NUMBER` is not set. QR-code login remains available whenever phone-number pairing is not configured.

## Docker

```bash
docker build -t white-md-bot .
docker run --rm -it \
  --env-file .env \
  -p 3000:3000 \
  -v "$(pwd)/auth_info:/app/auth_info" \
  white-md-bot
```

## Pterodactyl

Use this startup command:

```bash
npm start
```

The project also includes a root `index.js` compatibility entrypoint, so `node index.js` works with panels that use that default. If installation fails with a message saying Git packages are disabled, use an egg/image that permits npm registry dependencies and run `npm install` again. The project overrides Baileys' `libsignal` dependency to the npm registry package instead of the Git URL.

If the panel still uses a configured Main File field, set it to `src/index.js` or change the startup command to `npm start`. Do not use `node /home/container/index.js` unless the root compatibility file is present.

## Platform notes

- **Pterodactyl/VPS:** mount or preserve `auth_info` between restarts.
- **Render/Heroku:** local disks are not reliable for long-term credentials. Use a persistent disk where available or replace the local auth adapter with a database/object-storage adapter before production use.
- **Health check:** `GET /health` returns JSON and can be used by a platform health probe.

## Commands

- `.menu` or `.help` — show the starter menu
- `.ping` — check that the bot is responding
- Any unavailable command — is ignored silently so duplicate or partially unwrapped WhatsApp events do not produce a misleading response
- `.setprefix !` — change the command prefix; owner only
- Prefix guide: send `.setprefix !` from the owner account. White MD replies with the new prefix and immediately switches to `!`. Use `!menu`, `!ping`, or `!help` to verify it. To restore the default dot prefix, send `!delprefix`, then use `.menu` again. Only one to three non-space characters are accepted. If the command is rejected, confirm that `OWNER_NUMBER` is set to the owner’s international digits without `+`, spaces, or dashes, or send the command from the linked bot account itself.
- `.setmenuimage <URL>` — set one custom image or video for the menu; owner only
- `.setmenuimage add <URL>` — add an image/video to the rotating menu-media pool; owner only
- `.setmenuimage list` / `.setmenuimage clear` — view or clear the saved rotating pool; owner only
- `.setmenuimage off` — return to using the bot profile photo
- `.autorecord on` / `.autorecord off` — show recording presence for incoming messages; owner only
- `.autotype on` / `.autotype off` — show typing presence for incoming messages; owner only
- `.autoviewstatus on` / `.autoviewstatus off` — automatically mark incoming statuses as viewed; owner only
- `.autolikestatus on` / `.autolikestatus off` — automatically react to incoming statuses; owner only
- `.jid`, `.chatid`, `.id` — show the current group, channel, user, and participant IDs
- `.echo hello` — example command plugin
- `.owner` — show the owner information and send contact cards for the configured owner contacts; defaults to `+93768814785` and `+254748840328`
- `.pair 254700000000` — owner-only WhatsApp command that requests a pairing code and sends it back in WhatsApp; after the phone accepts the code, White MD reconnects and comes online automatically
- `.mode public` / `.mode private` — owner-only persistent bot mode; public lets everyone use commands, while private accepts commands only from the owner
- `.update` — owner-only fast-forward Git update from `UPDATE_REPO_URL`, installs production dependencies, and restarts the process; it stops safely when the deployment is not a Git checkout or has tracked local edits
- `.restart` — owner-only graceful process restart; configure Pterodactyl, PM2, Render, Heroku, Docker, or another supervisor to start the process again after exit
- Safe owner-menu aliases include `.info` and `.settings` for bot information, `.delprefix` to restore `.`, `.profilename` and `.removephoto` for profile controls, `.autostatus`, `.autotyping`, `.autorecording`, `.autoreact`, `.usagetip`, and `.checkidch`.
- `.shareAPI` — owner-only ZIP containing the secret-free White MD API catalog
- `.plugin` — owner-only ZIP containing the current `src/plugins/*.js` plugin sources
- `.botabout` / `.botinfo` — show White MD bot information; `.about` remains an alias
- `.setbotname New Bot Name` — change the WhatsApp profile name; `.setname` remains an alias; owner only
- `.setbotabout About text` / `.setbotbio About text` — change the WhatsApp About text; `.setabout` and `.setbio` remain aliases; owner only
- Reply to an image with `.setbotprofile`, `.setbotpp`, or `.setbotpic` — update the bot profile picture; shorter aliases remain available; owner only
- `.delbotprofile` / `.delbotpp` — remove the bot profile picture; `.delprofile` and `.delpp` remain aliases; owner only
- `.tagall` — mention group members; group admins only
- `.kick`, `.add`, `.promote`, `.demote` — group moderation; group admins only
- `.group open`, `.group close` — change who can send messages; group admins only
- `.group link` — get the group invite link; group admins only
- `.grouplink` — direct alias for `.group link`; group admins only
- `.linkgc` — direct alias for `.group link`; group admins only
- `.clear`, `.delete`, `.del` — delete a quoted message or the command message; group admins only
- `.setgname`, `.setnamegc` — change the group name; group admins only
- `.setgdesc`, `.setdesc` — change the group description; group admins only
- `.antilink on delete` — enable general link protection; also supports `warn`, `deletewarn`, or `kick`
- `.antiinstagram on delete` — protect against Instagram links
- `.antifacebook on delete` — protect against Facebook and FB Watch links
- Use `.antilink off`, `.antiinstagram off`, or `.antifacebook off` to disable a rule; use the command without arguments or with `status` to view all settings

Anti-link settings are saved per group in `group_settings.json`. White MD ignores group admins and the configured owner, and enforcement requires White MD to be a group administrator. `warn` warns only, `delete` removes the link message, `deletewarn` does both, and `kick` removes the sender after deleting the message.
- `.ytmp4 https://youtu.be/VIDEO_ID` — download a YouTube video at 480p
- `.ytmp3 https://youtu.be/VIDEO_ID` / `.ytaudio <URL>` — download YouTube audio
- `.spotify https://open.spotify.com/track/TRACK_ID` — download a Spotify track as MP3
- `.tiktok https://vt.tiktok.com/VIDEO_ID` — download TikTok media
- `.instagram <URL>` / `.ig <URL>` — Instagram media
- `.facebook <URL>` / `.fb <URL>` — Facebook media
- `.twitter <URL>` / `.x <URL>` — X/Twitter media
- `.pinterest <URL>` / `.pin <URL>` — Pinterest media
- `.ai your question` — AI chat
- `.openrouter your question` — direct OpenRouter chat using `OPENROUTER_API_KEY`
- `.grok your question` — direct xAI Grok chat using `XAI_API_KEY`
- `.chatgpt your question` — ChatGPT-style AI chat through the David Cyril endpoint
- `.chatgpt` and `.chatbot` use the David Cyril GPT-compatible endpoint first, then try the verified DavidCyril routes, OpenRouter, and xAI if the primary provider fails. Configure `CHATGPT_PRIMARY_PROVIDER` and `CHATGPT_BACKUP_PROVIDERS` to change this order; backup providers still require their own keys.
- `.chatgpt on` / `.chatgpt off` — owner-only automatic replies for ordinary text in all chats
- `.play song or video name` — search YouTube and send the result as MP3
- `.aiimage your prompt` — AI image generation
- `.flux your prompt` / `.fluximage your prompt` — FLUX 3 text-to-image through WaveSpeedAI; configure `WAVESPEED_API_KEY` in the hosting panel. This is a paid hosted API and no key is embedded in White MD.
- `.lyrics song title` — lyrics lookup
- `.ssweb https://example.com` — website screenshot
- `.tts text to speak` — text-to-speech audio
- `.qr text or URL` — QR image
- `.tr language text` — translation alias; `.urlshortener URL` — URL-shortening alias; `.calculator expression` — calculator alias
- `.upload https://image-url` — upload utility
- `.blur image-url 12` — blur an image
- `.deletefunct command` — owner-only, persistently disables a command without deleting source files; restore it with `.restorefunct command`
- `.gif laugh|shrug|facepalm|confused|bored|feed|yeet|handhold` — send a reaction GIF
- `.welcome Name | Group` / `.goodbye Name | Group` — group cards
- `.rankcard Name | Level | XP | Needed | Rank` — rank card
- `.quotecard Your quote` — quote card signed by Tylor White
- `.wanted Name | Crime | Reward` — wanted card
- `.jail Name | Crime | Sentence | Cell` — jail card
- `.ytcard https://youtu.be/VIDEO_ID` — YouTube card
- `.github username` / `.gh username` — GitHub profile summary
- `.vv` — reply to a view-once image, video, audio, or document to resend it as ordinary media; `.viewonce` and `.view-once` are aliases
- `.url` — send or reply to an image, video, audio, sticker, or document to upload it to Catbox and receive a public URL; `.geturl` and `.mediaurl` are aliases. The command enforces `MAX_MEDIA_BYTES` and does not save the media to disk.
- `.davidcalc (10+5)*2` — verified official DavidCyril calculator endpoint; `.davidfact` and `.davidtruth` return verified random-fact and truth-question responses; `.aidetect <100+ words>` uses the verified AI-detector endpoint. These commands use the official `apis.davidcyril.name.ng` base and optionally send `DAVID_CYRIL_API_KEY` when configured.

The `ephoto` menu category contains no-key ePhoto360 text effects such as `.neon`, `.galaxy`, `.golden`, `.blackpink`, `.hacker`, `.typography`, `.matrix`, `.mascot`, `.foggy`, `.water`, `.thunder`, and `.christmas`. White MD uses the public page/form flow documented by the open-source [Ephoto360 wrapper](https://github.com/MR-IMRAN-60/ephoto-apis), with bounded HTTP handling and no hard-coded API key. ePhoto360 may rate-limit or change its pages, so the bot reports a temporary provider failure instead of crashing.

### Commands added from the public menu audit

White MD also includes tested, safe implementations inspired by the QUEEN-SIA-MD and XLICON-V2-MD menus:

- `.guide`, `.tutorial`, `.howto` — compact White MD usage guide
- `.poll Question;Option 1;Option 2` — native WhatsApp poll
- `.agecalculator MM/DD/YYYY` — local age calculation; `.age` and `.calcage` are aliases
- `.guessgender first-name` — statistical Genderize estimate; `.gender` is an alias
- `.ai-search question` — DuckDuckGo instant-answer lookup with configured ChatGPT fallback; `.ais` and `.searchai` are aliases
- `.aiv question` — configured ChatGPT answer converted to speech; `.aivoice`, `.voiceai`, and `.aisv` are aliases
- `.kitsune` and `.husbando` — SFW anime image commands with aliases
- `.anime` — SFW anime image from `nekos.best`, with `api.waifu.pics` fallback; returned URLs are validated as HTTPS before sending
- `.ginfo https://chat.whatsapp.com/INVITE_CODE` — group invite information; `.groupinfo` is an alias
- `.hide text` and `.style text` — local text formatting utilities

Interactive menu buttons and selectors remain disabled. Commands that required hard-coded credentials, unconfigured OCR or text-effect providers, unreliable endpoints, shell/session access, spam or bug payloads, destructive moderation, or credential leakage were intentionally not imported. In particular, the audited Shazam implementation was excluded because it contained embedded ACRCloud credentials.

The supplied owner list also contained commands that clear sessions, change privacy settings, scrape last-seen information, archive or pin chats, forward or reshare messages, block or ban accounts, manage sudo users, or otherwise make destructive account/chat changes. Those were not added as generic aliases. White MD keeps the safer existing `.pair`, `.mode`, profile, prefix, status, group-admin, and ID commands instead.

The additional logo-maker names were audited against the existing ePhoto360 wrapper. Working names such as `.metallic`, `.matrix`, `.neon`, `.thunder`, `.hacker`, `.sand`, and `.blackpink` remain available through that wrapper. The other names were not registered as dead aliases because no verified endpoint or compatible handler was available. The same rule applies to credentialed or unverified tools such as `.shazam`, `.ocr`, `.netflix`, `.scloud`, `.crypto`, `.livescore`, and `.earthquake`.

### QUEEN-ANNA safe additions
The public [QUEEN-ANNA repository](https://github.com/toge012345/QUEEN-ANNA) was audited without copying its incompatible ES-module handlers or unsafe files. The verified native additions are `.wa <international number>` for a `wa.me` link, `.wikipedia <topic>` for a bounded MediaWiki API lookup, and `.ytcomment <comment>` for a YouTube-style comment image. The existing `.translate` and `.wiki` commands were kept instead of duplicated because White MD already provided them.

The audit excluded temporary-mail and random-tech-news plugins because their providers returned HTTP 404/500 during testing. It also excluded hard-coded credential plugins, ACRCloud music recognition, shell/eval and filesystem helpers, NSFW media, broadcast/session/destructive commands, interactive-button handlers, and obsolete downloader wrappers. iTunes and Pokédex were not duplicated because White MD already has the MEGA `.itunes` and `.pokedex` commands. Detailed findings are recorded in `queen-anna-audit.md`.

## Adding plugins

Create a JavaScript file in `src/plugins/`. A plugin exports a command name, an optional description, and an async `execute` function:

```js
module.exports = {
  command: 'hello',
  description: 'send a greeting',
  async execute({ socket, jid }) {
    await socket.sendMessage(jid, { text: 'Hello from a plugin.' })
  }
}
```

The plugin receives `socket`, `message`, `jid`, `args`, `command`, `prefix`, `config`, and `logger`. Restart the bot after adding or editing a plugin; plugins are loaded at startup.

The default branding is **White MD**. Set `OWNER_NUMBER` in `.env` to enable owner-only commands. Group moderation commands require the bot account to be a group administrator, and the requesting user must also be a group administrator unless the command is explicitly owner-only.

The `.owner` contact-card list can be changed with the comma-separated `OWNER_CONTACT_NUMBERS` environment variable. Numbers are normalized to international digits before vCards are sent.

The unknown-command GIF defaults to `https://files.catbox.moe/syqxkg.gif` and can be changed with the `UNKNOWN_COMMAND_GIF_URL` environment variable. White MD sends it as an animated GIF-style video with the current prefix-aware menu instruction and quotes the original command message. If media delivery fails, it sends the same instruction as quoted text.

The menu is short: it does not print the command list. Its editable content is in the root `MENU.js` file: change `heading`, `intro`, `ownerName`, `library`, `metadataLabels`, category names, or command arrays there without editing `src/index.js`. Immediately below the bot name, the menu dynamically shows uptime, owner name, Baileys library, the current requesting user, and the number of registered command names (`plugins.size`). `MENU.js` is reloaded every time `.menu` or a category menu is used, so changes apply without restarting the bot. It sends one message with the menu picture, those details, the **Categories** pick-list and the buttons; the commands of a category appear only after that category is picked. Set `channelUrl` in `MENU.js` to change where the Channel button leads. `.setprefix !` persists the new prefix in `bot_settings.json`; after changing it, use `!menu` instead of `.menu`. Keep `bot_settings.json` persistent on Pterodactyl and VPS deployments.

## Tylor White plugin set

White MD includes a vetted Tylor White plugin set based on the audited public source repository. The imported files are compiled into CommonJS modules under `src/plugins/tylor-*.js`, and the loader supports their `default` exports, aliases, and handler signature. The `tylorWhite` category in `MENU.js` lists the primary imported commands.

This plugin set focuses on non-destructive utilities, media lookups, fun commands, games, image/search tools, and information commands. It deliberately excludes shell execution, filesystem mutation, plugin installation or updates, session and pairing controls, broadcasting, spam or bug payloads, and destructive group moderation. The exact source and audit record are stored in `TYLOR-WHITE-PLUGIN-REGISTRY.json`. Some external services used by these commands may still be unavailable or rate-limited; those failures are handled by the individual plugins and do not prevent the bot from starting.

The audited `GlobalTechInfo/Suhail-Md-3.0` review added three safe Tylor White plugins: `.coffe` (aliases `.tea` and `.kofi`) for a random coffee image, `.couplepp` for two couple profile pictures, and `.cpu` for local server CPU and memory information. Suhail commands that modify chats or accounts, broadcast messages, enumerate phone numbers, require the original framework, need missing credentials, or duplicate existing White MD commands were deliberately not imported.

### Buttons

White MD sends WhatsApp buttons and pick-lists (`src/lib/buttons.js`):

- `.menu` carries a **Categories** pick-list plus Channel, Owner and Ping buttons on the menu picture itself. Choosing a category shows its commands with a **Run a command** pick-list and a Menu button.
- Any command reply that offers a choice gets buttons automatically: on/off style usage replies (`.autotype`, `.autorecord`, …), options written as `a|b|c` (for example `.rps rock|paper|scissors`), and replies that list several commands (for example `.games`).
- Commands that return something new each time (`.joke`, `.fact`, `.quote`, `.meme`, `.truth`, `.dare`, `.waifu`, …) get an **Another** button.
- Pressing a button runs the command it carries, exactly as if it had been typed.

WhatsApp decides whether buttons from a linked-device bot are displayed, and this varies by app version and account. If WhatsApp rejects the buttons, the reply is sent as normal text instead. Set `BUTTONS=off` to always use plain text.

To use buttons in your own plugin:

```js
const { sendButtons } = require('../lib/buttons')
await sendButtons(socket, jid, {
  text: 'Pick one',
  buttons: [{ id: `${prefix}ping`, text: 'Ping' }],            // up to 3, more become a pick-list
  list: { title: 'Options', rows: [{ id: `${prefix}joke`, title: 'Joke', description: 'A random joke' }] }
}, { quoted: message })
```

Add `noAutoButtons: true` to a plugin to keep automatic buttons off its replies. Run `npm test` to check the button logic.

### Commands added from the other bots' working APIs

`src/plugins/working-apis.js` adds commands for the no-key services that were still working when tested:

- `.nameinfo <name>`, `.guessage <name>`, `.nationality <name>` — agify.io, nationalize.io, genderize.io
- `.zip <country code> <postcode>` — Zippopotam (not every country is covered)
- `.spacenews` — Spaceflight News
- `.readqr` — reply to a QR code image (QR Server)
- `.translate2 <language code> <text>` — Google Translate, with MyMemory as backup
- `.tourl` — reply to media for a public link; tries qu.ax, pomf2.lain.la, x0.at, uguu.se, then tmpfiles.org. `.quax`, `.pomf`, `.x0`, `.uguu`, `.tmpfiles` use one host. Links are public.

The menu rotates through the URLs in `MENU.js` under `menuMedia`, or through URLs saved with `.setmenuimage add`. Each menu request advances to the next URL, so different users can receive different menu media. URLs ending in `.mp4`, `.webm`, `.mov`, or `.mkv` are sent as videos; other HTTP(S) URLs are sent as images. A plain `.setmenuimage <URL>` keeps backward compatibility by replacing the saved pool with one URL. After `.setmenuimage clear` or `.setmenuimage off`, the `MENU.js` pool is used; if it is empty, the bot account's current WhatsApp profile photo is used, followed by `MENU_IMAGE_URL`, and finally a text menu if media delivery fails.

The owner can send `.chatgpt on` to enable automatic ChatGPT replies for incoming ordinary text in private chats and groups. Commands, bot-generated messages, and empty/media-only messages are ignored. The setting is saved in `bot_settings.json`; send `.chatgpt off` to disable it.

When White MD starts on a panel without an existing registered session, it asks for the login method: enter `1` for QR code or `2` for phone-number pairing code. Immediately after choosing `2`, enter the number in `254*********` format using digits only, without the plus sign, spaces, or dashes; for example, `254700000000`. The pairing code is printed when the socket is ready. If one pairing request fails, White MD does not request multiple replacement codes; it returns to the numbered QR/phone login options so you can choose again. Set `LOGIN_METHOD=qr` or `LOGIN_METHOD=pair` to skip the startup question in an automated deployment. `PAIRING_NUMBER` also preserves the legacy pairing behavior. An existing `auth_info` session is reused without asking for a new login method. The `.pair <international-number>` command uses Baileys phone-number pairing and requires an unregistered session; clear `auth_info` only when you intend to pair again.

For automatic updates, deploy White MD from a Git checkout rather than only extracting `White MD.zip`. Set `UPDATE_REPO_URL` to the repository that contains the bot source and `UPDATE_BRANCH=main`. The owner can then send `.update`; White MD fetches the branch, allows only a fast-forward merge, runs `npm install --omit=dev`, and exits so the hosting supervisor loads the new code. `.restart` only exits cleanly; without a supervisor the process will remain stopped.

Bot mode defaults to `public` to preserve the normal behavior. In `private` mode, non-owner command messages are ignored; the owner can restore access with `.mode public`. The selected mode is saved in `bot_settings.json`.

The `.ai` command and automatic ChatGPT mode use the ordered `AI_PROVIDERS` fallback chain. The verified DavidCyril routes are available as `david-gpt4o` and `david-gemini3pro`; the direct commands are `.davidgpt4o` and `.davidgemini3pro`. They call `https://apis.davidcyril.name.ng/ai/gpt-4o?prompt=...` and `/ai/gemini-3-pro?prompt=...`. These routes were verified without a key, but White MD supports an optional user-owned `DAVID_CYRIL_API_KEY` and sends it only when configured. The Google Gemini, Ollama, and NVIDIA integrations that were returning errors are not registered or included in the default chains. OpenRouter uses `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `OPENROUTER_API_URL`, while xAI Grok uses `XAI_API_KEY`, `XAI_MODEL`, and `XAI_API_URL`. `.openrouter` and `.grok` call those providers directly. Providers that are unavailable, return HTTP 429, or return no answer are skipped and the next configured provider is tried. Keep credentials in the hosting panel environment variables and never paste real keys into the source code or ZIP.

The safe-only MEGA-MD migration adds native local implementations for `.wordcount`, `.wordfreq`, `.topwords`, `.analyze`, `.textanalyze`, `.textanalyser`, `.analyse`, `.readability`, `.rle`, `.compress`, `.decompress`, `.rlecompress`, `.cipher`, `.encrypt`, `.decrypt`, `.crypt`, `.units`, `.unit`, `.convert`, and `.conv`. Existing White MD registrations were kept authoritative rather than duplicated.

Unverified compatibility names such as numbered GPT/Gemini aliases, Claude, Copilot, DeepSeek, Perplexity, Qwen, Llama, coding-agent, grammar, and math model aliases are not registered. The menu lists only the direct provider commands whose integrations are implemented; a model is not presented as working merely because a public repository listed its name.

The old unsupported Claude, Gemini, Copilot, and DeepSeek aliases were removed; `.grok` is a separate direct xAI integration backed by `XAI_API_KEY`, not a fake compatibility alias. The `.shareAPI` archive contains endpoint names and configuration guidance only; it intentionally excludes API keys, passwords, session credentials, and runtime state. The `.plugin` archive contains source files only and is owner-restricted in the bot.

At first startup without an existing session, the panel shows a neon White MD prompt: reply `1` for QR code or `2` for phone-number pairing. Phone pairing requires international digits without `+`, spaces, or dashes, such as `254700000000`; the code is printed after the socket is ready. Set `LOG_WHATSAPP_MESSAGES=false` to hide conversation text from server logs; it is enabled in the sanitized template so incoming and outgoing WhatsApp text is visible on the panel.

The `.play` command uses the Tylor White YouTube search/download handler. It tries Savenow only when `YT_SAVE_KEY` is configured, then the QasimDev provider. The same fallback chain is used by `.song`, `.ytmp3`, and `.ytmp4`. Configure `YT_SAVE_BASE`, `YT_SAVE_KEY`, `YT_SAVE_POLLS`, and `YT_SAVE_POLL_MS`; no Savenow credential is embedded in the source. Use public content you are allowed to download.

The `.movie` and `.film` commands provide movie metadata through OMDb only when `OMDB_API_KEY` is set in the hosting environment. The key is not embedded in the source or shareable archives. `OPENAI_API_KEY`, `BRAINSHOP_KEY`, `PIKABOTZ_API_KEY`, `YT_SAVE_KEY`, and `OMDB_API_KEY` are private credential variables; keep them in the panel's environment settings and never commit them to GitHub or send them in WhatsApp.

Additional service backups are available: `.upload2` or `.catbox` uploads a public URL through Catbox, `.memegen text` sends a Memegen image, and `.github2 username` reads a GitHub profile directly from the GitHub API. Imgur, Telegram, Vodacom, and other credentialed services are not enabled with placeholder values; configure their credentials explicitly before adding them.


The `.ytmp4` plugin uses the configured KnightBot API endpoint first and automatically falls back to the Savenow YouTube provider if KnightBot returns an error such as HTTP 429. Configure `KNIGHT_API_KEY`, `KNIGHT_API_BASE`, and `MAX_DOWNLOAD_DURATION` in `.env`. Use it only for videos you are allowed to download and where the API provider permits automated use. The default shared key may be rate-limited or revoked. Additional documented routes are available under Tylor White names: `.tylorgithub`, `.tylortiktok`, `.tyloranime`, `.tylornsfw`, and `.tylorytcomment`. KnightBot is only the backend provider and is not shown in the user-facing command names.

The `.spotify` plugin uses `KNIGHT_SPOTIFY_API_BASE` and the same `KNIGHT_API_KEY`. If that service is unavailable or rate-limited, White MD resolves the track through Spotify oEmbed, searches YouTube, and uses the shared YouTube fallback chain. This is a best-effort title match, not an official Spotify audio export. Use it only for audio you are allowed to download and where the provider's terms permit automated access.

All generated card commands use **Tylor White** as the author identity. This can be configured with `CARD_AUTHOR`, which defaults to `Tylor White`.

The `.tiktok` plugin uses `KNIGHT_TIKTOK_API_BASE` and checks the returned content type before sending it as audio or video. If KnightBot is unavailable or rate-limited, it falls back to the tested TikWM endpoint. `MAX_MEDIA_BYTES` limits the file size; the default is 50 MB. Public downloader services can change or impose limits, so configure a permitted provider for production use.

Anime action commands such as `.cuddle`, `.hug`, `.kiss`, `.pat`, `.slap`, `.smile`, and `.dance` try `api.waifu.pics` first and fall back to `nekos.best` when the primary provider is unavailable. Set `NEKOS_API_URL` only when using another compatible provider.

The shared tools plugin handles JSON, direct media URLs, and binary image responses. All external API calls use a timeout, bounded retries, exponential backoff, and the provider's `Retry-After` header when available. When a provider remains rate-limited, White MD reports a clear HTTP 429 message instead of crashing or spamming the provider. Set `API_TIMEOUT_MS`, `API_RETRIES`, and `API_MAX_RETRY_DELAY_MS` to tune this behavior. For shared tools, `KNIGHT_API_FALLBACK_ROOT` may point to another compatible API root; the default shared `knight` key is public and may be rate-limited or revoked, so a reliable deployment should use its own permitted provider/key.

For auto-downloaders, use an official API or a service that explicitly permits automated downloads. Validate URLs, restrict file size and MIME type, add rate limits, and never ask users for platform passwords or session cookies. A downloader plugin can call an approved API, download the returned media to a temporary file, send it with `socket.sendMessage`, and delete the temporary file in a `finally` block.

This is a starter, not a complete production bot. Add authorization checks before adding owner, group-admin, download, or media commands.

## New commands

| Command | What it does |
| --- | --- |
| `.url` (media) | Uploads the image/video/audio/document and returns a public link. Tries Catbox, Uguu, Litterbox and tmpfiles in turn. |
| `.url <link>` / `.dl <link>` | Sends the link to the downloader provider and returns every item (type, link, quality), plus the best video/audio attached. Needs `DOWNLOADER_API_KEY`. |
| `.apk <name or package>` | Searches the app store and sends the APK file. Also accepts a direct `.apk` link or a page link (via the downloader). |
| `.obfuscate [low\|medium\|high] <code>` | Obfuscates JavaScript. Works with text, a replied message or a replied `.js` file; returns `obfuscated.js`. |
| `.moviedl <name> [quality]` | Searches YTS. Then `.moviedl get 1 1080p` sends the .torrent file and `.moviedl magnet 1 1080p` gives the magnet. |
| `.archive <name>` | Lists free feature films on archive.org. `.archive get 1` sends the MP4 (or the direct link when it is too big). |

Providers live in `src/lib/downloader.js` and `src/lib/movies.js`; add another source there and expose it from a plugin file.

The console shows chats as coloured bubbles (incoming left with a `[WhatsApp]` tag, bot replies right). Set `CONSOLE_CHAT_STYLE=plain` for flat lines, or `LOG_WHATSAPP_MESSAGES=false` to hide chats.

## Text to speech

| Command | What it does |
| --- | --- |
| `.tts <text>` | Best available voice, with automatic backups (Edge, TikTok, Google, Moonbase) |
| `.tts1` … `.tts4` | Force one engine: 1 Edge, 2 Google, 3 TikTok, 4 Moonbase |
| `.narrator` `.villain` `.hero` `.kid` `.airole` | The five roles from the edge-tts example |
| `.tts villain <text>` / `.tts en-GB-RyanNeural <text>` | Pick a role or any Edge voice for one message |
| `.voices [filter]` | List voices and roles |
| `.ttsvoice <voice or role>` / `reset` | Default voice for the current chat |

Reply to any text message with `.tts` to hear it. Replies go out as WhatsApp voice notes when `ffmpeg` is installed, otherwise as audio files.

All engines run inside plain Node (no Python, no GPU), so they work in a Pterodactyl panel.

## Link downloads without a key

`.url <link>` first tries your downloader provider (`DOWNLOADER_API_KEY`). If that is empty or fails, it falls back to TikTok links, and direct media files. For YouTube use `.play`, `.ytmp3` and `.ytmp4`.

## Multi-session mode (default)

`npm start` now runs `src/manager.js`, which starts one bot process per WhatsApp number.

- `GET /api/sessions` — list sessions and their status
- `POST /api/sessions` `{ "phone": "2547..." }` — create a session and get a pairing code (a number that already has a session is rejected; delete it first)
- `DELETE /api/sessions/:phone` — unlink and remove a session

Env: `MAX_SESSIONS` (default 10), `WEB_PAIR_SECRET` (optional, required for create/delete when set).
Each session stores its data in `DATA_DIR/sessions/<phone>`. On Render, mount a persistent disk at `/app/data` so sessions survive restarts.
Run the old single-session bot with `npm run start:single`.
