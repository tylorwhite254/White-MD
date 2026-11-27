const API_BASE = process.env.KNIGHT_SPOTIFY_API_BASE || 'https://knightbotapi.stream/api/spotify'
const API_KEY = process.env.KNIGHT_API_KEY || 'knight'
const MAX_DURATION_SECONDS = Number(process.env.MAX_DOWNLOAD_DURATION || 900)
const { request } = require('../lib/http')
const yts = require('yt-search')
const { downloadYouTube } = require('../lib/youtube-download')

function isSpotifyUrl(value = '') {
  try {
    const url = new URL(value)
    return ['open.spotify.com', 'spotify.link'].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

function durationToSeconds(value) {
  if (typeof value === 'number') return value
  const parts = String(value || '').split(':').map(Number)
  if (parts.some(Number.isNaN)) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

module.exports = {
  command: 'spotify',
  description: 'download a Spotify track as audio',

  async execute({ socket, jid, args, logger }) {
    const input = args[0]
    if (!input || !isSpotifyUrl(input)) {
      await socket.sendMessage(jid, {
        text: 'Usage: .spotify https://open.spotify.com/track/TRACK_ID'
      })
      return
    }

    await socket.sendMessage(jid, { text: 'Preparing the Spotify audio. Please wait...' })

    try {
      const params = new URLSearchParams({ apikey: API_KEY, url: input })
      const response = await request(`${API_BASE}?${params}`, {}, { label: 'KnightBot Spotify API' })
      if (!response.ok) throw new Error(`API returned HTTP ${response.status}`)

      const data = await response.json()
      const result = data?.result
      const downloadUrl = result?.download || result?.dl_url || result?.dl
      if (!data?.success || !downloadUrl) {
        throw new Error('The API did not return an audio download URL')
      }

      if (durationToSeconds(result.duration) > MAX_DURATION_SECONDS) {
        await socket.sendMessage(jid, {
          text: `That track is too long. The limit is ${Math.floor(MAX_DURATION_SECONDS / 60)} minutes.`
        })
        return
      }

      const title = String(result.title || 'White MD audio').slice(0, 200)
      const artist = String(result.artist || '').slice(0, 100)
      const safeName = `${title}${artist ? ` - ${artist}` : ''}`
        .replace(/[^a-z0-9-_ ]/gi, '')
        .trim() || 'white-md-audio'

      await socket.sendMessage(jid, {
        audio: { url: downloadUrl },
        mimetype: 'audio/mpeg',
        fileName: `${safeName}.mp3`,
        ptt: false,
        caption: `*${title}*${artist ? `\n${artist}` : ''}\n\nDownloaded by White MD`
      })
    } catch (error) {
      logger.error({ err: error }, 'Spotify command failed')
      try {
        const metadataUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(input)}`
        const metadataResponse = await request(metadataUrl, {}, { label: 'Spotify oEmbed metadata' })
        if (!metadataResponse.ok) throw new Error(`Spotify oEmbed returned HTTP ${metadataResponse.status}`)
        const metadata = await metadataResponse.json()
        const search = await yts(metadata.title || input)
        const video = search.videos?.[0]
        if (!video) throw new Error('No YouTube match found for the Spotify track')
        const fallback = await downloadYouTube(video.url, { format: 'mp3', fallback: { title: metadata.title } })
        const title = String(fallback.title || metadata.title || 'White MD audio').slice(0, 200)
        await socket.sendMessage(jid, {
          audio: { url: fallback.downloadUrl },
          mimetype: 'audio/mpeg',
          fileName: `${title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'white-md-audio'}.mp3`,
          ptt: false,
          caption: `*${title}*\n\nDownloaded by White MD via ${fallback.provider}`
        })
      } catch (fallbackError) {
        logger.error({ err: fallbackError }, 'Spotify fallback failed')
        await socket.sendMessage(jid, {
          text: 'Sorry, I could not download that Spotify track right now. Try again later.'
        })
      }
    }
  }
}
