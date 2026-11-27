const echoPlugin = {
  command: 'echo',
  description: 'repeat text back to you',

  async execute({ socket, jid, args }) {
    const text = args.join(' ').trim()
    await socket.sendMessage(jid, {
      text: text ? text : 'Usage: .echo your text here'
    })
  }
}

module.exports = echoPlugin
