# White MD command expansion backlog

This backlog compares White MD's existing commands with publicly documented capabilities and source-tree clues from other public WhatsApp bots. It is a planning document only; no third-party source code has been copied.

## Already present in White MD

White MD already has YouTube/Spotify/TikTok/social downloads, AI chat and image, lyrics, screenshots, TTS, QR, upload and blur tools, cards, GitHub, Instagram stalking, trivia/truth/riddles, Quran/Bible, translation, weather, definitions, wiki, currency, short URLs, npm lookup, country/time/calculator, anime/GIF utilities, fake tweets, group administration, owner tools, prefix persistence, JID tools, custom menu media, pairing-code login, and deployment support.

## Highest-value additions

### Group automation and moderation

- `antilink`, `antigroupmention`, `antibadword`, `antispam`, and `antiflood`
- `warn`, `warnings`, `resetwarn`, `mute`, `unmute`, and temporary restrictions
- `welcome on/off`, `goodbye on/off`, customizable welcome/goodbye text, and group settings
- `hidetag`, `tagadmins`, `admins`, `getgroupinfo`, `revoke`, `setname`, `setdesc`, and group-photo management
- `approve`, `reject`, and pending-participant tools where supported
- scheduled group messages and repeated announcements

### Media, stickers, and conversion

- `sticker` / `s`, `toimage`, `tovideo`, `togif`, `tomp3`, `take`, and sticker pack metadata
- `emojimix`, meme templates, captioned memes, and quote images
- background removal, image enhancement, crop/resize, colorize, OCR, and reverse-image lookup
- view-once save, quoted-media download, and status download
- SoundCloud, MediaFire, Google Drive, Mega, APK, and generic file-host downloaders where the provider permits automation
- YouTube search plus `play` / `song` / `video` aliases

### Games, economy, and profiles

- `daily`, `weekly`, `work`, `balance`, `deposit`, `withdraw`, `give`, `rob`, `shop`, `buy`, `inventory`, and `leaderboard`
- XP/level profiles, rank cards, badges, and activity leaderboards
- slots, coinflip, dice, blackjack, roulette, guess, tic-tac-toe, connect-four, chess, and UNO
- `ship`, `marry`, `divorce`, truth-or-dare expansion, would-you-rather, roast, joke, fact, and pickup-line commands
- pets, weapons, hunting, fishing, and collectible systems

### Owner and bot controls

- `mode public/private`, `restart`, `shutdown`, `update`, `plugin`, `plugins`, `setbotname`, and `setstatus`
- broadcast to selected chats, group broadcast, and scheduled broadcast
- `autoread`, `autotyping`, `autorecording`, `autoviewstatus`, and status reactions
- anti-delete and anti-edit recovery, message logging, and configurable moderation logs
- diagnostics such as `runtime`, `speed`, `memory`, ` system`, and API health

### Information and utility

- news, movie/TV search, IMDb-style lookup, sports scores, horoscope, prayer times, timezone conversion, and more location-aware tools
- `ocr`, `readqr`, `removebg`, `shortlink` providers, UUID/password generation, and JSON formatting
- public channel/newsletter information and channel management where Baileys supports it

## Evidence from the reviewed projects

- [Queen Anita V4 repository](https://github.com/DavidCyrilTech/Anita-V4) is a David Cyril Tech WhatsApp user bot. Its public source tree includes data files named `economy.json`, `level.json`, `pets.json`, `weapons.json`, `uno_games.json`, and `wcg.json`, plus a `werewolf.js` module and YouTube helper modules. These are strong indicators for economy, leveling, collectible, UNO/werewolf, and download feature families.

## Recommended implementation order

1. Add stickers and media conversion because they are high-use and do not require a database.
2. Add group protection and welcome/goodbye settings with persistent per-group configuration.
3. Add economy/XP/profile storage with a small JSON or SQLite adapter.
4. Add fun games, then multiplayer games such as UNO and tic-tac-toe.
5. Add anti-delete/edit and owner automation with explicit privacy controls.
6. Add remaining information providers only after selecting stable APIs and rate limits.

## Source and licensing note

The goal is to reproduce useful capabilities in White MD with original implementations. Anita V4 is marked MIT in its GitHub repository. Do not copy private credentials, third-party branding, or proprietary assets into White MD.
