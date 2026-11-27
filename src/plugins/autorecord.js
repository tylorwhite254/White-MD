module.exports = {
  command: ['autorecord', 'autorecording'],
  description: 'show recording presence for incoming messages',

  async execute({ socket, jid, args, message, config, prefix }) {
    const sender = message.key.participant || jid
    const senderNumber = sender.split(':')[0].split('@')[0]
    const isOwner = message.key.fromMe || (config.ownerNumber && senderNumber === config.ownerNumber)
    if (!isOwner) {
      await socket.sendMessage(jid, { text: 'Only the bot owner can change autorecord.' })
      return
    }

    const value = (args[0] || '').toLowerCase()
    if (!['on', 'off'].includes(value)) {
      await socket.sendMessage(jid, { text: `Usage: ${prefix}autorecord on or ${prefix}autorecord off` })
      return
    }

    const enabled = value === 'on'
    config.setAutoRecord(enabled)
    await socket.sendMessage(jid, {
      text: enabled
        ? 'Autorecord is now ON. White MD will show recording presence for incoming messages.'
        : 'Autorecord is now OFF.'
    })
  }
}
