const yts = require('yt-search')
const { Quality, Ytdl } = require('@distube/ytdl-core')
const { request } = require('../lib/http')
const yt = new Ytdl()

const MAX_DURATION_SECONDS = Number(process.env.MAX_DOWNLOAD_DURATION || 900)
const DOWNLOADERS = {
  play: { url: process.env.PLAY_DOWNLOAD_URL || 'https://api.davidcyriltech.my.id/download/ytmp3', label: 'DavidCyril YouTube MP3', type: 'audio' }
}

function findUrl(value) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value
  if (!value || typeof value !== 'object') return null
  for (const key of ['download_url', 'download', 'url', 'audio', 'video', 'dl_url', 'dl', 'link']) {
    if (typeof value[key] === 'string' && /^https?:\/\//i.test(value[key])) return value[key]
  }
  for (const child of Object.values(value)) {
    const found = findUrl(child)
    if (found) return found
  }
  return null
}

function findTitle(value, fallback) {
  if (!value || typeof value !== 'object') return fallback
  for (const key of ['title', 'name']) if (typeof value[key] === 'string' && value[key].trim()) return value[key]
  for (const child of Object.values(value)) {
    const found = findTitle(child, '')
    if (found) return found
  }
  return fallback
}

async function sendDirectYouTube({ socket, jid, message, video, command }) {
  const info = await yt.getInfo(video.url)
  const seconds = Number(info.videoDetails?.lengthSeconds || 0)
  if (seconds > MAX_DURATION_SECONDS) throw new Error(`Video exceeds the ${Math.floor(MAX_DURATION_SECONDS / 60)} minute limit`)
  const title = String(info.videoDetails?.title || video.title || 'White MD download').slice(0, 120)
  const safeName = title.replace(/[\\/:*?"<>|]/g, '_') || 'white-md-download'
  const stream = yt.download(info, { quality: Quality.HighestAudio, filter: { hasAudio: true, hasVideo: false } })
  await socket.sendMessage(jid, { audio: stream, mimetype: 'audio/mpeg', fileName: `${safeName}.mp3`, ptt: false, caption: `*${title}*\n\nDownloaded by White MD direct fallback` }, { quoted: message })
}

module.exports = {
  command: Object.keys(DOWNLOADERS),
  description: 'YouTube search and numbered audio/video download backups',

  async execute({ socket, jid, args, message, command, logger }) {
    const query = args.join(' ').trim()
    if (!query) {
      await socket.sendMessage(jid, { text: `Usage: .${command} song or video name` })
      return
    }

    const downloader = DOWNLOADERS[command]
    let video
    try {
      const search = await yts(query)
      video = search.videos?.[0]
      if (!video) {
        await socket.sendMessage(jid, { text: `No results found for: ${query}` })
        return
      }

      const body = [
        `*White MD ${command.toUpperCase()}*`,
        `> Title: ${video.title}`,
        `> Duration: ${video.timestamp || 'Unknown'}`,
        `> URL: ${video.url}`,
        `> Provider: ${downloader.label}`
      ].join('\n')
      if (video.thumbnail) await socket.sendMessage(jid, { image: { url: video.thumbnail }, caption: body }, { quoted: message })
      else await socket.sendMessage(jid, { text: body })

      const endpoint = new URL(downloader.url)
      endpoint.searchParams.set(downloader.url.includes('dreaded.site') ? 'query' : 'url', video.url)
      const response = await request(endpoint, {}, { retries: 1, label: downloader.label, resource: downloader.url })
      if (!response.ok) throw new Error(`${downloader.label} returned HTTP ${response.status}`)
      const data = await response.json()
      const downloadUrl = findUrl(data?.result ?? data)
      if (!downloadUrl) throw new Error(`${downloader.label} returned no media URL`)

      const title = findTitle(data?.result ?? data, video.title).slice(0, 120)
      const safeName = title.replace(/[\\/:*?"<>|]/g, '_') || 'white-md-download'
      if (downloader.type === 'video') {
        await socket.sendMessage(jid, { video: { url: downloadUrl }, mimetype: 'video/mp4', fileName: `${safeName}.mp4`, caption: `*${title}*\n\nDownloaded by White MD` }, { quoted: message })
      } else {
        await socket.sendMessage(jid, { audio: { url: downloadUrl }, mimetype: 'audio/mpeg', fileName: `${safeName}.mp3`, ptt: false, caption: `*${title}*\n\nDownloaded by White MD` }, { quoted: message })
      }
    } catch (error) {
      logger.error({ err: error, query, command, provider: downloader.label }, 'YouTube provider failed; trying direct fallback')
      if (!video) {
        await socket.sendMessage(jid, { text: `YouTube search failed for ${command}. Try another query later.` })
        return
      }
      try {
        await sendDirectYouTube({ socket, jid, message, video, command })
      } catch (fallbackError) {
        logger.error({ err: fallbackError, query, command }, 'Direct YouTube fallback failed')
        await socket.sendMessage(jid, { text: `The ${command} provider and direct YouTube fallback are unavailable right now. Try another link later.` })
      }
    }
  }
}
