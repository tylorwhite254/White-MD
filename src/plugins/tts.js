'use strict'

const path = require('node:path')
const tts = require('../lib/tts')
const { dataPath, readJsonSafe, writeJsonAtomic } = require('../lib/storage')

const SETTINGS_FILE = process.env.TTS_SETTINGS_FILE ? path.resolve(process.env.TTS_SETTINGS_FILE) : dataPath('tts_settings.json')
const ROLE_NAMES = Object.keys(tts.ROLES)
const ENGINE_LABEL = {
  edge: 'Edge voice', google: 'Google voice', tiktok: 'TikTok voice', moonbase: 'Moonbase voice'
}

function readSettings() {
  return readJsonSafe(SETTINGS_FILE, {})
}

function saveVoice(jid, voice) {
  const all = readSettings()
  if (voice) all[jid] = { voice }
  else delete all[jid]
  writeJsonAtomic(SETTINGS_FILE, all)
}

function textOf(msg) {
  const m = msg?.message || msg || {}
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || ''
}

function quotedText(message) {
  const inner = message?.message || {}
  const ctx = inner.extendedTextMessage?.contextInfo || inner.imageMessage?.contextInfo || inner.videoMessage?.contextInfo
  return ctx?.quotedMessage ? textOf({ message: ctx.quotedMessage }) : ''
}

function usage(prefix) {
  return [
    '*Text to speech*',
    '',
    `${prefix}tts Hello there        (best available voice, with automatic backups)`,
    `${prefix}tts villain You dare speak to me?`,
    `${prefix}tts en-GB-RyanNeural Well, well.`,
    `Reply to any text with ${prefix}tts to hear it.`,
    '',
    '*Pick an engine*',
    `${prefix}tts1 Edge · ${prefix}tts2 Google · ${prefix}tts3 TikTok · ${prefix}tts4 Moonbase`,
    '',
    `*Roles:* ${ROLE_NAMES.map((r) => `${prefix}${r === 'ai' ? 'airole' : r}`).join(' ')}`,
    `${prefix}voices [filter] lists voices · ${prefix}ttsvoice <voice|role|reset> sets this chat's default`
  ].join('\n')
}

module.exports = {
  command: 'tts',
  aliases: [
    'speak', 'tts1', 'tts2', 'tts3', 'tts4',
    'edgetts', 'googletts', 'tiktoktts', 'moonbase',
    'narrator', 'villain', 'hero', 'kid', 'airole',
    'voices', 'ttsvoice', 'ttsroles'
  ],
  category: 'tts',
  description: 'text to speech with Edge, Google, TikTok and Moonbase voices',

  async execute({ socket, message, jid, args, command, prefix = '.', logger }) {
    const name = String(command || 'tts').toLowerCase()
    const reply = (text) => socket.sendMessage(jid, { text }, { quoted: message })

    if (name === 'voices' || name === 'ttsroles') {
      const filter = (args || []).join(' ')
      const list = tts.listVoices(filter)
      const roles = ROLE_NAMES.map((r) => `• ${r} → ${tts.ROLES[r].edge}`).join('\n')
      await reply(`*Roles*\n${roles}\n\n*Edge voices${filter ? ` matching "${filter}"` : ''}*\n${list.length ? list.join('\n') : 'None found. Any valid Edge voice name still works.'}`)
      return
    }

    if (name === 'ttsvoice') {
      const pick = (args || [])[0]
      if (!pick) {
        const current = readSettings()[jid]?.voice || tts.DEFAULT_VOICE
        await reply(`Current voice: *${current}*\nChange it with ${prefix}ttsvoice <voice or role>, or ${prefix}ttsvoice reset.`)
        return
      }
      if (pick.toLowerCase() === 'reset') {
        saveVoice(jid, null)
        await reply(`Voice reset to ${tts.DEFAULT_VOICE}.`)
        return
      }
      const role = pick.toLowerCase() === 'airole' ? 'ai' : pick.toLowerCase()
      const voice = tts.ROLES[role]?.edge || (tts.isVoiceName(pick) ? pick : null)
      if (!voice) {
        await reply(`I do not know "${pick}". Try a role (${ROLE_NAMES.join(', ')}) or a name like en-US-GuyNeural. ${prefix}voices lists them.`)
        return
      }
      saveVoice(jid, voice)
      await reply(`Voice set to *${voice}* for this chat.`)
      return
    }

    // Work out engine and role from the command name.
    let engine = null
    let role = null
    const numbered = /^tts([1-4])$/.exec(name)
    if (numbered) engine = tts.NUMBERED[numbered[1]]
    else if (name === 'edgetts') engine = 'edge'
    else if (name === 'googletts') engine = 'google'
    else if (name === 'tiktoktts') engine = 'tiktok'
    else if (name === 'moonbase') engine = 'moonbase'
    else if (name === 'airole') role = 'ai'
    else if (tts.ROLES[name]) role = name

    // Optional first word: a role or a full voice name.
    const words = [...(args || [])]
    let voice = null
    const first = words[0]?.toLowerCase()
    if (first && tts.ROLES[first === 'airole' ? 'ai' : first] && words.length > 1) {
      role = first === 'airole' ? 'ai' : first
      words.shift()
    } else if (words[0] && tts.isVoiceName(words[0]) && words.length > 1) {
      voice = words.shift()
    }

    const text = words.join(' ').trim() || quotedText(message)
    if (!text) {
      await reply(usage(prefix))
      return
    }

    if (!voice && !role) voice = readSettings()[jid]?.voice || null

    try {
      try { await socket.sendPresenceUpdate?.('recording', jid) } catch {}
      const result = await tts.synthesize(text, { engine, voice, role })

      let audio = result.audio
      let mimetype = result.mime
      let ptt = false
      const note = process.env.TTS_VOICE_NOTE === 'off' ? null : await tts.toVoiceNote(result.audio)
      if (note) {
        audio = note
        mimetype = 'audio/ogg; codecs=opus'
        ptt = true
      }

      await socket.sendMessage(jid, { audio, mimetype, ptt }, { quoted: message })
      if (result.failures?.length) logger?.warn?.({ failures: result.failures, used: result.engine }, 'TTS backup engine used')
      logger?.info?.({ engine: result.engine, voice: result.voice }, `TTS sent with ${ENGINE_LABEL[result.engine] || result.engine}`)
    } catch (error) {
      logger?.error?.({ err: error }, 'TTS failed')
      await reply(`I could not make that voice: ${error?.message || 'every engine failed.'}`)
    } finally {
      try { await socket.sendPresenceUpdate?.('paused', jid) } catch {}
    }
  }
}
