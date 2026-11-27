require('dotenv').config()

const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const express = require('express')
const P = require('pino')
const qrcode = require('qrcode-terminal')
const { askChatGPT } = require('./lib/chatgpt')
const { enforceAntiLinks } = require('./lib/anti-links')
const { extractButtonId, sendButtons, withAutoButtons, unwrap: unwrapContent } = require('./lib/buttons')
const { buildPingCard } = require('./lib/ping-card')
const { verifiedQuote, channelContext } = require('./lib/message-style')
const consoleChat = require('./lib/console-chat')
const {
  AUTH_DIR,
  DATA_DIR,
  dataPath,
  readJsonSafe,
  writeJsonAtomic,
  restoreSessionBundle,
  pullRemoteBackup,
  scheduleRemoteBackup
} = require('./lib/storage')
const { installWebPairing } = require('./lib/web-pairing')
const { getGroupSettings } = require('./lib/group-settings')
const { handleAfkMessage } = require('./plugins/afk')
const { startReminderScheduler } = require('./plugins/remind')
const { handleAutoReply } = require('./plugins/extra-commands')
const {
  isUserBanned,
  isGroupBanned,
  isSudoUser,
  isAntiDmEnabled,
  isAntiCallEnabled,
  checkCooldown,
  getMaintenance,
  rememberDmContact
} = require('./lib/access-control')
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} = require('@whiskeysockets/baileys')

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const BOT_NAME = process.env.BOT_NAME || 'White MD'
const OWNER_NUMBER = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '')
const PAIRING_NUMBER = (process.env.PAIRING_NUMBER || '').replace(/[^0-9]/g, '')
const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || 'https://files.catbox.moe/ift8n5.jpeg'
const UNKNOWN_COMMAND_GIF_URL = process.env.UNKNOWN_COMMAND_GIF_URL || 'https://files.catbox.moe/syqxkg.gif'
const AUTO_FOLLOW_CHANNEL_JID = process.env.AUTO_FOLLOW_CHANNEL_JID || ''
const AUTO_FOLLOW_CHANNEL_URL = process.env.AUTO_FOLLOW_CHANNEL_URL || `https://whatsapp.com/channel/${AUTO_FOLLOW_CHANNEL_JID.split('@')[0]}`
const DEFAULT_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbAvp6OCXC3LkXKNmM3X'
const AUTO_ENROLL_GROUP_JID = process.env.AUTO_ENROLL_GROUP_JID || ''
// Invite link (or code) of the owner's group. Every account that links to this bot
// joins it automatically, and new private contacts get the link if a direct add fails.
const AUTO_JOIN_GROUP_INVITE = (process.env.AUTO_JOIN_GROUP_INVITE || '').trim()
const AUTO_JOIN_INVITE_CODE = AUTO_JOIN_GROUP_INVITE.split('chat.whatsapp.com/').pop().split(/[?\s/]/)[0]
const AUTO_ENROLL_NOTICE = process.env.AUTO_ENROLL_NOTICE || 'Welcome to White MD. You are being invited to join our WhatsApp group and follow our channel.'
const SETTINGS_FILE = process.env.SETTINGS_FILE ? path.resolve(process.env.SETTINGS_FILE) : dataPath('bot_settings.json')
const logger = P({ level: process.env.LOG_LEVEL || 'warn' })
const plugins = loadPlugins()
const MENU_FILE = path.join(__dirname, '..', 'MENU.js')

let socket
let botJid = ''
let isReady = false
let pairingRequested = false
let selectedLoginMethod = PAIRING_NUMBER ? 'pair' : 'qr'
let selectedPairingNumber = PAIRING_NUMBER
let startupPromptActive = true
let requestPanelPairingCode = null
let requestWhatsAppPairingCode = null
let sessionRecoveryTimer = null
let latestQr = ''
let connectionState = 'initializing'
let commandPrefix = loadPrefix()
const handledMessageIds = new Set()

function loadSettings() {
  return readJsonSafe(SETTINGS_FILE, {})
}

function saveSettings(settings) {
  writeJsonAtomic(SETTINGS_FILE, settings)
  scheduleRemoteBackup(logger)
}

function loadPrefix() {
  const settings = loadSettings()
  if (typeof settings.prefix === 'string' && settings.prefix.length <= 3) return settings.prefix
  return process.env.COMMAND_PREFIX || '.'
}

function getBotMode() {
  const saved = loadSettings().botMode
  if (saved === 'private' || saved === 'public') return saved
  const envMode = String(process.env.MODE || process.env.WORKTYPE || 'public').toLowerCase()
  return envMode === 'private' ? 'private' : 'public'
}

function setBotMode(mode) {
  const normalized = String(mode || '').toLowerCase()
  if (!['public', 'private'].includes(normalized)) return false
  saveSettings({ ...loadSettings(), botMode: normalized })
  return true
}

function setPrefix(prefix) {
  commandPrefix = prefix
  saveSettings({ ...loadSettings(), prefix })
}

function getDisabledCommands() {
  const disabled = loadSettings().disabledCommands
  return Array.isArray(disabled) ? disabled.filter((command) => typeof command === 'string') : []
}

function setCommandDisabled(command, disabled = true) {
  const normalized = String(command || '').trim().toLowerCase().replace(/^\.+/, '')
  if (!normalized || !/^[a-z0-9_-]+$/.test(normalized)) return false
  const settings = loadSettings()
  const current = new Set(getDisabledCommands())
  if (disabled) current.add(normalized)
  else current.delete(normalized)
  settings.disabledCommands = [...current].sort()
  saveSettings(settings)
  return true
}

function isCommandDisabled(command) {
  return getDisabledCommands().includes(String(command || '').toLowerCase())
}

function getMenuImageUrl(menuConfig) {
  const settings = loadSettings()
  const savedPool = Array.isArray(settings.menuImages)
    ? settings.menuImages.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url))
    : []
  const legacyImage = typeof settings.menuImage === 'string' && settings.menuImage ? [settings.menuImage] : []
  const configuredPool = savedPool.length ? savedPool : legacyImage
  const defaultPool = Array.isArray(menuConfig?.menuMedia)
    ? menuConfig.menuMedia.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url))
    : []
  const pool = configuredPool.length ? configuredPool : defaultPool
  if (!pool.length) return ''

  const index = Number.isInteger(settings.menuMediaIndex) ? settings.menuMediaIndex : 0
  const selected = pool[((index % pool.length) + pool.length) % pool.length]
  settings.menuMediaIndex = (index + 1) % pool.length
  saveSettings(settings)
  return selected
}

function setMenuImage(url) {
  const settings = loadSettings()
  if (url) {
    settings.menuImage = url
    settings.menuImages = [url]
    settings.menuMediaIndex = 0
  } else {
    delete settings.menuImage
    delete settings.menuImages
    delete settings.menuMediaIndex
  }
  saveSettings(settings)
}

function addMenuImage(url) {
  const settings = loadSettings()
  const existing = Array.isArray(settings.menuImages) ? settings.menuImages : []
  settings.menuImages = [...new Set([...existing, url])]
  delete settings.menuImage
  settings.menuMediaIndex = 0
  saveSettings(settings)
  return settings.menuImages
}

function getMenuImages() {
  const settings = loadSettings()
  return Array.isArray(settings.menuImages) ? settings.menuImages : []
}

function setChatGPTAuto(enabled) {
  const settings = loadSettings()
  settings.chatgptAuto = Boolean(enabled)
  saveSettings(settings)
}

function isChatGPTAutoEnabled() {
  return loadSettings().chatgptAuto === true
}

function setAutoRecord(enabled) {
  const settings = loadSettings()
  settings.autoRecord = Boolean(enabled)
  saveSettings(settings)
}

function isAutoRecordEnabled() {
  return loadSettings().autoRecord === true
}

function setAutoType(enabled) {
  const settings = loadSettings()
  settings.autoType = Boolean(enabled)
  saveSettings(settings)
}

function isAutoTypeEnabled() {
  return loadSettings().autoType === true
}

function setAutoViewStatus(enabled) {
  const settings = loadSettings()
  settings.autoViewStatus = Boolean(enabled)
  saveSettings(settings)
}

function isAutoViewStatusEnabled() {
  return loadSettings().autoViewStatus === true
}

function setAutoLikeStatus(enabled) {
  const settings = loadSettings()
  settings.autoLikeStatus = Boolean(enabled)
  saveSettings(settings)
}

function isAutoLikeStatusEnabled() {
  return loadSettings().autoLikeStatus === true
}

// Built-in commands handled by the bot itself (not plugins).
const BUILTIN_COMMANDS = ['menu', 'help', 'menutext', 'allmenu', 'menustyle', 'ping', 'alive', 'runtime', 'botinfo', 'speed']

// MENU.js lists only some commands; every other loaded command is added to its own category,
// so the menu always shows everything the bot can do.
function withAllCommands(listed) {
  const categories = {}
  for (const [key, list] of Object.entries(listed)) if (Array.isArray(list)) categories[key] = [...list]
  const seen = new Set(Object.values(categories).flat().map((entry) => String(entry).trim().split(/\s+/)[0].toLowerCase()))
  const findKey = (name) => Object.keys(categories).find((key) => key.toLowerCase() === name.toLowerCase())
  const add = (category, name) => {
    if (!name || seen.has(name)) return
    seen.add(name)
    const key = findKey(category) || category
    ;(categories[key] = categories[key] || []).push(name)
  }
  for (const name of BUILTIN_COMMANDS) add('general', name)
  for (const [name, plugin] of plugins) add(String(plugin.category || 'more').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'more', name)
  return categories
}

function loadMenu() {
  try {
    delete require.cache[require.resolve(MENU_FILE)]
    const menu = require(MENU_FILE)
    return {
      heading: typeof menu.heading === 'string' && menu.heading ? menu.heading : BOT_NAME,
      intro: typeof menu.intro === 'string' ? menu.intro : '',
      ownerName: typeof menu.ownerName === 'string' && menu.ownerName ? menu.ownerName : 'Tylor White',
      library: typeof menu.library === 'string' && menu.library ? menu.library : '@whiskeysockets/baileys',
      metadataLabels: menu.metadataLabels && typeof menu.metadataLabels === 'object' ? menu.metadataLabels : {},
      categories: withAllCommands(menu.categories && typeof menu.categories === 'object' ? menu.categories : {}),
      channelUrl: typeof menu.channelUrl === 'string' ? menu.channelUrl : '',
      menuMedia: Array.isArray(menu.menuMedia) ? menu.menuMedia : []
    }
  } catch (error) {
    logger.warn({ err: error }, 'Custom MENU.js could not be loaded; using an empty menu')
    return { heading: BOT_NAME, intro: '', ownerName: 'Tylor White', library: '@whiskeysockets/baileys', metadataLabels: {}, categories: {}, menuMedia: [] }
  }
}

function menuCategoryText(categories, category) {
  const commands = Array.isArray(categories[category]) ? categories[category] : []
  const label = category === 'tylorWhite' ? 'Tylor White' : category[0].toUpperCase() + category.slice(1)
  return `*${label}*\n${commands.map((command) => `${commandPrefix}${command}`).join('\n')}`
}

function formatUptime(seconds) {
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${days}d ${hours}h ${minutes}m ${secs}s`
}

function requesterJid(message, chatJid) {
  if (message?.key?.fromMe) return socket?.user?.id || botJid || chatJid
  return message?.key?.participant || chatJid
}

function requesterLabel(jid) {
  if (!jid) return 'Unknown'
  return jidToNumber(jid) || jid
}

function isOwnerMessage(message, jid) {
  if (message?.key?.fromMe) return true
  const sender = message?.key?.participant || jid
  if (OWNER_NUMBER && jidToNumber(sender) === OWNER_NUMBER) return true
  return isSudoUser(sender)
}

function loadPlugins() {
  const pluginDir = path.join(__dirname, 'plugins')
  if (!fs.existsSync(pluginDir)) return new Map()

  const preferTylorCommands = new Set(['play'])
  const loaded = new Map()
  for (const filename of fs.readdirSync(pluginDir)) {
    if (!filename.endsWith('.js')) continue
    const exported = require(path.join(pluginDir, filename))
    const plugin = exported.default && typeof exported.default === 'object' ? exported.default : exported
    if (!plugin.command || (typeof plugin.execute !== 'function' && typeof plugin.handler !== 'function')) {
      logger.warn({ filename }, 'Skipping invalid plugin')
      continue
    }
    const commands = [
      ...(Array.isArray(plugin.command) ? plugin.command : [plugin.command]),
      ...(Array.isArray(plugin.aliases) ? plugin.aliases : [])
    ].filter((command) => typeof command === 'string' && command.trim())
    const executable = typeof plugin.execute === 'function'
      ? plugin.execute.bind(plugin)
      : async (context) => plugin.handler(context.socket, context.message, context.args, {
        chatId: context.jid,
        isGroup: isGroup(context.jid),
        isBotAdmin: false,
        ...context
      })
    for (const command of commands) {
      const normalized = command.toLowerCase()
      if (loaded.has(normalized)) {
        const existing = loaded.get(normalized)
        const existingIsTylor = existing.__filename.startsWith('tylor-')
        const currentIsTylor = filename.startsWith('tylor-')
        if ((existingIsTylor && !currentIsTylor && !preferTylorCommands.has(normalized)) || (preferTylorCommands.has(normalized) && currentIsTylor && !existingIsTylor)) {
          loaded.set(normalized, { ...plugin, execute: executable, __filename: filename })
          logger.info({ command: normalized, replaced: existing.__filename, selected: filename }, 'Selected native plugin over imported duplicate')
        } else {
          logger.warn({ filename, command: normalized, selected: existing.__filename }, 'Skipping duplicate plugin command')
        }
        continue
      }
      loaded.set(normalized, { ...plugin, execute: executable, __filename: filename })
    }
  }
  logger.info({ commands: [...loaded.keys()] }, 'Plugins loaded')
  return loaded
}

const app = express()
app.get('/health', (_req, res) => {
  res.status(isReady ? 200 : 503).json({
    ok: isReady,
    service: BOT_NAME,
    whatsapp: isReady ? 'connected' : connectionState,
    dataDir: DATA_DIR
  })
})

installWebPairing(app, {
  getStatus: () => ({
    botName: BOT_NAME,
    connected: isReady,
    status: isReady ? 'connected' : connectionState,
    phone: jidToNumber(socket?.user?.id || botJid || ''),
    prefix: commandPrefix,
    mode: getBotMode(),
    plugins: plugins.size,
    uptimeSeconds: Math.floor(process.uptime()),
    qr: latestQr || null
  }),
  requestPairingCode: async (phoneNumber) => {
    // WhatsApp only accepts a pairing request once the socket handshake is done (first QR issued).
    if (!requestWhatsAppPairingCode || !socket || !latestQr) {
      return { ok: false, reason: 'not-ready' }
    }
    selectedLoginMethod = 'pair'
    selectedPairingNumber = phoneNumber
    connectionState = 'pairing'
    return requestWhatsAppPairingCode(phoneNumber)
  },
  resetSession: async () => {
    isReady = false
    latestQr = ''
    pairingRequested = false
    connectionState = 'resetting'
    const oldSocket = socket
    socket = null
    try { oldSocket?.end(undefined) } catch {}
    fs.rmSync(AUTH_DIR, { recursive: true, force: true })
    selectedLoginMethod = 'pair'
    selectedPairingNumber = ''
    await connectToWhatsApp()
  }
})
app.listen(PORT, HOST, () => {
  logger.info(`Health server listening on http://${HOST}:${PORT}`)
})

function jidToNumber(jid = '') {
  return jid.split(':')[0].split('@')[0]
}

function isGroup(jid = '') {
  return jid.endsWith('@g.us')
}

function installConversationLogging() {
  if (!socket || socket.__whiteMdConversationLogging) return
  const originalSendMessage = socket.sendMessage.bind(socket)
  socket.sendMessage = async (jid, content, options) => {
    {
      const text = content?.text || content?.caption || (content?.image ? '[image]' : content?.video ? '[video]' : content?.audio ? '[audio]' : content?.document ? '[document]' : '[message]')
      consoleChat.outgoing(BOT_NAME, text)
    }
    return originalSendMessage(jid, content, options)
  }
  socket.__whiteMdConversationLogging = true
}

async function followConfiguredChannel() {
  const channelJid = AUTO_FOLLOW_CHANNEL_JID.trim()
  if (!channelJid) return
  if (!/^\d+@newsletter$/.test(channelJid)) {
    logger.warn({ channelJid }, 'AUTO_FOLLOW_CHANNEL_JID must be a WhatsApp channel JID such as 120363401194818136@newsletter')
    return
  }
  if (typeof socket?.newsletterFollow !== 'function') {
    logger.warn({ channelJid }, 'Installed Baileys version does not expose newsletterFollow')
    return
  }
  try {
    await socket.newsletterFollow(channelJid)
    logger.info({ channelJid }, 'Automatically followed configured WhatsApp Channel')
  } catch (error) {
    logger.warn({ err: error, channelJid }, 'Automatic WhatsApp Channel follow failed; verify the channel JID and account permissions')
  }
}

let resolvedInviteGroupJid = ''

async function joinConfiguredGroup() {
  if (!AUTO_JOIN_INVITE_CODE) return
  try {
    const info = await socket.groupGetInviteInfo(AUTO_JOIN_INVITE_CODE)
    resolvedInviteGroupJid = info?.id || ''
    const joined = await socket.groupFetchAllParticipating()
    if (resolvedInviteGroupJid && joined[resolvedInviteGroupJid]) return
    await socket.groupAcceptInvite(AUTO_JOIN_INVITE_CODE)
    logger.info({ group: resolvedInviteGroupJid }, 'Linked account automatically joined configured group')
  } catch (error) {
    logger.warn({ err: error }, 'Automatic group join failed; check AUTO_JOIN_GROUP_INVITE')
  }
}

async function autoEnrollPrivateContact(message, jid) {
  const groupJid = (AUTO_ENROLL_GROUP_JID.trim() || resolvedInviteGroupJid)
  if (!groupJid || message?.key?.fromMe || isGroup(jid) || jid === 'status@broadcast') return
  if (!/^\d+@g\.us$/.test(groupJid)) {
    logger.warn({ groupJid }, 'AUTO_ENROLL_GROUP_JID must be a WhatsApp group JID such as 120363434540625499@g.us')
    return
  }

  const participantJid = message?.key?.participant || jid
  if (!/@(?:s\.whatsapp\.net|lid)$/.test(participantJid)) return

  const settings = loadSettings()
  const processed = Array.isArray(settings.autoEnrollProcessed) ? settings.autoEnrollProcessed : []
  if (processed.includes(participantJid)) return

  try {
    const channelLine = AUTO_FOLLOW_CHANNEL_JID ? `\n\nFollow our channel: ${AUTO_FOLLOW_CHANNEL_URL}` : ''
    await socket.sendMessage(jid, { text: AUTO_ENROLL_NOTICE + channelLine })
    let result = 'notice-sent'
    if (typeof socket.groupParticipantsUpdate === 'function') {
      const response = await socket.groupParticipantsUpdate(groupJid, [participantJid], 'add')
      result = response?.[0]?.status || 'requested'
      // Privacy settings blocked the add: send the invite link instead.
      if (String(result) !== '200' && AUTO_JOIN_INVITE_CODE) {
        await socket.sendMessage(jid, { text: `Join our group here: https://chat.whatsapp.com/${AUTO_JOIN_INVITE_CODE}` })
      }
    } else {
      result = 'group-add-unsupported'
    }
    logger.info({ groupJid, participantJid, result }, 'Automatic group enrollment attempted')
  } catch (error) {
    logger.warn({ err: error, groupJid, participantJid }, 'Automatic group enrollment failed; check group admin status and contact privacy settings')
  } finally {
    settings.autoEnrollProcessed = [...new Set([...processed, participantJid])].slice(-5000)
    saveSettings(settings)
  }
}

function getText(message) {
  if (!message?.message) return ''
  // A pressed button or list row carries the command it should run; check it first.
  const pressed = extractButtonId(message)
  if (pressed) return pressed.trim()
  const content = unwrapContent(message.message)
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    ''
  ).trim()
}

function menuChannelUrl(menuConfig) {
  const candidates = [menuConfig.channelUrl, process.env.AUTO_FOLLOW_CHANNEL_URL, DEFAULT_CHANNEL_URL]
  return candidates.find((url) => typeof url === 'string' && /^https:\/\/\S+\/\S+/.test(url)) || DEFAULT_CHANNEL_URL
}

function categoryLabel(category) {
  return category === 'tylorWhite' ? 'Tylor White' : category[0].toUpperCase() + category.slice(1)
}

// The short header shown on the menu: bot name and a few facts, no command list.
function menuInfoText(menuConfig, requester) {
  const labels = menuConfig.metadataLabels
  const lines = [
    `${labels.plugins || 'Plugins'}: ${plugins.size}`,
    `${labels.user || 'User'}: ${requesterLabel(requester)}`,
    `${labels.library || 'Library'}: ${menuConfig.library}`,
    `${labels.uptime || 'Uptime'}: ${formatUptime(process.uptime())}`,
    `${labels.owner || 'Owner'}: ${menuConfig.ownerName}`
  ]
  const intro = menuConfig.intro ? `\n\n${menuConfig.intro}` : ''
  return `*${menuConfig.heading}*\n${lines.join('\n')}${intro}`
}

function menuCategoryRows(menuConfig) {
  return Object.keys(menuConfig.categories)
    .filter((category) => Array.isArray(menuConfig.categories[category]) && menuConfig.categories[category].length)
    .map((category) => ({
      id: `${commandPrefix}category:${category}`,
      title: categoryLabel(category),
      description: `${menuConfig.categories[category].length} commands`
    }))
}

// Stops a slow WhatsApp lookup from blocking the menu forever.
function withTimeout(promise, ms, label) {
  let timer
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms) })
  ])
}

async function menuMediaFor(menuConfig) {
  const localMenu = path.join(__dirname, '..', 'assets', 'menu-local.jpeg')
  if (fs.existsSync(localMenu)) return { image: fs.readFileSync(localMenu) }
  const customMenuUrl = getMenuImageUrl(menuConfig)
  if (customMenuUrl) {
    const isVideo = /\.(mp4|webm|mov|mkv)(?:[?#].*)?$/i.test(customMenuUrl)
    return isVideo ? { video: { url: customMenuUrl } } : { image: { url: customMenuUrl } }
  }
  const profileJid = (socket.user?.id || botJid).replace(/:\d+(?=@)/, '')
  if (profileJid) {
    try {
      return { image: { url: await withTimeout(socket.profilePictureUrl(profileJid, 'image'), 5000, 'Profile photo') } }
    } catch (error) {
      logger.debug({ err: error }, 'Bot profile photo unavailable; using configured menu image')
    }
  }
  return { image: { url: MENU_IMAGE_URL } }
}


// Menu style chosen by the owner: 'buttons', 'list' or 'number'.
const MENU_STYLES = { 1: 'buttons', 2: 'list', 3: 'number' }
const MENU_STYLE_NAMES = { buttons: 'Buttons', list: 'List', number: 'Reply with number' }
let menuStyleChoicePending = false

function getMenuStyle() {
  const style = loadSettings().menuStyle
  if (MENU_STYLE_NAMES[style]) return style
  const envStyle = String(process.env.MENU_STYLE || 'number').toLowerCase()
  return MENU_STYLE_NAMES[envStyle] ? envStyle : 'number'
}

function setMenuStyle(style) {
  const settings = loadSettings()
  settings.menuStyle = style
  saveSettings(settings)
}

function ownDmJid() {
  const id = socket.user?.id || botJid || ''
  return id ? id.replace(/:\d+(?=@)/, '') : ''
}

function menuStyleChoiceText() {
  const current = loadSettings().menuStyle
  return `*${BOT_NAME} is connected ✅*\n\nChoose how your menu should look. Reply with a number:\n\n*1* – Buttons\n*2* – List\n*3* – Reply with number\n\n${current ? `Current: ${MENU_STYLE_NAMES[current]}. ` : ''}You can change it any time with ${commandPrefix}menustyle`
}

async function sendMenuStyleChoice(jid = ownDmJid(), { connected = false } = {}) {
  if (!jid) return
  menuStyleChoicePending = true
  const active = MENU_STYLE_NAMES[getMenuStyle()]
  const text = `${connected ? `*${BOT_NAME} is connected ✅*\n\n` : ''}✦ *AVAILABLE MENU STYLES* ✦\n\n*Active:* ${active} 👑\n*Total:* 3 styles\n\n*1* – Buttons\n*2* – List\n*3* – Reply with number\n\nTap a style below, or reply 1, 2 or 3.`
  try {
    await sendButtons(socket, jid, {
      text,
      footer: `${BOT_NAME} • Menu style picker`,
      image: await menuHeaderImage(loadMenu()),
      list: { title: '🎨 Choose style', sectionTitle: 'Menu styles', rows: [
        { id: `${commandPrefix}menustyle 1`, title: 'Buttons', description: 'Photo menu with tap buttons (default)' },
        { id: `${commandPrefix}menustyle 2`, title: 'List', description: 'Photo menu plus a pop-up category list' },
        { id: `${commandPrefix}menustyle 3`, title: 'Reply with number', description: 'Works on every phone' }
      ] },
      buttons: [
        { id: `${commandPrefix}menu`, text: '👑 View active menu' },
        { id: `${commandPrefix}ping`, text: '🤖 System stats' }
      ],
      contextInfo: menuContext()
    }, { noFallback: true, quoted: verifiedQuote() })
  } catch (error) {
    logger.debug({ err: error }, 'Style picker buttons failed; sending text')
    await socket.sendMessage(jid, { text: menuStyleChoiceText() })
  }
}

let resolvedChannel = null

// Finds the channel's id from its link once, so replies can show the channel name and "View channel".
async function resolveMenuChannel() {
  if (resolvedChannel || typeof socket?.newsletterMetadata !== 'function') return resolvedChannel
  try {
    const code = menuChannelUrl(loadMenu()).split('/channel/').pop().split(/[?/]/)[0]
    const meta = await withTimeout(socket.newsletterMetadata('invite', code), 5000, 'Channel lookup')
    const id = meta?.id || meta?.jid
    if (id) resolvedChannel = { jid: id, name: meta?.name || meta?.thread_metadata?.name?.text || BOT_NAME }
  } catch (error) {
    logger.debug({ err: error }, 'Channel details could not be looked up')
  }
  return resolvedChannel
}

function menuContext() {
  const jid = AUTO_FOLLOW_CHANNEL_JID || resolvedChannel?.jid
  return channelContext({ channelJid: jid, channelName: resolvedChannel?.name || BOT_NAME })
}

// The picture used on top of button menus: configured link first, then the built-in picture.
async function menuHeaderImage(menuConfig) {
  // The bot's own picture in assets/menu-local.jpeg is used first: no internet lookup needed.
  const localMenu = path.join(__dirname, '..', 'assets', 'menu-local.jpeg')
  if (fs.existsSync(localMenu)) return fs.readFileSync(localMenu)
  try {
    const media = await menuMediaFor(menuConfig)
    if (media.image?.url) {
      const response = await fetch(media.image.url, { signal: AbortSignal.timeout(10000) })
      if (response.ok) return Buffer.from(await response.arrayBuffer())
    }
  } catch (error) {
    logger.debug({ err: error }, 'Menu picture link failed; using the built-in picture')
  }
  return fs.readFileSync(path.join(__dirname, '..', 'assets', 'menu-fallback.jpeg'))
}

// Buttons style: one card with the picture, bot details and buttons, like a native app.
async function sendButtonMenu(jid, requester) {
  await resolveMenuChannel()
  const menuConfig = loadMenu()
  const rows = menuCategoryRows(menuConfig)
  const total = Object.values(menuConfig.categories).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0)
  const text = `*${BOT_NAME.toUpperCase()}*\n\n👑 *Owner:* ${menuConfig.ownerName}\n⏱️ *Uptime:* ${formatUptime(process.uptime())}\n⚡ *Prefix:* ${commandPrefix}\n👤 *User:* ${requesterLabel(requester)}\n📦 *${rows.length} categories  ${total} commands*\n\n_Tap Full text list to see every command at once._`
  await sendButtons(socket, jid, {
    text,
    title: 'I AM ALIVE',
    footer: `${BOT_NAME} • ${menuConfig.library}`,
    image: await menuHeaderImage(menuConfig),
    // Buttons style shows buttons only, no pop-up category list.
    buttons: [
      { id: `${commandPrefix}menustyle`, text: '🎨 Menu styles' },
      { id: `${commandPrefix}menutext`, text: '📜 Full text list' },
      { url: menuChannelUrl(menuConfig), text: '📢 View channel' }
    ],
    contextInfo: menuContext()
  }, { noFallback: true, quoted: verifiedQuote() })
  menuReplyChats.set(jid, Date.now())
}

// One message: the menu picture, the short bot details, the category pick-list and the buttons.
// The commands of a category are shown only after that category is picked.
async function sendMenu(jid, requester, { forceText = false } = {}) {
  if (!forceText && getMenuStyle() === 'buttons') {
    try {
      await withTimeout(sendButtonMenu(jid, requester), 30000, 'Button menu')
      logger.info({ jid }, 'Button menu sent')
      return
    } catch (error) {
      logger.warn({ err: error }, 'Button menu failed; sending the photo menu instead')
    }
  }
  await resolveMenuChannel()
  const menuConfig = loadMenu()
  // Interactive button menus are silently hidden by many WhatsApp clients, so the menu is sent
  // as a normal picture/video with the full command list in its caption. It always shows.
  const sections = Object.keys(menuConfig.categories)
    .filter((category) => Array.isArray(menuConfig.categories[category]) && menuConfig.categories[category].length)
    .map((category, index) => {
      const commands = menuConfig.categories[category].map((entry) => `│ ▫️ ${commandPrefix}${String(entry).trim().split(/\s+/)[0]}`)
      return `╭─〔 *${index + 1}. ${categoryLabel(category).toUpperCase()}* 〕\n${commands.join('\n')}\n╰────────────`
    })
  const channel = menuChannelUrl(menuConfig)
  const style = forceText ? 'number' : getMenuStyle()
  const hint = style === 'number' ? '_Reply with a category number (for example 1) to open it._' : style === 'list' ? '_Open the list below to pick a category._' : '_Tap a button below to open a category._'
  const text = `${menuInfoText(menuConfig, requester)}\n\n${hint}\n\n${sections.join('\n\n')}`
  // The channel shows as a "View channel" header on the message instead of a raw link.
  const ctx = menuContext()
  try {
    const media = await menuMediaFor(menuConfig)
    const content = media.video ? { video: media.video, caption: text, gifPlayback: false, contextInfo: ctx } : { image: media.image, caption: text, contextInfo: ctx }
    await socket.sendMessage(jid, content)
  } catch (error) {
    logger.warn({ err: error }, 'Menu media link failed; using the built-in menu picture')
    try {
      const fallback = fs.readFileSync(path.join(__dirname, '..', 'assets', 'menu-fallback.jpeg'))
      await socket.sendMessage(jid, { image: fallback, caption: text, contextInfo: ctx })
    } catch (fallbackError) {
      logger.warn({ err: fallbackError }, 'Built-in menu picture failed; sending the menu as text')
      await socket.sendMessage(jid, { text, contextInfo: ctx })
    }
  }
  menuReplyChats.set(jid, Date.now())
  if (style === 'number') return
  // Second message: buttons or list, depending on the chosen style.
  const rows = menuCategoryRows(menuConfig)
  const extra = [
    { url: channel, text: '📢 Channel' },
    { id: `${commandPrefix}owner`, text: '👤 Owner' },
    { id: `${commandPrefix}ping`, text: '🏓 Ping' }
  ]
  const opts = style === 'list'
    ? { text: 'Open the list to pick a category, or reply with its number.', list: { title: 'Categories', rows }, contextInfo: ctx }
    : { text: 'Tap a category, or reply with its number.', buttons: [...rows.map((row) => ({ id: row.id, text: row.title })), ...extra] }
  try {
    await sendButtons(socket, jid, opts, { noFallback: true })
  } catch (error) {
    logger.debug({ err: error }, 'Menu buttons could not be sent; number replies still work')
  }
}

// Chats that recently got the menu, so a bare number reply opens that category (10 minutes).
const menuReplyChats = new Map()
const MENU_REPLY_WINDOW_MS = 10 * 60 * 1000

function menuNumberCategory(jid, text) {
  const sentAt = menuReplyChats.get(jid)
  if (!sentAt || Date.now() - sentAt > MENU_REPLY_WINDOW_MS) return null
  const match = String(text).trim().match(/^(\d{1,2})$/)
  if (!match) return null
  const menuConfig = loadMenu()
  const names = Object.keys(menuConfig.categories)
    .filter((category) => Array.isArray(menuConfig.categories[category]) && menuConfig.categories[category].length)
  return names[Number(match[1]) - 1] || null
}

async function sendCategory(jid, requested) {
  const menuConfig = loadMenu()
  // Commands are lower-cased before they get here, so match the category name loosely.
  const category = Object.keys(menuConfig.categories).find((name) => name.toLowerCase() === String(requested).toLowerCase())
  if (!category) {
    await socket.sendMessage(jid, { text: `Unknown category. Send ${commandPrefix}menu.` })
    return
  }
  const commands = Array.isArray(menuConfig.categories[category]) ? menuConfig.categories[category] : []
  await sendButtons(socket, jid, {
    text: menuCategoryText(menuConfig.categories, category),
    list: {
      title: 'Run a command',
      sectionTitle: categoryLabel(category),
      rows: commands.map((entry) => {
        const name = String(entry).trim().split(/\s+/)[0]
        return { id: `${commandPrefix}${name}`, title: `${commandPrefix}${name}`, description: plugins.get(name.toLowerCase())?.description || '' }
      })
    },
    buttons: [{ id: `${commandPrefix}menu`, text: '⬅️ Menu' }]
  })
}

async function handleMessage(message) {
  if (!message?.message) return

  const jid = message.key.remoteJid
  if (!jid) return

  if (jid === 'status@broadcast') {
    if (message.key.fromMe) return
    if (isAutoViewStatusEnabled()) {
      try {
        await socket.readMessages([message.key])
      } catch (error) {
        logger.debug({ err: error }, 'Automatic status view failed')
      }
    }
    if (isAutoLikeStatusEnabled()) {
      try {
        await socket.sendMessage(jid, {
          react: { text: process.env.AUTO_STATUS_REACTION || '❤️', key: message.key }
        })
      } catch (error) {
        logger.debug({ err: error }, 'Automatic status reaction failed')
      }
    }
    return
  }

  if (isAutoRecordEnabled() && !message.key.fromMe) {
    try {
      await socket.sendPresenceUpdate('recording', jid)
      setTimeout(() => socket.sendPresenceUpdate('paused', jid).catch(() => {}), 5000)
    } catch (error) {
      logger.debug({ err: error, jid }, 'Auto-record presence update failed')
    }
  }

  if (isAutoTypeEnabled() && !message.key.fromMe) {
    try {
      await socket.sendPresenceUpdate('composing', jid)
      setTimeout(() => socket.sendPresenceUpdate('paused', jid).catch(() => {}), 5000)
    } catch (error) {
      logger.debug({ err: error, jid }, 'Auto-type presence update failed')
    }
  }

  const text = getText(message)
  if (!text) return

  {
    const senderName = message.pushName || requesterLabel(requesterJid(message, jid))
    const where = isGroup(jid) ? ` (group ${jidToNumber(jid)})` : ''
    if (message.key?.fromMe) consoleChat.outgoing(senderName, text)
    else consoleChat.incoming(`${senderName}${where}`, text)
  }

  await autoEnrollPrivateContact(message, jid)
  if (!message.key.fromMe && !isGroup(jid)) rememberDmContact(jid)

  const senderForAccess = requesterJid(message, jid)
  const ownerOrSudo = isOwnerMessage(message, jid)

  if (await enforceAntiLinks({ socket, message, jid, text, config: { ownerNumber: OWNER_NUMBER, prefix: commandPrefix }, logger })) return

  // Enforce user ban & muted group before any bot interaction (owner/sudo exempt)
  if (!ownerOrSudo && isUserBanned(senderForAccess)) return
  if (!ownerOrSudo && isGroup(jid) && isGroupBanned(jid)) return

  await handleAfkMessage(socket, message, jid, text, commandPrefix).catch((err) => logger.debug({ err }, 'AFK handler error'))
  if (await handleAutoReply(socket, message, jid, text, commandPrefix).catch(() => false)) return

  if (menuStyleChoicePending && !isGroup(jid) && /^[123]$/.test(text) && isOwnerMessage(message, jid)) {
    const style = MENU_STYLES[text]
    setMenuStyle(style)
    menuStyleChoicePending = false
    await socket.sendMessage(jid, { text: `✅ Menu style set to *${MENU_STYLE_NAMES[style]}*.` })
    await sendMenu(jid, requesterJid(message, jid))
    return
  }

  const numberedCategory = menuNumberCategory(jid, text)
  if (numberedCategory && !(getBotMode() === 'private' && !isOwnerMessage(message, jid))) {
    await sendCategory(jid, numberedCategory)
    return
  }

  if (isChatGPTAutoEnabled() && !message.key.fromMe && !text.startsWith(commandPrefix)) {
    try {
      const answer = await askChatGPT(text)
      await socket.sendMessage(jid, { text: answer.slice(0, 6000) })
    } catch (error) {
      logger.error({ err: error, jid }, 'Automatic ChatGPT reply failed')
    }
    return
  }

  if (!text.startsWith(commandPrefix)) return

  const args = text.slice(commandPrefix.length).trim().split(/\s+/)
  const command = (args.shift() || '').toLowerCase()

  if (getBotMode() === 'private' && !ownerOrSudo) return

  if (!ownerOrSudo) {
    const maint = getMaintenance()
    if (maint.enabled) {
      await socket.sendMessage(jid, {
        text: `🛠️ *${BOT_NAME} is under maintenance*${maint.reason ? `\n${maint.reason}` : ''}. Please try again later.`
      }, { quoted: message })
      return
    }
    if (!isGroup(jid) && isAntiDmEnabled()) {
      await socket.sendMessage(jid, {
        text: '🔒 Private DM commands are currently disabled by the owner. Please use the bot in a group.'
      }, { quoted: message })
      return
    }
    const cd = checkCooldown(senderForAccess)
    if (!cd.allowed) {
      await socket.sendMessage(jid, {
        text: `⏳ Please wait *${cd.remaining}s* before sending another command.`
      }, { quoted: message })
      return
    }
  }

  if (isCommandDisabled(command) && !['deletefunct', 'restorefunct'].includes(command)) {
    await socket.sendMessage(jid, { text: `The ${commandPrefix}${command} command is disabled. Ask the owner to restore it.` }, { quoted: message })
    return
  }

  if (command.startsWith('category:')) {
    await sendCategory(jid, command.slice('category:'.length))
    return
  }

  if (['ping', 'p', 'pong', 'speed'].includes(command)) {
    const started = Date.now()
    const notice = await socket.sendMessage(jid, { text: '⚡ _Calculating latency..._' }, { quoted: message })
    const card = await buildPingCard(Date.now() - started, BOT_NAME)
    const extra = { contextInfo: menuContext() }
    if (card.image) await socket.sendMessage(jid, { image: card.image, caption: `📡 *${BOT_NAME}* is live · ${Date.now() - started} ms`, ...extra }, { quoted: message })
    else await socket.sendMessage(jid, { text: card.text, ...extra }, { quoted: message })
    if (notice?.key) await socket.sendMessage(jid, { text: `✅ Pong! ${Date.now() - started} ms`, edit: notice.key }).catch(() => {})
    return
  }

  const plugin = plugins.get(command)
  if (plugin) {
    try {
      await plugin.execute({
        // Replies that offer a choice are sent with buttons; everything else is unchanged.
        socket: withAutoButtons(socket, { plugin, command, args, prefix: commandPrefix }),
        message,
        jid,
        args,
        command,
        prefix: commandPrefix,
        config: { botName: BOT_NAME, ownerNumber: OWNER_NUMBER, setPrefix, setMenuImage, addMenuImage, getMenuImages, setChatGPTAuto, setAutoRecord, setAutoType, setAutoViewStatus, setAutoLikeStatus, requestPairingCode: requestWhatsAppPairingCode, getBotMode, setBotMode, setCommandDisabled, getDisabledCommands },
        logger
      })
      logger.info({ command, plugin: plugin.__filename, from: jidToNumber(jid), group: isGroup(jid) }, 'Plugin handled')
      consoleChat.info(`Command ${commandPrefix}${command} handled for ${jidToNumber(jid)}`)
    } catch (error) {
      logger.error({ err: error, command, plugin: plugin.__filename, from: jidToNumber(jid) }, 'Plugin failed')
      consoleChat.info(`Command ${commandPrefix}${command} failed: ${error?.message || 'unknown error'}`)
      await socket.sendMessage(jid, {
        text: `The ${commandPrefix}${command} command failed: ${error?.message || 'the provider is unavailable right now.'}`
      }, { quoted: message })
    }
    return
  }

  switch (command) {
    case 'alive':
    case 'runtime':
    case 'botinfo': {
      const menuConfig = loadMenu()
      const total = Object.values(menuConfig.categories).reduce((sum, list) => sum + list.length, 0)
      await sendButtons(socket, jid, {
        text: `*${BOT_NAME} is alive* ✅\n\n⏱️ *Uptime:* ${formatUptime(process.uptime())}\n👑 *Owner:* ${menuConfig.ownerName}\n📦 *Commands:* ${total}\n⚡ *Prefix:* ${commandPrefix}\n🌐 *Mode:* ${getBotMode()}`,
        image: await menuHeaderImage(menuConfig),
        buttons: [
          { id: `${commandPrefix}menu`, text: '📋 Menu' },
          { id: `${commandPrefix}ping`, text: '🤖 System stats' },
          { url: menuChannelUrl(menuConfig), text: '📢 View channel' }
        ],
        contextInfo: menuContext()
      }, { quoted: verifiedQuote() })
      break
    }
    case 'menu':
    case 'help':
      await sendMenu(jid, requesterJid(message, jid))
      break
    case 'menutext':
    case 'allmenu':
      await sendMenu(jid, requesterJid(message, jid), { forceText: true })
      break
    case 'menustyle': {
      if (!isOwnerMessage(message, jid)) break
      const pick = MENU_STYLES[args[0]] || Object.keys(MENU_STYLE_NAMES).find((k) => k === String(args[0] || '').toLowerCase())
      if (pick) {
        setMenuStyle(pick)
        menuStyleChoicePending = false
        await socket.sendMessage(jid, { text: `✅ Menu style set to *${MENU_STYLE_NAMES[pick]}*.` })
        await sendMenu(jid, requesterJid(message, jid))
      } else {
        await sendMenuStyleChoice(jid)
      }
      break
    }
    case 'ping':
      await socket.sendMessage(jid, { text: 'Pong.' })
      break
    default:
      // Unknown commands are intentionally silent. This prevents a misleading
      // menu instruction when WhatsApp re-delivers or partially unwraps a
      // command that was already handled by a valid plugin.
      break
  }

  logger.info({ command, from: jidToNumber(jid), group: isGroup(jid) }, 'Command handled')
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  socket = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false
  })
  installConversationLogging()

  logger.info({
    authDir: AUTH_DIR,
    pairingNumberConfigured: Boolean(selectedPairingNumber),
    sessionAlreadyRegistered: state.creds.registered
  }, 'Authentication configuration loaded')

  const requestPairingCode = async (phoneNumber) => {
    const number = String(phoneNumber || '').replace(/[^0-9]/g, '')
    if (number.length < 7 || number.length > 15) {
      logger.warn('Enter an international phone number with country code, for example 254700000000.')
      return { ok: false, reason: 'invalid-number' }
    }
    if (state.creds.registered) {
      logger.info('This auth_info session is already registered. Clear the revoked session before requesting another pairing code.')
      return { ok: false, reason: 'already-registered' }
    }
    if (pairingRequested) {
      logger.warn('A pairing-code request is already in progress. Wait for its result before trying another number.')
      return { ok: false, reason: 'busy' }
    }

    pairingRequested = true
    try {
      const code = await socket.requestPairingCode(number)
      console.log(`\x1b[96m[PAIRING CODE]\x1b[0m ${code}`)
      console.log('\x1b[96mOpen WhatsApp → Linked devices → Link a device → Link with phone number.\x1b[0m')
      return { ok: true, code, number }
    } catch (error) {
      pairingRequested = false
      logger.warn({ err: error }, 'Pairing request failed; returning to the login options instead of retrying automatically')
      selectedPairingNumber = ''
      selectedLoginMethod = 'qr'
      startupPromptActive = true
      console.log('\x1b[93mPairing failed. No additional code was requested. Returning to the login options...\x1b[0m')
      setTimeout(async () => {
        try {
          await chooseStartupLoginMethod()
          if (selectedLoginMethod === 'pair' && selectedPairingNumber && !state.creds.registered) {
            await requestPairingCode(selectedPairingNumber)
          }
        } catch (restartError) {
          logger.error({ err: restartError }, 'Could not reopen the WhatsApp login options')
        }
      }, 250)
      return { ok: false, reason: 'request-failed' }
    }
  }

  requestPanelPairingCode = (phoneNumber) => requestPairingCode(phoneNumber)
  requestWhatsAppPairingCode = requestPairingCode

  if (selectedLoginMethod === 'pair' && selectedPairingNumber && !state.creds.registered) {
    setTimeout(() => requestPairingCode(selectedPairingNumber), 3000)
  } else if (state.creds.registered) {
    logger.info('This auth_info session is already registered; pairing code is disabled. Delete auth_info only if you intend to pair again.')
  }

  socket.ev.on('creds.update', async () => {
    await saveCreds()
    scheduleRemoteBackup(logger)
  })

  socket.ev.on('group-participants.update', async (event) => {
    try {
      const groupJid = event?.id
      if (!groupJid || !Array.isArray(event?.participants)) return
      const settings = getGroupSettings(groupJid)
      const isAdd = event.action === 'add'
      const isRemove = event.action === 'remove'
      if (isAdd && !settings.welcomeEnabled) return
      if (isRemove && !settings.goodbyeEnabled) return
      if (!isAdd && !isRemove) return

      const meta = await socket.groupMetadata(groupJid).catch(() => null)
      const groupName = meta?.subject || 'this group'
      const template = isAdd
        ? (settings.welcomeText || 'Welcome to *{group}*, @{user}! 👋')
        : (settings.goodbyeText || 'Goodbye @{user}, thanks for being part of *{group}*.')

      for (const participant of event.participants) {
        const userNum = jidToNumber(participant)
        const text = template.replace(/\{user\}/gi, userNum).replace(/\{group\}/gi, groupName)
        await socket.sendMessage(groupJid, { text, mentions: [participant] })
      }
    } catch (error) {
      logger.debug({ err: error }, 'Group welcome/goodbye announcement failed')
    }
  })

  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      latestQr = qr
      if (connectionState !== 'pairing') connectionState = 'qr'
      if (selectedLoginMethod !== 'pair') {
        console.log('\x1b[96mScan the QR code below from WhatsApp → Linked devices.\x1b[0m')
        qrcode.generate(qr, { small: true })
      }
    }

    if (connection === 'open') {
      isReady = true
      latestQr = ''
      pairingRequested = false
      connectionState = 'connected'
      botJid = socket.user?.id || state.creds.me?.id || ''
      await saveCreds().catch(() => {})
      scheduleRemoteBackup(logger)
      logger.info({ user: socket.user?.id }, `${BOT_NAME} connected`)
      await followConfiguredChannel()
      await joinConfiguredGroup()
      try {
        await sendMenuStyleChoice(undefined, { connected: true })
      } catch (error) {
        logger.warn({ err: error }, 'Could not send the menu style choice to your DM')
      }
    }

    if (connection === 'close') {
      isReady = false
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const errorText = String(lastDisconnect?.error?.message || '')
      const isConflict = statusCode === 440 || /conflict|replaced/i.test(errorText)
      const sessionWasRevoked = !isConflict && (
        statusCode === DisconnectReason.loggedOut ||
        statusCode === 401 ||
        /device_removed|logged out/i.test(errorText)
      )
      const shouldReconnect = !sessionWasRevoked

      if (sessionWasRevoked) {
        if (sessionRecoveryTimer) return
        const oldSocket = socket
        try {
          // Stop the old socket first. Waiting before removing auth state avoids
          // racing Baileys' in-flight retry/decryption tasks after device_removed.
          oldSocket?.end(undefined)
        } catch (error) {
          logger.debug({ err: error }, 'Old WhatsApp socket was already closed')
        }
        pairingRequested = false
        requestPanelPairingCode = null
        requestWhatsAppPairingCode = null
        sessionRecoveryTimer = setTimeout(async () => {
          sessionRecoveryTimer = null
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true })
            logger.warn({ authDir: AUTH_DIR, statusCode }, 'Revoked WhatsApp session cleared; requesting a fresh link')
            await connectToWhatsApp()
          } catch (error) {
            logger.error({ err: error, authDir: AUTH_DIR }, 'Could not restart after clearing revoked WhatsApp session')
          }
        }, 2000)
        return
      }

      logger.warn({ statusCode, shouldReconnect }, 'WhatsApp connection closed')
      if (shouldReconnect) {
        connectionState = 'reconnecting'
        pairingRequested = false
        requestPanelPairingCode = null
        requestWhatsAppPairingCode = null
        const delayMs = isConflict ? 8000 : 5000
        if (isConflict) {
          logger.warn({ statusCode }, 'Temporary session conflict during restart — keeping auth_info intact and reconnecting in 8s')
        }
        setTimeout(connectToWhatsApp, delayMs)
      }
    }
  })

  socket.ev.on('call', async (calls) => {
    if (!isAntiCallEnabled()) return
    for (const call of calls || []) {
      if (call.status !== 'offer') continue
      try {
        if (typeof socket.rejectCall === 'function') {
          await socket.rejectCall(call.id, call.from)
        }
        await socket.sendMessage(call.from, {
          text: `📵 *${BOT_NAME}:* Calls are automatically declined. Please send a text message instead.`
        }).catch(() => {})
      } catch (err) {
        logger.debug({ err }, 'Anti-call reject failed')
      }
    }
  })

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    // Messages sent by the linked account can be delivered as `append`, while
    // incoming live messages normally arrive as `notify`. Process both so the
    // owner can use commands from their own WhatsApp chat as well.
    if (type !== 'notify' && type !== 'append') return
    for (const message of messages) {
      try {
        const messageId = message?.key?.id
        if (messageId && handledMessageIds.has(messageId)) continue
        if (messageId) {
          handledMessageIds.add(messageId)
          if (handledMessageIds.size > 2000) {
            const oldest = handledMessageIds.values().next().value
            handledMessageIds.delete(oldest)
          }
        }
        await handleMessage(message)
      } catch (error) {
        logger.error({ err: error }, 'Message handler failed')
      }
    }
  })
}

function isExpectedConnectionShutdown(error) {
  const statusCode = error?.output?.statusCode || error?.data?.statusCode
  const message = String(error?.message || error || '')
  return statusCode === 401 || statusCode === 428 || /Connection Closed|device_removed|Stream Errored/i.test(message)
}

let panelInput = readline.createInterface({ input: process.stdin, output: process.stdout })

function askPanel(question) {
  return new Promise((resolve) => panelInput.question(question, (answer) => resolve(answer.trim())))
}

async function chooseStartupLoginMethod() {
  const { state } = await useMultiFileAuthState(AUTH_DIR)
  if (state.creds.registered) {
    selectedLoginMethod = 'session'
    startupPromptActive = false
    logger.info('Existing WhatsApp session found. Reusing it without requesting a new QR or pairing code.')
    return
  }

  const configuredMethod = String(process.env.LOGIN_METHOD || '').trim().toLowerCase()
  const nonInteractive = !process.stdin.isTTY || process.env.WEB_PAIRING === 'true'
  if (configuredMethod === 'qr' || configuredMethod === 'pair' || configuredMethod === 'web') {
    selectedLoginMethod = configuredMethod === 'web' ? 'pair' : configuredMethod
  } else if (PAIRING_NUMBER) {
    selectedLoginMethod = 'pair'
  } else if (nonInteractive) {
    selectedLoginMethod = 'pair'
    startupPromptActive = false
    console.log(`\x1b[96m[WEB PAIRING]\x1b[0m Open http://localhost:${PORT} to pair WhatsApp from your browser.`)
    return
  } else {
    const neon = '\x1b[96m'
    const purple = '\x1b[95m'
    const reset = '\x1b[0m'
    console.log(`\n${neon}╔════════════════════════════════════════════╗${reset}`)
    console.log(`${neon}║${reset}        ${purple}W H I T E   M D${reset}  ${neon}NEON LINK${reset}       ${neon}║${reset}`)
    console.log(`${neon}╠════════════════════════════════════════════╣${reset}`)
    console.log(`${neon}║${reset}  ${neon}REPLY WITH NUMBER FOR PAIRING OPTION${reset}     ${neon}║${reset}`)
    console.log(`${neon}║${reset}  ${neon}1.${reset} QR CODE                                ${neon}║${reset}`)
    console.log(`${neon}║${reset}  ${neon}2.${reset} PHONE NUMBER                          ${neon}║${reset}`)
    console.log(`${neon}╚════════════════════════════════════════════╝${reset}`)
    while (true) {
      const choice = await askPanel(`${neon}WHITE MD › ${reset}`)
      if (choice === '1') {
        selectedLoginMethod = 'qr'
        break
      }
      if (choice === '2') {
        selectedLoginMethod = 'pair'
        break
      }
      logger.warn('Invalid choice. Enter 1 for QR or 2 for pairing code.')
    }
  }

  if (selectedLoginMethod === 'pair' && !selectedPairingNumber) {
    const neon = '\x1b[96m'
    const yellow = '\x1b[93m'
    const reset = '\x1b[0m'
    console.log(`\n${neon}╔════════════════════════════════════════════╗${reset}`)
    console.log(`${neon}║${reset}      ${yellow}HOW TO SEND YOUR PAIRING NUMBER${reset}       ${neon}║${reset}`)
    console.log(`${neon}╠════════════════════════════════════════════╣${reset}`)
    console.log(`${neon}║${reset}  1. Type your WhatsApp number WITH country  ${neon}║${reset}`)
    console.log(`${neon}║${reset}     code, digits only. No +, spaces or 0.   ${neon}║${reset}`)
    console.log(`${neon}║${reset}     Example: ${yellow}254712345678${reset}                   ${neon}║${reset}`)
    console.log(`${neon}║${reset}  2. Press ENTER. An 8-character code shows. ${neon}║${reset}`)
    console.log(`${neon}║${reset}  3. On your phone open WhatsApp → Settings  ${neon}║${reset}`)
    console.log(`${neon}║${reset}     → Linked devices → Link a device →      ${neon}║${reset}`)
    console.log(`${neon}║${reset}     Link with phone number instead.         ${neon}║${reset}`)
    console.log(`${neon}║${reset}  4. Enter the code within 60 seconds.       ${neon}║${reset}`)
    console.log(`${neon}╚════════════════════════════════════════════╝${reset}`)
    while (true) {
      const rawNumber = await askPanel('\x1b[96mSEND NUMBER AS 254********* (NO PLUS SIGN) › \x1b[0m')
      const number = rawNumber.replace(/[^0-9]/g, '')
      if (/^[0-9]+$/.test(rawNumber) && number.length >= 7 && number.length <= 15) {
        selectedPairingNumber = number
        break
      }
      logger.warn('Invalid number. Use 254********* format with digits only and no plus sign, for example 254700000000.')
    }
  }

  logger.info(selectedLoginMethod === 'pair'
    ? 'Pairing-code login selected. The code will be printed after the socket is ready.'
    : 'QR login selected. Scan the QR code printed by White MD.')
  startupPromptActive = false
}

panelInput.on('line', async (line) => {
  if (startupPromptActive) return
  const rawNumber = line.trim()
  if (!rawNumber) return
  const number = rawNumber.replace(/[^0-9]/g, '')
  if (!/^[0-9]+$/.test(rawNumber) || number.length < 7 || number.length > 15) {
    logger.warn('Invalid panel number. Use 254********* format with digits only and no plus sign.')
    return
  }
  if (!requestPanelPairingCode) {
    logger.warn('Pairing is not ready yet. Wait a few seconds and enter the phone number again.')
    return
  }
  await requestPanelPairingCode(number)
})

process.on('unhandledRejection', (error) => {
  if (isExpectedConnectionShutdown(error)) {
    logger.warn({ err: error }, 'Ignored expected Baileys shutdown error while resetting the WhatsApp session')
    return
  }
  logger.error({ err: error }, 'Unhandled promise rejection')
})

process.on('uncaughtException', (error) => {
  if (isExpectedConnectionShutdown(error)) {
    logger.warn({ err: error }, 'Ignored expected Baileys connection shutdown error')
    return
  }
  logger.fatal({ err: error }, 'Uncaught exception')
  process.exitCode = 1
})

startReminderScheduler(() => (isReady ? socket : null), logger)

;(async () => {
  const localRestore = restoreSessionBundle()
  if (localRestore.restored) {
    logger.info('Restored WhatsApp session and settings from SESSION_ID environment variable')
  } else {
    await pullRemoteBackup(logger)
  }
  await chooseStartupLoginMethod()
  await connectToWhatsApp()
})()
  .catch((error) => {
    logger.fatal({ err: error }, 'Initial WhatsApp connection failed')
    process.exitCode = 1
  })

process.on('SIGINT', async () => {
  logger.info('Shutting down')
  panelInput.close()
  if (socket) socket.end(undefined)
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('Shutting down')
  panelInput.close()
  if (socket) socket.end(undefined)
  process.exit(0)
})
