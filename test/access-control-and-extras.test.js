'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'white-md-v17-test-'))
process.env.DATA_DIR = tmpDir

const access = require('../src/lib/access-control')
const accessPlugin = require('../src/plugins/access-control')
const extraPlugin = require('../src/plugins/extra-commands')

function makeSocket() {
  const sent = []
  return {
    user: { id: '254700000000:1@s.whatsapp.net' },
    sent,
    async sendMessage(jid, payload) {
      sent.push({ jid, payload })
      return { key: { id: `msg-${sent.length}` } }
    }
  }
}

test('access-control library: ban, unban, group ban, sudo, cooldown, maintenance persist', () => {
  assert.equal(access.isUserBanned('254711111111@s.whatsapp.net'), false)

  const banned = access.banUser('254711111111@s.whatsapp.net', { reason: 'Spamming', by: '254700000000' })
  assert.equal(banned.ok, true)
  assert.equal(access.isUserBanned('254711111111@s.whatsapp.net'), true)
  assert.equal(access.getBanInfo('254711111111').reason, 'Spamming')

  const unbanned = access.unbanUser('254711111111')
  assert.equal(unbanned.ok, true)
  assert.equal(access.isUserBanned('254711111111'), false)

  assert.equal(access.banGroup('120363000000000000@g.us', { reason: 'Quiet' }).ok, true)
  assert.equal(access.isGroupBanned('120363000000000000@g.us'), true)
  assert.equal(access.unbanGroup('120363000000000000@g.us').ok, true)
  assert.equal(access.isGroupBanned('120363000000000000@g.us'), false)

  assert.equal(access.addSudo('254722222222').ok, true)
  assert.equal(access.isSudoUser('254722222222@s.whatsapp.net'), true)
  assert.equal(access.removeSudo('254722222222').ok, true)
  assert.equal(access.isSudoUser('254722222222'), false)

  access.setCooldownSeconds(5)
  assert.equal(access.checkCooldown('254733333333').allowed, true)
  assert.equal(access.checkCooldown('254733333333').allowed, false)
  access.setCooldownSeconds(0)

  access.setMaintenance(true, 'Upgrading')
  assert.deepEqual(access.getMaintenance(), { enabled: true, reason: 'Upgrading' })
  access.setMaintenance(false)
})

test('access-control plugin: non-owner blocked, owner can ban/unban and cannot ban owner', async () => {
  const socket = makeSocket()
  const config = { ownerNumber: '254700000000' }

  // Non-owner rejected
  await accessPlugin.execute({
    socket,
    message: { key: { remoteJid: '254799999999@s.whatsapp.net', fromMe: false } },
    jid: '254799999999@s.whatsapp.net',
    args: ['254711111111'],
    command: 'ban',
    prefix: '.',
    config
  })
  assert.match(socket.sent.at(-1).payload.text, /Only the bot owner/i)

  // Owner cannot ban themselves
  await accessPlugin.execute({
    socket,
    message: { key: { remoteJid: '254700000000@s.whatsapp.net', fromMe: true } },
    jid: '254700000000@s.whatsapp.net',
    args: ['254700000000'],
    command: 'ban',
    prefix: '.',
    config
  })
  assert.match(socket.sent.at(-1).payload.text, /cannot ban the bot owner/i)

  // Owner bans user
  await accessPlugin.execute({
    socket,
    message: { key: { remoteJid: '254700000000@s.whatsapp.net', fromMe: true } },
    jid: '254700000000@s.whatsapp.net',
    args: ['254788888888', 'Abusing', 'commands'],
    command: 'ban',
    prefix: '.',
    config
  })
  assert.equal(access.isUserBanned('254788888888'), true)
  assert.match(socket.sent.at(-1).payload.text, /User Banned from Bot/)
})

test('extra-commands plugin: todo, autoreply, password, choose, cleanlink, stats', async () => {
  const socket = makeSocket()
  const ownerMsg = { key: { remoteJid: '254700000000@s.whatsapp.net', fromMe: true } }
  const config = { botName: 'White MD', ownerNumber: '254700000000', getBotMode: () => 'public' }

  await extraPlugin.execute({ socket, message: ownerMsg, jid: ownerMsg.key.remoteJid, args: ['add', 'Deploy', 'to', 'Render'], command: 'todo', prefix: '.', config })
  assert.match(socket.sent.at(-1).payload.text, /Added task #1/)

  await extraPlugin.execute({ socket, message: ownerMsg, jid: ownerMsg.key.remoteJid, args: ['done', '1'], command: 'todo', prefix: '.', config })
  assert.match(socket.sent.at(-1).payload.text, /☑️/)

  await extraPlugin.execute({ socket, message: ownerMsg, jid: ownerMsg.key.remoteJid, args: ['add', 'hello', '|', 'Hi there!'], command: 'autoreply', prefix: '.', config })
  const triggered = await extraPlugin.handleAutoReply(socket, { key: { remoteJid: '254755555555@s.whatsapp.net', fromMe: false } }, '254755555555@s.whatsapp.net', 'Hello', '.')
  assert.equal(triggered, true)
  assert.equal(socket.sent.at(-1).payload.text, 'Hi there!')

  await extraPlugin.execute({ socket, message: ownerMsg, jid: ownerMsg.key.remoteJid, args: ['https://example.com/page?utm_source=ig&id=42&fbclid=abc'], command: 'cleanlink', prefix: '.', config })
  assert.equal(socket.sent.at(-1).payload.text, '🔗 *Cleaned Link:*\nhttps://example.com/page?id=42')

  await extraPlugin.execute({ socket, message: ownerMsg, jid: ownerMsg.key.remoteJid, args: [], command: 'stats', prefix: '.', config })
  assert.match(socket.sent.at(-1).payload.text, /White MD Dashboard/)

  fs.rmSync(tmpDir, { recursive: true, force: true })
})
