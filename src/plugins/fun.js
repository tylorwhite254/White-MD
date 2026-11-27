const COMMANDS = [
  'compliment', 'dare', 'flirt', 'character', 'insult', 'gn', 'goodnight',
  'roseday', 'rose', 'meme', 'shayari', 'advice', 'pickup', 'pickupline',
  'pokemon', 'reverse', 'readmore', 'hide', 'fancy', 'style', 'emojimix', 'say', 'husbu', 'simage'
]

const responses = {
  compliment: ['You make ordinary moments feel special.', 'Your energy is genuinely uplifting.', 'You have a talent for making people smile.'],
  dare: ['Send the last sticker you saved.', 'Reply with your funniest autocorrect mistake.', 'Change your status to a random harmless fact for ten minutes.'],
  flirt: ['If good conversation were a superpower, you would be unstoppable.', 'You just made this chat a little more interesting.', 'Are you a notification? Because I was hoping to hear from you.'],
  character: ['Today you are the calm strategist of the group.', 'Your character class is: legendary problem solver.', 'You are the unexpected plot twist everyone needed.'],
  insult: ['You are proof that even Wi-Fi can have a weak connection.', 'Your jokes need a software update.', 'You bring loading-screen energy to every conversation.'],
  meme: ['Me: I will sleep early tonight. Also me at 3 AM: one more video.', 'When the bot finally replies: task completed, confidence restored.', 'Group chat plans: 1% planning, 99% changing the plan.'],
  shayari: ['Some journeys are quiet, yet they still lead us somewhere beautiful.', 'A little hope can brighten even the longest night.', 'The best memories often begin with an ordinary hello.'],
  advice: ['Protect your peace, keep learning, and do not rush what needs time.', 'Be consistent before trying to be perfect.', 'If it costs your peace every time, it is probably too expensive.'],
  pickup: ['Are you a search result? Because you are exactly what I was looking for.', 'Do you have a map? I keep getting lost in this conversation.', 'If smiles were messages, you would have filled my inbox.']
}

function random(items) {
  return items[Math.floor(Math.random() * items.length)]
}

module.exports = {
  command: COMMANDS,
  description: 'fun and social responses',

  async execute({ socket, jid, command, args }) {
    const input = args.join(' ').trim()
    if (command === 'say') {
      await socket.sendMessage(jid, { text: input || 'Usage: .say text' })
      return
    }
    if (command === 'reverse') {
      await socket.sendMessage(jid, { text: input ? input.split('').reverse().join('') : 'Usage: .reverse text' })
      return
    }
    if (command === 'fancy') {
      await socket.sendMessage(jid, { text: input ? `『 ${input.toUpperCase()} 』` : 'Usage: .fancy text' })
      return
    }
    if (command === 'readmore' || command === 'hide') {
      await socket.sendMessage(jid, { text: input ? `\u200e${'\u200e'.repeat(4001)}${input}` : `Usage: .${command} text` })
      return
    }
    if (command === 'style') {
      await socket.sendMessage(jid, { text: input ? `『 ${input.toUpperCase()} 』` : 'Usage: .style text' })
      return
    }
    if (command === 'emojimix') {
      await socket.sendMessage(jid, { text: input ? `Emoji mix requested: ${input}\nUse two emojis, for example: .emojimix 😎 🔥` : 'Usage: .emojimix emoji1 emoji2' })
      return
    }
    if (command === 'pokemon') {
      await socket.sendMessage(jid, { text: `Your Pokémon today is ${random(['Pikachu', 'Eevee', 'Charizard', 'Lucario', 'Gengar', 'Greninja'])}.` })
      return
    }
    if (command === 'husbu') {
      await socket.sendMessage(jid, { text: `Your husbu pick is ${random(['Levi', 'Gojo', 'Loid', 'Kakashi', 'Zoro', 'Tanjiro'])}.` })
      return
    }
    if (command === 'simage') {
      await socket.sendMessage(jid, { text: 'Usage: .simage <image URL>\nFor direct image sending, use an approved HTTPS image URL.' })
      return
    }
    if (command === 'gn' || command === 'goodnight') {
      await socket.sendMessage(jid, { text: 'Goodnight. Rest well and have a peaceful night.' })
      return
    }
    if (command === 'roseday' || command === 'rose') {
      await socket.sendMessage(jid, { text: '🌹 A rose for you. Keep shining.' })
      return
    }

    const target = input
    const responseCommand = command === 'pickupline' ? 'pickup' : command
    const text = random(responses[responseCommand] || responses.compliment)
    await socket.sendMessage(jid, { text: target ? `${text}\n\nFor: ${target}` : text })
  }
}
