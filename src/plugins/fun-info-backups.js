const { request } = require('../lib/http')

function decode(value = '') {
  return String(value).replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

async function json(url, label) {
  const response = await request(url, {}, { retries: 1, label, resource: url })
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`)
  return response.json()
}

module.exports = {
  command: ['advice2', 'joke2', 'periodic', 'quote2', 'quote3', 'fact2', 'insult2', 'trivia2', 'define2', 'bible2'],
  description: 'fun, information, and trivia API backups',

  async execute({ socket, jid, args, command, logger }) {
    try {
      if (command === 'advice2') {
        const data = await json('https://api.adviceslip.com/advice', 'Advice Slip')
        await socket.sendMessage(jid, { text: `*Advice*\n\n${data?.slip?.advice || 'No advice returned.'}` })
        return
      }
      if (command === 'joke2') {
        const data = await json('https://api.popcat.xyz/joke', 'Popcat joke')
        await socket.sendMessage(jid, { text: `*Joke*\n\n${data?.joke || data?.result || data}`.replace('undefined', 'No joke returned.') })
        return
      }
      if (command === 'periodic') {
        const element = args.join(' ').trim()
        if (!element) { await socket.sendMessage(jid, { text: 'Usage: .periodic element' }); return }
        const data = await json(`https://api.popcat.xyz/periodic-table?element=${encodeURIComponent(element)}`, 'Popcat periodic table')
        await socket.sendMessage(jid, { text: `*Periodic Table*\n\n${JSON.stringify(data, null, 2).slice(0, 3500)}` })
        return
      }
      if (command === 'quote2' || command === 'quote3') {
        const data = command === 'quote2'
          ? await json('https://type.fit/api/quotes', 'Type.fit quotes')
          : await json('https://favqs.com/api/qotd', 'FavQs quote')
        const quote = command === 'quote2'
          ? data[Math.floor(Math.random() * data.length)]
          : data?.quote
        await socket.sendMessage(jid, { text: `*Quote*\n\n${quote?.text || quote?.body || 'No quote returned.'}\n\n— ${quote?.author || 'Unknown'}` })
        return
      }
      if (command === 'fact2') {
        const data = await json('https://nekos.life/api/v2/fact', 'Nekos fact')
        await socket.sendMessage(jid, { text: `*Random Fact*\n\n${data?.fact || data?.text || 'No fact returned.'}` })
        return
      }
      if (command === 'insult2') {
        const data = await json('https://evilinsult.com/generate_insult.php?lang=en&type=json', 'Evil Insult')
        await socket.sendMessage(jid, { text: `*Insult*\n\n${data?.insult || 'No insult returned.'}`.replace('undefined', 'No insult returned.') })
        return
      }
      if (command === 'trivia2' || command === 'quiz2') {
        const data = command === 'trivia2'
          ? await json('https://opentdb.com/api.php?amount=1&type=multiple', 'Open Trivia DB')
          : await json('https://quizzapi.jomoreschi.fr/api/v1/quiz?limit=1&difficulty=facile', 'Quizz API')
        const item = data?.results?.[0] || data?.quizzes?.[0] || data?.[0] || data
        await socket.sendMessage(jid, { text: `*Trivia*\n\n${decode(item?.question || item?.questionText || item?.text || 'No question returned.')}\n\nAnswer: ${decode(item?.correct_answer || item?.answer || item?.correct || 'Unavailable')}` })
        return
      }
      if (command === 'define2') {
        const word = args.join(' ').trim()
        if (!word) { await socket.sendMessage(jid, { text: 'Usage: .define2 word' }); return }
        const data = await json(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(word)}`, 'Urban Dictionary')
        const entry = data?.list?.[0]
        await socket.sendMessage(jid, { text: `*Urban Dictionary: ${word}*\n\n${entry?.definition || 'No definition found.'}`.slice(0, 4000) })
        return
      }
      if (command === 'bible2') {
        const ref = args.join(' ').trim() || 'John 3:16'
        const data = await json(`https://bible-api.com/${encodeURIComponent(ref)}`, 'Bible API')
        await socket.sendMessage(jid, { text: `*Bible — ${data?.reference || ref}*\n\n${data?.text || 'No verse returned.'}` })
        return
      }
      if (command === 'technews') {
        const data = await json('https://fantox001-scrappy-api.vercel.app/technews/random', 'Fantox tech news')
        await socket.sendMessage(jid, { text: `*Tech News*\n\n${JSON.stringify(data, null, 2).slice(0, 3500)}` })
      }
    } catch (error) {
      logger.error({ err: error, command }, 'Fun/info backup failed')
      await socket.sendMessage(jid, { text: `The ${command} service is unavailable right now. Try another backup later.` })
    }
  }
}
