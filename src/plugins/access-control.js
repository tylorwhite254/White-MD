'use strict'

const {
  normalizeNumber,
  banUser,
  unbanUser,
  clearBans,
  listBannedUsers,
  banGroup,
  unbanGroup,
  listBannedGroups,
  addSudo,
  removeSudo,
  isSudoUser,
  listSudoUsers,
  setAntiDm,
  isAntiDmEnabled,
  setAntiCall,
  isAntiCallEnabled,
  setCooldownSeconds,
  getCooldownSeconds,
  setMaintenance,
  getMaintenance
} = require('../lib/access-control')

function isPrimaryOwner(message, jid, config) {
  if (message?.key?.fromMe) return true
  const sender = message?.key?.participant || jid
  const ownerNum = normalizeNumber(config?.ownerNumber || process.env.OWNER_NUMBER || '')
  return Boolean(ownerNum && normalizeNumber(sender) === ownerNum)
}

function isOwnerOrSudo(message, jid, config) {
  if (isPrimaryOwner(message, jid, config)) return true
  const sender = message?.key?.participant || jid
  return isSudoUser(sender)
}

function resolveTarget(message, args, jid) {
  const ctx = message.message?.extendedTextMessage?.contextInfo
  if (ctx?.mentionedJid?.[0]) {
    const rest = args.filter((a) => !a.startsWith('@')).join(' ').trim()
    return { target: ctx.mentionedJid[0], rest }
  }
  if (ctx?.participant) {
    return { target: ctx.participant, rest: args.join(' ').trim() }
  }
  const firstDigits = normalizeNumber(args[0] || '')
  if (firstDigits.length >= 6) {
    return { target: `${firstDigits}@s.whatsapp.net`, rest: args.slice(1).join(' ').trim() }
  }
  if (!jid.endsWith('@g.us') && !message.key?.fromMe) {
    return { target: jid, rest: args.join(' ').trim() }
  }
  return { target: '', rest: '' }
}

module.exports = {
  command: [
    'ban', 'unban', 'banlist', 'banned', 'clearbans',
    'bangroup', 'mutebot', 'unbangroup', 'unmutebot', 'bannedgroups',
    'addsudo', 'delsudo', 'sudolist', 'sudos',
    'antidm', 'anticall', 'cooldown', 'maintenance'
  ],
  description: 'Bot access control: ban/unban users, mute groups, sudo admins, anti-DM, anti-call, cooldown, and maintenance mode',

  async execute({ socket, message, jid, args, command, prefix, config }) {
    const reply = (text, extra = {}) => socket.sendMessage(jid, { text, ...extra }, { quoted: message })
    const sender = message?.key?.participant || jid
    const ownerNum = normalizeNumber(config?.ownerNumber || process.env.OWNER_NUMBER || '')
    const botNum = normalizeNumber(socket?.user?.id || '')

    if (['addsudo', 'delsudo', 'clearbans'].includes(command)) {
      if (!isPrimaryOwner(message, jid, config)) {
        return reply('🔒 Only the primary bot owner can use this command.')
      }
    } else if (!isOwnerOrSudo(message, jid, config)) {
      return reply('🔒 Only the bot owner or sudo admins can use this command.')
    }

    switch (command) {
      case 'ban': {
        const { target, rest } = resolveTarget(message, args, jid)
        if (!target) {
          return reply(`Usage: *${prefix}ban @user [reason]* or reply to a user's message, or *${prefix}ban 2547XXXXXXXX [reason]*`)
        }
        const targetNum = normalizeNumber(target)
        if (targetNum === ownerNum || targetNum === botNum) {
          return reply('❌ You cannot ban the bot owner or the bot itself.')
        }
        const res = banUser(targetNum, { reason: rest || 'Banned by owner', by: sender })
        if (!res.ok) return reply(`❌ ${res.error}`)
        return reply(
          `🚫 *User Banned from Bot*\n\n👤 User: @${res.number}\n📝 Reason: ${res.entry.reason}\n\nThey can no longer use any bot commands until unbanned with *${prefix}unban ${res.number}*.`,
          { mentions: [`${res.number}@s.whatsapp.net`] }
        )
      }

      case 'unban': {
        const { target } = resolveTarget(message, args, jid)
        if (!target) {
          return reply(`Usage: *${prefix}unban @user* or *${prefix}unban 2547XXXXXXXX*`)
        }
        const res = unbanUser(target)
        if (!res.ok) return reply(`❌ ${res.error}`)
        return reply(`✅ Unbanned @${res.number}. They can use the bot again.`, {
          mentions: [`${res.number}@s.whatsapp.net`]
        })
      }

      case 'banlist':
      case 'banned': {
        const banned = listBannedUsers()
        const entries = Object.entries(banned)
        if (!entries.length) return reply('✅ No users are currently banned from the bot.')
        const lines = entries.map(([num, info], idx) => `${idx + 1}. +${num} — _${info.reason || 'No reason'}_`)
        return reply(`🚫 *Banned Users (${entries.length})*\n\n${lines.join('\n')}\n\nUnban with *${prefix}unban <number>*`)
      }

      case 'clearbans': {
        const count = clearBans()
        return reply(`✅ Cleared ${count} banned user${count === 1 ? '' : 's'}.`)
      }

      case 'bangroup':
      case 'mutebot': {
        const targetGroup = args[0]?.endsWith('@g.us') ? args[0] : (jid.endsWith('@g.us') ? jid : '')
        if (!targetGroup) return reply(`Use *${prefix}${command}* inside a group (or pass a group JID).`)
        const reason = args[0]?.endsWith('@g.us') ? args.slice(1).join(' ') : args.join(' ')
        const res = banGroup(targetGroup, { reason: reason || 'Bot muted in group', by: sender })
        if (!res.ok) return reply(`❌ ${res.error}`)
        return reply(`🔇 Bot is now muted in this group for non-owners. Re-enable with *${prefix}unbangroup*.`)
      }

      case 'unbangroup':
      case 'unmutebot': {
        const targetGroup = args[0]?.endsWith('@g.us') ? args[0] : (jid.endsWith('@g.us') ? jid : '')
        if (!targetGroup) return reply(`Use *${prefix}${command}* inside a group (or pass a group JID).`)
        const res = unbanGroup(targetGroup)
        if (!res.ok) return reply(`❌ ${res.error}`)
        return reply(`🔊 Bot is active again in this group.`)
      }

      case 'bannedgroups': {
        const groups = Object.entries(listBannedGroups())
        if (!groups.length) return reply('✅ No groups are currently muted/banned.')
        const lines = groups.map(([g, info], i) => `${i + 1}. ${g} — _${info.reason || 'Muted'}_`)
        return reply(`🔇 *Muted/Banned Groups (${groups.length})*\n\n${lines.join('\n')}`)
      }

      case 'addsudo': {
        const { target } = resolveTarget(message, args, jid)
        if (!target) return reply(`Usage: *${prefix}addsudo @user* or *${prefix}addsudo 2547XXXXXXXX*`)
        const res = addSudo(target)
        if (!res.ok) return reply(`❌ ${res.error}`)
        return reply(`👑 Added @${res.number} as a Sudo (co-owner) admin.`, {
          mentions: [`${res.number}@s.whatsapp.net`]
        })
      }

      case 'delsudo': {
        const { target } = resolveTarget(message, args, jid)
        if (!target) return reply(`Usage: *${prefix}delsudo @user* or *${prefix}delsudo 2547XXXXXXXX*`)
        const res = removeSudo(target)
        if (!res.ok) return reply(`❌ ${res.error}`)
        return reply(`✅ Removed @${res.number} from Sudo admins.`, {
          mentions: [`${res.number}@s.whatsapp.net`]
        })
      }

      case 'sudolist':
      case 'sudos': {
        const sudos = listSudoUsers()
        if (!sudos.length) return reply(`No sudo admins added yet. Add one with *${prefix}addsudo @user*.`)
        return reply(`👑 *Sudo Admins (${sudos.length})*\n\n${sudos.map((n, i) => `${i + 1}. +${n}`).join('\n')}`)
      }

      case 'antidm': {
        const arg = String(args[0] || '').toLowerCase()
        if (!['on', 'off'].includes(arg)) {
          return reply(`*Anti-DM* is currently *${isAntiDmEnabled() ? 'ON' : 'OFF'}*.\nUsage: *${prefix}antidm on* or *${prefix}antidm off*`)
        }
        setAntiDm(arg === 'on')
        return reply(`✅ Anti-DM is now *${arg.toUpperCase()}*. ${arg === 'on' ? 'Only owner/sudo can use commands in private DMs.' : 'Everyone can use commands in DMs again.'}`)
      }

      case 'anticall': {
        const arg = String(args[0] || '').toLowerCase()
        if (!['on', 'off'].includes(arg)) {
          return reply(`*Anti-Call* is currently *${isAntiCallEnabled() ? 'ON' : 'OFF'}*.\nUsage: *${prefix}anticall on* or *${prefix}anticall off*`)
        }
        setAntiCall(arg === 'on')
        return reply(`✅ Anti-Call is now *${arg.toUpperCase()}*. ${arg === 'on' ? 'Incoming calls to the bot will be auto-rejected.' : 'Incoming calls will not be rejected.'}`)
      }

      case 'cooldown': {
        if (!args.length) {
          return reply(`⏱️ Current command cooldown: *${getCooldownSeconds()}s*.\nUsage: *${prefix}cooldown <seconds>* (0 to disable).`)
        }
        const res = setCooldownSeconds(args[0])
        if (!res.ok) return reply(`❌ ${res.error}`)
        return reply(res.seconds === 0
          ? '✅ Command cooldown disabled.'
          : `✅ Command cooldown set to *${res.seconds}s* per user (owner & sudo exempt).`)
      }

      case 'maintenance': {
        const arg = String(args[0] || '').toLowerCase()
        if (!['on', 'off'].includes(arg)) {
          const m = getMaintenance()
          return reply(`🛠️ Maintenance mode is *${m.enabled ? 'ON' : 'OFF'}*${m.reason ? ` (${m.reason})` : ''}.\nUsage: *${prefix}maintenance on [reason]* or *${prefix}maintenance off*`)
        }
        const reason = args.slice(1).join(' ').trim()
        const m = setMaintenance(arg === 'on', reason)
        return reply(m.enabled
          ? `🛠️ Maintenance mode *ENABLED*${m.reason ? `: ${m.reason}` : ''}. Only owner & sudo can use commands.`
          : '✅ Maintenance mode *DISABLED*. The bot is open to everyone again.')
      }
    }
  }
}
