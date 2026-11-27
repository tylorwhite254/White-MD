// White MD menu customization file.
// Edit this file to change the menu heading, intro text, categories, or listed commands.
// Commands are displayed with the current prefix automatically.
// Restarting the bot is not required; the file is reloaded when .menu is used.

module.exports = {
  heading: 'White MD',
  intro: '',
  menuMedia: [
    'https://files.catbox.moe/d9u6ul.mp4',
    'https://files.catbox.moe/gos8df.mp4',
    'https://files.catbox.moe/gtb785.mp4',
    'https://files.catbox.moe/ep9vkw.jpeg',
    'https://files.catbox.moe/97vc9w.mp4'
  ],
  // Link opened by the Channel button on the menu.
  channelUrl: 'https://whatsapp.com/channel/0029VbAvp6OCXC3LkXKNmM3X',
  ownerName: 'Tylor White',
  library: '@whiskeysockets/baileys',
  metadataLabels: {
    uptime: 'Uptime',
    owner: 'Owner',
    library: 'Library',
    user: 'User',
    plugins: 'Plugins'
  },
  categories: {
    downloads: ['url', 'apk', 'moviedl', 'archive', 'play', 'ytmp4', 'ytmp3', 'ytaudio', 'spotify', 'tiktok', 'tt', 'instagram', 'ig', 'facebook', 'fb', 'twitter', 'x', 'pinterest', 'pin'],
    tts: ['tts', 'tts1', 'tts2', 'tts3', 'tts4', 'narrator', 'villain', 'hero', 'kid', 'airole', 'voices', 'ttsvoice'],
    media: ['ai', 'chatgpt', 'chatbot', 'davidgpt4o', 'davidgemini3pro', 'openrouter', 'grok', 'flux', 'ai-search', 'ais', 'aiv', 'aiimage', 'lyrics', 'ssweb', 'qr', 'upload', 'upload2', 'catbox', 'memegen', 'sticker', 's', 'blur', 'gif', 'ytcomment', 'tylorytcomment', 'tylornsfw', 'coffe', 'coffee', 'tea', 'kofi', 'couplepp'],
    aiModels: ['davidgpt4o', 'davidgemini3pro', 'openrouter', 'grok'],
    tylorWhite: ['llama', 'mistral', 'alamy', 'animes', 'base64', 'bfdecode', 'brainfuck', 'coding', 'cyberimg', 'dado', '8ball', 'element', 'excard', 'fact', 'flip', 'genshin', 'getty', 'gimage', 'hack', 'diffusion', 'imdb', 'whoisip', 'islamic', 'istock', 'itunes', 'joke', 'medicine', 'mountain', 'movie', 'news', 'pies', 'ping', 'pingweb', 'pokedex', 'pinstalk', 'quote', 'qmaker', 'images', 'sharechat', 'ship', 'simp', 'snack', 'snapchat', 'song', 'star', 'stickers', 'string', 'stupid', 'tech', 'tgstalk', 'tinyurl', 'smallcaps', 'thrstalk', 'ttstalk', 'video', 'vidsplay', 'why', 'ytsearch'],
    cards: ['welcome', 'goodbye', 'rankcard', 'quotecard', 'wanted', 'jail', 'ytcard', 'faketweet'],
    ephoto: ['mascot', 'foggy', 'galaxy', 'neon', 'golden', 'metalic', 'blackpink', 'sand', 'gaming', 'matrix', 'hacker', 'typography', 'minion', 'redwing', 'halloween', 'thunder', 'rain', 'water', 'dance', 'filament', 'lava', '2neon', 'bigmetal', '3neon', 'christmas'],
    tools: ['note', 'notes', 'delnote', 'afk', 'remind', 'reminders', 'delremind', 'todo', 'timer', 'password', 'genpass', 'choose', 'coin', 'cleanlink', 'nameinfo', 'guessage', 'nationality', 'zip', 'spacenews', 'readqr', 'translate2', 'tourl', 'tmpfiles', 'uguu', 'x0', 'quax', 'pomf', 'guide', 'usagetip', 'poll', 'agecalculator', 'guessgender', 'ginfo', 'groupinfo', 'vv', 'url', 'geturl', 'mediaurl', 'translate', 'tr', 'wikipedia', 'weather', 'define', 'wiki', 'currency', 'shorturl', 'urlshortener', 'npm', 'country', 'time', 'calc', 'calculator', 'davidcalc', 'aidetect', 'github', 'github2', 'gh', 'tylorgithub', 'tylortiktok', 'tyloranime', 'igstalk', 'instastalk', 'wa', 'cpu', 'revt', 'reversetext', 'wordcount', 'wordfreq', 'topwords', 'textstats', 'analyze', 'textanalyze', 'textanalyser', 'analyse', 'readability', 'rle', 'compress', 'decompress', 'rlecompress', 'cipher', 'encrypt', 'decrypt', 'crypt', 'units', 'unit', 'convert', 'conv'],
    games: ['games', 'game', 'dino', 'trivia', 'wyr', 'wouldyourather', 'nhie', 'neverhaveiever', 'rps', 'math', 'snake', 'hangman', '2048', 'puzzle', 'breakout', 'car', 'racer', 'casino', 'connect4', 'c4', 'doom', 'flappy', 'frogger', 'galaxy', 'knifehit', 'knife', 'maze', 'memory', 'mines', 'minesweeper', 'pong', 'solars', 'solar', 'stack', 'tetris', 'tictactoe', 'ttt', 'whack', 'whackamole', 'quiz', 'truth', 'riddle', 'neko', 'anime', 'animequote'],
    anime: ['waifu', 'neko', 'kitsune', 'husbando', 'shinobu', 'megumin', 'bully', 'cuddle', 'cry', 'hug', 'awoo', 'kiss', 'lick', 'pat', 'smug', 'bonk'],
    fun: ['compliment', 'truth', 'dare', 'flirt', 'character', 'insult', 'insult2', 'gn', 'goodnight', 'roseday', 'rose', 'meme', 'shayari', 'advice', 'advice2', 'joke2', 'quote2', 'quote3', 'fact2', 'davidfact', 'davidtruth', 'periodic', 'pickup', 'pickupline', 'pokemon', 'reverse', 'readmore', 'hide', 'fancy', 'style', 'emojimix', 'say', 'echo', 'husbu', 'simage', 'trivia2', 'define2', 'bible2'],
    religion: ['quran', 'bible'],
    group: ['tagall', 'kick', 'add', 'promote', 'demote', 'group', 'grouplink', 'autowelcome', 'autogoodbye', 'antilink', 'antiinstagram', 'antifacebook', 'clear', 'delete', 'del', 'setgname', 'setnamegc', 'setgdesc', 'setdesc', 'hidetag', 'tagadmins', 'admins', 'revoke', 'mute', 'unmute', 'approve', 'reject', 'warn', 'warnings', 'resetwarn', 'leave'],
    owner: ['ban', 'unban', 'banlist', 'clearbans', 'bangroup', 'unbangroup', 'bannedgroups', 'addsudo', 'delsudo', 'sudolist', 'antidm', 'anticall', 'cooldown', 'maintenance', 'stats', 'saydm', 'bcdm', 'autoreply', 'owner', 'ownerchannel', 'channel', 'botabout', 'botinfo', 'info', 'settings', 'setbotname', 'profilename', 'setbotabout', 'setbotbio', 'setbotprofile', 'setbotpp', 'setbotpic', 'delbotprofile', 'delbotpp', 'removephoto', 'setprefix', 'delprefix', 'setmenuimage', 'deletefunct', 'restorefunct', 'pair', 'backup', 'sessionid', 'mode', 'update', 'restart', 'shareAPI', 'plugin', 'autorecord', 'autorecording', 'autotype', 'autotyping', 'autoviewstatus', 'autostatus', 'autolikestatus', 'autoreact', 'jid', 'chatid', 'id', 'chid', 'checkidch', 'runtime', 'uptime', 'broadcast', 'bc', 'block', 'unblock', 'getpp', 'join']
  }
}
