'use strict'

const express = require('express')
const { exportSessionBundle } = require('./storage')

function installWebPairing(app, hooks) {
  const corsOrigin = process.env.CORS_ORIGIN || '*'
  const pairSecret = String(process.env.WEB_PAIR_SECRET || '').trim()

  app.use(express.json({ limit: '64kb' }))
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Pair-Secret')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  function checkSecret(req, res) {
    if (!pairSecret) return true
    const supplied = String(
      req.headers['x-pair-secret'] ||
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
      req.body?.secret ||
      req.query?.secret ||
      ''
    ).trim()
    if (supplied !== pairSecret) {
      res.status(401).json({ ok: false, error: 'Invalid or missing WEB_PAIR_SECRET.' })
      return false
    }
    return true
  }

  app.get('/api/status', (_req, res) => {
    const state = hooks.getStatus()
    res.json({
      ok: true,
      ...state,
      requiresSecret: Boolean(pairSecret)
    })
  })

  app.post('/api/pair', async (req, res) => {
    if (!checkSecret(req, res)) return
    const phone = String(req.body?.phone || req.body?.number || '').replace(/[^0-9]/g, '')
    if (phone.length < 7 || phone.length > 15) {
      return res.status(400).json({
        ok: false,
        reason: 'invalid-number',
        error: 'Enter a valid international WhatsApp number (7-15 digits, no + or spaces).'
      })
    }
    try {
      const result = await hooks.requestPairingCode(phone)
      if (result?.ok && result.code) {
        return res.json({
          ok: true,
          code: result.code,
          number: result.number,
          message: 'Enter this code in WhatsApp > Linked devices > Link a device > Link with phone number.'
        })
      }
      const statusMap = {
        'already-registered': 409,
        busy: 429,
        'not-ready': 503,
        'invalid-number': 400
      }
      const messageMap = {
        'already-registered': 'A WhatsApp session is already connected. Reset the session first to link another number.',
        busy: 'A pairing request is already in progress. Please wait a few seconds.',
        'not-ready': 'WhatsApp socket is still initializing. Try again in 3 seconds.',
        'request-failed': 'WhatsApp could not generate a pairing code right now. Please try again.'
      }
      return res.status(statusMap[result?.reason] || 500).json({
        ok: false,
        reason: result?.reason || 'request-failed',
        error: messageMap[result?.reason] || 'Could not generate pairing code.'
      })
    } catch (error) {
      return res.status(500).json({ ok: false, error: error?.message || 'Pairing failed.' })
    }
  })

  app.get('/api/session-id', (req, res) => {
    if (!checkSecret(req, res)) return
    const sessionId = exportSessionBundle()
    if (!sessionId) {
      return res.status(404).json({ ok: false, error: 'No saved WhatsApp session yet. Pair a device first.' })
    }
    return res.json({ ok: true, sessionId })
  })

  app.post('/api/reset-session', async (req, res) => {
    if (!checkSecret(req, res)) return
    try {
      await hooks.resetSession()
      return res.json({ ok: true, message: 'Session cleared. Ready to pair a new WhatsApp number.' })
    } catch (error) {
      return res.status(500).json({ ok: false, error: error?.message || 'Could not reset session.' })
    }
  })

  app.get('/', (_req, res) => {
    const botName = hooks.getStatus().botName || 'White MD'
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${botName} — Web Pairing</title>
<style>
  :root { color-scheme: dark; --bg:#0b0f14; --card:#121922; --line:#223041; --text:#eef4fb; --muted:#8fa3b8; --accent:#25d366; --warn:#f59e0b; --err:#ef4444; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--text); min-height:100vh; display:grid; place-items:center; padding:24px; }
  .card { width:100%; max-width:460px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:28px; box-shadow:0 20px 50px rgba(0,0,0,.45); }
  .row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  h1 { margin:0; font-size:22px; letter-spacing:-.02em; }
  .badge { font-size:12px; font-weight:600; padding:4px 10px; border-radius:999px; background:#1c2734; color:var(--muted); }
  .badge.online { background:rgba(37,211,102,.15); color:var(--accent); }
  .badge.pairing { background:rgba(245,158,11,.15); color:var(--warn); }
  p { color:var(--muted); font-size:14px; line-height:1.5; margin:10px 0 18px; }
  label { display:block; font-size:12px; font-weight:600; color:var(--muted); margin:12px 0 6px; text-transform:uppercase; letter-spacing:.05em; }
  input { width:100%; padding:12px 14px; border-radius:10px; border:1px solid var(--line); background:#0c1219; color:var(--text); font-size:15px; }
  button { width:100%; margin-top:14px; padding:12px 16px; border-radius:10px; border:0; background:var(--accent); color:#06210f; font-weight:700; font-size:15px; cursor:pointer; }
  button.secondary { background:#1c2734; color:var(--text); font-weight:600; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  .code-box { margin-top:18px; padding:18px; border-radius:12px; border:1px dashed var(--accent); background:rgba(37,211,102,.08); text-align:center; }
  .code { font-family:ui-monospace,SFMono-Regular,monospace; font-size:28px; font-weight:800; letter-spacing:.2em; color:var(--accent); }
  .msg { margin-top:12px; font-size:13px; color:var(--muted); }
  .msg.err { color:var(--err); }
  .hidden { display:none; }
  textarea { width:100%; min-height:84px; margin-top:8px; padding:10px; border-radius:10px; border:1px solid var(--line); background:#0c1219; color:var(--text); font-family:ui-monospace,monospace; font-size:12px; }
</style>
</head>
<body>
  <main class="card">
    <div class="row">
      <h1>${botName}</h1>
      <span id="statusBadge" class="badge">Checking…</span>
    </div>
    <p>Link your WhatsApp number to bring the bot online. Your session is saved automatically so it stays connected across restarts.</p>

    <div id="secretWrap" class="hidden">
      <label for="secret">Pairing Secret</label>
      <input id="secret" type="password" placeholder="Enter WEB_PAIR_SECRET" />
    </div>

    <div id="pairSection">
      <label for="phone">WhatsApp Number (with country code)</label>
      <input id="phone" type="tel" placeholder="e.g. 254712345678" autocomplete="tel" />
      <button id="pairBtn">Get Pairing Code</button>
    </div>

    <div id="codeBox" class="code-box hidden">
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">ENTER THIS CODE IN WHATSAPP → LINKED DEVICES</div>
      <div id="codeValue" class="code"></div>
      <button id="copyCodeBtn" class="secondary" style="margin-top:12px">Copy Code</button>
    </div>

    <div id="onlineSection" class="hidden">
      <div class="code-box" style="border-style:solid">
        <div style="font-size:14px;font-weight:700;color:var(--accent)">Bot is Online &amp; Session Saved</div>
        <div id="onlineMeta" style="font-size:13px;color:var(--muted);margin-top:6px"></div>
      </div>
      <button id="exportBtn" class="secondary">Show Portable SESSION_ID</button>
      <textarea id="sessionBox" class="hidden" readonly></textarea>
      <button id="resetBtn" class="secondary">Unlink &amp; Pair Another Number</button>
    </div>

    <div id="msg" class="msg"></div>
  </main>
<script>
const $ = (id) => document.getElementById(id);
let lastCode = '';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const s = $('secret').value.trim();
  if (s) h['X-Pair-Secret'] = s;
  return h;
}

function setMsg(text, isErr = false) {
  $('msg').textContent = text || '';
  $('msg').className = isErr ? 'msg err' : 'msg';
}

async function refresh() {
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    if (d.requiresSecret) $('secretWrap').classList.remove('hidden');
    const badge = $('statusBadge');
    if (d.connected) {
      badge.textContent = 'Online';
      badge.className = 'badge online';
      $('pairSection').classList.add('hidden');
      $('codeBox').classList.add('hidden');
      $('onlineSection').classList.remove('hidden');
      $('onlineMeta').textContent = (d.phone ? '+' + d.phone + ' • ' : '') + d.plugins + ' commands • Prefix ' + d.prefix;
    } else {
      badge.textContent = d.status === 'pairing' ? 'Waiting for phone…' : 'Ready to pair';
      badge.className = d.status === 'pairing' ? 'badge pairing' : 'badge';
      $('pairSection').classList.remove('hidden');
      $('onlineSection').classList.add('hidden');
    }
  } catch {
    $('statusBadge').textContent = 'Offline';
  }
}

$('pairBtn').onclick = async () => {
  const phone = $('phone').value.replace(/[^0-9]/g, '');
  if (phone.length < 7) return setMsg('Enter your full international number without + or spaces.', true);
  $('pairBtn').disabled = true;
  setMsg('Requesting pairing code from WhatsApp…');
  try {
    const r = await fetch('/api/pair', { method: 'POST', headers: headers(), body: JSON.stringify({ phone }) });
    const d = await r.json();
    if (!d.ok) return setMsg(d.error || 'Pairing failed.', true);
    lastCode = d.code;
    $('codeValue').textContent = d.code;
    $('codeBox').classList.remove('hidden');
    setMsg('Code ready! Enter it in WhatsApp → Linked devices → Link with phone number.');
  } catch (e) {
    setMsg('Could not reach the bot server.', true);
  } finally {
    $('pairBtn').disabled = false;
  }
};

$('copyCodeBtn').onclick = async () => {
  if (!lastCode) return;
  await navigator.clipboard.writeText(lastCode);
  $('copyCodeBtn').textContent = 'Copied!';
  setTimeout(() => { $('copyCodeBtn').textContent = 'Copy Code'; }, 1500);
};

$('exportBtn').onclick = async () => {
  const r = await fetch('/api/session-id', { headers: headers() });
  const d = await r.json();
  if (!d.ok) return setMsg(d.error || 'Could not export session.', true);
  $('sessionBox').value = d.sessionId;
  $('sessionBox').classList.remove('hidden');
  setMsg('Save this SESSION_ID in your host environment variables so restarts never lose your session.');
};

$('resetBtn').onclick = async () => {
  if (!confirm('Clear the saved WhatsApp session and pair a new number?')) return;
  const r = await fetch('/api/reset-session', { method: 'POST', headers: headers() });
  const d = await r.json();
  if (!d.ok) return setMsg(d.error || 'Reset failed.', true);
  $('sessionBox').classList.add('hidden');
  setMsg(d.message);
  refresh();
};

refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>`)
  })
}

module.exports = { installWebPairing }
