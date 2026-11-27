'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function loadFreshStorage(tmpDir) {
  process.env.DATA_DIR = tmpDir
  delete process.env.AUTH_DIR
  const storagePath = require.resolve('../src/lib/storage')
  delete require.cache[storagePath]
  return require(storagePath)
}

test('atomic JSON writes survive corruption via .bak fallback', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitemd-test-'))
  try {
    const storage = loadFreshStorage(tmpDir)
    const file = storage.dataPath('bot_settings.json')
    storage.writeJsonAtomic(file, { prefix: '!', botMode: 'public' })
    storage.writeJsonAtomic(file, { prefix: '#', botMode: 'private' })
    assert.deepEqual(storage.readJsonSafe(file), { prefix: '#', botMode: 'private' })

    // Corrupt primary file; readJsonSafe must recover from .bak
    fs.writeFileSync(file, '{ broken json', 'utf8')
    assert.deepEqual(storage.readJsonSafe(file), { prefix: '!', botMode: 'public' })
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('SESSION_ID export and restore survives full DATA_DIR wipe', () => {
  const tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'whitemd-s1-'))
  const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'whitemd-s2-'))
  try {
    const storage1 = loadFreshStorage(tmpDir1)
    storage1.ensureDir(storage1.AUTH_DIR)
    storage1.writeJsonAtomic(path.join(storage1.AUTH_DIR, 'creds.json'), {
      noiseKey: { private: 'abc', public: 'def' },
      registered: true,
      me: { id: '254712345678:1@s.whatsapp.net' }
    })
    storage1.writeJsonAtomic(storage1.dataPath('bot_settings.json'), { prefix: '!', botMode: 'private' })
    storage1.writeJsonAtomic(storage1.dataPath('notes.json'), { '123@g.us': { rules: { text: 'Be kind' } } })

    const sessionId = storage1.exportSessionBundle()
    assert.ok(sessionId && sessionId.startsWith('WHITE-MD~'))

    // Simulate fresh ephemeral container restart in tmpDir2
    const storage2 = loadFreshStorage(tmpDir2)
    const result = storage2.restoreSessionBundle(sessionId)
    assert.equal(result.restored, true)

    const restoredCreds = storage2.readJsonSafe(path.join(storage2.AUTH_DIR, 'creds.json'))
    assert.equal(restoredCreds.registered, true)
    assert.equal(restoredCreds.me.id, '254712345678:1@s.whatsapp.net')

    const restoredSettings = storage2.readJsonSafe(storage2.dataPath('bot_settings.json'))
    assert.equal(restoredSettings.prefix, '!')
    assert.equal(restoredSettings.botMode, 'private')

    const restoredNotes = storage2.readJsonSafe(storage2.dataPath('notes.json'))
    assert.equal(restoredNotes['123@g.us'].rules.text, 'Be kind')
  } finally {
    fs.rmSync(tmpDir1, { recursive: true, force: true })
    fs.rmSync(tmpDir2, { recursive: true, force: true })
  }
})

test('notes plugin saves, reads, lists, and deletes persistently', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitemd-notes-'))
  try {
    loadFreshStorage(tmpDir)
    const notesPath = require.resolve('../src/plugins/notes')
    delete require.cache[notesPath]
    const notesPlugin = require(notesPath)

    const sent = []
    const socket = { sendMessage: async (_jid, payload) => sent.push(payload.text) }
    const jid = '120363000000@g.us'
    const message = { key: { remoteJid: jid } }

    await notesPlugin.execute({ socket, message, jid, args: ['rules', 'No', 'spam'], command: 'note', prefix: '.' })
    assert.match(sent.at(-1), /Saved note \*rules\*/)

    await notesPlugin.execute({ socket, message, jid, args: ['rules'], command: 'note', prefix: '.' })
    assert.match(sent.at(-1), /No spam/)

    await notesPlugin.execute({ socket, message, jid, args: [], command: 'notes', prefix: '.' })
    assert.match(sent.at(-1), /Saved Notes \(1\)/)

    await notesPlugin.execute({ socket, message, jid, args: ['rules'], command: 'delnote', prefix: '.' })
    assert.match(sent.at(-1), /Deleted note \*rules\*/)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
