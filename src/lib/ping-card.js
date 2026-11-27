'use strict'

/**
 * Builds the ".ping" server card: a picture with live CPU, RAM, disk and system details.
 * If the picture cannot be drawn on this host, a text version of the same card is used.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const FONT_FILE = path.join(__dirname, '..', '..', 'assets', 'card-font.ttf')

function cpuTimes() {
  return os.cpus().reduce((acc, cpu) => {
    const t = cpu.times
    acc.idle += t.idle
    acc.total += t.user + t.nice + t.sys + t.idle + t.irq
    return acc
  }, { idle: 0, total: 0 })
}

async function cpuPercent() {
  const a = cpuTimes()
  await new Promise((resolve) => setTimeout(resolve, 250))
  const b = cpuTimes()
  const total = b.total - a.total
  return total > 0 ? Math.max(0, Math.min(100, (1 - (b.idle - a.idle) / total) * 100)) : 0
}

function diskPercent() {
  try {
    const s = fs.statfsSync('/')
    return s.blocks ? (1 - s.bfree / s.blocks) * 100 : 0
  } catch {
    return 0
  }
}

function swapMb() {
  try {
    const info = fs.readFileSync('/proc/meminfo', 'utf8')
    const total = Number(info.match(/SwapTotal:\s+(\d+)/)?.[1] || 0)
    const free = Number(info.match(/SwapFree:\s+(\d+)/)?.[1] || 0)
    return ((total - free) / 1024).toFixed(0)
  } catch {
    return '0'
  }
}

function primaryIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) if (item.family === 'IPv4' && !item.internal) return item.address
  }
  return '127.0.0.1'
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`

function uptimeText(seconds) {
  const s = Math.floor(seconds)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${d ? `${d}d ` : ''}${h}h ${m}m ${s % 60}s`
}

async function collectStats(latencyMs) {
  const mem = process.memoryUsage()
  return {
    latency: latencyMs,
    uptime: uptimeText(process.uptime()),
    systemUptime: uptimeText(os.uptime()),
    cpu: await cpuPercent(),
    ram: (1 - os.freemem() / os.totalmem()) * 100,
    disk: diskPercent(),
    os: `${os.platform()} ${os.release()}`.slice(0, 26),
    arch: os.arch(),
    cores: `${os.cpus().length} core${os.cpus().length === 1 ? '' : 's'}`,
    heap: `${mb(mem.heapUsed)} / ${mb(mem.rss)}`,
    swap: `${swapMb()} MB`,
    ip: primaryIp(),
    node: `Node ${process.version}`
  }
}

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const barColor = (p) => (p >= 70 ? '#ef4444' : p >= 45 ? '#f59e0b' : '#22c55e')

function cardSvg(stats, botName) {
  const W = 800
  const pad = 40
  const inner = W - pad * 2
  let y = 40
  const parts = []
  // Header
  parts.push(`<rect x="${pad}" y="${y}" width="${inner}" height="100" rx="26" fill="url(#hdr)"/>`)
  parts.push(`<text x="${pad + 30}" y="${y + 50}" font-size="34" font-weight="800" fill="#ffffff">SERVER LIVE</text>`)
  parts.push(`<circle cx="${pad + 38}" cy="${y + 76}" r="7" fill="#22c55e"/>`)
  parts.push(`<text x="${pad + 54}" y="${y + 83}" font-size="18" fill="#dbeafe">REALTIME MONITOR · ${esc(stats.latency)} ms</text>`)
  y += 125
  // Uptime
  parts.push(`<rect x="${pad}" y="${y}" width="${inner}" height="120" rx="22" fill="#0f2a22" stroke="#22c55e" stroke-opacity="0.5"/>`)
  parts.push(`<text x="${W / 2}" y="${y + 34}" font-size="17" font-weight="700" fill="#4ade80" text-anchor="middle" letter-spacing="2">BOT UPTIME · REALTIME</text>`)
  parts.push(`<text x="${W / 2}" y="${y + 78}" font-size="38" font-weight="800" fill="#4ade80" text-anchor="middle">${esc(stats.uptime)}</text>`)
  parts.push(`<text x="${W / 2}" y="${y + 104}" font-size="16" fill="#94a3b8" text-anchor="middle">system uptime: ${esc(stats.systemUptime)}</text>`)
  y += 145
  // Bars
  for (const [label, value] of [['CPU LOAD', stats.cpu], ['RAM', stats.ram], ['DISK', stats.disk]]) {
    parts.push(`<rect x="${pad}" y="${y}" width="${inner}" height="96" rx="20" fill="#111a2e"/>`)
    parts.push(`<text x="${pad + 26}" y="${y + 38}" font-size="20" font-weight="700" fill="#e2e8f0">${label}</text>`)
    parts.push(`<text x="${W - pad - 26}" y="${y + 38}" font-size="20" font-weight="700" fill="#e2e8f0" text-anchor="end">${value.toFixed(1)}%</text>`)
    parts.push(`<rect x="${pad + 26}" y="${y + 58}" width="${inner - 52}" height="16" rx="8" fill="#1e293b"/>`)
    parts.push(`<rect x="${pad + 26}" y="${y + 58}" width="${Math.max(16, ((inner - 52) * value) / 100)}" height="16" rx="8" fill="${barColor(value)}"/>`)
    y += 112
  }
  // Grid of details
  const cells = [['OS', stats.os], ['ARCH', stats.arch], ['CPU', stats.cores], ['HEAP / RSS', stats.heap], ['SWAP', stats.swap], ['IP', stats.ip]]
  const cw = (inner - 16) / 2
  cells.forEach(([label, value], i) => {
    const cx = pad + (i % 2) * (cw + 16)
    const cy = y + Math.floor(i / 2) * 100
    parts.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="86" rx="18" fill="#111a2e"/>`)
    parts.push(`<text x="${cx + 22}" y="${cy + 32}" font-size="15" fill="#64748b">${esc(label)}</text>`)
    parts.push(`<text x="${cx + 22}" y="${cy + 64}" font-size="21" fill="#e2e8f0">${esc(value)}</text>`)
  })
  y += 300
  parts.push(`<rect x="${pad}" y="${y}" width="${cw}" height="86" rx="18" fill="#111a2e"/>`)
  parts.push(`<text x="${pad + 22}" y="${y + 32}" font-size="15" fill="#64748b">NODE VERSION</text>`)
  parts.push(`<text x="${pad + 22}" y="${y + 64}" font-size="21" fill="#e2e8f0">${esc(stats.node)}</text>`)
  y += 125
  parts.push(`<text x="${pad}" y="${y}" font-size="16" fill="#64748b">© ${esc(botName.toUpperCase())} · ${new Date().getFullYear()}</text>`)
  const H = y + 35
  // Little stars in the background
  let stars = ''
  for (let i = 0; i < 40; i += 1) stars += `<circle cx="${(i * 197) % W}" cy="${(i * 131) % H}" r="${(i % 3) + 1}" fill="#ffffff" fill-opacity="0.18"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="JetBrains Mono">
<defs><linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="#0b1120"/>${stars}${parts.join('')}</svg>`
}

function cardText(stats, botName) {
  const bar = (p) => `${'█'.repeat(Math.round(p / 10))}${'░'.repeat(10 - Math.round(p / 10))}`
  return [
    `📡 *SERVER LIVE* · ${stats.latency} ms`,
    `⏱️ Uptime: ${stats.uptime}`,
    '',
    `CPU  ${bar(stats.cpu)} ${stats.cpu.toFixed(1)}%`,
    `RAM  ${bar(stats.ram)} ${stats.ram.toFixed(1)}%`,
    `DISK ${bar(stats.disk)} ${stats.disk.toFixed(1)}%`,
    '',
    `OS: ${stats.os} (${stats.arch})`,
    `CPU: ${stats.cores} · Swap: ${stats.swap}`,
    `Heap/RSS: ${stats.heap}`,
    `IP: ${stats.ip} · ${stats.node}`,
    '',
    `_© ${botName} · ${new Date().getFullYear()}_`
  ].join('\n')
}

/** Returns { image?: Buffer, text } for the ping card. */
async function buildPingCard(latencyMs, botName = 'White MD') {
  const stats = await collectStats(latencyMs)
  const text = cardText(stats, botName)
  try {
    const { Resvg } = require('@resvg/resvg-js')
    const resvg = new Resvg(cardSvg(stats, botName), {
      font: { fontFiles: [FONT_FILE], loadSystemFonts: false, defaultFontFamily: 'JetBrains Mono' },
      fitTo: { mode: 'width', value: 800 }
    })
    return { image: resvg.render().asPng(), text }
  } catch (error) {
    return { text }
  }
}

module.exports = { buildPingCard, collectStats, cardSvg }
