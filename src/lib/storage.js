'use strict'

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(PROJECT_ROOT, 'data'))
const AUTH_DIR = process.env.AUTH_DIR
  ? path.resolve(process.env.AUTH_DIR)
  : path.join(DATA_DIR, 'auth_info')

const SESSION_PREFIX = 'WHITE-MD~'

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
}

function dataPath(filename) {
  ensureDir(DATA_DIR)
  return path.join(DATA_DIR, filename)
}

/**
 * Migrate legacy root-level data files/folders into DATA_DIR on first boot
 * so upgrading an existing bot never loses settings or sessions.
 */
function migrateLegacyFiles() {
  ensureDir(DATA_DIR)
  const legacyJsonFiles = [
    'bot_settings.json',
    'group_settings.json',
    'warnings.json',
    'tts_settings.json'
  ]
  for (const name of legacyJsonFiles) {
    const legacy = path.join(PROJECT_ROOT, name)
    const target = path.join(DATA_DIR, name)
    if (fs.existsSync(legacy) && !fs.existsSync(target)) {
      try {
        fs.copyFileSync(legacy, target)
      } catch {
        // Ignore copy failure; original remains untouched
      }
    }
  }

  const legacyAuth = path.join(PROJECT_ROOT, 'auth_info')
  const legacyCreds = path.join(legacyAuth, 'creds.json')
  const targetCreds = path.join(AUTH_DIR, 'creds.json')
  if (legacyAuth !== AUTH_DIR && fs.existsSync(legacyCreds) && !fs.existsSync(targetCreds)) {
    try {
      ensureDir(AUTH_DIR)
      for (const entry of fs.readdirSync(legacyAuth)) {
        const src = path.join(legacyAuth, entry)
        const dst = path.join(AUTH_DIR, entry)
        if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
          fs.copyFileSync(src, dst)
        }
      }
    } catch {
      // Ignore copy failure
    }
  }
}

/**
 * Atomic JSON write with automatic .bak copy so a crash or restart mid-write
 * can never leave a half-written or corrupted JSON file.
 */
function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath)
  ensureDir(dir)
  const serialized = `${JSON.stringify(data, null, 2)}\n`
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`
  const bakPath = `${filePath}.bak`

  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, bakPath)
    } catch {
      // Best-effort backup
    }
  }

  fs.writeFileSync(tmpPath, serialized, 'utf8')
  fs.renameSync(tmpPath, filePath)
}

/**
 * Read JSON safely, automatically falling back to the .bak file if the main
 * file was corrupted.
 */
function readJsonSafe(filePath, fallback = {}) {
  for (const candidate of [filePath, `${filePath}.bak`]) {
    try {
      if (!fs.existsSync(candidate)) continue
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'))
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      // Try backup next
    }
  }
  return typeof fallback === 'function' ? fallback() : fallback
}

/**
 * Export the current WhatsApp creds + settings into a portable SESSION_ID string.
 * Users on ephemeral hosts (Render, Heroku, Railway free tier) can paste this
 * into their SESSION_ID environment variable so restarts never lose the session.
 */
function exportSessionBundle() {
  const credsPath = path.join(AUTH_DIR, 'creds.json')
  if (!fs.existsSync(credsPath)) return null

  const payload = {
    v: 1,
    exportedAt: new Date().toISOString(),
    creds: JSON.parse(fs.readFileSync(credsPath, 'utf8')),
    settings: readJsonSafe(dataPath('bot_settings.json'), {}),
    groups: readJsonSafe(dataPath('group_settings.json'), {}),
    notes: readJsonSafe(dataPath('notes.json'), {}),
    afk: readJsonSafe(dataPath('afk.json'), {})
  }

  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${SESSION_PREFIX}${compressed.toString('base64')}`
}

/**
 * Restore auth_info/creds.json and settings from a SESSION_ID string if local
 * creds.json does not already exist.
 */
function restoreSessionBundle(sessionId = process.env.SESSION_ID) {
  const raw = String(sessionId || '').trim()
  if (!raw) return { restored: false, reason: 'no-session-id' }

  const credsPath = path.join(AUTH_DIR, 'creds.json')
  if (fs.existsSync(credsPath)) {
    return { restored: false, reason: 'local-session-exists' }
  }

  try {
    const encoded = raw.startsWith(SESSION_PREFIX) ? raw.slice(SESSION_PREFIX.length) : raw
    let jsonText
    try {
      jsonText = zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')
    } catch {
      // Also accept plain base64 JSON creds.json for compatibility
      jsonText = Buffer.from(encoded, 'base64').toString('utf8')
    }
    const parsed = JSON.parse(jsonText)
    const creds = parsed?.creds && typeof parsed.creds === 'object' ? parsed.creds : parsed
    if (!creds || typeof creds !== 'object' || !creds.noiseKey) {
      return { restored: false, reason: 'invalid-session-payload' }
    }

    ensureDir(AUTH_DIR)
    writeJsonAtomic(credsPath, creds)

    if (parsed?.settings && typeof parsed.settings === 'object' && !fs.existsSync(dataPath('bot_settings.json'))) {
      writeJsonAtomic(dataPath('bot_settings.json'), parsed.settings)
    }
    if (parsed?.groups && typeof parsed.groups === 'object' && !fs.existsSync(dataPath('group_settings.json'))) {
      writeJsonAtomic(dataPath('group_settings.json'), parsed.groups)
    }
    if (parsed?.notes && typeof parsed.notes === 'object' && !fs.existsSync(dataPath('notes.json'))) {
      writeJsonAtomic(dataPath('notes.json'), parsed.notes)
    }
    if (parsed?.afk && typeof parsed.afk === 'object' && !fs.existsSync(dataPath('afk.json'))) {
      writeJsonAtomic(dataPath('afk.json'), parsed.afk)
    }
    return { restored: true }
  } catch (error) {
    return { restored: false, reason: error.message }
  }
}

/**
 * Optional remote HTTP backup sync for ephemeral hosts.
 * Configure SESSION_SYNC_URL (GET to restore, PUT/POST to save) and optional SESSION_SYNC_TOKEN.
 */
async function pullRemoteBackup(logger) {
  const url = String(process.env.SESSION_SYNC_URL || '').trim()
  if (!url || fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) return false
  try {
    const headers = {}
    if (process.env.SESSION_SYNC_TOKEN) {
      headers.Authorization = `Bearer ${process.env.SESSION_SYNC_TOKEN}`
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return false
    const body = await res.json().catch(() => null)
    const bundle = typeof body === 'string' ? body : body?.sessionId
    if (!bundle) return false
    const result = restoreSessionBundle(bundle)
    if (result.restored && logger) logger.info('Restored WhatsApp session and settings from SESSION_SYNC_URL')
    return result.restored
  } catch (error) {
    if (logger) logger.warn({ err: error }, 'Remote session restore failed; continuing with local storage')
    return false
  }
}

let syncTimer = null
function scheduleRemoteBackup(logger) {
  const url = String(process.env.SESSION_SYNC_URL || '').trim()
  if (!url) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(async () => {
    syncTimer = null
    const sessionId = exportSessionBundle()
    if (!sessionId) return
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (process.env.SESSION_SYNC_TOKEN) {
        headers.Authorization = `Bearer ${process.env.SESSION_SYNC_TOKEN}`
      }
      await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId, updatedAt: new Date().toISOString() }),
        signal: AbortSignal.timeout(10000)
      })
    } catch (error) {
      if (logger) logger.debug({ err: error }, 'Remote session backup failed')
    }
  }, 3000)
  syncTimer.unref?.()
}

migrateLegacyFiles()

module.exports = {
  AUTH_DIR,
  DATA_DIR,
  PROJECT_ROOT,
  SESSION_PREFIX,
  dataPath,
  ensureDir,
  exportSessionBundle,
  migrateLegacyFiles,
  pullRemoteBackup,
  readJsonSafe,
  restoreSessionBundle,
  scheduleRemoteBackup,
  writeJsonAtomic
}
