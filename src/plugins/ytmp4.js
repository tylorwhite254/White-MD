const API_BASE = process.env.KNIGHT_API_BASE || 'https://knightbotapi.stream/api/download/ytmp4'
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
  command: ['ytmp4', 'ytvideo'],
  description: 'download a YouTube video',

  async execute({ socket, jid, args, logger }) {
    const input = args[0]
    if (!input || !isYouTubeUrl(input)) {
      await socket.sendMessage(jid, {
        text: 'Usage: .ytmp4 https://youtu.be/VIDEO_ID'
      })
      return
    }

    await socket.sendMessage(jid, { text: 'Preparing the video. Please wait...' })

    try {
      const params = new URLSearchParams({
        apikey: API_KEY,
        format: '480p',
        url: input
      })
      const response = await request(`${API_BASE}?${params}`, {}, { label: 'KnightBot download API' })
      if (!response.ok) throw new Error(`API returned HTTP ${response.status}`)

      const data = await response.json()
      const result = data?.result
      const downloadUrl = result?.download || result?.dl_url || result?.dl
      if (!data?.success || !downloadUrl) {
        throw new Error('The API did not return a video download URL')
      }

      const duration = Number(result.duration || 0)
      if (duration > MAX_DURATION_SECONDS) {
        await socket.sendMessage(jid, {
          text: `That video is too long. The limit is ${Math.floor(MAX_DURATION_SECONDS / 60)} minutes.`
        })
        return
      }

      const title = String(result.title || 'White MD video').slice(0, 200)
      await socket.sendMessage(jid, {
        video: { url: downloadUrl },
        mimetype: 'video/mp4',
        fileName: `${title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'white-md-video'}.mp4`,
        caption: `*${title}*\n\nDownloaded by White MD`
      })
    } catch (error) {
      logger.error({ err: error }, 'YouTube MP4 command failed')
      try {
        const fallback = await downloadYouTube(input, { format: '360' })
        const title = String(fallback.title || 'White MD video').slice(0, 200)
        await socket.sendMessage(jid, {
          video: { url: fallback.downloadUrl },
          mimetype: 'video/mp4',
          fileName: `${title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'white-md-video'}.mp4`,
          caption: `*${title}*\n\nDownloaded by White MD via ${fallback.provider}`
        })
      } catch (fallbackError) {
        logger.error({ err: fallbackError }, 'YouTube MP4 fallback failed')
        await socket.sendMessage(jid, {
          text: 'Sorry, I could not download that video right now. Try another link or try again later.'
        })
      }
    }
  }
}
