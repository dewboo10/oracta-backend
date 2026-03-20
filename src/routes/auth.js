const router   = require('express').Router()
const db       = require('../models/db')
const telegram = require('../services/telegram')
const game     = require('../services/game')
const config   = require('../config')
const { authLimiter } = require('../middleware/rateLimiter')

router.post('/telegram', authLimiter, async (req, res) => {
  const { initData, referralCode } = req.body

  let result

  if (config.IS_DEV) {
    // Dev mode — skip validation, use fake user
    result = {
      valid:  true,
      userId: '12345',
      data:   { id: 12345, first_name: 'DevUser', username: 'devuser', language_code: 'en' }
    }
  } else {
    result = telegram.validateInitData(initData)
    if (!result.valid) {
      return res.status(401).json({ ok: false, error: result.error })
    }
  }

  const existingUser = await db.getUser(result.userId)
  const isNew = !existingUser
  const user  = await db.getOrCreateUser(result.userId, result.data)

  if (isNew && referralCode && referralCode !== user.referral_code) {
    const refResult = await game.applyReferral(user, referralCode)
    if (refResult.ok) {
      console.log(`[Referral] ${result.userId} referred by code ${referralCode}`)
    }
  }

  game.updateStreak(user)

  res.json({
    ok:     true,
    userId: result.userId,
    isNew,
    user:   sanitizeUser(user),
  })
})

router.get('/me', (req, res) => {
  const { requireAuth } = require('../middleware/auth')
  requireAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Not authenticated' })
    res.json({ ok: true, user: sanitizeUser(req.user) })
  })
})

function sanitizeUser(user) {
  return {
    id:            user.id,
    username:      user.username,
    firstName:     user.first_name,        // ← snake_case
    balance:       user.balance,
    totalMined:    user.total_mined,       // ← snake_case
    blocks:        user.blocks,
    upgrades:      user.upgrades,
    purchased:     user.purchased  || [],
    autoMineUntil: user.auto_mine_until,   // ← snake_case
    refs:          user.refs,
    referralCode:  user.referral_code,     // ← snake_case
    mPoints:       user.m_points,          // ← snake_case
    claimed:       user.claimed    || {},
    streak:        user.streak,
    achievements:  user.achievements || [],
    createdAt:     user.created_at,        // ← snake_case
    lastSeen:      user.last_seen,         // ← snake_case
    totalSessions: user.total_sessions,    // ← snake_case
    totalPlaytime: user.total_playtime,    // ← snake_case
  }
}

module.exports = router
module.exports.sanitizeUser = sanitizeUser