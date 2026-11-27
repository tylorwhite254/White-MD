module.exports = {
  command: ['autotype', 'autotyping'],
  description: 'show typing presence for incoming messages',

  async execute({ socket, jid, args, message, config, prefix }) {
    const sender = message.key.participant || jid
    const senderNumber = sender.split(':')[0].split('@')[0]
    const isOwner = message.key.fromMe || (config.ownerNumber && senderNumber === config.ownerNumber)
    if (!isOwner) {
      await socket.sendMessage(jid, { text: 'Only the bot owner can change autotype.' })
      return
    }

    const value = (args[0] || '').toLowerCase()
    if (!['on', 'off'].includes(value)) {
      await socket.sendMessage(jid, { text: `Usage: ${prefix}autotype on or ${prefix}autotype off` })
      return
    }

    const enabled = value === 'on'
    config.setAutoType(enabled)
    await socket.sendMessage(jid, {
      text: enabled
        ? 'Autotype is now ON. White MD will show typing presence for incoming messages.'
        : 'Autotype is now OFF.'
    })
  }
}
