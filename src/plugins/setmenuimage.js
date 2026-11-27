module.exports = {
  command: 'setmenuimage',
  description: 'set or reset the menu image/video URL',

  async execute({ socket, message, jid, args, config, prefix }) {
    const sender = message.key.participant || jid
    const senderNumber = sender.split(':')[0].split('@')[0]
    const isOwner = message.key.fromMe || (config.ownerNumber && senderNumber === config.ownerNumber)
    if (!isOwner) {
      await socket.sendMessage(jid, { text: 'Only the bot owner can change the menu media.' })
      return
    }

    const action = (args[0] || '').toLowerCase()
    const isPoolAction = ['add', 'list', 'clear'].includes(action)
    const value = isPoolAction ? args[1] : args[0]
    if (action === 'list') {
      const images = config.getMenuImages()
      await socket.sendMessage(jid, {
        text: images.length ? `Menu rotation (${images.length}):\n${images.map((url, index) => `${index + 1}. ${url}`).join('\n')}` : 'No saved menu rotation. The URLs in MENU.js or the bot profile photo will be used.'
      })
      return
    }

    if (action === 'clear') {
      config.setMenuImage('')
      await socket.sendMessage(jid, { text: 'Menu rotation cleared. URLs in MENU.js or the bot profile photo will be used again.' })
      return
    }

    if (!value) {
      await socket.sendMessage(jid, {
        text: `Usage: ${prefix}setmenuimage <image-or-video-URL>\nAdd to the rotation: ${prefix}setmenuimage add <URL>\nShow rotation: ${prefix}setmenuimage list\nClear rotation: ${prefix}setmenuimage clear\nReset to the bot profile photo with: ${prefix}setmenuimage off`
      })
      return
    }

    if (value.toLowerCase() === 'off' || value.toLowerCase() === 'reset') {
      config.setMenuImage('')
      await socket.sendMessage(jid, { text: 'Menu media reset. The bot profile photo will be used again.' })
      return
    }

    let parsed
    try {
      parsed = new URL(value)
    } catch {
      await socket.sendMessage(jid, { text: `Send a valid image or video URL. Example: ${prefix}setmenuimage https://example.com/menu.jpg` })
      return
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      await socket.sendMessage(jid, { text: 'Only HTTP and HTTPS media URLs are supported.' })
      return
    }

    if (action === 'add') {
      const images = config.addMenuImage(value)
      await socket.sendMessage(jid, { text: `Menu media added to rotation (${images.length} URL${images.length === 1 ? '' : 's'}).` })
      return
    }

    config.setMenuImage(value)
    const isVideo = /\.(mp4|webm|mov|mkv)(?:[?#].*)?$/i.test(value)
    await socket.sendMessage(jid, {
      text: `Menu ${isVideo ? 'video' : 'image'} saved. Send ${prefix}menu to view it.`
    })
  }
}
