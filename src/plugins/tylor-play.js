"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yt_search_1 = __importDefault(require("yt-search"));
const axios_1 = __importDefault(require("axios"));
const youtube_download_1 = require("../lib/youtube-download");
exports.default = {
    command: 'play',
    aliases: ['plays', 'music'],
    category: 'music',
    description: 'Search and download a song as MP3 from YouTube',
    usage: '.play <song name>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query)
            return sock.sendMessage(chatId, { text: '*Which song do you want to play?*\nUsage: .play <song name>' }, { quoted: message });
        try {
            await sock.sendMessage(chatId, { text: '🔍 *Searching...*' }, { quoted: message });
            const { videos } = await (0, yt_search_1.default)(query);
            if (!videos?.length)
                return sock.sendMessage(chatId, { text: '❌ *No results found!*' }, { quoted: message });
            const video = videos[0];
            await sock.sendMessage(chatId, {
                text: `✅ *Found:* ${video.title}\n⏱️ ${video.timestamp}\n👤 ${video.author.name}\n\n⏳ *Downloading... (this may take up to 30s)*`
            }, { quoted: message });
            const songData = await (0, youtube_download_1.downloadYouTube)(video.url, {
                format: 'mp3',
                fallback: { title: video.title, thumbnail: video.thumbnail }
            });
            let thumbnailBuffer;
            try {
                const img = await axios_1.default.get(songData.thumbnail, { responseType: 'arraybuffer', timeout: 15000 });
                thumbnailBuffer = Buffer.from(img.data);
            }
            catch { /* no thumbnail */ }
            await sock.sendMessage(chatId, {
                audio: { url: songData.downloadUrl },
                mimetype: 'audio/mpeg',
                fileName: `${songData.title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: songData.title,
                        body: `${video.author.name} • ${video.timestamp} • ${songData.provider}`,
                        thumbnail: thumbnailBuffer,
                        mediaType: 2,
                        sourceUrl: video.url
                    }
                }
            }, { quoted: message });
        }
        catch (err) {
            console.error('Play error:', err.message);
            const reason = err.response?.status === 408
                ? 'Download timed out. Try again in a moment.'
                : err.response?.status === 429
                    ? 'Rate limited. Wait a minute.'
                    : err.message;
            await sock.sendMessage(chatId, { text: `❌ *Failed:* ${reason}` }, { quoted: message });
        }
    }
};
