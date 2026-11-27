'use strict'

const { dataPath, readJsonSafe, writeJsonAtomic } = require('../lib/storage')

const REMIND_FILE = dataPath('reminders.json')
let schedulerInterval = null

function loadReminders() {
  const data = readJsonSafe(REMIND_FILE, { items: [] })
  return Array.isArray(data.items) ? data.items : []
}

function saveReminders(items) {
  writeJsonAtomic(REMIND_FILE, { items })
}

function parseDuration(token) {
  const match = String(token || '').trim().toLowerCase().match(/^(\d+)(s|m|h|d)$/)
  if (!match) return 0
  const value = Number(match[1])
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]]
  return value * mult
}

function startReminderScheduler(getSocket, logger) {
  if (schedulerInterval) clearInterval(schedulerInterval)
  schedulerInterval = setInterval(async () => {
    const sock = getSocket()
    if (!sock) return
    const items = loadReminders()
    if (!items.length) return
    const now = Date.now()
    const due = items.filter((item) => item.dueAt <= now)
    if (!due.length) return
    const remaining = items.filter((item) => item.dueAt > now)
    saveReminders(remaining)
    for (const item of due) {
      try {
        await sock.sendMessage(item.jid, { text: `⏰ *Reminder:* ${item.text}` })
      } catch (error) {
        if (logger) logger.warn({ err: error }, 'Could not deliver scheduled reminder')
      }
    }
  }, 5000)
  schedulerInterval.unref?.()
}

module.exports = {
  command: ['remind', 'reminders', 'delremind'],
  category: 'tools',
  description: 'schedule persistent reminders that survive bot restarts',
  startReminderScheduler,

  async execute({ socket, message, jid, args, command, prefix }) {
    const items = loadReminders()

    if (command === 'reminders') {
      const mine = items.filter((i) => i.jid === jid)
      if (!mine.length) {
        await socket.sendMessage(jid, {
          text: `No active reminders in this chat.\nExample: *${prefix}remind 15m Check the oven*`
        }, { quoted: message })
        return
      }
      const lines = mine.map((i) => {
        const mins = Math.max(1, Math.round((i.dueAt - Date.now()) / 60000))
        return `• *#${i.id}* (in ~${mins}m): ${i.text}`
      })
      await socket.sendMessage(jid, { text: `⏰ *Active Reminders*\n\n${lines.join('\n')}` }, { quoted: message })
      return
    }

    if (command === 'delremind') {
      const id = String(args[0] || '').replace(/^#/, '')
      const next = items.filter((i) => !(i.jid === jid && String(i.id) === id))
      if (next.length === items.length) {
        await socket.sendMessage(jid, { text: `Reminder #${id || '?'} not found in this chat.` }, { quoted: message })
        return
      }
      saveReminders(next)
      await socket.sendMessage(jid, { text: `🗑️ Cancelled reminder #${id}.` }, { quoted: message })
      return
    }

    const ms = parseDuration(args[0])
    const text = args.slice(1).join(' ').trim()
    if (!ms || ms < 5000 || ms > 30 * 86400000 || !text) {
      await socket.sendMessage(jid, {
        text: `Usage: *${prefix}remind <time> <message>*\nExamples:\n• ${prefix}remind 10m Take a break\n• ${prefix}remind 2h Join the meeting\n• ${prefix}remind 1d Pay rent`
      }, { quoted: message })
      return
    }

    const id = String(Date.now()).slice(-5)
    items.push({ id, jid, text: text.slice(0, 500), dueAt: Date.now() + ms })
    saveReminders(items)
    await socket.sendMessage(jid, {
      text: `⏰ Reminder *#${id}* set for *${args[0]}* from now: _${text.slice(0, 500)}_`
    }, { quoted: message })
  }
}
