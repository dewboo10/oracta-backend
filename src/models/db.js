/**
 * ORACTA In-Memory Database
 * Stores all state in Maps. Persists to /data/*.json on disk.
 * Replace with PostgreSQL/MongoDB in production.
 */

const fs   = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const config = require('../config')

const DATA_DIR = path.join(process.cwd(), 'data')

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

/* ── Stores ── */
const users     = new Map()  // userId -> UserRecord
const sessions  = new Map()  // sessionId -> SessionRecord
const purchases = new Map()  // purchaseId -> PurchaseRecord

/* ── User schema ── */
function createUser(telegramId, telegramData = {}) {
  return {
    id:            String(telegramId),
    telegramId:    String(telegramId),
    username:      telegramData.username    || null,
    firstName:     telegramData.first_name  || 'Miner',
    lastName:      telegramData.last_name   || null,
    photoUrl:      telegramData.photo_url   || null,
    languageCode:  telegramData.language_code || 'en',

    // Game state
    balance:       0,
    totalMined:    0,
    blocks:        0,
    upgrades:      {},       // { upgradeId: level }
    purchased:     [],       // array of item ids
    autoMineUntil: null,     // timestamp ms | Infinity | null
    refs:          0,
    referredBy:    null,
    referralCode:  generateReferralCode(telegramId),
    mPoints:       0,        // mission points
    claimed:       {},       // { missionId: [cpIndex, ...] }
    streak:        0,
    lastStreakDate: null,
    achievements:  [],

    // Meta
    createdAt:     Date.now(),
    lastSeen:      Date.now(),
    totalSessions: 0,
    totalPlaytime: 0,        // seconds
  }
}

function generateReferralCode(seed) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'OCT-'
  const s = String(seed)
  for (let i = 0; i < 6; i++) {
    const idx = (parseInt(s[i % s.length] || '0') + i * 7) % chars.length
    code += chars[idx]
  }
  return code
}

/* ── CRUD ── */
function getUser(userId) {
  return users.get(String(userId)) || null
}

function getOrCreateUser(telegramId, telegramData = {}) {
  const id = String(telegramId)
  if (!users.has(id)) {
    users.set(id, createUser(id, telegramData))
  }
  const user = users.get(id)
  user.lastSeen = Date.now()
  return user
}

function updateUser(userId, updates) {
  const user = users.get(String(userId))
  if (!user) return null
  Object.assign(user, updates)
  return user
}

function getAllUsers() {
  return [...users.values()]
}

/* ── Session ── */
function createSession(userId) {
  const id = uuidv4()
  sessions.set(id, {
    id,
    userId:    String(userId),
    startedAt: Date.now(),
    endedAt:   null,
    earned:    0,
    blocks:    0,
  })
  return sessions.get(id)
}

function endSession(sessionId, earned, blocks) {
  const s = sessions.get(sessionId)
  if (!s) return null
  s.endedAt = Date.now()
  s.earned  = earned
  s.blocks  = blocks
  const durationSec = Math.floor((s.endedAt - s.startedAt) / 1000)

  const user = users.get(s.userId)
  if (user) {
    user.totalSessions++
    user.totalPlaytime += durationSec
  }
  return s
}

/* ── Purchases ── */
function recordPurchase(userId, itemId, stars, telegramPaymentChargeId = null) {
  const id = uuidv4()
  purchases.set(id, {
    id,
    userId:                  String(userId),
    itemId,
    stars,
    telegramPaymentChargeId,
    createdAt:               Date.now(),
  })
  return purchases.get(id)
}

function getUserPurchases(userId) {
  return [...purchases.values()].filter(p => p.userId === String(userId))
}

/* ── Leaderboard ── */
function getLeaderboard(limit = 100) {
  return getAllUsers()
    .sort((a, b) => b.totalMined - a.totalMined)
    .slice(0, limit)
    .map((u, i) => ({
      rank:        i + 1,
      id:          u.id,
      username:    u.username || u.firstName,
      totalMined:  u.totalMined,
      blocks:      u.blocks,
      autoMining:  u.autoMineUntil
        ? (u.autoMineUntil === Infinity || u.autoMineUntil > Date.now())
        : false,
    }))
}

/* ── Persistence ── */
function save() {
  try {
    fs.writeFileSync(
      path.join(DATA_DIR, 'users.json'),
      JSON.stringify([...users.entries()], null, 2)
    )
    fs.writeFileSync(
      path.join(DATA_DIR, 'purchases.json'),
      JSON.stringify([...purchases.entries()], null, 2)
    )
  } catch (e) {
    console.error('[DB] Save error:', e.message)
  }
}

function load() {
  try {
    const usersFile = path.join(DATA_DIR, 'users.json')
    if (fs.existsSync(usersFile)) {
      const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'))
      data.forEach(([k, v]) => users.set(k, v))
      console.log(`[DB] Loaded ${users.size} users`)
    }
    const purchasesFile = path.join(DATA_DIR, 'purchases.json')
    if (fs.existsSync(purchasesFile)) {
      const data = JSON.parse(fs.readFileSync(purchasesFile, 'utf8'))
      data.forEach(([k, v]) => purchases.set(k, v))
      console.log(`[DB] Loaded ${purchases.size} purchases`)
    }
  } catch (e) {
    console.error('[DB] Load error:', e.message)
  }
}

// Auto-persist
setInterval(save, config.PERSIST_INTERVAL_MS)
process.on('SIGINT',  () => { save(); process.exit(0) })
process.on('SIGTERM', () => { save(); process.exit(0) })

// Load on boot
load()

module.exports = {
  getUser,
  getOrCreateUser,
  updateUser,
  getAllUsers,
  createSession,
  endSession,
  recordPurchase,
  getUserPurchases,
  getLeaderboard,
  save,
}
