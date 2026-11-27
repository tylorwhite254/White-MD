'use strict'

module.exports = {
  command: 'coffe',
  aliases: ['coffee', 'tea', 'kofi'],
  description: 'send a random coffee image',

  async execute({ socket, jid, message }) {
    await socket.sendMessage(jid, {
      image: { url: 'https://coffee.alexflipnote.dev/random' },
      caption: 'Here is your coffee...\n\nTylor White'
    }, { quoted: message })
  }
}
