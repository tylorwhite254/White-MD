'use strict'

/**
 * Buttons for White MD.
 *
 * WhatsApp no longer shows the old `buttons: [...]` messages from linked-device bots, so this
 * helper sends the newer interactive format (quick-reply buttons and pick-lists). If WhatsApp
 * rejects it, the same choices are sent as plain text, so a command never goes silent.
 *
 * A pressed button comes back as the command stored in its id (for example ".joke"), so it runs
 * through the normal command handler like a typed message.
 *
 * Set BUTTONS=off in the environment to always send plain text.
 */

const MAX_QUICK_REPLIES = 3
const LIST_SECTION_SIZE = 25
const MAX_LIST_ROWS = 100
const BODY_LIMIT = 4000

function buttonsEnabled() {
  return String(process.env.BUTTONS || 'on').toLowerCase() !== 'off'
}

const WRAPPERS = [
  'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension',
  'documentWithCaptionMessage', 'deviceSentMessage', 'editedMessage', 'futureProofMessage',
  'botInvokeMessage', 'groupMentionedMessage', 'lottieStickerMessage'
]

function unwrap(content) {
  let current = content
  for (let depth = 0; depth < 8 && current; depth += 1) {
    let inner
    for (const key of WRAPPERS) {
      if (current[key]?.message) { inner = current[key].message; break }
    }
    if (!inner) break
    current = inner
  }
  return current
}

function idFromParams(params) {
  if (!params) return ''
  try {
    const parsed = typeof params === 'string' ? JSON.parse(params) : params
    return String(parsed.id || parsed.selectedRowId || parsed.selected_row_id || parsed.selectedId || parsed.row_id || parsed.button_id || '')
  } catch {
    return ''
  }
}

/** The id of the button or list row a person pressed, or '' when the message is not a press. */
function extractButtonId(message) {
  const content = unwrap(message?.message)
  if (!content) return ''
  if (content.buttonsResponseMessage?.selectedButtonId) return content.buttonsResponseMessage.selectedButtonId
  if (content.templateButtonReplyMessage?.selectedId) return content.templateButtonReplyMessage.selectedId
  if (content.listResponseMessage?.singleSelectReply?.selectedRowId) return content.listResponseMessage.singleSelectReply.selectedRowId
  const interactive = content.interactiveResponseMessage
  if (interactive) {
    const fromParams = idFromParams(interactive.nativeFlowResponseMessage?.paramsJson)
    if (fromParams) return fromParams
    // Some WhatsApp versions only send back the button's label; use it when it is a command.
    const label = String(interactive.body?.text || '').trim()
    if (label) return label
  }
  if (content.buttonsResponseMessage?.selectedDisplayText) return content.buttonsResponseMessage.selectedDisplayText
  if (content.templateButtonReplyMessage?.selectedDisplayText) return content.templateButtonReplyMessage.selectedDisplayText
  if (content.listResponseMessage?.title) return content.listResponseMessage.title
  return ''
}

function chunk(items, size) {
  const out = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

function listRows(list) {
  if (!list) return []
  if (Array.isArray(list.rows)) return list.rows
  if (Array.isArray(list.sections)) return list.sections.flatMap((section) => section.rows || [])
  return []
}

/** Turns simple { id, text } buttons and an optional list into WhatsApp's button entries. */
function buildNativeButtons({ buttons = [], list } = {}) {
  const native = []
  // A button with a `url` opens that link (for example the channel) instead of running a command.
  const links = buttons.filter((button) => button.url)
  let quick = buttons.filter((button) => !button.url)
  let listDef = list
  // WhatsApp shows at most three quick-reply buttons; more than that becomes a pick-list.
  if (!listRows(listDef).length && quick.length > MAX_QUICK_REPLIES) {
    listDef = { title: 'Choose', rows: quick.map((button) => ({ id: button.id, title: button.text })) }
    quick = []
  }
  const rows = listRows(listDef).slice(0, MAX_LIST_ROWS)
  if (rows.length) {
    const sections = chunk(rows, LIST_SECTION_SIZE).map((sectionRows, index) => ({
      title: index === 0 ? (listDef.sectionTitle || listDef.title || 'Options') : `More (${index + 1})`,
      rows: sectionRows.map((row) => ({
        id: String(row.id),
        title: String(row.title).slice(0, 24),
        description: row.description ? String(row.description).slice(0, 72) : ''
      }))
    }))
    native.push({
      name: 'single_select',
      buttonParamsJson: JSON.stringify({ title: String(listDef.title || 'Choose').slice(0, 20), sections })
    })
  }
  for (const button of quick.slice(0, MAX_QUICK_REPLIES)) {
    native.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: String(button.text).slice(0, 25), id: String(button.id) })
    })
  }
  for (const button of links.slice(0, 2)) {
    native.push({
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({ display_text: String(button.text).slice(0, 25), url: String(button.url), merchant_url: String(button.url) })
    })
  }
  return native
}

/** The same choices as plain text, used when buttons cannot be sent. */
function fallbackText({ text = '', footer, buttons = [], list } = {}) {
  const rows = [...listRows(list).map((row) => ({ id: row.id, text: row.title })), ...buttons.map((button) => ({ id: button.url || button.id, text: button.text }))]
  let out = text
  if (rows.length) out += `\n\n${rows.map((row) => (row.text === row.id ? `▫️ ${row.id}` : `▫️ ${row.text} → ${row.id}`)).join('\n')}`
  if (footer) out += `\n\n_${footer}_`
  return out
}

function quotedContext(quoted) {
  if (!quoted?.key?.id || !quoted.message) return {}
  return {
    stanzaId: quoted.key.id,
    participant: quoted.key.participant || quoted.key.remoteJid,
    remoteJid: quoted.key.remoteJid,
    quotedMessage: quoted.message
  }
}

/**
 * Sends a message with buttons.
 *
 *   await sendButtons(socket, jid, {
 *     text: 'Pick one',
 *     footer: 'White MD',
 *     image: { url: 'https://…' },            // optional, or a Buffer (video: works the same way)
 *     buttons: [{ id: '.ping', text: 'Ping' }], // up to 3; more become a pick-list
 *     list: { title: 'Categories', rows: [{ id: '.category:fun', title: 'Fun', description: '12 commands' }] }
 *   }, { quoted: message })
 *
 * Falls back to plain text when the buttons cannot be sent (unless noFallback is set).
 */
async function sendButtons(socket, jid, opts = {}, { quoted, noFallback = false, plainSend } = {}) {
  const send = plainSend || socket.sendMessage.bind(socket)
  const sendPlain = () => {
    const body = fallbackText(opts)
    const extra = {}
    if (opts.mentions?.length) extra.mentions = opts.mentions
    if (opts.contextInfo) extra.contextInfo = opts.contextInfo
    let content = { text: body, ...extra }
    if (opts.video) content = { video: opts.video, caption: body, ...extra }
    else if (opts.image) content = { image: opts.image, caption: body, ...extra }
    return send(jid, content, quoted ? { quoted } : {})
  }

  const native = buildNativeButtons(opts)
  if (!buttonsEnabled() || native.length === 0) return sendPlain()

  try {
    const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys')
    let header = { title: opts.title || '', hasMediaAttachment: false }
    if (opts.image) {
      const media = await prepareWAMessageMedia({ image: opts.image }, { upload: socket.waUploadToServer })
      header = { title: opts.title || '', hasMediaAttachment: true, imageMessage: media.imageMessage }
    } else if (opts.video) {
      const media = await prepareWAMessageMedia({ video: opts.video }, { upload: socket.waUploadToServer })
      header = { title: opts.title || '', hasMediaAttachment: true, videoMessage: media.videoMessage }
    }
    const interactiveMessage = {
      header,
      body: { text: String(opts.text || '').slice(0, BODY_LIMIT) },
      footer: { text: opts.footer || process.env.BOT_NAME || 'White MD' },
      nativeFlowMessage: { buttons: native, messageParamsJson: '' },
      contextInfo: {
        ...(opts.contextInfo || {}),
        ...(opts.mentions?.length ? { mentionedJid: opts.mentions } : {}),
        ...quotedContext(quoted)
      }
    }
    const built = generateWAMessageFromContent(jid, {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage
        }
      }
    }, { userJid: socket.user?.id })
    // Without these extra tags WhatsApp delivers the message but hides the buttons.
    const additionalNodes = [{
      tag: 'biz',
      attrs: {},
      content: [{
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
      }]
    }]
    if (!String(jid).endsWith('@g.us')) additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } })
    await socket.relayMessage(jid, built.message, { messageId: built.key.id, additionalNodes })
    return built
  } catch (error) {
    if (noFallback) throw error
    console.error('[buttons] could not send buttons, using plain text:', error?.message || error)
    return sendPlain()
  }
}

/** Commands that give a fresh result every time; their reply gets an "Another" button. */
const AGAIN_COMMANDS = new Set([
  'joke', 'jokes', 'joke2', 'fact', 'facts', 'quote', 'quote2', 'truth', 'dare', 'flirt', 'shayari', 'roseday', 'rose',
  'goodnight', 'gn', 'why', 'wyr', 'wouldyourather', 'nhie', 'neverhaveiever', 'meme', 'flip', 'dado', 'pies', 'animes',
  'compliment', 'insult', 'insult2', 'advice', 'advice2', 'coffee', 'coffe', 'cat', 'dog', 'fox', 'waifu', 'neko',
  'kitsune', 'husbando', 'shinobu', 'megumin', 'riddle', 'trivia', 'quiz', 'math', 'puzzle', 'couplepp',
  'davidfact', 'davidtruth', 'character'
])

const WORD_OPTIONS = new Set(['on', 'off', 'enable', 'disable', 'public', 'private', 'status', 'list', 'reset', 'add', 'remove'])

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function label(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Reads choices such as '.antilink <on|off|set>' out of a usage line (first argument only). */
function optionsFromUsage(usage) {
  if (typeof usage !== 'string') return []
  const match = usage.split('\n')[0].match(/^\S+\s+[<[]([a-z0-9]+(?:\|[a-z0-9]+)+)[>\]]/i)
  return match ? match[1].split('|') : []
}

/**
 * Finds the choices a reply is offering in its own words:
 *  - ".rps rock|paper|scissors"            -> one button per option
 *  - ".autotype on or .autotype off"       -> On / Off buttons
 *  - several lines starting with a command -> a pick-list of those commands
 */
function choicesFromText(text, prefix, command) {
  if (typeof text !== 'string' || !text.trim() || !prefix) return null
  const p = escapeRegExp(prefix)

  const rows = []
  const seen = new Set()
  const linePattern = new RegExp(`^[\\s>*_•▫️◍├└─┃│-]*${p}([a-z0-9][\\w:-]*)(.*)$`, 'i')
  for (const line of text.split('\n')) {
    const match = line.match(linePattern)
    if (!match) continue
    const name = match[1].toLowerCase()
    if (seen.has(name) || name === command) continue
    seen.add(name)
    const rest = match[2].replace(/^[\s/|—–:-]+/, '').replace(/[*_`]/g, '').trim()
    rows.push({ id: `${prefix}${name}`, title: `${prefix}${name}`, description: rest })
  }
  if (rows.length >= 3) return { list: { title: 'Open a command', rows } }

  const piped = text.match(new RegExp(`(?:^|[\\s:(*_\`])${p}([a-z0-9][\\w-]*)\\s+[<\\[(]?([a-z0-9]+(?:\\s?\\|\\s?[a-z0-9]+)+)[>\\])]?`, 'im'))
  if (piped) {
    const options = piped[2].split('|').map((option) => option.trim()).filter(Boolean)
    return { buttons: options.map((option) => ({ id: `${prefix}${piped[1]} ${option}`, text: label(option) })) }
  }

  const groups = new Map()
  const wordPattern = new RegExp(`(?:^|[\\s:(*_\`])${p}([a-z0-9][\\w-]*)\\s+([a-z]+)\\b`, 'gim')
  for (const match of text.matchAll(wordPattern)) {
    const option = match[2].toLowerCase()
    if (!WORD_OPTIONS.has(option)) continue
    const name = match[1].toLowerCase()
    if (!groups.has(name)) groups.set(name, new Set())
    groups.get(name).add(option)
  }
  const [name, options] = [...groups].sort((left, right) => right[1].size - left[1].size)[0] || []
  if (options && options.size >= 2) {
    return { buttons: [...options].map((option) => ({ id: `${prefix}${name} ${option}`, text: label(option) })) }
  }
  return null
}

function isPlainReply(content) {
  if (!content || typeof content !== 'object') return false
  if (content.buttons || content.edit || content.delete || content.react || content.poll || content.forward) return false
  if (content.video || content.audio || content.sticker || content.document) return false
  if (typeof content.text === 'string' && content.text.trim()) return true
  return Boolean(content.image && typeof content.caption === 'string' && content.caption.trim())
}

/** Decides which buttons, if any, one reply of a command should carry. */
function autoButtonsFor({ plugin, command, args = [], prefix, text }) {
  if (plugin?.noAutoButtons) return null
  if (args.length === 0) {
    const options = optionsFromUsage(plugin?.usage)
    if (options.length) {
      return { buttons: options.map((option) => ({ id: `${prefix}${command} ${option}`, text: label(option) })) }
    }
  }
  const fromText = choicesFromText(text, prefix, command)
  if (fromText) return fromText
  if (AGAIN_COMMANDS.has(command)) {
    return { buttons: [{ id: [`${prefix}${command}`, ...args].join(' '), text: '🔁 Another' }] }
  }
  return null
}

/**
 * Wraps the connection for one command run so that its first ordinary reply is sent with buttons
 * when it offers a choice. Everything else, and any failure, goes through the original connection.
 */
function withAutoButtons(socket, details) {
  if (!buttonsEnabled()) return socket
  let used = false
  const original = socket.sendMessage.bind(socket)
  const sendMessage = async (jid, content, options = {}) => {
    if (used || !isPlainReply(content)) return original(jid, content, options)
    const text = content.text ?? content.caption
    const auto = text.length <= BODY_LIMIT ? autoButtonsFor({ ...details, text }) : null
    if (!auto) return original(jid, content, options)
    used = true
    try {
      return await sendButtons(socket, jid, {
        text,
        image: content.image,
        mentions: content.mentions,
        contextInfo: content.contextInfo,
        ...auto
      }, { quoted: options?.quoted, noFallback: true })
    } catch (error) {
      console.error('[buttons] could not add buttons, sending the normal reply:', error?.message || error)
      return original(jid, content, options)
    }
  }
  return new Proxy(socket, {
    get(target, prop) {
      if (prop === 'sendMessage') return sendMessage
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

module.exports = {
  AGAIN_COMMANDS,
  autoButtonsFor,
  buildNativeButtons,
  buttonsEnabled,
  choicesFromText,
  extractButtonId,
  unwrap,
  fallbackText,
  optionsFromUsage,
  sendButtons,
  withAutoButtons
}
