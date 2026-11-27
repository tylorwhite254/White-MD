'use strict'

const { askChatGPT } = require('../lib/chatgpt')
const { request } = require('../lib/http')

const NEKOS_API = process.env.NEKOS_API_URL || 'https://nekos.best/api/v2'

function usage(command, text) {
  return `Usage: .${command} ${text}`
}

function parseDate(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})$/)
  if (!match) return null
  let year, month, day
  const a = Number(match[1])
  const b = Number(match[2])
  const c = Number(match[3])
  if (String(match[1]).length === 4) {
    year = a; month = b; day = c
  } else {
    month = a; day = b; year = c < 100 ? c + 2000 : c
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

function ageFromDate(date) {
  const now = new Date()
  let years = now.getUTCFullYear() - date.getUTCFullYear()
  let months = now.getUTCMonth() - date.getUTCMonth()
  let days = now.getUTCDate() - date.getUTCDate()
  if (days < 0) {
    months -= 1
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate()
    days += previousMonth
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  const milliseconds = Date.now() - date.getTime()
  return {
    years: Math.max(0, years),
    months: Math.max(0, years * 12 + months),
    days: Math.max(0, Math.floor(milliseconds / 86400000)),
    weeks: Math.max(0, Math.floor(milliseconds / 604800000)),
    hours: Math.max(0, Math.floor(milliseconds / 3600000)),
    minutes: Math.max(0, Math.floor(milliseconds / 60000)),
    seconds: Math.max(0, Math.floor(milliseconds / 1000)),
    remainderMonths: Math.max(0, months),
    remainderDays: Math.max(0, days)
  }
}

async function animeImage(command) {
  const response = await request(`${NEKOS_API}/${command}`, {}, { label: `Nekos.best ${command}`, resource: NEKOS_API })
  if (!response.ok) throw new Error(`Anime image API returned HTTP ${response.status}`)
  const data = await response.json()
  const image = data?.results?.[0]?.url
  if (!image) throw new Error('Anime image API returned no image')
  return image
}

async function googleTts(text, lang = 'en') {
  const response = await request(
    `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 300))}&tl=${encodeURIComponent(lang)}&client=tw-ob`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
    { label: 'Google text-to-speech', resource: 'https://translate.google.com' }
  )
  if (!response.ok) throw new Error(`Google TTS returned HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function groupInfo(socket, jid, args) {
  const link = args.join(' ').trim()
  if (!link || !link.includes('chat.whatsapp.com/')) throw new Error('Usage: .ginfo https://chat.whatsapp.com/INVITE_CODE')
  const code = link.split('chat.whatsapp.com/')[1].split('?')[0].trim()
  const invite = await socket.groupGetInviteInfo(code)
  if (!invite?.id) throw new Error('The invite is invalid, expired, or inaccessible')
  const metadata = await socket.groupMetadata(invite.id).catch(() => null)
  const participants = metadata?.participants || []
  const admins = participants.filter((participant) => participant.admin)
  return [
    `*Group information*`,
    `Name: ${metadata?.subject || invite.subject || 'Unknown'}`,
    `JID: ${invite.id}`,
    `Participants: ${participants.length || invite.size || 0}`,
    `Admins: ${admins.length}`,
    `Description: ${metadata?.desc || invite.desc || 'None'}`
  ].join('\n')
}

module.exports = {
  command: [
    'guide', 'tutorial', 'howto', 'usagetip',
    'poll',
    'agecalculator', 'age', 'calcage',
    'guessgender', 'gender',
    'ai-search', 'ais', 'searchai',
    'aiv', 'aivoice', 'voiceai', 'aisv',
    'kitsune', 'fox', 'foxgirl', 'kitsunepic',
    'husbando', 'husbandopic', 'animeboy',
    'ginfo', 'groupinfo'
  ],
  description: 'safe commands inspired by public bot menus',

  async execute({ socket, jid, args, command, message, logger }) {
    try {
      if (['guide', 'tutorial', 'howto', 'usagetip'].includes(command)) {
        await socket.sendMessage(jid, {
          text: [
            '*White MD guide*',
            '',
            'Downloads: .play, .song, .ytmp3, .ytmp4, .spotify, .tiktok',
            'AI: .chatgpt, .ai-search, .aiv',
            'Tools: .poll, .agecalculator, .guessgender, .ginfo',
            'Anime: .cuddle, .hug, .kiss, .kitsune, .husbando, .neko',
            '',
            'Use .menu for the complete categorized command list.'
          ].join('\n')
        }, { quoted: message })
        return
      }

      if (command === 'poll') {
        const parts = args.join(' ').split(';').map((part) => part.trim()).filter(Boolean)
        const name = parts.shift()
        if (!name || parts.length < 2) {
          await socket.sendMessage(jid, { text: usage('poll', 'Question;Option 1;Option 2') }, { quoted: message })
          return
        }
        await socket.sendMessage(jid, { poll: { name, values: parts.slice(0, 12), selectableCount: 1 } }, { quoted: message })
        return
      }

      if (['agecalculator', 'age', 'calcage'].includes(command)) {
        const date = parseDate(args.join(' '))
        if (!date) {
          await socket.sendMessage(jid, { text: usage(command, 'MM/DD/YYYY') }, { quoted: message })
          return
        }
        const age = ageFromDate(date)
        await socket.sendMessage(jid, {
          text: `*Age calculation*\nYears: ${age.years}\nMonths: ${age.months}\nDays: ${age.days}\nWeeks: ${age.weeks}\n\nCalendar age: ${age.years} years, ${age.remainderMonths} months, ${age.remainderDays} days.`
        }, { quoted: message })
        return
      }

      if (['guessgender', 'gender'].includes(command)) {
        const name = args.join(' ').trim()
        if (!name) {
          await socket.sendMessage(jid, { text: usage(command, 'first name') }, { quoted: message })
          return
        }
        const endpoint = `https://api.genderize.io/?name=${encodeURIComponent(name.split(/\s+/)[0])}`
        const response = await request(endpoint, {}, { label: 'Genderize API', resource: endpoint })
        if (!response.ok) throw new Error(`Genderize returned HTTP ${response.status}`)
        const data = await response.json()
        if (!data?.gender) {
          await socket.sendMessage(jid, { text: 'No prediction was available for that name.' }, { quoted: message })
          return
        }
        await socket.sendMessage(jid, {
          text: `*Name prediction*\nName: ${data.name}\nPrediction: ${data.gender}\nProbability: ${(Number(data.probability || 0) * 100).toFixed(1)}%\n\nThis is a statistical estimate, not a fact about an individual.`
        }, { quoted: message })
        return
      }

      if (['ai-search', 'ais', 'searchai'].includes(command)) {
        const query = args.join(' ').trim()
        if (!query) {
          await socket.sendMessage(jid, { text: usage(command, 'your question') }, { quoted: message })
          return
        }
        const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
        const response = await request(endpoint, {}, { label: 'DuckDuckGo instant answer', resource: endpoint })
        const data = response.ok ? await response.json() : {}
        const answer = data.AbstractText || data.Answer || data.RelatedTopics?.find((item) => item.Text)?.Text
        const text = answer || await askChatGPT(`Answer this search-style question concisely and state uncertainty when needed: ${query}`)
        await socket.sendMessage(jid, { text: `*AI search*\n\n${String(text).slice(0, 4000)}` }, { quoted: message })
        return
      }

      if (['aiv', 'aivoice', 'voiceai', 'aisv'].includes(command)) {
        const query = args.join(' ').trim()
        if (!query) {
          await socket.sendMessage(jid, { text: usage(command, 'your question') }, { quoted: message })
          return
        }
        const answer = String(await askChatGPT(query)).slice(0, 300)
        const audio = await googleTts(answer, process.env.TTS_LANG || 'en')
        await socket.sendMessage(jid, { audio, mimetype: 'audio/mpeg', fileName: 'white-md-ai-response.mp3', ptt: false }, { quoted: message })
        return
      }

      if (['kitsune', 'fox', 'foxgirl', 'kitsunepic', 'husbando', 'husbandopic', 'animeboy'].includes(command)) {
        const endpoint = command.startsWith('hus') || command === 'animeboy' ? 'husbando' : 'kitsune'
        const image = await animeImage(endpoint)
        await socket.sendMessage(jid, { image: { url: image }, caption: endpoint === 'husbando' ? 'White MD • Husbando' : 'White MD • Kitsune' }, { quoted: message })
        return
      }

      if (['ginfo', 'groupinfo'].includes(command)) {
        const text = await groupInfo(socket, jid, args)
        await socket.sendMessage(jid, { text }, { quoted: message })
      }
    } catch (error) {
      logger.error({ err: error, command }, 'Inspired safe command failed')
      await socket.sendMessage(jid, { text: `The .${command} command is unavailable right now: ${error.message}` }, { quoted: message })
    }
  }
}
