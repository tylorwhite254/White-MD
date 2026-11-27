const { request } = require('./http')

const DEFAULT_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 15000)

function textFrom(value) {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  for (const key of ['result', 'response', 'answer', 'reply', 'message', 'text', 'content', 'output']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    if (candidate && typeof candidate === 'object') {
      const nested = textFrom(candidate)
      if (nested) return nested
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = textFrom(item)
      if (nested) return nested
    }
  }
  return ''
}

function configuredNames() {
  return (process.env.AI_PROVIDERS || 'openai')
    .split(',').map((name) => name.trim().toLowerCase()).filter(Boolean)
}

async function getJson(url, label) {
  const response = await request(url, {}, { retries: 1, timeoutMs: DEFAULT_TIMEOUT_MS, label })
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`)
  const data = await response.json()
  const answer = textFrom(data)
  if (!answer || data?.success === false) throw new Error(`${label} returned no answer`)
  return answer
}

async function askOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured')
  const configuredEndpoint = process.env.OPENAI_API_URL || process.env.OPENAI_API_BASE
  const endpoint = configuredEndpoint
    ? configuredEndpoint.replace(/\/$/, '').endsWith('/chat/completions')
      ? configuredEndpoint
      : `${configuredEndpoint.replace(/\/$/, '')}/chat/completions`
    : 'https://api.openai.com/v1/chat/completions'
  const response = await request(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
  }, { retries: 1, timeoutMs: DEFAULT_TIMEOUT_MS, label: 'OpenAI' })
  if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}`)
  const data = await response.json()
  const answer = data?.choices?.[0]?.message?.content || textFrom(data)
  if (!answer) throw new Error('OpenAI returned no answer')
  return String(answer).trim()
}

async function askOpenAICompatible({ prompt, apiKey, endpoint, model, label }) {
  if (!apiKey) throw new Error(`${label} API key is not configured`)
  const response = await request(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
  }, { retries: 1, timeoutMs: DEFAULT_TIMEOUT_MS, label })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const detail = body ? `: ${body.replace(/\s+/g, ' ').slice(0, 300)}` : ''
    throw new Error(`${label} returned HTTP ${response.status}${detail}`)
  }
  const data = await response.json()
  const answer = data?.choices?.[0]?.message?.content || textFrom(data)
  if (!answer) throw new Error(`${label} returned no answer`)
  return String(answer).trim()
}

async function askOpenRouter(prompt) {
  return askOpenAICompatible({
    prompt,
    apiKey: process.env.OPENROUTER_API_KEY,
    endpoint: `${(process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions').replace(/\/$/, '')}`,
    model: process.env.OPENROUTER_MODEL || 'openrouter/auto',
    label: 'OpenRouter'
  })
}

async function askXai(prompt) {
  return askOpenAICompatible({
    prompt,
    apiKey: process.env.XAI_API_KEY,
    endpoint: `${(process.env.XAI_API_URL || 'https://api.x.ai/v1/chat/completions').replace(/\/$/, '')}`,
    model: process.env.XAI_MODEL || 'grok-4.7',
    label: 'xAI Grok'
  })
}

async function askDavidCyrilOfficial(path, prompt, label) {
  const endpoint = new URL(`${(process.env.DAVID_CYRIL_API_URL || 'https://apis.davidcyril.name.ng').replace(/\/$/, '')}${path}`)
  endpoint.searchParams.set('prompt', prompt)
  const headers = { accept: 'application/json', 'user-agent': 'White-MD/1.0' }
  if (process.env.DAVID_CYRIL_API_KEY) headers['x-api-key'] = process.env.DAVID_CYRIL_API_KEY
  const response = await request(endpoint, { headers }, { retries: 1, timeoutMs: DEFAULT_TIMEOUT_MS, label })
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`)
  const data = await response.json()
  const answer = typeof data?.data === 'string' ? data.data.trim() : textFrom(data?.data) || textFrom(data)
  if (data?.success === false || !answer) throw new Error(`${label} returned no answer`)
  return String(answer).trim()
}

async function askDavidGpt4o(prompt) {
  return askDavidCyrilOfficial('/ai/gpt-4o', prompt, 'DavidCyril GPT-4o')
}

async function askDavidGemini3Pro(prompt) {
  return askDavidCyrilOfficial('/ai/gemini-3-pro', prompt, 'DavidCyril Gemini 3 Pro')
}

async function askProvider(name, prompt) {
  const q = encodeURIComponent(prompt)
  switch (name) {
    case 'openai': return askOpenAI(prompt)
    case 'openrouter': return askOpenRouter(prompt)
    case 'xai':
    case 'grok': return askXai(prompt)
    case 'david-gpt4o':
    case 'davidgpt4o': return askDavidGpt4o(prompt)
    case 'david-gemini3pro':
    case 'davidgemini3pro': return askDavidGemini3Pro(prompt)
    case 'david-gpt3': return getJson(`https://api.davidcyriltech.my.id/ai/gpt3?text=${q}`, 'DavidCyril GPT-3')
    case 'david-gpt4omini': return getJson(`https://api.davidcyriltech.my.id/ai/gpt4omini?text=${q}`, 'DavidCyril GPT-4o mini')
    case 'david-chatbot': return getJson(`https://api.davidcyriltech.my.id/ai/chatbot?query=${q}`, 'DavidCyril chatbot')
    case 'david-llama3': return getJson(`https://api.davidcyriltech.my.id/ai/llama3?text=${q}`, 'DavidCyril Llama 3')
    case 'david-metaai': return getJson(`https://api.davidcyriltech.my.id/ai/metaai?text=${q}`, 'DavidCyril Meta AI')
    case 'guruapi': return getJson(`https://api.guruapi.tech/ai/gpt4?username=${q}`, 'GuruAPI GPT-4')
    case 'samir': return getJson(`https://samirxpikachuio.onrender.com/gpt?content=${q}`, 'Samir Pikachu GPT')
    case 'test-apms': return getJson(`https://test-api-apms.onrender.com/api/chatgpt?text=${q}`, 'Test-API-APMS ChatGPT')
    case 'widipe-gemini': return getJson(`https://widipe.com/gemini?text=${q}`, 'Widipe Gemini')
    case 'noobs-gemini': return getJson(`https://www.noobs-api.000.pe/dipto/gemini?prompt=${q}`, 'Noobs Gemini')
    case 'giftedtech': return getJson(`https://gpt4.giftedtech.workers.dev/?prompt=${q}`, 'GiftedTech GPT-4')
    case 'maher': return getJson(`https://api.maher-zubair.tech/ai/chatgpt4?q=${q}`, 'Maher ChatGPT-4')
    case 'maher-photoleap': return getJson(`https://api.maher-zubair.tech/ai/photoleap?q=${q}`, 'Maher Photoleap')
    case 'brainshop': {
      if (!process.env.BRAINSHOP_BID || !process.env.BRAINSHOP_KEY) throw new Error('Brainshop credentials are not configured')
      const uid = encodeURIComponent(process.env.BRAINSHOP_UID || 'white-md-user')
      return getJson(`http://api.brainshop.ai/get?bid=${encodeURIComponent(process.env.BRAINSHOP_BID)}&key=${encodeURIComponent(process.env.BRAINSHOP_KEY)}&uid=${uid}&msg=${q}`, 'Brainshop')
    }
    case 'pikabotz': {
      if (!process.env.PIKABOTZ_API_KEY) throw new Error('PikaBotz API key is not configured')
      return getJson(`https://pikabotzapi.vercel.app/ai/mistral/?apikey=${encodeURIComponent(process.env.PIKABOTZ_API_KEY)}&message=${q}`, 'PikaBotz Mistral')
    }
    default: throw new Error(`Unknown AI provider: ${name}`)
  }
}

async function askWithProviders(prompt) {
  const errors = []
  for (const provider of configuredNames()) {
    try {
      const answer = await askProvider(provider, prompt)
      return { answer, provider }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`)
    }
  }
  throw new Error(`All configured AI providers failed. ${errors.join(' | ')}`)
}

module.exports = { askWithProviders, askProvider, configuredNames }
