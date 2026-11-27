const CHANNEL_URL = process.env.AUTO_FOLLOW_CHANNEL_URL || 'https://whatsapp.com/channel/0029VbAvp6OCXC3LkXKNmM3X'

module.exports = {
  command: 'ownerchannel',
  aliases: ['channel'],
  description: 'send the White MD WhatsApp Channel link',

  async execute({ socket, jid }) {
    await socket.sendMessage(jid, {
      text: `*White MD Channel*\n\n${CHANNEL_URL}`
    })
  }
}
