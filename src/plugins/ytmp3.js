const API_BASE = process.env.KNIGHT_DOWNLOAD_API_BASE || 'https://knightbotapi.stream/api/download'
const API_KEY = process.env.KNIGHT_API_KEY || 'knight'
const MAX_DURATION_SECONDS = Number(process.env.MAX_DOWNLOAD_DURATION || 900)
const { request } = require('../lib/http')
const { downloadYouTube } = require('../lib/youtube-download')

function isYouTubeUrl(value = '') {
  try {
    const url = new URL(value)
    return ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

module.exports = {
  command: ['ytmp3', 'ytaudio'],
  description: 'download YouTube audio',

  async execute({ socket, jid, args, logger }) {
    const input = args[0]
    if (!input || !isYouTubeUrl(input)) {
      await socket.sendMessage(jid, { text: 'Usage: .ytmp3 https://youtu.be/VIDEO_ID' })
      return
    }

    await socket.sendMessage(jid, { text: 'Preparing the YouTube audio. Please wait...' })

    try {
      const params = new URLSearchParams({ apikey: API_KEY, type: 'mp3', url: input })
      const response = await request(`${API_BASE}?${params}`, {}, { label: 'KnightBot download API' })
      if (!response.ok) throw new Error(`API returned HTTP ${response.status}`)
      const data = await response.json()
      const result = data?.result
      const downloadUrl = result?.download || result?.dl_url || result?.dl
      if (!data?.success || !downloadUrl) throw new Error('The API did not return an audio URL')

      if (Number(result.duration || 0) > MAX_DURATION_SECONDS) {
        await socket.sendMessage(jid, {
          text: `That audio is too long. The limit is ${Math.floor(MAX_DURATION_SECONDS / 60)} minutes.`
        })
        return
      }

      const title = String(result.title || 'White MD audio').slice(0, 200)
      const safeName = title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'white-md-audio'
      await socket.sendMessage(jid, {
        audio: { url: downloadUrl },
        mimetype: 'audio/mpeg',
        fileName: `${safeName}.mp3`,
        ptt: false,
        caption: `*${title}*\n\nDownloaded by White MD`
      })
    } catch (error) {
      logger.error({ err: error }, 'YouTube MP3 command failed')
      try {
        const fallback = await downloadYouTube(input, { format: 'mp3' })
        const title = String(fallback.title || 'White MD audio').slice(0, 200)
        await socket.sendMessage(jid, {
          audio: { url: fallback.downloadUrl },
          mimetype: 'audio/mpeg',
          fileName: `${title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'white-md-audio'}.mp3`,
          ptt: false,
          caption: `*${title}*\n\nDownloaded by White MD via ${fallback.provider}`
        })
      } catch (fallbackError) {
        logger.error({ err: fallbackError }, 'YouTube MP3 fallback failed')
        await socket.sendMessage(jid, {
          text: 'Sorry, I could not download that audio right now. Try again later.'
        })
      }
    }
  }
}
