'use strict'

/**
 * Panel-console chat look (Pterodactyl style):
 *
 *   [INFO] [19:30:11] Server started
 *   [WhatsApp] ╭──────────────────────────────╮
 *              │ [19:31:05] Alex: Hey, done?  │
 *              ╰──────────────────────────────╯
 *                          ╭────────────────────────────╮
 *                          │ [19:31:22] Bot: Yes, 5 min │
 *                          ╰────────────────────────────╯
 *
 * Incoming messages sit on the left with a green [WhatsApp] tag, the bot's replies are
 * right-aligned. Borders fade between two neon colours and the words cycle through a palette.
 * Set CONSOLE_CHAT_STYLE=plain (or NO_COLOR=1) for flat, colourless lines.
 */

const RESET = '\x1b[0m'
const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`

const GREEN = rgb(80, 250, 123)
const MAGENTA = rgb(200, 110, 255)
const WHITE = rgb(235, 235, 235)

// Word colours, cycled word by word.
const WORD_PALETTE = [
  rgb(255, 110, 110), // coral
  rgb(255, 205, 90), // amber
  rgb(110, 240, 160), // mint
  rgb(110, 210, 255), // sky
  rgb(255, 130, 220) // pink
]

// Border gradient pairs: incoming (green -> blue) and outgoing (cyan -> pink).
const IN_BORDER = [[80, 250, 123], [60, 150, 255]]
const OUT_BORDER = [[60, 230, 255], [255, 80, 200]]

function plainMode() {
  return String(process.env.CONSOLE_CHAT_STYLE || '').toLowerCase() === 'plain' || Boolean(process.env.NO_COLOR)
}

function enabled() {
  return String(process.env.LOG_WHATSAPP_MESSAGES || 'true').toLowerCase() !== 'false'
}

function clock(date = new Date()) {
  return date.toTimeString().slice(0, 8)
}

// Rough terminal cell width: emoji and CJK take two cells, joiners none.
function charWidth(char) {
  const code = char.codePointAt(0)
  if (code === 0x200d || (code >= 0xfe00 && code <= 0xfe0f) || (code >= 0x300 && code <= 0x36f)) return 0
  if (code >= 0x1f300 || (code >= 0x2600 && code <= 0x27bf) || (code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xff00 && code <= 0xff60)) return 2
  return 1
}

function textWidth(text) {
  let width = 0
  for (const char of text) width += charWidth(char)
  return width
}

function wrapLine(line, max) {
  const out = []
  let current = ''
  let currentWidth = 0
  for (const word of line.split(' ')) {
    const wordWidth = textWidth(word)
    if (currentWidth && currentWidth + 1 + wordWidth > max) {
      out.push(current)
      current = ''
      currentWidth = 0
    }
    if (wordWidth > max) {
      // Hard-split very long words (URLs, base64...).
      for (const char of word) {
        const w = charWidth(char)
        if (currentWidth + w > max) {
          out.push(current)
          current = ''
          currentWidth = 0
        }
        current += char
        currentWidth += w
      }
      continue
    }
    current += (currentWidth ? ' ' : '') + word
    currentWidth += (currentWidth ? 1 : 0) + wordWidth
  }
  if (current || !out.length) out.push(current)
  return out
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}

function gradient(text, [from, to], offset = 0, total = text.length) {
  let out = ''
  let index = 0
  for (const char of text) {
    const t = total <= 1 ? 0 : (index + offset) / (total - 1)
    out += `${rgb(lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t))}${char}`
    index += 1
  }
  return out + RESET
}

// Colour message text word by word.
function colorWords(text) {
  let n = 0
  return text.replace(/\S+/g, (word) => `${WORD_PALETTE[n++ % WORD_PALETTE.length]}${word}${RESET}`)
}

function terminalWidth() {
  return Math.max(60, Number(process.stdout.columns) || 100)
}

/**
 * Build the lines for one chat bubble. Returned lines are already coloured.
 */
function bubble({ direction = 'in', name = 'Unknown', text = '', time = clock() }) {
  const incoming = direction === 'in'
  const tagWidth = incoming ? '[WhatsApp] '.length : 0
  const maxInner = Math.max(24, Math.min(64, terminalWidth() - tagWidth - 8))

  const header = `[${time}] ${name}: `
  const headerWidth = textWidth(header)
  const bodyLines = String(text).replace(/\r/g, '').split('\n').slice(0, 8)
  const wrapped = []
  bodyLines.forEach((line, i) => {
    const room = i === 0 ? maxInner - headerWidth : maxInner
    // The first row shares space with the header; later rows use the full width.
    const rows = wrapLine(line.trim(), Math.max(10, room))
    rows.forEach((row, j) => wrapped.push({ row, first: i === 0 && j === 0 }))
  })
  if (String(text).split('\n').length > 8) wrapped.push({ row: '…', first: false })

  const inner = Math.max(...wrapped.map(({ row, first }) => textWidth(row) + (first ? headerWidth : 0)))
  const pair = incoming ? IN_BORDER : OUT_BORDER
  const total = inner + 4
  const top = gradient(`╭${'─'.repeat(inner + 2)}╮`, pair, 0, total)
  const bottom = gradient(`╰${'─'.repeat(inner + 2)}╯`, pair, 0, total)
  const left = gradient('│', pair, 0, 2)
  const right = gradient('│', pair, 1, 2)

  const body = wrapped.map(({ row, first }) => {
    const prefix = first ? `${GREEN}[${time}]${RESET} ${MAGENTA}${name}:${RESET} ` : ''
    const used = textWidth(row) + (first ? headerWidth : 0)
    return `${left} ${prefix}${colorWords(row)}${' '.repeat(inner - used)} ${right}`
  })

  return [top, ...body, bottom]
}

function print(lines, { direction }) {
  if (direction === 'in') {
    const tag = `${GREEN}[WhatsApp]${RESET} `
    const pad = ' '.repeat('[WhatsApp] '.length)
    // The tag sits on the first text row, like the panel console.
    lines.forEach((line, i) => console.log(`${i === 1 ? tag : pad}${line}`))
    return
  }
  const boxWidth = textWidth(lines[0].replace(/\x1b\[[0-9;]*m/g, ''))
  const indent = ' '.repeat(Math.max(0, terminalWidth() - boxWidth - 2))
  lines.forEach((line) => console.log(`${indent}${line}`))
}

function message({ direction, name, text, time }) {
  if (!enabled()) return
  const safeText = String(text ?? '').trim() || '[empty]'
  if (plainMode()) {
    console.log(`[WhatsApp ${direction === 'in' ? 'IN' : 'OUT'}] [${time || clock()}] ${name}: ${safeText.slice(0, 1000)}`)
    return
  }
  print(bubble({ direction, name, text: safeText.slice(0, 1000), time: time || clock() }), { direction })
}

function incoming(name, text) {
  message({ direction: 'in', name, text })
}

function outgoing(name, text) {
  message({ direction: 'out', name, text })
}

/** [INFO] [19:30:11] text — a plain white status line like the panel's own output. */
function info(text) {
  if (plainMode()) return console.log(`[INFO] [${clock()}] ${text}`)
  console.log(`${WHITE}[INFO] [${clock()}] ${text}${RESET}`)
}

module.exports = { incoming, outgoing, info, bubble, clock, textWidth }
