'use strict'

const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const { request } = require('../lib/http')
const downloader = require('../lib/downloader')

const MAX_MEDIA_BYTES = Number(process.env.MAX_MEDIA_BYTES || 50 * 1024 * 1024)
const CATBOX_ENDPOINT = process.env.CATBOX_UPLOAD_URL || 'https://catbox.moe/user/api.php'

function getQuotedMessage(message, jid) {
  const context = message?.message?.extendedTextMessage?.contextInfo
  if (!context?.quotedMessage) return null
  return {
    key: {
      remoteJid: jid,
      fromMe: false,
      id: context.stanzaId || `white-md-url-${Date.now()}`,
      participant: context.participant
    },
    message: context.quotedMessage
  }
}

function mediaInfo(message) {
  const content = message?.message || {}
  const types = [
    ['imageMessage', '.jpg'],
    ['videoMessage', '.mp4'],
    ['audioMessage', '.mp3'],
    ['stickerMessage', '.webp'],
    ['documentMessage', null]
  ]
  for (const [type, defaultExt] of types) {
    const media = content[type]
    if (!media) continue
    const filename = media.fileName || `white-md-media${defaultExt || '.bin'}`
    const ext = defaultExt || (filename.includes('.') ? `.${filename.split('.').pop()}` : '.bin')
    return {
      type,
      filename: filename.replace(/[^a-z0-9._-]/gi, '_').slice(0, 120) || `white-md-media${ext}`,
      mimetype: media.mimetype || 'application/octet-stream'
    }
  }
  return null
}

// Upload hosts, tried in order until one returns a public link.
// Add another host by pushing { name, upload(buffer, filename) -> url } to HOSTS.
async function postForm(endpoint, form, label, headers = {}) {
  return request(endpoint, {
    method: 'POST',
    headers: { 'user-agent': 'Mozilla/5.0 White-MD', ...headers },
    body: form
  }, { retries: 0, timeoutMs: 45000, label, resource: endpoint })
}

const HOSTS = [
  {
    name: 'Catbox',
    async upload(buffer, filename) {
      const form = new FormData()
      form.append('reqtype', 'fileupload')
      if (process.env.CATBOX_USERHASH) form.append('userhash', process.env.CATBOX_USERHASH)
      form.append('fileToUpload', new Blob([buffer]), filename)
      const response = await postForm(CATBOX_ENDPOINT, form, 'Catbox media upload')
      return (await response.text()).trim()
    }
  },
  {
    name: 'Uguu',
    async upload(buffer, filename) {
      const form = new FormData()
      form.append('files[]', new Blob([buffer]), filename)
      const response = await postForm('https://uguu.se/upload?output=json', form, 'Uguu media upload')
      const data = await response.json().catch(() => null)
      return data?.files?.[0]?.url || ''
    }
  },
  {
    name: 'Litterbox',
    async upload(buffer, filename) {
      const form = new FormData()
      form.append('reqtype', 'fileupload')
      form.append('time', '72h')
      form.append('fileToUpload', new Blob([buffer]), filename)
      const response = await postForm('https://litterbox.catbox.moe/resources/internals/api.php', form, 'Litterbox media upload')
      return (await response.text()).trim()
    }
  },
  {
    name: 'tmpfiles',
    async upload(buffer, filename) {
      const form = new FormData()
      form.append('file', new Blob([buffer]), filename)
      const response = await postForm('https://tmpfiles.org/api/v1/upload', form, 'tmpfiles media upload')
      const data = await response.json().catch(() => null)
      // The page link must be turned into the direct-download link.
      return String(data?.data?.url || '').replace('tmpfiles.org/', 'tmpfiles.org/dl/')
    }
  }
]

async function uploadAnywhere(buffer, filename, logger) {
  const failures = []
  for (const host of HOSTS) {
    try {
      const url = await host.upload(buffer, filename)
      if (/^https?:\/\//i.test(url)) return { url, host: host.name }
      failures.push(`${host.name}: no link returned`)
    } catch (error) {
      failures.push(`${host.name}: ${error?.message || 'failed'}`)
    }
    logger?.warn?.({ host: host.name }, 'Upload host failed; trying the next one')
  }
  throw new Error(`Every upload host failed (${failures.join('; ')})`)
}

module.exports = {
  command: 'url',
  aliases: ['geturl', 'mediaurl', 'dl'],
  description: 'media -> public link, or a video/page link -> downloadable files',

  async execute({ socket, message, jid, args, logger }) {
    // .url <link>: resolve the page with the downloader provider and send the files.
    const link = (args || []).find((arg) => downloader.isHttpUrl(arg))
    if (link) {
      try {
        await socket.sendMessage(jid, { text: 'Fetching that link. Please wait...' }, { quoted: message })
        const items = await downloader.submit(link)
        await downloader.deliver({ socket, jid, message, items, logger })
      } catch (error) {
        logger?.error?.({ err: error }, 'Downloader provider failed')
        await socket.sendMessage(jid, { text: `I could not download that link: ${error?.message || 'provider failed.'}` }, { quoted: message })
      }
      return
    }

    const current = mediaInfo(message) ? message : null
    const quoted = current ? null : getQuotedMessage(message, jid)
    const target = current || quoted
    const info = mediaInfo(target)

    if (!target || !info) {
      await socket.sendMessage(jid, {
        text: 'Send or reply to media with .url to get a public link, or use .url <video link> to download it. Media links are public.'
      }, { quoted: message })
      return
    }

    try {
      const buffer = await downloadMediaMessage(target, 'buffer', {}, socket, { logger })
      if (!buffer?.length) throw new Error('The media is empty or unavailable')
      if (buffer.length > MAX_MEDIA_BYTES) {
        throw new Error(`The media exceeds the ${Math.floor(MAX_MEDIA_BYTES / 1024 / 1024)} MB limit`)
      }
      const { url, host } = await uploadAnywhere(buffer, info.filename, logger)
      await socket.sendMessage(jid, {
        text: `Public URL:\n${url}\n\nUploaded by White MD via ${host}.`,
        contextInfo: { externalAdReply: { title: 'White MD public media URL', body: `${host} upload` } }
      }, { quoted: message })
    } catch (error) {
      logger?.error?.({ err: error }, 'Media-to-URL command failed')
      await socket.sendMessage(jid, {
        text: `I could not create a public URL: ${error?.message || 'media upload failed.'}`
      }, { quoted: message })
    }
  }
}
