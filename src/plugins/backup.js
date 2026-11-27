'use strict'

const { DATA_DIR, AUTH_DIR, exportSessionBundle } = require('../lib/storage')

module.exports = {
  command: ['backup', 'sessionid'],
  category: 'owner',
  description: 'export your portable SESSION_ID so restarts never lose your session',

  async execute({ socket, message, jid, config }) {
    const sender = message?.key?.participant || jid
    const senderNumber = String(sender).split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
    const ownerNumber = String(config?.ownerNumber || '').replace(/[^0-9]/g, '')
    const isOwner = Boolean(message?.key?.fromMe || (ownerNumber && senderNumber === ownerNumber))

    if (!isOwner) {
      await socket.sendMessage(jid, { text: 'Only the bot owner can export the session backup.' }, { quoted: message })
      return
    }

    const sessionId = exportSessionBundle()
    if (!sessionId) {
      await socket.sendMessage(jid, { text: 'No saved WhatsApp session found to export yet.' }, { quoted: message })
      return
    }

    const dmJid = (socket.user?.id || jid).replace(/:\d+(?=@)/, '')
    await socket.sendMessage(dmJid, {
      text: `🔐 *White MD Portable SESSION_ID*\n\nKeep this secret! Paste it into your host's *SESSION_ID* environment variable so your bot restores automatically if the disk resets.\n\n*Storage folder:* ${DATA_DIR}\n*Auth folder:* ${AUTH_DIR}`
    })
    await socket.sendMessage(dmJid, { text: sessionId })

    if (jid !== dmJid) {
      await socket.sendMessage(jid, { text: '✅ Sent your private SESSION_ID backup to your own DM.' }, { quoted: message })
    }
  }
}
