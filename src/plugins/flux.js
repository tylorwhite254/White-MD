const { request } = require('../lib/http')

const API_KEY = process.env.WAVESPEED_API_KEY || ''
const API_BASE = (process.env.WAVESPEED_API_BASE || 'https://api.wavespeed.ai/api/v3').replace(/\/$/, '')
const MODEL_PATH = process.env.WAVESPEED_FLUX_IMAGE_MODEL || 'black-forest-labs/flux-3/text-to-image'
const POLL_LIMIT = Math.max(1, Math.min(90, Number(process.env.WAVESPEED_POLL_LIMIT || 45)))
const POLL_MS = Math.max(1000, Math.min(10000, Number(process.env.WAVESPEED_POLL_MS || 2000)))

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readJsonResponse(response, label) {
  let data = {}
  try {
    data = await response.json()
  } catch {
    // Keep the provider error below useful even when the response is not JSON.
  }
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || data?.error || `HTTP ${response.status}`
    throw new Error(`${label}: ${detail}`)
  }
  return data
}

function outputUrl(payload) {
  const outputs = payload?.data?.outputs || payload?.outputs || payload?.data?.output || payload?.output
  if (Array.isArray(outputs)) return outputs.find((value) => typeof value === 'string' && /^https?:\/\//i.test(value)) || ''
  if (typeof outputs === 'string' && /^https?:\/\//i.test(outputs)) return outputs
  return ''
}

module.exports = {
  command: 'flux',
  aliases: ['fluximage'],
  description: 'generate an image with WaveSpeedAI FLUX 3',

  async execute({ socket, jid, args, message }) {
    const prompt = args.join(' ').trim()
    if (!prompt) {
      await socket.sendMessage(jid, { text: 'Usage: .flux describe the image to generate' }, { quoted: message })
      return
    }
    if (!API_KEY) {
      await socket.sendMessage(jid, {
        text: 'WaveSpeedAI FLUX is not configured. Add WAVESPEED_API_KEY in the hosting panel environment variables.'
      }, { quoted: message })
      return
    }

    await socket.sendMessage(jid, { text: 'Generating your FLUX image. Please wait...' }, { quoted: message })
    const submitResponse = await request(`${API_BASE}/${MODEL_PATH}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ prompt })
    }, { retries: 1, timeoutMs: 30000, label: 'WaveSpeedAI FLUX' })
    const submitted = await readJsonResponse(submitResponse, 'WaveSpeedAI FLUX submission failed')
    const predictionId = submitted?.data?.id || submitted?.id
    if (!predictionId) throw new Error('WaveSpeedAI FLUX did not return a prediction ID')

    let finalPayload
    for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
      await wait(POLL_MS)
      const resultResponse = await request(`${API_BASE}/predictions/${encodeURIComponent(predictionId)}/result`, {
        headers: { authorization: `Bearer ${API_KEY}` }
      }, { retries: 1, timeoutMs: 30000, label: 'WaveSpeedAI FLUX result' })
      const result = await readJsonResponse(resultResponse, 'WaveSpeedAI FLUX result failed')
      const status = String(result?.data?.status || result?.status || '').toLowerCase()
      if (['completed', 'succeeded', 'success'].includes(status) || outputUrl(result)) {
        finalPayload = result
        break
      }
      if (['failed', 'error', 'canceled', 'cancelled'].includes(status)) {
        throw new Error(result?.data?.error || result?.error || `Generation ${status}`)
      }
    }

    const url = outputUrl(finalPayload)
    if (!url) throw new Error('WaveSpeedAI FLUX timed out before returning an image')
    await socket.sendMessage(jid, {
      image: { url },
      caption: `FLUX 3 image\n\nPrompt: ${prompt.slice(0, 800)}\n\nCreated with White MD`
    }, { quoted: message })
  }
}
