'use strict'

module.exports = {
  command: 'wa',
  async execute({ socket, message, jid, args }) {
    const number = args.join('').replace(/[^0-9]/g, '')
    if (number.length < 7 || number.length > 15) {
      return socket.sendMessage(jid, { text: 'Usage: .wa <international phone number>\nExample: .wa 254700123456' }, { quoted: message })
    }
    return socket.sendMessage(jid, { text: `WhatsApp link:\nhttps://wa.me/${number}` }, { quoted: message })
  }
}
