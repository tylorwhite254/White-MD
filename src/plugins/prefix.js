module.exports = {
  command: ['setprefix', 'delprefix'],
  description: 'change the command prefix',

  async execute({ socket, message, jid, args, command, config, prefix }) {
    const sender = message?.key?.participant || message?.key?.remoteJid || jid
    const senderNumber = String(sender).split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
    const ownerNumber = String(config?.ownerNumber || '').replace(/[^0-9]/g, '')
    const isOwner = Boolean(message?.key?.fromMe || (ownerNumber && senderNumber === ownerNumber))
    if (!isOwner) {
      await socket.sendMessage(jid, { text: 'Only the bot owner can change the prefix.' })
      return
    }

    const newPrefix = command === 'delprefix' ? '.' : args[0]
    if (!newPrefix || /\s/.test(newPrefix) || newPrefix.length > 3) {
      await socket.sendMessage(jid, { text: `Usage: ${prefix}setprefix !\nThen use !menu. To restore the default, use !delprefix.` })
      return
    }

    try {
      config.setPrefix(newPrefix)
      await socket.sendMessage(jid, {
        text: command === 'delprefix'
          ? 'Custom prefix removed. White MD is using the default prefix: .'
          : `Prefix changed to: ${newPrefix}\nFrom now on use ${newPrefix}menu and ${newPrefix}ping.`
      })
    } catch (error) {
      await socket.sendMessage(jid, { text: `Prefix could not be saved: ${error.message}` })
    }
  }
}
