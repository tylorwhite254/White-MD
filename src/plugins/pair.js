'use strict'

module.exports = {
  command: 'pair',
  description: 'request a WhatsApp pairing code',

  async execute({ socket, message, jid, args, config, prefix }) {
    const sender = message?.key?.participant || jid
    const senderNumber = String(sender).split(':')[0].split('@')[0]
    const ownerNumber = String(config?.ownerNumber || '').replace(/[^0-9]/g, '')
    const isOwner = Boolean(message?.key?.fromMe || (ownerNumber && senderNumber === ownerNumber))

    if (!isOwner) {
      await socket.sendMessage(jid, { text: 'Only the White MD owner can request a pairing code.' }, { quoted: message })
      return
    }

    const number = String(args?.[0] || '').replace(/[^0-9]/g, '')
    if (number.length < 7 || number.length > 15) {
      await socket.sendMessage(jid, {
        text: `Usage: ${prefix}pair 254700000000\nUse the full international number without +, spaces, or dashes.`
      }, { quoted: message })
      return
    }

    if (typeof config?.requestPairingCode !== 'function') {
      await socket.sendMessage(jid, {
        text: 'Pairing is not ready yet. Try again in a few seconds while White MD reconnects.'
      }, { quoted: message })
      return
    }

    const result = await config.requestPairingCode(number)
    if (result?.ok && result.code) {
      await socket.sendMessage(jid, {
        text: `White MD pairing code for +${result.number}: ${result.code}\n\nOn the phone, open WhatsApp > Linked devices > Link a device > Link with phone number and enter this code. White MD will come online automatically after the phone accepts it.`
      }, { quoted: message })
      return
    }

    const text = result?.reason === 'already-registered'
      ? 'This White MD session is already registered. A new pairing code can only be requested after the current auth_info session is cleared and White MD is started in pairing mode.'
      : result?.reason === 'busy'
        ? 'A pairing-code request is already in progress. Wait for that code before trying again.'
        : result?.reason === 'request-failed'
          ? 'WhatsApp could not create a pairing code right now. Try again in a few seconds.'
          : 'The pairing number is invalid. Use the full international number without +, spaces, or dashes.'
    await socket.sendMessage(jid, { text }, { quoted: message })
  }
}
