"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const OMDB_KEY = process.env.OMDB_API_KEY || '';
exports.default = {
    command: 'movie',
    aliases: ['film', 'bollywood', 'omdb', 'imdb'],
    category: 'info',
    description: 'Search movie info, ratings, cast, plot',
    usage: '.movie <movie name>\n.movie Pathaan\n.movie Jawan 2023',
    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const input = args.join(' ').trim();
        if (!input) {
            return await sock.sendMessage(chatId, {
                text: `🎬 *Movie Info*\n\n` +
                    `*Usage:* \`.movie <name>\`\n\n` +
                    `*Examples:*\n` +
                    `• \`.movie Pathaan\`\n` +
                    `• \`.movie Jawan 2023\`\n` +
                    `• \`.movie Avengers Endgame\`\n` +
                    `• \`.movie RRR\`\n` +
                    `• \`.movie Black Panther\`\n\n` +
                    `Works for Bollywood, Hollywood, and all languages!`,
                ...channelInfo
            }, { quoted: message });
        }
        await sock.sendMessage(chatId, { text: `🔍 Searching *${input}*...`, ...channelInfo }, { quoted: message });
        try {
            if (!OMDB_KEY) {
                await sock.sendMessage(chatId, { text: 'Movie lookup is not configured. Set OMDB_API_KEY in the hosting environment first.', ...channelInfo }, { quoted: message });
                return;
            }
            // Try exact title first, then search
            const year = input.match(/\b(19|20)\d{2}\b/)?.[0];
            const title = input.replace(/\b(19|20)\d{2}\b/, '').trim();
            let url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB_KEY}&plot=full`;
            if (year)
                url += `&y=${year}`;
            const res = await axios_1.default.get(url, { timeout: 15000 });
            let data = res.data;
            // If not found, try search
            if (data.Response === 'False') {
                const searchRes = await axios_1.default.get(`https://www.omdbapi.com/?s=${encodeURIComponent(title)}&apikey=${OMDB_KEY}&type=movie`, { timeout: 15000 });
                const searchData = searchRes.data;
                if (searchData.Response === 'True' && searchData.Search?.length) {
                    const first = searchData.Search[0];
                    const detailRes = await axios_1.default.get(`https://www.omdbapi.com/?i=${first.imdbID}&apikey=${OMDB_KEY}&plot=full`, { timeout: 15000 });
                    data = detailRes.data;
                }
            }
            if (data.Response === 'False') {
                return await sock.sendMessage(chatId, {
                    text: `❌ Movie not found: *${input}*`,
                    ...channelInfo
                }, { quoted: message });
            }
            const ratings = (data.Ratings || []).map((r) => `• ${r.Source}: *${r.Value}*`).join('\n');
            const imdbStars = data.imdbRating !== 'N/A'
                ? '⭐'.repeat(Math.round(parseFloat(data.imdbRating) / 2)) + ` (${data.imdbRating}/10)`
                : 'N/A';
            const text = `🎬 *${data.Title}* (${data.Year})\n\n` +
                `🎭 *Genre:* ${data.Genre}\n` +
                `🌍 *Language:* ${data.Language}\n` +
                `🎬 *Director:* ${data.Director}\n` +
                `🎭 *Cast:* ${data.Actors}\n` +
                `⏱️ *Runtime:* ${data.Runtime}\n` +
                `🏆 *Awards:* ${data.Awards}\n\n` +
                `${imdbStars}\n` +
                `${ratings}\n\n` +
                `📝 *Plot:*\n${data.Plot}\n\n` +
                (data.BoxOffice && data.BoxOffice !== 'N/A' ? `💰 *Box Office:* ${data.BoxOffice}\n` : '') +
                `🔗 imdb.com/title/${data.imdbID}`;
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }
        catch (error) {
            await sock.sendMessage(chatId, {
                text: `❌ Failed: ${error.message}`,
                ...channelInfo
            }, { quoted: message });
        }
    }
};
