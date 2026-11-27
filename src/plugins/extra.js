const API_ROOT = process.env.KNIGHT_API_ROOT || 'https://knightbotapi.stream/api'
const API_KEY = process.env.KNIGHT_API_KEY || 'knight'
const API_FALLBACK_ROOT = process.env.KNIGHT_API_FALLBACK_ROOT || ''
const API_FALLBACK_KEY = process.env.KNIGHT_API_FALLBACK_KEY || API_KEY
const { askChatGPT } = require('../lib/chatgpt')
const { askProvider } = require('../lib/ai-providers')
const { request } = require('../lib/http')
const MAX_MEDIA_BYTES = Number(process.env.MAX_MEDIA_BYTES || 50 * 1024 * 1024)
const CARD_PIC = process.env.CARD_PIC || ''
const CARD_THEME = process.env.CARD_THEME || 'dark'
const CARD_COUNT = process.env.CARD_COUNT || '128'
const CARD_AUTHOR = process.env.CARD_AUTHOR || 'Tylor White'

const COMMANDS = [
  'instagram', 'ig', 'facebook', 'fb', 'twitter', 'x', 'pinterest', 'pin',
  'ai', 'gpt', 'chatgpt', 'chatbot', 'davidgpt4o', 'davidgemini3pro', 'openrouter', 'grok', 'aiimage', 'imagine', 'dalle', 'flux', 'sora', 'text2video', 't2v', 'txt2video', 'lyrics', 'ssweb', 'screenshot', 'ss', 'trt', 'qr', 'qrcode', 'upload', 'blur',
  'welcome', 'goodbye', 'rankcard', 'quotecard', 'wanted', 'jail', 'ytcard',
  'github', 'gh', 'igstalk', 'instastalk', 'trivia', 'quiz', 'truth', 'riddle', 'quran', 'bible', 'translate', 'tr', 'weather', 'define', 'calc', 'calculate', 'calculator', 'wiki', 'currency', 'shorturl', 'urlshortener', 'npm', 'country', 'time', 'neko', 'anime', 'animequote', 'gif', 'faketweet', 'fake', 'fakemsg', 'fakereply',
  'tylorgithub', 'tylortiktok', 'tyloranime', 'tylornsfw', 'tylorytcomment'
]

function apiPath(path) {
  return `${API_ROOT}${path}`
}

function findUrl(value) {
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? value : null
  if (!value || typeof value !== 'object') return null
  for (const key of ['download', 'dl_url', 'dl', 'url', 'image', 'audio', 'video', 'link']) {
    if (typeof value[key] === 'string' && /^https?:\/\//i.test(value[key])) return value[key]
  }
  for (const child of Object.values(value)) {
    const found = findUrl(child)
    if (found) return found
  }
  return null
}

function hostMatches(value, hosts) {
  try {
    return hosts.includes(new URL(value).hostname.toLowerCase())
  } catch {
    return false
  }
}

function splitPipeArgs(args, count) {
  const values = args.join(' ').split('|').map((value) => value.trim())
  return values.length >= count ? values : []
}

async function fetchJson(endpoint, params) {
  const endpoints = [{ endpoint, key: API_KEY, label: 'KnightBot API' }]
  if (API_FALLBACK_ROOT) {
    const suffix = endpoint.startsWith(API_ROOT) ? endpoint.slice(API_ROOT.length) : ''
    endpoints.push({ endpoint: `${API_FALLBACK_ROOT.replace(/\/$/, '')}${suffix}`, key: API_FALLBACK_KEY, label: 'Fallback API' })
  }
  let lastError
  for (const candidate of endpoints) {
    try {
      const query = new URLSearchParams({ apikey: candidate.key, ...params })
      const response = await request(`${candidate.endpoint}?${query}`, {}, { label: candidate.label, resource: candidate.endpoint })
      if (!response.ok) throw new Error(`${candidate.label} returned HTTP ${response.status}`)
      const data = await response.json()
      if (!data?.success) throw new Error(`${candidate.label} returned success=false`)
      return data.result
    } catch (error) {
      lastError = error
      if (error.code !== 'RATE_LIMITED' || candidate === endpoints.at(-1)) throw error
    }
  }
  throw lastError
}

function secureImageUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value)) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

async function fetchSfwAnime() {
  const providers = [
    {
      label: 'Nekos.best SFW anime',
      endpoint: 'https://nekos.best/api/v2/waifu',
      extract: (data) => data?.results?.[0]?.url
    },
    {
      label: 'Waifu.pics SFW anime',
      endpoint: 'https://api.waifu.pics/sfw/waifu',
      extract: (data) => data?.url
    }
  ]
  let lastError
  for (const provider of providers) {
    try {
      const response = await request(provider.endpoint, {}, {
        retries: 1,
        timeoutMs: 15000,
        label: provider.label,
        resource: provider.endpoint
      })
      if (!response.ok) throw new Error(`${provider.label} returned HTTP ${response.status}`)
      const imageUrl = secureImageUrl(provider.extract(await response.json()))
      if (!imageUrl) throw new Error(`${provider.label} returned an invalid image URL`)
      return { url: imageUrl }
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`SFW anime providers are unavailable. ${lastError?.message || 'Try again later.'}`)
}

async function fetchBinary(endpoint, params) {
  const endpoints = [{ endpoint, key: API_KEY, label: 'KnightBot API' }]
  if (API_FALLBACK_ROOT) {
    const suffix = endpoint.startsWith(API_ROOT) ? endpoint.slice(API_ROOT.length) : ''
    endpoints.push({ endpoint: `${API_FALLBACK_ROOT.replace(/\/$/, '')}${suffix}`, key: API_FALLBACK_KEY, label: 'Fallback API' })
  }
  let lastError
  for (const candidate of endpoints) {
    try {
      const query = new URLSearchParams({ apikey: candidate.key, ...params })
      const response = await request(`${candidate.endpoint}?${query}`, {}, { label: candidate.label, resource: candidate.endpoint })
      if (!response.ok) throw new Error(`${candidate.label} returned HTTP ${response.status}`)
      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!buffer.length) throw new Error('API returned an empty file')
      if (buffer.length > MAX_MEDIA_BYTES) throw new Error('The returned file is too large')
      return { buffer, contentType }
    } catch (error) {
      lastError = error
      if (error.code !== 'RATE_LIMITED' || candidate === endpoints.at(-1)) throw error
    }
  }
  throw lastError
}

async function inspectMedia(url) {
  try {
    const response = await request(url, { method: 'HEAD' }, { retries: 1, timeoutMs: 15000, label: 'Media host' })
    return {
      contentType: response.headers.get('content-type') || '',
      contentLength: Number(response.headers.get('content-length') || 0)
    }
  } catch {
    return { contentType: '', contentLength: 0 }
  }
}

async function sendMediaOrText({ socket, jid, result, caption = 'White MD' }) {
  const url = findUrl(result)
  if (!url) {
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    await socket.sendMessage(jid, { text: text.slice(0, 4000) })
    return
  }

  const media = await inspectMedia(url)
  if (media.contentLength > MAX_MEDIA_BYTES) {
    await socket.sendMessage(jid, {
      text: `The returned file is too large. The limit is ${Math.floor(MAX_MEDIA_BYTES / 1024 / 1024)} MB.`
    })
    return
  }

  const type = media.contentType.toLowerCase()
  if (type.startsWith('image/')) {
    await socket.sendMessage(jid, { image: { url }, caption })
  } else if (type.startsWith('audio/')) {
    await socket.sendMessage(jid, { audio: { url }, mimetype: media.contentType, ptt: false, caption })
  } else if (type.startsWith('video/')) {
    await socket.sendMessage(jid, { video: { url }, mimetype: media.contentType, caption })
  } else {
    await socket.sendMessage(jid, { document: { url }, fileName: 'white-md-file', caption })
  }
}

function defaultPic(params) {
  if (CARD_PIC) params.pic = CARD_PIC
  if (CARD_THEME) params.theme = CARD_THEME
  params.author = CARD_AUTHOR
  return params
}

async function executeCommand(command, args) {
  const input = args[0]
  if (['instagram', 'ig'].includes(command)) {
    if (!input || !hostMatches(input, ['instagram.com', 'www.instagram.com'])) throw new Error('Usage: .instagram <Instagram URL>')
    return fetchJson(apiPath('/download/instagram'), { url: input })
  }
  if (['facebook', 'fb'].includes(command)) {
    if (!input || !hostMatches(input, ['facebook.com', 'www.facebook.com', 'fb.watch'])) throw new Error('Usage: .facebook <Facebook URL>')
    return fetchJson(apiPath('/download/facebook'), { url: input })
  }
  if (['twitter', 'x'].includes(command)) {
    if (!input || !hostMatches(input, ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'])) throw new Error('Usage: .twitter <X/Twitter URL>')
    return fetchJson(apiPath('/download/twitter'), { url: input })
  }
  if (['pinterest', 'pin'].includes(command)) {
    if (!input || !hostMatches(input, ['pin.it', 'pinterest.com', 'www.pinterest.com'])) throw new Error('Usage: .pinterest <Pinterest URL>')
    return fetchJson(apiPath('/download/pinterest'), { url: input })
  }
  if (['ai', 'gpt', 'davidgpt4o', 'davidgemini3pro', 'openrouter', 'grok'].includes(command)) {
    const q = args.join(' ').trim()
    if (!q) throw new Error(`Usage: .${command} your question`)
    if (command === 'davidgpt4o') return askProvider('david-gpt4o', q)
    if (command === 'davidgemini3pro') return askProvider('david-gemini3pro', q)
    if (command === 'openrouter') return askProvider('openrouter', q)
    if (command === 'grok') return askProvider('xai', q)
    if (command !== 'ai') return askChatGPT(q)
    return fetchJson(apiPath('/ai/chat'), { q })
  }
  if (command === 'chatgpt' || command === 'chatbot') {
    const query = args.join(' ').trim()
    if (!query) throw new Error('Usage: .chatgpt your question')
    return askChatGPT(query)
  }
  if (command === 'aiimage') {
    const prompt = args.join(' ').trim()
    if (!prompt) throw new Error('Usage: .aiimage your prompt')
    return fetchJson(apiPath('/ai/image'), { prompt })
  }
  if (['imagine', 'dalle', 'flux'].includes(command)) {
    const prompt = args.join(' ').trim()
    if (!prompt) throw new Error(`Usage: .${command} your image prompt`)
    return fetchJson(apiPath('/ai/image'), { prompt })
  }
  if (['sora', 'text2video', 't2v', 'txt2video'].includes(command)) {
    throw new Error('Text-to-video is not configured yet. Provide a permitted video API endpoint before using this command.')
  }
  if (command === 'lyrics') {
    const query = args.join(' ').trim()
    if (!query) throw new Error('Usage: .lyrics song title')
    return fetchJson(apiPath('/lyrics'), { query })
  }
  if (['ssweb', 'screenshot', 'ss'].includes(command)) {
    if (!input || !/^https?:\/\//i.test(input)) throw new Error('Usage: .ssweb https://example.com')
    return fetchJson(apiPath('/ssweb'), { url: input })
  }
  if (['tts', 'speak', 'trt'].includes(command)) {
    const text = args.join(' ').trim()
    if (!text) throw new Error('Usage: .tts text to speak')
    return fetchJson(apiPath('/tts'), { lang: process.env.TTS_LANG || 'en', text })
  }
  if (command === 'qr' || command === 'qrcode') {
    const text = args.join(' ').trim()
    if (!text) throw new Error('Usage: .qr text or URL')
    return fetchJson(apiPath('/qr'), { text })
  }
  if (command === 'upload') {
    if (!input || !/^https?:\/\//i.test(input)) throw new Error('Usage: .upload https://image-url')
    return fetchJson(apiPath('/tools/upload'), { url: input })
  }
  if (command === 'blur') {
    if (!input || !/^https?:\/\//i.test(input)) throw new Error('Usage: .blur <image URL> [level]')
    return fetchJson(apiPath('/img/blur'), { url: input, level: args[1] || '12' })
  }
  if (command === 'welcome' || command === 'goodbye') {
    const values = splitPipeArgs(args, 2)
    if (!values.length) throw new Error(`Usage: .${command} name | group`)
    return fetchJson(apiPath(`/card/${command}`), defaultPic({ name: values[0], group: values[1], count: CARD_COUNT }))
  }
  if (command === 'rankcard') {
    const values = splitPipeArgs(args, 5)
    if (!values.length) throw new Error('Usage: .rankcard name | level | xp | needed | rank')
    return fetchJson(apiPath('/card/rank'), defaultPic({ name: values[0], level: values[1], xp: values[2], needed: values[3], rank: values[4] }))
  }
  if (command === 'quotecard') {
    const values = splitPipeArgs(args, 1)
    if (!values.length) throw new Error('Usage: .quotecard your quote')
    return fetchJson(apiPath('/card/quote'), defaultPic({ text: values[0] }))
  }
  if (command === 'wanted') {
    const values = splitPipeArgs(args, 3)
    if (!values.length) throw new Error('Usage: .wanted name | crime | reward')
    return fetchJson(apiPath('/card/wanted'), defaultPic({ name: values[0], crime: values[1], reward: values[2] }))
  }
  if (command === 'jail') {
    const values = splitPipeArgs(args, 4)
    if (!values.length) throw new Error('Usage: .jail name | crime | sentence | cell')
    return fetchJson(apiPath('/card/jail'), defaultPic({ name: values[0], crime: values[1], sentence: values[2], cell: values[3] }))
  }
  if (command === 'ytcard') {
    if (!input || !hostMatches(input, ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'])) throw new Error('Usage: .ytcard <YouTube URL>')
    return fetchJson(apiPath('/yt/card'), { url: input })
  }
  if (command === 'github' || command === 'gh') {
    const username = args[0]?.replace(/^@/, '')
    if (!username) throw new Error('Usage: .github username')
    return fetchJson(apiPath('/stalk/github'), { username })
  }
  if (command === 'igstalk' || command === 'instastalk') {
    const username = args[0]?.replace(/^@/, '')
    if (!username) throw new Error('Usage: .igstalk username')
    return fetchJson(apiPath('/stalk/instagram'), { username })
  }
  if (command === 'trivia' || command === 'quiz') {
    const difficulty = ['easy', 'medium', 'hard'].includes((args[0] || '').toLowerCase())
      ? args[0].toLowerCase()
      : 'easy'
    return fetchJson(apiPath('/game/trivia'), { difficulty })
  }
  if (command === 'truth') return fetchJson(apiPath('/game/truth'), {})
  if (command === 'riddle') return fetchJson(apiPath('/game/riddle'), {})
  if (command === 'quran') {
    const ayah = args[0] || '2:255'
    return fetchJson(apiPath('/religion/quran'), { ayah })
  }
  if (command === 'bible') {
    const ref = args.join(' ').trim() || 'John 3:16'
    return fetchJson(apiPath('/religion/bible'), { ref })
  }
  if (command === 'translate' || command === 'tr') {
    const to = args[0]
    const text = args.slice(1).join(' ').trim()
    if (!to || !text) throw new Error('Usage: .translate language text')
    return fetchJson(apiPath('/tools/translate'), { to, text })
  }
  if (command === 'weather') {
    const city = args.join(' ').trim()
    if (!city) throw new Error('Usage: .weather city')
    return fetchJson(apiPath('/tools/weather'), { city })
  }
  if (command === 'define') {
    const word = args.join(' ').trim()
    if (!word) throw new Error('Usage: .define word')
    return fetchJson(apiPath('/tools/define'), { word })
  }
  if (command === 'wiki') {
    const q = args.join(' ').trim()
    if (!q) throw new Error('Usage: .wiki topic')
    return fetchJson(apiPath('/tools/wiki'), { q, lang: process.env.WIKI_LANG || 'en' })
  }
  if (command === 'currency') {
    const amount = args[0]
    const from = args[1]
    const to = args[2]
    if (!amount || !from || !to) throw new Error('Usage: .currency amount FROM TO[,TO]')
    return fetchJson(apiPath('/tools/currency'), { amount, from: from.toUpperCase(), to: to.toUpperCase() })
  }
  if (command === 'shorturl' || command === 'urlshortener') {
    const url = args[0]
    if (!url || !/^https?:\/\//i.test(url)) throw new Error('Usage: .shorturl https://example.com')
    return fetchJson(apiPath('/tools/shorturl'), { url })
  }
  if (command === 'npm') {
    const q = args.join(' ').trim()
    if (!q) throw new Error('Usage: .npm package-name')
    return fetchJson(apiPath('/tools/npm'), { q })
  }
  if (command === 'country') {
    const name = args.join(' ').trim()
    if (!name) throw new Error('Usage: .country country-name')
    return fetchJson(apiPath('/tools/country'), { name })
  }
  if (command === 'time') {
    const tz = args.join(' ').trim()
    if (!tz) throw new Error('Usage: .time Area/City')
    return fetchJson(apiPath('/tools/time'), { tz })
  }
  if (['calc', 'calculate', 'calculator'].includes(command)) {
    const expr = args.join(' ').trim()
    if (!expr) throw new Error('Usage: .calc (5+5)*2^3')
    return fetchJson(apiPath('/tools/calc'), { expr })
  }
  if (command === 'neko') return fetchJson(apiPath('/anime/neko'), {})
  if (command === 'anime') return fetchSfwAnime()
  if (command === 'animequote') return fetchJson(apiPath('/anime/quotes'), {})
  if (command === 'gif') {
    const type = (args[0] || 'laugh').trim().toLowerCase()
    if (!/^[a-z0-9_-]+$/.test(type)) throw new Error('Usage: .gif laugh')
    return fetchJson(apiPath(`/gif/${encodeURIComponent(type)}`), {})
  }
  if (command === 'faketweet' || command === 'fake') {
    const values = splitPipeArgs(args, 7)
    if (!values.length) throw new Error('Usage: .faketweet Name | username | text | likes | retweets | replies | time')
    return fetchJson(apiPath('/fake/tweet'), {
      name: values[0], username: values[1], text: values[2],
      pic: CARD_PIC, verified: 'true', likes: values[3], retweets: values[4],
      replies: values[5], time: values[6], theme: CARD_THEME
    })
  }
  if (command === 'tylorgithub') {
    const username = args[0]?.replace(/^@/, '')
    if (!username) throw new Error('Usage: .tylorgithub username')
    return fetchJson(apiPath('/stalk/github'), { username })
  }
  if (command === 'tylortiktok') {
    const username = args[0]?.replace(/^@/, '')
    if (!username) throw new Error('Usage: .tylortiktok username')
    return fetchJson(apiPath('/stalk/tiktok'), { username })
  }
  if (command === 'tyloranime') return fetchJson(apiPath('/anime/random'), {})
  if (command === 'tylornsfw') {
    const url = args[0]
    if (!url || !/^https?:\/\//i.test(url)) throw new Error('Usage: .tylornsfw https://example.com/image.jpg')
    return fetchJson(apiPath('/tools/nsfw'), { url })
  }
  if (command === 'tylorytcomment') {
    const text = args.join(' ').trim()
    if (!text) throw new Error('Usage: .tylorytcomment your comment')
    return fetchJson(apiPath('/fake/ytcomment'), { text, username: process.env.CARD_AUTHOR || 'White MD', theme: CARD_THEME })
  }
  throw new Error('Unknown extra command')
}

module.exports = {
  command: COMMANDS,
  description: 'social, AI, image, utility, and card tools',

  async execute({ socket, jid, args, command, logger, message, config, prefix }) {
    try {
      if (['chatgpt', 'chatbot'].includes(command) && ['on', 'off'].includes((args[0] || '').toLowerCase())) {
        const sender = message.key.participant || jid
        const senderNumber = sender.split(':')[0].split('@')[0]
        const isOwner = message.key.fromMe || (config.ownerNumber && senderNumber === config.ownerNumber)
        if (!isOwner) {
          await socket.sendMessage(jid, { text: 'Only the bot owner can enable or disable automatic ChatGPT replies.' })
          return
        }

        const enabled = args[0].toLowerCase() === 'on'
        config.setChatGPTAuto(enabled)
        await socket.sendMessage(jid, {
          text: enabled
            ? `Automatic ChatGPT replies are now ON in all chats. Use ${prefix}chatgpt off to disable them.`
            : 'Automatic ChatGPT replies are now OFF.'
        })
        return
      }

      await socket.sendMessage(jid, { text: 'Processing your request. Please wait...' })
      if (command === 'aiimage') {
        const prompt = args.join(' ').trim()
        if (!prompt) throw new Error('Usage: .aiimage your prompt')
        const media = await fetchBinary(apiPath('/ai/image'), { prompt })
        await socket.sendMessage(jid, {
          image: media.buffer,
          mimetype: media.contentType,
          caption: `*AI image*\n${prompt.slice(0, 500)}\n\nCreated by White MD`
        })
        return
      }
      const result = await executeCommand(command, args)
      if (command === 'github' || command === 'gh') {
        const profile = result || {}
        const lines = [
          `*GitHub profile: ${profile.username || 'unknown'}*`,
          profile.name ? `Name: ${profile.name}` : null,
          profile.bio ? `Bio: ${profile.bio}` : null,
          profile.company ? `Company: ${profile.company}` : null,
          profile.location ? `Location: ${profile.location}` : null,
          `Followers: ${profile.followers ?? 0}`,
          `Following: ${profile.following ?? 0}`,
          `Public repos: ${profile.publicRepos ?? 0}`,
          profile.url ? `Profile: ${profile.url}` : null
        ].filter(Boolean)
        await socket.sendMessage(jid, { text: lines.join('\n') })
        if (profile.avatar) await socket.sendMessage(jid, {
          image: { url: profile.avatar },
          caption: `${profile.username || 'GitHub'} avatar`
        })
        return
      }
      if (command === 'igstalk' || command === 'instastalk') {
        const profile = result || {}
        const skip = new Set(['avatar', 'avatarUrl', 'profilePicture', 'profilePic', 'image', 'picture'])
        const lines = [`*Instagram profile: ${profile.username || args[0] || 'unknown'}*`]
        for (const [key, value] of Object.entries(profile)) {
          if (skip.has(key) || value === null || value === undefined || typeof value === 'object') continue
          lines.push(`${key}: ${value}`)
        }
        await socket.sendMessage(jid, { text: lines.join('\n').slice(0, 4000) })
        const avatar = profile.avatar || profile.avatarUrl || profile.profilePicture || profile.profilePic || profile.image || profile.picture
        if (avatar && /^https?:\/\//i.test(avatar)) await socket.sendMessage(jid, {
          image: { url: avatar },
          caption: `${profile.username || args[0] || 'Instagram'} profile`
        })
        return
      }
      if (command === 'trivia' || command === 'quiz') {
        const game = result || {}
        const options = Array.isArray(game.options)
          ? game.options.map((option, index) => `${index + 1}. ${option}`).join('\n')
          : ''
        await socket.sendMessage(jid, {
          text: `*White MD Trivia*\n\n${game.question || 'No question returned.'}\n\n${options}\n\nReply with the correct answer.\nCategory: ${game.category || 'General'}\nDifficulty: ${game.difficulty || 'easy'}\n\nAnswer: ${game.answer || 'Unavailable'}`
        })
        return
      }
      if (command === 'truth') {
        await socket.sendMessage(jid, { text: `*White MD Truth*\n\n${result?.text || result}` })
        return
      }
      if (command === 'riddle') {
        await socket.sendMessage(jid, {
          text: `*White MD Riddle*\n\n${result?.riddle || 'No riddle returned.'}\n\nAnswer: ${result?.answer || 'Unavailable'}`
        })
        return
      }
      if (command === 'quran') {
        const verse = result || {}
        await socket.sendMessage(jid, {
          text: `*Quran ${verse.reference || ''} — ${verse.surah || ''}*\n\n${verse.arabic || ''}\n\n${verse.translation || ''}`.slice(0, 6000)
        })
        return
      }
      if (command === 'bible') {
        const verse = result || {}
        await socket.sendMessage(jid, {
          text: `*Bible — ${verse.reference || ''}*\n\n${verse.text || ''}\n\nTranslation: ${verse.translation || 'Unavailable'}`
        })
        return
      }
      if (command === 'translate') {
        const translation = result || {}
        await socket.sendMessage(jid, {
          text: `*White MD Translation*\n\nOriginal: ${translation.text || ''}\nTranslated: ${translation.translated || ''}\nLanguage: ${translation.to || ''}`
        })
        return
      }
      if (command === 'weather') {
        const weather = result || {}
        const units = weather.units || {}
        await socket.sendMessage(jid, {
          text: `*Weather — ${weather.city || ''}*\n\nCondition: ${weather.condition || 'Unavailable'}\nTemperature: ${weather.temperature ?? '-'}${units.temperature || '°C'}\nFeels like: ${weather.feelsLike ?? '-'}${units.temperature || '°C'}\nHumidity: ${weather.humidity ?? '-'}${units.humidity || '%'}\nWind: ${weather.windKmh ?? '-'} ${units.wind || 'km/h'}\nRain chance: ${weather.rainChance ?? '-'}${units.rainChance || '%'}\nLocal time: ${weather.localTime || '-'}\nTimezone: ${weather.timezone || '-'}`
        })
        return
      }
      if (command === 'define') {
        const definition = result || {}
        const meanings = Array.isArray(definition.meanings) ? definition.meanings : []
        const lines = [`*Definition: ${definition.word || ''}*`, definition.phonetic ? `Pronunciation: ${definition.phonetic}` : '']
        for (const meaning of meanings.slice(0, 3)) {
          lines.push(`\n${meaning.partOfSpeech || 'Meaning'}`)
          for (const item of (meaning.definitions || []).slice(0, 3)) lines.push(`• ${item.definition}`)
        }
        await socket.sendMessage(jid, { text: lines.filter(Boolean).join('\n').slice(0, 5000) })
        return
      }
      if (command === 'wiki') {
        const article = result || {}
        await socket.sendMessage(jid, {
          text: `*${article.title || 'Wiki result'}*\n\n${article.description || ''}\n\n${article.summary || ''}\n\n${article.url || ''}`.slice(0, 6000)
        })
        if (article.thumbnail) await socket.sendMessage(jid, {
          image: { url: article.thumbnail },
          caption: article.title || 'Wiki thumbnail'
        })
        return
      }
      if (command === 'currency') {
        const conversion = result || {}
        const rates = Object.entries(conversion.rates || {})
          .map(([currency, value]) => `${currency}: ${value}`)
          .join('\n')
        await socket.sendMessage(jid, {
          text: `*Currency conversion*\n\n${conversion.amount ?? ''} ${conversion.from || ''}\n${rates}\n\nDate: ${conversion.date || 'Unavailable'}\nSource: ${conversion.source || 'Unavailable'}`
        })
        return
      }
      if (command === 'shorturl') {
        await socket.sendMessage(jid, {
          text: `*Short URL*\n\nOriginal: ${result?.url || ''}\nShort: ${result?.short || 'Unavailable'}`
        })
        return
      }
      if (command === 'npm') {
        const packages = Array.isArray(result) ? result : [result]
        const lines = packages.slice(0, 8).map((item) =>
          `*${item.name || 'unknown'}* v${item.version || '?'}\n${item.description || ''}\n${item.npm || ''}`
        )
        await socket.sendMessage(jid, { text: lines.join('\n\n').slice(0, 6000) || 'No packages found.' })
        return
      }
      if (command === 'country') {
        const country = result || {}
        const currencies = (country.currencies || []).map((item) => `${item.name} (${item.code})`).join(', ')
        await socket.sendMessage(jid, {
          text: `${country.flag || ''} *${country.name || ''}*\n\nOfficial: ${country.official || '-'}\nCapital: ${(country.capital || []).join(', ') || '-'}\nRegion: ${country.region || '-'}\nSubregion: ${country.subregion || '-'}\nCalling code: ${country.callingCode || '-'}\nArea: ${country.areaKm2 ?? '-'} km²\nLanguages: ${(country.languages || []).join(', ') || '-'}\nCurrencies: ${currencies || '-'}`
        })
        if (country.flagImage) await socket.sendMessage(jid, { image: { url: country.flagImage }, caption: `${country.name || ''} flag` })
        return
      }
      if (command === 'time') {
        const clock = result || {}
        await socket.sendMessage(jid, {
          text: `*Local time*\n\nTimezone: ${clock.timezone || ''}\nTime: ${clock.datetime || ''}\nOffset: ${clock.utcOffset || ''}`
        })
        return
      }
      if (command === 'calc') {
        await socket.sendMessage(jid, {
          text: `*Calculator*\n\n${result?.expression || ''} = ${result?.result ?? 'Unavailable'}`
        })
        return
      }
      await sendMediaOrText({ socket, jid, result, caption: `Created by White MD (${command})` })
    } catch (error) {
      logger.error({ err: error, command }, 'Extra command failed')
      await socket.sendMessage(jid, { text: error.message || 'The command failed. Try again later.' })
    }
  }
}
