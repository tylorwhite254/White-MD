'use strict'

const { request } = require('../lib/http')
const { searchYts, QUALITIES } = require('../lib/movies')

// Last search per chat so ".moviedl get 2 1080p" works without retyping the name.
const lastResults = new Map()

function safeName(value) {
  return String(value || 'movie').replace(/[^a-z0-9._ -]/gi, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'movie'
}

function formatMovie(movie, index, prefix) {
  const torrents = movie.torrents.length
    ? movie.torrents.map((t) => `   • ${t.quality} ${t.type || ''} · ${t.size} · 🌱 ${t.seeds}`).join('\n')
    : '   • no torrents listed'
  return `*${index + 1}. ${movie.title}*\n⭐ ${movie.rating}/10 · ⏱️ ${movie.runtime} min · ${movie.genres.slice(0, 3).join(', ')}\n${torrents}`
}

module.exports = {
  command: 'moviedl',
  aliases: ['movies', 'yify', 'torrentmovie'],
  category: 'downloads',
  description: 'search movies and get torrent or magnet links (YTS)',

  async execute({ socket, message, jid, args, prefix = '.', logger }) {
    const rest = [...(args || [])]
    if (!rest.length) {
      await socket.sendMessage(jid, {
        text: `*Movie downloader*\n\n${prefix}moviedl inception\n${prefix}moviedl inception 1080p\n${prefix}moviedl get 1 1080p  (send the .torrent file of result 1)\n${prefix}moviedl magnet 1 1080p  (get the magnet link)\n\nQualities: ${QUALITIES.join(', ')}\n\nFree public-domain films you can download directly: ${prefix}archive`
      }, { quoted: message })
      return
    }

    try {
      const action = ['get', 'magnet'].includes(rest[0].toLowerCase()) ? rest.shift().toLowerCase() : 'search'

      if (action !== 'search') {
        const results = lastResults.get(jid)
        const index = Number(rest.shift()) - 1
        const quality = rest.find((word) => QUALITIES.includes(word))
        const movie = results?.[index]
        if (!movie) {
          await socket.sendMessage(jid, { text: `Search first with ${prefix}moviedl <name>, then pick a result number.` }, { quoted: message })
          return
        }
        const torrent = (quality ? movie.torrents.find((t) => t.quality === quality) : null)
          || movie.torrents.find((t) => t.quality === '1080p')
          || movie.torrents[0]
        if (!torrent) {
          await socket.sendMessage(jid, { text: 'That movie has no torrent for the quality you asked for.' }, { quoted: message })
          return
        }
        if (action === 'magnet') {
          await socket.sendMessage(jid, { text: `*${movie.title}* · ${torrent.quality}\n\n${torrent.magnet}` }, { quoted: message })
          return
        }
        const response = await request(torrent.url, { headers: { 'user-agent': 'White-MD' } }, { retries: 1, timeoutMs: 30000, label: 'Torrent file', resource: 'YTS' })
        if (!response.ok) throw new Error(`The torrent host returned HTTP ${response.status}`)
        const file = Buffer.from(await response.arrayBuffer())
        await socket.sendMessage(jid, {
          document: file,
          mimetype: 'application/x-bittorrent',
          fileName: `${safeName(movie.title)}-${torrent.quality}.torrent`,
          caption: `${movie.title} · ${torrent.quality} · ${torrent.size}\nOpen it with a torrent app such as qBittorrent or LibreTorrent.`
        }, { quoted: message })
        return
      }

      const quality = rest.find((word) => QUALITIES.includes(word))
      const query = rest.filter((word) => word !== quality).join(' ')
      await socket.sendMessage(jid, { text: `Searching for *${query}*...` }, { quoted: message })
      const movies = await searchYts(query, { quality })
      if (!movies.length) {
        await socket.sendMessage(jid, { text: `No movies found for "${query}"${quality ? ` in ${quality}` : ''}.` }, { quoted: message })
        return
      }
      lastResults.set(jid, movies)
      const text = `${movies.map((m, i) => formatMovie(m, i, prefix)).join('\n\n')}\n\nGet a file: ${prefix}moviedl get 1 1080p\nMagnet link: ${prefix}moviedl magnet 1 1080p`
      if (movies[0].cover) {
        await socket.sendMessage(jid, { image: { url: movies[0].cover }, caption: text }, { quoted: message })
          .catch(() => socket.sendMessage(jid, { text }, { quoted: message }))
      } else {
        await socket.sendMessage(jid, { text }, { quoted: message })
      }
    } catch (error) {
      logger?.error?.({ err: error }, 'Movie command failed')
      await socket.sendMessage(jid, { text: `Movie search failed: ${error?.message || 'provider unavailable.'}` }, { quoted: message })
    }
  }
}
