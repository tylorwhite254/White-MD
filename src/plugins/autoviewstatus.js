module.exports = {
  command: ['autoviewstatus', 'autostatus'],
  description: 'automatically mark WhatsApp statuses as viewed',

  async execute({ socket, jid, args, message, config, prefix }) {
    const sender = message.key.participant || jid
    const senderNumber = sender.split(':')[0].split('@')[0]
    const isOwner = message.key.fromMe || (config.ownerNumber && senderNumber === config.ownerNumber)
    if (!isOwner) {
      await socket.sendMessage(jid, { text: 'Only the bot owner can change autoviewstatus.' })
      return
    }

    const value = (args[0] || '').toLowerCase()
    if (!['on', 'off'].includes(value)) {
      await socket.sendMessage(jid, { text: `Usage: ${prefix}autoviewstatus on or ${prefix}autoviewstatus off` })
      return
    }

    const enabled = value === 'on'
    config.setAutoViewStatus(enabled)
    await socket.sendMessage(jid, {
      text: enabled
        ? 'Autoviewstatus is now ON. White MD will mark incoming statuses as viewed.'
        : 'Autoviewstatus is now OFF.'
    })
  }
}
