/**
 * ORACTA Game Logic Service
 * All game calculations live here — mirrors frontend logic server-side.
 */

const config = require('../config')
const db     = require('../models/db')

/* ── Rate calculation ── */
function calcRate(upgrades = {}) {
  const baseRate = 0.1
  const upgradeRate = config.UPGRADES.reduce((acc, u) => {
    const lv = upgrades[u.id] || 0
    return acc + u.rateBonus * lv
  }, 0)
  return baseRate + upgradeRate
}

/* ── Upgrade cost ── */
function upgradeCost(upgradeId, currentLevel) {
  const u = config.UPGRADES.find(x => x.id === upgradeId)
  if (!u) return null
  return u.baseCost * Math.pow(2.2, currentLevel)
}

/* ── Apply upgrade ── */
function applyUpgrade(user, upgradeId) {
  const u   = config.UPGRADES.find(x => x.id === upgradeId)
  if (!u)   return { ok: false, error: 'Unknown upgrade' }

  const lv  = user.upgrades[upgradeId] || 0
  if (lv >= u.maxLevel) return { ok: false, error: 'Already maxed' }

  const cost = upgradeCost(upgradeId, lv)
  if (user.balance < cost) return { ok: false, error: 'Insufficient balance' }

  user.balance -= cost
  user.upgrades = { ...user.upgrades, [upgradeId]: lv + 1 }

  return { ok: true, cost, newLevel: lv + 1, newBalance: user.balance }
}

/* ── Apply purchase ── */
function applyPurchase(user, itemId) {
  const item = config.STORE_ITEMS.find(x => x.id === itemId)
  if (!item) return { ok: false, error: 'Unknown item' }

  if (!user.purchased.includes(itemId)) {
    user.purchased.push(itemId)
  }

  // OCT chest
  if (item.octReward) {
    user.balance    += item.octReward
    user.totalMined += item.octReward
  }

  // Auto-mine
  if (item.autoMineHours) {
    if (item.autoMineHours === Infinity) {
      user.autoMineUntil = Infinity
    } else {
      const untilMs = Date.now() + item.autoMineHours * 3600 * 1000
      // Extend if already active
      if (user.autoMineUntil && user.autoMineUntil !== Infinity && user.autoMineUntil > Date.now()) {
        user.autoMineUntil = user.autoMineUntil + item.autoMineHours * 3600 * 1000
      } else {
        user.autoMineUntil = untilMs
      }
    }
  }

  return { ok: true, item, user }
}

/* ── Sync session ── */
function syncSession(user, { balance, totalMined, blocks, upgrades, sessE, sessT }) {
  // Accept higher values (client is authoritative in this version)
  // In production: validate against server-calculated max
  const rate      = calcRate(upgrades || user.upgrades)
  const maxEarned = rate * (sessT || 0) * 1.15  // 15% tolerance for blocks

  // Sanity: sessE should not exceed theoretical max
  const clampedSessE = Math.min(sessE || 0, maxEarned + 50000)
  
 if (typeof balance    === 'number') user.balance     = Math.max(user.balance || 0, balance)
if (typeof totalMined === 'number') user.total_mined = Math.max(user.total_mined || 0, totalMined)
if (typeof blocks     === 'number') user.blocks      = Math.max(user.blocks || 0, blocks)
if (upgrades)                       user.upgrades    = upgrades

  return { ok: true, user, clampedSessE }
}

/* ── Claim mission checkpoint ── */
function claimCheckpoint(user, missionId, cpIndex) {
  const MISSIONS = [
    { id:'m_miner', checkpoints:[{at:1000,reward:500},{at:5000,reward:1500},{at:20000,reward:5000},{at:100000,reward:20000},{at:500000,reward:80000},{at:2000000,reward:250000}] },
    { id:'m_block', checkpoints:[{at:1,reward:500},{at:5,reward:2500},{at:20,reward:8000},{at:50,reward:20000},{at:100,reward:50000},{at:500,reward:200000}] },
    { id:'m_time',  checkpoints:[{at:10,reward:1000},{at:60,reward:5000},{at:300,reward:20000},{at:1440,reward:80000},{at:7200,reward:300000}] },
    { id:'m_speed', checkpoints:[{at:1,reward:500},{at:5,reward:3000},{at:20,reward:12000},{at:50,reward:30000},{at:100,reward:80000}] },
    { id:'m_refer', checkpoints:[{at:1,reward:5000},{at:5,reward:30000},{at:10,reward:100000},{at:25,reward:500000},{at:50,reward:1000000}] },
  ]

  const mission = MISSIONS.find(m => m.id === missionId)
  if (!mission) return { ok: false, error: 'Unknown mission' }

  const cp = mission.checkpoints[cpIndex]
  if (!cp)  return { ok: false, error: 'Unknown checkpoint' }

  const claimedSet = user.claimed[missionId] || []
  if (claimedSet.includes(cpIndex)) return { ok: false, error: 'Already claimed' }

  user.claimed[missionId] = [...claimedSet, cpIndex]
  user.balance += cp.reward
  user.mPoints  = (user.mPoints || 0) + cp.reward

  return { ok: true, reward: cp.reward, newBalance: user.balance }
}

/* ── Daily streak ── */
function updateStreak(user) {
  const now      = new Date()
  const today    = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  const lastDate = user.lastStreakDate

  if (lastDate === today) {
    return { streakUpdated: false, streak: user.streak }
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yday = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`

  if (lastDate === yday) {
    user.streak++
  } else {
    user.streak = 1
  }

  user.lastStreakDate = today
  return { streakUpdated: true, streak: user.streak }
}

/* ── Referral ── */
 async function applyReferral(newUser, referralCode) {
    const allUsers = await db.getAllUsers()  // ← added await
  const referrer = db.getAllUsers().find(u => u.referralCode === referralCode)
  if (!referrer)               return { ok: false, error: 'Invalid code' }
  if (referrer.id === newUser.id) return { ok: false, error: 'Self-referral' }
  if (newUser.referredBy)      return { ok: false, error: 'Already referred' }

  newUser.referredBy = referrer.id
  referrer.refs      = (referrer.refs || 0) + 1

  // Bonus for both
  const newUserBonus  = 5000
  const referrerBonus = 5000
  newUser.balance    += newUserBonus
  newUser.totalMined += newUserBonus
  referrer.balance   += referrerBonus
  referrer.totalMined+= referrerBonus

  return {
    ok:           true,
    newUserBonus,
    referrerBonus,
    referrerId:   referrer.id,
  }
}

/* ── Auto-mine server-side tick ── */
async function processAutoMine() {
  // Called periodically to credit OCT to users with active auto-mine
  // In production this would run every minute via a cron job
  const now = Date.now()
  let processed = 0

   const allUsers = await db.getAllUsers()  // ← added await
  allUsers.forEach(user => {              // ← now forEach works
    if (!user.autoMineUntil) return
    if (user.autoMineUntil !== Infinity && user.autoMineUntil <= now) return

    const rate = calcRate(user.upgrades) * 2
    const earned = rate * 60
    user.balance += earned
    user.totalMined += earned
    processed++
  })

  return { processed }
}

module.exports = {
  calcRate,
  upgradeCost,
  applyUpgrade,
  applyPurchase,
  syncSession,
  claimCheckpoint,
  updateStreak,
  applyReferral,
  processAutoMine,
}
