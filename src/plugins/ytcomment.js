'use strict'

const { binary } = require('../lib/http')

module.exports = {
  command: 'ytcomment',
  async execute({ socket, message, jid, args }) {
    const text = args.join(' ').trim()
    if (!text) return socket.sendMessage(jid, { text: 'Usage: .ytcomment <comment>' }, { quoted: message })
    try {
      const url = new URL('https://api.some-random-api.com/canvas/misc/youtube-comment')
      url.search = new URLSearchParams({ avatar: 'https://i.pravatar.cc/150?img=12', username: 'White MD', comment: text.slice(0, 500) })
      const response = await binary(url.toString(), { headers: { 'User-Agent': 'White-MD/1.0' } }, { label: 'YouTube comment image', resource: 'YouTube comment image' })
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!buffer.length || !String(response.headers.get('content-type') || '').startsWith('image/')) throw new Error('provider returned an invalid image')
      return socket.sendMessage(jid, { image: buffer, caption: `YouTube comment by White MD\n${text.slice(0, 500)}` }, { quoted: message })
    } catch (error) {
      return socket.sendMessage(jid, { text: `YouTube comment image is unavailable right now: ${error.message}` }, { quoted: message })
    }
  }
}
