# White MD API Catalog

This document lists the external providers currently used by White MD. It intentionally contains no API keys, tokens, passwords, or private session data. Availability, rate limits, response formats, and terms can change; configure permitted providers for production use.

## AI and chat

| Provider | Endpoint or interface | Configuration |
|---|---|---|
| OpenAI-compatible chat | `https://api.openai.com/v1/chat/completions` | `OPENAI_API_KEY`, optional `OPENAI_API_URL` or `OPENAI_API_BASE`, `OPENAI_MODEL` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `AI_PROVIDERS=openrouter`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, optional `OPENROUTER_API_URL` |
| xAI Grok | `https://api.x.ai/v1/chat/completions` | `AI_PROVIDERS=xai`, `XAI_API_KEY`, `XAI_MODEL`, optional `XAI_API_URL` |
| DavidCyril GPT-3 | `https://api.davidcyriltech.my.id/ai/gpt3?text=` | `AI_PROVIDERS=david-gpt3` |
| DavidCyril GPT-4o mini | `https://api.davidcyriltech.my.id/ai/gpt4omini?text=` | `AI_PROVIDERS=david-gpt4omini` |
| DavidCyril chatbot | `https://api.davidcyriltech.my.id/ai/chatbot?query=` | `AI_PROVIDERS=david-chatbot` |
| DavidCyril Llama 3 | `https://api.davidcyriltech.my.id/ai/llama3?text=` | `AI_PROVIDERS=david-llama3` |
| DavidCyril Meta AI | `https://api.davidcyriltech.my.id/ai/metaai?text=` | `AI_PROVIDERS=david-metaai` |
| GuruAPI GPT-4 | `https://api.guruapi.tech/ai/gpt4?username=` | `AI_PROVIDERS=guruapi` |
| GiftedTech GPT-4 | `https://gpt4.giftedtech.workers.dev/?prompt=` | `AI_PROVIDERS=giftedtech` |
| Maher ChatGPT-4 | `https://api.maher-zubair.tech/ai/chatgpt4?q=` | `AI_PROVIDERS=maher` |
| Samir Pikachu GPT | `https://samirxpikachuio.onrender.com/gpt?content=` | `AI_PROVIDERS=samir` |
| Test-API-APMS ChatGPT | `https://test-api-apms.onrender.com/api/chatgpt?text=` | `AI_PROVIDERS=test-apms` |
| Brainshop | `http://api.brainshop.ai/get?...` | `AI_PROVIDERS=brainshop`, `BRAINSHOP_BID`, `BRAINSHOP_KEY` |
| PikaBotz Mistral | `https://pikabotzapi.vercel.app/ai/mistral/?...` | `AI_PROVIDERS=pikabotz`, `PIKABOTZ_API_KEY` |
| OMDb movie metadata | `https://www.omdbapi.com/` | `OMDB_API_KEY` |

Use comma-separated provider names in `AI_PROVIDERS` to configure fallback order. HTTP 429 and provider failures are skipped by the fallback chain.

## Media and downloads

| Feature | Provider or endpoint | Configuration |
|---|---|---|
| YouTube search/download | Savenow polling provider and QasimDev fallback | `YT_SAVE_BASE`, `YT_SAVE_KEY`, `YT_SAVE_POLLS`, `YT_SAVE_POLL_MS` (`YT_SAVE_KEY` is required for Savenow) |
| YouTube direct fallback | Public YouTube-compatible fallback in `src/lib/youtube-download.js` | Use only for content you are allowed to download |
| Spotify title resolution | Spotify oEmbed plus YouTube search/download | `KNIGHT_SPOTIFY_API_BASE`, `KNIGHT_API_KEY` optional; public fallback values are not private credentials |
| TikTok media | KnightBot API with TikWM fallback | `KNIGHT_TIKTOK_API_BASE`, `KNIGHT_API_KEY` |
| Instagram media | Configured downloader provider | Configure a permitted provider in the plugin/environment |
| Menu media | Catbox URLs or bot profile picture | `MENU_IMAGE_URL` or `MENU.js` `menuMedia` |
| Unknown-command media | Catbox animated GIF | `UNKNOWN_COMMAND_GIF_URL` |
| Coffee image | `https://coffee.alexflipnote.dev/random` | No key |
| Couple profile pictures | `https://raw.githubusercontent.com/iamriz7/kopel_/main/kopel.json` | No key |
| Ephoto effects | Configured Ephoto-compatible provider | Configure the provider used by `src/plugins/ephoto.js` |

## Information and utility providers

| Feature | Provider or endpoint | Configuration |
|---|---|---|
| Wikipedia | Wikipedia API | No key |
| GitHub profile/search | GitHub public API | No key for basic requests; rate limits apply |
| Weather | Configured weather provider | Set the provider key if required |
| Lyrics | Configured lyrics/search provider | Provider availability varies |
| Anime images | Waifu.pics and Nekos.best | `WAIFU_API_URL`, `NEKOS_API_URL` optional |
| Random facts, jokes, quotes | Configured public providers in `src/plugins/fun-info-backups.js` | No White MD secret is embedded |
| Image search and screenshot helpers | Configured providers in the corresponding plugins | Check each plugin's environment variables |

## Added from the other bots' working APIs

| Feature | Provider or endpoint | Configuration |
|---|---|---|
| Name age guess | `https://api.agify.io/?name=` | No key |
| Name nationality guess | `https://api.nationalize.io/?name=` | No key |
| Name gender guess | `https://api.genderize.io/?name=` | No key |
| Postcode lookup | `https://api.zippopotam.us/{country}/{postcode}` | No key |
| Space news | `https://api.spaceflightnewsapi.net/v4/articles/` | No key |
| QR code reader | `https://api.qrserver.com/v1/read-qr-code/` | No key |
| Translation | `https://translate.googleapis.com/translate_a/single`, backup `https://api.mymemory.translated.net/get` | No key |
| File hosts | `https://qu.ax/upload.php`, `https://pomf2.lain.la/upload.php`, `https://x0.at/`, `https://uguu.se/upload.php`, `https://tmpfiles.org/api/v1/upload` | No key; links are public |

## Local-only features

CPU/memory information, uptime, plugin counts, menu generation, bot mode, pairing, owner cards, group moderation, and session handling are implemented locally and do not require an external API.

## Safety

Do not place real credentials in this catalog or share them in WhatsApp. Keep keys in hosting-panel environment variables. Use downloader services only for content you are authorized to access and only where the provider's terms permit automated use.
