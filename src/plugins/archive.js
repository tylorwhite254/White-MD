'use strict'

const { searchArchive, archiveFile } = require('../lib/movies')

const MAX_VIDEO_BYTES = Number(process.env.MAX_MOVIE_BYTES || 300 * 1024 * 1024)

// Last search per chat so ".archive get 2" works.
const lastResults = new Map()

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function safeName(value) {
  return String(value || 'film').replace(/[^a-z0-9._ -]/gi, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'film'
}

module.exports = {
  command: 'archive',
  aliases: ['freefilm', 'freemovies', 'archivefilm'],
  category: 'downloads',
  description: 'search and download free feature films from archive.org',

  async execute({ socket, message, jid, args, prefix = '.', logger }) {
    const rest = [...(args || [])]
    const isGet = rest[0]?.toLowerCase() === 'get'
    if (isGet) rest.shift()

    try {
      if (isGet) {
        const pick = rest.join(' ').trim()
        if (!pick) {
          await socket.sendMessage(jid, { text: `Use ${prefix}archive get <number or identifier>.` }, { quoted: message })
          return
        }
        const identifier = /^\d+$/.test(pick) ? lastResults.get(jid)?.[Number(pick) - 1]?.identifier : pick
        if (!identifier) {
          await socket.sendMessage(jid, { text: `Search first with ${prefix}archive <name>, then use the result number.` }, { quoted: message })
          return
        }
        await socket.sendMessage(jid, { text: 'Looking up the film file...' }, { quoted: message })
        const file = await archiveFile(identifier)
        if (!file) {
          await socket.sendMessage(jid, { text: 'That item has no downloadable MP4.' }, { quoted: message })
          return
        }
        if (file.size > MAX_VIDEO_BYTES) {
          await socket.sendMessage(jid, {
            text: `*${file.title}* is ${mb(file.size)}, above the ${mb(MAX_VIDEO_BYTES)} limit. Direct link:\n${file.url}`
          }, { quoted: message })
          return
        }
        await socket.sendMessage(jid, { text: `Sending *${file.title}* (${mb(file.size)}). Large files take a while...` }, { quoted: message })
        await socket.sendMessage(jid, {
          document: { url: file.url },
          mimetype: 'video/mp4',
          fileName: `${safeName(file.title)}.mp4`,
          caption: `${file.title} · ${mb(file.size)}`
        }, { quoted: message })
        return
      }

      const query = rest.join(' ').trim()
      await socket.sendMessage(jid, { text: query ? `Searching archive.org for *${query}*...` : 'Loading the most downloaded free films...' }, { quoted: message })
      const films = await searchArchive(query)
      if (!films.length) {
        await socket.sendMessage(jid, { text: `No free films found for "${query}".` }, { quoted: message })
        return
      }
      lastResults.set(jid, films)
      const list = films.map((film, i) => `*${i + 1}.* ${film.title}${film.year ? ` (${film.year})` : ''}\n   ${film.identifier}`).join('\n\n')
      await socket.sendMessage(jid, {
        text: `*Free films · archive.org*\n\n${list}\n\nDownload one: ${prefix}archive get 1`
      }, { quoted: message })
    } catch (error) {
      logger?.error?.({ err: error }, 'Archive command failed')
      await socket.sendMessage(jid, { text: `Archive request failed: ${error?.message || 'provider unavailable.'}` }, { quoted: message })
    }
  }
}
