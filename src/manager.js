'use strict'

// Multi-session manager: runs one bot process per WhatsApp number.
// Each session gets its own data folder (auth + settings) and internal port.
require('dotenv').config()
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const express = require('express')
const crypto = require('node:crypto')

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const ROOT = path.resolve(__dirname, '..')
const BASE_DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'))
const SESSIONS_DIR = path.join(BASE_DATA, 'sessions')
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 10)
const BASE_CHILD_PORT = Number(process.env.SESSION_BASE_PORT || 4100)
const SECRET = String(process.env.WEB_PAIR_SECRET || '').trim()

fs.mkdirSync(SESSIONS_DIR, { recursive: true })

/** phone -> { phone, port, proc, startedAt, restarts } */
const sessions = new Map()

function cleanPhone(v) { return String(v || '').replace(/[^0-9]/g, '') }

function freePort() {
  const used = new Set([...sessions.values()].map((s) => s.port))
  let p = BASE_CHILD_PORT
  while (used.has(p)) p++
  return p
}

function startSession(phone) {
  const existing = sessions.get(phone)
  const port = existing?.port || freePort()
  const dataDir = path.join(SESSIONS_DIR, phone)
  fs.mkdirSync(dataDir, { recursive: true })
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    DATA_DIR: dataDir,
    WEB_PAIRING: 'true',
    LOGIN_METHOD: '',
    PAIRING_NUMBER: '',
    WEB_PAIR_SECRET: '',
    SESSION_ID: ''
  }
  delete env.AUTH_DIR
  delete env.SETTINGS_FILE
  const proc = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    cwd: ROOT, env, stdio: ['ignore', 'inherit', 'inherit']
  })
  const tokenFile = path.join(dataDir, '.owner-token')
  let token = existing?.token
  if (!token) { try { token = fs.readFileSync(tokenFile, 'utf8').trim() } catch {} }
  if (!token) { token = crypto.randomBytes(24).toString('hex'); fs.writeFileSync(tokenFile, token) }
  const entry = { phone, port, proc, token, startedAt: Date.now(), restarts: existing?.restarts || 0, stopping: false }
  sessions.set(phone, entry)
  proc.on('exit', (code) => {
    const cur = sessions.get(phone)
    if (!cur || cur.proc !== proc || cur.stopping) return
    cur.restarts++
    console.warn(`[manager] session ${phone} exited (${code}), restarting in 5s`)
    setTimeout(() => { if (sessions.get(phone) === cur) startSession(phone) }, 5000)
  })
  return entry
}

async function stopSession(phone) {
  const s = sessions.get(phone)
  if (!s) return
  s.stopping = true
  try { await fetch(`http://127.0.0.1:${s.port}/api/reset-session`, { method: 'POST' }) } catch {}
  try { s.proc.kill('SIGTERM') } catch {}
  sessions.delete(phone)
  setTimeout(() => {
    try { s.proc.kill('SIGKILL') } catch {}
    fs.rmSync(path.join(SESSIONS_DIR, phone), { recursive: true, force: true })
  }, 3000)
}

async function childJson(s, p, init) {
  const r = await fetch(`http://127.0.0.1:${s.port}${p}`, init)
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function waitForChild(s, ms = 60000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { const r = await childJson(s, '/api/status'); if (r.body?.ok) return true } catch {}
    await new Promise((r) => setTimeout(r, 700))
  }
  return false
}

// Restore sessions saved on disk (survives restarts when a persistent disk is mounted).
for (const name of fs.readdirSync(SESSIONS_DIR)) {
  const phone = cleanPhone(name)
  if (phone && phone === name) startSession(phone)
}

const app = express()
app.use(express.json({ limit: '32kb' }))
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pair-Secret, X-Delete-Token')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

function checkSecret(req, res) {
  if (!SECRET) return true
  if (String(req.headers['x-pair-secret'] || req.body?.secret || '').trim() === SECRET) return true
  res.status(401).json({ ok: false, error: 'Wrong or missing pairing secret.' })
  return false
}

app.get('/health', (_req, res) => res.json({ ok: true, sessions: sessions.size }))

function sameToken(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''))
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

// Public list: only how many slots are used. Numbers are never shown to everyone.
app.get('/api/sessions', (_req, res) => {
  res.json({ ok: true, max: MAX_SESSIONS, count: sessions.size, requiresSecret: Boolean(SECRET), sessions: [] })
})

// Returns only the sessions whose owner tokens the caller holds (the browser that paired them).
app.post('/api/sessions/mine', async (req, res) => {
  const tokens = Array.isArray(req.body?.tokens) ? req.body.tokens.slice(0, 20).map(String) : []
  const owned = [...sessions.values()].filter((s) => tokens.some((t) => sameToken(t, s.token)))
  const list = await Promise.all(owned.map(async (s) => {
    let st = {}
    try { st = (await childJson(s, '/api/status')).body } catch {}
    return {
      phone: s.phone,
      connected: Boolean(st.connected),
      status: st.status || 'starting',
      prefix: st.prefix || null,
      plugins: st.plugins || 0,
      startedAt: s.startedAt,
      token: s.token
    }
  }))
  res.json({ ok: true, max: MAX_SESSIONS, count: sessions.size, sessions: list })
})

app.post('/api/sessions', async (req, res) => {
  if (!checkSecret(req, res)) return
  const phone = cleanPhone(req.body?.phone)
  if (phone.length < 7 || phone.length > 15) {
    return res.status(400).json({ ok: false, error: 'Enter a valid number with country code (7-15 digits).' })
  }
  if (sessions.has(phone)) {
    return res.status(409).json({ ok: false, reason: 'duplicate', error: 'This number already has a session. Delete it first to pair again.' })
  }
  if (sessions.size >= MAX_SESSIONS) {
    return res.status(429).json({ ok: false, error: `Session limit reached (${MAX_SESSIONS}). Delete one first.` })
  }
  const s = startSession(phone)
  if (!(await waitForChild(s))) {
    await stopSession(phone)
    return res.status(503).json({ ok: false, error: 'Bot did not start in time. Try again.' })
  }
  // The socket needs a moment before it can issue a pairing code.
  for (let i = 0; i < 30; i++) {
    try {
      const r = await childJson(s, '/api/pair', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone })
      })
      if (r.body?.ok) return res.json({ ok: true, phone, code: r.body.code, token: s.token })
      if (r.body?.reason !== 'not-ready' && r.body?.reason !== 'busy') {
        await stopSession(phone)
        return res.status(r.status || 500).json({ ok: false, error: r.body?.error || 'Pairing failed.' })
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2500))
  }
  await stopSession(phone)
  res.status(503).json({ ok: false, error: 'WhatsApp did not return a code. Try again.' })
})

app.delete('/api/sessions/:phone', async (req, res) => {
  const phone = cleanPhone(req.params.phone)
  const s = sessions.get(phone)
  if (!s) return res.status(404).json({ ok: false, error: 'Session not found.' })
  const isAdmin = SECRET && String(req.headers['x-pair-secret'] || '').trim() === SECRET
  if (!isAdmin && !sameToken(req.headers['x-delete-token'], s.token)) {
    return res.status(403).json({ ok: false, error: 'Only the browser that paired this number can delete it.' })
  }
  await stopSession(phone)
  res.json({ ok: true })
})

app.get('/', (_req, res) => res.json({ ok: true, service: 'White MD session manager', sessions: sessions.size }))

app.listen(PORT, HOST, () => console.log(`[manager] listening on ${HOST}:${PORT}`))

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const s of sessions.values()) { s.stopping = true; try { s.proc.kill('SIGTERM') } catch {} }
    process.exit(0)
  })
}
