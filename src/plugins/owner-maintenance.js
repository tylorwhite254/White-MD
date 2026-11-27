'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')

function ownerAllowed(message, jid, ownerNumber) {
  if (message?.key?.fromMe) return true
  const sender = String(message?.key?.participant || message?.key?.remoteJid || jid)
  const senderNumber = sender.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
  const configuredOwner = String(ownerNumber || '').replace(/[^0-9]/g, '')
  return Boolean(configuredOwner && senderNumber === configuredOwner)
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: process.cwd(),
      timeout: Number(options.timeout || 120000),
      maxBuffer: 1024 * 1024,
      env: process.env
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() })
    })
  })
}

function scheduleExit(delay = 1200) {
  setTimeout(() => process.exit(0), delay).unref?.()
}

async function update({ socket, jid, message, config }) {
  const projectDir = process.cwd()
  if (!fs.existsSync(path.join(projectDir, '.git'))) {
    await socket.sendMessage(jid, {
      text: 'Automatic update is unavailable in this deployment because it was started from a ZIP instead of a Git checkout. Install White MD from the GitHub repository to enable .update.'
    }, { quoted: message })
    return
  }

  const expectedRemote = String(process.env.UPDATE_REPO_URL || '').trim()
  const branch = String(process.env.UPDATE_BRANCH || 'main').trim() || 'main'
  try {
    const remote = (await run('git', ['remote', 'get-url', 'origin'], { timeout: 15000 })).stdout
    if (expectedRemote && remote.replace(/\.git$/, '') !== expectedRemote.replace(/\.git$/, '')) {
      throw new Error('origin does not match UPDATE_REPO_URL')
    }
    const dirty = (await run('git', ['status', '--porcelain', '--untracked-files=no'], { timeout: 15000 })).stdout
    if (dirty) throw new Error('local tracked changes detected; update stopped to protect local edits')

    await socket.sendMessage(jid, { text: `White MD update started from origin/${branch}.` }, { quoted: message })
    await run('git', ['fetch', '--prune', 'origin', branch])
    const result = await run('git', ['merge', '--ff-only', `origin/${branch}`])
    if (process.env.UPDATE_INSTALL_DEPS !== 'false') {
      await run('npm', ['install', '--omit=dev'], { timeout: 180000 })
    }
    await socket.sendMessage(jid, {
      text: `White MD updated successfully${result.stdout ? `:\n${result.stdout.slice(-1000)}` : '.'}\nRestarting now so the new plugins load.`
    }, { quoted: message })
    scheduleExit()
  } catch (error) {
    const detail = String(error.stderr || error.message || 'unknown update error').trim().slice(-1200)
    await socket.sendMessage(jid, { text: `White MD update stopped safely:\n${detail}` }, { quoted: message })
  }
}

module.exports = {
  command: ['update', 'restart'],
  description: 'owner-only Git update and supervised restart',

  async execute(context) {
    const { socket, jid, message, command, config } = context
    if (!ownerAllowed(message, jid, config?.ownerNumber)) {
      await socket.sendMessage(jid, { text: 'Only the White MD owner can update or restart the bot.' }, { quoted: message })
      return
    }
    if (command === 'restart') {
      await socket.sendMessage(jid, {
        text: 'White MD is restarting. This requires Pterodactyl, PM2, Render, Heroku, Docker, or another supervisor configured to restart the process.'
      }, { quoted: message })
      scheduleExit()
      return
    }
    await update(context)
  }
}
