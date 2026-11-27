'use strict'

const { downloadMediaMessage } = require('@whiskeysockets/baileys')

function unwrap(message) {
  let current = message
  for (let index = 0; index < 4 && current; index += 1) {
    if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message
    else if (current.viewOnceMessageV2Extension?.message) current = current.viewOnceMessageV2Extension.message
    else break
  }
  return current || {}
}

function getMediaType(message) {
  const content = unwrap(message)
  return ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].find((type) => content[type])
}

module.exports = {
  command: 'vv',
  aliases: ['viewonce', 'view-once'],
  description: 'recover quoted view-once media',

  async execute({ socket, message, jid, logger }) {
    const context = message?.message?.extendedTextMessage?.contextInfo
    const quoted = context?.quotedMessage
    if (!quoted) {
      await socket.sendMessage(jid, { text: 'Reply to a view-once image, video, audio, or document with .vv.' }, { quoted: message })
      return
    }

    const mediaType = getMediaType(quoted)
    if (!mediaType) {
      await socket.sendMessage(jid, { text: 'The quoted message does not contain supported view-once media.' }, { quoted: message })
      return
    }

    try {
      const quotedMessage = {
        key: {
          remoteJid: jid,
          id: context.stanzaId || `white-md-vv-${Date.now()}`,
          participant: context.participant
        },
        message: quoted
      }
      const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {}, socket, { logger })
      const media = unwrap(quoted)[mediaType]
      const payload = {}

      if (mediaType === 'imageMessage') payload.image = buffer
      if (mediaType === 'videoMessage') payload.video = buffer
      if (mediaType === 'audioMessage') {
        payload.audio = buffer
        payload.ptt = Boolean(media.ptt)
      }
      if (mediaType === 'documentMessage') {
        payload.document = buffer
        payload.fileName = media.fileName || 'white-md-recovered-file'
        payload.mimetype = media.mimetype || 'application/octet-stream'
      }
      if (media?.caption) payload.caption = media.caption
      if (media?.mimetype && !payload.mimetype) payload.mimetype = media.mimetype

      await socket.sendMessage(jid, payload, { quoted: message })
    } catch (error) {
      logger.error({ err: error }, 'View-once media recovery failed')
      await socket.sendMessage(jid, { text: 'I could not recover that media. It may have expired or WhatsApp may have removed it.' }, { quoted: message })
    }
  }
}
