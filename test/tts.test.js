'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const tts = require('../src/lib/tts')

test('role voices match the edge-tts example', () => {
  assert.equal(tts.ROLES.narrator.edge, 'en-US-GuyNeural')
  assert.equal(tts.ROLES.villain.edge, 'en-GB-RyanNeural')
  assert.equal(tts.ROLES.hero.edge, 'en-US-ChristopherNeural')
  assert.equal(tts.ROLES.kid.edge, 'en-US-AnaNeural')
  assert.equal(tts.ROLES.ai.edge, 'en-US-AriaNeural')
})

test('numbered shortcuts map tts1..tts4 to engines', () => {
  assert.deepEqual(tts.NUMBERED, { 1: 'edge', 2: 'google', 3: 'tiktok', 4: 'moonbase' })
})

test('voice names are recognised', () => {
  assert.equal(tts.isVoiceName('en-US-ChristopherNeural'), true)
  assert.equal(tts.isVoiceName('villain'), false)
})

test('long text is split into pieces within the limit', () => {
  const text = 'This is a sentence that goes on. '.repeat(30).trim()
  const parts = tts.chunk(text, 180)
  assert.ok(parts.length > 1)
  assert.ok(parts.every((p) => p.length <= 180))
})

test('plain tts falls back to the next engine when one fails', async () => {
  const original = tts.ENGINES.edge
  tts.ENGINES.edge = async () => { throw new Error('down') }
  const originalTiktok = tts.ENGINES.tiktok
  tts.ENGINES.tiktok = async () => ({ audio: Buffer.alloc(900), mime: 'audio/mpeg', voice: 'x' })
  try {
    const result = await tts.synthesize('hello there')
    assert.equal(result.engine, 'tiktok')
    assert.equal(result.failures.length, 1)
  } finally {
    tts.ENGINES.edge = original
    tts.ENGINES.tiktok = originalTiktok
  }
})
