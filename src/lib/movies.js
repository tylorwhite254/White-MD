'use strict'

/**
 * Movie providers. To add another source, write a function that returns normalised results
 * and expose it from a plugin the same way src/plugins/moviedl.js and archive.js do.
 *
 *   YTS      (movies-api.accel.li)  -> torrent / magnet links with quality and seeds
 *   Archive  (archive.org)          -> free public-domain films you can download directly
 */

const { json } = require('./http')

const YTS_BASE = (process.env.MOVIES_API_URL || 'https://movies-api.accel.li/api/v2/').replace(/\/?$/, '/')
const ARCHIVE_SEARCH = 'https://archive.org/advancedsearch.php'
const TRACKERS = [
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:80',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://exodus.desync.com:6969/announce'
]

const QUALITIES = ['480p', '720p', '1080p', '1080p.x265', '2160p', '3D']

function magnet(hash, title) {
  const trackers = TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}${trackers}`
}

/** Search YTS. quality is optional (480p, 720p, 1080p, 2160p). */
async function searchYts(query, { quality, limit = 5 } = {}) {
  const params = new URLSearchParams({ query_term: query, sort_by: 'seeds', limit: String(limit) })
  if (quality) params.set('quality', quality)
  const data = await json(`${YTS_BASE}list_movies.json?${params}`, { headers: { 'user-agent': 'White-MD' } }, { label: 'Movie search', resource: 'YTS', retries: 1 })
  return (data?.data?.movies || []).map((movie) => ({
    id: movie.id,
    title: movie.title_long || movie.title,
    year: movie.year,
    rating: movie.rating,
    runtime: movie.runtime,
    genres: movie.genres || [],
    summary: movie.summary || '',
    cover: movie.large_cover_image || movie.medium_cover_image,
    page: movie.url,
    torrents: (movie.torrents || []).map((t) => ({
      quality: t.quality,
      type: t.type,
      size: t.size,
      seeds: t.seeds,
      peers: t.peers,
      hash: t.hash,
      url: t.url,
      magnet: magnet(t.hash, movie.title_long || movie.title)
    }))
  }))
}

/** Search archive.org feature films that have an MP4. */
async function searchArchive(query, { limit = 8 } = {}) {
  const clean = String(query).replace(/["\\]/g, ' ').trim()
  const q = `collection:feature_films AND format:"MPEG4"${clean ? ` AND title:(${clean})` : ''}`
  const params = new URLSearchParams({ q, rows: String(limit), output: 'json', 'sort[]': 'downloads desc' })
  for (const field of ['identifier', 'title', 'year', 'downloads']) params.append('fl[]', field)
  const data = await json(`${ARCHIVE_SEARCH}?${params}`, { headers: { 'user-agent': 'White-MD' } }, { label: 'Archive search', resource: 'archive.org', retries: 1 })
  return (data?.response?.docs || []).map((doc) => ({
    identifier: doc.identifier,
    title: doc.title,
    year: doc.year,
    downloads: doc.downloads
  }))
}

/** Find the best MP4 file of an archive.org item. */
async function archiveFile(identifier) {
  const data = await json(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { headers: { 'user-agent': 'White-MD' } }, { label: 'Archive item', resource: 'archive.org', retries: 1 })
  const files = (data?.files || [])
    .filter((file) => /\.mp4$/i.test(file.name || '') && Number(file.size) > 0)
    // Prefer the original upload, then the biggest derivative.
    .sort((a, b) => (a.source === 'original' ? -1 : 1) - (b.source === 'original' ? -1 : 1) || Number(b.size) - Number(a.size))
  const file = files[0]
  if (!file) return null
  return {
    title: data?.metadata?.title || identifier,
    name: file.name,
    size: Number(file.size),
    url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file.name)}`
  }
}

module.exports = { searchYts, searchArchive, archiveFile, magnet, QUALITIES }
