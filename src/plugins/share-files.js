'use strict'

const fs = require('node:fs')
const path = require('node:path')

const API_ARCHIVE = path.join(__dirname, '../../assets/White-MD-APIs.zip')
const PLUGIN_ARCHIVE = path.join(__dirname, '../../assets/White-MD-Plugins.zip')

function isOwner(message, jid, ownerNumber) {
  if (message?.key?.fromMe) return true
  const sender = message?.key?.participant || jid
  const senderNumber = String(sender).split(':')[0].split('@')[0]
  return Boolean(ownerNumber && senderNumber === String(ownerNumber).replace(/[^0-9]/g, ''))
}

async function sendArchive({ socket, jid, message, filePath, fileName, caption }) {
  if (!fs.existsSync(filePath)) {
    await socket.sendMessage(jid, { text: `The ${fileName} archive is not available in this deployment.` }, { quoted: message })
    return
  }
  await socket.sendMessage(jid, {
    document: fs.readFileSync(filePath),
    mimetype: 'application/zip',
    fileName,
    caption
  }, { quoted: message })
}

module.exports = {
  command: ['shareapi', 'plugin'],
  description: 'share the API catalog or all White MD plugins as a ZIP',

  async execute({ socket, jid, message, command, config }) {
    if (!isOwner(message, jid, config?.ownerNumber)) {
      await socket.sendMessage(jid, { text: 'Only the White MD owner can share API or plugin archives.' }, { quoted: message })
      return
    }

    if (command === 'shareapi') {
      await sendArchive({
        socket,
        jid,
        message,
        filePath: API_ARCHIVE,
        fileName: 'White-MD-APIs.zip',
        caption: 'White MD API catalog • Tylor White'
      })
      return
    }

    await sendArchive({
      socket,
      jid,
      message,
      filePath: PLUGIN_ARCHIVE,
      fileName: 'White-MD-Plugins.zip',
      caption: 'White MD plugins • Tylor White'
    })
  }
}
