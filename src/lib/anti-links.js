'use strict'

const { getGroupSettings, addWarning } = require('./group-settings')

const LINK_RULES = {
  instagram: /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\S*/i,
  facebook: /(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.watch|fb\.me)\S*/i,
  general: /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|me|ly|tv)\b)\S*/i
}

function senderJid(message) {
  return message?.key?.participant || message?.key?.remoteJid || ''
}

function botJid(socket) {
  return String(socket?.user?.id || '').replace(/:\d+(?=@)/, '')
}

function quotedContext(message) {
  return message?.message?.extendedTextMessage?.contextInfo ||
    message?.message?.imageMessage?.contextInfo ||
    message?.message?.videoMessage?.contextInfo ||
    message?.message?.documentMessage?.contextInfo || null
}

function messageKeyForDelete(socket, jid, message) {
  const context = quotedContext(message)
  if (!context?.stanzaId) return message.key
  const bot = botJid(socket)
  return {
    remoteJid: jid,
    fromMe: Boolean(context.participant && bot && context.participant.split(':')[0] === bot.split(':')[0]),
    id: context.stanzaId,
    participant: context.participant
  }
}

function settingFor(settings, type) {
  const value = settings?.antiLinks?.[type]
  return value && typeof value === 'object' ? value : { enabled: false, action: 'delete' }
}

function matchedType(text) {
  if (LINK_RULES.instagram.test(text)) return 'instagram'
  if (LINK_RULES.facebook.test(text)) return 'facebook'
  if (LINK_RULES.general.test(text)) return 'general'
  return null
}

async function enforceAntiLinks({ socket, message, jid, text, config, logger }) {
  if (!jid?.endsWith('@g.us') || message?.key?.fromMe || !text || text.startsWith(config?.prefix || process.env.COMMAND_PREFIX || '.')) return false
  const type = matchedType(text)
  if (!type) return false
  const settings = getGroupSettings(jid)
  let rule = settingFor(settings, type)
  if (!rule.enabled && type !== 'general') rule = settingFor(settings, 'general')
  if (!rule.enabled) return false

  const sender = senderJid(message)
  const metadata = await socket.groupMetadata(jid)
  const senderParticipant = metadata.participants.find((participant) => participant.id === sender)
  const bot = botJid(socket)
  const botParticipant = metadata.participants.find((participant) => participant.id === bot)
  const ownerNumber = String(config?.ownerNumber || '').replace(/[^0-9]/g, '')
  const senderNumber = sender.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
  if (senderParticipant?.admin || senderNumber === ownerNumber || !botParticipant?.admin) return false

  const action = ['warn', 'delete', 'kick', 'deletewarn'].includes(rule.action) ? rule.action : 'delete'
  const label = type === 'general' ? 'link' : `${type} link`
  try {
    if (action === 'warn' || action === 'deletewarn') {
      const count = addWarning(jid, sender)
      await socket.sendMessage(jid, { text: `@${senderNumber} please do not send ${label}s. Warning ${count}.`, mentions: [sender] })
    }
    if (action === 'delete' || action === 'deletewarn') {
      await socket.sendMessage(jid, { delete: messageKeyForDelete(socket, jid, message) })
    }
    if (action === 'kick') {
      await socket.sendMessage(jid, { delete: messageKeyForDelete(socket, jid, message) }).catch(() => {})
      await socket.groupParticipantsUpdate(jid, [sender], 'remove')
      await socket.sendMessage(jid, { text: `Removed @${senderNumber} for sending a ${label}.`, mentions: [sender] })
    }
  } catch (error) {
    logger?.warn?.({ err: error, jid, type, action }, 'Anti-link enforcement failed')
  }
  return true
}

module.exports = { enforceAntiLinks, matchedType }
