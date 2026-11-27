"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
exports.default = {
    command: 'reverse',
    aliases: ['revt', 'reversetext'],
    category: 'tools',
    description: 'Reverse any text',
    usage: '.reverse <text>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const textToReverse = args?.join(' ')?.trim();
        if (!textToReverse) {
            return await sock.sendMessage(chatId, { text: 'Please provide text to reverse.\nExample: .reverse Hello World' }, { quoted: message });
        }
        try {
            const apiUrl = `https://discardapi.dpdns.org/api/tools/reverse?apikey=guru&text=${encodeURIComponent(textToReverse)}`;
            const { data } = await axios_1.default.get(apiUrl, { timeout: 10000 });
            if (!data?.status || !data.result) {
                return await sock.sendMessage(chatId, { text: '❌ Failed to reverse the text.' }, { quoted: message });
            }
            const reply = `*Reversed:* ${data.result}`;
            await sock.sendMessage(chatId, { text: reply }, { quoted: message });
        }
        catch (error) {
            console.error('Reverse plugin error:', error);
            if (error.code === 'ECONNABORTED') {
                await sock.sendMessage(chatId, { text: '❌ Request timed out. Please try again.' }, { quoted: message });
            }
            else {
                await sock.sendMessage(chatId, { text: '❌ Failed to reverse the text.' }, { quoted: message });
            }
        }
    }
};
