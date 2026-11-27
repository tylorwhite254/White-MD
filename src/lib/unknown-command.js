'use strict'

async function sendUnknownCommand({ socket, jid, message, prefix, gifUrl, logger }) {
  const caption = `Type ${prefix}menu to see commands available on White MD.`
  try {
    await socket.sendMessage(jid, {
      video: { url: gifUrl },
      gifPlayback: true,
      caption
    }, { quoted: message })
    return { media: true, caption }
  } catch (error) {
    logger?.warn?.({ err: error }, 'Unknown-command GIF failed; sending text fallback')
    await socket.sendMessage(jid, { text: caption }, { quoted: message })
    return { media: false, caption }
  }
}

module.exports = { sendUnknownCommand }
