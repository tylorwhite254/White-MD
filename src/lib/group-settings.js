'use strict'

const path = require('node:path')
const { dataPath, readJsonSafe, writeJsonAtomic, scheduleRemoteBackup } = require('./storage')

const SETTINGS_FILE = process.env.GROUP_SETTINGS_FILE
  ? path.resolve(process.env.GROUP_SETTINGS_FILE)
  : dataPath('group_settings.json')

function readAll() {
  return readJsonSafe(SETTINGS_FILE, {})
}

function writeAll(settings) {
  writeJsonAtomic(SETTINGS_FILE, settings)
  scheduleRemoteBackup()
}

function getGroupSettings(jid) {
  const all = readAll()
  return all[jid] || {}
}

function updateGroupSettings(jid, patch) {
  const all = readAll()
  all[jid] = { ...(all[jid] || {}), ...patch }
  writeAll(all)
  return all[jid]
}

function getWarnings(jid) {
  return getGroupSettings(jid).warnings || {}
}

function addWarning(jid, userJid) {
  const warnings = getWarnings(jid)
  warnings[userJid] = Number(warnings[userJid] || 0) + 1
  updateGroupSettings(jid, { warnings })
  return warnings[userJid]
}

function clearWarnings(jid, userJid) {
  const warnings = getWarnings(jid)
  delete warnings[userJid]
  updateGroupSettings(jid, { warnings })
}

module.exports = {
  SETTINGS_FILE,
  addWarning,
  clearWarnings,
  getGroupSettings,
  getWarnings,
  updateGroupSettings
}
