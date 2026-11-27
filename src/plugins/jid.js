function chatType(jid = '') {
  if (jid.endsWith('@g.us')) return 'group'
  if (jid.endsWith('@newsletter')) return 'channel'
  if (jid === 'status@broadcast') return 'status'
  if (jid.endsWith('@s.whatsapp.net')) return 'user'
  return 'unknown'
}

module.exports = {
  command: ['jid', 'chatid', 'id', 'chid', 'checkidch'],
  description: 'show the current chat or channel ID',

  async execute({ socket, message, jid, command }) {
    const participant = message.key.participant || 'none'
    if (command === 'chid' || command === 'checkidch') {
      await socket.sendMessage(jid, {
        text: `*White MD Channel ID*\n${jid.endsWith('@newsletter') ? jid : `Current chat is not a channel.\nChat ID: ${jid}`}`
      })
      return
    }
    await socket.sendMessage(jid, {
      text: [
        '*White MD Chat Information*',
        `Type: ${chatType(jid)}`,
        `Chat JID: ${jid}`,
        `Participant JID: ${participant}`
      ].join('\n')
    })
  }
}
