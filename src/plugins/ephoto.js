'use strict'

const { request } = require('../lib/http')

const EPHOTO_ORIGIN = 'https://en.ephoto360.com'
const EFFECTS = {
  mascot: '/mastery-avatar-lol-246.html',
  foggy: '/handwritten-text-on-foggy-glass-online-680.html',
  galaxy: '/text-light-galaxy-effectt-345.html',
  neon: '/blue-neon-text-effect-117.html',
  golden: '/modern-gold-3-212.html',
  metalic: '/metallic-text-effect-with-impressive-font-307.html',
  metallic: '/metallic-text-effect-with-impressive-font-307.html',
  blackpink: '/create-a-blackpink-style-logo-with-members-signatures-810.html',
  sand: '/create-3d-text-effect-on-the-beach-online-688.html',
  gaming: '/create-cute-girl-gamer-mascot-logo-online-687.html',
  matrix: '/light-text-effect-futuristic-technology-style-648.html',
  hacker: '/create-anonymous-hacker-avatars-cyan-neon-677.html',
  typography: '/create-online-typography-art-effects-with-multiple-layers-811.html',
  typo: '/create-online-typography-art-effects-with-multiple-layers-811.html',
  minion: '/funny-minion-text-effect-online-544.html',
  redwing: '/flame-lettering-effect-372.html',
  halloween: '/halloween-fire-text-effect-online-369.html',
  thunder: '/thunder-text-effect-online-97.html',
  rain: '/foggy-rainy-text-effect-75.html',
  water: '/create-water-effect-text-online-295.html',
  dance: '/dance-text-effects-312.html',
  filament: '/text-effects-incandescent-bulbs-219.html',
  lava: '/online-hot-metallic-effect-341.html',
  '2neon': '/neon-text-effect-171.html',
  bigmetal: '/create-metal-border-294.html',
  '3neon': '/text-light-galaxy-effectt-345.html',
  christmas: '/christmas-snow-text-effect-online-631.html'
}

const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml'
}

function htmlEntityDecode(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function hiddenValue(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<input[^>]+name=["']${escaped}["'][^>]*value=["']([^"']*)`, 'i'),
    new RegExp(`<input[^>]+id=["']${escaped}["'][^>]*value=["']([^"']*)`, 'i')
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return htmlEntityDecode(match[1])
  }
  return ''
}

function resultFormValue(html) {
  const match = html.match(/<input[^>]+name=["']form_value_input["'][^>]*value=["']([^"']*)/i) ||
    html.match(/<input[^>]+id=["']form_value_input["'][^>]*value=["']([^"']*)/i)
  if (!match?.[1]) throw new Error('ePhoto360 did not return a generation form')
  return JSON.parse(htmlEntityDecode(match[1]))
}

async function createEffect(slug, text) {
  const pageUrl = `${EPHOTO_ORIGIN}${slug}`
  const page = await request(pageUrl, { headers: browserHeaders }, { label: 'ePhoto360 effect page', resource: pageUrl })
  if (!page.ok) throw new Error(`ePhoto360 page returned HTTP ${page.status}`)
  const html = await page.text()
  const cookies = typeof page.headers.getSetCookie === 'function' ? page.headers.getSetCookie().join('; ') : ''
  const form = new FormData()
  form.append('submit', hiddenValue(html, 'submit') || 'GO')
  form.append('token', hiddenValue(html, 'token'))
  form.append('build_server', hiddenValue(html, 'build_server'))
  form.append('build_server_id', hiddenValue(html, 'build_server_id'))
  form.append('text[]', text)

  const generated = await request(pageUrl, {
    method: 'POST',
    headers: { ...browserHeaders, Origin: EPHOTO_ORIGIN, Referer: pageUrl, Cookie: cookies },
    body: form
  }, { label: 'ePhoto360 form submission', resource: pageUrl })
  if (!generated.ok) throw new Error(`ePhoto360 form returned HTTP ${generated.status}`)
  const payload = resultFormValue(await generated.text())
  const createUrl = `${EPHOTO_ORIGIN}/effect/create-image`
  const createBody = new URLSearchParams(Object.entries(payload).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)]))
  const result = await request(createUrl, {
    method: 'POST',
    headers: { ...browserHeaders, Origin: EPHOTO_ORIGIN, Referer: pageUrl, Cookie: cookies, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: createBody
  }, { label: 'ePhoto360 image generation', resource: createUrl })
  if (!result.ok) throw new Error(`ePhoto360 generation returned HTTP ${result.status}`)
  const data = await result.json()
  if (!data.success || !data.image) throw new Error('ePhoto360 did not return an image')
  return `${payload.build_server}${data.image}`
}

module.exports = {
  command: Object.keys(EFFECTS),
  description: 'safe no-key ePhoto360 text effects',

  async execute({ socket, jid, args, command, message, logger }) {
    const text = args.join(' ').trim()
    if (!text) {
      await socket.sendMessage(jid, { text: `Usage: .${command} text` }, { quoted: message })
      return
    }
    try {
      const imageUrl = await createEffect(EFFECTS[command], text.slice(0, 120))
      await socket.sendMessage(jid, { image: { url: imageUrl }, caption: `White MD • ${command}` }, { quoted: message })
    } catch (error) {
      logger.error({ err: error, command }, 'ePhoto command failed')
      await socket.sendMessage(jid, { text: `The .${command} effect is unavailable right now. ePhoto360 may be rate-limiting requests.` }, { quoted: message })
    }
  }
}
