const COMMANDS = [
  'waifu', 'shinobu', 'megumin', 'bully', 'cuddle', 'cry', 'hug', 'awoo', 'kiss', 'lick', 'pat', 'smug', 'bonk',
  'yeet', 'blush', 'smile', 'wave', 'highfive', 'handhold', 'nom', 'bite', 'glomp', 'slap', 'kill', 'happy',
  'wink', 'poke', 'dance', 'cringe', 'facepalm'
]
const API_URL = process.env.WAIFU_API_URL || 'https://api.waifu.pics/sfw'
const FALLBACK_API_URL = process.env.NEKOS_API_URL || 'https://nekos.best/api/v2'
const { request } = require('../lib/http')

module.exports = {
  command: COMMANDS,
  description: 'anime images and reaction actions',

  async execute({ socket, jid, command, logger }) {
    try {
      let imageUrl = ''
      try {
        const response = await request(`${API_URL}/${encodeURIComponent(command)}`, {}, { label: 'Anime image API', retries: 1 })
        const data = response.ok ? await response.json() : null
        imageUrl = data?.url || ''
      } catch (error) {
        logger.debug({ err: error, command }, 'Primary anime image API unavailable; trying fallback')
      }

      if (!imageUrl) {
        const response = await request(`${FALLBACK_API_URL}/${encodeURIComponent(command)}`, {}, { label: 'Anime fallback API', retries: 1 })
        const data = response.ok ? await response.json() : null
        imageUrl = data?.results?.[0]?.url
      }

      if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) throw new Error('Anime image providers returned no image')
      await socket.sendMessage(jid, { image: { url: imageUrl }, caption: `White MD • ${command}` })
    } catch (error) {
      logger.error({ err: error, command }, 'Anime action failed')
      await socket.sendMessage(jid, { text: `Could not fetch a ${command} image right now.` })
    }
  }
}
