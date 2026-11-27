'use strict'

/**
 * Downloader provider (api.downloader.org style):
 *   POST {url} with the Authorization header -> { items: [{ type, url, quality }] }
 *
 * Environment:
 *   DOWNLOADER_API_KEY      required. Your key from the provider dashboard.
 *   DOWNLOADER_API_URL      optional. Default https://api.downloader.org/api/v1/submit/
 *   DOWNLOADER_AUTH_SCHEME  optional. Text placed before the key, e.g. "Bearer" or "Token".
 *                           Empty by default, so the header is exactly: Authorization: <key>
 */

const { request } = require('./http')

const DEFAULT_ENDPOINT = 'https://api.downloader.org/api/v1/submit/'

function isConfigured() {
  return Boolean(process.env.DOWNLOADER_API_KEY)
}

function isHttpUrl(value = '') {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function qualityRank(quality) {
  const n = parseInt(String(quality || '').replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36'

/** Provider with your key: POST {url} -> { items: [...] }. Throws when it cannot help. */
async function submitToProvider(url) {
  const key = process.env.DOWNLOADER_API_KEY
  if (!key) throw new Error('DOWNLOADER_API_KEY is not set')
  const endpoint = process.env.DOWNLOADER_API_URL || DEFAULT_ENDPOINT
  const scheme = (process.env.DOWNLOADER_AUTH_SCHEME || '').trim()

  const response = await request(endpoint, {
    method: 'POST',
    headers: {
      Authorization: scheme ? `${scheme} ${key}` : key,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ url })
  }, { retries: 1, timeoutMs: 45000, label: 'Downloader provider', resource: endpoint })

  if (response.status === 401 || response.status === 403) {
    throw new Error('the provider rejected the API key (HTTP ' + response.status + ')')
  }
  if (!response.ok) throw new Error(`the provider returned HTTP ${response.status}`)

  const data = await response.json().catch(() => null)
  const items = Array.isArray(data?.items) ? data.items : []
  const clean = items
    .filter((item) => item && isHttpUrl(item.url))
    .map((item) => ({ type: String(item.type || 'file').toLowerCase(), url: item.url, quality: item.quality || null }))
  if (!clean.length) throw new Error('the provider found nothing to download')
  return clean
}

/* ---- Keyless backups, tried when the provider has no key or fails ---- */

async function viaTikwm(url) {
  if (!/tiktok\.com|douyin\.com/i.test(url)) throw new Error('not a TikTok link')
  const response = await request(`https://www.tikwm.com/api/?${new URLSearchParams({ url, hd: '1' })}`, { headers: { 'user-agent': USER_AGENT } }, { retries: 1, timeoutMs: 30000, label: 'TikTok backup', resource: 'tikwm.com' })
  const data = (await response.json().catch(() => null))?.data
  const items = []
  if (data?.hdplay || data?.play) items.push({ type: 'video', url: data.hdplay || data.play, quality: data.hdplay ? 'HD' : null })
  if (data?.music) items.push({ type: 'audio', url: data.music, quality: null })
  for (const image of data?.images || []) items.push({ type: 'image', url: image, quality: null })
  if (!items.length) throw new Error('TikTok backup found nothing')
  return items
}

async function viaDirectFile(url) {
  const path = new URL(url).pathname.toLowerCase()
  const byExtension = /\.(mp4|mkv|webm|mov|m4v)$/.test(path) ? 'video' : /\.(mp3|m4a|ogg|wav|opus|aac)$/.test(path) ? 'audio' : /\.(jpe?g|png|webp|gif)$/.test(path) ? 'image' : /\.apk$/.test(path) ? 'apk' : null
  if (byExtension) return [{ type: byExtension, url, quality: null }]
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': USER_AGENT } }).catch(() => null)
  const type = String(head?.headers?.get('content-type') || '')
  const kind = type.startsWith('video/') ? 'video' : type.startsWith('audio/') ? 'audio' : type.startsWith('image/') ? 'image' : /android\.package/.test(type) ? 'apk' : null
  if (!kind) throw new Error('not a direct media file')
  return [{ type: kind, url, quality: null }]
}

const BACKUPS = [viaTikwm, viaDirectFile]

/** Submit a page/video URL and return the normalised items. */
async function submit(url) {
  const failures = []
  try {
    return await submitToProvider(url)
  } catch (error) {
    failures.push(`provider: ${error.message}`)
  }
  for (const backup of BACKUPS) {
    try {
      return await backup(url)
    } catch (error) {
      if (!/^not a /.test(error.message)) failures.push(`${backup.name.replace(/^via/, '').toLowerCase()}: ${error.message}`)
    }
  }
  const keyHint = process.env.DOWNLOADER_API_KEY ? '' : ' Set DOWNLOADER_API_KEY to enable more sites.'
  throw new Error(`nothing could download that link (${failures.join('; ')}).${keyHint}`)
}

/** Best item of a type: highest quality first. */
function best(items, type) {
  return items
    .filter((item) => item.type === type)
    .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality))[0] || null
}

function describe(items) {
  return items.map((item, i) => `${i + 1}. ${item.type}${item.quality ? ` (${item.quality})` : ''}\n${item.url}`).join('\n\n')
}

/**
 * Send the list of results and attach the best video (or audio / image) as real media.
 * Falls back to the plain links if WhatsApp refuses the file.
 */
async function deliver({ socket, jid, message, items, logger }) {
  const lines = ['*Downloader results*', '', describe(items.slice(0, 10))]
  await socket.sendMessage(jid, { text: lines.join('\n') }, { quoted: message })

  const pick = best(items, 'video') || best(items, 'audio') || best(items, 'image')
  if (!pick) return
  const caption = `${pick.type}${pick.quality ? ` ${pick.quality}` : ''} · White MD`
  try {
    if (pick.type === 'video') await socket.sendMessage(jid, { video: { url: pick.url }, caption }, { quoted: message })
    else if (pick.type === 'audio') await socket.sendMessage(jid, { audio: { url: pick.url }, mimetype: 'audio/mpeg' }, { quoted: message })
    else await socket.sendMessage(jid, { image: { url: pick.url }, caption }, { quoted: message })
  } catch (error) {
    logger?.warn?.({ err: error }, 'Could not attach downloader media; the links were already sent')
  }
}

module.exports = { submit, deliver, best, describe, isConfigured, isHttpUrl, qualityRank }
