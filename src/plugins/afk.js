'use strict'

const { dataPath, readJsonSafe, writeJsonAtomic, scheduleRemoteBackup } = require('../lib/storage')

const AFK_FILE = dataPath('afk.json')

function loadAfk() {
  return readJsonSafe(AFK_FILE, {})
}

function saveAfk(data) {
  writeJsonAtomic(AFK_FILE, data)
  scheduleRemoteBackup()
}

function senderKey(message, jid) {
  const raw = message?.key?.participant || jid || ''
  return String(raw).split(':')[0].split('@')[0]
}

function formatAgo(ms) {
  const sec = Math.max(1, Math.floor(ms / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  const rem = min % 60
  return rem ? `${hr}h ${rem}m` : `${hr}h`
}

async function handleAfkMessage(socket, message, jid, text, prefix) {
  const all = loadAfk()
  if (!Object.keys(all).length) return

  const senderNum = senderKey(message, jid)
  const isAfkCmd = text.toLowerCase().startsWith(`${prefix}afk`)

  // Clear sender's AFK if they speak (and aren't setting AFK right now)
  if (senderNum && all[senderNum] && !isAfkCmd) {
    const entry = all[senderNum]
    delete all[senderNum]
    saveAfk(all)
    await socket.sendMessage(jid, {
      text: `👋 Welcome back! Your AFK status (away for ${formatAgo(Date.now() - entry.since)}) has been cleared.`
    }, { quoted: message })
  }

  // Notify if someone mentioned or replied to an AFK user
  const ctx = message?.message?.extendedTextMessage?.contextInfo
  const targets = new Set()
  for (const m of ctx?.mentionedJid || []) targets.add(String(m).split(':')[0].split('@')[0])
  if (ctx?.participant) targets.add(String(ctx.participant).split(':')[0].split('@')[0])
  if (!jid.endsWith('@g.us') && !message?.key?.fromMe) {
    const botNum = String(socket?.user?.id || '').split(':')[0].split('@')[0]
    if (botNum) targets.add(botNum)
  }

  for (const num of targets) {
    if (num && num !== senderNum && all[num]) {
      const entry = all[num]
      await socket.sendMessage(jid, {
        text: `💤 That user is currently *AFK* (${formatAgo(Date.now() - entry.since)} ago).\n*Reason:* ${entry.reason}`
      }, { quoted: message })
      break
    }
  }
}

module.exports = {
  command: 'afk',
  category: 'tools',
  description: 'set a persistent AFK auto-reply status',
  handleAfkMessage,

  async execute({ socket, message, jid, args }) {
    const key = senderKey(message, jid)
    if (!key) return
    const reason = args.join(' ').trim() || 'Away from keyboard'
    const all = loadAfk()
    all[key] = { reason: reason.slice(0, 300), since: Date.now() }
    saveAfk(all)
    await socket.sendMessage(jid, {
      text: `💤 You are now *AFK*.\n*Reason:* ${all[key].reason}\n\nSend any message later to turn AFK off.`
    }, { quoted: message })
  }
}
