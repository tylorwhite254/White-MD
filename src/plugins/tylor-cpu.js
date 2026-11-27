'use strict'

const os = require('node:os')

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 1024) return `${Math.max(0, Math.round(value || 0))} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let amount = value
  let unit = -1
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit++
  }
  return `${amount.toFixed(2)} ${units[unit]}`
}

module.exports = {
  command: 'cpu',
  description: 'show server CPU and memory information',

  async execute({ socket, jid, message }) {
    const cpus = os.cpus()
    const memory = process.memoryUsage()
    const load = os.loadavg?.() || []
    const text = [
      '*White MD server information*',
      '',
      `Uptime: ${Math.floor(process.uptime())} seconds`,
      `Platform: ${process.platform} ${process.arch}`,
      `CPU: ${cpus[0]?.model?.trim() || 'Unknown'}`,
      `CPU cores: ${cpus.length}`,
      `Load average: ${load.map(value => value.toFixed(2)).join(' / ') || 'Unavailable'}`,
      `System memory: ${formatBytes(os.totalmem() - os.freemem())} / ${formatBytes(os.totalmem())}`,
      `Process RSS: ${formatBytes(memory.rss)}`,
      `Heap used: ${formatBytes(memory.heapUsed)} / ${formatBytes(memory.heapTotal)}`,
      '',
      'Tylor White'
    ].join('\n')
    await socket.sendMessage(jid, { text }, { quoted: message })
  }
}
