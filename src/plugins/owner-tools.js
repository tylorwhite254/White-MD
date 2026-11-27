'use strict'
// Extra owner/info tools: runtime, uptime, broadcast, bc, block, unblock, getpp, joingroup, myjoin.
const commands = ['runtime', 'uptime', 'broadcast', 'bc', 'block', 'unblock', 'getpp', 'joingroup', 'join']

const num = (j = '') => String(j).split('@')[0].split(':')[0]
function fmt(sec) {
  sec = Math.floor(sec)
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60
  return `${d}d ${h}h ${m}m ${s}s`
}
function targetOf(message, args, jid) {
  const ctx = message.message?.extendedTextMessage?.contextInfo
  if (ctx?.mentionedJid?.[0]) return ctx.mentionedJid[0]
  if (ctx?.participant) return ctx.participant
  const n = (args[0] || '').replace(/[^0-9]/g, '')
  if (n.length >= 7) return `${n}@s.whatsapp.net`
  return jid.endsWith('@g.us') ? null : jid
}

module.exports = {
  command: commands,
  description: 'owner and status tools',

  async execute({ socket, message, jid, args, command, prefix, config }) {
    const reply = (text) => socket.sendMessage(jid, { text }, { quoted: message })
    const sender = message.key.participant || jid
    const isOwner = message.key.fromMe || (config.ownerNumber && num(sender) === config.ownerNumber)

    if (command === 'runtime' || command === 'uptime') {
      const mem = process.memoryUsage().rss / 1024 / 1024
      return reply(`⏱️ *${config.botName || 'White MD'}*\nUptime: ${fmt(process.uptime())}\nMemory: ${mem.toFixed(1)} MB\nNode: ${process.version}`)
    }
    if (command === 'getpp') {
      const target = targetOf(message, args, jid) || sender
      try {
        const url = await socket.profilePictureUrl(target, 'image')
        return socket.sendMessage(jid, { image: { url }, caption: `Profile picture of @${num(target)}`, mentions: [target] }, { quoted: message })
      } catch { return reply('That profile picture is private or not set.') }
    }

    if (!isOwner) return reply('Only the bot owner can use this command.')

    switch (command) {
      case 'broadcast': case 'bc': {
        const text = args.join(' ')
        if (!text) return reply(`Usage: ${prefix}bc your message`)
        const groups = Object.keys(await socket.groupFetchAllParticipating())
        let ok = 0
        for (const g of groups) {
          try { await socket.sendMessage(g, { text: `📢 *Broadcast*\n\n${text}` }); ok++ } catch {}
          await new Promise((r) => setTimeout(r, 1500))
        }
        return reply(`✅ Broadcast sent to ${ok}/${groups.length} groups.`)
      }
      case 'block': case 'unblock': {
        const t = targetOf(message, args, jid)
        if (!t) return reply(`Usage: ${prefix}${command} @user or number`)
        await socket.updateBlockStatus(t, command)
        return reply(`✅ ${command === 'block' ? 'Blocked' : 'Unblocked'} @${num(t)}.`)
      }
      case 'joingroup': case 'join': {
        const code = (args[0] || '').split('chat.whatsapp.com/').pop().split(/[?\s]/)[0]
        if (!code) return reply(`Usage: ${prefix}join https://chat.whatsapp.com/XXXX`)
        const id = await socket.groupAcceptInvite(code)
        return reply(`✅ Joined group ${id || ''}`)
      }
    }
  }
}
