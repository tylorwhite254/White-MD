"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    command: 'shayari',
    aliases: ['poetry', 'shayar'],
    category: 'quotes',
    description: 'Get a random shayari',
    usage: '.shayari',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        try {
            const response = await fetch('https://shizoapi.onrender.com/api/texts/shayari?apikey=shizo');
            const data = await response.json();
            if (!data || !data.result) {
                throw new Error('Invalid response from API');
            }
            await sock.sendMessage(chatId, {
                text: data.result,
            }, { quoted: message });
        }
        catch (error) {
            console.error('Shayari Command Error:', error);
            await sock.sendMessage(chatId, {
                text: '❌ Failed to fetch shayari. Please try again later.',
            }, { quoted: message });
        }
    }
};
