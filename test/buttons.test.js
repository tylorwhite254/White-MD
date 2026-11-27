'use strict'

// Run with: npm test
const test = require('node:test')
const assert = require('node:assert/strict')
const { proto } = require('@whiskeysockets/baileys')
const { autoButtonsFor, extractButtonId, sendButtons, withAutoButtons } = require('../src/lib/buttons')

function fakeSocket({ failRelay = false } = {}) {
  const sent = []
  const relayed = []
  return {
    sent,
    relayed,
    user: { id: '254700000000:1@s.whatsapp.net' },
    async sendMessage(jid, content, options) {
      sent.push({ jid, content, options })
      return { key: { id: 'plain' } }
    },
    async relayMessage(jid, message, options) {
      if (failRelay) throw new Error('rejected')
      relayed.push({ jid, message, options })
    }
  }
}

function pressedIds(relay) {
  const interactive = relay.message.viewOnceMessage.message.interactiveMessage
  return interactive.nativeFlowMessage.buttons.flatMap((button) => {
    const params = JSON.parse(button.buttonParamsJson)
    return button.name === 'single_select' ? params.sections.flatMap((section) => section.rows.map((row) => row.id)) : [params.id]
  })
}

test('a pressed quick-reply button runs the command stored in it', () => {
  const message = { message: { interactiveResponseMessage: { nativeFlowResponseMessage: { name: 'quick_reply', paramsJson: '{"id":".joke"}' } } } }
  assert.equal(extractButtonId(message), '.joke')
})

test('a chosen list row and the older button formats are understood too', () => {
  assert.equal(extractButtonId({ message: { listResponseMessage: { singleSelectReply: { selectedRowId: '.category:fun' } } } }), '.category:fun')
  assert.equal(extractButtonId({ message: { buttonsResponseMessage: { selectedButtonId: '.ping' } } }), '.ping')
  assert.equal(extractButtonId({ message: { templateButtonReplyMessage: { selectedId: '.menu' } } }), '.menu')
  assert.equal(extractButtonId({ message: { ephemeralMessage: { message: { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{"id":".owner"}' } } } } } }), '.owner')
  assert.equal(extractButtonId({ message: { conversation: 'hello' } }), '')
})

test('sendButtons sends an interactive message WhatsApp can encode, with the button tags', async () => {
  const socket = fakeSocket()
  await sendButtons(socket, '254711111111@s.whatsapp.net', {
    text: 'Pick one',
    buttons: [{ id: '.ping', text: 'Ping' }, { id: '.owner', text: 'Owner' }],
    list: { title: 'Categories', rows: [{ id: '.category:fun', title: 'Fun', description: '3 commands' }] }
  })
  assert.equal(socket.sent.length, 0)
  assert.equal(socket.relayed.length, 1)
  const relay = socket.relayed[0]
  assert.deepEqual(pressedIds(relay), ['.category:fun', '.ping', '.owner'])
  assert.equal(relay.options.additionalNodes[0].tag, 'biz')
  const decoded = proto.Message.decode(proto.Message.encode(relay.message).finish())
  assert.equal(decoded.viewOnceMessage.message.interactiveMessage.body.text, 'Pick one')
})

test('more than three buttons become a pick-list', async () => {
  const socket = fakeSocket()
  await sendButtons(socket, '1203630000@g.us', { text: 'x', buttons: ['a', 'b', 'c', 'd'].map((o) => ({ id: `.mode ${o}`, text: o })) })
  const buttons = socket.relayed[0].message.viewOnceMessage.message.interactiveMessage.nativeFlowMessage.buttons
  assert.equal(buttons.length, 1)
  assert.equal(buttons[0].name, 'single_select')
  assert.equal(socket.relayed[0].options.additionalNodes.length, 1)
})

test('when WhatsApp rejects buttons the choices are sent as plain text', async () => {
  const socket = fakeSocket({ failRelay: true })
  await sendButtons(socket, 'a@s.whatsapp.net', { text: 'Pick one', buttons: [{ id: '.ping', text: 'Ping' }] })
  assert.equal(socket.sent.length, 1)
  assert.match(socket.sent[0].content.text, /Pick one[\s\S]*Ping → \.ping/)
})

test('BUTTONS=off sends plain text only', async () => {
  process.env.BUTTONS = 'off'
  try {
    const socket = fakeSocket()
    await sendButtons(socket, 'a@s.whatsapp.net', { text: 'Pick one', buttons: [{ id: '.ping', text: 'Ping' }] })
    assert.equal(socket.relayed.length, 0)
    assert.equal(socket.sent.length, 1)
  } finally {
    delete process.env.BUTTONS
  }
})

test('an on/off usage reply gets On and Off buttons', () => {
  const auto = autoButtonsFor({ command: 'autotype', args: [], prefix: '.', text: 'Usage: .autotype on or .autotype off' })
  assert.deepEqual(auto.buttons, [{ id: '.autotype on', text: 'On' }, { id: '.autotype off', text: 'Off' }])
})

test('piped options and usage hints become one button each', () => {
  const fromText = autoButtonsFor({ command: 'rps', args: [], prefix: '!', text: 'Play: !rps rock|paper|scissors' })
  assert.deepEqual(fromText.buttons.map((b) => b.id), ['!rps rock', '!rps paper', '!rps scissors'])
  const fromUsage = autoButtonsFor({ plugin: { usage: '.antilink <on|off|set>' }, command: 'antilink', args: [], prefix: '.', text: 'Antilink settings' })
  assert.deepEqual(fromUsage.buttons.map((b) => b.id), ['.antilink on', '.antilink off', '.antilink set'])
})

test('a reply that lists commands gets a pick-list of them', () => {
  const text = 'Games:\n.dino — quick dinosaur challenge\n.trivia — trivia question\n.rps rock|paper|scissors — rock paper scissors'
  const auto = autoButtonsFor({ command: 'games', args: [], prefix: '.', text })
  assert.deepEqual(auto.list.rows.map((row) => row.id), ['.dino', '.trivia', '.rps'])
  assert.equal(auto.list.rows[0].description, 'quick dinosaur challenge')
})

test('random-result commands get an Another button that repeats the same request', () => {
  assert.deepEqual(autoButtonsFor({ command: 'joke', args: [], prefix: '.', text: 'A joke' }).buttons, [{ id: '.joke', text: '🔁 Another' }])
  assert.equal(autoButtonsFor({ command: 'pies', args: ['japan'], prefix: '.', text: 'x' }).buttons[0].id, '.pies japan')
})

test('replies that offer no choice are left alone', () => {
  assert.equal(autoButtonsFor({ command: 'ping', args: [], prefix: '.', text: 'Pong.' }), null)
  assert.equal(autoButtonsFor({ command: 'wiki', args: ['x'], prefix: '.', text: 'See https://example.com on Monday or example.com off-site' }), null)
})

test('a command reply is sent once: with buttons, or unchanged if buttons fail', async () => {
  const ok = fakeSocket()
  await withAutoButtons(ok, { command: 'joke', args: [], prefix: '.' }).sendMessage('a@s.whatsapp.net', { text: 'A joke' })
  assert.equal(ok.relayed.length, 1)
  assert.equal(ok.sent.length, 0)

  const failing = fakeSocket({ failRelay: true })
  await withAutoButtons(failing, { command: 'joke', args: [], prefix: '.' }).sendMessage('a@s.whatsapp.net', { text: 'A joke' })
  assert.deepEqual(failing.sent.map((entry) => entry.content), [{ text: 'A joke' }])

  const plain = fakeSocket()
  const wrapped = withAutoButtons(plain, { command: 'ping', args: [], prefix: '.' })
  await wrapped.sendMessage('a@s.whatsapp.net', { text: 'Pong.' })
  await wrapped.sendMessage('a@s.whatsapp.net', { react: { text: '✅' } })
  assert.equal(plain.relayed.length, 0)
  assert.equal(plain.sent.length, 2)
})

test('a link button opens its address and does not count toward the three reply buttons', async () => {
  const socket = fakeSocket()
  await sendButtons(socket, 'x@s.whatsapp.net', {
    text: 'White MD',
    list: { title: 'Categories', rows: [{ id: '.category:fun', title: 'Fun' }] },
    buttons: [
      { url: 'https://whatsapp.com/channel/abc', text: 'Channel' },
      { id: '.owner', text: 'Owner' },
      { id: '.ping', text: 'Ping' }
    ]
  })
  const native = socket.relayed[0].message.viewOnceMessage.message.interactiveMessage.nativeFlowMessage.buttons
  assert.deepEqual(native.map((button) => button.name), ['single_select', 'quick_reply', 'quick_reply', 'cta_url'])
  assert.equal(JSON.parse(native[3].buttonParamsJson).url, 'https://whatsapp.com/channel/abc')
})

test('without buttons the channel link and categories are still in the text', async () => {
  const socket = fakeSocket({ failRelay: true })
  await sendButtons(socket, 'x@s.whatsapp.net', {
    text: 'White MD',
    list: { title: 'Categories', rows: [{ id: '.category:fun', title: 'Fun' }] },
    buttons: [{ url: 'https://whatsapp.com/channel/abc', text: 'Channel' }]
  })
  const body = socket.sent[0].content.text
  assert.match(body, /Fun → \.category:fun/)
  assert.match(body, /Channel → https:\/\/whatsapp\.com\/channel\/abc/)
})

test('taps wrapped by newer WhatsApp versions still run the command', () => {
  const tap = { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{"id":".menu"}' } } }
  assert.equal(extractButtonId({ message: { deviceSentMessage: { message: tap } } }), '.menu')
  assert.equal(extractButtonId({ message: { viewOnceMessageV2Extension: { message: tap } } }), '.menu')
  assert.equal(extractButtonId({ message: { interactiveResponseMessage: { body: { text: '.ping' }, nativeFlowResponseMessage: { paramsJson: '{}' } } } }), '.ping')
})
