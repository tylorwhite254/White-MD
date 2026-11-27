const SMALL_CAPS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ',
  k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 's', t: 'ᴛ',
  u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
}

const BALL = [
  'Yes.', 'No.', 'Probably.', 'Probably not.', 'Ask again later.', 'It is very likely.', 'Absolutely.', 'I would not count on it.'
]
const COMPLIMENTS = [
  'You bring good energy wherever you go.',
  'Your creativity stands out in the best way.',
  'You are making more progress than you realize.',
  'Your persistence is one of your strongest qualities.'
]
const FACTS = [
  'Honey can remain edible for an extremely long time when sealed properly.',
  'Octopuses have three hearts.',
  'A day on Venus is longer than a year on Venus.',
  'Bananas are botanically berries, while strawberries are not.'
]
const JOKES = [
  'Why did the developer go broke? They used up all their cache.',
  'I told my computer I needed a break, and it said: no problem, I will go to sleep.',
  'Why was the JavaScript developer sad? Because they did not know how to null their feelings.'
]
const WYR = [
  'Would you rather always have perfect Wi-Fi or never need to charge your phone?',
  'Would you rather be able to pause time or rewind it once a day?',
  'Would you rather explore the deepest ocean or outer space?'
]

function smallCaps(value) {
  return [...value].map((char) => SMALL_CAPS[char.toLowerCase()] || char).join('')
}

function requireText(args, usage) {
  const text = args.join(' ').trim()
  if (!text) throw new Error(`Usage: ${usage}`)
  return text
}

function rot13(value) {
  return value.replace(/[a-z]/gi, (char) => {
    const base = char <= 'Z' ? 65 : 97
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function rleEncode(value) {
  if (!value) return ''
  let result = ''
  let current = value[0]
  let count = 1
  for (let i = 1; i < value.length; i += 1) {
    if (value[i] === current && count < 9999) count += 1
    else {
      result += `${count}:${current}`
      current = value[i]
      count = 1
    }
  }
  return `${result}${count}:${current}`
}

function rleDecode(value) {
  return value.split(/(?<=.)\s+/).map((part) => {
    const match = part.match(/^(\d+):(.*)$/s)
    if (!match) throw new Error('Invalid RLE data. Use the output from .rle encode.')
    return match[2].repeat(Math.min(Number(match[1]), 10000))
  }).join('')
}

function textStats(text) {
  const words = text.match(/[\p{L}\p{N}']+/gu) || []
  const sentences = text.split(/[.!?]+/).filter((part) => part.trim()).length
  const letters = [...text].filter((char) => /\p{L}/u.test(char)).length
  const syllables = Math.max(1, words.reduce((sum, word) => sum + Math.max(1, (word.toLowerCase().match(/[aeiouy]+/g) || []).length), 0))
  const reading = words.length ? Math.max(1, Math.round(0.39 * (words.length / Math.max(sentences, 1)) + 11.8 * (syllables / Math.max(words.length, 1)) - 15.59)) : 0
  return { words: words.length, letters, characters: [...text].length, sentences, readingGrade: reading }
}

function convertUnit(value, from, to) {
  const normalized = { km: ['distance', 1000], m: ['distance', 1], mi: ['distance', 1609.344], kg: ['mass', 1], g: ['mass', 0.001], lb: ['mass', 0.45359237], c: ['temperature', 'c'], f: ['temperature', 'f'] }
  const a = normalized[from.toLowerCase()]
  const b = normalized[to.toLowerCase()]
  if (!a || !b || a[0] !== b[0]) throw new Error('Supported units: km, m, mi; kg, g, lb; c, f')
  if (a[0] === 'temperature') {
    const celsius = from.toLowerCase() === 'f' ? (value - 32) * 5 / 9 : value
    return to.toLowerCase() === 'f' ? celsius * 9 / 5 + 32 : celsius
  }
  return value * a[1] / b[1]
}

module.exports = {
  command: [
    'wordcount', 'wordfreq', 'topwords', 'analyze', 'textanalyze', 'textanalyser', 'analyse', 'readability',
    'rle', 'compress', 'decompress', 'rlecompress', 'cipher', 'encrypt', 'decrypt', 'crypt',
    'units', 'unit', 'convert', 'conv'
  ],
  description: 'safe local utilities and fun commands adapted natively for White MD',

  async execute({ socket, jid, args, command, message }) {
    let text
    let output
    if (['base64'].includes(command)) {
      const mode = (args[0] || 'encode').toLowerCase()
      text = requireText(args.slice(mode === 'encode' || mode === 'decode' ? 1 : 0), '.base64 encode|decode text')
      output = mode === 'decode' ? Buffer.from(text, 'base64').toString('utf8') : Buffer.from(text, 'utf8').toString('base64')
    } else if (['revt', 'reversetext'].includes(command)) {
      output = [...requireText(args, `.${command} text`)].reverse().join('')
    } else if (['smallcaps', 'smallcap', 'tinytext', 'mini'].includes(command)) {
      output = smallCaps(requireText(args, `.${command} text`))
    } else if (['wordcount', 'wordfreq', 'topwords', 'textstats', 'string', 'textinfo', 'analyze', 'textanalyze', 'textanalyser', 'analyse', 'readability'].includes(command)) {
      text = requireText(args, `.${command} text`)
      const stats = textStats(text)
      const counts = {}
      for (const word of text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []) counts[word] = (counts[word] || 0) + 1
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([word, count]) => `${word} (${count})`).join(', ')
      output = `*White MD Text Analysis*\nWords: ${stats.words}\nLetters: ${stats.letters}\nCharacters: ${stats.characters}\nSentences: ${stats.sentences}\nEstimated reading grade: ${stats.readingGrade}\nTop words: ${top || 'none'}`
    } else if (['rle', 'compress', 'rlecompress', 'decompress'].includes(command)) {
      const mode = (args[0] || (command === 'decompress' ? 'decode' : 'encode')).toLowerCase()
      text = requireText(args.slice(mode === 'encode' || mode === 'decode' ? 1 : 0), `.${command} encode|decode text`)
      output = mode === 'decode' ? rleDecode(text) : rleEncode(text)
    } else if (['cipher', 'encrypt', 'decrypt', 'crypt'].includes(command)) {
      output = rot13(requireText(args, `.${command} text`))
    } else if (['units', 'unit', 'convert', 'conv'].includes(command)) {
      const parts = requireText(args, `.${command} value from to`).split(/\s+/)
      if (parts.length !== 3 || !Number.isFinite(Number(parts[0]))) throw new Error(`Usage: .${command} 10 km mi`)
      output = `${parts[0]} ${parts[1]} = ${convertUnit(Number(parts[0]), parts[1], parts[2])} ${parts[2]}`
    } else if (['dado', 'dados', 'dice'].includes(command)) {
      const sides = Math.max(2, Math.min(100, Number(args[0]) || 6))
      output = `You rolled: ${Math.floor(Math.random() * sides) + 1} (d${sides})`
    } else if (['8ball', 'eightball', 'magic8ball'].includes(command)) {
      output = BALL[Math.floor(Math.random() * BALL.length)]
    } else if (['praise', 'nice'].includes(command)) {
      output = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)]
    } else if (['fact', 'randomfact', 'uselessfact'].includes(command)) {
      output = FACTS[Math.floor(Math.random() * FACTS.length)]
    } else if (command === 'truthdare') {
      output = WYR[Math.floor(Math.random() * WYR.length)]
    } else {
      throw new Error('Unknown local utility command')
    }
    await socket.sendMessage(jid, { text: String(output).slice(0, 6000) }, { quoted: message })
  }
}
