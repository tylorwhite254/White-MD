'use strict'

// Commands built on the public, no-key APIs that were tested as working in the owner's other bots:
// agify / nationalize / genderize, Zippopotam, Spaceflight News, QR Server, Google Translate with
// MyMemory as backup, and the tmpfiles / uguu / x0.at / qu.ax / pomf file hosts.

const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const { request, json } = require('../lib/http')

const MAX_MEDIA_BYTES = Number(process.env.MAX_MEDIA_BYTES || 50 * 1024 * 1024)

const COMMANDS = [
  'guessage', 'agify', 'nationality', 'nationalize', 'nameinfo',
  'zip', 'zipcode', 'postcode',
  'spacenews', 'spaceflight',
  'readqr', 'scanqr',
  'translate2', 'gtr',
  'tourl', 'tmpfiles', 'uguu', 'x0', 'quax', 'pomf'
]

function quotedMessage(message, jid) {
  const context = message?.message?.extendedTextMessage?.contextInfo
  if (!context?.quotedMessage) return null
  return {
    key: { remoteJid: jid, fromMe: false, id: context.stanzaId || `white-md-${Date.now()}`, participant: context.participant },
    message: context.quotedMessage
  }
}

function mediaInfo(message) {
  const content = message?.message || {}
  for (const [type, ext] of [['imageMessage', '.jpg'], ['videoMessage', '.mp4'], ['audioMessage', '.mp3'], ['stickerMessage', '.webp'], ['documentMessage', null]]) {
    const media = content[type]
    if (!media) continue
    const name = media.fileName || `white-md-media${ext || '.bin'}`
    return { type, filename: name.replace(/[^a-z0-9._-]/gi, '_').slice(0, 120), mimetype: media.mimetype || 'application/octet-stream' }
  }
  return null
}

async function loadMedia({ socket, message, jid, logger }, imageOnly = false) {
  const target = mediaInfo(message) ? message : quotedMessage(message, jid)
  const info = mediaInfo(target)
  if (!target || !info) return null
  if (imageOnly && info.type !== 'imageMessage') return null
  const buffer = await downloadMediaMessage(target, 'buffer', {}, socket, { logger })
  if (!buffer?.length) throw new Error('The media is empty or unavailable')
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error(`The media exceeds the ${Math.floor(MAX_MEDIA_BYTES / 1024 / 1024)} MB limit`)
  return { buffer, info }
}

async function postFile(url, field, { buffer, info }, label) {
  const form = new FormData()
  form.append(field, new Blob([buffer], { type: info.mimetype }), info.filename)
  const response = await request(url, { method: 'POST', headers: { 'user-agent': 'White-MD' }, body: form }, { retries: 1, timeoutMs: 60000, label })
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`)
  return response
}

const HOSTS = {
  tmpfiles: {
    label: 'tmpfiles.org',
    note: 'kept for about 1 hour',
    async upload(media) {
      const data = await (await postFile('https://tmpfiles.org/api/v1/upload', 'file', media, 'tmpfiles.org')).json()
      return String(data?.data?.url || '').replace('tmpfiles.org/', 'tmpfiles.org/dl/')
    }
  },
  uguu: {
    label: 'uguu.se',
    note: 'kept for about 3 hours',
    async upload(media) {
      const data = await (await postFile('https://uguu.se/upload.php', 'files[]', media, 'uguu.se')).json()
      return data?.files?.[0]?.url
    }
  },
  x0: {
    label: 'x0.at',
    note: 'kept for days to months, depending on size',
    async upload(media) {
      return (await (await postFile('https://x0.at/', 'file', media, 'x0.at')).text()).trim()
    }
  },
  quax: {
    label: 'qu.ax',
    note: 'kept for about 30 days',
    async upload(media) {
      const data = await (await postFile('https://qu.ax/upload.php', 'files[]', media, 'qu.ax')).json()
      return data?.files?.[0]?.url
    }
  },
  pomf: {
    label: 'pomf2.lain.la',
    note: 'long-term hosting',
    async upload(media) {
      const data = await (await postFile('https://pomf2.lain.la/upload.php', 'files[]', media, 'pomf2.lain.la')).json()
      return data?.files?.[0]?.url
    }
  }
}

const REGION_NAMES = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null
function countryName(code) {
  try {
    return REGION_NAMES?.of(code) || code
  } catch {
    return code
  }
}

async function translate(text, target) {
  try {
    const data = await json(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`, {}, { label: 'Google Translate', retries: 1 })
    const out = (data?.[0] || []).map((part) => part?.[0] || '').join('')
    if (out) return { text: out, from: data?.[2] || 'auto', provider: 'Google Translate' }
  } catch {
    // fall through to the backup provider
  }
  const data = await json(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=${encodeURIComponent(`en|${target}`)}`, {}, { label: 'MyMemory', retries: 1 })
  const out = data?.responseData?.translatedText
  if (!out) throw new Error('No translation was returned')
  return { text: out, from: 'en', provider: 'MyMemory' }
}

module.exports = {
  command: COMMANDS,
  description: 'name guesses, postcode lookup, space news, QR reader, translation and file hosts',
  // These replies are instructions or results, not choices, so no buttons are added to them.
  noAutoButtons: true,

  async execute(ctx) {
    const { socket, jid, args, command, message, prefix } = ctx
    const reply = (text) => socket.sendMessage(jid, { text }, { quoted: message })
    const input = args.join(' ').trim()

    if (['guessage', 'agify', 'nationality', 'nationalize', 'nameinfo'].includes(command)) {
      const name = (args[0] || '').replace(/[^\p{L}'-]/gu, '')
      if (!name) return reply(`Usage: ${prefix}${command} <first name>\nExample: ${prefix}${command} Brian`)
      const q = encodeURIComponent(name)
      const wantAge = command !== 'nationality' && command !== 'nationalize'
      const wantNation = command !== 'guessage' && command !== 'agify'
      const [age, nation, gender] = await Promise.all([
        wantAge ? json(`https://api.agify.io/?name=${q}`, {}, { label: 'agify.io' }) : null,
        wantNation ? json(`https://api.nationalize.io/?name=${q}`, {}, { label: 'nationalize.io' }) : null,
        command === 'nameinfo' ? json(`https://api.genderize.io/?name=${q}`, {}, { label: 'genderize.io' }).catch(() => null) : null
      ])
      const lines = [`*Name:* ${name}`]
      if (age) lines.push(`*Likely age:* ${age.age ?? 'unknown'}`)
      if (gender?.gender) lines.push(`*Likely gender:* ${gender.gender} (${Math.round((gender.probability || 0) * 100)}%)`)
      if (nation) {
        const top = (nation.country || []).slice(0, 3)
        lines.push(top.length
          ? `*Likely from:*\n${top.map((c) => `• ${countryName(c.country_id)} (${Math.round(c.probability * 100)}%)`).join('\n')}`
          : '*Likely from:* unknown')
      }
      lines.push('\n_A statistical guess from the name only._')
      return reply(lines.join('\n'))
    }

    if (['zip', 'zipcode', 'postcode'].includes(command)) {
      let [country, ...rest] = args
      let code = rest.join(' ')
      if (country && !code) {
        code = country
        country = 'us'
      }
      if (!code) return reply(`Usage: ${prefix}${command} <country code> <postcode>\nExample: ${prefix}${command} us 90210`)
      const response = await request(`https://api.zippopotam.us/${encodeURIComponent(country.toLowerCase())}/${encodeURIComponent(code)}`, {}, { label: 'Zippopotam' })
      if (response.status === 404) return reply(`No place found for ${code} in ${country.toUpperCase()}. This lookup does not cover every country.`)
      if (!response.ok) throw new Error(`Zippopotam returned HTTP ${response.status}`)
      const data = await response.json()
      const places = (data.places || []).slice(0, 5).map((place) => `• ${place['place name']}${place.state ? `, ${place.state}` : ''} (${place.latitude}, ${place.longitude})`)
      return reply(`*Postcode ${data['post code']}* — ${data.country}\n${places.join('\n')}`)
    }

    if (['spacenews', 'spaceflight'].includes(command)) {
      const data = await json('https://api.spaceflightnewsapi.net/v4/articles/?limit=5', {}, { label: 'Spaceflight News' })
      const items = (data.results || []).map((item, index) => `*${index + 1}. ${item.title}*\n${item.news_site} — ${String(item.published_at || '').slice(0, 10)}\n${item.url}`)
      if (!items.length) throw new Error('No articles were returned')
      return reply(`🚀 *Latest space news*\n\n${items.join('\n\n')}`)
    }

    if (['readqr', 'scanqr'].includes(command)) {
      const media = await loadMedia(ctx, true)
      if (!media) return reply(`Send or reply to an image of a QR code with ${prefix}${command}.`)
      const data = await (await postFile('https://api.qrserver.com/v1/read-qr-code/', 'file', media, 'QR reader')).json()
      const symbol = data?.[0]?.symbol?.[0]
      if (!symbol?.data) return reply(`I could not read a QR code in that image${symbol?.error ? `: ${symbol.error}` : '.'}`)
      return reply(`*QR code says:*\n${symbol.data}`)
    }

    if (['translate2', 'gtr'].includes(command)) {
      const target = (args[0] || '').toLowerCase()
      const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage
      const text = args.slice(1).join(' ').trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || ''
      if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(target) || !text) {
        return reply(`Usage: ${prefix}${command} <language code> <text>\nExample: ${prefix}${command} sw Good morning\nYou can also reply to a message with ${prefix}${command} sw`)
      }
      const result = await translate(text, target)
      return reply(`*${result.from} → ${target}*\n${result.text}\n\n_${result.provider}_`)
    }

    // File hosts: .tourl tries each host in turn, .tmpfiles / .uguu / .x0 / .quax / .pomf use one host.
    const names = Object.keys(HOSTS)
    const picked = HOSTS[command] ? command : (HOSTS[(args[0] || '').toLowerCase()] ? args[0].toLowerCase() : null)
    const media = await loadMedia(ctx)
    if (!media) {
      return reply(`Reply to an image, video, audio, sticker or document with ${prefix}tourl to get a public link.\n\nTo choose where it is stored, reply with one of:\n${names.map((name) => `${prefix}${name} — ${HOSTS[name].label}, ${HOSTS[name].note}`).join('\n')}\n\nLinks are public: anyone with the link can open the file.`)
    }
    const order = picked ? [picked] : ['quax', 'pomf', 'x0', 'uguu', 'tmpfiles']
    let hostKey = null
    let url = ''
    let lastError = null
    for (const name of order) {
      try {
        const result = await HOSTS[name].upload(media)
        if (/^https?:\/\//i.test(String(result || ''))) {
          hostKey = name
          url = result
          break
        }
        lastError = new Error(`${HOSTS[name].label} returned no link`)
      } catch (error) {
        lastError = error
      }
    }
    if (!hostKey) throw lastError || new Error('No file host accepted the upload')
    return reply(`*Public link* (${HOSTS[hostKey].label}, ${HOSTS[hostKey].note}):\n${url}`)
  }
}
