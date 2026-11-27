'use strict'

const { downloadMediaMessage } = require('@whiskeysockets/baileys')

const MAX_CODE_BYTES = Number(process.env.MAX_OBFUSCATE_BYTES || 512 * 1024)

// Presets: stronger levels give harder-to-read output but bigger, slower code.
const PRESETS = {
  low: {
    compact: true,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayThreshold: 0.75,
    renameGlobals: false
  },
  medium: {
    compact: true,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.8,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    renameGlobals: false
  },
  high: {
    compact: true,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 1,
    stringArrayWrappersCount: 2,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.8,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.3,
    selfDefending: true,
    renameGlobals: false
  }
}

function quotedOf(message) {
  const context = message?.message?.extendedTextMessage?.contextInfo
  return context?.quotedMessage ? { context, quoted: context.quotedMessage } : null
}

function stripFence(text) {
  const match = String(text).match(/^\s*```[a-z]*\n([\s\S]*?)\n?```\s*$/i)
  return match ? match[1] : text
}

async function readDocument(socket, message, jid, logger) {
  const direct = message?.message?.documentMessage ? message : null
  const q = quotedOf(message)
  const target = direct || (q?.quoted?.documentMessage
    ? { key: { remoteJid: jid, fromMe: false, id: q.context.stanzaId, participant: q.context.participant }, message: q.quoted }
    : null)
  if (!target) return null
  const buffer = await downloadMediaMessage(target, 'buffer', {}, socket, { logger })
  if (buffer.length > MAX_CODE_BYTES) throw new Error(`The file is larger than ${Math.floor(MAX_CODE_BYTES / 1024)} KB`)
  return buffer.toString('utf8')
}

module.exports = {
  command: 'obfuscate',
  aliases: ['obf', 'jsobf'],
  category: 'tools',
  description: 'obfuscate JavaScript code (low, medium or high)',

  async execute({ socket, message, jid, args, prefix = '.', logger }) {
    let level = 'medium'
    const rest = [...(args || [])]
    if (rest[0] && PRESETS[rest[0].toLowerCase()]) level = rest.shift().toLowerCase()

    let code = rest.join(' ').trim()
    if (!code) {
      const q = quotedOf(message)
      code = q?.quoted?.conversation || q?.quoted?.extendedTextMessage?.text || ''
    }
    if (!code) {
      try {
        code = (await readDocument(socket, message, jid, logger)) || ''
      } catch (error) {
        await socket.sendMessage(jid, { text: `I could not read that file: ${error.message}` }, { quoted: message })
        return
      }
    }
    code = stripFence(code).trim()

    if (!code) {
      await socket.sendMessage(jid, {
        text: `*Obfuscator*\n\nUsage:\n${prefix}obfuscate <code>\n${prefix}obfuscate high <code>\nOr reply to a message or .js file with ${prefix}obfuscate [low|medium|high]\n\nLevels: low (fast), medium (default), high (strongest, biggest output).`
      }, { quoted: message })
      return
    }
    if (Buffer.byteLength(code) > MAX_CODE_BYTES) {
      await socket.sendMessage(jid, { text: `That code is too large. The limit is ${Math.floor(MAX_CODE_BYTES / 1024)} KB.` }, { quoted: message })
      return
    }

    let JavaScriptObfuscator
    try {
      JavaScriptObfuscator = require('javascript-obfuscator')
    } catch {
      await socket.sendMessage(jid, { text: 'The obfuscator is not installed. Run "npm install" on the server and restart the bot.' }, { quoted: message })
      return
    }

    try {
      const result = JavaScriptObfuscator.obfuscate(code, { ...PRESETS[level], target: 'node', seed: 0 })
      const output = result.getObfuscatedCode()
      const ratio = (Buffer.byteLength(output) / Math.max(1, Buffer.byteLength(code))).toFixed(1)
      if (output.length <= 3000) {
        await socket.sendMessage(jid, { text: output }, { quoted: message })
      }
      await socket.sendMessage(jid, {
        document: Buffer.from(output, 'utf8'),
        mimetype: 'text/javascript',
        fileName: 'obfuscated.js',
        caption: `Obfuscated (${level}) · ${ratio}x size`
      }, { quoted: message })
    } catch (error) {
      logger?.warn?.({ err: error }, 'Obfuscation failed')
      await socket.sendMessage(jid, { text: `I could not obfuscate that code. Check it is valid JavaScript.\n\n${String(error?.message || '').slice(0, 300)}` }, { quoted: message })
    }
  }
}
