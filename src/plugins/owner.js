module.exports = {
  command: 'owner',
  description: 'show the bot owner',

  async execute({ socket, jid, config, message }) {
    const number = config.ownerNumber
    await socket.sendMessage(jid, {
      text: number
        ? `White MD owner: +${number}`
        : 'White MD owner contacts:'
    }, { quoted: message })

    const configuredContacts = process.env.OWNER_CONTACT_NUMBERS || '+93768814785,+254748840328'
    const contacts = configuredContacts
      .split(',')
      .map((value) => value.replace(/[^0-9]/g, ''))
      .filter((value, index, values) => value.length >= 7 && value.length <= 15 && values.indexOf(value) === index)

    for (const [index, contactNumber] of contacts.entries()) {
      const displayName = contacts.length === 1 ? 'Tylor White' : `Tylor White ${index + 1}`
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${displayName}`,
        `TEL;type=CELL;type=VOICE;waid=${contactNumber}:+${contactNumber}`,
        'END:VCARD'
      ].join('\n')
      await socket.sendMessage(jid, {
        contacts: {
          displayName,
          contacts: [{ vcard }]
        }
      }, { quoted: message })
    }
  }
}
