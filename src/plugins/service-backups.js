const { request } = require('../lib/http')

async function sendCatbox(url) {
  const body = new URLSearchParams({ reqtype: 'url', url })
  const response = await request('https://catbox.moe/user/api.php', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  }, { retries: 1, label: 'Catbox upload API', resource: 'https://catbox.moe/user/api.php' })
  if (!response.ok) throw new Error(`Catbox returned HTTP ${response.status}`)
  const result = (await response.text()).trim()
  if (!/^https?:\/\//i.test(result)) throw new Error('Catbox returned no upload URL')
  return result
}

function findText(value) {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  for (const key of ['result', 'answer', 'response', 'message', 'text', 'solution']) {
    const text = findText(value[key])
    if (text) return text
  }
  return ''
}

function findUrl(value) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value
  if (!value || typeof value !== 'object') return ''
  for (const key of ['url', 'image', 'result', 'download', 'link']) {
    const url = findUrl(value[key])
    if (url) return url
  }
  return ''
}

module.exports = {
  command: ['upload2', 'catbox', 'memegen', 'github2'],
  description: 'numbered media and utility service backups',

  async execute({ socket, jid, args, command, logger }) {
    try {
      if (command === 'upload2' || command === 'catbox') {
        const url = args[0]
        if (!url || !/^https?:\/\//i.test(url)) {
          await socket.sendMessage(jid, { text: `Usage: .${command} https://example.com/file.jpg` })
          return
        }
        const result = await sendCatbox(url)
        await socket.sendMessage(jid, { text: `Catbox URL:\n${result}` })
        return
      }

      if (command === 'memegen') {
        const text = args.join(' ').trim()
        if (!text) {
          await socket.sendMessage(jid, { text: 'Usage: .memegen text for the image' })
          return
        }
        const imageUrl = `https://api.memegen.link/images/custom/-/${encodeURIComponent(text)}.png?background=`
        await socket.sendMessage(jid, { image: { url: imageUrl }, caption: 'White MD • Memegen' })
        return
      }

      if (command === 'github2') {
        const username = (args[0] || '').replace(/^@/, '')
        if (!username) {
          await socket.sendMessage(jid, { text: 'Usage: .github2 username' })
          return
        }
        const response = await request(`https://api.github.com/users/${encodeURIComponent(username)}`, {
          headers: { accept: 'application/vnd.github+json', 'user-agent': 'White-MD' }
        }, { retries: 1, label: 'GitHub API', resource: 'https://api.github.com' })
        if (response.status === 404) throw new Error('GitHub user not found')
        if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`)
        const profile = await response.json()
        const lines = [
          `*GitHub profile: ${profile.login || username}*`,
          profile.name ? `Name: ${profile.name}` : null,
          profile.bio ? `Bio: ${profile.bio}` : null,
          profile.location ? `Location: ${profile.location}` : null,
          `Followers: ${profile.followers ?? 0}`,
          `Following: ${profile.following ?? 0}`,
          `Public repos: ${profile.public_repos ?? 0}`,
          `Profile: ${profile.html_url || `https://github.com/${username}`}`
        ].filter(Boolean)
        await socket.sendMessage(jid, { text: lines.join('\n') })
        return
      }

      if (command === 'mathsolve') {
        const question = args.join(' ').trim()
        if (!question) {
          await socket.sendMessage(jid, { text: 'Usage: .mathsolve equation or maths question' })
          return
        }
        const endpoint = `https://api.maher-zubair.tech/ai/mathssolve?q=${encodeURIComponent(question)}`
        const response = await request(endpoint, {}, { retries: 1, label: 'Maher maths solver', resource: endpoint })
        if (!response.ok) throw new Error(`Maher maths solver returned HTTP ${response.status}`)
        const answer = findText(await response.json())
        if (!answer) throw new Error('Maher maths solver returned no answer')
        await socket.sendMessage(jid, { text: `*White MD Maths Solver*\n\n${answer}` })
        return
      }

      if (command === 'enhance') {
        const imageUrl = args[0]
        if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
          await socket.sendMessage(jid, { text: 'Usage: .enhance https://example.com/image.jpg' })
          return
        }
        const endpoint = `https://api.maher-zubair.tech/maker/enhance?url=${encodeURIComponent(imageUrl)}`
        const response = await request(endpoint, {}, { retries: 1, label: 'Maher image enhance', resource: endpoint })
        if (!response.ok) throw new Error(`Maher image enhance returned HTTP ${response.status}`)
        const type = response.headers.get('content-type') || ''
        if (type.startsWith('image/')) {
          await socket.sendMessage(jid, { image: Buffer.from(await response.arrayBuffer()), caption: 'White MD • Enhanced image' })
        } else {
          const enhancedUrl = findUrl(await response.json())
          if (!enhancedUrl) throw new Error('Maher image enhance returned no image')
          await socket.sendMessage(jid, { image: { url: enhancedUrl }, caption: 'White MD • Enhanced image' })
        }
      }
    } catch (error) {
      logger.error({ err: error, command }, 'Service backup command failed')
      await socket.sendMessage(jid, { text: `The ${command} service is unavailable right now. Try again later.` })
    }
  }
}
