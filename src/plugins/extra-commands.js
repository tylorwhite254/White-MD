'use strict'

const crypto = require('node:crypto')
const { dataPath, readJsonSafe, writeJsonAtomic, scheduleRemoteBackup } = require('../lib/storage')
const {
  normalizeNumber,
  isSudoUser,
  listBannedUsers,
  listBannedGroups,
  listSudoUsers,
  isAntiDmEnabled,
  isAntiCallEnabled,
  getCooldownSeconds,
  getMaintenance,
  listDmContacts
} = require('../lib/access-control')

const AUTOREPLY_FILE = dataPath('autoreply.json')
const TODOS_FILE = dataPath('todos.json')

function loadAutoReply() {
  const raw = readJsonSafe(AUTOREPLY_FILE, {})
  return {
    enabled: Boolean(raw?.enabled),
    rules: raw && typeof raw.rules === 'object' && !Array.isArray(raw.rules) ? raw.rules : {}
  }
}

function saveAutoReply(data) {
  writeJsonAtomic(AUTOREPLY_FILE, data)
  scheduleRemoteBackup()
}

function loadTodos() {
  const raw = readJsonSafe(TODOS_FILE, {})
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

function saveTodos(data) {
  writeJsonAtomic(TODOS_FILE, data)
  scheduleRemoteBackup()
}

function isOwnerOrSudo(message, jid, config) {
  if (message?.key?.fromMe) return true
  const sender = message?.key?.participant || jid
  const ownerNum = normalizeNumber(config?.ownerNumber || process.env.OWNER_NUMBER || '')
  return (ownerNum && normalizeNumber(sender) === ownerNum) || isSudoUser(sender)
}

function formatDuration(sec) {
  sec = Math.floor(sec)
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ')
}

function parseTimerDuration(token = '') {
  const match = String(token).trim().toLowerCase().match(/^(\d+)(s|m|h)$/)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  const mult = match[2] === 'h' ? 3600 : match[2] === 'm' ? 60 : 1
  const ms = amount * mult * 1000
  if (ms < 5000 || ms > 12 * 3600 * 1000) return null
  return ms
}

function cleanTrackingUrl(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  const dropPrefixes = ['utm_', 'mc_', 'fbclid', 'gclid', 'igshid', 'si', 'ref', 'ref_src', 'spm']
  for (const key of Array.from(url.searchParams.keys())) {
    const lower = key.toLowerCase()
    if (dropPrefixes.some((p) => lower === p || lower.startsWith(p))) {
      url.searchParams.delete(key)
    }
  }
  return url.toString()
}

async function handleAutoReply(socket, message, jid, text, prefix) {
  if (!text || message?.key?.fromMe || text.startsWith(prefix)) return false
  const ar = loadAutoReply()
  if (!ar.enabled) return false
  const key = text.trim().toLowerCase()
  const response = ar.rules[key]
  if (!response) return false
  await socket.sendMessage(jid, { text: response }, { quoted: message })
  return true
}

module.exports = {
  command: [
    'stats', 'botstats',
    'saydm', 'senddm', 'bcdm',
    'autoreply',
    'todo', 'timer',
    'password', 'genpass',
    'choose', 'coin', 'cleanlink'
  ],
  description: 'Bot stats dashboard, DM messaging/broadcast, keyword auto-reply, to-do list, timer, password generator, and utilities',
  handleAutoReply,

  async execute({ socket, message, jid, args, command, prefix, config }) {
    const reply = (text, extra = {}) => socket.sendMessage(jid, { text, ...extra }, { quoted: message })
    const sender = message?.key?.participant || jid
    const senderKey = normalizeNumber(sender) || jid

    switch (command) {
      case 'stats':
      case 'botstats': {
        const memMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1)
        const bannedUsersCount = Object.keys(listBannedUsers()).length
        const bannedGroupsCount = Object.keys(listBannedGroups()).length
        const sudoCount = listSudoUsers().length
        const dmContactsCount = listDmContacts().length
        const maint = getMaintenance()
        const ar = loadAutoReply()
        return reply(
          `📊 *${config.botName || 'White MD'} Dashboard*\n\n` +
          `⏱️ *Uptime:* ${formatDuration(process.uptime())}\n` +
          `💾 *RAM:* ${memMb} MB (Node ${process.version})\n` +
          `⚡ *Prefix:* ${prefix}\n` +
          `🌐 *Mode:* ${config.getBotMode ? config.getBotMode() : 'public'}\n` +
          `🚫 *Banned Users:* ${bannedUsersCount}\n` +
          `🔇 *Muted Groups:* ${bannedGroupsCount}\n` +
          `👑 *Sudo Admins:* ${sudoCount}\n` +
          `💬 *Known DM Contacts:* ${dmContactsCount}\n` +
          `🛡️ *Anti-DM:* ${isAntiDmEnabled() ? 'ON' : 'OFF'}\n` +
          `📵 *Anti-Call:* ${isAntiCallEnabled() ? 'ON' : 'OFF'}\n` +
          `⏳ *Cooldown:* ${getCooldownSeconds()}s\n` +
          `🤖 *Auto-Reply:* ${ar.enabled ? `ON (${Object.keys(ar.rules).length} rules)` : 'OFF'}\n` +
          `🛠️ *Maintenance:* ${maint.enabled ? 'ON' : 'OFF'}`
        )
      }

      case 'saydm':
      case 'senddm': {
        if (!isOwnerOrSudo(message, jid, config)) return reply('🔒 Owner/sudo only.')
        const num = normalizeNumber(args[0] || '')
        const body = args.slice(1).join(' ').trim()
        if (!num || num.length < 7 || !body) {
          return reply(`Usage: *${prefix}${command} 2547XXXXXXXX Your message here*`)
        }
        await socket.sendMessage(`${num}@s.whatsapp.net`, { text: body })
        return reply(`✅ Message sent to +${num}.`)
      }

      case 'bcdm': {
        if (!isOwnerOrSudo(message, jid, config)) return reply('🔒 Owner/sudo only.')
        const body = args.join(' ').trim()
        if (!body) return reply(`Usage: *${prefix}bcdm Your broadcast message*`)
        const contacts = listDmContacts()
        if (!contacts.length) return reply('No saved DM contacts yet. Contacts are saved automatically when people message the bot.')
        let sent = 0
        for (const targetJid of contacts) {
          try {
            await socket.sendMessage(targetJid, { text: `📢 *Broadcast*\n\n${body}` })
            sent++
          } catch {
            // Skip unreachable contacts
          }
          await new Promise((r) => setTimeout(r, 1200))
        }
        return reply(`✅ DM broadcast sent to ${sent}/${contacts.length} contacts.`)
      }

      case 'autoreply': {
        if (!isOwnerOrSudo(message, jid, config)) return reply('🔒 Owner/sudo only.')
        const sub = String(args[0] || '').toLowerCase()
        const ar = loadAutoReply()
        if (sub === 'on' || sub === 'off') {
          ar.enabled = sub === 'on'
          saveAutoReply(ar)
          return reply(`✅ Auto-reply is now *${ar.enabled ? 'ON' : 'OFF'}*.`)
        }
        if (sub === 'add') {
          const joined = args.slice(1).join(' ')
          const sep = joined.indexOf('|')
          if (sep === -1) {
            return reply(`Usage: *${prefix}autoreply add trigger | reply text*\nExample: *${prefix}autoreply add price | Our plans start at $10!*`)
          }
          const trigger = joined.slice(0, sep).trim().toLowerCase()
          const answer = joined.slice(sep + 1).trim()
          if (!trigger || !answer) return reply('Both trigger and reply text are required.')
          ar.rules[trigger] = answer
          ar.enabled = true
          saveAutoReply(ar)
          return reply(`✅ Auto-reply saved for *"${trigger}"* (Auto-reply enabled).`)
        }
        if (sub === 'del' || sub === 'delete' || sub === 'remove') {
          const trigger = args.slice(1).join(' ').trim().toLowerCase()
          if (!trigger || !ar.rules[trigger]) return reply(`No auto-reply found for "${trigger}".`)
          delete ar.rules[trigger]
          saveAutoReply(ar)
          return reply(`🗑️ Deleted auto-reply for *"${trigger}"*.`)
        }
        if (sub === 'list' || !sub) {
          const entries = Object.entries(ar.rules)
          const status = `🤖 *Auto-Reply:* ${ar.enabled ? 'ON' : 'OFF'}`
          if (!entries.length) {
            return reply(`${status}\n\nNo rules yet.\nAdd one: *${prefix}autoreply add hi | Hello! Type ${prefix}menu to start.*`)
          }
          const list = entries.map(([k, v], i) => `${i + 1}. *${k}* → ${v.slice(0, 80)}`).join('\n')
          return reply(`${status}\n\n${list}`)
        }
        return reply(`Usage: *${prefix}autoreply on|off|list|add <trigger> | <reply>|del <trigger>*`)
      }

      case 'todo': {
        const sub = String(args[0] || 'list').toLowerCase()
        const all = loadTodos()
        const items = Array.isArray(all[senderKey]) ? all[senderKey] : []

        if (sub === 'add') {
          const task = args.slice(1).join(' ').trim()
          if (!task) return reply(`Usage: *${prefix}todo add Buy groceries*`)
          if (items.length >= 30) return reply('You have 30 tasks already. Complete or delete some first.')
          items.push({ text: task.slice(0, 200), done: false })
          all[senderKey] = items
          saveTodos(all)
          return reply(`✅ Added task #${items.length}: ${task}`)
        }
        if (sub === 'done' || sub === 'check') {
          const idx = Number(args[1]) - 1
          if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) {
            return reply(`Usage: *${prefix}todo done <number>*`)
          }
          items[idx].done = !items[idx].done
          all[senderKey] = items
          saveTodos(all)
          return reply(`${items[idx].done ? '☑️' : '⬜'} Task #${idx + 1}: ${items[idx].text}`)
        }
        if (sub === 'del' || sub === 'remove') {
          const idx = Number(args[1]) - 1
          if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) {
            return reply(`Usage: *${prefix}todo del <number>*`)
          }
          const [removed] = items.splice(idx, 1)
          all[senderKey] = items
          saveTodos(all)
          return reply(`🗑️ Removed task: ${removed.text}`)
        }
        if (sub === 'clear') {
          all[senderKey] = []
          saveTodos(all)
          return reply('🧹 Cleared your to-do list.')
        }
        if (!items.length) {
          return reply(`📝 Your to-do list is empty.\nAdd a task with *${prefix}todo add <task>*`)
        }
        const formatted = items.map((t, i) => `${t.done ? '☑️' : '⬜'} ${i + 1}. ${t.text}`).join('\n')
        return reply(`📝 *Your To-Do List*\n\n${formatted}\n\nCommands: *${prefix}todo add*, *${prefix}todo done <n>*, *${prefix}todo del <n>*, *${prefix}todo clear*`)
      }

      case 'timer': {
        const ms = parseTimerDuration(args[0])
        if (!ms) {
          return reply(`Usage: *${prefix}timer 5m Tea is ready*\nSupports 5s up to 12h (e.g. 30s, 10m, 1h).`)
        }
        const label = args.slice(1).join(' ').trim() || 'Timer finished!'
        await reply(`⏱️ Timer set for *${args[0]}*: ${label}`)
        setTimeout(() => {
          socket.sendMessage(jid, {
            text: `⏰ *Timer Done!*\n\n${label}`,
            mentions: sender ? [sender] : []
          }).catch(() => {})
        }, ms).unref?.()
        return
      }

      case 'password':
      case 'genpass': {
        const len = Math.max(8, Math.min(48, Number(args[0]) || 16))
        const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*_-'
        const bytes = crypto.randomBytes(len)
        let out = ''
        for (let i = 0; i < len; i++) out += charset[bytes[i] % charset.length]
        return reply(`🔐 *Generated Password (${len} chars)*\n\n\`${out}\``)
      }

      case 'choose': {
        const raw = args.join(' ')
        const options = raw.split(/\s*\|\s*|\s*,\s*/).map((s) => s.trim()).filter(Boolean)
        if (options.length < 2) {
          return reply(`Usage: *${prefix}choose pizza | burger | pasta*`)
        }
        const pick = options[crypto.randomInt(options.length)]
        return reply(`🎯 I pick: *${pick}*`)
      }

      case 'coin': {
        const side = crypto.randomInt(2) === 0 ? 'Heads 🪙' : 'Tails 🪙'
        return reply(`Flipping a coin... *${side}*`)
      }

      case 'cleanlink': {
        const cleaned = cleanTrackingUrl(args[0] || '')
        if (!cleaned) return reply(`Usage: *${prefix}cleanlink https://example.com?utm_source=...*`)
        return reply(`🔗 *Cleaned Link:*\n${cleaned}`)
      }
    }
  }
}
