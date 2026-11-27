const DEFAULT_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 20000)
const DEFAULT_RETRIES = Number(process.env.API_RETRIES || 2)
const MAX_RETRY_DELAY_MS = Number(process.env.API_MAX_RETRY_DELAY_MS || 15000)

const cooldowns = new Map()

function retryAfterMs(response) {
  const value = response.headers.get('retry-after')
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function providerKey(url) {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

async function request(url, options = {}, settings = {}) {
  const retries = Number.isInteger(settings.retries) ? settings.retries : DEFAULT_RETRIES
  const timeoutMs = Number(settings.timeoutMs || DEFAULT_TIMEOUT_MS)
  const key = providerKey(url)
  const availableAt = cooldowns.get(key) || 0
  if (availableAt > Date.now()) await wait(Math.min(availableAt - Date.now(), MAX_RETRY_DELAY_MS))

  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      if (response.status !== 429 && response.status >= 500 && attempt < retries) {
        const delay = Math.min(MAX_RETRY_DELAY_MS, 500 * (2 ** attempt))
        await wait(delay)
        continue
      }
      if (response.status === 429) {
        const serverDelay = retryAfterMs(response)
        const delay = Math.min(MAX_RETRY_DELAY_MS, serverDelay || 1000 * (2 ** attempt))
        cooldowns.set(key, Date.now() + delay)
        if (attempt < retries) {
          await wait(delay)
          continue
        }
        const resource = settings.resource || settings.label || 'API'
        const error = new Error(`Requested resource: ${resource}\nYour White MD daily request has reached its limit. Try again later or configure another provider.`)
        error.code = 'RATE_LIMITED'
        error.status = 429
        error.retryAfterMs = delay
        throw error
      }
      return response
    } catch (error) {
      lastError = error
      if (error.code === 'RATE_LIMITED') throw error
      if (error.name !== 'AbortError' && attempt >= retries) throw error
      if (attempt >= retries) break
      await wait(Math.min(MAX_RETRY_DELAY_MS, 500 * (2 ** attempt)))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError || new Error(`${settings.label || 'API'} request failed`)
}

async function json(url, options = {}, settings = {}) {
  const response = await request(url, options, settings)
  if (!response.ok) throw new Error(`${settings.label || 'API'} returned HTTP ${response.status}`)
  return response.json()
}

async function binary(url, options = {}, settings = {}) {
  const response = await request(url, options, settings)
  if (!response.ok) throw new Error(`${settings.label || 'API'} returned HTTP ${response.status}`)
  return response
}

module.exports = { request, json, binary, retryAfterMs }
