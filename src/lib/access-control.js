'use strict'

const { dataPath, readJsonSafe, writeJsonAtomic, scheduleRemoteBackup } = require('./storage')

const ACCESS_FILE = dataPath('access_control.json')

const DEFAULT_STATE = {
  bannedUsers: {},
  bannedGroups: {},
  sudoUsers: [],
  antiDm: false,
  antiCall: false,
  cooldownSeconds: 0,
  maintenance: { enabled: false, reason: '' },
  knownContacts: []
}

function normalizeNumber(input = '') {
  return String(input || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
}

function loadAccessState() {
  const raw = readJsonSafe(ACCESS_FILE, {})
  return {
    bannedUsers: raw && typeof raw.bannedUsers === 'object' && !Array.isArray(raw.bannedUsers) ? raw.bannedUsers : {},
    bannedGroups: raw && typeof raw.bannedGroups === 'object' && !Array.isArray(raw.bannedGroups) ? raw.bannedGroups : {},
    sudoUsers: Array.isArray(raw?.sudoUsers) ? raw.sudoUsers.map(normalizeNumber).filter(Boolean) : [],
    antiDm: Boolean(raw?.antiDm),
    antiCall: Boolean(raw?.antiCall),
    cooldownSeconds: Number.isFinite(Number(raw?.cooldownSeconds)) ? Math.max(0, Math.min(300, Number(raw.cooldownSeconds))) : 0,
    maintenance: {
      enabled: Boolean(raw?.maintenance?.enabled),
      reason: String(raw?.maintenance?.reason || '').trim()
    },
    knownContacts: Array.isArray(raw?.knownContacts) ? raw.knownContacts.filter((x) => typeof x === 'string') : []
  }
}

function saveAccessState(state) {
  writeJsonAtomic(ACCESS_FILE, state)
  scheduleRemoteBackup()
  return state
}

function banUser(target, { reason = '', by = 'owner' } = {}) {
  const num = normalizeNumber(target)
  if (!num || num.length < 5) return { ok: false, error: 'Invalid phone number or user.' }
  const state = loadAccessState()
  state.bannedUsers[num] = {
    reason: String(reason || 'Banned by owner').trim().slice(0, 200),
    by: normalizeNumber(by) || String(by || 'owner'),
    at: new Date().toISOString()
  }
  // If banned user was sudo, revoke sudo too
  state.sudoUsers = state.sudoUsers.filter((n) => n !== num)
  saveAccessState(state)
  return { ok: true, number: num, entry: state.bannedUsers[num] }
}

function unbanUser(target) {
  const num = normalizeNumber(target)
  if (!num) return { ok: false, error: 'Invalid phone number or user.' }
  const state = loadAccessState()
  if (!state.bannedUsers[num]) return { ok: false, error: 'User is not banned.' }
  delete state.bannedUsers[num]
  saveAccessState(state)
  return { ok: true, number: num }
}

function clearBans() {
  const state = loadAccessState()
  const count = Object.keys(state.bannedUsers).length
  state.bannedUsers = {}
  saveAccessState(state)
  return count
}

function getBanInfo(target) {
  const num = normalizeNumber(target)
  if (!num) return null
  return loadAccessState().bannedUsers[num] || null
}

function isUserBanned(target) {
  return Boolean(getBanInfo(target))
}

function listBannedUsers() {
  return loadAccessState().bannedUsers
}

function banGroup(groupJid, { reason = '', by = 'owner' } = {}) {
  const jid = String(groupJid || '').trim()
  if (!jid.endsWith('@g.us')) return { ok: false, error: 'Not a valid group JID.' }
  const state = loadAccessState()
  state.bannedGroups[jid] = {
    reason: String(reason || 'Muted by owner').trim().slice(0, 200),
    by: normalizeNumber(by) || String(by || 'owner'),
    at: new Date().toISOString()
  }
  saveAccessState(state)
  return { ok: true, jid }
}

function unbanGroup(groupJid) {
  const jid = String(groupJid || '').trim()
  const state = loadAccessState()
  if (!state.bannedGroups[jid]) return { ok: false, error: 'Group is not muted/banned.' }
  delete state.bannedGroups[jid]
  saveAccessState(state)
  return { ok: true, jid }
}

function isGroupBanned(groupJid) {
  if (!groupJid) return false
  return Boolean(loadAccessState().bannedGroups[String(groupJid).trim()])
}

function listBannedGroups() {
  return loadAccessState().bannedGroups
}

function addSudo(target) {
  const num = normalizeNumber(target)
  if (!num || num.length < 5) return { ok: false, error: 'Invalid phone number or user.' }
  const state = loadAccessState()
  if (!state.sudoUsers.includes(num)) state.sudoUsers.push(num)
  delete state.bannedUsers[num]
  saveAccessState(state)
  return { ok: true, number: num }
}

function removeSudo(target) {
  const num = normalizeNumber(target)
  const state = loadAccessState()
  const before = state.sudoUsers.length
  state.sudoUsers = state.sudoUsers.filter((n) => n !== num)
  if (state.sudoUsers.length === before) return { ok: false, error: 'User is not in sudo list.' }
  saveAccessState(state)
  return { ok: true, number: num }
}

function isSudoUser(target) {
  const num = normalizeNumber(target)
  if (!num) return false
  return loadAccessState().sudoUsers.includes(num)
}

function listSudoUsers() {
  return loadAccessState().sudoUsers
}

function setAntiDm(enabled) {
  const state = loadAccessState()
  state.antiDm = Boolean(enabled)
  saveAccessState(state)
  return state.antiDm
}

function isAntiDmEnabled() {
  return loadAccessState().antiDm
}

function setAntiCall(enabled) {
  const state = loadAccessState()
  state.antiCall = Boolean(enabled)
  saveAccessState(state)
  return state.antiCall
}

function isAntiCallEnabled() {
  return loadAccessState().antiCall
}

function setCooldownSeconds(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0 || value > 300) {
    return { ok: false, error: 'Cooldown must be between 0 and 300 seconds.' }
  }
  const state = loadAccessState()
  state.cooldownSeconds = Math.floor(value)
  saveAccessState(state)
  return { ok: true, seconds: state.cooldownSeconds }
}

function getCooldownSeconds() {
  return loadAccessState().cooldownSeconds
}

const lastCommandAt = new Map()

function checkCooldown(target) {
  const seconds = getCooldownSeconds()
  if (seconds <= 0) return { allowed: true, remaining: 0 }
  const num = normalizeNumber(target)
  if (!num) return { allowed: true, remaining: 0 }
  const now = Date.now()
  const prev = lastCommandAt.get(num) || 0
  const elapsed = (now - prev) / 1000
  if (elapsed < seconds) {
    return { allowed: false, remaining: Math.ceil(seconds - elapsed) }
  }
  lastCommandAt.set(num, now)
  if (lastCommandAt.size > 2000) {
    const oldest = lastCommandAt.keys().next().value
    lastCommandAt.delete(oldest)
  }
  return { allowed: true, remaining: 0 }
}

function setMaintenance(enabled, reason = '') {
  const state = loadAccessState()
  state.maintenance = {
    enabled: Boolean(enabled),
    reason: String(reason || '').trim().slice(0, 200)
  }
  saveAccessState(state)
  return state.maintenance
}

function getMaintenance() {
  return loadAccessState().maintenance
}

function rememberDmContact(jid) {
  if (!jid || typeof jid !== 'string' || jid.endsWith('@g.us') || jid === 'status@broadcast') return
  if (!/@(?:s\.whatsapp\.net|lid)$/.test(jid)) return
  const state = loadAccessState()
  if (state.knownContacts.includes(jid)) return
  state.knownContacts.push(jid)
  if (state.knownContacts.length > 500) {
    state.knownContacts = state.knownContacts.slice(-500)
  }
  writeJsonAtomic(ACCESS_FILE, state)
}

function listDmContacts() {
  return loadAccessState().knownContacts
}

module.exports = {
  ACCESS_FILE,
  DEFAULT_STATE,
  normalizeNumber,
  loadAccessState,
  banUser,
  unbanUser,
  clearBans,
  getBanInfo,
  isUserBanned,
  listBannedUsers,
  banGroup,
  unbanGroup,
  isGroupBanned,
  listBannedGroups,
  addSudo,
  removeSudo,
  isSudoUser,
  listSudoUsers,
  setAntiDm,
  isAntiDmEnabled,
  setAntiCall,
  isAntiCallEnabled,
  setCooldownSeconds,
  getCooldownSeconds,
  checkCooldown,
  setMaintenance,
  getMaintenance,
  rememberDmContact,
  listDmContacts
}
