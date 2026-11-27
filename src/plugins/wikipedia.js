'use strict'

const { json } = require('../lib/http')

module.exports = {
  command: 'wikipedia',
  async execute({ socket, message, jid, args }) {
    const query = args.join(' ').trim()
    if (!query) return socket.sendMessage(jid, { text: 'Usage: .wiki <topic>' }, { quoted: message })
    try {
      const url = new URL('https://en.wikipedia.org/w/api.php')
      url.search = new URLSearchParams({ action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', redirects: '1', format: 'json', formatversion: '2', titles: query })
      const data = await json(url.toString(), { headers: { 'User-Agent': 'White-MD/1.0' } }, { label: 'Wikipedia', resource: 'Wikipedia lookup' })
      const page = data?.query?.pages?.[0]
      const extract = String(page?.extract || '').replace(/\s+/g, ' ').trim()
      if (!extract || page?.missing) return socket.sendMessage(jid, { text: `No Wikipedia result found for: ${query}` }, { quoted: message })
      const clipped = extract.length > 3500 ? `${extract.slice(0, 3497)}...` : extract
      return socket.sendMessage(jid, { text: `Wikipedia: ${page.title || query}\n\n${clipped}` }, { quoted: message })
    } catch (error) {
      return socket.sendMessage(jid, { text: `Wikipedia is unavailable right now: ${error.message}` }, { quoted: message })
    }
  }
}
