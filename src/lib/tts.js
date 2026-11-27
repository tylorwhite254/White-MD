'use strict'

/**
 * Text-to-speech engines with automatic backups.
 *
 *   1 edge        Microsoft Edge voices through the node-edge-tts package (pure Node, no Python)
 *   2 google      Google Translate voice (one robotic voice per language)
 *   3 tiktok      TikTok character voices
 *   4 moonbase    Moonbase Alpha robot voice
 *
 * Everything runs in plain Node, so it works inside a Pterodactyl panel.
 * synthesize() returns { audio: Buffer, mime, engine, voice }.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const MAX_CHARS = Number(process.env.TTS_MAX_CHARS || 1500)

// The roles from the edge-tts example, plus a matching voice on each backup engine.
const ROLES = {
  narrator: { edge: 'en-US-GuyNeural', tiktok: 'en_male_narration' },
  villain: { edge: 'en-GB-RyanNeural', tiktok: 'en_us_ghostface' },
  hero: { edge: 'en-US-ChristopherNeural', tiktok: 'en_us_006' },
  kid: { edge: 'en-US-AnaNeural', tiktok: 'en_us_stitch' },
  ai: { edge: 'en-US-AriaNeural', tiktok: 'en_us_c3po' }
}

const DEFAULT_VOICE = process.env.TTS_VOICE || ROLES.hero.edge

// Popular Edge voices. Any valid Edge voice name also works, even if it is not listed here.
const EDGE_VOICES = {
  'en-US': ['ChristopherNeural', 'GuyNeural', 'EricNeural', 'RogerNeural', 'SteffanNeural', 'AriaNeural', 'JennyNeural', 'MichelleNeural', 'AnaNeural', 'AvaNeural', 'EmmaNeural'],
  'en-GB': ['RyanNeural', 'ThomasNeural', 'SoniaNeural', 'LibbyNeural', 'MaisieNeural'],
  'en-AU': ['WilliamNeural', 'NatashaNeural'],
  'en-IN': ['PrabhatNeural', 'NeerjaNeural'],
  'en-KE': ['ChilembaNeural', 'AsiliaNeural'],
  'en-NG': ['AbeoNeural', 'EzinneNeural'],
  'sw-KE': ['RafikiNeural', 'ZuriNeural'],
  'fr-FR': ['HenriNeural', 'DeniseNeural'],
  'es-ES': ['AlvaroNeural', 'ElviraNeural'],
  'es-MX': ['JorgeNeural', 'DaliaNeural'],
  'pt-BR': ['AntonioNeural', 'FranciscaNeural'],
  'de-DE': ['ConradNeural', 'KatjaNeural'],
  'it-IT': ['DiegoNeural', 'ElsaNeural'],
  'ar-SA': ['HamedNeural', 'ZariyahNeural'],
  'hi-IN': ['MadhurNeural', 'SwaraNeural'],
  'ja-JP': ['KeitaNeural', 'NanamiNeural'],
  'ko-KR': ['InJoonNeural', 'SunHiNeural'],
  'zh-CN': ['YunxiNeural', 'XiaoxiaoNeural'],
  'ru-RU': ['DmitryNeural', 'SvetlanaNeural'],
  'tr-TR': ['AhmetNeural', 'EmelNeural']
}

const VOICE_PATTERN = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$/

function isVoiceName(value = '') {
  return VOICE_PATTERN.test(value)
}

function listVoices(filter = '') {
  const needle = String(filter).toLowerCase()
  const lines = []
  for (const [locale, names] of Object.entries(EDGE_VOICES)) {
    for (const name of names) {
      const full = `${locale}-${name}`
      if (!needle || full.toLowerCase().includes(needle)) lines.push(full)
    }
  }
  return lines
}

function langOf(voice) {
  return String(voice || DEFAULT_VOICE).split('-').slice(0, 2).join('-') || 'en-US'
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), `whitemd-tts-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`)
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS)
}

/** Split long text into pieces a free engine accepts, cutting at sentences or spaces. */
function chunk(text, size) {
  const parts = []
  let rest = text
  while (rest.length > size) {
    let cut = Math.max(rest.lastIndexOf('. ', size), rest.lastIndexOf('! ', size), rest.lastIndexOf('? ', size), rest.lastIndexOf(', ', size))
    if (cut < size / 3) cut = rest.lastIndexOf(' ', size)
    if (cut < 1) cut = size
    parts.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) parts.push(rest)
  return parts.filter(Boolean)
}

function sniff(buffer) {  // kept for engines that may return wav/ogg
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF') return 'audio/wav'
  if (buffer.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg; codecs=opus'
  return 'audio/mpeg'
}

function assertAudio(buffer, label) {
  if (!buffer || buffer.length < 800) throw new Error(`${label} returned no audio`)
  return buffer
}

async function fetchBuffer(url, options = {}, label, timeoutMs = 25000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { redirect: 'follow', ...options, signal: controller.signal })
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`)
    return { buffer: Buffer.from(await response.arrayBuffer()), response }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${label} timed out`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/* ---------- engines ---------- */

async function edge(text, { voice }) {
  const { EdgeTTS } = require('node-edge-tts')
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const file = tmpFile('mp3')
    try {
      const tts = new EdgeTTS({
        voice,
        lang: langOf(voice),
        outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
        rate: process.env.TTS_RATE || 'default',
        pitch: process.env.TTS_PITCH || 'default',
        volume: process.env.TTS_VOLUME || 'default',
        timeout: 20000
      })
      await tts.ttsPromise(text, file)
      return { audio: assertAudio(fs.readFileSync(file), 'Edge TTS'), mime: 'audio/mpeg', voice }
    } catch (error) {
      lastError = error
      await wait(400)
    } finally {
      fs.rm(file, { force: true }, () => {})
    }
  }
  throw new Error(`Edge TTS failed: ${lastError?.message || 'no response'}`)
}

function run(cmd, args, timeoutMs = 40000) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (error) {
      reject(error)
      return
    }
    let stderr = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${cmd} timed out`)) }, timeoutMs)
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(stderr.trim().split('\n').pop() || `${cmd} exited with ${code}`))
    })
  })
}

async function google(text, { voice, lang }) {
  const language = (lang || langOf(voice)).split('-')[0] || 'en'
  const tld = process.env.TTS_GOOGLE_TLD || 'com'
  const buffers = []
  for (const part of chunk(text, 180)) {
    const url = `https://translate.google.${tld}/translate_tts?ie=UTF-8&q=${encodeURIComponent(part)}&tl=${encodeURIComponent(language)}&client=tw-ob`
    const { buffer } = await fetchBuffer(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 'Google TTS')
    buffers.push(assertAudio(buffer, 'Google TTS'))
  }
  return { audio: Buffer.concat(buffers), mime: 'audio/mpeg', voice: `google-${language}` }
}

async function tiktok(text, { tiktokVoice }) {
  const voice = tiktokVoice || process.env.TTS_TIKTOK_VOICE || 'en_us_006'
  const endpoint = process.env.TIKTOK_TTS_URL || 'https://tiktok-tts.weilnet.workers.dev/api/generation'
  const buffers = []
  for (const part of chunk(text, 280)) {
    const { buffer } = await fetchBuffer(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: part, voice })
    }, 'TikTok TTS', 30000)
    let data
    try { data = JSON.parse(buffer.toString('utf8')) } catch { data = null }
    if (!data?.success || !data?.data) throw new Error(`TikTok TTS refused the request${data?.error ? `: ${data.error}` : ''}`)
    buffers.push(assertAudio(Buffer.from(data.data, 'base64'), 'TikTok TTS'))
  }
  return { audio: Buffer.concat(buffers), mime: 'audio/mpeg', voice }
}

async function moonbase(text) {
  const { buffer } = await fetchBuffer(`https://tts.cyzon.us/tts?text=${encodeURIComponent(text.slice(0, 500))}`, {}, 'Moonbase TTS')
  return { audio: assertAudio(buffer, 'Moonbase TTS'), mime: 'audio/wav', voice: 'moonbase' }
}

const ENGINES = { edge, google, tiktok, moonbase }

// Numbered shortcuts: .tts1 .. .tts4
const NUMBERED = { 1: 'edge', 2: 'google', 3: 'tiktok', 4: 'moonbase' }

// Order used by plain .tts.
function autoChain() {
  return ['edge', 'tiktok', 'google', 'moonbase']
}

/**
 * @param text   what to say
 * @param opts   { engine?: name (no fallback when given), voice?, role?, tried?: callback }
 */
async function synthesize(text, opts = {}) {
  const clean = cleanText(text)
  if (!clean) throw new Error('There is no text to speak.')
  const role = opts.role && ROLES[opts.role] ? opts.role : null
  const voice = opts.voice || (role ? ROLES[role].edge : DEFAULT_VOICE)
  const context = { voice, role, tiktokVoice: role ? ROLES[role].tiktok : undefined, lang: opts.lang }

  if (opts.engine) {
    const result = await ENGINES[opts.engine](clean, context)
    return { ...result, engine: opts.engine }
  }

  const failures = []
  for (const name of autoChain()) {
    try {
      const result = await ENGINES[name](clean, context)
      return { ...result, engine: name, failures }
    } catch (error) {
      failures.push(`${name}: ${error?.message || 'failed'}`)
    }
  }
  throw new Error(`Every voice engine failed (${failures.join('; ')})`)
}

/** Turn audio into an Ogg/Opus voice note when ffmpeg exists. Returns null otherwise. */
async function toVoiceNote(audio) {
  const input = tmpFile('in')
  const output = tmpFile('ogg')
  try {
    fs.writeFileSync(input, audio)
    await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-i', input, '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', output], 30000)
    return fs.readFileSync(output)
  } catch {
    return null
  } finally {
    fs.rm(input, { force: true }, () => {})
    fs.rm(output, { force: true }, () => {})
  }
}

module.exports = { synthesize, toVoiceNote, listVoices, isVoiceName, ROLES, NUMBERED, EDGE_VOICES, DEFAULT_VOICE, ENGINES, chunk, cleanText }
