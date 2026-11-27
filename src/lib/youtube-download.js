"use strict"

const axios = require('axios')

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
const SAVE_BASE = (process.env.YT_SAVE_BASE || 'https://p.savenow.to').replace(/\/$/, '')
// Set YT_SAVE_KEY in the hosting environment; never embed provider credentials in source.
const SAVE_KEY = process.env.YT_SAVE_KEY || ''
const QASIM_API = process.env.MEGA_PLAY_API_URL || 'https://api.qasimdev.dpdns.org/api/loaderto/download'
const QASIM_KEY = process.env.MEGA_PLAY_API_KEY || 'qasim-dev'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function cleanTitle(value, fallback = 'White MD download') {
  return String(value || fallback).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || fallback
}

function normalize(value, fallback = {}) {
  const data = value?.data && typeof value.data === 'object' ? value.data : value
  const downloadUrl = data?.downloadUrl || data?.download_url || data?.url || data?.link || data?.audio || data?.video
  if (typeof downloadUrl !== 'string' || !/^https?:\/\//i.test(downloadUrl)) return null
  return {
    downloadUrl,
    title: data?.title || fallback.title || 'White MD download',
    thumbnail: data?.thumbnail || data?.thumbnail_url || fallback.thumbnail,
  }
}

async function saveNow(url, format, fallback) {
  if (!SAVE_KEY) throw new Error('YT_SAVE_KEY is not configured')
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: '*/*',
    Referer: 'https://y2down.cc/',
    Origin: 'https://y2down.cc',
  }
  const params = new URLSearchParams({ copyright: '0', format, url, api: SAVE_KEY })
  const start = await axios.get(`${SAVE_BASE}/ajax/download.php?${params}`, { headers, timeout: 30000 })
  if (!start.data?.progress_url) throw new Error('Savenow returned no progress URL')

  const tries = Number(process.env.YT_SAVE_POLLS || 30)
  const interval = Number(process.env.YT_SAVE_POLL_MS || 2000)
  for (let i = 0; i < tries; i += 1) {
    const progress = await axios.get(start.data.progress_url, { headers, timeout: 20000 })
    const result = normalize(progress.data, fallback)
    if (result) return result
    await sleep(interval)
  }
  throw new Error('Savenow timed out while preparing the download')
}

async function qasim(url, format, fallback) {
  const { data } = await axios.get(QASIM_API, {
    params: { apiKey: QASIM_KEY, format, url },
    timeout: 90000,
  })
  const result = normalize(data, fallback)
  if (!result) throw new Error('MEGA provider returned no download URL')
  return result
}

async function downloadYouTube(url, options = {}) {
  const format = options.format || 'mp3'
  const fallback = options.fallback || {}
  const providers = [
    ...(SAVE_KEY ? [{ name: 'Savenow', run: () => saveNow(url, format, fallback) }] : []),
    { name: 'MEGA-QasimDev', run: () => qasim(url, format, fallback) },
  ]
  const failures = []
  for (const provider of providers) {
    try {
      const result = await provider.run()
      return { ...result, provider: provider.name, title: cleanTitle(result.title, fallback.title) }
    } catch (error) {
      failures.push(`${provider.name}: ${error.response?.status || error.message}`)
    }
  }
  throw new Error(`All YouTube providers failed (${failures.join('; ')})`)
}

module.exports = { downloadYouTube, cleanTitle }
