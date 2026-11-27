"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
exports.default = {
    command: 'islamic',
    aliases: ['islampic', 'muslimpic'],
    category: 'images',
    description: 'Get a random Islamic image',
    usage: '.islamic',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        try {
            const res = await axios_1.default.get('https://raw.githubusercontent.com/GlobalTechInfo/Database/main/images/islamic.json');
            if (!res.data || !Array.isArray(res.data) || res.data.length === 0) {
                return await sock.sendMessage(chatId, { text: '❌ Failed to fetch image.' }, { quoted: message });
            }
            const randomImage = res.data[Math.floor(Math.random() * res.data.length)];
            await sock.sendMessage(chatId, { image: { url: randomImage }, caption: '🕌 Islamic Image' }, { quoted: message });
        }
        catch (err) {
            console.error('Islamic image plugin error:', err);
            await sock.sendMessage(chatId, { text: '❌ Error while fetching image.' }, { quoted: message });
        }
    }
};
