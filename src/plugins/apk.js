'use strict'

const { json } = require('../lib/http')
const downloader = require('../lib/downloader')

const SEARCH_URL = process.env.APK_SEARCH_URL || 'https://ws75.aptoide.com/api/7/apps/search'
const MAX_APK_BYTES = Number(process.env.MAX_APK_BYTES || 150 * 1024 * 1024)
const APK_MIME = 'application/vnd.android.package-archive'

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function safeName(value) {
  return String(value || 'app').replace(/[^a-z0-9._ -]/gi, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'app'
}

async function searchApps(query) {
  const url = `${SEARCH_URL}?${new URLSearchParams({ query, limit: '5' })}`
  const data = await json(url, { headers: { 'user-agent': 'White-MD' } }, { label: 'APK search', resource: 'Aptoide', retries: 1 })
  return (data?.datalist?.list || [])
    .filter((app) => app?.file?.path)
    .map((app) => ({
      name: app.name,
      pkg: app.package,
      version: app.file.vername,
      size: Number(app.file.filesize || app.size || 0),
      url: app.file.path,
      icon: app.icon,
      developer: app.developer?.name
    }))
}

async function sendApk({ socket, jid, message, url, name, size }) {
  if (size && size > MAX_APK_BYTES) {
    await socket.sendMessage(jid, {
      text: `${name} is ${mb(size)}, above the ${mb(MAX_APK_BYTES)} limit, so here is the direct link instead:\n${url}`
    }, { quoted: message })
    return
  }
  // WhatsApp streams the file from the URL, so large APKs are not held in memory.
  await socket.sendMessage(jid, {
    document: { url },
    mimetype: APK_MIME,
    fileName: `${safeName(name)}.apk`,
    caption: `${name}${size ? ` · ${mb(size)}` : ''}`
  }, { quoted: message })
}

module.exports = {
  command: 'apk',
  aliases: ['apkdl', 'app'],
  category: 'downloads',
  description: 'download an Android APK by app name or link',

  async execute({ socket, message, jid, args, prefix = '.', logger }) {
    const input = (args || []).join(' ').trim()
    if (!input) {
      await socket.sendMessage(jid, {
        text: `*APK downloader*\n\n${prefix}apk telegram\n${prefix}apk com.whatsapp\n${prefix}apk https://example.com/app.apk\n\nI search the app store, then send the APK file here.`
      }, { quoted: message })
      return
    }

    try {
      // Direct .apk link
      if (downloader.isHttpUrl(input) && /\.apk(\?|$)/i.test(input)) {
        await socket.sendMessage(jid, { text: 'Downloading the APK. Please wait...' }, { quoted: message })
        const name = decodeURIComponent(new URL(input).pathname.split('/').pop() || 'app.apk').replace(/\.apk$/i, '')
        await sendApk({ socket, jid, message, url: input, name })
        return
      }

      // Any other link: let the downloader provider find the APK.
      if (downloader.isHttpUrl(input)) {
        await socket.sendMessage(jid, { text: 'Looking for an APK at that link...' }, { quoted: message })
        const items = await downloader.submit(input)
        const apk = items.find((item) => /apk/i.test(item.type) || /\.apk(\?|$)/i.test(item.url)) || items[0]
        await sendApk({ socket, jid, message, url: apk.url, name: 'download' })
        return
      }

      await socket.sendMessage(jid, { text: `Searching for *${input}*...` }, { quoted: message })
      const apps = await searchApps(input)
      if (!apps.length) {
        await socket.sendMessage(jid, { text: `No APK found for "${input}". Try the exact app name or its package id.` }, { quoted: message })
        return
      }

      const top = apps[0]
      const others = apps.slice(1).map((app) => `• ${app.name} — ${prefix}apk ${app.pkg}`).join('\n')
      const info = `*${top.name}*\n📦 ${top.pkg}\n🏷️ v${top.version}\n💾 ${mb(top.size)}${top.developer ? `\n👤 ${top.developer}` : ''}${others ? `\n\n*Other matches*\n${others}` : ''}`
      if (top.icon) await socket.sendMessage(jid, { image: { url: top.icon }, caption: info }, { quoted: message }).catch(() => socket.sendMessage(jid, { text: info }, { quoted: message }))
      else await socket.sendMessage(jid, { text: info }, { quoted: message })

      await sendApk({ socket, jid, message, url: top.url, name: top.name, size: top.size })
    } catch (error) {
      logger?.error?.({ err: error }, 'APK command failed')
      await socket.sendMessage(jid, { text: `I could not get that APK: ${error?.message || 'provider failed.'}` }, { quoted: message })
    }
  }
}
