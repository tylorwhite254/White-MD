'use strict'

const { downloadMediaMessage } = require('@whiskeysockets/baileys')

function ownerAllowed(message, config) {
  if (message?.key?.fromMe) return true
  const owner = String(config?.ownerNumber || '').replace(/[^0-9]/g, '')
  const sender = String(message?.key?.participant || message?.key?.remoteJid || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
  return Boolean(owner && sender === owner)
}

function unwrap(message) {
  let current = message
  for (let index = 0; index < 4 && current; index += 1) {
    if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message
    else break
  }
  return current || {}
}

function getQuotedImage(message) {
  const context = message?.message?.extendedTextMessage?.contextInfo
  const quoted = context?.quotedMessage
  if (quoted && unwrap(quoted).imageMessage) {
    return {
      context,
      message: {
        key: { remoteJid: message.key.remoteJid, id: context.stanzaId, participant: context.participant },
        message: quoted
      }
    }
  }
  return null
}

module.exports = {
  command: ['about', 'botabout', 'botinfo', 'info', 'settings', 'setname', 'setbotname', 'profilename', 'setabout', 'setbotabout', 'setbio', 'setbotbio', 'setprofile', 'setbotprofile', 'setpp', 'setbotpp', 'setpic', 'setbotpic', 'delprofile', 'delbotprofile', 'delpp', 'delbotpp', 'removephoto'],
  description: 'owner profile and bot information controls',

  async execute({ socket, jid, args, command, message, config, logger }) {
    if (!ownerAllowed(message, config)) {
      await socket.sendMessage(jid, { text: 'Only the bot owner can use this command.' }, { quoted: message })
      return
    }

    const botJid = String(socket.user?.id || '').replace(/:\d+(?=@)/, '')
    if (!botJid) throw new Error('The bot profile is not ready yet')
    const value = args.join(' ').trim()

    if (['about', 'botabout', 'botinfo', 'info', 'settings'].includes(command)) {
      await socket.sendMessage(jid, {
        text: [
          '*White MD*',
          '',
          'Owner: Tylor White',
          'Library: @whiskeysockets/baileys',
          `Bot JID: ${botJid}`,
          `Prefix: ${config?.prefix || process.env.COMMAND_PREFIX || '.'}`,
          '',
          'Bot profile commands: .setbotname, .setbotabout, .setbotprofile, .delbotprofile'
        ].join('\n')
      }, { quoted: message })
      return
    }

    if (command === 'setname' || command === 'setbotname' || command === 'profilename') {
      if (!value || value.length > 25) {
        await socket.sendMessage(jid, { text: 'Usage: .setname Your bot name (maximum 25 characters)' }, { quoted: message })
        return
      }
      await socket.updateProfileName(value)
      await socket.sendMessage(jid, { text: `Bot profile name updated to: ${value}` }, { quoted: message })
      return
    }

    if (command === 'setabout' || command === 'setbotabout' || command === 'setbio' || command === 'setbotbio') {
      if (!value || value.length > 139) {
        await socket.sendMessage(jid, { text: `Usage: .${command} Your About text (maximum 139 characters)` }, { quoted: message })
        return
      }
      await socket.updateProfileStatus(value)
      await socket.sendMessage(jid, { text: 'Bot About text updated.' }, { quoted: message })
      return
    }

    if (['delprofile', 'delbotprofile', 'delpp', 'delbotpp', 'removephoto'].includes(command)) {
      if (typeof socket.removeProfilePicture !== 'function') throw new Error('This Baileys version does not support profile-picture removal')
      await socket.removeProfilePicture(botJid)
      await socket.sendMessage(jid, { text: 'Bot profile picture removed.' }, { quoted: message })
      return
    }

    const quotedImage = getQuotedImage(message)
    if (!quotedImage) {
      await socket.sendMessage(jid, { text: `Reply to an image with .${command} to update the bot profile picture.` }, { quoted: message })
      return
    }
    const buffer = await downloadMediaMessage(quotedImage.message, 'buffer', {}, socket, { logger })
    await socket.updateProfilePicture(botJid, buffer)
    await socket.sendMessage(jid, { text: 'Bot profile picture updated.' }, { quoted: message })
  }
}
