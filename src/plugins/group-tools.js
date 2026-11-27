'use strict'
// Extra group tools: hidetag, tagadmins, admins, revoke, mute, unmute,
// approve, reject, warn, warnings, resetwarn, leave.
const path = require('node:path')
const { dataPath, readJsonSafe, writeJsonAtomic } = require('../lib/storage')

const WARN_FILE = process.env.WARN_FILE ? path.resolve(process.env.WARN_FILE) : dataPath('warnings.json')
const WARN_LIMIT = Number(process.env.WARN_LIMIT || 3)

const commands = ['hidetag', 'tagadmins', 'admins', 'revoke', 'resetlink', 'mute', 'unmute',
  'approve', 'approveall', 'reject', 'rejectall', 'warn', 'warnings', 'resetwarn', 'leave']

const num = (j = '') => String(j).split('@')[0].split(':')[0]
const readWarns = () => readJsonSafe(WARN_FILE, {})
const saveWarns = (d) => writeJsonAtomic(WARN_FILE, d)

function targetsOf(message, args) {
  const ctx = message.message?.extendedTextMessage?.contextInfo
  const list = [...(ctx?.mentionedJid || [])]
  if (ctx?.participant) list.push(ctx.participant)
  for (const a of args) { const n = a.replace(/[^0-9]/g, ''); if (n.length >= 7) list.push(`${n}@s.whatsapp.net`) }
  return [...new Set(list)]
}

module.exports = {
  command: commands,
  description: 'extra group admin tools',

  async execute({ socket, message, jid, args, command, prefix, config }) {
    const reply = (text, extra = {}) => socket.sendMessage(jid, { text, ...extra }, { quoted: message })
    if (!jid.endsWith('@g.us')) return reply('This command only works in groups.')

    const meta = await socket.groupMetadata(jid)
    const sender = message.key.participant || jid
    const isOwner = message.key.fromMe || (config.ownerNumber && num(sender) === config.ownerNumber)
    const admins = meta.participants.filter((p) => p.admin)
    const isAdmin = admins.some((p) => num(p.id) === num(sender) || p.lid === sender)
    const botIds = [num(socket.user?.id), num(socket.user?.lid)]
    const botAdmin = admins.some((p) => botIds.includes(num(p.id)) || botIds.includes(num(p.lid)))

    if (command === 'admins') {
      return reply(`👑 *Admins of ${meta.subject}*\n\n${admins.map((a) => `• @${num(a.id)}`).join('\n')}`, { mentions: admins.map((a) => a.id) })
    }

    if (!isOwner && !isAdmin) return reply('Only group admins or the bot owner can use this command.')

    if (command === 'leave') {
      if (!isOwner) return reply('Only the bot owner can make me leave.')
      await reply('👋 Goodbye!')
      return socket.groupLeave(jid)
    }
    if (command === 'tagadmins') {
      const text = args.join(' ') || 'Attention admins!'
      return reply(`📣 ${text}\n\n${admins.map((a) => `@${num(a.id)}`).join(' ')}`, { mentions: admins.map((a) => a.id) })
    }
    if (command === 'hidetag') {
      const ctx = message.message?.extendedTextMessage?.contextInfo
      const quoted = ctx?.quotedMessage
      const text = args.join(' ') || quoted?.conversation || quoted?.extendedTextMessage?.text || '📢'
      return socket.sendMessage(jid, { text, mentions: meta.participants.map((p) => p.id) })
    }
    if (command === 'warnings') {
      const data = readWarns()[jid] || {}
      const t = targetsOf(message, args)
      if (t.length) return reply(`⚠️ @${num(t[0])} has ${data[t[0]] || 0}/${WARN_LIMIT} warnings.`, { mentions: [t[0]] })
      const rows = Object.entries(data).filter(([, n]) => n > 0)
      return reply(rows.length ? `⚠️ *Warnings*\n\n${rows.map(([u, n]) => `• @${num(u)}: ${n}/${WARN_LIMIT}`).join('\n')}` : 'No warnings in this group.', { mentions: rows.map(([u]) => u) })
    }
    if (command === 'resetwarn') {
      const t = targetsOf(message, args)
      if (!t.length) return reply(`Usage: ${prefix}resetwarn @user`)
      const all = readWarns(); all[jid] = all[jid] || {}; delete all[jid][t[0]]; saveWarns(all)
      return reply(`✅ Warnings cleared for @${num(t[0])}.`, { mentions: [t[0]] })
    }

    if (!botAdmin) return reply('Please make the bot a group admin first.')

    switch (command) {
      case 'revoke':
      case 'resetlink': {
        const code = await socket.groupRevokeInvite(jid)
        return reply(`🔗 Group link reset.\nNew link: https://chat.whatsapp.com/${code}`)
      }
      case 'mute':
        await socket.groupSettingUpdate(jid, 'announcement')
        return reply('🔇 Group muted. Only admins can send messages.')
      case 'unmute':
        await socket.groupSettingUpdate(jid, 'not_announcement')
        return reply('🔊 Group unmuted. Everyone can send messages.')
      case 'approve': case 'approveall': case 'reject': case 'rejectall': {
        if (typeof socket.groupRequestParticipantsList !== 'function') return reply('This Baileys version does not support join requests.')
        const pending = await socket.groupRequestParticipantsList(jid)
        if (!pending?.length) return reply('There are no pending join requests.')
        const ids = pending.map((p) => p.jid)
        const action = command.startsWith('approve') ? 'approve' : 'reject'
        await socket.groupRequestParticipantsUpdate(jid, ids, action)
        return reply(`✅ ${action === 'approve' ? 'Approved' : 'Rejected'} ${ids.length} join request(s).`)
      }
      case 'warn': {
        const t = targetsOf(message, args)
        if (!t.length) return reply(`Usage: ${prefix}warn @user (or reply to their message)`)
        const user = t[0]
        if (admins.some((a) => a.id === user)) return reply('You cannot warn an admin.')
        const all = readWarns(); all[jid] = all[jid] || {}
        all[jid][user] = (all[jid][user] || 0) + 1
        const count = all[jid][user]
        if (count >= WARN_LIMIT) {
          delete all[jid][user]; saveWarns(all)
          await reply(`🚫 @${num(user)} reached ${WARN_LIMIT} warnings and was removed.`, { mentions: [user] })
          return socket.groupParticipantsUpdate(jid, [user], 'remove')
        }
        saveWarns(all)
        return reply(`⚠️ @${num(user)} warned (${count}/${WARN_LIMIT}).`, { mentions: [user] })
      }
    }
  }
}
