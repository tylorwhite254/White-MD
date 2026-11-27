const API_BASE = process.env.KNIGHT_TIKTOK_API_BASE || 'https://knightbotapi.stream/api/download/tiktok'
const API_KEY = process.env.KNIGHT_API_KEY || 'knight'
const MAX_MEDIA_BYTES = Number(process.env.MAX_MEDIA_BYTES || 50 * 1024 * 1024)
const { request } = require('../lib/http')

function isTikTokUrl(value = '') {
  try {
    const url = new URL(value)
    return ['tiktok.com', 'www.tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com', 'm.tiktok.com'].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

async function inspectMedia(url) {
  try {
    const response = await request(url, { method: 'HEAD' }, { retries: 1, label: 'TikTok media host' })
    return {
      contentType: response.headers.get('content-type') || '',
      contentLength: Number(response.headers.get('content-length') || 0)
    }
  } catch {
    return { contentType: '', contentLength: 0 }
  }
}

module.exports = {
  command: ['tiktok', 'tt'],
  description: 'download a TikTok video or audio',

  async execute({ socket, jid, args, logger }) {
    const input = args[0]
    if (!input || !isTikTokUrl(input)) {
      await socket.sendMessage(jid, {
        text: 'Usage: .tiktok https://vt.tiktok.com/VIDEO_ID'
      })
      return
    }

    await socket.sendMessage(jid, { text: 'Preparing the TikTok media. Please wait...' })

    try {
      let result
      let downloadUrl
      try {
        const params = new URLSearchParams({ apikey: API_KEY, url: input })
        const response = await request(`${API_BASE}?${params}`, {}, { label: 'KnightBot TikTok API' })
        if (!response.ok) throw new Error(`API returned HTTP ${response.status}`)
        const data = await response.json()
        result = data?.result
        downloadUrl = result?.download || result?.dl_url || result?.dl
        if (!data?.success || !downloadUrl) throw new Error('KnightBot returned no media URL')
      } catch (primaryError) {
        logger.warn({ err: primaryError }, 'KnightBot TikTok provider failed; trying TikWM fallback')
        const fallbackUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(input)}`
        const fallbackResponse = await request(fallbackUrl, {}, { label: 'TikWM TikTok API', resource: fallbackUrl })
        if (!fallbackResponse.ok) throw new Error(`TikWM returned HTTP ${fallbackResponse.status}`)
        const fallback = await fallbackResponse.json()
        const item = fallback?.data
        downloadUrl = item?.hdplay || item?.play || item?.wmplay
        if (fallback?.code !== 0 || !downloadUrl) throw new Error('TikWM returned no media URL')
        result = {
          title: item.title,
          author: { nickname: item.author?.nickname || '', fullname: item.author?.unique_id || '' },
          region: item.region || '',
          duration: item.duration || '',
          stats: {},
          music_info: { title: '' }
        }
      }

      const media = await inspectMedia(downloadUrl)
      if (media.contentLength > MAX_MEDIA_BYTES) {
        await socket.sendMessage(jid, {
          text: `That file is too large. The limit is ${Math.floor(MAX_MEDIA_BYTES / 1024 / 1024)} MB.`
        })
        return
      }

      const title = String(result.title || 'White MD TikTok').trim().slice(0, 200)
      const isAudio = media.contentType.startsWith('audio/')
      if (isAudio) {
        await socket.sendMessage(jid, {
          audio: { url: downloadUrl },
          mimetype: media.contentType || 'audio/mpeg',
          fileName: 'white-md-tiktok-audio.mp3',
          ptt: false,
          caption: `*${title}*\n\nDownloaded by White MD`
        })
      } else {
        await socket.sendMessage(jid, {
          video: { url: downloadUrl },
          mimetype: media.contentType || 'video/mp4',
          fileName: 'white-md-tiktok.mp4',
          caption: `*${title}*\n\nDownloaded by White MD`
        })
      }
    } catch (error) {
      logger.error({ err: error }, 'TikTok command failed')
      await socket.sendMessage(jid, {
          text: `Sorry, I could not download that TikTok media right now. ${error.message || 'Try again later.'}`
      })
    }
  }
}
