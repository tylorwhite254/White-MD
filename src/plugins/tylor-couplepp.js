'use strict'

module.exports = {
  command: 'couplepp',
  description: 'send two random couple profile pictures',

  async execute({ socket, jid, message, logger }) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      const response = await fetch('https://raw.githubusercontent.com/iamriz7/kopel_/main/kopel.json', { signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) throw new Error(`couple image source returned HTTP ${response.status}`)
      const records = await response.json()
      const item = Array.isArray(records) ? records[Math.floor(Math.random() * records.length)] : null
      if (!item?.male || !item?.female) throw new Error('couple image source returned no usable images')
      await socket.sendMessage(jid, { image: { url: item.male }, caption: 'Couple male profile picture\n\nTylor White' }, { quoted: message })
      await socket.sendMessage(jid, { image: { url: item.female }, caption: 'Couple female profile picture\n\nTylor White' }, { quoted: message })
    } catch (error) {
      logger?.error?.({ err: error }, 'Couple profile-picture command failed')
      await socket.sendMessage(jid, { text: 'Could not fetch couple profile pictures right now. Try again later.' }, { quoted: message })
    }
  }
}
