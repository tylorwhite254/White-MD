'use strict'

const { dataPath, readJsonSafe, writeJsonAtomic, scheduleRemoteBackup } = require('../lib/storage')

const NOTES_FILE = dataPath('notes.json')

function loadNotes() {
  return readJsonSafe(NOTES_FILE, {})
}

function saveNotes(notes) {
  writeJsonAtomic(NOTES_FILE, notes)
  scheduleRemoteBackup()
}

module.exports = {
  command: ['note', 'notes', 'delnote'],
  category: 'tools',
  description: 'save, list, and delete persistent chat notes',

  async execute({ socket, message, jid, args, command, prefix }) {
    const all = loadNotes()
    const chatNotes = all[jid] && typeof all[jid] === 'object' ? all[jid] : {}

    if (command === 'notes') {
      const names = Object.keys(chatNotes).sort()
      if (!names.length) {
        await socket.sendMessage(jid, {
          text: `No notes saved in this chat yet.\nSave one with: *${prefix}note rules Be kind to everyone*`
        }, { quoted: message })
        return
      }
      const list = names.map((n, i) => `${i + 1}. *${n}*`).join('\n')
      await socket.sendMessage(jid, {
        text: `📝 *Saved Notes (${names.length})*\n\n${list}\n\nRead a note: *${prefix}note <name>*\nDelete a note: *${prefix}delnote <name>*`
      }, { quoted: message })
      return
    }

    const name = String(args[0] || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (!name) {
      await socket.sendMessage(jid, {
        text: `Usage:\n• *${prefix}note <name> <text>* — save a note\n• *${prefix}note <name>* — read a note\n• *${prefix}notes* — list all notes\n• *${prefix}delnote <name>* — delete a note`
      }, { quoted: message })
      return
    }

    if (command === 'delnote') {
      if (!chatNotes[name]) {
        await socket.sendMessage(jid, { text: `No note named *${name}* was found.` }, { quoted: message })
        return
      }
      delete chatNotes[name]
      all[jid] = chatNotes
      saveNotes(all)
      await socket.sendMessage(jid, { text: `🗑️ Deleted note *${name}*.` }, { quoted: message })
      return
    }

    const body = args.slice(1).join(' ').trim()
    if (!body) {
      if (!chatNotes[name]) {
        await socket.sendMessage(jid, { text: `Note *${name}* does not exist. Add text after the name to create it.` }, { quoted: message })
        return
      }
      await socket.sendMessage(jid, { text: `📝 *${name}*\n\n${chatNotes[name].text}` }, { quoted: message })
      return
    }

    chatNotes[name] = { text: body.slice(0, 2000), updatedAt: new Date().toISOString() }
    all[jid] = chatNotes
    saveNotes(all)
    await socket.sendMessage(jid, { text: `✅ Saved note *${name}*. It will stay saved even after restarts.` }, { quoted: message })
  }
}
