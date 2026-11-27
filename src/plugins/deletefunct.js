'use strict'

const PROTECTED = new Set(['menu', 'help', 'ping', 'deletefunct', 'restorefunct'])

function ownerAllowed(message, jid, ownerNumber) {
  if (message?.key?.fromMe) return true
  const sender = String(message?.key?.participant || message?.key?.remoteJid || jid)
  const senderNumber = sender.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
  const configuredOwner = String(ownerNumber || '').replace(/[^0-9]/g, '')
  return Boolean(configuredOwner && senderNumber === configuredOwner)
}

function normalizeCommand(value) {
  return String(value || '').trim().toLowerCase().replace(/^\.+/, '')
}

module.exports = {
  command: ['deletefunct', 'restorefunct'],
  description: 'owner-only reversible command disable/restore utility',

  async execute({ socket, jid, message, args, command, config, prefix }) {
    if (!ownerAllowed(message, jid, config?.ownerNumber)) {
      await socket.sendMessage(jid, { text: 'Only the White MD owner can change command availability.' }, { quoted: message })
      return
    }

    const target = normalizeCommand(args[0])
    if (!target || !/^[a-z0-9_-]+$/.test(target)) {
      await socket.sendMessage(jid, {
        text: `Usage:\n${prefix}deletefunct command\n${prefix}restorefunct command\n\nExample: ${prefix}deletefunct sticker`
      }, { quoted: message })
      return
    }
    if (PROTECTED.has(target)) {
      await socket.sendMessage(jid, { text: `The ${prefix}${target} command is protected and cannot be disabled.` }, { quoted: message })
      return
    }

    const disabled = command === 'deletefunct'
    const changed = config?.setCommandDisabled?.(target, disabled)
    if (!changed) {
      await socket.sendMessage(jid, { text: 'That command name is not valid.' }, { quoted: message })
      return
    }

    await socket.sendMessage(jid, {
      text: disabled
        ? `Done. ${prefix}${target} is now disabled for all chats. Its source file was not deleted, so it can be restored with ${prefix}restorefunct ${target}.`
        : `Done. ${prefix}${target} has been restored.`
    }, { quoted: message })
  }
}
