const { request } = require('../lib/http')

const API_ROOT = (process.env.DAVID_CYRIL_API_URL || 'https://apis.davidcyril.name.ng').replace(/\/$/, '')
const API_KEY = String(process.env.DAVID_CYRIL_API_KEY || '').trim()

function apiUrl(path, params = {}) {
  const url = new URL(`${API_ROOT}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url
}

async function getJson(path, params = {}, label = 'DavidCyril API') {
  const headers = { Accept: 'application/json', 'User-Agent': 'White-MD/1.0' }
  if (API_KEY) headers['X-API-Key'] = API_KEY
  const endpoint = apiUrl(path, params)
  const response = await request(endpoint, { headers }, {
    retries: 1,
    timeoutMs: 15000,
    label,
    resource: endpoint.toString()
  })
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`)
  const data = await response.json()
  if (!data || typeof data !== 'object') throw new Error(`${label} returned an invalid response`)
  return data
}

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

module.exports = {
  command: ['davidcalc', 'davidfact', 'davidtruth', 'aidetect'],
  description: 'verified DavidCyril calculator, fact, truth, and AI-detector utilities',

  async execute({ socket, jid, args, command, logger }) {
    const input = args.join(' ').trim()
    try {
      if (command === 'davidcalc') {
        if (!input || !/^[0-9+\-*/%().\s^]+$/.test(input)) {
          await socket.sendMessage(jid, { text: 'Usage: .davidcalc (10+5)*2\nOnly numbers and arithmetic operators are accepted.' })
          return
        }
        const data = await getJson('/tools/calculate', { expr: input }, 'DavidCyril calculator')
        await socket.sendMessage(jid, { text: `*DavidCyril Calculator*\n\n${data.expression || input} = ${data.result ?? 'Unavailable'}` })
        return
      }

      if (command === 'davidfact') {
        const data = await getJson('/fact', {}, 'DavidCyril random fact')
        await socket.sendMessage(jid, { text: `*Random Fact*\n\n${data.fact || data.result || 'No fact returned.'}` })
        return
      }

      if (command === 'davidtruth') {
        const data = await getJson('/truth', {}, 'DavidCyril truth')
        await socket.sendMessage(jid, { text: `*Truth*\n\n${data.question || data.result || 'No question returned.'}` })
        return
      }

      if (command === 'aidetect') {
        if (words(input) < 100) {
          await socket.sendMessage(jid, { text: 'Usage: .aidetect text\nDavidCyril requires at least 100 words for AI detection.' })
          return
        }
        const data = await getJson('/api/detect', { text: input }, 'DavidCyril AI detector')
        const result = data.result || {}
        await socket.sendMessage(jid, {
          text: `*AI Detection*\n\nHuman: ${result.human_percent || 'Unavailable'}\nAI: ${result.ai_percent || 'Unavailable'}`
        })
      }
    } catch (error) {
      logger.error({ err: error, command }, 'DavidCyril safe command failed')
      await socket.sendMessage(jid, { text: error.message || 'The DavidCyril command failed. Try again later.' })
    }
  }
}
