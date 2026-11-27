'use strict'

module.exports = {
  command: 'mode',
  description: 'set public or private bot mode',

  async execute({ socket, message, jid, args, config, prefix }) {
    const sender = message?.key?.participant || jid
    const senderNumber = String(sender).split(':')[0].split('@')[0]
    const ownerNumber = String(config?.ownerNumber || '').replace(/[^0-9]/g, '')
    const isOwner = Boolean(message?.key?.fromMe || (ownerNumber && senderNumber === ownerNumber))

    if (!isOwner) {
      await socket.sendMessage(jid, { text: 'Only the White MD owner can change bot mode.' }, { quoted: message })
      return
    }

    const requested = String(args?.[0] || '').toLowerCase()
    if (!requested) {
      await socket.sendMessage(jid, {
        text: `Current bot mode: ${config.getBotMode()}\nUsage: ${prefix}mode public\n${prefix}mode private`
      }, { quoted: message })
      return
    }

    if (!['public', 'private'].includes(requested)) {
      await socket.sendMessage(jid, {
        text: `Usage: ${prefix}mode public\n${prefix}mode private`
      }, { quoted: message })
      return
    }

    config.setBotMode(requested)
    const explanation = requested === 'private'
      ? 'Only the bot owner can use White MD commands now.'
      : 'Everyone can use White MD commands now.'
    await socket.sendMessage(jid, {
      text: `White MD mode changed to ${requested}. ${explanation}\nThis setting is saved and will remain after restart.`
    }, { quoted: message })
  }
}
