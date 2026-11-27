const { askProvider } = require('./ai-providers')

function chatFallbackProviders() {
  const primary = process.env.CHATGPT_PRIMARY_PROVIDER || 'david-chatbot'
  const backups = (process.env.CHATGPT_BACKUP_PROVIDERS || 'david-gpt4o,david-gemini3pro,openrouter,xai')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set([primary, ...backups])]
}

async function askChatGPTWithProvider(query) {
  const prompt = String(query || '').trim()
  if (!prompt) throw new Error('A question is required')
  const errors = []
  for (const provider of chatFallbackProviders()) {
    try {
      const answer = await askProvider(provider, prompt)
      return { answer, provider }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`)
    }
  }
  throw new Error(`ChatGPT primary and backup providers failed. ${errors.join(' | ')}`)
}

async function askChatGPT(query) {
  const { answer } = await askChatGPTWithProvider(query)
  return answer
}

module.exports = { askChatGPT, askChatGPTWithProvider, chatFallbackProviders }
