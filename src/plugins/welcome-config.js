'use strict'

const { getGroupSettings, updateGroupSettings } = require('../lib/group-settings')

module.exports = {
  command: ['autowelcome', 'autogoodbye'],
  category: 'group',
  description: 'toggle persistent welcome and goodbye messages in a group',

  async execute({ socket, message, jid, args, command, prefix }) {
    if (!jid.endsWith('@g.us')) {
      await socket.sendMessage(jid, { text: 'This command only works in groups.' }, { quoted: message })
      return
    }

    const isWelcome = command === 'autowelcome'
    const enabledKey = isWelcome ? 'welcomeEnabled' : 'goodbyeEnabled'
    const textKey = isWelcome ? 'welcomeText' : 'goodbyeText'
    const defaultMsg = isWelcome
      ? 'Welcome to *{group}*, @{user}! 👋'
      : 'Goodbye @{user}, thanks for being part of *{group}*.'

    const sub = String(args[0] || '').toLowerCase()
    if (sub === 'on') {
      updateGroupSettings(jid, { [enabledKey]: true })
      await socket.sendMessage(jid, { text: `✅ *${command}* is now ON for this group.` }, { quoted: message })
      return
    }
    if (sub === 'off') {
      updateGroupSettings(jid, { [enabledKey]: false })
      await socket.sendMessage(jid, { text: `🛑 *${command}* is now OFF for this group.` }, { quoted: message })
      return
    }
    if (sub === 'set') {
      const custom = args.slice(1).join(' ').trim()
      if (!custom) {
        await socket.sendMessage(jid, {
          text: `Provide a message after *set*. Placeholders: {user}, {group}\nExample: ${prefix}${command} set Welcome @{user} to {group}!`
        }, { quoted: message })
        return
      }
      updateGroupSettings(jid, { [enabledKey]: true, [textKey]: custom.slice(0, 600) })
      await socket.sendMessage(jid, { text: `✅ Saved custom *${command}* message and turned it ON.` }, { quoted: message })
      return
    }

    const current = getGroupSettings(jid)
    const state = current[enabledKey] ? 'ON' : 'OFF'
    const template = current[textKey] || defaultMsg
    await socket.sendMessage(jid, {
      text: `*${command}* is currently *${state}*.\nMessage: ${template}\n\nUsage:\n• ${prefix}${command} on\n• ${prefix}${command} off\n• ${prefix}${command} set <message>`
    }, { quoted: message })
  }
}
