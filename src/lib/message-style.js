'use strict'

/**
 * Extra looks for bot replies:
 *  - "verifiedQuote": replies appear as a reply to a verified "WhatsApp Business" status.
 *  - "channelContext": replies show "Forwarded many times" and, when the channel id is set, the channel name.
 * Turn them off with FANCY_REPLIES=off.
 */
function fancyEnabled() {
  return String(process.env.FANCY_REPLIES || 'on').toLowerCase() !== 'off'
}

function verifiedQuote(title = 'WhatsApp Business') {
  if (!fancyEnabled()) return undefined
  return {
    key: { remoteJid: 'status@broadcast', participant: '0@s.whatsapp.net', fromMe: false, id: 'WHITEMDVERIFIED' },
    message: {
      contactMessage: {
        displayName: title,
        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;${title};;;\nFN:${title}\nORG:${title}\nTEL;type=CELL;type=VOICE;waid=0:+0\nEND:VCARD`
      }
    }
  }
}

function channelContext({ channelJid, channelName } = {}) {
  if (!fancyEnabled()) return {}
  const context = { isForwarded: true, forwardingScore: 999 }
  if (channelJid && /@newsletter$/.test(channelJid)) {
    context.forwardedNewsletterMessageInfo = { newsletterJid: channelJid, newsletterName: channelName || 'Channel', serverMessageId: -1 }
  }
  return context
}

module.exports = { verifiedQuote, channelContext, fancyEnabled }
