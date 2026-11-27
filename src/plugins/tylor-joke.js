"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
exports.default = {
    command: 'joke',
    aliases: ['jokes', 'funny'],
    category: 'fun',
    description: 'Get a random dad joke',
    usage: '.joke',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        try {
            const response = await axios_1.default.get('https://icanhazdadjoke.com/', {
                headers: { Accept: 'application/json' }
            });
            const joke = response.data.joke;
            await sock.sendMessage(chatId, { text: `😂 ${joke}` }, { quoted: message });
        }
        catch (error) {
            console.error('Error fetching dad joke:', error);
            await sock.sendMessage(chatId, {
                text: 'Sorry, I could not fetch a joke right now. Please try again later.',
                quoted: message
            });
        }
    }
};
