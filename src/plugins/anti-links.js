'use strict'

const { getGroupSettings, updateGroupSettings } = require('../lib/group-settings')

const COMMAND_TYPES = {
  antilink: 'general',
  antialink: 'general',
  antiinstagram: 'instagram',
  antifacebook: 'facebook'
}

function senderJid(message) {
  return message?.key?.participant || message?.key?.remoteJid || ''
}

function isOwner(message, config) {
  if (message?.key?.fromMe) return true
  const owner = String(config?.ownerNumber || '').replace(/[^0-9]/g, '')
  const sender = senderJid(message).split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
  return Boolean(owner && sender === owner)
}

async function groupAccess({ socket, message, jid, config }) {
  if (!jid.endsWith('@g.us')) return { error: 'This command can only be used in a group.' }
  const metadata = await socket.groupMetadata(jid)
  const sender = senderJid(message)
  const senderParticipant = metadata.participants.find((participant) => participant.id === sender)
  const bot = String(socket.user?.id || '').replace(/:\d+(?=@)/, '')
  const botParticipant = metadata.participants.find((participant) => participant.id === bot)
  if (!isOwner(message, config) && !senderParticipant?.admin) return { error: 'Only group admins or the bot owner can configure anti-link rules.' }
  if (!botParticipant?.admin) return { error: 'Please make White MD a group administrator first.' }
  return { metadata }
}

function statusText(settings, type) {
  const rule = settings?.antiLinks?.[type] || { enabled: false, action: 'delete' }
  return `${type}: ${rule.enabled ? 'on' : 'off'} (${rule.action})`
}

module.exports = {
  command: Object.keys(COMMAND_TYPES),
  description: 'group anti-link protection controls',

  async execute({ socket, jid, args, command, message, config }) {
    const access = await groupAccess({ socket, message, jid, config })
    if (access.error) {
      await socket.sendMessage(jid, { text: access.error }, { quoted: message })
      return
    }
    const type = COMMAND_TYPES[command]
    const value = (args[0] || '').toLowerCase()
    const action = (args[1] || 'delete').toLowerCase()
    const settings = getGroupSettings(jid)
    const current = settings.antiLinks?.[type] || { enabled: false, action: 'delete' }

    if (value === 'status' || !value) {
      await socket.sendMessage(jid, {
        text: [
          '*Anti-link settings*',
          statusText(settings, 'general'),
          statusText(settings, 'instagram'),
          statusText(settings, 'facebook'),
          '',
          `Usage: .${command} on|off [warn|delete|deletewarn|kick]`
        ].join('\n')
      }, { quoted: message })
      return
    }
    if (!['on', 'off'].includes(value)) {
      await socket.sendMessage(jid, { text: `Usage: .${command} on|off [warn|delete|deletewarn|kick]` }, { quoted: message })
      return
    }
    if (value === 'on' && !['warn', 'delete', 'deletewarn', 'kick'].includes(action)) {
      await socket.sendMessage(jid, { text: 'Action must be warn, delete, deletewarn, or kick.' }, { quoted: message })
      return
    }
    updateGroupSettings(jid, {
      antiLinks: {
        ...(settings.antiLinks || {}),
        [type]: { enabled: value === 'on', action: value === 'on' ? action : current.action }
      }
    })
    await socket.sendMessage(jid, {
      text: `${type === 'general' ? 'General link' : `${type} link`} protection ${value === 'on' ? `enabled with ${action}` : 'disabled'}.`
    }, { quoted: message })
  }
}
