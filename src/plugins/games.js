const COMMANDS = [
  'games', 'game', 'dino', 'wyr', 'rps', 'math', 'snake', 'hangman',
  '2048', 'puzzle', 'breakout', 'car', 'racer', 'casino', 'connect4', 'c4',
  'doom', 'flappy', 'frogger', 'galaxy', 'knifehit', 'knife', 'maze',
  'memory', 'mines', 'minesweeper', 'pong', 'solars', 'solar', 'stack',
  'tetris', 'tictactoe', 'ttt', 'whack', 'whackamole', 'wouldyourather',
  'nhie', 'neverhaveiever'
]

const GAME_LIST = [
  '.dino — quick dinosaur challenge',
  '.trivia — trivia question',
  '.wyr — would you rather',
  '.rps rock|paper|scissors — rock paper scissors',
  '.math — arithmetic challenge',
  '.snake — snake game instructions',
  '.hangman — word puzzle',
  '.2048 — 2048 game instructions',
  '.puzzle — random puzzle',
  '.breakout — breakout game instructions',
  '.car — car game instructions',
  '.racer — racing game instructions',
  '.casino — casino challenge',
  '.connect4 / .c4 — Connect Four instructions',
  '.doom, .flappy, .frogger, .galaxy — arcade game instructions',
  '.knifehit / .knife — Knife Hit instructions',
  '.maze, .memory, .mines / .minesweeper, .pong — game instructions',
  '.solar / .solars, .stack, .tetris — arcade game instructions',
  '.tictactoe / .ttt — Tic-Tac-Toe instructions',
  '.whack / .whackamole — Whack-a-Mole instructions',
  '.wouldyourather, .nhie / .neverhaveiever — party games'
]

const WOULD_YOU_RATHER = [
  'Would you rather always be 10 minutes late or always be 20 minutes early?',
  'Would you rather explore space or the deepest ocean?',
  'Would you rather have unlimited money or unlimited free time?',
  'Would you rather speak every language or play every instrument?'
]

const PUZZLES = [
  'I have keys but no locks, space but no room. What am I? Answer: a keyboard.',
  'What has a face and two hands but no arms or legs? Answer: a clock.',
  'What gets wetter the more it dries? Answer: a towel.',
  'What has many teeth but cannot bite? Answer: a comb.'
]

function random(items) {
  return items[Math.floor(Math.random() * items.length)]
}

module.exports = {
  command: COMMANDS,
  description: 'games and game catalog',

  async execute({ socket, jid, args, command }) {
    if (command === 'games' || command === 'game') {
      await socket.sendMessage(jid, { text: `*White MD Games*\n\n${GAME_LIST.join('\n')}` })
      return
    }

    if (command === 'rps') {
      const choices = ['rock', 'paper', 'scissors']
      const player = (args[0] || '').toLowerCase()
      if (!choices.includes(player)) {
        await socket.sendMessage(jid, { text: 'Usage: .rps rock, .rps paper, or .rps scissors' })
        return
      }
      const bot = random(choices)
      const win = (player === 'rock' && bot === 'scissors') || (player === 'paper' && bot === 'rock') || (player === 'scissors' && bot === 'paper')
      const result = player === bot ? 'Draw.' : win ? 'You win.' : 'White MD wins.'
      await socket.sendMessage(jid, { text: `You: ${player}\nWhite MD: ${bot}\n${result}` })
      return
    }

    if (command === 'math') {
      const a = Math.floor(Math.random() * 20) + 1
      const b = Math.floor(Math.random() * 20) + 1
      const operations = [
        [`${a} + ${b}`, a + b],
        [`${a} - ${b}`, a - b],
        [`${a} × ${b}`, a * b]
      ]
      const [question, answer] = random(operations)
      await socket.sendMessage(jid, { text: `*Math challenge*\n\nSolve: ${question}\nAnswer: ${answer}` })
      return
    }

    if (command === 'wyr' || command === 'wouldyourather') {
      await socket.sendMessage(jid, { text: `*Would you rather?*\n\n${random( WOULD_YOU_RATHER)}` })
      return
    }

    if (command === 'nhie' || command === 'neverhaveiever') {
      const prompts = [
        'Never have I ever stayed awake all night.',
        'Never have I ever sent a message to the wrong person.',
        'Never have I ever laughed at the worst possible time.',
        'Never have I ever forgotten someone’s birthday.'
      ]
      await socket.sendMessage(jid, { text: `*Never Have I Ever*\n\n${random(prompts)}` })
      return
    }

    if (command === 'puzzle' || command === 'hangman') {
      await socket.sendMessage(jid, { text: `*${command === 'hangman' ? 'Hangman' : 'Puzzle'}*\n\n${random(PUZZLES)}` })
      return
    }

    const instructions = {
      dino: 'Dino challenge started. Reply with RUN, JUMP, or DUCK.',
      snake: 'Snake game: use .snake up, .snake down, .snake left, or .snake right.',
      '2048': '2048 game started. Use .2048 up, .2048 down, .2048 left, or .2048 right.',
      breakout: 'Breakout game started. Reply with LEFT, STAY, or RIGHT.',
      car: 'Car game started. Reply with LEFT, BRAKE, or RIGHT.',
      racer: 'Racer game started. Reply with LEFT, BOOST, or RIGHT.',
      casino: 'Casino challenge started. Choose .casino slots, .casino dice, or .casino coin.',
      connect4: 'Connect Four started. Use .connect4 column-number.',
      c4: 'Connect Four started. Use .c4 column-number.',
      doom: 'Doom challenge started. Reply with SHOOT, MOVE, or HIDE.',
      flappy: 'Flappy challenge started. Reply with FLAP or WAIT.',
      frogger: 'Frogger challenge started. Reply with UP, LEFT, RIGHT, or WAIT.',
      galaxy: 'Galaxy challenge started. Reply with FIRE, SHIELD, or BOOST.',
      knifehit: 'Knife Hit started. Reply with THROW or WAIT.',
      knife: 'Knife Hit started. Reply with THROW or WAIT.',
      maze: 'Maze challenge started. Reply with UP, DOWN, LEFT, or RIGHT.',
      memory: 'Memory game started. Reply with a pair such as A1.',
      mines: 'Mines challenge started. Use .mines 1-9 to choose a tile.',
      minesweeper: 'Minesweeper started. Use .minesweeper 1-9 to choose a tile.',
      pong: 'Pong started. Reply with LEFT, STAY, or RIGHT.'
      ,solar: 'Solar challenge started. Reply with FIRE, SHIELD, or BOOST.',
      solars: 'Solar challenge started. Reply with FIRE, SHIELD, or BOOST.',
      stack: 'Stack challenge started. Reply with LEFT, STAY, or RIGHT.',
      tetris: 'Tetris started. Reply with LEFT, ROTATE, or DROP.',
      tictactoe: 'Tic-Tac-Toe started. Use .tictactoe 1-9 to choose a square.',
      ttt: 'Tic-Tac-Toe started. Use .ttt 1-9 to choose a square.',
      whack: 'Whack-a-Mole started. Reply with HIT or WAIT.',
      whackamole: 'Whack-a-Mole started. Reply with HIT or WAIT.'
    }
    await socket.sendMessage(jid, { text: instructions[command] || 'Game command ready.' })
  }
}
