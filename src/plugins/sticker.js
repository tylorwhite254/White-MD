'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { downloadContentFromMessage } = require('@whiskeysockets/baileys')

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 30000 }, (err, _stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message || 'ffmpeg conversion failed'))
      resolve()
    })
  })
}

async function downloadMedia(msg, type) {
  const stream = await downloadContentFromMessage(msg, type)
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function findMediaTarget(message) {
  const root = message?.message || {}
  if (root.imageMessage) return { media: root.imageMessage, type: 'image' }
  if (root.videoMessage) return { media: root.videoMessage, type: 'video' }
  const quoted = root.extendedTextMessage?.contextInfo?.quotedMessage || {}
  if (quoted.imageMessage) return { media: quoted.imageMessage, type: 'image' }
  if (quoted.videoMessage) return { media: quoted.videoMessage, type: 'video' }
  return null
}

module.exports = {
  command: ['sticker', 's'],
  category: 'media',
  description: 'convert a replied image or short video into a WhatsApp sticker',

  async execute({ socket, message, jid, prefix }) {
    const target = findMediaTarget(message)
    if (!target) {
      await socket.sendMessage(jid, {
        text: `Reply to an image or short video with *${prefix}sticker* (or *${prefix}s*) to make a sticker.`
      }, { quoted: message })
      return
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitemd-sticker-'))
    const inFile = path.join(tmpDir, target.type === 'video' ? 'input.mp4' : 'input.jpg')
    const outFile = path.join(tmpDir, 'output.webp')

    try {
      const buffer = await downloadMedia(target.media, target.type)
      fs.writeFileSync(inFile, buffer)

      const vf = 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
      const args = target.type === 'video'
        ? ['-y', '-i', inFile, '-t', '7', '-vf', `fps=12,${vf}`, '-vcodec', 'libwebp', '-lossless', '0', '-q:v', '60', '-loop', '0', '-an', '-vsync', '0', outFile]
        : ['-y', '-i', inFile, '-vf', vf, '-vcodec', 'libwebp', '-lossless', '0', '-q:v', '80', outFile]

      await runFfmpeg(args)
      await socket.sendMessage(jid, { sticker: fs.readFileSync(outFile) }, { quoted: message })
    } catch (error) {
      const msg = /ENOENT/i.test(String(error.message))
        ? 'Sticker conversion needs ffmpeg installed on the server.'
        : `Could not create sticker: ${error.message}`
      await socket.sendMessage(jid, { text: msg }, { quoted: message })
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }
}
