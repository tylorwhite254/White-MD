const COMMANDS = ['cat', 'dog', 'fox', 'panda', 'bird', 'koala', 'raccoon', 'kangaroo']
const API_URL = process.env.ANIMAL_API_URL || 'https://some-random-api.com/animal'
const { request } = require('../lib/http')

module.exports = {
  command: COMMANDS,
  description: 'random animal images',

  async execute({ socket, jid, command, logger }) {
    try {
      const response = await request(`${API_URL}/${command}`, {}, { label: 'Animal image API' })
      if (!response.ok) throw new Error(`Animal API returned HTTP ${response.status}`)
      const data = await response.json()
      const image = data?.image || data?.url
      if (!image || !/^https?:\/\//i.test(image)) throw new Error('Animal API returned no image')
      await socket.sendMessage(jid, { image: { url: image }, caption: `White MD • ${command}` })
    } catch (error) {
      logger.error({ err: error, command }, 'Animal command failed')
      await socket.sendMessage(jid, { text: `Could not fetch a ${command} image right now.` })
    }
  }
}
