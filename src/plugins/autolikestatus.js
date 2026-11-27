module.exports = {
  command: ['autolikestatus', 'autoreact'],
  description: 'automatically react to incoming WhatsApp statuses',

  async execute({ socket, jid, args, message, config, prefix }) {
    const sender = message.key.participant || jid
    const senderNumber = sender.split(':')[0].split('@')[0]
    const isOwner = message.key.fromMe || (config.ownerNumber && senderNumber === config.ownerNumber)
    if (!isOwner) {
      await socket.sendMessage(jid, { text: 'Only the bot owner can change autolikestatus.' })
      return
    }

    const value = (args[0] || '').toLowerCase()
    if (!['on', 'off'].includes(value)) {
      await socket.sendMessage(jid, { text: `Usage: ${prefix}autolikestatus on or ${prefix}autolikestatus off` })
      return
    }

    const enabled = value === 'on'
    config.setAutoLikeStatus(enabled)
    await socket.sendMessage(jid, {
      text: enabled
        ? `Autolikestatus is now ON. White MD will react with ${process.env.AUTO_STATUS_REACTION || '❤️'}.`
        : 'Autolikestatus is now OFF.'
    })
  }
}
