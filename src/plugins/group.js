const groupCommands = [
  'tagall',
  'kick',
  'add',
  'promote',
  'demote',
  'group',
  'grouplink',
  'linkgc',
  'clear',
  'delete',
  'del',
  'setgname',
  'setnamegc',
  'setgdesc',
  'setdesc'
]

function senderJid(message) {
  return message.key.participant || message.key.remoteJid
}

function numberToJid(value = '') {
  const number = value.replace(/[^0-9]/g, '')
  return number ? `${number}@s.whatsapp.net` : null
}

function mentionedJids(message) {
  return message.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
}

function unique(items) {
  return [...new Set(items.filter(Boolean))]
}

async function getGroupContext({ socket, message, jid, config }) {
  if (!jid.endsWith('@g.us')) {
    await socket.sendMessage(jid, { text: 'This command can only be used in a group.' })
    return null
  }

  const metadata = await socket.groupMetadata(jid)
  const sender = senderJid(message)
  const bot = socket.user?.id?.split(':')[0] + '@s.whatsapp.net'
  const ownerNumber = config.ownerNumber
  const senderNumber = sender.split('@')[0].split(':')[0]
  const senderIsOwner = Boolean(ownerNumber && senderNumber === ownerNumber)
  const senderIsAdmin = metadata.participants.some(
    (participant) => participant.id === sender && Boolean(participant.admin)
  )
  const botIsAdmin = metadata.participants.some(
    (participant) => participant.id === bot && Boolean(participant.admin)
  )

  if (!senderIsOwner && !senderIsAdmin) {
    await socket.sendMessage(jid, { text: 'Only group admins or the bot owner can use this command.' })
    return null
  }
  if (!botIsAdmin) {
    await socket.sendMessage(jid, { text: 'Please make White MD a group administrator first.' })
    return null
  }

  return { metadata, sender, senderIsOwner }
}

async function changeParticipants({ socket, jid, args, message, action }) {
  const targets = unique([
    ...mentionedJids(message),
    ...args.map(numberToJid)
  ])
  if (!targets.length) {
    await socket.sendMessage(jid, { text: `Usage: .${action} @user` })
    return
  }
  await socket.groupParticipantsUpdate(jid, targets, action)
  await socket.sendMessage(jid, { text: `${action} command completed.` })
}

function quotedContext(message) {
  return message.message?.extendedTextMessage?.contextInfo ||
    message.message?.imageMessage?.contextInfo ||
    message.message?.videoMessage?.contextInfo ||
    message.message?.documentMessage?.contextInfo ||
    null
}

function messageToDelete({ socket, jid, message }) {
  const context = quotedContext(message)
  if (!context?.stanzaId) return message.key

  const participant = context.participant
  const botJid = socket.user?.id || ''
  const fromMe = Boolean(participant && botJid && participant.split(':')[0] === botJid.split(':')[0])
  return {
    remoteJid: jid,
    fromMe,
    id: context.stanzaId,
    participant
  }
}

module.exports = {
  command: groupCommands,
  description: 'group moderation and management',

  async execute(context) {
    const { socket, jid, args, command, message } = context
    const group = await getGroupContext(context)
    if (!group) return

    if (command === 'tagall') {
      const mentions = group.metadata.participants.map((participant) => participant.id)
      const text = mentions.map((participant) => `@${participant.split('@')[0]}`).join(' ')
      await socket.sendMessage(jid, { text: `*White MD tagall*\n${text}`, mentions })
      return
    }

    if (['kick', 'add', 'promote', 'demote'].includes(command)) {
      await changeParticipants({ socket, jid, args, message, action: command })
      return
    }

    if (['clear', 'delete', 'del'].includes(command)) {
      await socket.sendMessage(jid, { delete: messageToDelete({ socket, jid, message }) })
      return
    }

    if (['setgname', 'setnamegc'].includes(command)) {
      const subject = args.join(' ').trim()
      if (!subject) {
        await socket.sendMessage(jid, { text: `Usage: .${command} New group name` })
        return
      }
      await socket.groupUpdateSubject(jid, subject)
      await socket.sendMessage(jid, { text: 'Group name updated.' })
      return
    }

    if (['setgdesc', 'setdesc'].includes(command)) {
      const description = args.join(' ').trim()
      if (!description) {
        await socket.sendMessage(jid, { text: `Usage: .${command} New group description` })
        return
      }
      await socket.groupUpdateDescription(jid, description)
      await socket.sendMessage(jid, { text: 'Group description updated.' })
      return
    }

    const action = ['grouplink', 'linkgc'].includes(command) ? 'link' : (args[0] || '').toLowerCase()
    if (action === 'open' || action === 'unmute') {
      await socket.groupSettingUpdate(jid, 'not_announcement')
      await socket.sendMessage(jid, { text: 'Group opened. All participants can send messages.' })
    } else if (action === 'close' || action === 'mute') {
      await socket.groupSettingUpdate(jid, 'announcement')
      await socket.sendMessage(jid, { text: 'Group closed. Only admins can send messages.' })
    } else if (action === 'link') {
      const code = await socket.groupInviteCode(jid)
      await socket.sendMessage(jid, { text: `Group invite link: https://chat.whatsapp.com/${code}` })
    } else {
      await socket.sendMessage(jid, {
        text: 'Usage: .group open | .group close | .group link\nAliases: .grouplink | .linkgc'
      })
    }
  }
}
